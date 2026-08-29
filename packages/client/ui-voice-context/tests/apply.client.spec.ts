// @vitest-environment jsdom
// apply wiring: the mic button registered into the composer tool row, the
// settings page into settings.section, and the injected transcribe face
// mapping the voice-context Remote results onto the composer surface.

import { describe, expect, it, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import type { TranscribeOutcome } from '../src/client/VoiceInput.tsx'
import { apply, inject } from '../src/client/index.ts'

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const transcribe = vi.fn()
  runtime.provide('connection', { api: { credentials: {} } })
  runtime.provide('remote', { voiceContext: { transcribe } })
  runtime.provide('remote.voiceContext', { transcribe })

  // Declared by ui-conversation's and ui-settings' root entries in production;
  // the test root declares them here so the contributions land.
  await runtime.root.declare({
    'conversation.input.left': { kind: 'list', scope: 'session' },
    'settings.section': { kind: 'list', scope: 'root' },
  }, (_p: { renderSlot?: unknown }) => null)

  await runtime.mount({ inject: [...inject], apply })
  return { runtime, transcribe }
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

  it('exposes the settings section label and the connection api face', async () => {
    const b = await bench()
    try {
      const entry = b.runtime.slots.entries('settings.section')[0] as {
        options?: { label?: () => string }
        inject?: () => unknown
      }
      expect(entry.options?.label?.()).toBe('Voice input')
      expect(entry.inject?.()).toEqual({ api: { credentials: {} } })
    } finally {
      await b.runtime.dispose()
    }
  })

  it('uses the Chinese settings label for zh browsers', async () => {
    vi.stubGlobal('navigator', { language: 'zh-CN' })
    const b = await bench()
    try {
      const entry = b.runtime.slots.entries('settings.section')[0] as { options?: { label?: () => string } }
      expect(entry.options?.label?.()).toBe('语音输入')
    } finally {
      await b.runtime.dispose()
    }
  })
})
