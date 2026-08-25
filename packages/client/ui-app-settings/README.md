# @deepseek-ai/dsh-client-ui-app-settings

English | [中文](README.zh.md)

The **App** settings page for the dsh web UI: server hostname, mTLS client certificate, and diagnostics, contributed only when the page runs inside a native dsh client. The browser plugin registers one localized `settings.section` contribution with id `app` and order `100`; the settings shell owns the navigation entry and page chrome. Registration is gated on `window.DshApp`: the plugin's `apply` returns without registering anything on desktop browsers, so the page appears only on the app's WebView.

The page reads and writes everything through the bridge — no host RPC, no settings-document keys. The hostname field is prefilled from `getServerUrl()` and saved through `setServerUrl()`, after which the native app reloads the page at the new server. The certificate row shows the remembered alias (or the "none" state) and forgets it on demand; the next connection re-prompts the system certificate chooser. The diagnostics block shows the app's event ring buffer and on-disk crash log, with per-block Clear and a Refresh that re-reads the whole surface. A failing bridge read surfaces a visible alert instead of crashing the page.

The bridge is the platform-neutral contract: a future iOS or other client implements the same `window.DshApp` surface and this page works unchanged.

## Model Experience

None, as this package only renders native-app state inside browser Settings and registers nothing model-facing. It changes no prompts, tool schemas, requests, or session events.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **App only** — the page cannot render when the server is unreachable (there is no web UI to host it); the native first-run screen and the error page's "Change server" button cover the offline path.
- **One-way hostname change** — saving a new hostname reloads the whole page at the new server, closing the settings panel; there is no in-page success state.
- **Notification permission** — the page surfaces diagnostics text but does not manage the Android notification permission; that stays native.
