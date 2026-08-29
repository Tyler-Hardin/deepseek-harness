---
description: "SSH 传输包组：`ctx.ssh` Service Definition、其 ssh2 提供方，以及把会话工作放到远程主机的执行世界提供方。"
kind: "package-group"
---

# ssh/ — SSH 传输族

[English](README.md) | 中文

## 概述

`ssh/` 族把工作区连接到远程执行世界：每个世界一条连接，采用 agent-后-密钥认证，解析 `~/.ssh/config`（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），known_hosts TOFU 且密钥变更拒绝，并提供 exec 与 SFTP 通道。`ssh/` 拥有 `ctx.ssh` 约定，`ssh-client/` 提供 ssh2 提供方，`ssh-worlds/` 提供把二者组合起来的 `ctx.worlds` 提供方。当工作必须运行在已经信任你的 `~/.ssh` 配置的主机上时选择它：主机即信任边界，因此本传输不与任何本地沙箱组合，也不提供密码路径。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

三个包承担 SSH 传输角色；子系统参考文档完整收录各项约定。

| 包 | ctx 键 | 角色 |
|---|---|---|
| [`ssh`](ssh/README.zh.md)（`@deepseek-ai/dsh-ssh`） | `ctx.ssh` | Service Definition：世界描述符 + 生命周期 + 通道动词 + 纯配置/known_hosts/认证顺序策略 |
| [`ssh-client`](ssh-client/README.zh.md)（`@deepseek-ai/dsh-ssh-client`） | 注册 `ctx.ssh` | ssh2 后端提供方：仅 agent/密钥认证、ProxyJump 跳板、TOFU、exec + SFTP |
| [`ssh-worlds`](ssh-worlds/README.zh.md)（`@deepseek-ai/dsh-ssh-worlds`） | 注册 `ctx.worlds` | 执行世界提供方：ssh place 到带 fs-ssh/bash-ssh 后端的远程世界 |

密码认证在整个族中刻意缺席：仅 agent 与密钥，在标准 `~/.ssh` 环境下默认可用。主机即信任边界；本传输不与任何本地沙箱组合（[沙箱接缝决策](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)把远程执行器排除在本地隔离之外）。

<a id="related-documentation"></a>
## 相关文档

先从子系统参考文档了解传输词汇，再看塑造该家族的设计决策。

- [SSH 子系统](../../docs/subsystems/ssh.zh.md)——目标解析、认证顺序、known_hosts 策略与连接生命周期。
- [执行世界与 SSH 工作区提案](../../.agents/notes/proposed/architecture/2026-08-21-execution-worlds-and-ssh-workspaces.zh.md)——ssh place 如何成为一个远程执行世界。
- [SSH 能力接缝提案](../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.zh.md)——Service Definition 与其提供方为何拆分。
- [沙箱接缝决策](../../.agents/notes/implemented/feature/2026-07-06-sandbox.zh.md)——远程执行器为何保持在本地隔离之外。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
