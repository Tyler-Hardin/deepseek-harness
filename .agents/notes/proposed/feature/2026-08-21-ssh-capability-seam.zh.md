# Agent Note: SSH 能力接缝

Status: proposed

[English](2026-08-21-ssh-capability-seam.md) | 中文

## Problem

[执行世界与 SSH 工作区决策](../architecture/2026-08-21-execution-worlds-and-ssh-workspaces.zh.md)把远程性做成工作区定义的属性，并通过路由提供方按会话选择世界。在任何工作区可以变远程之前，harness 需要一条传输接缝：用默认可用的 agent/密钥认证连接 ssh 主机，解析 `~/.ssh/config`（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），执行 known_hosts 策略，并暴露 exec 与 SFTP 通道供未来的 `fs-ssh` 与 `bash-ssh` 适配器消费。仓库里目前没有任何东西做这件事；参考行为是系统 `ssh` 命令与 goop 的 `ssh.rs`/`transport.rs` 实现。

## Proposal

新增 `packages/ssh/` 组，含两个包（M1 范围——仅传输；fs/shell 适配器、路由、工作区/会话绑定与 GUI 是后续阶段）：

| 包 | 路径 | ctx 表面 | 角色 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh-ssh` | `packages/ssh/ssh/` | `ctx.ssh` | Service Definition：世界描述符 + 连接生命周期 + 通道动词 + 纯配置/known_hosts/认证顺序策略 |
| `@deepseek-ai/dsh-ssh-client` | `packages/ssh/ssh-client/` | 注册 `ctx.ssh` | ssh2 后端提供方 |

### `dsh-ssh` — Service Definition

- **词汇**：`SshTarget`（`host`、`user?`、`port?`、`path`——即 ssh 工作区位置）、品牌化 `WorldId`（来自 `dsh-brand`）、`ResolvedSshHost`（hostName、port、user、identityFiles、proxyJumps）、带稳定错误码集的 `SshError`（`SSH_AUTH_FAILED`、`SSH_HOST_KEY_CHANGED`、`SSH_UNKNOWN_HOST`（strict 模式）、`SSH_CONFIG_ERROR`、`SSH_CONNECT_ERROR`、`SSH_TIMEOUT`、`SSH_ABORTED`）。
- **纯策略，导出且无需套接字即可单测**：
  - `parseSshDestination('[user@]host[:port]')` 与 `resolveSshConfig(alias, configText, home)`——经受维护的 `ssh-config` 依赖解析 `~/.ssh/config`，`Host`/`Match` 通配（`*`、`?`）首匹配生效，`IdentityFile` 的 `~` 展开，逗号分隔的 `ProxyJump` 链。
  - `defaultIdentityFiles(home)`——`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`。
  - `selectAuthMethods(opts)`——存在 `SSH_AUTH_SOCK`/agent 管道时 agent 优先，然后是配置密钥，再是默认密钥；**类型中不存在密码变体**。
  - known_hosts 策略：`loadKnownHosts(path)`、`checkHostKey(entries, host, port, key)`、`learnHostKey(entries, host, port, key)`——TOFU 学习、密钥变更拒绝、可选 strict 模式（要求预先存在条目）。
- **服务契约**：抽象 `SshService`（继承 cordis `Service`），含 `connect(target, opts): Promise<SshWorld>`（按世界 id 引用计数）、`worlds()`、`disconnect(worldId)`；抽象 `SshWorld`，含 `id`、`target`、`status`、`exec(command, opts): Promise<ExecResult>`（有界输出、超时/取消）、`sftp(): Promise<SftpHandle>`（在 `fs-ssh` 落地前对消费者保持不透明）、`dispose()`。
- `./invariant` 伴生与 README（规范 Model Experience 小节——间接，不注册模型上下文）。

### `dsh-ssh-client` — ssh2 提供方

- 基于 `ssh2` 实现 `SshService`：`hostVerifier` 接 known_hosts 策略；按上述精确顺序认证（先经 `ssh2` 的 `Agent` 走 agent，再读盘上的公钥）；密钥文件非仅属主可读（文件 `0600` / `.ssh` 目录 `0700`）则拒绝；无 agent 且密钥需要口令时响亮失败并给出可操作提示。
- **ProxyJump**：每跳一条 ssh 连接，用 `direct-tcpip` 通道连下一跳的 `host:port`，所得套接字作为下一客户端的 `sock`；链递归解析，受配置约束。
- 有界连接超时；agent 优先但有界，避免无响应的 agent 套接字挂起连接。
- `exec` 用调用方超时/取消运行一条远程命令并返回有界 stdout/stderr；`sftp` 返回 ssh2 的 SFTP 包装句柄供后续 `fs-ssh` 适配器使用。

### 测试

- 用 `ssh2` 自带的 `Server` 类做进程内 sshd：生成主机密钥 + 生成用户密钥，`publickey` 认证——整个客户端无需网络或 CI sshd 即可单测。
- agent 认证对 unix socket 上的进程内 `AgentProtocol` 监听器测试。
- 纯策略套件：配置解析（通配、取反、ProxyJump 链、`IdentityFile` 展开、首匹配）、known_hosts（学习/变更/拒绝/strict）、认证选择。
- 覆盖率门槛：两个包 `src` 的逐文件 100%。

## Acceptance criteria

- `dsh-ssh-client` 仅凭目标（无需其他配置）即可用生成密钥与 agent 认证连接进程内 sshd。
- 默认身份文件与 `~/.ssh/config` 条目（别名、`User`、`Port`、`IdentityFile`、`ProxyJump`）在覆盖范围内与系统 `ssh` 解析一致。
- 首次连接学习主机密钥（TOFU）；主机密钥变更拒绝连接；strict 模式拒绝未知主机。
- 两个包的任何位置都不存在接受密码的代码路径。
- 两个包通过 `test:coverage`、`typecheck`、`lint` 与文档门禁（README Model Experience + Known Limitations、翻译配对、invariant 注册）。

## Progress

**M1（已合并）** — `packages/ssh/ssh`（SD）与 `packages/ssh/ssh-client`（ssh2 provider）按提案落地；对进程内 sshd 的 57 个客户端测试，逐文件 100% 覆盖率，全部门禁通过。

**M2（已合并）** — `packages/fs/fs-ssh` 把暂定的 `SftpHandle` 钉扎到 ssh2 wrapper，并通过 SFTP 实现完整十二原语文件系统 seam：realpath 稳定目标键、二进制/UTF-8 校验、经私有暂存目录的原子写入、版本守卫与按目标 FIFO 锁。`createIfAbsent` 通过远端硬链接（`ln`）发布——即 SFTP 层的 no-replace 原语（SFTP v3 没有 no-replace rename）。版本由 SFTP attrs 的秒级时间戳推导——弱于本地后端，已记录。25 个测试，100% 覆盖率。

**M3（已合并）** — `packages/shell/bash-ssh` 在 world 的 exec 通道上实现 bash 执行器 seam。前台运行把传输层 exec/collect 生命周期映射到 seam 结果（配置钳制超时、abort、stdin、env、每流截断）。后台进程启动一个分离的远端 wrapper（`setsid` 新会话、pid/status/out/err 文件），轮询循环经 SFTP 读取：pid 读取重试、按 128+n 推断信号的状态结算、带 `lossy` 标记的有界增量输出尾部、`kill()`/abort 的 SIGTERM→SIGKILL 组升级，以及 spawn 失败/连接丢失结算以保证 `done` 永不挂起。24 个测试，100% 覆盖率。

## Risks

- **ssh2 是纯 JS 协议实现**；冷门的 `~/.ssh/config` 特性（如 `Match exec`、`Include`、`ControlMaster`）不在范围内，必须响亮失败而非静默错连。
- **agent 协议差异**（OpenSSH 与 Pageant）可能需要平台特定处理；Windows agent 支持列为后续工作与已知限制。
- **`sftp()` 句柄类型是暂定的**，直到 M2 的 `fs-ssh` 固定适配器契约；先保持不透明可避免易变的公开类型。

## Alternatives considered

- **经 `dsh-subprocess` 调用系统 `ssh`/`sftp` 二进制**：M1 否决——无 ControlMaster 时每次操作一个子进程过慢，协议测试需要真实 sshd 或脆弱的 fixture 脚本，而 `ssh2` 的进程内 `Server` 可提供确定性协议测试。SD 的纯策略层使将来仍可实现二进制后端而不触碰契约。
- **密码认证（工具参数、credentials 或提示）**：按决策否决——仅 agent 与密钥；无 agent 且密钥需要口令时响亮失败。
- **手写配置解析器与主机密钥验证**：按"优先受维护依赖"政策否决；`ssh-config` 与 `ssh2` 均受维护，纯策略层保证语义可单测。
