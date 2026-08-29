import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import VoiceContextService from '../src/index.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('VoiceContextService', () => {
  it('mounts the voice-local command through the optional commands service', async () => {
    const ctx = new Context()
    const register = vi.fn()
    ctx.provide('commands', { register } as never)
    await ctx.plugin(VoiceContextService)
    await vi.waitFor(() => { expect(register).toHaveBeenCalled() })
    const definition = register.mock.calls[0]?.[0] as { handler: (invocation: CommandInvocation) => Promise<unknown> }
    await definition.handler({ rawInput: 'status', signal: new AbortController().signal } as CommandInvocation)
  })

  it('forwards a loopback transcription request', async () => {
    const ctx = new Context()
    const service = new VoiceContextService(ctx, { baseUrl: 'http://127.0.0.1:8000', model: 'small' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'hello world' }), { status: 200 })))
    const result = await service.transcribe({
      audio: Buffer.from('audio-bytes').toString('base64'),
      mimeType: 'audio/wav',
      backend: 'local',
      model: 'small',
    })
    expect(result.text).toBe('hello world')
  })
})
