# Voice Context

English | [中文](voice.zh.md)

[`@deepseek-ai/dsh-voice-context`](../../packages/voice/voice-context) owns speech-to-text for the Web composer: a Typert Remote `transcribe` service that forwards recorded audio to a cloud OpenAI-compatible provider or to the managed local loopback server, plus the `/voice-local` command that installs, starts, and stops the local backend. The browser records 16 kHz mono WAV through the `ui-voice-context` mic button and inserts the transcript into the composer draft; the text only reaches model context after the user submits the draft.

Source: [`packages/voice/voice-context/src/types.ts`](../../packages/voice/voice-context/src/types.ts)

## Public types

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

## Routing and credentials

Each request carries an optional controlled `backend` and `model` pair: `local` resolves on the Host to `127.0.0.1:${localPort}` and permits SenseVoiceSmall plus the faster-whisper sizes, while `cloud` resolves to the configured non-loopback origin (or SiliconFlow when the deployment default is local) and permits only the bundled cloud model. The browser never supplies an upstream URL: the Host owns every trusted route, and loopback requests skip authentication. The cloud key resolves per request through the credentials seam, then the literal config, then the environment.

## Local backend

The companion server in `local/funasr/` is an OpenAI-compatible `POST /v1/audio/transcriptions` endpoint that keeps one model resident at a time. `install` bootstraps FunASR and faster-whisper plus CPU torch through pip, `start` launches the loopback server as a tracked child of the dsh process, and `status` reports hardware, tooling, and readiness. Model weights are never committed to the repository; `download_models.py` fetches the allowlisted faster-whisper CTranslate2 directories on demand.

## Boundaries and limitations

The transcript is browser-recorded and Host-transcribed; there is no interim-result caption, so the composer updates once per completed recording. The browser preference record stores only controlled backend/model ids, never the API key. FunASR (the SenseVoiceSmall engine) is not packaged in nixpkgs, so the local SenseVoiceSmall path depends on the pip-based install; everything the faster-whisper path needs resolves from nixpkgs (see `packages.<system>.dsh-stt` in the flake).

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
