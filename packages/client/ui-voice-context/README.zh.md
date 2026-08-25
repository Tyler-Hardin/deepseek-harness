---
description: "dsh Web 客户端的 Voice-Context Web 界面：转写语音的输入框麦克风按钮，以及在云端 API 与本地模型之间选择的设置页。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-voice-context

[English](README.md) | 中文

## 概述

Voice-Context Web 界面在输入框工具行中添加一个麦克风按钮（order 100），它会录制一段语音，编码为 16 kHz 单声道 16-bit PCM WAV，经 Remote `voiceContext` 服务转写，并把文本追加到输入框草稿。其 `settings.section` 页面（order 40）负责首次配置，在云端 API 与本地 SenseVoiceSmall 或 faster-whisper 各尺寸之间选择，且只在浏览器 local storage 中保存受控的后端与模型组合——URL 不可由浏览器配置。云端 API Key 经凭据域写入，且从不回读。

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

浏览器侧在 `conversation.input.left` 输入框工具行中提供一个麦克风按钮（order 100）：录音后编码为 base64，经 `ctx.remote.voiceContext.transcribe(...)` 转写，再通过 `inputActions.setDraft` 把文本追加到草稿。录音经 MediaRecorder 采集，再解码并重编码为 16 kHz 单声道 16-bit PCM WAV，使所有 ASR 后端都能接受该容器。

一个 `settings.section` 页面（order 40）提供首次配置，可在云端 API、本地 SenseVoiceSmall 与 faster-whisper `small`、`medium`、`large-v3` 之间选择。受控的后端/模型组合保存在浏览器 local storage，浏览器不能配置 URL。云端 API Key 通过 `credentials.set` 以 `SILICONFLOW_API_KEY` 为引用写入；页面只读取「已配置/可写」 状态，从不读取值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器侧注入 `slots`、`locale`、`remote`、`remote.credentials` 与 `remote.voiceContext`。两个贡献都经 `slots.inject` 注册——麦克风按钮注册到 `conversation.input.left`，页面注册到 `settings.section`——因此各自跟随其声明 slot 的生命周期。两处文案取自此处注册的 `voice-context` 词典，识别语言提示同样跟随当前语言。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖本界面调用的服务、它注册进的 slot，以及页面背后的约定。

- [voice-context](../../voice/voice-context/README.zh.md)——本界面调用的 Remote 转写服务。
- [voice 组](../../voice/README.zh.md)——语音输入家族的包地图。
- [ui-conversation](../ui-conversation/README.zh.md)——声明 `conversation.input.left` 工具行的输入框界面。
- [ui-settings](../ui-settings/README.zh.md)——承载该分节的设置外壳。
- [Voice Context 子系统](../../../docs/subsystems/voice.zh.md)——页面背后的路由、凭据与边界约定。

-----

<a id="model-experience"></a>
## 模型体验

间接，通过输入框草稿；仅在用户将其作为普通提示提交时才进入模型请求。本插件自身不注册任何模型面内容；模型可见效果全部来自被提交的草稿。

#### KV Cache 影响

除非用户提交转写草稿，否则无；提交后像其他用户消息一样扩展历史。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明本界面不展示什么、以及把状态保存在哪里；它们是当前的包约束。

- **仅内联状态**——转写错误显示在麦克风按钮的 tooltip 上，不经输入框通知通道。
- **无实时转写预览**——最终文本只在 Remote 落定后出现；流式结果是后续工作。
- **浏览器本地选择**——后端/模型偏好不会在不同浏览器或 profile 间同步。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。只有一个 composer 槽位注册，其释放由 HMR 安全性规格证明；该插件不持有 store、不发出 Cordis 事件，也不持有跨插件可变状态，因为录音器按挂载局部于 React。
