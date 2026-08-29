# @deepseek-ai/dsh-fs-router

[English](README.md) | 中文

文件系统路由 provider：实现 `ctx.fs` seam，并把每次调用分发到调用方所指名的世界的文件系统后端。`resolve` 读取调用方的不透明执行世界标识（`opts.world`），经 [`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.zh.md) 解析该世界的后端，并用世界 id 前缀目标键，使后续每次操作无需重新解析即可路由。没有世界标识的调用路由到本地世界。

纯本地部署从不挂载本 provider：默认组合保持直接本地后端。本路由是面向混合本地/远程组合的可选基础设施。

## 使用

```ts
import type { Context } from '@deepseek-ai/cordis'
import { FsRouter } from '@deepseek-ai/dsh-fs-router'

export function apply(ctx: Context): void {
  // registers `ctx.fs` (requires `ctx.worlds`)
  ctx.plugin(FsRouter)
}
```

## 行为

- **世界前缀目标键** — `resolve(path, { world })` 解析所指名世界的后端，并返回键为 `world:<id>:<backendKey>` 的目标；该目标的每次操作都路由到同一世界，无需重新解析。
- **本地默认** — 不带 `world` 的调用路由到本地世界；工具层按会话解析 `world(session)` 并传入。
- **同步身份辅助** — `processPath` / `fileUrl` / `contains` 通过读取 `resolve()` 填充的世界→后端缓存保持同步；在此从未解析过的世界的目标会响亮拒绝，跨世界包含永远为 false。
- **完整 seam 委托** — `stat`、`readText`、`streamText`、`readBytes`、`listDir`、`writeText`、`editText` 与 `lstat` 以 seam 的确切语义委托给被路由世界的后端。

## 模型体验

间接通过 `dsh-tool-fs`，它渲染被路由后端的输出；本 provider 自身不注册工具或提示。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

- **纯本地部署不应挂载它** — 路由会引入一次分发跳转；默认组合保持直接本地后端以实现零行为变化。
- **世界 id 必须先解析再使用** — 目标键所指名的世界必须已在本进程中解析；外来 id 会响亮拒绝而不是猜测。
- **`lstat` 是路径形态的，路由到本地世界** — seam 的 lstat 不携带世界标识；路径在调用方（本地）世界中解释。
