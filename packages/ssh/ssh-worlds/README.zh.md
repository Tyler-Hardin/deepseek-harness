# @deepseek-ai/dsh-ssh-worlds

[English](README.md) | 中文

[`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.zh.md) 执行世界服务的 SSH provider：ssh workspace place 解析为一个远程世界，其传输层是一个已连接的 [`@deepseek-ai/dsh-ssh`](../ssh/README.zh.md) 世界，其文件系统与 shell 后端是在其上组合的 `dsh-fs-ssh` 与 `dsh-bash-ssh` 实例。本地 place 会响亮拒绝——把本地 place 路由到本 provider 会对宿主目录尝试 ssh 连接。

作为插件加载；它注册 `ctx.worlds`。世界按目标引用计数：再次解析同一 ssh 目的地会返回就绪世界而不重连；断开连接会关闭传输层及其后端。

## 使用

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

## 行为

- **每个目标一个世界** — ssh place 解析为一个世界，按 `user@host:port` 引用计数；就绪世界被复用，已销毁世界会重连。
- **远程后端** — `world.fs()` / `world.shell()` 在首次使用时于传输层上组合 `SshFileSystem` 与 `SshBashExecutor`。解析时的 `path`（workspace 的远程工作路径）成为后端的默认 `cwd`；没有时使用传输层默认值。`world.ssh()` 直接暴露传输层，供传输专属动词（`exec`、`sftp`、`pty`）使用。
- **生命周期** — `disconnect(id)` 关闭传输层；组合销毁时销毁所有活跃世界。
- **响亮拒绝本地** — 解析本地 place（或无 place 的无会话解析，默认为本地）会抛出描述性错误。

## 模型体验

间接通过所组合 fs/shell 后端的消费者（`dsh-tool-fs`、`dsh-tool-bash`）；本 provider 不注册工具、不注入提示、不写会话事件。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

- **仅 SSH place** — 本地 place 需要本地 worlds provider；本 provider 响亮拒绝本地 place。
- **无会话绑定** — 解析按调用进行；连接/断开会话事件（`ssh/connect`、`ssh/disconnect`）与会话头世界冻结属于会话绑定阶段。
- **无端口 place 连接 22** — ssh 传输层默认值；无法针对进程内随机端口 fixture 测试。
