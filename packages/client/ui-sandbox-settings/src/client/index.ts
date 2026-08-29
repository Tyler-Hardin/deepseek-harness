/**
 * Sandbox settings plugin, browser half — a General-settings row editing the
 * host-local extra writable roots `workspace-write` may write beyond the
 * session workspace and temp areas. The row follows the shared describe
 * mirror (the host-computed `sandbox` namespace descriptor) and writes one
 * whole-list `settings.mutate` path operation with the descriptor revision,
 * so the accepted value folds back through the same mirror every surface
 * reads.
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot types (this package registers a General row).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SandboxRootsRow } from './SandboxRootsRow.tsx'
import type { SandboxRootsRowInjected } from './SandboxRootsRow.tsx'
import { en, zh } from './locales.ts'
import { SandboxRootsSettingsController } from './settings-store.ts'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'locale', 'connection', 'settingsScope']

/**
 * Client plugin body: register the Sandbox extra-writable-roots editor row in
 * General settings over the shared describe mirror.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('settings.sandbox', { zh, en }), 'ui-sandbox-settings: settings row dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle
  // The row follows the shared describe mirror, whose owning plugin already
  // refreshes it on document commits and reconnects.
  const controller = new SandboxRootsSettingsController(
    ctx.settingsScope.describe(), connection.api)
  const load = (): Promise<void> => controller.load()
  const save = (roots: string[]): Promise<void> => controller.save(roots)
  const injected = (): SandboxRootsRowInjected => ({
    hooks: { sandboxRoots: controller.store },
    load,
    save,
  })

  ctx.effect(() => () => { controller.dispose() }, 'ui-sandbox-settings: settings row directory')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'sandbox',
    order: -10,
    locale: 'settings.sandbox',
    inject: injected,
  }, SandboxRootsRow))
}
