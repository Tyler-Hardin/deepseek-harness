# worlds/ — 执行世界能力家族

[English](README.md) | 中文

执行世界家族：一个世界就是一个连贯的执行环境——本地目录树，或经传输层到达的远端主机——并在其上组合每世界的文件系统与 shell 后端。远程性是 workspace 定义的一个属性：workspace 的 `place`（来自 [`workspace/`](../workspace/README.zh.md)）说明它是本地还是 ssh 目的地，本家族把 place 变成世界，供路由 provider 分发 seam 调用。

| 包 | 职责 | ctx key |
|---|---|---|
| [`worlds/`](worlds/README.zh.md) | 执行世界 Service Definition：`World`/`Worlds` 契约、`WorldId`、place→kind 策略 | `ctx.worlds`（由 provider 挂载） |

纯本地部署从不挂载路由，因此本家族是面向混合本地/远程组合的可选基础设施——默认组合保持不变。
