# Execution Worlds

English | [中文](worlds.zh.md)

The execution-worlds capability is one package ([dsh-worlds](../../packages/worlds/worlds), `ctx.worlds`) plus its providers: [dsh-worlds-local](../../packages/worlds/worlds-local) (the host filesystem and process namespace) and [dsh-ssh-worlds](../../packages/ssh/ssh-worlds) (a connected remote host over the [SSH transport seam](ssh.md)). A world is one coherent execution environment with per-world filesystem and shell backends composed over it: the filesystem backend serves exactly that world's path namespace, the shell backend exactly its process namespace, and consumers never use a backend across worlds. Router providers ([dsh-fs-router](../../packages/fs/fs-router), [dsh-shell-router](../../packages/shell/shell-router)) dispatch seam calls to the resolved world's backends; local-only deployments never mount a router, so this service is optional infrastructure for mixed local/remote compositions.

Source: [`packages/worlds/worlds/src/index.ts`](../../packages/worlds/worlds/src/index.ts)

## Identity and kind

`WorldId` is a [branded id](core.md#branded-ids): opaque, never parsed, mapped to a world only by the owning service. The kind of world a workspace place resolves to is pure policy (`worldKindOf`): local places are local worlds, ssh places are remote worlds. A world's observable state is `ready` while its environment is usable and `closed` after dispose or an unrecoverable transport failure. Remote worlds expose their ssh transport through the optional `ssh()` accessor for transport-specific verbs (`exec`, `sftp`, `pty`); local worlds leave it absent.

```ts type-equiv
/**
 * Opaque identity of one execution world. Never parse it: the owning service
 * maps ids to worlds, and a string that walks and talks like a `WorldId` from
 * another world must not be interchangeable with one.
 */
type WorldId = Branded<'WorldId'>
```

```ts type-equiv
/** The kind of execution world a workspace place resolves to. */
type WorldKind = 'local' | 'ssh'
```

```ts type-equiv
/** Observability state of a world's underlying environment. */
type WorldStatus = 'ready' | 'closed'
```

## Resolution

`ctx.worlds.resolve` resolves the session's workspace place (or an explicit place) to a world: local places to the local world, remote places to a connected remote world — a remote world connects on first resolve and is refcounted by id. The workspace's working path, when known, becomes the world backends' default cwd (the remote absolute path for an ssh place).

```ts type-equiv
/** Inputs that select the world for one capability call. */
interface WorldsResolveRequest {
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
```

## Consumers

[dsh-fs-router](../../packages/fs/fs-router) and [dsh-shell-router](../../packages/shell/shell-router) are the product consumers: they read the caller's opaque world identity (`opts.world` / `request.world`, frozen in the [`SessionHeader`](persistence.md#sessionheader--metadata-beside-the-log) at session creation) and dispatch each call to the resolved world's backend. [dsh-host-apiproxy](../../packages/host/apiproxy) resolves a session's world from its workspace place when the session is created.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworlds--worlds-abstract-seam"></a>

### `ctx.worlds` — `Worlds` (abstract seam)

Abstract execution-worlds service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.worlds` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- resolve resolves the session's workspace place (or an explicit place) to a world: local places to the local world, remote places to a connected remote world. It connects a remote world on first resolve and refcounts worlds by id.
- worlds lists every live world; disconnect removes it.
- Disposal of the service disposes every live world.

```ts cordis-catalog
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
```

Source: [`packages/worlds/worlds/src/index.ts`](../../packages/worlds/worlds/src/index.ts)
<!-- END GENERATED cordis-surface -->
