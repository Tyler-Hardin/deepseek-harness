# @deepseek-ai/dsh-ssh

[English](README.md) | 中文

**`SshService`**（`ctx.ssh`）定义 SSH 传输接缝：以 agent-后-密钥认证连接远程执行世界，解析 `~/.ssh/config`（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），执行 known_hosts 策略（TOFU，密钥变更拒绝），并暴露 exec 与 SFTP 通道。它不涉及工作区、会话或工具——工作区/`worlds` 绑定与 `fs-ssh`/`bash-ssh` 适配器是后续阶段，消费本接缝。

本包拥有 SSH 能力接缝的 Service Definition 角色，按角色拆分以便各自独立演进（与互换）：

| 包 | 角色 |
| --- | --- |
| `@deepseek-ai/dsh-ssh`（本包） | Service Definition：世界描述符 + 连接生命周期 + 通道动词 + 纯配置/known_hosts/认证顺序策略 |
| `@deepseek-ai/dsh-ssh-client` | Service Provider：ssh2 后端连接（仅 agent/密钥、ProxyJump、TOFU） |

## Service API（`ctx.ssh`）

后端继承 `SshService` 并实现抽象成员。

| 成员 | 语义 |
| --- | --- |
| `connect(target, opts?)` | 连接目标（`SshTarget`：主机别名、显式 user/port、远程路径）并返回活的世界 `SshWorld`。失败时以 `SshError` 拒绝；认证先试 agent，再试解析出的身份文件，绝不使用密码。 |
| `worlds()` | 每个活着的、未 dispose 的世界。 |
| `disconnect(worldId)` | 关闭世界；未知 id 无错误地成功。 |
| `SshWorld.exec(command, opts?)` | 运行一条远程命令并捕获有界 stdout/stderr、退出码、超时/中止事实。 |
| `SshWorld.sftp()` | 打开世界的 SFTP 会话句柄（在 `fs-ssh` 固定契约前为暂定）。 |
| `SshWorld.dispose()` | 关闭连接（幂等）。 |

一个宿主只组合一个 `ctx.ssh` 提供方（挂载两个会因重复服务注册而响亮失败），与每个能力接缝的一条提供方规则一致。

## 纯策略（无套接字，可单测）

- `parseSshDestination('[user@]host[:port]')`——目标拆分，支持括号 IPv6。
- `resolveSshConfig(alias, configText, homeDir, opts)`——经受维护的 `ssh-config` 解析器做 `~/.ssh/config` 解析，OpenSSH 首匹配生效语义，禁用 `Match exec` 求值；`HostName`/`Port`/`User` 覆盖目标，收集 `IdentityFile` 并展开 `~`/`%d`/`%u`/`%h`，解析逗号分隔的 `ProxyJump` 链（过滤 `none`）。
- `defaultIdentityFiles(homeDir)`——`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`。
- `selectAuthMethods({ agentSocket, identityFiles })`——agent-后-密钥认证顺序；类型中刻意不存在密码变体。
- `parseKnownHosts` / `checkHostKey` / `learnKnownHostLine` / `hostKeyAlgorithmFromBlob` / `loadKnownHosts`——known_hosts 策略：TOFU 学习、密钥变更拒绝、可选 strict 模式（未知主机拒绝）。哈希条目不参与匹配（文档化限制）。

## Vocabulary

`SshTarget` 是工作区位置的远程一半；`SshWorldId` 是品牌化不透明 id（[品牌化 id Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-branded-ids.zh.md)）；`ResolvedSshHost` 是配置解析后的具体连接目标；`SshExecResult` 携带有界输出与结算事实；`SshError` 携带稳定错误码（`SSH_AUTH_FAILED`、`SSH_HOST_KEY_CHANGED`、`SSH_UNKNOWN_HOST`、`SSH_CONFIG_ERROR`、`SSH_CONNECT_ERROR`、`SSH_TIMEOUT`、`SSH_ABORTED`）。`SshError` 刻意重实现 `HarnessError` 形态而非继承：基类位于 `@deepseek-ai/dsh-llm`，传输接缝不应依赖 LLM 能力。完整契约见 `src/types.ts`。

## Model Experience

间接——经由未来的 `fs-ssh`/`bash-ssh` 适配器及其消费者；本接缝不注册任何提示词、schema 或结果。

#### KV Cache effect

无直接失效；命名消费者拥有各自的请求前缀变更。

## Known Limitations and Deferred Work

- **哈希 known_hosts 条目不参与匹配**——`|1|...` 行解析为空，因此唯一条目为哈希的主机被视为未知（TOFU 会重新学习）。
- **ProxyJump 仅一层嵌套**——不跟随跳板自身的 `ProxyJump` 配置；只使用最终目标上命名的链（与 OpenSSH 常见情况一致）。
- **带 `exec` 条件的 `Match` 块永不生效**——`matchExec: false` 禁止对不可信配置文本做 shell 求值；此类块被跳过。
- **`sftp()` 句柄为暂定**——契约在 `fs-ssh` 落地时固定；消费者不得解读其中的会话。
- **无重连**——连接断开即关闭世界；重连策略由调用方负责。
- **此处不发出会话事件**——`ssh/connect`/`ssh/disconnect` 会话事件随工作区/会话绑定阶段落地，该阶段也负责 model-visible ⟺ logged 要求。
