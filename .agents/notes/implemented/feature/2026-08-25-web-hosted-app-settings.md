# Agent Note: App settings hosted in the web UI

Status: implemented

English | [中文](2026-08-25-web-hosted-app-settings.zh.md)

## Problem

The Android app shipped its server-hostname, certificate, and diagnostics settings in a native activity behind a floating gear button. That duplicated the web UI's own settings entry point, split diagnostics into a separate on-device screen, and meant any future non-Android client would have to reimplement the same native UI. The native surface also had to be reachable without the server, which the settings content itself could not guarantee.

## Decision

Settings move into the web UI as an **App** settings page contributed by the new `@deepseek-ai/dsh-client-ui-app-settings` client plugin. The plugin registers one `settings.section` contribution (id `app`, order `100`) only when `window.DshApp` is present — the platform-neutral native bridge the Android app exposes via `addJavascriptInterface` — so the page appears only inside the app and never in a desktop browser, with no user-agent sniffing. The page reads and writes hostname, mTLS certificate, and diagnostics exclusively through the bridge; saving a hostname reloads the page at the new server. The Android bridge was renamed `DshAndroid` → `DshApp` and extended with certificate and diagnostics methods (`getCertInfo`/`forgetCertificate`, `getDiagnostics`/`clearDiagnostics`, `getCrashLog`/`clearCrashLog`).

The native settings screen is trimmed to an offline fallback: it opens on first run (no hostname configured, so no web UI exists yet) and from the error page's "Change server" button (server unreachable, so the web page cannot render). It holds the hostname field and the certificate row only; diagnostics live in the web UI page.

## Alternatives considered

**Keep the native settings activity and gear button.** Rejected: it duplicates the web UI's settings entry point, and diagnostics remain readable only on a separate native screen.

**Gate the page by user-agent sniffing.** Rejected: capability detection through bridge presence is precise, survives client naming changes, and carries no spoofable string parsing.

**Name the bridge and package after Android.** Rejected: `window.DshApp` and `ui-app-settings` are platform-neutral, so a future iOS (or other) client implements the same bridge surface and the web page works unchanged.

## Consequences

The web-side change ships in the `dsh web` server, not the APK: deployments must rebuild the server for the App page to appear, and the APK alone shows no in-UI settings entry until then (the offline fallback screen still covers first run and unreachable-server). Desktop browsers see no change — the plugin registers nothing without the bridge. The native crash dialog and error page remain the offline diagnostics path; the full event ring buffer and crash log moved into the web UI page.
