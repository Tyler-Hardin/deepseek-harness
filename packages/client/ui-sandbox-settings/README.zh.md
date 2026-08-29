---
description: "dsh Web 客户端 General 设置中的沙箱额外可写根目录行：增删 `workspace-write` 可在会话工作区与临时目录之外修改的宿主本地根目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-sandbox-settings

[English](README.md) | 中文

## 概述

General 设置中的沙箱额外可写根目录行让用户扩展 `workspace-write` 可在会话工作区与临时目录之外修改的范围。该行读取显式暴露的 `sandbox` 设置描述符，展示解析后的根目录列表，并以描述符修订号写入一次整体列表替换，因此添加或移除绝不会与并发编辑合并。它在发送前镜像宿主 schema 的拼写规则，并把服务端拒绝以内联方式呈现。宿主仍是权威，远程执行世界永远不会收到这些根目录。

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

该行读取显式暴露的 `sandbox` 设置描述符，从其解析值派生当前根目录列表，并以描述符修订号写入一次整体列表的 `settings.mutate` 路径操作（`extraWritableRoots`），因此添加或移除都是整体替换而非合并。该行在发送前镜像宿主 schema 的拼写规则（绝对路径或 `~/` 前缀），并把服务端拒绝以内联告警呈现；宿主仍是权威。工作区与临时目录之外的根目录（`~/.cache` 之类）会成为每个本地能力无需批准提示即可写入的常驻 `workspace-write` 授权；远程执行世界永远不会收到它们。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`/client` 导出为插件主体（`apply`／`inject`）。其可观察状态经由 slot 系统的 `hooks` 隔离区承载，渲染器负责 React hook 绑定；推送失效会重新获取描述符。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖该行注册进的设置界面，以及拥有可写根目录列表的策略。

- [ui-settings](../ui-settings/README.zh.md)——该行读取并注册进的设置作用域与 slot 约定。
- [ui-settings-general](../ui-settings-general/README.zh.md)——承载该行的 General 分区。
- [sandbox-policy](../../sandbox/sandbox-policy/README.zh.md)——`sandbox` 设置命名空间，以及应用这些根目录的策略。
- [沙箱子系统](../../../docs/subsystems/sandbox.zh.md)——列表背后的模式围栏与可写根目录模型。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过该行写入的沙箱策略事实：存储的 `sandbox.extraWritableRoots` 列表会加宽后续 `ctx.sandboxPolicy.resolve()` 调用中 `workspace-write` 的 allow-list，因此当列表非空时，模型的 `sandbox:policy` 上下文会多出 `Additional configured writable roots: [...]` 一句。该行自身不注册任何模型面内容；它编辑的策略拥有全部模型可见效果。

#### KV Cache 影响

不会直接使 KV Cache 失效；请求前缀变更由策略上下文消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明该行无法到达的范围，以及它在并发编辑下的行为；它们是当前的包约束。

- **设置行仅限 Web**——非 Web 客户端仍可通过 `sandbox` 设置文档配置列表，但不会收到这一浏览器贡献。
- **仅支持整体列表编辑**——该行始终写入完整的替换列表；来自其他表面的并发编辑会被该行的最后一次写入覆盖。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。槽位贡献的生命周期由 HMR 安全性规格证明，而仅存在于浏览器侧的设置控制器不持有宿主事件或跨插件可变状态。
