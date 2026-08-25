---
description: "The Voice-Context speech-to-text service: turn browser-recorded audio into composer text through a cloud OpenAI-compatible endpoint or a managed local faster-whisper server."
kind: "package-reference"
---

# @deepseek-ai/dsh-voice-context

English | [中文](README.zh.md)

## Summary

Mount this service to turn recorded speech into text for the Web composer. `ctx.voiceContext.transcribe(request)` accepts one audio payload and returns the transcript, routing it to a cloud OpenAI-compatible `/v1/audio/transcriptions` endpoint or to a local faster-whisper server on loopback; the Host chooses every trusted URL, so the browser cannot name an upstream origin, and the cloud key resolves per request through the credentials seam. Choose the local backend when audio must not leave the machine; expect a slower first request after a model switch because the companion server keeps one model resident.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The browser records one utterance through the Web surface and sends it to this service; the returned text lands in the composer draft.

### Minimal configuration

Load the service with a deployment default and the loopback port the local backend should use.

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

`apiKeyEnv` (default `SILICONFLOW_API_KEY`) names a credential reference resolved through `ctx.credentials` per request; `apiKey` is a literal fallback for non-interactive deployments. A loopback `baseUrl` is forwarded unauthenticated. An explicit `backend: local` request always uses `127.0.0.1:${localPort}`; an explicit `backend: cloud` request uses the configured non-loopback origin or the bundled SiliconFlow origin when the deployment default is local. `modelRoot` (default `~/.dsh/voice-context/models`) is the writable directory the local server reads faster-whisper weights from; it is passed to the server as `STT_MODEL_ROOT`, which `download_models.py` also honors, so read-only installs (e.g. the nix store) keep models outside the package tree. `pythonBin` (default `python`) names the interpreter used to launch the local backend; nix deployments set it to the `dsh-stt` environment's python.

The [companion local server](local/funasr/README.md) ships with one-click dependency setup and an allowlisted faster-whisper downloader. Model weights, virtual environments, caches, and logs remain outside the Git distribution.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### The Remote method

`ctx.voiceContext.transcribe(request)` is the `@Remote('transcribe')` method; audio crosses the Remote as base64 JSON (`TranscribeRequest.audio`). Optional `backend` and `model` fields select cloud SenseVoiceSmall or local SenseVoiceSmall/faster-whisper `small`, `medium`, or `large-v3`. The Host chooses the trusted URL, decodes and forwards the audio, and returns `TranscribeResult.text`; the browser cannot provide an arbitrary upstream URL. The same service conditionally mounts `/voice-local` (`status|install|start|stop`) when a command adapter exists.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough; they move from the family map to the Web surface and the companion server.

- [Voice Context subsystem](../../../docs/subsystems/voice.md) — the public request and result types, the routing and credential rules, and the family's boundaries.
- [voice group](../README.md) — the package map for the voice input family.
- [ui-voice-context](../../client/ui-voice-context/README.md) — the mic button and the settings page that call this service.
- [Companion local server](local/funasr/README.md) — the OpenAI-compatible loopback server, its install steps, and its model downloader.
- [Voice-Context Remote service Agent Note](../../../.agents/notes/implemented/feature/2026-08-14-voice-context-stt-remote.md) — why transcription is one Remote-exposed service.
- [Selectable transcription backends Agent Note](../../../.agents/notes/implemented/feature/2026-08-14-selectable-voice-transcription-backends.md) — how one request selects a backend and a model.

-----

<a id="model-experience"></a>
## Model Experience

None, as transcription is human input and reaches a model request only when the user submits the resulting composer draft.

#### KV Cache effect

None; the service never assembles or sends a model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the service is a poor fit or needs operator care; they are current package constraints.

**Runtime invariant:** No companion is published: the local backend is a child process whose health is the authoritative signal, and the service owns no independently observable state of its own.

- **Base64 transport** — the Remote wire is JSON, so audio inflates by base64; a dedicated streaming upload path is future work for long recordings.
- **Local backend is a child process** — it stops with the harness unless `/voice-local stop` runs first.
- **Process-wide credential** — one reference serves every request; per-session or per-provider credentials are not modeled.
- **Serialized local model switching** — the companion server keeps one model resident, so the first request after changing a large model is slower while keeping memory bounded.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
