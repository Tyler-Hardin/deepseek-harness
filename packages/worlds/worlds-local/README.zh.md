---
description: "`ctx.worlds` 的本地提供方：每个本地 workspace place 变成基于 `dsh-fs-local` 与 `dsh-bash-local` 的单个宿主世界，面向把执行保留在本机的部署。"
kind: "package-reference"
---

# @deepseek-ai/dsh-worlds-local

[English](README.md) | 中文

## 概述

把每个本地 workspace place 解析为单个宿主世界，并让它的文件系统与 shell 后端不注册到父上下文。该 provider 在 `fs` 与 `shell` 的私有子上下文上组合 `dsh-fs-local` 与 `dsh-bash-local`，首次使用时惰性组合，并按 id 引用计数世界。混合本地/远程且挂载路由的组合应选择它，任何通过 `ctx.worlds` 触达 `ctx.fs` 与 `ctx.shell` 的部署也应选择它。ssh place 会响亮拒绝，因此涉及远端主机时请与 `dsh-ssh-worlds` 搭配使用。

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

[`@deepseek-ai/dsh-worlds`](../worlds/README.zh.md) 执行世界服务的本地 provider：每个本地 workspace place 解析为单个本地世界，其文件系统与 shell 后端分别是 `dsh-fs-local` 与 `dsh-bash-local` 实例。消费方通过 `ctx.worlds.resolve(...)` 取得该世界，并使用其 `fs()` 与 `shell()` 后端。

### 何时选择

作为插件加载；它注册 `ctx.worlds`。非本地 place（ssh 目的地）会响亮拒绝：本 provider 不拥有传输层，把远程 place 路由到它会静默地对宿主文件系统运行远程路径。部署中所有 place 都是本地时选择本 provider；组合还需服务 ssh 目的地时改挂 `dsh-ssh-worlds`。

### 最小配置

```ts
import type { Context } from '@deepseek-ai/cordis'
import { LocalWorlds } from '@deepseek-ai/dsh-worlds-local'

export function apply(ctx: Context): void {
  // registers `ctx.worlds`
  ctx.plugin(LocalWorlds, {
    fs: { cwd: '/srv/project' },
    shell: { cwd: '/srv/project' },
  })
}
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `fs` | `{}` | 文件系统后端设置（见 `dsh-fs-local`）；`diffBasisMaxBytes` 默认为 10 MiB |
| `shell` | `{}` | shell 后端设置（见 `dsh-bash-local`）；超时/spill/宽限默认值与该 provider 一致 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-worlds-local)完整列出了所有受支持字段。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本 provider 是一层轻量组合：它解析 place、计数引用，并让 fs 与 shell provider 各自拥有其后端。

### 设计理念

每个世界在由挂载上下文派生的私有子上下文上组合其后端，并对 `fs` 与 `shell` 分别隔离。子上下文使后端服务注册不会与挂在父上下文上的路由冲突——路由实现 `ctx.fs`/`ctx.shell`，因此每世界的后端不能在同一个上下文上注册这些名字。子上下文继承父上下文的其他服务，例如 shell 后端用于启动进程的子进程 provider。

### 行为

- **单个本地世界** — 所有本地 place 解析为同一个世界（按 id 引用计数）；`worlds()` 列出它；`disconnect(id)` 关闭它。
- **惰性后端** — `world.fs()` / `world.shell()` 在首次使用时于世界的私有子上下文上组合后端；`dispose()` 之后的访问会拒绝。
- **生命周期** — 组合销毁时销毁世界及其子上下文；直接 `dispose()` 幂等。
- **响亮拒绝远程** — 解析 ssh place 会抛出描述性错误，而不是在本地运行远程路径。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `LocalWorlds` provider 与 `LocalWorld`：place 解析、引用计数、惰性后端组合 |
**运行时不变式：** 不发布伴生入口：provider 的生命周期即 worlds 服务契约，因此没有可单独检查的观测对象。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当 provider 级约定不够用时阅读以下页面。它们从约定逐步进入同级 provider、被组合的后端与路由消费方。

- [执行世界子系统](../../../docs/subsystems/worlds.zh.md)——世界、place、kind 与 provider 约定。
- [dsh-worlds](../worlds/README.zh.md)——本 provider 实现的契约。
- [dsh-ssh-worlds](../../ssh/ssh-worlds/README.zh.md)——服务 ssh place 的 provider。
- [dsh-fs-local](../../fs/fs-local/README.zh.md)——为每个世界组合的文件系统后端。
- [dsh-bash-local](../../shell/bash-local/README.zh.md)——为每个世界组合的 shell 后端。
- [dsh-fs-router](../../fs/fs-router/README.zh.md)——其 `ctx.fs` 注册正是子上下文要避免冲突的路由消费方。

-----

<a id="model-experience"></a>
## 模型体验

### 本地宿主世界后端

#### 模型看到什么

没有提示文本、工具 schema 或会话事件。模型通过其后端的消费方（`dsh-tool-fs`、`dsh-tool-bash`）间接触达本地后端；这些消费方呈现世界所组合后端的文件正文、变更确认与命令记录。

#### Token 影响

本包不产生 token。模型只为这些消费方针对路由到本地世界的调用所发出的内容付出 token，例如 `read` 结果正文或被截断的 bash 命令记录。

#### KV Cache 影响

不会直接使缓存失效；具名消费方负责请求前缀的任何变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本 provider 何时不合适。它们是当前包约束，不是任务积压。

- **仅本地 place** — ssh place 需要可感知传输层的 provider，例如 [`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.zh.md)；本 provider 响亮拒绝远程 place。
- **每个组合一个本地世界** — 不同的本地 place 共享单个本地世界；不按 place 组合后端（它们会是相同的主机后端）。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
