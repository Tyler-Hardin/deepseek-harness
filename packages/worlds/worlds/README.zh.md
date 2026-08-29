---
description: "执行世界 Service Definition：按会话把 workspace place 解析为世界，面向组合本地与远程世界的插件作者与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-worlds

[English](README.md) | 中文

## 概述

继承 `Worlds`，让一个组合为每个 workspace place 提供连贯的执行环境。该服务按会话或显式 place 解析世界，首次解析时连接远程世界，按 id 引用计数、管理其生命周期，并暴露每个世界的文件系统与 shell 后端，供路由 provider 把能力调用分发到正确的环境。需要在同一个 seam 上同时触达本地与远程世界时选择本包；所有 place 都是本地时选择 `dsh-worlds-local`；涉及远端主机时选择 `dsh-ssh-worlds`。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

要挂载一个 provider，因为本包不自带：本地 place 挂载 [`dsh-worlds-local`](../worlds-local/README.zh.md)，远程 place 挂载 [`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.zh.md)。随后消费方调用 `ctx.worlds.resolve({ session, path })`，并使用返回世界的 `fs()` 与 `shell()` 后端，而不是假定存在唯一的全局文件系统与 shell。

### 何时选择

远程性存在于 workspace 定义中：workspace 的 `place`（来自 [`@deepseek-ai/dsh-workspace`](../../workspace/workspace/README.zh.md)）说明它是本地还是 ssh 目的地，本包把该 place 变成世界。纯本地部署从不挂载路由，因此 `ctx.worlds` 是面向混合本地/远程组合的可选基础设施——默认组合保持不变。需要在同一时间服务多个 place 时选择本包。

### 加载 provider

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

本包不声明任何自身配置；部署方配置其所挂载的 provider。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包是契约而非实现：它声明世界词汇、place→kind 策略，以及每个 provider 都必须遵守的生命周期，而每个活跃世界及其引用计数属于已挂载的 provider。

### 设计理念

世界是其各后端的组合根——文件系统后端恰好服务该世界的路径命名空间，shell 后端恰好服务其进程命名空间——因此解析到世界的消费方无需知道由哪个 provider 提供，也绝不可跨世界复用后端。provider 在发布世界之前先连接其环境，因此世界一旦存在，后端组合即为同步操作。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `World`、`Worlds`、`WorldId`、`WorldKind`、`worldKindOf`、`WorldsResolveRequest` |
**运行时不变式：** 不发布伴生入口：活跃世界状态由已挂载的 provider 拥有，因此该 Service Definition 没有可独立观测以交叉校验的对象。

### 服务面

- `WorldId` / `WorldId(id)` — 一个执行世界的不透明品牌化标识；由所属服务把 id 映射到世界。
- `WorldKind` — `'local' | 'ssh'`；`worldKindOf(place)` 是 provider 与路由共享的纯 place→kind 策略。
- `World`（抽象）— `id`、`kind`、`place`、`status()`（`'ready' | 'closed'`），以及惰性的 `fs()` / `shell()` 后端访问器。世界是其后端的组合根：文件系统后端恰好服务该世界的路径命名空间，shell 后端恰好服务其进程命名空间。消费者绝不可跨世界复用后端。远程世界还通过可选的 `ssh()` 访问器暴露其 ssh 传输，供传输专属动词（`exec`、`sftp`、`pty`）使用；本地世界不提供该访问器。
- `Worlds`（抽象服务）— `resolve({ session?, place? })` 将会话的 workspace place（或显式 place）解析为世界，首次解析时连接远程世界并按 id 引用计数；`worlds()` 列出活跃世界；`disconnect(worldId)` 关闭一个。服务销毁时销毁所有活跃世界。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从约定逐步进入 provider、place 词汇与路由消费方。

- [执行世界子系统](../../../docs/subsystems/worlds.zh.md)——共享词汇、解析规则与世界的生命周期。
- [worlds-local](../worlds-local/README.zh.md)——面向宿主 place 的本地 provider。
- [dsh-ssh-worlds](../../ssh/ssh-worlds/README.zh.md)——经 ssh 连接远端主机的 provider。
- [dsh-workspace](../../workspace/workspace/README.zh.md)——本服务解析所用的 workspace place。
- [dsh-ssh](../../ssh/ssh/README.zh.md)——远程世界运行的传输层。
- [dsh-fs-router](../../fs/fs-router/README.zh.md)——把 `ctx.fs` 调用路由到已解析世界的消费方。

-----

<a id="model-experience"></a>
## 模型体验

### 已解析的执行世界

#### 模型看到什么

没有提示文本、工具 schema 或会话事件。模型通过路由 provider（`dsh-fs-router` / `dsh-shell-router`）间接触达世界；这些 provider 把每次能力调用分发到已解析世界的后端，由消费方工具呈现这些后端返回的内容。

#### Token 影响

本包不产生 token。模型只为已解析后端消费方发出的内容付出 token，例如 `dsh-tool-fs` 返回的文件正文或 `dsh-tool-bash` 返回的命令记录。

#### KV Cache 影响

不会直接使缓存失效；具名消费方负责请求前缀的任何变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明仅凭本契约何时不够用。它们是当前包约束，不是任务积压。

- **仅契约** — 本包声明世界词汇与生命周期；世界实现位于 provider 中：[`dsh-worlds-local`](../worlds-local/README.zh.md) 面向宿主 place，[`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.zh.md) 面向远端主机。
- **不发射会话事件** — 本包不写会话事件；拥有传输层的 provider 在其会话绑定中记录世界连接/断开事件（`ssh/connect`、`ssh/disconnect`）。
- **后端是惰性且由 provider 组合的** — 世界的 `fs()`/`shell()` 可能在首次使用时才连接；消费者不得跨世界缓存后端，也不得在 `dispose()` 之后复用。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
