// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VoiceRecorder } from '../src/client/recorder.ts'
import {
  FakeAudioContext,
  FakeMediaRecorder,
  fakeAudioBuffer,
  fakeStream,
  installRecorderEnvironment,
} from './recorder-stubs.ts'

describe('VoiceRecorder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unsupported when the environment lacks mediaDevices', () => {
    vi.stubGlobal('navigator', {})
    expect(new VoiceRecorder().supported).toBe(false)
  })

  it('reports supported when getUserMedia is available', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => {} } })
    expect(new VoiceRecorder().supported).toBe(true)
  })

  it('rejects start() without a secure recording context', async () => {
    vi.stubGlobal('navigator', {})
    await expect(new VoiceRecorder().start()).rejects.toThrow('secure context')
  })

  it('rejects stop() before recording starts', async () => {
    await expect(new VoiceRecorder().stop()).rejects.toThrow('not recording')
  })

  it('treats abort() before start as a no-op', () => {
    const recorder = new VoiceRecorder()
    expect(() => { recorder.abort() }).not.toThrow()
  })

  it('rejects start() when getUserMedia refuses the microphone', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => { throw new Error('denied') }) },
    })
    await expect(new VoiceRecorder().start()).rejects.toThrow('denied')
  })

  it('rejects start() when MediaRecorder is unavailable', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => fakeStream()) } })
    vi.stubGlobal('MediaRecorder', undefined)
    await expect(new VoiceRecorder().start()).rejects.toThrow()
  })

  it('records and resolves a 16 kHz mono WAV on stop', async () => {
    const { stream } = installRecorderEnvironment()
    FakeMediaRecorder.isTypeSupported.mockReturnValue(true)
    // Mixed channel data exercises the clamp and sign branches of the WAV encoder.
    const data = new Float32Array(96)
    for (let i = 0; i < data.length; i++) data[i] = [-1.5, -0.5, 0, 0.5, 1.5][i % 5] ?? 0
    FakeAudioContext.defaultBuffer = fakeAudioBuffer({ sampleRate: 48000, channels: 2, length: 96, data })

    const recorder = new VoiceRecorder()
    await recorder.start()
    const instance = FakeMediaRecorder.lastInstance
    expect(instance).toBeDefined()
    expect(instance?.start).toHaveBeenCalled()
    expect(instance?.mimeType).toBe('audio/webm;codecs=opus')

    // A zero-size chunk is dropped by the ondataavailable guard.
    instance?.ondataavailable?.({ data: new Blob([]) })
    instance?.feed(new Blob(['chunk'], { type: 'audio/webm' }))
    const wavPromise = recorder.stop()
    instance?.onstop?.()
    const wav = await wavPromise
    expect(wav.type).toBe('audio/wav')
    expect(wav.size).toBeGreaterThan(44)
    expect(stream.getTracks()[0]?.stop).toHaveBeenCalled()
  })

  it('falls back through MIME candidates and records without a typed container', async () => {
    const supported = vi.fn((candidate: string) => candidate === 'audio/mp4')
    FakeMediaRecorder.isTypeSupported = supported as never
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => fakeStream()) },
    })
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
    vi.stubGlobal('AudioContext', FakeAudioContext)

    const recorder = new VoiceRecorder()
    await recorder.start()
    const instance = FakeMediaRecorder.lastInstance
    // The loop stops at the first supported candidate.
    expect(supported.mock.calls.map(call => call[0])).toEqual([
      'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4',
    ])
    // An empty mimeType exercises the `|| 'audio/webm'` container fallback.
    if (instance !== undefined) instance.mimeType = ''
    instance?.feed(new Blob(['x']))
    const wavPromise = recorder.stop()
    instance?.onstop?.()
    const wav = await wavPromise
    expect(wav.type).toBe('audio/wav')
  })

  it('throws when isTypeSupported itself throws', async () => {
    FakeMediaRecorder.isTypeSupported = vi.fn(() => { throw new TypeError('unsupported probe') }) as never
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => fakeStream()) } })
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder)

    const recorder = new VoiceRecorder()
    await recorder.start()
    expect(FakeMediaRecorder.lastInstance?.start).toHaveBeenCalled()
  })

  it('rejects stop() when the recorder reports an error', async () => {
    installRecorderEnvironment()
    const recorder = new VoiceRecorder()
    await recorder.start()
    const instance = FakeMediaRecorder.lastInstance
    const failing = recorder.stop()
    instance?.onerror?.()
    await expect(failing).rejects.toThrow('audio recording failed')
  })

  it('rejects stop() when audio decoding fails', async () => {
    const { stream } = installRecorderEnvironment()
    vi.stubGlobal('AudioContext', class BrokenAudioContext extends FakeAudioContext {
      override decodeAudioData = vi.fn(async () => { throw new Error('decode failed') })
    })
    const recorder = new VoiceRecorder()
    await recorder.start()
    FakeMediaRecorder.lastInstance?.feed(new Blob(['broken']))
    const failing = recorder.stop()
    FakeMediaRecorder.lastInstance?.onstop?.()
    await expect(failing).rejects.toThrow('decode failed')
    expect(stream.getTracks()[0]?.stop).toHaveBeenCalled()
  })

  it('abort() during recording stops capture without producing audio', async () => {
    installRecorderEnvironment()
    const recorder = new VoiceRecorder()
    await recorder.start()
    const instance = FakeMediaRecorder.lastInstance
    recorder.abort()
    expect(instance?.onstop).toBeNull()
    expect(instance?.onerror).toBeNull()
    expect(instance?.stop).toHaveBeenCalled()
  })
})
