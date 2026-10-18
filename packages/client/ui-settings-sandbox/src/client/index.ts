/**
 * The sandbox policy's settings page, browser half: the extra writable roots
 * `workspace-write` may use beyond the session workspace and the platform temp
 * areas. The page registers into the Plugins page's `plugins.item` slot while
 * the Host serves the `sandbox-policy` entry, so a deployment composing no
 * policy service shows no trace of it.
 */

// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the ctx.configForms Context merge. Cross-plugin collaboration
// goes through the service, never a value import (client bundle purity gate).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: the Plugins page's SlotMap merge (the 'plugins.item' entry).
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SandboxSettingsCard } from './SandboxSettingsCard.tsx'
import { SANDBOX_NS, SandboxSettingsController } from './sandbox-settings-controller.ts'
import { en, zh, type SandboxSettingsLocaleKey } from './locales.ts'

export type { SandboxSettingsCardProps } from './SandboxSettingsCard.tsx'
export type { SandboxSettingsCardFace, SandboxSettingsCardState, SandboxSettings } from './sandbox-settings-controller.ts'
export type { SandboxSettingsLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sandbox settings page copy. */
    'settings.sandbox': SandboxSettingsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
export const NS = 'settings.sandbox'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'configForms']

/**
 * Mount the sandbox roots page while the Host serves the policy entry.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-sandbox: dictionaries')
  const card = new SandboxSettingsController(ctx.configForms.get(SANDBOX_NS))
  ctx.effect(() => () => { card.dispose() }, 'ui-settings-sandbox: form subscription')
  ctx.effect(() => ctx.configForms.whileServed([SANDBOX_NS], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
    name: 'plugins.item', id: 'sandbox', order: 30, label: () => t('title'), locale: NS, inject: () => card.inject(),
  }, SandboxSettingsCard))), 'ui-settings-sandbox: page')
}
