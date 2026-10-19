/**
 * The platform-neutral native client bridge contract (`window.DshApp`).
 *
 * The Android app exposes this object via addJavascriptInterface; a future
 * iOS or other client can implement the same surface without web-side
 * changes. The bridge's presence is the ONLY signal the web UI uses to know
 * it runs inside a native app — no user-agent sniffing.
 * @module @deepseek-ai/dsh-client-ui-app-settings/src/client/bridge
 */

/** Members the App settings page requires from the native client. */
export interface DshAppBridge {
  /** The configured server URL (origin), or empty. */
  getServerUrl: () => string
  /** Persist a new server URL; the client reloads at it. */
  setServerUrl: (url: string) => void
  /**
   * Configured servers as JSON (`{servers:[{id,label,url,certAlias,active}],activeId}`).
   * Optional: native builds that predate multiple servers omit it, and the
   * page then edits the single active hostname instead.
   */
  getServers?: () => string
  /** Add a server, returning the same JSON plus `ok`; optional like [getServers]. */
  addServer?: (label: string, url: string) => string
  /** Edit a server's label and URL; optional like [getServers]. */
  updateServer?: (id: string, label: string, url: string) => string
  /** Remove a server; optional like [getServers]. */
  removeServer?: (id: string) => string
  /** Select the server the app opens and reloads at it; optional like [getServers]. */
  selectServer?: (id: string) => string
  /** Remembered client certificate alias, or "none". */
  getCertInfo: () => string
  /** Forget the remembered certificate. */
  forgetCertificate: () => void
  /** Recent app/WebView/console events, one per line. */
  getDiagnostics: () => string
  /** Clear the event ring buffer. */
  clearDiagnostics: () => void
  /** The on-disk crash log. */
  getCrashLog: () => string
  /** Clear the on-disk crash log. */
  clearCrashLog: () => void
  /** One-line app version/platform/certificate state. */
  getAppInfo: () => string
  /**
   * Read the background task-completion monitoring opt-out. Optional:
   * native builds that predate monitoring omit it, and the App page then
   * hides the control instead of failing the whole section.
   */
  getMonitoringEnabled?: () => boolean
  /** Persist the monitoring opt-out; starts/stops the native monitor. */
  setMonitoringEnabled?: (enabled: boolean) => void
}

declare global {
  interface Window {
    /** Native dsh client bridge; present only inside the app. */
    DshApp?: unknown
  }
}

/**
 * Whether the current page runs inside a native dsh client. The bridge is
 * injected by the native app, so the object is validated before use.
 * @returns true when `window.DshApp` exposes the bridge contract.
 */
export function hasAppBridge(): boolean {
  const bridge = window.DshApp
  return typeof bridge === 'object' && bridge !== null
    && typeof (bridge as Partial<DshAppBridge>).getServerUrl === 'function'
}

/**
 * The live bridge object.
 * @returns the bridge.
 * @throws when the bridge is absent — call [hasAppBridge] first.
 */
export function requireBridge(): DshAppBridge {
  const bridge = window.DshApp
  if (typeof bridge !== 'object' || bridge === null) {
    throw new Error('ui-app-settings: window.DshApp bridge is missing')
  }
  return bridge as DshAppBridge
}
