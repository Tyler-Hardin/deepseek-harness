# dsh Android app

English | [中文](README.zh.md)

A minimalistic Android wrapper around the DeepSeek Harness web UI (`dsh web`).
It is a full-bleed WebView pointed at a user-configured hostname, with
client-certificate (mTLS) support via Android's KeyChain and an emphasis on
making failures visible instead of silent.

## What it does

- Loads the dsh web UI at the configured hostname (first launch asks for it).
- **Settings live in the web UI.** The web UI's settings nav gets an **App**
  page — hostname, certificate, diagnostics — contributed by the
  `@deepseek-ai/dsh-client-ui-app-settings` client plugin, which registers
  only when the page runs inside the app (the `window.DshApp` bridge exists
  only there). A minimal native screen remains as the offline fallback:
  first run (no hostname yet, so no web UI) and the error page's
  "Change server" button (server unreachable, so the web UI cannot render).
- **mTLS**: when the server requests a client certificate, Android's system
  certificate chooser appears; the chosen certificate is remembered. The App
  settings page shows which certificate is in use and can forget it.
- **Voice input**: the web UI's speech-to-text uses the microphone; the app
  requests `RECORD_AUDIO` and forwards the grant to the WebView.
- **Native notifications**: the web UI can call `window.DshApp.notify()`
  to post a notification that plays the timer bell sound in
  `res/raw/notification_bell.ogg` (copied from the goop app).
- **Visible errors**: connection, TLS, and HTTP failures render an
  in-WebView error page with the failing URL plus Retry and Change server
  buttons; a splash screen with status text covers connection; console
  messages, WebView events, and crashes are recorded and readable from the
  web UI's App settings page. Nothing is logcat-only.

## Requirements

- Android 8.0 (API 26) or newer.
- A `dsh web` instance reachable from the device, always behind TLS with a
  client certificate (mTLS). The app assumes `https` when you type a bare
  hostname.

## Build

The Nix flake provides the build environment (Android SDK 34, Gradle, JDK 17,
adb) — the same toolchain that builds the goop app:

```sh
cd android
nix develop -c gradle assembleDebug
```

This writes `.android-sdk/` and `.gradle-home/` into `android/` (both gitignored).
The APK lands at `app/build/outputs/apk/debug/app-debug.apk`.

Without Nix, any Android Studio project with the same versions works: AGP
8.2.0, Kotlin 1.9.22, compileSdk 34, minSdk 26, targetSdk 34, JDK 17.

## Install

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Configure

1. Launch the app; it opens the native server screen (offline fallback).
2. Enter the web UI hostname, e.g. `dsh.example.com:3080` or
   `https://dsh.example.com:3080` (a bare hostname gets `https://`).
3. On first connection the server requests a client certificate; pick yours
   in the system chooser. Install the client certificate on the device first
   (Settings → Security → Encryption & credentials → Install a certificate →
   CA certificate / user credential).
4. From then on, settings live in the web UI: open the sidebar gear, then
   the **App** page. If the connection fails, the error page shows the reason
   and the URL with Retry and Change server buttons.

The web UI runs at `127.0.0.1` by default and refuses to bind `0.0.0.0`;
expose it through a reverse proxy that terminates TLS and requires a client
certificate, and point this app at that proxy.

## Design notes — errors are visible on purpose

The earlier goop app was tedious to operate because its failures were
silent, background, or invisible. This app deliberately avoids each mode:

- **No request interception/probing.** A probe cannot carry the KeyChain
  client certificate, so behind mTLS it always fails and would inject wrong
  error bodies into the page history. The WebView handles every request with
  its own mTLS-capable stack.
- **No splash→redirect hack.** The real URL loads directly; WebView error
  callbacks drive a single, deterministic error page (identified by a custom
  base URL, so it is never confused with a real navigation).
- **Error state resets per navigation.** A stuck "error page shown" flag
  (which can blank the app after recovery) is impossible: `onPageStarted`
  clears it, and only main-frame failures show the page.
- **KeyChain lookups run off the main thread.** Android 16 rejects
  `KeyChain.getPrivateKey` on the main thread; the remembered-certificate
  path and the chooser callback both dispatch to a worker thread.
- **No background WebSocket service.** Notifications fire only while the app
  process is alive; there is no foreground service whose silent death hides
  a broken "monitoring" promise.
- **Crash handler writes a file and flags the next launch.** A dialog shows
  the crash on the next start instead of a crash living only in logcat.
- **Everything records to diagnostics.** WebView lifecycle, TLS, certificate,
  HTTP, and JavaScript console events land in an in-memory ring buffer
  (`DshDiagnostics`) readable from the web UI's App settings page, alongside
  the crash log and app/Android version.

## The `window.DshApp` bridge

The WebView exposes `window.DshApp` — the platform-neutral contract between
the web UI and the native app. A future iOS (or other) client implements the
same surface and the web-side App settings page works unchanged:

| Method | Purpose |
| --- | --- |
| `getServerUrl()` / `setServerUrl(url)` | Read/update the configured hostname (save reloads the page at the new server) |
| `getCertInfo()` / `forgetCertificate()` | Read/forget the remembered mTLS certificate |
| `getDiagnostics()` / `clearDiagnostics()` | Read/clear the event ring buffer |
| `getCrashLog()` / `clearCrashLog()` | Read/clear the on-disk crash log |
| `getAppInfo()` | One-line app/version/certificate state |
| `notify(title, body)` | Post a native notification with the timer bell sound |
| `openSettings()` | Open the native offline fallback screen |

## Layout

```
android/
  flake.nix, flake.lock   # Nix build environment (SDK 34, Gradle, JDK 17)
  app/                    # Gradle module
    src/main/
      AndroidManifest.xml
      java/ai/deepseek/dsh/
        DshApp.kt         # preferences, crash handler, URL normalization
        MainActivity.kt   # WebView, mTLS, error page, splash
        DshJsBridge.kt    # window.DshApp bridge
        DshErrorPage.kt   # self-contained error page HTML
        DshDiagnostics.kt # event ring buffer surfaced in the web UI
        SettingsActivity.kt  # offline fallback (first run / unreachable)
      res/raw/notification_bell.ogg
      res/drawable/…      # icons and backgrounds
```
