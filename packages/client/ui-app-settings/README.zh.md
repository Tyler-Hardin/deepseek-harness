---
description: "原生 dsh 客户端内 dsh Web 客户端的 App 设置页：服务器主机名、mTLS 客户端证书、诊断，以及后台任务通知开关。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-app-settings

[English](README.md) | 中文

## 概述

浏览器设置中的 App 页面显示原生客户端的服务器主机名、mTLS 客户端证书和诊断。插件注册一个本地化的 `settings.section` 贡献（id 为 `app`，order 为 `100`），其词典由本包拥有，并以桥接回调而非宿主 RPC 注入。注册以 `window.DshApp` 为条件，因此桌面浏览器完全不会出现该分节。后台任务通知块在原生构建暴露监控桥时可切换原生任务完成监控器。保存新主机名会在新服务器上重新加载页面；桥读取失败时显示可见告警，而不是让页面崩溃。

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

dsh Web UI 的 **App** 设置页：服务器主机名、mTLS 客户端证书和诊断，仅在页面运行于原生 dsh 客户端内时注册。浏览器插件注册一个 id 为 `app`、order 为 `100` 的本地化 `settings.section` 贡献；设置外壳拥有导航入口和页面框架。注册以 `window.DshApp` 为条件：桌面浏览器中插件的 `apply` 直接返回、不注册任何内容，因此该页面只出现在应用的 WebView 中。

页面的一切读写都通过桥完成——没有宿主 RPC，也不占用设置文档键。主机名字段由 `getServerUrl()` 预填，通过 `setServerUrl()` 保存，之后原生应用会在新服务器上重新加载页面。证书行显示记住的别名（或"未选择"状态），可随时忘记；下次连接时系统会重新弹出证书选择器。诊断块显示应用的事件环形缓冲和磁盘崩溃日志，每个块都有清除按钮，另有刷新按钮重新读取整个表面。桥读取失败时会显示可见告警，而不是让页面崩溃。

**后台任务通知**块用于切换原生任务完成监控器（`getMonitoringEnabled()` / `setMonitoringEnabled()`）。该块只在原生构建暴露监控桥时渲染——旧版应用构建会静默省略它，因此版本错位永远不会破坏页面其余部分。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

桥是平台无关的契约：未来的 iOS 或其他客户端实现相同的 `window.DshApp` 表面后，本页面无需改动即可工作。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖该分节注册进的设置界面，以及其背后的 slot 组合。

- [ui-settings-general](../ui-settings-general/README.zh.md)——导航中承载 App 分节的设置外壳。
- [ui-settings](../ui-settings/README.zh.md)——页面背后的 `settings.section` slot 类型与作用域约定。
- [Slots 子系统](../../../docs/subsystems/slots.zh.md)——浏览器插件如何把自己的界面贡献到其他插件声明的 slot。

-----

<a id="model-experience"></a>
## 模型体验

无——本包只在浏览器设置中渲染原生应用状态，不注册任何模型面内容。它不改变任何提示词、工具 schema、请求或会话事件。

#### KV Cache 影响

无；本包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明该页面无法渲染的情形；它们是当前的包约束。

- **仅限应用内**——服务器不可达时页面无法渲染（没有 Web UI 承载它）；原生首次启动页和错误页的"更换服务器"按钮覆盖离线路径。
- **单向主机名变更**——保存新主机名会在新服务器上重新加载整个页面并关闭设置面板；没有页内成功状态。
- **通知权限**——Android 13+ 需要运行时 `POST_NOTIFICATIONS` 授权；未授权时开启后台任务通知会触发原生权限请求，拒绝会在诊断中可见，而不会留下一个无声死亡的监控器。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。App 设置页是只读的 UI 贡献，其 section 注册由 effect 拥有；该插件不发出 Cordis 事件，也不持有跨插件的可变状态。
