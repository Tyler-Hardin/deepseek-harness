/**
 * Shell router provider: implements the `ctx.shell` seam and dispatches each
 * call to the shell executor of the world the caller named. `resolve` is the
 * seam's synchronous defaulting step, so it performs the defaulting itself
 * (the same defaults the local executor applies) and stamps the caller's
 * opaque execution-world identity (`request.world`) into the spec; `run` and
 * `start` then resolve that world's executor through `ctx.worlds` and
 * delegate. A request without a world identity routes to the local world.
 *
 * Local-only deployments never mount this provider: the default composition
 * keeps the direct local executor. This router is opt-in infrastructure for
 * mixed local/remote compositions.
 * @module @deepseek-ai/dsh-shell-router
 */

import { Context } from '@deepseek-ai/cordis'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type { ShellExecRequest, ShellExecSpec, ShellProcess, ShellRunResult } from '@deepseek-ai/dsh-shell'
import { WorldId } from '@deepseek-ai/dsh-worlds'
import type { World } from '@deepseek-ai/dsh-worlds'

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_TIMEOUT_MS = 600_000
const DEFAULT_MAX_OUTPUT_BYTES = 64_000

/** Clamp a caller timeout hint into [default, max]. */
function clampTimeout(requested: number | undefined, def: number, max: number): number {
  if (requested !== undefined && (!Number.isFinite(requested) || requested <= 0)) {
    throw new Error('shell-router: request.timeoutMs must be a positive finite number')
  }
  return Math.min(requested ?? def, max)
}

/**
 * Shell router. Load as a plugin; it registers `ctx.shell` (one implementation
 * per context) and injects `ctx.worlds`. Mount only in compositions that serve
 * remote workspaces; local-only deployments keep the direct local executor.
 */
/* jscpd:ignore-start -- the router's world resolution, defaulting, and dispatch
   mirror the fs router and the local executor for the parallel seam; extract
   shared code when a third router appears. */
export class ShellRouter extends ShellExecutor {
  static inject = ['worlds']

  /** World id → world, populated by run/start so repeated calls are cheap. */
  private readonly worlds = new Map<string, World>()

  constructor(ctx: Context) {
    super(ctx)
    ctx.effect(() => () => {
      for (const world of this.worlds.values()) void world.dispose()
      this.worlds.clear()
    })
  }

  /**
   * Resolve a world by id (or the local world when absent), caching it for
   * later calls. An explicit id that names no live world refuses loudly.
   * @param worldId - the caller's opaque execution-world identity, or undefined for local.
   * @returns the world serving the call.
   */
  private async worldFor(worldId: string | undefined): Promise<World> {
    const service = this.ctx.worlds
    const world = worldId === undefined
      ? await service.resolve({ place: { kind: 'local' } })
      : service.get(WorldId(worldId))
    if (world === undefined) {
      throw new Error(`shell-router: world '${String(worldId)}' is not connected`)
    }
    this.worlds.set(String(world.id), world)
    return world
  }

  resolve(request: ShellExecRequest): ShellExecSpec {
    // The seam's defaulting, owned here because the router is the shell
    // implementation: the per-world executor's resolve is bypassed since the
    // router already produces a fully-specified spec.
    const timeoutMs = clampTimeout(request.timeoutMs, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_TIMEOUT_MS)
    const stdoutMaxBytes = request.stdoutMaxBytes ?? DEFAULT_MAX_OUTPUT_BYTES
    if (!Number.isFinite(stdoutMaxBytes) || stdoutMaxBytes <= 0) {
      throw new Error('shell-router: request.stdoutMaxBytes must be a positive finite number')
    }
    return {
      command: request.command,
      workdir: request.workdir ?? process.cwd(),
      timeoutMs,
      stdoutMaxBytes,
      ...request.world !== undefined ? { world: request.world } : {},
      ...request.signal ? { signal: request.signal } : {},
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    const world = spec.world === undefined ? await this.worldFor(undefined) : await this.worldFor(spec.world)
    const executor = world.shell()
    return await executor.run(spec)
  }

  start(spec: ShellExecSpec): ShellProcess {
    // start is synchronous; resolve must have run first to populate the cache,
    // otherwise fall back to the synchronous worlds registry (a world resolved
    // through ctx.worlds is already connected).
    const world = this.syncWorld(spec.world)
    return world.shell().start(spec)
  }

  /** Require the world for a spec, resolving from the cache or the synchronous worlds registry. */
  private syncWorld(worldId: string | undefined): World {
    const key = worldId ?? ''
    const cached = this.worlds.get(key)
    if (cached !== undefined) return cached
    const service = this.ctx.worlds
    const world = worldId === undefined
      ? service.worlds().find(world => world.kind === 'local')
      : service.get(WorldId(worldId))
    if (world === undefined) {
      throw new Error(`shell-router: world '${key}' was not resolved in this process`)
    }
    this.worlds.set(key, world)
    return world
  }
}
/* jscpd:ignore-end */

export default ShellRouter
