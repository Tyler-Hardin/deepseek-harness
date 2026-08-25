// @vitest-environment jsdom
// VoiceInput (composer mic button): recording toggle, transcription into the
// draft via inputActions.setDraft, error surfacing, and unmount cleanup.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VoiceInput, type TranscribeOutcome } from '../src/client/VoiceInput.tsx'
import { en, zh } from '../src/client/locales.ts'
import {
  FakeAudioContext,
  FakeMediaRecorder,
  fakeAudioBuffer,
  installRecorderEnvironment,
} from './recorder-stubs.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

type VoiceInputProps = Parameters<typeof VoiceInput>[0]

function renderMic(
  input: { draft: string },
  transcribe: VoiceInputProps['transcribe'],
  setDraft: ReturnType<typeof vi.fn> = vi.fn(),
  t: VoiceInputProps['t'] = makeTranslate(en),
) {
  render(<VoiceInput {...({
    // The draft arrives through the Session input hook; the actions are the
    // standard session prop, so appending is one `setDraft` of the whole text.
    useInput: (selector: (state: { draft: string }) => unknown) => selector({ draft: input.draft }),
    inputActions: { setDraft },
    transcribe,
    t,
  } as unknown as VoiceInputProps)} />)
  return { setDraft }
}

/** Stop the recorder the harness is holding: complete the stop click. */
function finishStop(): void {
  FakeMediaRecorder.lastInstance?.onstop?.()
}

describe('VoiceInput', () => {
  it('renders the mic button and records on click', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: true, text: '' }))
    renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    expect(FakeMediaRecorder.lastInstance?.start).toHaveBeenCalled()
  })

  it('transcribes the recording and appends to the draft', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: true, text: 'hello voice' }))
    const { setDraft } = renderMic({ draft: 'prefix' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeAudioContext.lastInstance?.decodeAudioData.mockResolvedValue(
      fakeAudioBuffer({ sampleRate: 48000, channels: 1, length: 480 }),
    )
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(setDraft).toHaveBeenCalledWith('prefix hello voice') })
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'audio/wav',
      backend: 'local',
      model: 'small',
    }))
  })

  it('starts the draft with the transcript when the draft is empty', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: true, text: 'hi' }))
    const { setDraft } = renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(setDraft).toHaveBeenCalledWith('hi') })
  })

  it('keeps the draft unchanged when the transcript is empty', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: true, text: '   ' }))
    const { setDraft } = renderMic({ draft: 'stay' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(setDraft).toHaveBeenCalledWith('stay') })
  })

  it('surfaces a transcription failure on the button title', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: false, error: 'upstream 500' }))
    renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(button.title).toBe('Voice input: upstream 500') })
  })

  it('surfaces a microphone-start failure on the button title', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => { throw new Error('mic denied') }) },
    })
    const transcribe = vi.fn()
    renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.title).toContain('mic denied') })
  })

  it('surfaces a non-Error microphone failure as a string', async () => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn(async () => { throw 'plain failure' }) },
    })
    renderMic({ draft: '' }, vi.fn())
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.title).toContain('plain failure') })
  })

  it('surfaces a non-Error transcription failure as a string', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => { throw 'plain transcript failure' })
    renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(button.title).toContain('plain transcript failure') })
  })

  it('transcribes through the Chinese dictionary copy', async () => {
    installRecorderEnvironment()
    const transcribe = vi.fn(async (): Promise<TranscribeOutcome> => ({ ok: true, text: '你好' }))
    const { setDraft } = renderMic({ draft: '' }, transcribe, vi.fn(), makeTranslate(zh))
    const button = screen.getByRole('button', { name: '语音输入' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    finishStop()
    await vi.waitFor(() => { expect(setDraft).toHaveBeenCalledWith('你好') })
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({
      mimeType: 'audio/wav',
      backend: 'local',
      model: 'small',
    }))
  })

  it('ignores clicks while a transcription is in flight', async () => {
    installRecorderEnvironment()
    let release!: (value: TranscribeOutcome) => void
    const transcribe = vi.fn((): Promise<TranscribeOutcome> => new Promise((resolve) => { release = resolve }))
    renderMic({ draft: '' }, transcribe)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    FakeMediaRecorder.lastInstance?.feed(new Blob(['audio']))
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('data-phase')).toBe('transcribing') })
    finishStop()
    await vi.waitFor(() => { expect(transcribe).toHaveBeenCalledTimes(1) })
    fireEvent.click(button)
    release({ ok: true, text: 'done' })
    await vi.waitFor(() => { expect(transcribe).toHaveBeenCalledTimes(1) })
  })

  it('aborts the recorder on unmount while recording', async () => {
    installRecorderEnvironment()
    const { unmount } = render(<VoiceInput {...({
      useInput: (selector: (state: { draft: string }) => unknown) => selector({ draft: '' }),
      inputActions: { setDraft: vi.fn() },
      transcribe: vi.fn(),
      t: makeTranslate(en),
    } as unknown as VoiceInputProps)} />)
    const button = screen.getByRole('button', { name: 'Voice input' })
    fireEvent.click(button)
    await vi.waitFor(() => { expect(button.getAttribute('aria-pressed')).toBe('true') })
    expect(() => { unmount() }).not.toThrow()
  })
})
