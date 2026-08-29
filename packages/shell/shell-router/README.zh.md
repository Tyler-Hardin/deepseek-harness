# @deepseek-ai/dsh-shell-router

[English](README.md) | 中文

Shell 路由 provider：实现 `ctx.shell` seam，并把每次调用分发到调用方所指名的世界的 shell 执行器。`resolve` 是 seam 的同步默认化步骤，因此它自行执行默认化（与本地执行器应用的默认值相同），并把调用方的不透明执行世界标识（`request.world`）写入 spec；`run` 与 `start` 随后经 [`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.zh.md) 解析该世界的执行器并委托。没有世界标识的调用路由到本地世界。

纯本地部署从不挂载本 provider：默认组合保持直接本地执行器。本路由是面向混合本地/远程组合的可选基础设施。

## 使用

```ts
import type { Context } from '@deepseek-ai/cordis'
import { ShellRouter } from '@deepseek-ai/dsh-shell-router'

export function apply(ctx: Context): void {
  // registers `ctx.shell` (requires `ctx.worlds`)
  ctx.plugin(ShellRouter)
}
```

## 行为

- **路由自有默认化** — `resolve(request)` 将 `timeoutMs` 限制在 `[120_000, 600_000]`，将 `stdoutMaxBytes` 默认为 `64_000`，以进程 cwd 填充 `workdir`，并把调用方的 `world` 写入 spec。非法提示值会响亮地拒绝。
- **世界分发** — `run` 通过 `ctx.worlds` 解析 spec 的世界（缺省时为本地世界），并委托给该世界的执行器；指名了不存在活动的世界的 id 会响亮地拒绝。
- **同步 start** — `start` 是 seam 的同步入口，因此它读取先前 `run`（或经 `ctx.worlds` 解析的世界）填充的世界→执行器缓存；在本进程中从未解析过的世界会响亮地拒绝。
- **完整 seam 委托** — 被路由执行器的 `run` / `start` 语义不变地生效，包括后台进程与输出上限。

## 模型体验

间接，经 `dsh-tool-bash` 渲染被路由执行器的输出；本 provider 自身不注册任何工具或提示。

#### KV 缓存影响

无直接失效；具名 consumer 拥有任何请求前缀变更。

## 已知限制与延期工作

- **纯本地部署不应挂载它** — 路由增加一次分发跳转；默认组合保持直接本地执行器，行为零变化。
- **`start` 需要先前已解析** — 后台进程需要一个路由在本进程中已经见过的世界；从未解析过的世界 id 会响亮地拒绝，而不是按需连接。
