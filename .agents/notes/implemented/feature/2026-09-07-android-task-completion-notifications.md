# Agent Note: Android background task-completion notifications

Status: implemented

English | [中文](2026-09-07-android-task-completion-notifications.zh.md)

## Problem

The Android app ([android WebView client](2026-08-25-android-webview-client.md)) had no way to tell the user a session run finished while the phone was backgrounded or the screen off: the WebView page is paused or suspended the moment the app is not on screen, so a page-side listener cannot deliver, and the [app-settings decision](2026-08-25-web-hosted-app-settings.md) shipped `window.DshApp.notify()` with no caller. The earlier design deliberately had no background service; goop's hidden one had taught that a monitor whose failure is invisible is worse than none. The requirement is a bell when a run finishes, errors, or stops to wait for the user — reliably enough that "I left the app running a long task" is a supported posture.

## Decision

The Android app ships a background task-completion monitor: a foreground service with its own read-only connections to the dsh host, posting native notifications only while the app is not on screen. Delivery never depends on the WebView page. The web UI's App settings page gains a "Background notifications" opt-out (default on), and the bridge contract grows `getMonitoringEnabled()` / `setMonitoringEnabled()` as optional members so native builds that predate the monitor keep working unchanged.

Native pieces (`android/`):

- **`DshNotificationService`** — the foreground service (`foregroundServiceType="specialUse"`, subtype `task-completion-monitoring`). It owns a monitor `HandlerThread`; all classifier and socket state is confined there. It shows a persistent, low-importance **monitoring** notification whose text mirrors the connection state (connected / connecting / retrying / certificate error) with a Stop action, so a dead monitor is never invisible; deleting and recreating the **alert** channel on start pushes the bell sound and vibration to already-installed apps.
- **`DshDownlink`** — one OkHttp WebSocket for a dsh downlink stream: protocol pings every 30 s, zero client frames (dsh closes a downlink socket on any client message with 1008), exponential-backoff reconnect capped at 30 s, and a 256 KB frame guard (history replay can carry huge entries the monitor does not need).
- Classifier rules, applied to sessions the `session.list` seed or live frames report (subagent children and blank sessions never ring):
  - `question/requested` or `approval/requested` while the session is running → **needs your input** (once per request id, replay-safe).
  - `host/session-status running:true→false` with no outstanding interaction → **task finished**, debounced 4 s so compaction maintenance between queued turns does not ring.
  - `host/agent-error` before the end edge → **ended with an error**.
  - Connection-loss reconciliation: on reconnect the service re-pulls `session.list` and rings for sessions that were running when the link dropped and are now idle or gone.
- mTLS uses the same remembered KeyChain certificate via a PKCS12→OkHttp `sslSocketFactory`, built on the monitor thread (Android 16 rejects KeyChain on the main thread); a certificate failure is surfaced in the monitoring notification and retried — never silently downgraded to a plain connection.
- Start/stop: `MainActivity` starts the service at launch once `POST_NOTIFICATIONS` is granted and a server URL is configured, tracks the foreground flag in `onResume`/`onPause`, and restarts the monitor when the server URL changes; the web toggle stops it, and enabling it while Android 13+ has not granted the permission routes through the activity's runtime permission request instead of starting a service whose notifications could not display.

Web pieces (`packages/client/ui-app-settings`): `DshAppBridge` gains the two optional monitoring members; the injected face forwards them only when the bridge ships them; `AppSection` renders the Background notifications checkbox only then, so old app builds simply omit the block.

## Wire contract (the seams the monitor reads)

The dsh host already pushes everything needed over two downlink-only watch streams that need no client traffic and no per-client subscription: `/api/events.host` (`host/session-status{running}`, `host/session-added{cwd}`, `host/session-removed`, `host/agent-error`) and `/api/events.mux` (`question/requested`, `approval/requested`, `question/resolved`, `approval/resolved`, replayed for anything still pending when a socket opens). Every message is a full-form `server-request` envelope; the parser keys on `payload.type`. Host status frames fire only on transitions, so the service seeds state with one unary RPC (`POST /api/session.list`, body `{type:"client-request", rpcId, method:"session.list", payload:{}}`), which also supplies the display title fallback (durable `projections.title`, else the cwd basename, else a short id — matching the web client's fallback). An agent stays `running` while blocked on a question or approval, so `running:false` genuinely means the turn ended. These seams were pinned against a live host in Phase 0, including a captured real `host/session-status running:false` for the session whose id matched the running agent.

## Alternatives considered

**Keep the WebView page alive with a foreground service and let a web-side listener ring.** Rejected: delivery would depend on Chromium's hidden-page throttling semantics we do not control and cannot test on-device; the monitor would carry a whole GUI page in memory while backgrounded.

**A native full JSON-RPC client mirroring the browser connection layer.** Rejected: disproportionate — the two downlink streams plus one unary RPC expose exactly the needed facts with no protocol reimplementation.

**Polling `session.list` on a timer instead of sockets.** Rejected: polling alone cannot distinguish "finished" from "stopped waiting for your input" (interactions live on the mux stream, not in list rows) and adds latency and battery use for a worse answer.

**Server-side push through FCM.** Rejected: requires Google services and a push gateway for a self-hosted, mTLS deployment.

**goop's hidden foreground WebSocket service.** Rejected as before, but for the opposite reason: it was invisible. This monitor keeps the foreground-service shape and adds the persistent, state-mirroring notification and Stop action that make it honest.

## Consequences

The app's earlier "no background WebSocket service" stance is reversed for this monitor, and the README and the [android WebView client note](2026-08-25-android-webview-client.md) record the reversal. The cost is a persistent low-importance notification while monitoring is on (default) and the battery cost of two small sockets with protocol pings plus a timeout-refreshed partial wake lock; the monitor never runs a whole WebView. Alerts cover all sessions the configured server reports; a per-workspace filter is deferred until a deployment needs it. Delivery is best-effort across a full network outage: a run that both starts and finishes while the link is down is reconciled at the next successful seed. The alert body names the session by its cwd basename or short id until durable titles ride a frame the monitor reads. Notification semantics that still need on-device confirmation (the question-cancel edge, Doze behavior, alert sound upgrade on existing installs) are listed in the Android README's deferred work.

## Testing

The web half is pinned by `ui-app-settings` specs: bridge contract, capability-gated injection (monitoring omitted for bridges that predate it), and component behavior (toggle renders only when supported, forwards the flip, refreshes); the package test lane and `tsc -b` pass. The Kotlin half has no unit harness in this repository; `nix develop -c gradle assembleDebug` is the compile gate and the APK builds. Device verification of background delivery, question-pause ringing, process-kill recovery, and permission denial is outstanding (Phase 3), runnable against the deployed host.

## Related

- [Android WebView client for the dsh web UI](2026-08-25-android-webview-client.md) — the app this monitor lives in; its rejected-alternative record is amended by this note.
- [Web-hosted App settings](2026-08-25-web-hosted-app-settings.md) — the settings page and bridge contract the toggle extends.
