---
description: "把 ssh 工作区 place 解析为远程世界的执行世界提供方：供把会话工作路由到远程主机的部署方，以及排查世界生命周期与后端组合的维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-worlds

[English](README.md) | 中文

## 概述

使用 `dsh-ssh-worlds` 可以让会话的工作运行在远程主机上：一个 ssh workspace place 解析为一个世界，其传输层是一个已连接的 `dsh-ssh` 世界，其文件系统与 shell 后端是在其上组合的 `dsh-fs-ssh` 与 `dsh-bash-ssh` 实例。世界按 `user@host:port` 引用计数，因此再次解析同一目的地会复用就绪世界，断开连接会关闭传输层及其后端。部署已挂载 `dsh-worlds` 与某个 `ctx.ssh` 提供方时选择它；本地 place 会被响亮拒绝。

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

组合需要工作区 place 运行在远程主机上时挂载本提供方；它注册 `ctx.worlds`（每个上下文一个实现），并要求已加载的 `ctx.ssh` 提供方。

### 何时选择

部署已挂载 [`worlds`](../../worlds/worlds/README.zh.md) 与诸如 [`ssh-client`](../ssh-client/README.zh.md) 的 SSH 提供方时选择 `dsh-ssh-worlds`。本地 place 需要本地 worlds 提供方：把它路由到本 provider 会对宿主目录尝试 ssh 连接，因此会被拒绝。

### 最小配置

把提供方作为插件加载，并传入传输层应使用的连接选项；二者都可选，默认使用 `ctx.ssh` 提供方自身的值。

```ts
import type { Context } from '@deepseek-ai/cordis'
import { SshWorlds } from '@deepseek-ai/dsh-ssh-worlds'

export function apply(ctx: Context): void {
  // registers `ctx.worlds` (requires `ctx.ssh`)
  ctx.plugin(SshWorlds, {
    connectTimeoutMs: 15000,
    strictHostKey: false,
  })
}
```

| 选项 | 默认值 | 含义 |
|---|---|---|
| `connectTimeoutMs` | `ctx.ssh` 默认值 | 连接握手超时，传给 `ctx.ssh.connect` |
| `strictHostKey` | `ctx.ssh` 默认值 | 要求预先存在的 known_hosts 条目，传给 `ctx.ssh.connect` |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-ssh-worlds)完整列出所有受支持选项。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释 place 如何变成世界，并指出实现它的代码位置；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

每个已解析世界为自己的 fs 与 shell 注册拥有一个隔离的子上下文，因此挂载在父作用域上的路由器不会与之冲突；它还在自己连接的那条传输层上惰性组合这两个后端。解析时会把该会话进入世界记录为仅日志的会话事件。

### 行为

- **每个目标一个世界**——ssh place 解析为一个世界，按 `user@host:port` 引用计数；就绪世界被复用，已销毁世界会重连。
- **远程后端**——`world.fs()` / `world.shell()` 在首次使用时于传输层上组合 `SshFileSystem` 与 `SshBashExecutor`。解析时的 `path`（workspace 的远程工作路径）成为后端的默认 `cwd`；没有时使用传输层默认值。`world.ssh()` 直接暴露传输层，供传输专属动词（`exec`、`sftp`、`pty`）使用。
- **生命周期**——`disconnect(id)` 关闭传输层；组合销毁时销毁所有活跃世界。
- **响亮拒绝本地**——解析本地 place（或无 place 的无会话解析，默认为本地）会抛出描述性错误。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从提供方走向它所桥接的服务与它所组合的后端。

- [SSH 子系统](../../../docs/subsystems/ssh.zh.md)——穷尽式传输约定、目标解析与 known_hosts 策略。
- [执行世界子系统](../../../docs/subsystems/worlds.zh.md)——本提供方实现的执行世界约定。
- [ssh](../ssh/README.zh.md)——世界所基于的传输接缝。
- [ssh-client](../ssh-client/README.zh.md)——连接该传输层的 ssh2 提供方。
- [fs-ssh](../../fs/fs-ssh/README.zh.md)——在世界之上组合的文件系统后端。
- [bash-ssh](../../shell/bash-ssh/README.zh.md)——在世界之上组合的 shell 执行器。

-----

<a id="model-experience"></a>
## 模型体验

不直接产生模型可见内容：本提供方只连接世界、组合其后端，并追加仅写入日志的 `ssh/connect` 与 `ssh/disconnect` 事件；`fs-ssh` 与 `bash-ssh` 的消费者（`dsh-tool-fs`、`dsh-tool-bash`）负责远程文件与命令工作的一切模型可见呈现。

#### KV Cache 影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本提供方何时不合适，或何时需要特别的运维注意。它们是当前包约束，不是通用 SSH 对比或任务积压。

- **仅 SSH place**——本地 place 需要本地 worlds provider；本 provider 响亮拒绝本地 place。
- **无会话的解析不写日志**——只有当解析携带调用方的 `Session` 时，进入远程世界才以 `ssh/connect` 追加（该世界关闭时以 `ssh/disconnect` 对应）；不带会话的解析只连接世界，不写会话日志条目。
- **无端口 place 连接 22**——ssh 传输层默认值；无法针对进程内随机端口 fixture 测试。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。提供方把 ssh place 映射为已连接的世界；连接生命周期属于 SSH 传输 seam，fs/shell 组合则委托给各适配器。
