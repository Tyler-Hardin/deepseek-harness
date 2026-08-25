/**
 * The platform-neutral native client bridge contract (`window.DshApp`).
 *
 * The Android app exposes this object via addJavascriptInterface; a future
 * iOS or other client can implement the same surface without web-side
 * changes. The bridge's presence is the ONLY signal the web UI uses to know
 * it runs inside a native app — no user-agent sniffing.
 * @module @deepseek-ai/dsh-client-ui-app-settings/src/client/bridge
 */

/** Methods the App settings page requires from the native client. */
export interface DshAppBridge {
  /** The configured server URL (origin), or empty. */
  getServerUrl(): string
  /** Persist a new server URL; the client reloads at it. */
  setServerUrl(url: string): void
  /** Remembered client certificate alias, or "none". */
  getCertInfo(): string
  /** Forget the remembered certificate. */
  forgetCertificate(): void
  /** Recent app/WebView/console events, one per line. */
  getDiagnostics(): string
  /** Clear the event ring buffer. */
  clearDiagnostics(): void
  /** The on-disk crash log. */
  getCrashLog(): string
  /** Clear the on-disk crash log. */
  clearCrashLog(): void
  /** One-line app version/platform/certificate state. */
  getAppInfo(): string
}

declare global {
  interface Window {
    /** Native dsh client bridge; present only inside the app. */
    DshApp?: DshAppBridge
  }
}

/**
 * Whether the current page runs inside a native dsh client.
 * @returns true when `window.DshApp` exposes the bridge contract.
 */
export function hasAppBridge(): boolean {
  const bridge = window.DshApp
  return typeof bridge === 'object' && bridge !== null && typeof bridge.getServerUrl === 'function'
}

/**
 * The live bridge object.
 * @returns the bridge.
 * @throws when the bridge is absent — call [hasAppBridge] first.
 */
export function requireBridge(): DshAppBridge {
  const bridge = window.DshApp
  if (bridge === undefined) throw new Error('ui-app-settings: window.DshApp bridge is missing')
  return bridge
}
