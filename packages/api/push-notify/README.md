---
description: "Firebase Cloud Messaging pushes for finished, failed, and waiting Session runs, registered from the native client."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-push-notify

English | [中文](README.zh.md)

## Summary

Pushes one structured Firebase Cloud Messaging message when a Session run finishes, fails, or starts waiting for the user, so the native client needs neither a background socket nor a foreground service. The client registers its device token over `POST /push/register`; the message carries a reason code, the Session id, a label derived from the Session's working directory, and the deployment origin the registration reached — never Session content — and the client owns the localized wording. A browser also reports the Session it actively shows; the Host holds a push for that Session for a short window and re-checks before dropping it, so a backgrounded tab, a short look-away, or a different Session still rings.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

The web-app bundle enables the row with the deployment's service-account file and a token path:

```yaml
- id: push-notify
  name: '@deepseek-ai/dsh-api-push-notify'
  config:
    enabled: true
    serviceAccountPath: !!js dshHomePath('fcm-service-account.json')
    tokenPath: !!js dshHomePath('push', 'device.json')
    presenceTtlMs: 30000
    holdMs: 60000
```

The native client posts `{"token": "…"}` to `/push/register`, which stores the token and the deployment origin it arrived through — from `x-forwarded-proto` and `host`, or a configured `publicUrl` — with mode `0600`. The origin lets the client open the deployment that pushed when a notification is tapped, which matters when one phone follows several deployments. Pushes follow `api-session/status` (only the running→idle edge), `api-session/error`, and the `approval/request` / `user-questions/request` waterfalls, whose listeners observe and delegate with `next()`. A deployment without a Firebase project leaves `enabled` on but never registers a token, so nothing is sent.

While a browser actively shows a Session, the web client posts `{ clientId, sessionId, active }` to `/push/presence`; the report expires after `presenceTtlMs` (default 30 s). When a push names that Session, the Host waits `holdMs` (default 60 s) and drops it only if a fresh report still names it. No report, a stale report, a different Session, a hidden tab, or an idle viewer delivers immediately. The workspace shell reports every 10 s while the tab is visible, focused, and has had input in the last 45 s.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Maintainer details — click to expand</summary>

OAuth2 access tokens are minted from the service account with a locally signed RS256 JWT against `https://oauth2.googleapis.com/token`, cached until a minute before expiry, and used against the FCM v1 send endpoint for the account's `project_id`. Both endpoints are config fields so tests can point at a local server. Send failures and rejected registrations are logged and never thrown into the emitting event, because a push is a notification side path: a Session run must finish even when the phone cannot be reached. Hold timers are tracked and resolved on disposal, so shutdown never strands a pending push.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Native client](../../../android/README.md), which receives the pushes and renders the localized copy.

-----

<a id="model-experience"></a>
## Model Experience

None, as a push carries only a reason code, a Session id, and a working-directory label — no Session content — and nothing here reaches a model request.

#### KV Cache effect

No direct effect; a push adds, removes, and reorders nothing in model context.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The background monitor (`DshNotificationService`) remains in the app as the no-Firebase fallback; it watches 0.1.7-era downlink paths that 0.2.1 replaced, so a deployment without push currently gets no alerts.
- One registered device token per deployment: a second phone replaces the first.
- Pushes are not retried; a device that Google reports as unregistered is only logged.
- Active-viewer suppression is best-effort: a page with no input for 45 s is treated as away, and the held push is delivered if no fresh report names the Session after `holdMs`.
- `pnpm run test packages/api/push-notify` covers registration, run transitions, message bodies, presence reports, and held pushes. The Firebase `google-services.json` stays out of the repository (it is in the Android app's `.gitignore`), and the service-account key lives in the dsh home, never in a repository file.

### Dev Note

`pnpm run test packages/api/push-notify` covers registration, run transitions, message bodies, presence reports, and held pushes; the Firebase config and service-account key stay out of the repository.
