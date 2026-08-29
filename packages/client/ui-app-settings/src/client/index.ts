/**
 * App settings section plugin, browser half. Registers the App page in the
 * settings nav ONLY when the page runs inside a native dsh client exposing
 * `window.DshApp` — desktop browsers never see the section. The page reads
 * and writes hostname, certificate, and diagnostics exclusively through the
 * bridge, so a future iOS or other client can implement the same surface
 * without web-side changes.
 * @module @deepseek-ai/dsh-client-ui-app-settings/src/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { AppSection, type AppSettingsInjected } from './AppSection.tsx'
import { hasAppBridge, requireBridge, type DshAppBridge } from './bridge.ts'
import { en, zh, type AppSettingsLocaleKey } from './locales.ts'

export type { AppSectionProps, AppSettingsInjected } from './AppSection.tsx'
export type { AppSettingsLocaleKey } from './locales.ts'
export type { DshAppBridge } from './bridge.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The App settings page copy. */
    'settings.app': AppSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.app'

/** Services required by the Settings registration. */
export const inject = ['slots', 'locale']

/**
 * Register the App settings page when the native client bridge is present;
 * register nothing on desktop browsers.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  if (!hasAppBridge()) return

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-app-settings: dictionaries')

  const t = ctx.locale.bind(NS)
  const bridge: DshAppBridge = requireBridge()
  const injected = (): AppSettingsInjected => ({
    getServerUrl: () => bridge.getServerUrl(),
    setServerUrl: (url) => { bridge.setServerUrl(url) },
    getCertInfo: () => bridge.getCertInfo(),
    forgetCertificate: () => { bridge.forgetCertificate() },
    getDiagnostics: () => bridge.getDiagnostics(),
    clearDiagnostics: () => { bridge.clearDiagnostics() },
    getCrashLog: () => bridge.getCrashLog(),
    clearCrashLog: () => { bridge.clearCrashLog() },
    getAppInfo: () => bridge.getAppInfo(),
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'app',
    order: 100,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, AppSection))
}
