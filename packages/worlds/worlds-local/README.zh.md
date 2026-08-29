# @deepseek-ai/dsh-worlds-local

[English](README.md) | 中文

[`@deepseek-ai/dsh-worlds`](../worlds/README.zh.md) 执行世界服务的本地 provider：本地 workspace place 解析为单个本地世界，其文件系统与 shell 后端是在私有子上下文上组合的 `dsh-fs-local` 与 `dsh-bash-local` 实例。子上下文使后端服务注册不会与挂在父上下文上的路由冲突——路由实现 `ctx.fs`/`ctx.shell`，因此每世界的后端不能在同一个上下文上注册这些名字。

作为插件加载；它注册 `ctx.worlds`。非本地 place（ssh 目的地）会响亮拒绝：本 provider 不拥有传输层，把远程 place 路由到它会静默地对宿主文件系统运行远程路径。

## 使用

```ts
import type { Context } from '@deepseek-ai/cordis'
import { LocalWorlds } from '@deepseek-ai/dsh-worlds-local'

export function apply(ctx: Context): void {
  // registers `ctx.worlds`
  ctx.plugin(LocalWorlds, {
    fs: { cwd: '/srv/project' },
    shell: { cwd: '/srv/project' },
  })
}
```

| 选项 | 默认值 | 含义 |
|---|---|---|
| `fs` | `{}` | 文件系统后端设置（见 `dsh-fs-local`）；`diffBasisMaxBytes` 默认为 10 MiB |
| `shell` | `{}` | shell 后端设置（见 `dsh-bash-local`）；超时/spill/宽限默认值与该 provider 一致 |

## 行为

- **单个本地世界** — 所有本地 place 解析为同一个世界（按 id 引用计数）；`worlds()` 列出它；`disconnect(id)` 关闭它。
- **惰性后端** — `world.fs()` / `world.shell()` 在首次使用时于世界的私有子上下文上组合后端；`dispose()` 之后的访问会拒绝。
- **生命周期** — 组合销毁时销毁世界及其子上下文；直接 `dispose()` 幂等。
- **响亮拒绝远程** — 解析 ssh place 会抛出描述性错误，而不是在本地运行远程路径。

## 模型体验

间接通过本地后端的消费者（`dsh-tool-fs`、`dsh-tool-bash`）；本 provider 不注册工具、不注入提示、不写会话事件。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

- **仅本地 place** — ssh place 需要可感知传输层的 worlds provider（后续阶段的 ssh worlds provider）；本 provider 响亮拒绝远程 place。
- **每个组合一个本地世界** — 不同的本地 place 共享单个本地世界；不按 place 组合后端（它们会是相同的主机后端）。
