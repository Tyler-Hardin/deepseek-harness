# ssh/ — SSH 传输族

[English](README.md) | 中文

远程执行世界的 SSH 传输接缝：每个世界一条连接，agent-后-密钥认证，`~/.ssh/config` 解析（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），known_hosts TOFU 且密钥变更拒绝，以及 exec 与 SFTP 通道。本族实现 Service Definition/提供方拆分；工作区/会话绑定、世界路由与 `fs-ssh`/`bash-ssh` 适配器是消费它的后续阶段（[执行世界与 SSH 工作区提案](../../.agents/notes/proposed/architecture/2026-08-21-execution-worlds-and-ssh-workspaces.zh.md)、[SSH 能力接缝提案](../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.zh.md)）。

| 包 | ctx 键 | 角色 |
| --- | --- | --- |
| [`ssh`](ssh/README.zh.md)（`@deepseek-ai/dsh-ssh`） | `ctx.ssh` | Service Definition：世界描述符 + 生命周期 + 通道动词 + 纯配置/known_hosts/认证顺序策略 |
| [`ssh-client`](ssh-client/README.zh.md)（`@deepseek-ai/dsh-ssh-client`） | 注册 `ctx.ssh` | ssh2 后端提供方：仅 agent/密钥认证、ProxyJump 跳板、TOFU、exec + SFTP |
| [`ssh-worlds`](ssh-worlds/README.zh.md)（`@deepseek-ai/dsh-ssh-worlds`） | 注册 `ctx.worlds` | 执行世界提供方：ssh place 到带 fs-ssh/bash-ssh 后端的远程世界 |

密码认证在整个族中刻意缺席：仅 agent 与密钥，在标准 `~/.ssh` 环境下默认可用。主机即信任边界；本传输不与任何本地沙箱组合（[沙箱接缝决策](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)把远程执行器排除在本地隔离之外）。
