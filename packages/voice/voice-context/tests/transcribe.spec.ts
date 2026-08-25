import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { transcribeAudio } from '../src/transcribe.ts'
import type { ResolvedConfig } from '../src/config.ts'

/** Fully-defaulted cloud configuration for the tests. */
function cloudConfig(): ResolvedConfig {
  return {
    apiKey: 'sk-test',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    baseUrl: 'https://api.siliconflow.cn',
    model: 'FunAudioLLM/SenseVoiceSmall',
    language: 'zh',
    maxBytes: 25 * 1024 * 1024,
    timeoutMs: 60000,
    localPort: 8080,
    pythonBin: 'python',
    modelRoot: '/tmp/stt-models',
  }
}

describe('transcribeAudio', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('forwards base64 audio to the provider and returns the transcript', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: '你好' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeAudio(new Context(), cloudConfig(), {
      audio: Buffer.from('hi').toString('base64'),
      mimeType: 'audio/wav',
    })

    expect(result.text).toBe('你好')
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.siliconflow.cn/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('resolves the credential through the credentials seam when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    vi.spyOn(ctx, 'get').mockImplementation((key: string) => key === 'credentials'
      ? { resolve: async () => ({ value: 'from-credential', source: 'env' }) }
      : undefined)

    await transcribeAudio(ctx, { ...cloudConfig(), apiKey: '' }, { audio: 'aGk=', mimeType: 'audio/wav' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer from-credential')
  })

  it('throws for a cloud backend when no credential is configured', async () => {
    vi.stubEnv('SILICONFLOW_API_KEY', '')
    await expect(transcribeAudio(new Context(), { ...cloudConfig(), apiKey: '' }, {
      audio: 'aGk=',
      mimeType: 'audio/wav',
    })).rejects.toThrow('no STT credential configured')
  })

  it('forwards a loopback backend without an Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'local' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeAudio(new Context(), {
      ...cloudConfig(),
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8080',
    }, { audio: 'aGk=', mimeType: 'audio/wav' })

    expect(result.text).toBe('local')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it('routes an explicit local model to the managed loopback port', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'local medium' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), { ...cloudConfig(), localPort: 8000 }, {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'local',
      model: 'medium',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:8000/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
    expect((init.body as FormData).get('model')).toBe('medium')
  })

  it('routes an explicit cloud request away from a configured loopback backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'cloud' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), {
      ...cloudConfig(),
      baseUrl: 'http://127.0.0.1:8000',
    }, {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'cloud',
      model: 'FunAudioLLM/SenseVoiceSmall',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.siliconflow.cn/v1/audio/transcriptions')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
  })

  it('rejects a local-only model on the cloud route', async () => {
    await expect(transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'cloud',
      model: 'small',
    })).rejects.toThrow('invalid cloud STT model')
  })

  it('throws when the provider answers an error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'bad model' }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
    })).rejects.toThrow('bad model')
  })

  it('extracts the result field from a provider response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 'from result' }), { status: 200 })))

    const result = await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })
    expect(result.text).toBe('from result')
  })

  it('joins provider segments into a transcript', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      segments: [{ text: 'a' }, null, { text: 'b' }],
    }), { status: 200 })))

    const result = await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })
    expect(result.text).toBe('ab')
  })

  it('returns an empty transcript for a segment list without text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ segments: [null] }), { status: 200 })))

    const result = await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })
    expect(result.text).toBe('')
  })

  it('returns an empty transcript for a non-JSON provider body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('plain text', { status: 200 })))

    const result = await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })
    expect(result.text).toBe('')
  })

  it('tolerates an unresolvable provider URL when routing cloud', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeAudio(new Context(), { ...cloudConfig(), baseUrl: 'not a url' }, {
      audio: 'aGk=',
      mimeType: 'audio/wav',
    })
    expect(result.text).toBe('ok')
    expect(fetchMock.mock.calls[0]?.[0]).toBe('not a url/v1/audio/transcriptions')
  })

  it('rejects an empty audio payload', async () => {
    await expect(transcribeAudio(new Context(), cloudConfig(), {
      audio: '',
      mimeType: 'audio/wav',
    })).rejects.toThrow('empty audio payload')
  })

  it('rejects an audio payload above the configured cap', async () => {
    await expect(transcribeAudio(new Context(), { ...cloudConfig(), maxBytes: 4 }, {
      audio: Buffer.from('too long').toString('base64'),
      mimeType: 'audio/wav',
    })).rejects.toThrow('exceeds maxBytes')
  })

  it('returns an empty transcript for a response without a text field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'x' }), { status: 200 })))

    const result = await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })
    expect(result.text).toBe('')
  })

  it('names the upstream status when an error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('oops', { status: 503 })))

    await expect(transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
    })).rejects.toThrow('upstream STT failed (503)')
  })

  it('defaults the model for an explicit local backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'sensevoice' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'local',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.body as FormData).get('model')).toBe('iic/SenseVoiceSmall')
  })

  it('rejects an unknown local model', async () => {
    await expect(transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'local',
      model: 'turbo' as never,
    })).rejects.toThrow('invalid local STT model')
  })

  it('defaults the model for an explicit cloud backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'cloud' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), cloudConfig(), {
      audio: 'aGk=',
      mimeType: 'audio/wav',
      backend: 'cloud',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.body as FormData).get('model')).toBe('FunAudioLLM/SenseVoiceSmall')
  })

  it('falls through to the literal key when the credential seam resolves nothing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    vi.spyOn(ctx, 'get').mockImplementation((key: string) => key === 'credentials'
      ? { resolve: async () => undefined }
      : undefined)

    await transcribeAudio(ctx, cloudConfig(), { audio: 'aGk=', mimeType: 'audio/wav' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk-test')
  })

  it('resolves the key from the ambient environment', async () => {
    vi.stubEnv('SILICONFLOW_API_KEY', 'from-env')
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), { ...cloudConfig(), apiKey: '' }, { audio: 'aGk=', mimeType: 'audio/wav' })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer from-env')
  })

  it('throws for a cloud backend when no credential exists anywhere', async () => {
    const key = process.env.SILICONFLOW_API_KEY
    delete process.env.SILICONFLOW_API_KEY
    try {
      await expect(transcribeAudio(new Context(), { ...cloudConfig(), apiKey: '' }, {
        audio: 'aGk=',
        mimeType: 'audio/wav',
      })).rejects.toThrow('no STT credential configured')
    } finally {
      if (key !== undefined) process.env.SILICONFLOW_API_KEY = key
    }
  })

  it.each([
    ['audio/webm', 'audio.webm'],
    ['audio/mp4', 'audio.m4a'],
    ['audio/ogg', 'audio.ogg'],
    ['audio/mpeg', 'audio.mp3'],
  ] as const)('names the upstream file from the %s container', async (mimeType, filename) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'ok' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await transcribeAudio(new Context(), cloudConfig(), { audio: 'aGk=', mimeType })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const file = (init.body as FormData).get('file') as File
    expect(file.name).toBe(filename)
  })
})
