---
description: "执行世界包组：`ctx.worlds` Service Definition 与本地世界 provider，面向选择或浏览该家族的读者。"
kind: "package-group"
---

# worlds/ — 执行世界能力家族

[English](README.md) | 中文

## 概述

在多个执行环境中运行 agent（智能体）。`worlds/` 把 workspace place 解析为世界——本地目录树，或经传输层到达的远端主机——管理该世界的生命周期，并暴露其文件系统与 shell 后端，供路由 provider 按世界分发能力调用；`worlds-local/` 用宿主环境服务每个本地 place。需要混合本地/远程的组合应选择本家族。纯本地部署不挂载路由，默认组合保持不变。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

一个世界就是一个连贯的执行环境——本地目录树，或经传输层到达的远端主机——并在其上组合每世界的文件系统与 shell 后端。远程性是 workspace 定义的一个属性：workspace 的 `place`（来自 [`workspace/`](../workspace/README.zh.md)）说明它是本地还是 ssh 目的地，本家族把 place 变成世界，供路由 provider 分发 seam 调用。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`worlds/`](worlds/README.zh.md) | 执行世界 Service Definition：`World`/`Worlds` 契约、`WorldId`、place→kind 策略 | `ctx.worlds`（由 provider 挂载） |
| [`worlds-local/`](worlds-local/README.zh.md) | 本地 provider：每个本地 place 解析为单个宿主世界，基于 `dsh-fs-local` 与 `dsh-bash-local` | 注册 `ctx.worlds` |

<a id="related-documentation"></a>
## 相关文档

先从子系统参考文档了解共享词汇，再看提供 place、传输层与路由消费方的相邻归属方。

- [执行世界子系统](../../docs/subsystems/worlds.zh.md)——世界、place、kind 与世界的生命周期。
- [Workspace 子系统](../../docs/subsystems/workspace.zh.md)——世界解析所用的 `place`。
- [ssh 子系统](../../docs/subsystems/ssh.zh.md)——远程世界运行的传输层。
- [可移植执行世界消费方决策](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)——世界为何是其每 seam 后端的组合根。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
