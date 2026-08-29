---
description: "`ctx.ssh` Service Definition：供实现远程 SSH 执行世界的提供方作者，以及审阅该传输接缝的维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh

[English](README.md) | 中文

## 概述

使用 `dsh-ssh` 可以描述并打开基于 SSH 的远程执行世界：以 agent-后-密钥认证连接目标，解析 `~/.ssh/config`（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），执行 known_hosts 策略（TOFU，密钥变更拒绝），并使用 exec 与 SFTP 通道。需要 `ctx.ssh` 约定本身、纯配置/known_hosts/认证顺序辅助函数，或作为提供方继承的基类时选择它。它不涉及工作区、会话或工具。

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

继承 `SshService`、实现抽象成员，并把子类作为插件加载：它注册 `ctx.ssh`，每个已连接目标对应一个活跃世界，提供消费者所需的 exec 与 SFTP 能力。

### 何时选择

需要接缝约定本身、纯策略辅助函数，或作为提供方继承的基类时选择 `dsh-ssh`。组合需要可用的 ssh2 提供方时，选择 [`ssh-client`](../ssh-client/README.zh.md)。本包不涉及工作区、会话或工具：工作区/`worlds` 绑定与 `fs-ssh`/`bash-ssh` 适配器是消费本接缝的后续阶段。

本包拥有 SSH 能力接缝的 Service Definition 角色，按角色拆分以便各自独立演进（与互换）：

| 包 | 角色 |
|---|---|
| `@deepseek-ai/dsh-ssh`（本包） | Service Definition：世界描述符 + 连接生命周期 + 通道动词 + 纯配置/known_hosts/认证顺序策略 |
| `@deepseek-ai/dsh-ssh-client` | Service Provider：ssh2 后端连接（仅 agent/密钥、ProxyJump、TOFU） |

### 服务 API（`ctx.ssh`）

后端继承 `SshService` 并实现抽象成员。

| 成员 | 语义 |
|---|---|
| `connect(target, opts?)` | 连接目标（`SshTarget`：主机别名、显式 user/port、远程路径）并返回活的世界 `SshWorld`。失败时以 `SshError` 拒绝；认证先试 agent，再试解析出的身份文件，绝不使用密码。 |
| `worlds()` | 每个活着的、未 dispose 的世界。 |
| `disconnect(worldId)` | 关闭世界；未知 id 无错误地成功。 |
| `SshWorld.exec(command, opts?)` | 运行一条远程命令并捕获有界 stdout/stderr、退出码、超时/中止事实。 |
| `SshWorld.sftp()` | 打开世界的 SFTP 会话句柄（在 `fs-ssh` 固定契约前为暂定）。 |
| `SshWorld.dispose()` | 关闭连接（幂等）。 |

一个宿主只组合一个 `ctx.ssh` 提供方（挂载两个会因重复服务注册而响亮失败），与每个能力接缝的一条提供方规则一致。

### 词汇表

`SshTarget` 是工作区位置的远程一半；`SshWorldId` 是品牌化不透明 id（[品牌化 id Agent Note](../../../.agents/notes/archived/architecture/2026-06-20-branded-ids.md)）；`ResolvedSshHost` 是配置解析后的具体连接目标；`SshExecResult` 携带有界输出与结算事实；`SshError` 携带稳定错误码（`SSH_AUTH_FAILED`、`SSH_HOST_KEY_CHANGED`、`SSH_UNKNOWN_HOST`、`SSH_CONFIG_ERROR`、`SSH_CONNECT_ERROR`、`SSH_TIMEOUT`、`SSH_ABORTED`）。`SshError` 刻意重实现 `HarnessError` 形态而非继承：基类位于 `@deepseek-ai/dsh-llm`，传输接缝不应依赖 LLM 能力。完整契约见 `src/types.ts`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释接缝与其提供方之间的分工，并指出实现它们的代码位置；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

接缝以纯函数承担无需套接字的决策——目标拆分、`~/.ssh/config` 解析、身份文件选择、认证顺序与 known_hosts 判定。提供方继承 `SshService`、调用这些函数，并承担所有涉及网络的部分：跳板转发、密钥材料、通道捕获与销毁。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 服务接线：`SshService`、`SshWorld` 与各抽象动词 |
| [`src/config.ts`](src/config.ts) | 目标与 `~/.ssh/config` 解析、身份文件、认证顺序 |
| [`src/known-hosts.ts`](src/known-hosts.ts) | known_hosts 解析、主机密钥判定、TOFU 行学习 |
| [`src/error.ts`](src/error.ts) | `SshError` 及其稳定错误码 |
| [`src/types.ts`](src/types.ts) | 目标、世界、exec、SFTP 与 PTY 契约 |

### 纯策略（无套接字，可单测）

- `parseSshDestination('[user@]host[:port]')`——目标拆分，支持括号 IPv6。
- `resolveSshConfig(alias, configText, homeDir, opts)`——经受维护的 `ssh-config` 解析器做 `~/.ssh/config` 解析，OpenSSH 首匹配生效语义，禁用 `Match exec` 求值；`HostName`/`Port`/`User` 覆盖目标，收集 `IdentityFile` 并展开 `~`/`%d`/`%u`/`%h`，解析逗号分隔的 `ProxyJump` 链（过滤 `none`）。
- `defaultIdentityFiles(homeDir)`——`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`。
- `selectAuthMethods({ agentSocket, identityFiles })`——agent-后-密钥认证顺序；类型中刻意不存在密码变体。
- `parseKnownHosts` / `checkHostKey` / `learnKnownHostLine` / `hostKeyAlgorithmFromBlob` / `loadKnownHosts`——known_hosts 策略：TOFU 学习、密钥变更拒绝、可选 strict 模式（未知主机拒绝）。哈希条目不参与匹配（文档化限制）。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从接缝走向其提供方、消费方与塑造它的提案。

- [SSH 子系统](../../../docs/subsystems/ssh.zh.md)——穷尽式传输约定、目标解析与 known_hosts 策略。
- [ssh-client](../ssh-client/README.zh.md)——实现本接缝的 ssh2 后端提供方。
- [ssh-worlds](../ssh-worlds/README.zh.md)——把 ssh place 解析为远程世界的 worlds 提供方。
- [fs-ssh](../../fs/fs-ssh/README.zh.md)——已连接 ssh 世界上的文件系统后端。
- [bash-ssh](../../shell/bash-ssh/README.zh.md)——已连接 ssh 世界上的 shell 执行器。
- [SSH 能力接缝提案](../../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.zh.md)——Service Definition 与其提供方为何拆分。

-----

<a id="model-experience"></a>
## 模型体验

不直接产生模型可见内容：本接缝只打开连接与通道；`fs-ssh` 与 `bash-ssh` 适配器及其消费者负责远程命令输出或退出事实的一切模型可见呈现。

#### KV Cache 影响

无直接失效；命名消费者拥有各自的请求前缀变更。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本接缝何时不合适，或何时把工作留给其提供方。它们是当前包约束，不是通用 SSH 对比或任务积压。

- **哈希 known_hosts 条目不参与匹配**——`|1|...` 行解析为空，因此唯一条目为哈希的主机被视为未知（TOFU 会重新学习）。
- **ProxyJump 仅一层嵌套**——不跟随跳板自身的 `ProxyJump` 配置；只使用最终目标上命名的链（与 OpenSSH 常见情况一致）。
- **带 `exec` 条件的 `Match` 块永不生效**——`matchExec: false` 禁止对不可信配置文本做 shell 求值；此类块被跳过。
- **`sftp()` 句柄为暂定**——契约在 `fs-ssh` 落地时固定；消费者不得解读其中的会话。
- **无重连**——连接断开即关闭世界；重连策略由调用方负责。
- **此处不发出会话事件**——本接缝不追加自己的会话事件；消费它的 `ssh-worlds` 提供方会在会话进入或离开远程世界时追加 `ssh/connect`/`ssh/disconnect`。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。这个无状态的服务定义只拥有类型与纯函数策略；live-world 注册表是提供方拥有的状态，没有可供检查比对的独立事件流。
