/**
 * Recorder environment stubs shared by the recorder and VoiceInput specs: a
 * controllable MediaRecorder class, a fake AudioContext/buffer, and the
 * navigator.mediaDevices stream, so the real VoiceRecorder runs in jsdom.
 */
import { vi } from 'vitest'

/** A fake AudioBuffer the decoder converts to 16 kHz mono. */
export function fakeAudioBuffer(options: {
  sampleRate?: number
  channels?: number
  length?: number
  data?: Float32Array
} = {}): AudioBuffer {
  const { sampleRate = 48000, channels = 2, length = 960 } = options
  const channelData = options.data ?? new Float32Array(length).fill(0)
  return {
    sampleRate,
    length,
    numberOfChannels: channels,
    getChannelData: () => channelData,
  } as unknown as AudioBuffer
}

/** Controllable MediaRecorder instance; the test drives onstop/onerror. */
export class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true)
  static lastInstance: FakeMediaRecorder | undefined

  mimeType = 'audio/webm;codecs=opus'
  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  start = vi.fn(() => { this.state = 'recording' })
  stop = vi.fn(() => { this.state = 'inactive' })

  constructor(_stream: MediaStream, _options?: { mimeType?: string }) {
    FakeMediaRecorder.lastInstance = this
  }

  /** Feed one chunk through ondataavailable (zero-size chunks are dropped). */
  feed(data: Blob): void {
    if (this.ondataavailable !== null && data.size > 0) this.ondataavailable({ data })
  }
}

/** Fake AudioContext whose decodeAudioData resolves a fake buffer. */
export class FakeAudioContext {
  static lastInstance: FakeAudioContext | undefined
  /** Buffer served by every instance until a test swaps it before stop(). */
  static defaultBuffer: AudioBuffer = fakeAudioBuffer()
  decodeAudioData = vi.fn(async () => FakeAudioContext.defaultBuffer)
  close = vi.fn(async () => {})
  constructor() {
    FakeAudioContext.lastInstance = this
  }
}

/** A stream whose single track keeps a stable stop() spy. */
export function fakeStream(): MediaStream {
  const track = { stop: vi.fn() }
  return { getTracks: () => [track] } as unknown as MediaStream
}

/**
 * Install the recorder environment on globalThis: MediaRecorder, AudioContext,
 * and navigator.mediaDevices. Returns the stream getUserMedia resolves to.
 */
export function installRecorderEnvironment(): { stream: MediaStream } {
  const stream = fakeStream()
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('navigator', {
    ...navigator,
    language: 'en-US',
    mediaDevices: { getUserMedia: vi.fn(async () => stream) },
  })
  return { stream }
}
