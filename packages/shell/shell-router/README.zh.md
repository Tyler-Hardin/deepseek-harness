---
description: "`ctx.shell` 的执行世界路由：面向组合本地与远程 shell 执行器的部署方与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-shell-router

[English](README.md) | 中文

## 概述

当同一组合需要在多个执行世界中运行命令时，使用 `dsh-shell-router`。它实现 `ctx.shell` seam：`resolve` 执行 seam 的同步默认化（与本地执行器应用的默认值相同），并把调用方的不透明世界标识写入 spec；`run` 与 `start` 经 `dsh-worlds` 解析该世界的执行器并委托。没有世界标识的调用路由到本地世界。纯本地部署保持直接本地执行器；仅在混合本地/远程组合中挂载本路由。

## 目录

- [使用](#usage)
- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="usage"></a>
## 使用

```ts
import type { Context } from '@deepseek-ai/cordis'
import { ShellRouter } from '@deepseek-ai/dsh-shell-router'

export function apply(ctx: Context): void {
  // registers `ctx.shell` (requires `ctx.worlds`)
  ctx.plugin(ShellRouter)
}
```

-----

<a id="behavior"></a>
## 行为

- **路由自有默认化** — `resolve(request)` 将 `timeoutMs` 限制在 `[120_000, 600_000]`，将 `stdoutMaxBytes` 默认为 `64_000`，以进程 cwd 填充 `workdir`，并把调用方的 `world` 写入 spec。非法提示值会响亮地拒绝。
- **世界分发** — `run` 通过 `ctx.worlds` 解析 spec 的世界（缺省时为本地世界），并委托给该世界的执行器；指名了不存在活动的世界的 id 会响亮地拒绝。
- **同步 start** — `start` 是 seam 的同步入口，因此它读取先前 `run`（或经 `ctx.worlds` 解析的世界）填充的世界→执行器缓存；在本进程中从未解析过的世界会响亮地拒绝。
- **完整 seam 委托** — 被路由执行器的 `run` / `start` 语义不变地生效，包括后台进程与输出上限。

-----

<a id="model-experience"></a>
## 模型体验

### 被路由执行器的结果

#### 模型看到什么

本 provider 自身不贡献任何内容。`dsh-tool-bash` 按被路由执行器的原样渲染其输出；本 provider 不注册工具、提示或结果文本。

#### Token 影响

被路由的调用只消耗被路由执行器自身结果所产生的 token；路由不添加任何自身文本。

#### KV Cache 影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **纯本地部署不应挂载它** — 路由增加一次分发跳转；默认组合保持直接本地执行器，行为零变化。
- **`start` 需要先前已解析** — 后台进程需要一个路由在本进程中已经见过的世界；从未解析过的世界 id 会响亮地拒绝，而不是按需连接。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。路由器把每次调用转发给世界自身的执行器，由后者承载 shell 检查；它唯一拥有的状态是世界缓存，其生命周期镜像 worlds 服务。
