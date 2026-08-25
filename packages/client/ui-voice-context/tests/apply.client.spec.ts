// @vitest-environment jsdom
// apply wiring: the mic button registered into the composer tool row, the
// settings page into settings.section, the injected transcribe face mapping
// the voice-context Remote results onto the composer surface, and the locale
// dictionaries feeding both surfaces.

import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { TranscribeOutcome } from '../src/client/VoiceInput.tsx'
import { apply, inject } from '../src/client/index.ts'

/** Namespace the plugin owns; the spec addresses it as a locale consumer would. */
const NS = 'voice-context'

async function bench(language: 'en' | 'zh' = 'en') {
  const runtime = await SlotTestRuntime.create()
  // The production locale service: the plugin registers its dictionaries on it
  // and binds them for both surfaces.
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale(language)
  runtime.ctx.provide('locale', locale)
  const transcribe = vi.fn()
  const credentials = {
    describe: vi.fn(async () => ({})),
    set: vi.fn(async () => undefined),
    unset: vi.fn(async () => undefined),
  }
  const remote = { voiceContext: { transcribe }, credentials }
  runtime.ctx.provide('remote', remote)
  runtime.ctx.provide('remote.voiceContext', { transcribe })
  runtime.ctx.provide('remote.credentials', credentials)

  // Declared by ui-conversation's and ui-settings' root entries in production;
  // the test root declares them here so the contributions land.
  await runtime.root.declare({
    'conversation.input.left': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  }, (_p: { renderSlot?: unknown }) => null)

  await runtime.mount({ inject: [...inject], apply })
  return { runtime, transcribe, locale }
}

/** The injected face of the first stored entry for a key. */
function faceOf(runtime: Awaited<ReturnType<typeof bench>>['runtime'], key: never): {
  transcribe: (request: unknown) => Promise<TranscribeOutcome>
} {
  const entry = runtime.slots.entries(key)[0] as { inject?: () => unknown }
  return entry.inject?.() as { transcribe: (request: unknown) => Promise<TranscribeOutcome> }
}

describe('voice-context apply wiring', () => {
  it('registers the mic button into the composer tool row', async () => {
    const b = await bench()
    try {
      const entries = b.runtime.slots.entries('conversation.input.left')
      expect(entries.map(entry => entry.options.id)).toEqual(['voice-context'])
      expect(entries[0]?.options.order).toBe(100)
    } finally {
      await b.runtime.dispose()
    }
  })

  it('maps a successful Remote transcription onto the injected face', async () => {
    const b = await bench()
    try {
      b.transcribe.mockResolvedValue({ ok: true, value: { text: 'hello' } })
      await expect(faceOf(b.runtime, 'conversation.input.left' as never).transcribe({ audio: 'a' }))
        .resolves.toEqual({ ok: true, text: 'hello' })
    } finally {
      await b.runtime.dispose()
    }
  })

  it('maps a Remote failure onto the injected face', async () => {
    const b = await bench()
    try {
      b.transcribe.mockResolvedValue({ ok: false, error: { message: 'upstream failed' } })
      await expect(faceOf(b.runtime, 'conversation.input.left' as never).transcribe({ audio: 'a' }))
        .resolves.toEqual({ ok: false, error: 'upstream failed' })
    } finally {
      await b.runtime.dispose()
    }
  })

  it('registers both dictionaries under its own namespace', async () => {
    const b = await bench()
    try {
      expect(b.locale.bind(NS)('mic.label')).toBe('Voice input')
      b.locale.setLocale('zh')
      expect(b.locale.bind(NS)('mic.label')).toBe('语音输入')
      expect(b.locale.bind(NS)('key.placeholder', { ref: 'REF' })).toBe('配置 REF 的值')
    } finally {
      await b.runtime.dispose()
    }
  })

  it('sends the active locale as the recognizer language hint', async () => {
    const b = await bench('zh')
    try {
      b.transcribe.mockResolvedValue({ ok: true, value: { text: 'hello' } })
      const request = { audio: 'a', mimeType: 'audio/wav', backend: 'local', model: 'small' }
      await faceOf(b.runtime, 'conversation.input.left' as never).transcribe(request)
      expect(b.transcribe).toHaveBeenCalledWith({ ...request, language: 'zh' })
    } finally {
      await b.runtime.dispose()
    }
  })

  it('leaves the language to the Host default outside the Chinese locale', async () => {
    const b = await bench()
    try {
      b.transcribe.mockResolvedValue({ ok: true, value: { text: 'hello' } })
      const request = { audio: 'a', mimeType: 'audio/wav', backend: 'local', model: 'small' }
      await faceOf(b.runtime, 'conversation.input.left' as never).transcribe(request)
      expect(b.transcribe).toHaveBeenCalledWith(request)
    } finally {
      await b.runtime.dispose()
    }
  })

  it('registers the settings section page', async () => {
    const b = await bench()
    try {
      const entries = b.runtime.slots.entries('settings.section')
      expect(entries.map(entry => entry.options.id)).toEqual(['voice-context'])
      expect(entries[0]?.options.order).toBe(40)
    } finally {
      await b.runtime.dispose()
    }
  })

  it('exposes the settings section label and the credentials operations', async () => {
    const b = await bench()
    try {
      const entry = b.runtime.slots.entries('settings.section')[0] as {
        options?: { label?: () => string }
        inject?: () => Record<string, unknown>
      }
      expect(entry.options?.label?.()).toBe('Voice input')
      expect(Object.keys(entry.inject?.() ?? {}).sort())
        .toEqual(['describeCredential', 'setCredential', 't', 'unsetCredential'])
    } finally {
      await b.runtime.dispose()
    }
  })

  it('labels the settings section from the Chinese dictionary', async () => {
    const b = await bench('zh')
    try {
      const entry = b.runtime.slots.entries('settings.section')[0] as { options?: { label?: () => string } }
      expect(entry.options?.label?.()).toBe('语音输入')
    } finally {
      await b.runtime.dispose()
    }
  })
})
