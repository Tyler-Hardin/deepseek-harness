---
description: "The voice input package group: one transcription service that turns recorded speech into composer text through a cloud or a local backend."
kind: "package-group"
---

# voice/ — voice input family

English | [中文](README.zh.md)

## Summary

The `voice/` group turns recorded speech into composer text. The family is one transcription capability: `ctx.voiceContext` transcribes an audio payload through either a cloud OpenAI-compatible endpoint or a managed local faster-whisper server on loopback, and the Host owns every trusted route and the credential. Recording and configuration live in the Web client — a composer mic button and a Voice-Context settings page that call this service. Mount the group when a deployment should offer dictation; the transcript reaches model context only after the user submits the draft.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

One package owns the capability; the Web surface that records audio and the settings page that configures it live in the client group.

| Package | Role | ctx key |
|---|---|---|
| [`voice-context/`](voice-context/README.md) | Speech-to-text capability: transcribes browser-recorded audio through the cloud endpoint or the managed local faster-whisper server | `ctx.voiceContext` |

The service is the only seam here: the browser never chooses an upstream URL, and the companion local server keeps its weights, virtual environments, caches, and logs outside the Git distribution.

-----

<a id="related-documentation"></a>
## Related documentation

- [Voice Context subsystem](../../docs/subsystems/voice.md) — the public request and result types, the routing and credential rules, the local backend, and the family's boundaries.
- [Voice-Context Remote service Agent Note](../../.agents/notes/implemented/feature/2026-08-14-voice-context-stt-remote.md) — why transcription is one Remote-exposed service.
- [Selectable transcription backends Agent Note](../../.agents/notes/implemented/feature/2026-08-14-selectable-voice-transcription-backends.md) — how one request selects a backend and a model.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
