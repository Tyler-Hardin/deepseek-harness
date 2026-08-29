---
description: "`ctx.terminals` 的 ssh 终端后端：基于某个 ssh 世界 pty 通道的持久远程 PTY 会话，面向工作区位于远端主机的部署。"
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-ssh

[English](README.md) | 中文

## 概述

在远端主机上保持跨工具调用的交互式 shell。该后端通过某个 ssh 世界的 pty 通道（`SshWorld.pty`）打开账户的登录 shell，保留有界的逐行输出，并在该通道上直接驱动就绪检测、信号发送与拆除，因此工作区位于 ssh 之上的会话，会得到与文件系统和 bash 工具同一执行世界的持久 shell。请与 ssh worlds provider 及 `dsh-tool-terminal` 搭配使用；就绪检测基于静默，因此长时间运行且不打印任何内容的命令会提前结算。

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

基于某个 ssh 执行世界 pty 通道、为 `ctx.terminals` 提供的持久远程 shell 后端。它通过 `@deepseek-ai/dsh-ssh`（`SshWorld.pty`）以远程伪终端打开账户的登录 shell，保留有界的逐行输出，并直接在通道上驱动就绪检测、信号发送与拆除。这样打开的会话运行在会话的远程执行世界中，因此工作区位于 ssh 之上的智能体，会得到与文件系统和 bash 工具同一执行世界的持久交互式 shell。

### 何时选择

作为插件加载；它把所配置的后端类型注册到 `ctx.terminals`。会话世界为 ssh 世界且已挂载 `ctx.worlds` 时选择本后端；本地交互式 shell 请使用 [`terminal-bash`](../terminal-bash/README.zh.md)。模型要触达这些会话，必须存在 PTY 消费方，例如 [`tool-terminal`](../tool-terminal/README.zh.md)。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-terminal-ssh'
  config:
    idleSilenceMs: 300
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `backendType` | `ssh` | 注册到 `ctx.terminals` 的后端类型 |
| `idleSilenceMs` | `300` | 使 send 结算的输出静默时长，单位毫秒 |
| `startupTimeoutMs` | `10000` | 引导到就绪的超时时间，单位毫秒 |
| `sendTimeoutMs` | `120000` | 每次 send 的结算超时时间，单位毫秒 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-terminal-ssh)完整列出了所有受支持字段，包括读取、scrollback 与视口上限。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 插件接线

该插件注入 `pty` 和 `worlds`，然后注册所配置的后端类型（`ssh`）。spawn 时，它通过 `ctx.worlds.resolve({ session, path })` 解析所有者的会话执行世界，并大声拒绝非 ssh 执行世界——把本地会话路由到这里，等于试图在并非该世界所有的传输上打开 PTY。后端调用 `world.pty({ rows, cols })` 打开登录 shell；当已知工作路径（spawn 的 `cwd`，否则为会话头的 `cwd`）时，会在就绪检测前先执行引导行 `cd <path>`，使 shell 从工作区路径启动，同时把同一路径作为后端默认路径传给执行世界。`startupTimeoutMs` 限制引导到就绪的等待时间，`sendTimeoutMs` 限制之后每次 send 的等待时间。

### 就绪检测与拆除

就绪检测基于静默：当至少出现一次输出事件后，输出静默达到 `idleSilenceMs` 时 send 结算，或在远端退出／关闭时立即结算；启动阶段还要求已经观察到输出，因此零输出静默不能发布空会话。ssh 传输不暴露前台进程组内省，因此没有本地后端那样的提示符标记或 stdin-wait 档位。`SIGINT` 与 `SIGTSTP` 向通道写入各自的终端控制字节；`SIGTERM`、`SIGKILL` 与 `SIGHUP` 没有控制字节，后端因此关闭通道，从而终止远端 shell 及其子进程。`close` 结束通道，把活跃 send 结算为 `session_exit`，并在解析前等待安静；传输故障会失败活跃 send，并通过 `close` 浮出第一个故障。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当后端级约定不够用时阅读以下页面。它们从约定逐步进入会话服务、同级后端与传输层。

- [终端子系统](../../../docs/subsystems/terminal.zh.md)——会话 id、后端契约、send 就绪与有界读取。
- [dsh-terminal](../../terminal/README.zh.md)——本后端注册所在的 `ctx.terminals` 契约。
- [dsh-terminal-bash](../terminal-bash/README.zh.md)——本地交互式后端。
- [dsh-tool-terminal](../tool-terminal/README.zh.md)——这些会话面向模型的消费方。
- [dsh-ssh](../../ssh/ssh/README.zh.md)——本后端所驱动 pty 通道的传输层。
- [dsh-worlds](../../worlds/worlds/README.zh.md)——解析会话 ssh 世界的服务。

-----

<a id="model-experience"></a>
## 模型体验

### 远程 PTY 会话

#### 模型看到什么

没有自身的提示文本或工具 schema。模型通过 `dsh-tool-terminal` 或其他 PTY 消费方触达这些会话；这些消费方呈现本后端产生的有界 MOTD、发送增量、scrollback 页与清理错误。

#### Token 影响

本包不产生 token。模型只为该消费方返回的内容付出 token，例如受 `maxReadBytes` 与 `scrollbackLines` 限制的发送增量或 scrollback 页。

#### KV Cache 影响

不会直接使缓存失效；具名消费方负责请求前缀的任何变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本后端何时不合适。它们是当前包约束，不是任务积压。

**运行时不变式：** 不发布伴生入口：该后端只是在 `ctx.terminals` 上注册一个终端后端，并不拥有可独立观测的数据关系。

- **仅登录 shell** —— SSH 协议的 shell 请求没有 shell 或目录参数，因此后端始终启动账户的登录 shell，并针对工作路径执行显式 `cd`；不支持选择其他远端 shell。
- **仅基于静默的就绪检测** —— 没有远端前台进程内省，send 在输出静默时结算；长时间运行且不打印任何内容的命令会提前结算（模型可以轮询 scrollback），即使在 bash 远端上也没有提示符标记档位。
- **粗略的信号** —— `SIGTERM`／`SIGKILL`／`SIGHUP` 关闭通道而非投递具名信号，且永远不会识别远端进程组（`targetPgid` 为 `0`）。
- **需要 POSIX shell** —— 引导 `cd` 行假定远端登录 shell 为 POSIX 兼容。
- **harness 进程退出后，会话无法继续存在。**

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
