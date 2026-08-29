/**
 * Filesystem router provider: implements the `ctx.fs` seam and dispatches each
 * call to the filesystem backend of the world the caller named. `resolve`
 * reads the caller's opaque execution-world identity (`opts.world`), resolves
 * that world's backend through `ctx.worlds`, and prefixes the target key with
 * the world id so every later operation routes without re-resolving. A call
 * without a world identity routes to the local world — the default for
 * local-only callers.
 *
 * The seam's synchronous identity helpers (`processPath`, `fileUrl`,
 * `contains`) stay synchronous by reading a world→backend cache that
 * `resolve()` populates; an operation on a target whose world was never
 * resolved in this process refuses loudly.
 *
 * Local-only deployments never mount this provider: the default composition
 * keeps the direct local backend. This router is opt-in infrastructure for
 * mixed local/remote compositions.
 * @module @deepseek-ai/dsh-fs-router
 */

import { Context } from '@deepseek-ai/cordis'
import { FileSystem, FsTargetKey, FsError } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsVersion,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import { WorldId } from '@deepseek-ai/dsh-worlds'
import type { World } from '@deepseek-ai/dsh-worlds'

/** Separator between the world prefix and the backend key in a routed target key. */
const WORLD_PREFIX = 'world:'

/** One routed target key's parts: the world id and the backend's own key. */
interface RoutedKey {
  worldId: string
  backendKey: string
}

/** Split a routed target key into its world id and the backend's own key. */
function splitWorldKey(key: string): RoutedKey | undefined {
  if (!key.startsWith(WORLD_PREFIX)) return undefined
  const rest = key.slice(WORLD_PREFIX.length)
  const at = rest.indexOf(':')
  if (at < 0) return undefined
  return { worldId: rest.slice(0, at), backendKey: rest.slice(at + 1) }
}

/**
 * Filesystem router. Load as a plugin; it registers `ctx.fs` (one
 * implementation per context) and injects `ctx.worlds`. Mount only in
 * compositions that serve remote workspaces; local-only deployments keep the
 * direct local backend.
 */
/* jscpd:ignore-start -- the router's world resolution and dispatch mirror the
   shell router for the parallel seam; extract shared code when a third
   router appears. */
export class FsRouter extends FileSystem {
  static inject = ['worlds']

  /** World id → world, populated by resolve so sync identity helpers can route. */
  private readonly worlds = new Map<string, World>()

  constructor(ctx: Context) {
    super(ctx)
    ctx.effect(() => () => {
      for (const world of this.worlds.values()) void world.dispose()
      this.worlds.clear()
    })
  }

  /**
   * Resolve a world by id (or the local world when absent), caching it so the
   * synchronous identity helpers can route without an await. An explicit id
   * that names no live world refuses loudly — the caller must resolve through
   * `ctx.worlds` first, which the tool layer does per session.
   * @param worldId - the caller's opaque execution-world identity, or undefined for local.
   * @returns the world (and its id) serving the call.
   */
  private async worldFor(worldId: string | undefined): Promise<{ world: World; id: string }> {
    const service = this.ctx.worlds
    const world = worldId === undefined
      ? await service.resolve({ place: { kind: 'local' } })
      : service.get(WorldId(worldId))
    if (world === undefined) {
      throw new FsError(`fs-router: world '${String(worldId)}' is not connected`, 'FS_IO_ERROR')
    }
    const id = String(world.id)
    this.worlds.set(id, world)
    return { world, id }
  }

  /** Require the cached world for a routed key, refusing a never-resolved world loudly. */
  private cached(id: string): World {
    const world = this.worlds.get(id)
    if (world === undefined) {
      throw new FsError(`fs-router: world '${id}' was not resolved in this process`, 'FS_IO_ERROR')
    }
    return world
  }

  async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal; world?: string }): Promise<FsTarget> {
    const { world, id } = await this.worldFor(opts?.world)
    const backend = world.fs()
    const target = await backend.resolve(path, {
      ...opts?.cwd === undefined ? {} : { cwd: opts.cwd },
      ...opts?.signal === undefined ? {} : { signal: opts.signal },
    })
    return {
      targetKey: FsTargetKey(`${WORLD_PREFIX}${id}:${String(target.targetKey)}`),
      displayPath: target.displayPath,
    }
  }

  processPath(target: FsTarget): string {
    const split = splitWorldKey(String(target.targetKey))
    /* v8 ignore next -- resolve always prefixes; a bare key means a foreign target */
    if (split === undefined) throw new FsError('fs-router: target has no world prefix', 'FS_IO_ERROR')
    return split.backendKey
  }

  fileUrl(target: FsTarget): string {
    const split = splitWorldKey(String(target.targetKey))
    /* v8 ignore next -- resolve always prefixes; a bare key means a foreign target */
    if (split === undefined) throw new FsError('fs-router: target has no world prefix', 'FS_IO_ERROR')
    const backend = this.cached(split.worldId).fs()
    return backend.fileUrl({ targetKey: FsTargetKey(split.backendKey), displayPath: target.displayPath })
  }

  contains(parent: FsTarget, child: FsTarget): boolean {
    const parentRouted = splitWorldKey(String(parent.targetKey))
    const childRouted = splitWorldKey(String(child.targetKey))
    // Containment across worlds is always false; within one world it is the
    // backend's decision.
    if (parentRouted === undefined || childRouted === undefined || parentRouted.worldId !== childRouted.worldId) {
      return false
    }
    const backend = this.cached(parentRouted.worldId).fs()
    return backend.contains(
      { targetKey: FsTargetKey(parentRouted.backendKey), displayPath: parent.displayPath },
      { targetKey: FsTargetKey(childRouted.backendKey), displayPath: child.displayPath },
    )
  }

  /** Delegate a target-relative operation to the world backend named by the target key. */
  private async withTarget<T>(target: FsTarget, op: (backend: FileSystem, inner: FsTarget) => Promise<T>): Promise<T> {
    const split = splitWorldKey(String(target.targetKey))
    /* v8 ignore next -- resolve always prefixes; a bare key means a foreign target */
    if (split === undefined) throw new FsError('fs-router: target has no world prefix', 'FS_IO_ERROR')
    const backend = this.cached(split.worldId).fs()
    const inner: FsTarget = { targetKey: FsTargetKey(split.backendKey), displayPath: target.displayPath }
    return await op(backend, inner)
  }

  async stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return await this.withTarget(target, (backend, inner) => backend.stat(inner, signal))
  }

  async lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    // lstat is path-shaped; the caller's world is not carried, so route to the
    // local world (the path is a display path in the caller's world).
    const { world } = await this.worldFor(undefined)
    const backend = world.fs()
    return await backend.lstat(path, opts, signal)
  }

  async readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return await this.withTarget(target, (backend, inner) => backend.readText(inner, signal))
  }

  async streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return await this.withTarget(target, (backend, inner) => backend.streamText(inner, signal))
  }

  async readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return await this.withTarget(target, (backend, inner) => backend.readBytes(inner, signal, maxBytes))
  }

  async listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    return await this.withTarget(target, async (backend, inner) => {
      const entries = await backend.listDir(inner, signal)
      const worldId = splitWorldKey(String(target.targetKey))?.worldId as string
      return entries.map(entry => ({
        ...entry,
        target: {
          ...entry.target,
          targetKey: FsTargetKey(`${WORLD_PREFIX}${worldId}:${String(entry.target.targetKey)}`),
        },
      }))
    })
  }

  async writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
  ): Promise<FsWriteOutcome> {
    return await this.withTarget(target, (backend, inner) => backend.writeText(inner, content, expected, signal))
  }

  async editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
  ): Promise<FsEditOutcome> {
    return await this.withTarget(target, (backend, inner) => backend.editText(inner, edit, expected, signal))
  }
}
/* jscpd:ignore-end */

export default FsRouter
