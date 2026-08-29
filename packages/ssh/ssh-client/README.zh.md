---
description: "ssh2 后端的 `ctx.ssh` 提供方：供连接远程执行世界的部署方，以及排查认证、配置解析与 known_hosts 行为的维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-client

[English](README.md) | 中文

## 概述

使用 `dsh-ssh-client` 可为组合提供可用的 SSH 连接：挂载一次，`ctx.ssh` 就为每个世界经任意跳数的 ProxyJump 链提供一条连接，先以 agent 再以你的密钥认证，绝不使用密码。`~/.ssh/config` 始终被读取，首次连接学习主机密钥，密钥变更则被拒绝；每个已连接世界暴露 exec 与 SFTP 通道供 fs 与 shell 适配器使用。部署需要从标准 `~/.ssh` 环境到达远程执行世界时选择它。

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

把提供方作为 `cordis.yml` 行挂载；它注册 `ctx.ssh`，接缝的消费方随后在真实 ssh 连接上打开世界。

### 何时选择

部署需要从标准 `~/.ssh` 环境到达远程执行世界时选择 `dsh-ssh-client`。需要接缝约定本身时选择 [`ssh`](../ssh/README.zh.md)，工作区 place 必须解析为这些世界时选择 [`ssh-worlds`](../ssh-worlds/README.zh.md)。

### 最小配置

所有字段都是可选的：`static Config` 提供默认值，生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-ssh-client)完整列出每个字段。

```yaml
- id: ssh-client
  name: '@deepseek-ai/dsh-ssh-client'
  config:
    # knownHostsPath: ~/.ssh/known_hosts   # known_hosts file for TOFU/strict checks
    # configPath: ~/.ssh/config            # ssh config file for alias resolution
    # homeDir: (os homedir)                # home directory for defaults
    # timeoutMs: 15000                     # default connect handshake timeout
    # strictHostKey: false                 # require a pre-existing known_hosts entry
    # defaultMaxOutputBytes: 64000         # combined exec capture ceiling
```

未识别的键在插件构造时失败。`timeoutMs` 与 `defaultMaxOutputBytes` 必须是正有限数。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释提供方如何实现该接缝，并指出实现它的代码位置；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 行为

- **默认可用的认证：先 agent 后密钥**——设置了 `SSH_AUTH_SOCK` 时先试 agent；然后试 `~/.ssh/config` 的 `IdentityFile`；再试默认密钥（`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`）。密钥文件必须仅属主可读（`0600`；组/全局可读的密钥被拒绝并附说明），需要口令或格式损坏的密钥被跳过并附可操作说明。**任何位置都不存在密码路径**——没有可用方法时连接响亮失败，精确列出尝试过什么。agent 套接字在进程内联系；我们不写入任何 agent 状态。
- **`~/.ssh/config` 始终被读取**——在覆盖范围内，别名、`HostName`、`User`、`Port`、`IdentityFile` 与逗号分隔的 `ProxyJump` 链与系统 `ssh` 解析一致；`Match exec` 永不求值（不可信配置文本不得执行代码）。
- **known_hosts TOFU**——首次连接学习主机密钥（尽力追加到 `known_hosts`）；密钥变更以 `SSH_HOST_KEY_CHANGED` 拒绝连接；`strictHostKey: true` 以 `SSH_UNKNOWN_HOST` 拒绝未知主机。
- **ProxyJump**——每跳一条 ssh 连接，每跳把 `direct-tcpip` 转发到下一跳（或最终主机）；跳板用与目标相同的方法认证。跳板失败映射到接缝词汇。
- **Exec**——每条命令一个通道，带调用方超时/取消、有界合并捕获，以及退出码/超时/中止事实。调用方发起的超时或中止会立即以已捕获输出结算（远程可能永远持有通道）。
- **SFTP**——`sftp()` 返回品牌化句柄，其会话由后续 `fs-ssh` 适配器消费。
- **Disposal**——`disconnect`/服务拆除会结束连接与每一跳；双重 dispose 是空操作。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从提供方走向它实现的接缝与它所服务的消费方。

- [SSH 子系统](../../../docs/subsystems/ssh.zh.md)——穷尽式传输约定、目标解析与 known_hosts 策略。
- [ssh](../ssh/README.zh.md)——本提供方实现的 Service Definition。
- [ssh-worlds](../ssh-worlds/README.zh.md)——在本传输层上把 ssh place 解析为远程世界的 worlds 提供方。
- [fs-ssh](../../fs/fs-ssh/README.zh.md)——消费 SFTP 句柄的文件系统后端。
- [bash-ssh](../../shell/bash-ssh/README.zh.md)——消费 `exec` 的 shell 执行器。
- [SSH 能力接缝提案](../../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.zh.md)——Service Definition 与其提供方为何拆分。

-----

<a id="model-experience"></a>
## 模型体验

不直接产生模型可见内容：本提供方只实现传输约定；消费它的 fs 与 shell 适配器及其工具负责已捕获输出、退出码以及超时或中止事实的一切模型可见呈现。

#### KV Cache 影响

无直接失效；命名消费者拥有各自的请求前缀变更。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制说明本提供方何时需要特别的运维注意，或何时不合适。它们是当前包约束，不是通用 SSH 对比或任务积压。

- **冷门配置与系统 ssh 不对等**——`Include`、`ControlMaster`、`Match exec` 以及 `%d`/`%u`/`%h` 之外的 `%` token 不被支持；此类配置要么响亮失败要么被忽略，绝不静默误用。
- **按决策不支持密码认证**——无 agent 且密钥需要口令时响亮失败；不存在密码的 credentials 集成。
- **TOFU 写入尽力而为**——只读或不可写的 `known_hosts` 仍允许连接继续（条目仅在会话内驻留内存）；下次连接会重新学习。
- **Windows agent 支持未经测试**——`SSH_AUTH_SOCK` 是 POSIX；底层库支持 Pageant，但此处尚无覆盖。
- **无重连**——连接断开即关闭世界；重连策略由调用方负责。
- **SFTP 句柄会话不透明**——由 `fs-ssh` 适配器在后续阶段固定。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。live-world 注册表是提供方的私有状态，没有可供检查比对的独立事件流；能赋予它可观察关系的 `ssh/connect` 与 `ssh/disconnect` 会话事件将随 workspace/session 绑定阶段一同到来。
