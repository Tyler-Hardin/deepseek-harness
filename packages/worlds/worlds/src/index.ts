/**
 * Service Definition for the execution-worlds capability: one world is one
 * coherent execution environment — a local directory tree, or a remote host
 * reached through a transport — with per-world filesystem and shell backends
 * composed over it. The worlds service resolves the world for a session (or a
 * workspace place), owns world lifecycles, and lets consumers read the
 * per-world fs/shell backends. Router providers dispatch seam calls to those
 * backends; local-only deployments never mount a router, so this service is
 * optional infrastructure for mixed local/remote compositions.
 * @module @deepseek-ai/dsh-worlds
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { FileSystem } from '@deepseek-ai/dsh-fs'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'

export type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'
export type { FileSystem } from '@deepseek-ai/dsh-fs'
export type { ShellExecutor } from '@deepseek-ai/dsh-shell'

declare module '@deepseek-ai/cordis' {
  interface Context {
    worlds: Worlds
  }
}

/**
 * Opaque identity of one execution world. Never parse it: the owning service
 * maps ids to worlds, and a string that walks and talks like a `WorldId` from
 * another world must not be interchangeable with one.
 */
export type WorldId = Branded<'WorldId'>

/**
 * Brand a string as a {@link WorldId}.
 * @param id - the raw world id string.
 * @returns the same string, branded (a compile-time cast — no runtime cost).
 */
export function WorldId(id: string): WorldId {
  return id as WorldId
}

/** The kind of execution world a workspace place resolves to. */
export type WorldKind = 'local' | 'ssh'

/** Observability state of a world's underlying environment. */
export type WorldStatus = 'ready' | 'closed'

/**
 * The world kind a workspace place resolves to: local places are local
 * worlds, ssh places are remote worlds. Pure policy — providers and routers
 * use this instead of re-deriving the mapping.
 * @param place - the workspace place.
 * @returns the world kind serving that place.
 */
export function worldKindOf(place: WorkspacePlace): WorldKind {
  switch (place.kind) {
    case 'local':
      return 'local'
    case 'ssh':
      return 'ssh'
    /* v8 ignore next 3 -- WorkspacePlace is a closed union; the default is the exhaustiveness guard */
    default: {
      const kind: never = (place as { kind: string }).kind as never
      throw new Error(`unreachable workspace place kind: ${String(kind)}`)
    }
  }
}

/** Inputs that select the world for one capability call. */
export interface WorldsResolveRequest {
  /** Calling session; its workspace place selects the world. */
  session?: Session
  /** Explicit workspace place, which outranks the session's own. */
  place?: WorkspacePlace
  /**
   * The workspace's working path, when known: the remote absolute path for an
   * ssh place, used as the world backends' default cwd. A session-less
   * resolve with only a place leaves it absent (the transport's default).
   */
  path?: string
}

/**
 * One execution world: the composition root for a coherent set of per-seam
 * backends. A world owns exactly one environment (a local directory tree or a
 * connected remote host) and lazily composes its filesystem and shell backends
 * over it. Consumers receive a world from {@link Worlds.resolve} and must call
 * {@link dispose} when done; the service refcounts worlds by id.
 */
export abstract class World {
  /** Opaque identity of this world. */
  abstract readonly id: WorldId
  /** The kind of environment this world executes in. */
  abstract readonly kind: WorldKind
  /** The workspace place this world was resolved from. */
  abstract readonly place: WorkspacePlace

  /**
   * The world's observable state.
   * @returns `ready` while the environment is usable, `closed` after dispose
   *   or an unrecoverable transport failure.
   */
  abstract status(): WorldStatus

  /**
   * The world's filesystem backend, composed on first use. The returned
   * backend serves exactly this world's path namespace; consumers never use it
   * across worlds. Composition is synchronous because a world's backends are
   * composed over an already-connected environment (a transport world connects
   * before it is published).
   * @returns the world's filesystem backend.
   */
  abstract fs(): FileSystem

  /**
   * The world's shell backend, composed on first use. The returned executor
   * serves exactly this world's process namespace.
   * @returns the world's shell backend.
   */
  abstract shell(): ShellExecutor

  /**
   * The world's ssh transport, present only when this world is an ssh-kind
   * world. Local worlds leave it absent, so providers that own no transport
   * never implement it. Consumers that need transport-specific verbs (exec,
   * sftp, pty) check {@link kind} first and then call this.
   * @returns the connected ssh transport, or undefined for non-ssh worlds.
   */
  ssh?(): SshWorld | undefined

  /**
   * Close the world and its backends. Idempotent; later calls report `closed`.
   */
  abstract dispose(): Promise<void>
}

/**
 * Abstract execution-worlds service. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.worlds` (one
 * implementation per context; loading a second throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link resolve} resolves the session's workspace place (or an explicit
 *   place) to a world: local places to the local world, remote places to a
 *   connected remote world. It connects a remote world on first resolve and
 *   refcounts worlds by id.
 * - {@link worlds} lists every live world; {@link disconnect} removes it.
 * - Disposal of the service disposes every live world.
 */
export abstract class Worlds extends Service {
  constructor(ctx: Context) {
    super(ctx, 'worlds')
  }

  /**
   * Resolve the world for a session's workspace (or an explicit place). Local
   * places resolve to the local world; remote places connect a remote world
   * on first resolve.
   * @param request - the calling session and/or an explicit place.
   * @returns the world serving the resolved place, refcounted by id.
   */
  abstract resolve(request?: WorldsResolveRequest): Promise<World>

  /**
   * List the live worlds.
   * @returns every connected, not-yet-disposed world.
   */
  abstract worlds(): readonly World[]

  /**
   * Look up a live world by id.
   * @param worldId - the world to find.
   * @returns the world, or `undefined` when no live world carries that id.
   */
  abstract get(worldId: WorldId): World | undefined

  /**
   * Disconnect a world.
   * @param worldId - the world to close; unknown ids resolve without error.
   */
  abstract disconnect(worldId: WorldId): Promise<void>
}

export default Worlds
