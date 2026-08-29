# 执行世界

[English](worlds.md) | 中文

执行世界能力由单个包（[dsh-worlds](../../packages/worlds/worlds)，`ctx.worlds`）及其 provider 构成：[dsh-worlds-local](../../packages/worlds/worlds-local)（宿主机文件系统与进程命名空间）与 [dsh-ssh-worlds](../../packages/ssh/ssh-worlds)（经 [SSH 传输接缝](ssh.zh.md) 连接的远程主机）。一个世界是一个连贯的执行环境，其文件系统与 shell 后端组合其上：文件系统后端只服务于该世界的路径命名空间，shell 后端只服务于该世界的进程命名空间，消费者绝不跨世界使用后端。路由 provider（[dsh-fs-router](../../packages/fs/fs-router)、[dsh-shell-router](../../packages/shell/shell-router)）把接缝调用分发到已解析世界的后端；纯本地部署从不挂载路由，因此本服务是混合本地/远程组合的可选基础设施。

源码：[`packages/worlds/worlds/src/index.ts`](../../packages/worlds/worlds/src/index.ts)

## 身份与种类

`WorldId` 是[品牌化 id](core.zh.md#branded-ids)：不透明、绝不解析、只由所属服务映射到世界。工作区位置解析出的世界种类是纯策略（`worldKindOf`）：本地位置是本地世界，ssh 位置是远程世界。世界的可观察状态在其环境可用时为 `ready`，在 dispose 或不可恢复的传输故障之后为 `closed`。远程世界通过可选的 `ssh()` 访问器暴露其 ssh 传输，供传输专属动词（`exec`、`sftp`、`pty`）使用；本地世界不提供该访问器。

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

## 解析

`ctx.worlds.resolve` 将会话的工作区位置（或显式位置）解析为一个世界：本地位置解析到本地世界，远程位置连接到远程世界——远程世界在首次解析时连接，并按 id 引用计数。已知的工作区工作路径成为世界后端的默认 cwd（ssh 位置为远程绝对路径）。

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

## 消费者

[dsh-fs-router](../../packages/fs/fs-router) 与 [dsh-shell-router](../../packages/shell/shell-router) 是产品消费者：它们读取调用方的不透明世界身份（`opts.world` / `request.world`，在会话创建时冻结于 [`SessionHeader`](persistence.zh.md#sessionheader--metadata-beside-the-log)）并把每次调用分发到已解析世界的后端。[dsh-host-apiproxy](../../packages/host/apiproxy) 在创建会话时从工作区位置解析会话的世界。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
