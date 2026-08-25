---
description: "The Voice-Context Web surface for the dsh web client: the composer mic button that transcribes speech and the settings page that routes between the cloud API and a local model."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-voice-context

English | [中文](README.zh.md)

## Summary

The Voice-Context Web surface adds a mic button to the composer tool row (order 100) that records an utterance, encodes it as 16 kHz mono 16-bit PCM WAV, transcribes it through the Remote `voiceContext` service, and appends the text to the composer draft. Its `settings.section` page (order 40) routes first-time setup between the cloud API and local SenseVoiceSmall or faster-whisper sizes, storing only the controlled backend and model pair in browser local storage — no URL is browser-configurable. The cloud API key is written through the credentials domain and never read back.

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

The browser half contributes a mic button in the `conversation.input.left` composer tool row (order 100) that records an utterance, encodes it to base64, transcribes it through `ctx.remote.voiceContext.transcribe(...)`, and appends the text through `inputActions.setDraft`. MediaRecorder output is decoded and re-encoded as 16 kHz mono 16-bit PCM WAV so every ASR backend accepts the container.

A `settings.section` page (order 40) provides first-time routing between the cloud API and local SenseVoiceSmall/faster-whisper `small`, `medium`, or `large-v3`. The controlled backend/model pair is stored in browser local storage; no URL is browser-configurable. The cloud API key is written through `credentials.set` under `SILICONFLOW_API_KEY`; the page reads only configured/writable state, never the value.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The browser half injects `slots`, `locale`, `remote`, `remote.credentials`, and `remote.voiceContext`. It registers both contributions through `slots.inject` — the mic button into `conversation.input.left` and the page into `settings.section` — so each one follows its declaring slot's lifetime. Both surfaces take their copy, and the recognizer's language hint follows the active locale, from the `voice-context` dictionaries registered here.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the service this surface calls, the slots it registers into, and the contracts behind the page.

- [voice-context](../../voice/voice-context/README.md) — the Remote transcription service this surface calls.
- [voice group](../../voice/README.md) — the package map for the voice input family.
- [ui-conversation](../ui-conversation/README.md) — the composer surface that declares the `conversation.input.left` tool row.
- [ui-settings](../ui-settings/README.md) — the settings shell that hosts the section.
- [Voice Context subsystem](../../../docs/subsystems/voice.md) — the routing, credential, and boundary contracts behind the page.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the composer draft that reaches a model request only when the user submits it as an ordinary prompt. The plugin registers nothing model-facing of its own; the submitted draft carries every model-visible effect.

#### KV Cache effect

None unless the user submits the transcribed draft; it then extends history like any other user message.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the surface does not show and where it keeps its state; they are current package constraints.

- **Inline status only** — transcription errors surface on the mic button's tooltip, not through the composer notice channel.
- **No live transcript preview** — the final transcript appears only after the Remote settles; streaming results are future work.
- **Browser-local selection** — backend/model preference does not synchronize between browsers or profiles.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. One composer slot registration whose disposal the HMR-safety spec proves; the plugin owns no store, emits no Cordis events, and holds no cross-plugin mutable state, because the recorder is React-local per mount.
