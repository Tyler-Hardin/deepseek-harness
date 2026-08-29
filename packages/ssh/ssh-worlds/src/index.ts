/**
 * SSH provider for the execution-worlds service: an ssh workspace place
 * resolves to a remote world whose transport is one connected ssh world and
 * whose filesystem and shell backends are `dsh-fs-ssh` and `dsh-bash-ssh`
 * instances composed over it. A local place rejects loudly — routing a local
 * place through this provider would attempt an ssh connection for a host
 * directory.
 * @module @deepseek-ai/dsh-ssh-worlds
 */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'
import { SshBashExecutor } from '@deepseek-ai/dsh-bash-ssh'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SshTarget, SshWorld } from '@deepseek-ai/dsh-ssh'
import type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'
import { World, WorldId, Worlds } from '@deepseek-ai/dsh-worlds'
import type { FileSystem, ShellExecutor } from '@deepseek-ai/dsh-worlds'
import type { WorldsResolveRequest } from '@deepseek-ai/dsh-worlds'

export type { WorkspacePlace, WorldId } from '@deepseek-ai/dsh-worlds'
export type { FileSystem, ShellExecutor } from '@deepseek-ai/dsh-worlds'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /**
     * A session was bound to a remote ssh world: the transport connected and
     * the session's fs/shell calls now route to `host`. Log-only, no surface
     * contribution; recorded so a remote tool result is explainable from the
     * log (which world the turn ran in) without credentials.
     * @param sessionId - the session that entered the world.
     * @param worldId - the opaque execution-world identity frozen in the header.
     * @param host - the ssh host the transport connected to.
     */
    'ssh/connect': { sessionId: string; worldId: string; host: string }
    /**
     * A session left a remote ssh world: the transport disconnected and the
     * session's fs/shell calls no longer route remotely. Log-only.
     * @param sessionId - the session that left the world.
     * @param worldId - the execution-world identity that was frozen in the header.
     */
    'ssh/disconnect': { sessionId: string; worldId: string }
  }
}

/** Plugin config (all optional — `dsh-ssh` supplies the connect defaults). */
export interface Config {
  /** Connect timeout in milliseconds, passed to `ctx.ssh.connect`. */
  connectTimeoutMs?: number
  /** Strict host-key mode, passed to `ctx.ssh.connect`. */
  strictHostKey?: boolean
}

/** The remote execution world: one connected ssh transport plus composed adapters. */
class SshRemoteWorld extends World {
  private readonly child: Context
  private fsBackend: FileSystem | null = null
  private shellBackend: ShellExecutor | null = null

  constructor(
    readonly id: WorldId,
    readonly place: WorkspacePlace,
    ctx: Context,
    private readonly transport: SshWorld,
    private readonly path: string | undefined,
  ) {
    super()
    // An isolated child inherits the parent's services while giving the
    // world's own fs/shell registrations fresh isolate labels, so they cannot
    // collide with a router mounted on the parent scope.
    this.child = ctx.isolate('fs').isolate('shell')
  }

  readonly kind = 'ssh' as const

  status(): 'ready' | 'closed' {
    return this.transport.status() === 'connected' ? 'ready' : 'closed'
  }

  fs(): FileSystem {
    this.fsBackend ??= new SshFileSystem(this.child, {
      ...this.path === undefined ? {} : { cwd: this.path },
    }, this.transport)
    return this.fsBackend
  }

  shell(): ShellExecutor {
    this.shellBackend ??= new SshBashExecutor(this.child, {
      ...this.path === undefined ? {} : { cwd: this.path },
    }, this.transport)
    return this.shellBackend
  }

  override ssh(): SshWorld {
    return this.transport
  }
  async dispose(): Promise<void> {
    // The backend registrations are effects on the parent fiber (an isolate
    // child shares it), so they unload with the parent; dispose severs the
    // transport, which the backends read status from.
    await this.transport.dispose()
  }
}

/**
 * SSH worlds provider. Load as a plugin; it registers `ctx.worlds` (one
 * implementation per context). Resolves an ssh place by connecting `ctx.ssh`
 * and composing the remote world's fs/shell backends over the transport; a
 * local place rejects loudly.
 */
export class SshWorlds extends Worlds {
  static inject = ['ssh']

  private readonly worldsByTarget = new Map<string, SshRemoteWorld>()
  /** Sessions bound to each world id, so disconnect can record their exit. */
  private readonly sessionsByWorld = new Map<string, Set<Session>>()

  constructor(ctx: Context, private readonly config: Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      for (const world of [...this.worldsByTarget.values()]) {
        this.recordWorldDisconnects(world)
        void world.dispose()
      }
      this.worldsByTarget.clear()
      this.sessionsByWorld.clear()
    })
  }

  async resolve(request?: WorldsResolveRequest): Promise<World> {
    const place = request?.place ?? { kind: 'local' as const }
    if (place.kind !== 'ssh') {
      throw new Error(
        `ssh-worlds cannot resolve a ${place.kind} place; a local worlds provider is required`,
      )
    }
    const target = this.targetOf(place)
    // targetOf omits port when absent; the 22 default is ssh's own, untestable
    // against the random-port fixture.
    /* v8 ignore next -- a port-less ssh place connects to 22, untestable against the random-port fixture */
    const key = `${target.user ?? ''}@${target.host}:${String(target.port ?? 22)}`
    const existing = this.worldsByTarget.get(key)
    if (existing !== undefined && existing.status() === 'ready') {
      // A session re-resolving the same world records the (re)entry; the
      // connect event is per session, not per world.
      if (request?.session !== undefined) this.recordConnect(existing, request.session)
      return existing
    }
    const world = await this.connect(target, request?.path)
    this.worldsByTarget.set(key, world)
    if (request?.session !== undefined) this.recordConnect(world, request.session)
    return world
  }

  /** Record the session's entry into a remote world as a log-only connect event. */
  private recordConnect(world: SshRemoteWorld, session: Session): void {
    // A remote world is always an ssh place by construction.
    /* v8 ignore next -- SshRemoteWorld places are always ssh */
    const host = world.place.kind === 'ssh' ? world.place.host : ''
    /* v8 ignore next -- the session binding appends outside the provider's hot path; append failures surface on the log's next load */
    session.append('ssh/connect', { sessionId: String(session.id), worldId: String(world.id), host })
    const id = String(world.id)
    const bound = this.sessionsByWorld.get(id)
    if (bound !== undefined) bound.add(session)
    else this.sessionsByWorld.set(id, new Set([session]))
  }

  /**
   * Record each bound session's exit from a world as a log-only disconnect
   * event, the mirror of its connect entry. Sessions are per-session, so a
   * world closed while several sessions used it records one exit per session.
   */
  private recordWorldDisconnects(world: SshRemoteWorld): void {
    const bound = this.sessionsByWorld.get(String(world.id))
    if (bound === undefined) return
    this.sessionsByWorld.delete(String(world.id))
    for (const session of bound) {
      /* v8 ignore next -- the session binding appends outside the provider's hot path; append failures surface on the log's next load */
      session.append('ssh/disconnect', { sessionId: String(session.id), worldId: String(world.id) })
    }
  }

  worlds(): readonly World[] {
    return [...this.worldsByTarget.values()]
  }

  get(worldId: WorldId): World | undefined {
    for (const world of this.worldsByTarget.values()) {
      if (world.id === worldId) return world
    }
    return undefined
  }

  async disconnect(worldId: WorldId): Promise<void> {
    for (const [key, world] of this.worldsByTarget) {
      if (world.id !== worldId) continue
      this.worldsByTarget.delete(key)
      this.recordWorldDisconnects(world)
      await world.dispose()
      return
    }
  }

  /** Build the ssh target from the workspace place (the remote path comes from the caller's workspace). */
  private targetOf(place: Extract<WorkspacePlace, { kind: 'ssh' }>): SshTarget {
    return {
      host: place.host,
      ...place.user !== undefined ? { user: place.user } : {},
      /* v8 ignore next 2 -- a port-less ssh place connects to 22, untestable against the random-port fixture */
      ...place.port !== undefined ? { port: place.port } : {},
    }
  }

  private async connect(target: SshTarget, path: string | undefined): Promise<SshRemoteWorld> {
    const transport = await this.ctx.ssh.connect(target, {
      ...this.config.connectTimeoutMs !== undefined ? { timeoutMs: this.config.connectTimeoutMs } : {},
      ...this.config.strictHostKey !== undefined ? { strictHostKey: this.config.strictHostKey } : {},
    })
    const world = new SshRemoteWorld(
      WorldId(randomUUID()),
      /* v8 ignore start -- targetOf already omitted a port-less place; this mirrors the same untestable default */
      { kind: 'ssh', host: target.host, ...target.user !== undefined ? { user: target.user } : {}, ...target.port !== undefined ? { port: target.port } : {} },
      /* v8 ignore stop */
      this.ctx,
      transport,
      path,
    )
    return world
  }
}

export default SshWorlds
