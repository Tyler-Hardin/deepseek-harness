# @deepseek-ai/dsh-worlds

[English](README.md) | 中文

DeepSeek Harness 的执行世界（execution-worlds）Service Definition：一个世界就是一个连贯的执行环境——本地目录树，或经传输层到达的远端主机——并在其上组合每世界的文件系统与 shell 后端。`ctx.worlds` 服务按会话（或 workspace place）解析世界、管理世界生命周期，并暴露每世界的 fs/shell 后端，供路由 provider 分发 seam 调用。

远程性存在于 workspace 定义中：workspace 的 `place`（来自 [`@deepseek-ai/dsh-workspace`](../../workspace/workspace/README.zh.md)）说明它是本地还是 ssh 目的地，本包把该 place 变成世界。纯本地部署从不挂载路由，因此 `ctx.worlds` 是面向混合本地/远程组合的可选基础设施——默认组合保持不变。

## 使用

```ts
import { Worlds, type World, type WorldId, type WorldsResolveRequest } from '@deepseek-ai/dsh-worlds'

// subclass and load as a plugin (registers `ctx.worlds`)
class MyWorlds extends Worlds {
  async resolve(request?: WorldsResolveRequest): Promise<World> {
    // local places resolve to the local world; remote places connect one
    return { kind: 'local' } as unknown as World
  }
  worlds(): readonly World[] { return [] }
  get(_worldId: WorldId): World | undefined { return undefined }
  async disconnect(_worldId: WorldId): Promise<void> {}
}
```

## 结构

- `WorldId` / `WorldId(id)` — 一个执行世界的不透明品牌化标识；由所属服务把 id 映射到世界。
- `WorldKind` — `'local' | 'ssh'`；`worldKindOf(place)` 是 provider 与路由共享的纯 place→kind 策略。
- `World`（抽象）— `id`、`kind`、`place`、`status()`（`'ready' | 'closed'`），以及惰性的 `fs()` / `shell()` 后端访问器。世界是其后端的组合根：文件系统后端恰好服务该世界的路径命名空间，shell 后端恰好服务其进程命名空间。消费者绝不可跨世界复用后端。远程世界还通过可选的 `ssh()` 访问器暴露其 ssh 传输，供传输专属动词（`exec`、`sftp`、`pty`）使用；本地世界不提供该访问器。
- `Worlds`（抽象服务）— `resolve({ session?, place? })` 将会话的 workspace place（或显式 place）解析为世界，首次解析时连接远程世界并按 id 引用计数；`worlds()` 列出活跃世界；`disconnect(worldId)` 关闭一个。服务销毁时销毁所有活跃世界。

## 模型体验

间接通过路由 provider（`dsh-fs-router` / `dsh-shell-router`），它们把 seam 调用分发到已解析世界的后端。本包不注册工具、不注入提示、不写会话事件。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

- **仅契约** — 本包声明世界词汇与生命周期；实际的世界实现（本地、ssh）位于 provider 中（`dsh-worlds-local`，以及后续阶段的传输层 ssh provider）。
- **不发射会话事件** — 世界连接/断开生命周期事件（`ssh/connect`、`ssh/disconnect`）属于会话绑定阶段，由拥有传输层的 provider 发射。
- **后端是惰性且由 provider 组合的** — 世界的 `fs()`/`shell()` 可能在首次使用时才连接；消费者不得跨世界缓存后端，也不得在 `dispose()` 之后复用。
