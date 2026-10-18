---
description: "Web 客户端 Plugins 设置中的沙箱策略页面：workspace-write 在会话工作区与临时区域之外可用的额外可写根目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-sandbox

[English](README.md) | 中文

## 概述

本包为 Web 客户端的 Plugins 设置新增一个页面：workspace-write 的额外可写根目录。加载它不注册任何宿主行为；浏览器半边在宿主提供 `sandbox-policy` 条目期间，把该页面注册进 Plugins 页面的 `plugins.item` 槽位，因此没有组合策略服务的部署看不到它的任何痕迹。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发者注记](#dev-note)

---

<a id="use-this-package"></a>
## 使用本包

在 Web profile 中把它与 `@deepseek-ai/dsh-sandbox-policy` 及其他官方设置页一起组合。策略条目被提供后（要求其 `extraWritableRoots` 字段为 volatile），页面会以 **沙箱** 出现在 **设置 → 插件** 中。一个以逗号分隔的字段呈现并写入该列表；保存会通过共享配置表单写入该条目的用户层，恢复默认则让该字段重新继承部署的组合层。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

控制器在 `ctx.configForms` 之上暂存草稿，并把草稿文本解析为存储的 `string[]`：每个条目都必须是绝对路径或以 `~/` 开头（与宿主 schema 一致），因为宿主会拒绝的草稿应当在保存前拦截，而不是发到线上。空草稿会清除该字段，恢复组合层。写入是一次带修订号围栏的路径操作，因此并发的文档变更会拒绝保存而不是覆盖它。

</details>

---

<a id="further-exploration"></a>
## 进一步探索

- [沙箱子系统](../../../docs/subsystems/sandbox.zh.md)——策略服务、模式词汇表，以及该列表如何到达强制执行层。
- [Plugins 设置页](./src/client/index.ts)——本页遵循的 `whileServed` 注册。

---

<a id="model-experience"></a>
## 模型体验

本包不直接产生模型体验。配置的根目录只通过策略服务贡献的 `sandbox:policy` 上下文语句到达模型，该语句列出常驻授权。

#### KV 缓存影响

本插件不贡献任何请求前缀内容。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>
- 该字段是一行逗号分隔文本，因此路径本身含逗号时无法在此配置（宿主仍接受通过 profile patch 设置它）。
- 本页只编辑 `extraWritableRoots`；该条目的 `mode` 与 `workspaceRoot` 仍属 profile 配置。
- 远端执行环境永远不会收到该列表，这是策略的性质，而非本页的性质。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作背景——点击展开</summary>

本包不发布不变式伴随模块：本页不拥有任何独立观察者可能产生分歧的状态关系，且共享表单已对修订号加了围栏。`SettingsFormModel` 提供暂存、覆盖徽标与保存生命周期，因此本包不携带自定义表单机制。

</details>
