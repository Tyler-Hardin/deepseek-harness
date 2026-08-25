---
description: "语音输入包组：一个转写服务把录制的语音变成输入框文本，后端可选云端或本地。"
kind: "package-group"
---

# voice/ — 语音输入家族

[English](README.md) | 中文

## 概述

`voice/` 组把录制的语音变成输入框文本。该家族就是一项转写能力：`ctx.voiceContext` 把一段音频经云端 OpenAI 兼容端点，或经 loopback 上受管理的本地 faster-whisper 服务转写为文本，所有可信路由与凭据都由 Host 掌握。录音与配置位于 Web 客户端——调用该服务的输入框麦克风按钮与 Voice-Context 设置页。部署需要提供听写时挂载本组；转写文本只有在用户提交草稿后才进入模型上下文。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

能力由一个包提供；录制音频的 Web 界面与配置它的设置页位于 client 组。

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`voice-context/`](voice-context/README.zh.md) | 语音转文字能力：把浏览器录制的音频经云端端点或受管理的本地 faster-whisper 服务转写为文本 | `ctx.voiceContext` |

本组只有这一个 seam：浏览器从不选择上游 URL，配套本地服务把权重、虚拟环境、缓存与日志留在 Git 发行内容之外。

-----

<a id="related-documentation"></a>
## 相关文档

- [Voice Context 子系统](../../docs/subsystems/voice.zh.md)——公共请求与结果类型、路由与凭据规则、本地后端，以及本家族的边界。
- [Voice-Context Remote 服务 Agent Note](../../.agents/notes/implemented/feature/2026-08-14-voice-context-stt-remote.zh.md)——转写为何是一个经 Remote 暴露的服务。
- [可选转写后端 Agent Note](../../.agents/notes/implemented/feature/2026-08-14-selectable-voice-transcription-backends.zh.md)——单个请求如何选择后端与模型。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
