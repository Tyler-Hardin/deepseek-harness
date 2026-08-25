---
description: "Voice-Context 语音转文字服务：把浏览器录制的音频经云端 OpenAI 兼容端点或受管理的本地 faster-whisper 服务变成输入框文本。"
kind: "package-reference"
---

# @deepseek-ai/dsh-voice-context

[English](README.md) | 中文

## 概述

挂载本服务，即可把录制的语音变成 Web 输入框文本。`ctx.voiceContext.transcribe(request)` 接收一段音频并返回转写文本：可路由到云端 OpenAI 兼容的 `/v1/audio/transcriptions` 端点，也可路由到 loopback 上的本地 faster-whisper 服务；所有可信 URL 都由 Host 选择，因此浏览器无法指定上游源，云端密钥则每次请求经凭据 seam 解析。音频不能离开本机时选择本地后端；由于配套服务只让一个模型驻留，切换模型后的首个请求会较慢。

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

浏览器经 Web 界面录制一段语音并把它交给本服务；返回的文本落入输入框草稿。

### 最小配置

加载本服务时给出部署默认值与本地后端应使用的 loopback 端口。

```yaml
- id: voice-context
  name: '@deepseek-ai/dsh-voice-context'
  config:
    baseUrl: https://api.siliconflow.cn
    model: FunAudioLLM/SenseVoiceSmall
    language: zh
    localPort: 8000
    modelRoot: ~/.dsh/voice-context/models
```

`apiKeyEnv`（默认 `SILICONFLOW_API_KEY`）命名一个凭据引用，每次请求经 `ctx.credentials` 解析；`apiKey` 是非交互部署的字面量兜底。loopback `baseUrl` 免鉴权转发。显式 `backend: local` 请求固定使用 `127.0.0.1:${localPort}`；显式 `backend: cloud` 请求使用已配置的非 loopback 源，若部署默认是本地则使用内置 SiliconFlow 源。`modelRoot`（默认 `~/.dsh/voice-context/models`）是本地服务器读取 faster-whisper 权重的可写目录；它以 `STT_MODEL_ROOT` 传给服务器，`download_models.py` 也遵循该变量，因此只读安装（如 nix store）可以把模型放在包树之外。`pythonBin`（默认 `python`）指定用于启动本地后端的解释器；nix 部署应将其设为 `dsh-stt` 环境的 python。

[配套本地服务](local/funasr/README.zh.md)提供一键依赖配置和采用白名单的 faster-whisper 下载工具。模型权重、虚拟环境、缓存和日志不会进入 Git 发行内容。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### Remote 方法

`ctx.voiceContext.transcribe(request)` 是 `@Remote('transcribe')` 方法；音频以 base64 JSON（`TranscribeRequest.audio`）穿越 Remote。可选 `backend` 和 `model` 字段可选择云端 SenseVoiceSmall，或本地 SenseVoiceSmall/faster-whisper `small`、`medium`、`large-v3`。Host 选择可信 URL、解码并转发音频，然后返回 `TranscribeResult.text`；浏览器不能提供任意上游 URL。同一服务在存在命令适配器时条件挂载 `/voice-local`（`status|install|start|stop`）。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面；它们从家族地图进入 Web 界面与配套服务。

- [Voice Context 子系统](../../../docs/subsystems/voice.zh.md)——公共请求与结果类型、路由与凭据规则，以及本家族的边界。
- [voice 组](../README.zh.md)——语音输入家族的包地图。
- [ui-voice-context](../../client/ui-voice-context/README.zh.md)——调用本服务的麦克风按钮与设置页。
- [配套本地服务](local/funasr/README.zh.md)——OpenAI 兼容的 loopback 服务、其安装步骤与模型下载工具。
- [Voice-Context Remote 服务 Agent Note](../../../.agents/notes/implemented/feature/2026-08-14-voice-context-stt-remote.zh.md)——转写为何是一个经 Remote 暴露的服务。
- [可选转写后端 Agent Note](../../../.agents/notes/implemented/feature/2026-08-14-selectable-voice-transcription-backends.zh.md)——单个请求如何选择后端与模型。

-----

<a id="model-experience"></a>
## 模型体验

无，因为转写是人工输入，仅在用户提交所得输入框草稿时才进入模型请求。

#### KV Cache 影响

无；该服务从不组装或发送模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明本服务何时不合适，或何时需要特别的运维注意；它们是当前的包约束。

**运行时不变式：** 不发布伴生入口：本地后端是子进程，其健康状况就是权威信号，服务本身不拥有可独立观测的状态。

- **Base64 传输**——Remote 线缆只承载 JSON，音频因 base64 膨胀；长录音的专用流式上传通道留作后续工作。
- **本地后端是子进程**——除非先运行 `/voice-local stop`，否则随宿主退出。
- **进程级凭据**——一个引用服务所有请求；未建模按会话或按提供商的凭据。
- **本地模型串行切换**——配套服务只让一个模型驻留；切换大模型后的首个请求较慢，但内存占用有界。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
