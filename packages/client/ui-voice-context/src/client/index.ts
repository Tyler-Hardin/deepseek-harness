/**
 * Voice-Context Web surface, browser half.
 *
 * Two contributions:
 *  - a mic button in the composer's `conversation.input.left` tool row, which
 *    records an utterance and transcribes it through the `voiceContext` Remote
 *    (crossing the `/api` browser-trust fence);
 *  - a `settings.section` page where the user types the STT API key, written
 *    through the credentials domain and resolved by the Host per request.
 *
 * Both contributions take their copy from this plugin's locale dictionaries,
 * registered here and threaded to the components through their inject faces.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ui-conversation SlotMap merge (the `conversation.input.left` declaration).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ui-settings SlotMap merge (the `settings.section` entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the `remote` Context merge plus the `remote.voiceContext` namespace.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { TranscribeRequest, TranscribeResult } from '@deepseek-ai/dsh-voice-context/client'
import { VoiceInput, type VoiceInputInjected } from './VoiceInput.tsx'
import { VoiceSettingsSection, type VoiceSettingsInjected } from './VoiceSettings.tsx'
import { en, zh, type VoiceContextKey } from './locales.ts'

export type { VoiceContextKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Voice-Context mic control and settings page copy. */
    'voice-context': VoiceContextKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'voice-context'

/** The browser services this plugin consumes. */
export const inject = ['slots', 'locale', 'remote', 'remote.credentials', 'remote.voiceContext']

/**
 * Client plugin body: register the dictionaries, then contribute the mic
 * control and the settings page.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const voiceContext = ctx.remote.voiceContext
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-voice-context: dictionaries')
  // One bound translate serves the registration-time nav label and both inject
  // faces; the binding reads the active locale at call time.
  const t = ctx.locale.bind(NS)

  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'voice-context',
    order: 100,
    inject: (): VoiceInputInjected => ({
      t,
      transcribe: async (request: TranscribeRequest) => {
        // The recognizer's language follows the active locale, which resolves a
        // first visit from the browser's own preference.
        const result = await voiceContext.transcribe({
          ...request,
          ...(ctx.locale.getLocale().active === 'zh' ? { language: 'zh' } : {}),
        })
        if (!result.ok) return { ok: false, error: result.error.message }
        return { ok: true, text: result.value.text }
      },
    }),
  }, VoiceInput))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'voice-context',
    order: 40,
    label: () => t('mic.label'),
    inject: (): VoiceSettingsInjected => ({
      t,
      describeCredential: async (ref) => {
        const response = await ctx.remote.credentials.describe([ref])
        if (!response.ok) return undefined
        const view = response.value[ref]
        return view === undefined
          ? undefined
          : { configured: view.configured, writable: view.writable }
      },
      setCredential: async (ref, value) => {
        const response = await ctx.remote.credentials.set(ref, value)
        return response.ok ? undefined : response.error.message
      },
      unsetCredential: async (ref) => {
        const response = await ctx.remote.credentials.unset(ref)
        return response.ok ? undefined : response.error.message
      },
    }),
  }, VoiceSettingsSection))
}

export type { TranscribeRequest, TranscribeResult }
