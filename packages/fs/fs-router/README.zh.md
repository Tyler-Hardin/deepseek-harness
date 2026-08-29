---
description: "`ctx.fs` 的执行世界路由：面向组合本地与远程文件系统后端的部署方与维护者。"
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-router

[English](README.md) | 中文

## 概述

当同一组合需要服务多个执行世界的文件时，使用 `dsh-fs-router`。它实现 `ctx.fs` seam，并把每次调用分发到调用方所指名世界的后端：`resolve` 读取调用方的不透明执行世界标识，经 `dsh-worlds` 解析该世界，并用世界 id 前缀目标键，使后续每次操作无需重新解析即可路由。没有世界标识的调用路由到本地世界。纯本地部署保持直接本地后端；仅在混合本地/远程组合中挂载本路由。

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
import { FsRouter } from '@deepseek-ai/dsh-fs-router'

export function apply(ctx: Context): void {
  // registers `ctx.fs` (requires `ctx.worlds`)
  ctx.plugin(FsRouter)
}
```

-----

<a id="behavior"></a>
## 行为

- **世界前缀目标键** — `resolve(path, { world })` 解析所指名世界的后端，并返回键为 `world:<id>:<backendKey>` 的目标；该目标的每次操作都路由到同一世界，无需重新解析。
- **本地默认** — 不带 `world` 的调用路由到本地世界；工具层按会话解析 `world(session)` 并传入。
- **同步身份辅助** — `processPath` / `fileUrl` / `contains` 通过读取 `resolve()` 填充的世界→后端缓存保持同步；在此从未解析过的世界的目标会响亮拒绝，跨世界包含永远为 false。
- **完整 seam 委托** — `stat`、`readText`、`streamText`、`readBytes`、`listDir`、`writeText`、`editText` 与 `lstat` 以 seam 的确切语义委托给被路由世界的后端。

-----

<a id="model-experience"></a>
## 模型体验

### 被路由后端的结果

#### 模型看到什么

本 provider 自身不贡献任何内容。`dsh-tool-fs` 按被路由后端的原样渲染其文件内容、目录列表、变更确认与错误消息；本 provider 不注册工具、提示或结果文本。

#### Token 影响

被路由的调用只消耗被路由后端自身结果所产生的 token；路由不添加任何自身文本。

#### KV Cache 影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **纯本地部署不应挂载它** — 路由会引入一次分发跳转；默认组合保持直接本地后端以实现零行为变化。
- **世界 id 必须先解析再使用** — 目标键所指名的世界必须已在本进程中解析；外来 id 会响亮拒绝而不是猜测。
- **`lstat` 是路径形态的，路由到本地世界** — seam 的 lstat 不携带世界标识；路径在调用方（本地）世界中解释。

-----

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。路由器把每次调用转发给世界自身的后端，由后者承载文件系统检查；它唯一拥有的状态是世界缓存，其生命周期镜像 worlds 服务。
