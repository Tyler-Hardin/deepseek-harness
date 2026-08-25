# 语音上下文

[English](voice.md) | 中文

[`@deepseek-ai/dsh-voice-context`](../../packages/voice/voice-context) 为 Web 编辑器提供语音转文字：一个 Typert Remote `transcribe` 服务，将录音转发到云端 OpenAI 兼容提供商或受管的本机回环服务器，外加 `/voice-local` 命令负责安装、启动和停止本机后端。浏览器通过 `ui-voice-context` 的麦克风按钮录制 16 kHz 单声道 WAV，并将转写文本插入编辑器草稿；该文本只有在用户提交草稿后才会进入模型上下文。

来源：[`packages/voice/voice-context/src/types.ts`](../../packages/voice/voice-context/src/types.ts)

## 公开类型

```ts type-equiv
/** Selectable transcription backend exposed by the Web settings surface. */
type TranscriptionBackend = 'cloud' | 'local'
```

```ts type-equiv
/** Cloud model currently supported by the bundled SiliconFlow integration. */
type CloudTranscriptionModel = 'FunAudioLLM/SenseVoiceSmall'
```

```ts type-equiv
/** Models installed by the companion local STT server. */
type LocalTranscriptionModel = 'iic/SenseVoiceSmall' | 'small' | 'medium' | 'large-v3'
```

```ts type-equiv
/** Model ids the first-party Voice-Context UI can send. */
type TranscriptionModel = CloudTranscriptionModel | LocalTranscriptionModel
```

```ts type-equiv
/** One transcription request crossing the Remote boundary. */
interface TranscribeRequest {
  /** Base64-encoded audio bytes (the browser records WAV). */
  readonly audio: string
  /** Container MIME type of the encoded audio, e.g. `audio/wav`. */
  readonly mimeType: string
  /** Optional BCP-47 language hint; the service default applies when omitted. */
  readonly language?: string
  /** Per-request cloud or loopback routing choice; configured routing applies when omitted. */
  readonly backend?: TranscriptionBackend
  /** Model selected for the chosen backend; configured model applies when omitted. */
  readonly model?: TranscriptionModel
}
```

```ts type-equiv
/** One transcription result returned across the Remote boundary. */
interface TranscribeResult {
  /** The transcribed text. */
  readonly text: string
}
```

## 路由与凭据

每个请求携带可选且受控的 `backend` 与 `model` 组合：`local` 在 Host 侧解析到 `127.0.0.1:${localPort}`，仅允许 SenseVoiceSmall 与各 faster-whisper 尺寸；`cloud` 解析到配置的非回环来源（当部署默认为本机时回退到 SiliconFlow），仅允许内置的云端模型。浏览器永远不提供上游 URL：Host 拥有每一条受信路由，回环请求跳过鉴权。云端密钥按请求依次通过凭据 seam、字面配置与环境变量解析。

## 本机后端

`local/funasr/` 中的配套服务器是一个 OpenAI 兼容的 `POST /v1/audio/transcriptions` 端点，同一时刻只驻留一个模型。`install` 通过 pip 安装 FunASR 与 faster-whisper 以及 CPU 版 torch，`start` 将回环服务器作为 dsh 进程的受跟踪子进程启动，`status` 报告硬件、工具链与就绪状态。模型权重从不提交到仓库；`download_models.py` 按需下载受允许的 faster-whisper CTranslate2 目录。

## 边界与限制

转写由浏览器录制、Host 完成；没有中间结果的实时字幕，因此编辑器在每次录音结束后更新一次。浏览器偏好记录只保存受控的 backend/model id，绝不保存 API 密钥。FunASR（SenseVoiceSmall 引擎）未打包进 nixpkgs，因此本机 SenseVoiceSmall 路径依赖 pip 安装；faster-whisper 路径所需的一切都可以从 nixpkgs 解析（见 flake 中的 `packages.<system>.dsh-stt`）。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxvoicecontext--voicecontextservice"></a>

### `ctx.voiceContext` — `VoiceContextService`

Speech-to-text service (`ctx.voiceContext`) exposed through Typert Gateway.

```ts cordis-catalog
/**
 * Transcribe one audio payload through the configured STT provider.
 * @param request - audio container plus optional language, backend, and model choices.
 * @returns the transcribed text.
 */
@Remote('transcribe') async transcribe(request: TranscribeRequest): Promise<TranscribeResult>
```

Source: [`packages/voice/voice-context/src/index.ts`](../../packages/voice/voice-context/src/index.ts)
<!-- END GENERATED cordis-surface -->
