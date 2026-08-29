/**
 * Local provider for the execution-worlds service: local workspace places
 * resolve to one local world whose filesystem and shell backends are
 * `dsh-fs-local` and `dsh-bash-local` instances composed on a private child
 * context. A non-local place rejects loudly — routing a remote place through
 * this provider would silently run remote paths against the host filesystem.
 * @module @deepseek-ai/dsh-worlds-local
 */

import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Config as FsLocalConfig } from '@deepseek-ai/dsh-fs-local'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import type { Config as BashLocalConfig } from '@deepseek-ai/dsh-bash-local'
import type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'
import { World, WorldId, Worlds } from '@deepseek-ai/dsh-worlds'
import type { FileSystem, ShellExecutor } from '@deepseek-ai/dsh-worlds'
import type { WorldsResolveRequest } from '@deepseek-ai/dsh-worlds'

export type { WorkspacePlace, WorldId } from '@deepseek-ai/dsh-worlds'
export type { FileSystem, ShellExecutor } from '@deepseek-ai/dsh-worlds'

/** Plugin config: backend settings for the local world (all optional — the providers supply their defaults). */
export interface Config {
  /** Filesystem backend settings (see `dsh-fs-local`). */
  fs?: FsLocalConfig
  /** Shell backend settings (see `dsh-bash-local`). */
  shell?: BashLocalConfig
}

/** Default overwrite-diff byte cap, matching `dsh-fs-local`'s own default. */
const DEFAULT_DIFF_BASIS_MAX_BYTES = 10 * 1024 * 1024

/** Defaults matching `dsh-bash-local`'s schemastery defaults (its constructor validates, it does not default). */
const DEFAULT_SHELL_CONFIG: Required<BashLocalConfig> = {
  cwd: process.cwd(),
  timeoutMs: 120_000,
  maxTimeoutMs: 600_000,
  maxOutputBytes: 64_000,
  maxSpillBytes: 64 * 1024 * 1024,
  graceMs: 3_000,
}

/** Fill every constructor-validated shell field with the provider's defaults. */
function resolvedShellConfig(config: BashLocalConfig | undefined): BashLocalConfig {
  return {
    ...DEFAULT_SHELL_CONFIG,
    ...config,
  }
}

/**
 * The local execution world: the host filesystem and host process namespace,
 * composed once over a scoped child context so the backend service
 * registrations cannot collide with a router mounted on the parent.
 */
class LocalWorld extends World {
  private readonly child: Context
  private fsBackend: FileSystem | null = null
  private shellBackend: ShellExecutor | null = null
  private closed = false

  constructor(
    readonly id: WorldId,
    readonly place: WorkspacePlace,
    private readonly config: Config,
    parent: Context,
  ) {
    super()
    // An isolated child inherits the parent's services (e.g. `subprocess` for
    // the local shell backend) while giving the world's own fs/shell
    // registrations fresh isolate labels, so they cannot collide with a router
    // mounted on the parent scope.
    this.child = parent.isolate('fs').isolate('shell')
  }

  readonly kind = 'local' as const

  status(): 'ready' | 'closed' {
    return this.closed ? 'closed' : 'ready'
  }

  fs(): FileSystem {
    if (this.closed) throw new Error('local world is closed')
    this.fsBackend ??= new LocalFileSystem(this.child, {
      // The constructor validates these fields and has no defaults of its own.
      cwd: this.config.fs?.cwd ?? process.cwd(),
      diffBasisMaxBytes: this.config.fs?.diffBasisMaxBytes ?? DEFAULT_DIFF_BASIS_MAX_BYTES,
    })
    return this.fsBackend
  }

  shell(): ShellExecutor {
    if (this.closed) throw new Error('local world is closed')
    this.shellBackend ??= new LocalBashExecutor(this.child, resolvedShellConfig(this.config.shell))
    return this.shellBackend
  }

  dispose(): Promise<void> {
    if (this.closed) return Promise.resolve()
    this.closed = true
    // The backend registrations are effects on the parent fiber (an isolate
    // child shares it), so they unload with the parent; dispose only severs
    // the world's own references and refuses further composition.
    this.fsBackend = null
    this.shellBackend = null
    return Promise.resolve()
  }
}

/**
 * Local worlds provider. Load as a plugin; it registers `ctx.worlds` (one
 * implementation per context). Resolves any local place to the single local
 * world; a remote place rejects with a descriptive error, since this provider
 * owns no transport.
 */
export class LocalWorlds extends Worlds {
  static inject = []

  private world: LocalWorld | null = null

  constructor(ctx: Context, private readonly config: Config = {}) {
    super(ctx)
    ctx.effect(() => () => {
      const world = this.world
      this.world = null
      if (world !== null) void world.dispose()
    })
  }

  resolve(request?: WorldsResolveRequest): Promise<World> {
    const place = request?.place
      ?? { kind: 'local' as const }
    if (place.kind !== 'local') {
      return Promise.reject(new Error(
        `worlds-local cannot resolve a ${place.kind} place; a transport-aware worlds provider is required`,
      ))
    }
    this.world ??= new LocalWorld(WorldId(randomUUID()), place, this.config, this.ctx)
    return Promise.resolve(this.world)
  }

  worlds(): readonly World[] {
    return this.world === null ? [] : [this.world]
  }

  get(worldId: WorldId): World | undefined {
    return this.world !== null && this.world.id === worldId ? this.world : undefined
  }

  async disconnect(worldId: WorldId): Promise<void> {
    if (this.world === null || this.world.id !== worldId) return
    const world = this.world
    this.world = null
    await world.dispose()
  }
}

export default LocalWorlds
