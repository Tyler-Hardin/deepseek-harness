# Agent Note: Android WebView client for the dsh web UI

Status: implemented

English | [中文](2026-08-25-android-webview-client.zh.md)

## Problem

The harness has no first-party mobile client. The reference Android app from the goop project demonstrates the right shape — a full-bleed WebView with mTLS client certificates through Android KeyChain — but shipped several failure modes that are silent, background, or invisible on Android: a splash→redirect sequence that can produce blank pages, a `shouldInterceptRequest` probe that cannot carry the KeyChain client certificate and injects wrong error bodies into page history, an error-page flag that never resets and can blank the app after recovery, KeyChain lookups on the main thread that Android 16 rejects, and a foreground WebSocket service whose background failures only appear in logcat.

## Decision

The repository gains `android/`, a minimal WebView wrapper around the dsh web UI. It loads the user-configured hostname (a bare hostname becomes `https://`), performs mTLS through Android KeyChain with the chosen certificate remembered and forgettable, forwards the microphone permission for the web UI's voice input, supports file pickers, and ships the goop timer bell as `res/raw/notification_bell.ogg` behind a `window.DshApp.notify()` bridge. Every failure is visible: a splash with status text, an in-WebView error page for main-frame failures identified by a custom base URL (so error state resets per navigation), an event ring buffer plus on-disk crash log surfaced in the web UI's App settings page (contributed by `@deepseek-ai/dsh-client-ui-app-settings`, see [web-hosted app settings](2026-08-25-web-hosted-app-settings.md)), a crash dialog on the next launch, and JavaScript console messages recorded into diagnostics. The native settings screen is only the offline fallback — first run and the error page's "Change server" button — and holds the hostname field and the certificate row; there is no floating gear button. Deliberately absent: request interception/probing, the splash→redirect hack, and the background WebSocket notification service. The build environment is a Nix flake dev shell pinned to the same nixpkgs revision as the goop app, so the Android SDK and toolchain derivations are shared in the Nix store.

## Alternatives considered

**Port the goop app's foreground WebSocket service for background turn notifications.** Rejected: it was a source of silent background failures, contradicts the minimal-wrapper scope, and native notifications still require the page or process to be alive.

**Trusted Web Activity (TWA).** Rejected: requires Play signing and digital asset links, which is wrong for a self-hosted mTLS deployment.

**A separate repository like goop.** Rejected: the mobile client is this harness's client surface and belongs in the monorepo next to `apps/web`.

## Consequences

Web-triggered native notifications only fire while the app process is alive (no background service); the README documents this. The app trades goop's invisible failure modes for a few more visible surfaces: the web UI's App settings page with diagnostics, the offline fallback screen, and a crash dialog. Settings changes now ship in the `dsh web` server (the App settings page) rather than only in the APK. The app builds with the same Android toolchain as the goop app (AGP 8.2.0, Kotlin 1.9.22, compileSdk 34, Gradle from nixpkgs), so the proven build path carries over.
