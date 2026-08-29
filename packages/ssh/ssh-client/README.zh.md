# @deepseek-ai/dsh-ssh-client

[English](README.md) | 中文

[`@deepseek-ai/dsh-ssh`](../ssh/README.zh.md) 传输接缝的 ssh2 后端 Service Provider：每个世界一条连接（经任意跳数的 ProxyJump 链），仅 agent-后-密钥认证，known_hosts TOFU 且密钥变更拒绝，以及供后续 fs/shell 适配器使用的 exec 与 SFTP 通道。主机/配置/认证策略位于 Service Definition 的纯策略层；本包只负责连接机制。

## Config

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

## Behavior

- **默认可用的认证：先 agent 后密钥**——设置了 `SSH_AUTH_SOCK` 时先试 agent；然后试 `~/.ssh/config` 的 `IdentityFile`；再试默认密钥（`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`）。密钥文件必须仅属主可读（`0600`；组/全局可读的密钥被拒绝并附说明），需要口令或格式损坏的密钥被跳过并附可操作说明。**任何位置都不存在密码路径**——没有可用方法时连接响亮失败，精确列出尝试过什么。agent 套接字在进程内联系；我们不写入任何 agent 状态。
- **`~/.ssh/config` 始终被读取**——在覆盖范围内，别名、`HostName`、`User`、`Port`、`IdentityFile` 与逗号分隔的 `ProxyJump` 链与系统 `ssh` 解析一致；`Match exec` 永不求值（不可信配置文本不得执行代码）。
- **known_hosts TOFU**——首次连接学习主机密钥（尽力追加到 `known_hosts`）；密钥变更以 `SSH_HOST_KEY_CHANGED` 拒绝连接；`strictHostKey: true` 以 `SSH_UNKNOWN_HOST` 拒绝未知主机。
- **ProxyJump**——每跳一条 ssh 连接，每跳把 `direct-tcpip` 转发到下一跳（或最终主机）；跳板用与目标相同的方法认证。跳板失败映射到接缝词汇。
- **Exec**——每条命令一个通道，带调用方超时/取消、有界合并捕获，以及退出码/超时/中止事实。调用方发起的超时或中止会立即以已捕获输出结算（远程可能永远持有通道）。
- **SFTP**——`sftp()` 返回品牌化句柄，其会话由后续 `fs-ssh` 适配器消费。
- **Disposal**——`disconnect`/服务拆除会结束连接与每一跳；双重 dispose 是空操作。

## Model Experience

间接——经由未来的 `fs-ssh`/`bash-ssh` 适配器及其消费者；提供方不注册任何提示词、schema 或结果。

#### KV Cache effect

无直接失效；命名消费者拥有各自的请求前缀变更。

## Known Limitations and Deferred Work

- **冷门配置与系统 ssh 不对等**——`Include`、`ControlMaster`、`Match exec` 以及 `%d`/`%u`/`%h` 之外的 `%` token 不被支持；此类配置要么响亮失败要么被忽略，绝不静默误用。
- **按决策不支持密码认证**——无 agent 且密钥需要口令时响亮失败；不存在密码的 credentials 集成。
- **TOFU 写入尽力而为**——只读或不可写的 `known_hosts` 仍允许连接继续（条目仅在会话内驻留内存）；下次连接会重新学习。
- **Windows agent 支持未经测试**——`SSH_AUTH_SOCK` 是 POSIX；底层库支持 Pageant，但此处尚无覆盖。
- **无重连**——连接断开即关闭世界；重连策略由调用方负责。
- **SFTP 句柄会话不透明**——由 `fs-ssh` 适配器在后续阶段固定。
