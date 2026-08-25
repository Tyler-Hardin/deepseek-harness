// @vitest-environment jsdom
// VoiceSettingsSection (settings page): backend/model routing preference,
// cloud credential write through the credentials domain, and status display.
// Copy arrives through the `t` seat the plugin binds; the harness stages the
// shipped dictionary for the language under test.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { VoiceSettingsSection } from '../src/client/VoiceSettings.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const KEY_REF = 'SILICONFLOW_API_KEY'
const CLOUD_PREFERENCE = JSON.stringify({ backend: 'cloud', model: 'FunAudioLLM/SenseVoiceSmall' })

type VoiceSettingsProps = Parameters<typeof VoiceSettingsSection>[0]

function credentialsHarness(
  overrides: Partial<Record<'describe' | 'set' | 'unset', (...args: string[]) => unknown>> = {},
  t: VoiceSettingsProps['t'] = makeTranslate(en),
) {
  // Cloud routing renders the credential section; the routing tests switch to
  // local explicitly.
  window.localStorage.setItem('dsh.voice-context.preference.v1', CLOUD_PREFERENCE)
  const credentials = {
    describe: vi.fn(async () => ({ configured: false, writable: true })) as (...args: string[]) => unknown,
    set: vi.fn(async () => {}) as (...args: string[]) => unknown,
    unset: vi.fn(async () => {}) as (...args: string[]) => unknown,
    ...overrides,
  }
  // The page receives the credentials operations the plugin binds from
  // `ctx.remote.credentials`; the harness scripts those three directly.
  render(<VoiceSettingsSection {...({
    describeCredential: (ref: string) => credentials.describe(ref),
    setCredential: (ref: string, value: string) => credentials.set(ref, value),
    unsetCredential: (ref: string) => credentials.unset(ref),
    t,
  } as unknown as VoiceSettingsProps)} />)
  return credentials
}

describe('VoiceSettingsSection', () => {
  it('renders the page and reports an unconfigured credential', async () => {
    credentialsHarness()
    expect(screen.getByText('Voice-Context')).toBeDefined()
    expect(await screen.findByText('Not configured')).toBeDefined()
  })

  it('reports a configured credential', async () => {
    credentialsHarness({
      describe: vi.fn(async () => ({ configured: true, writable: true })),
    })
    expect(await screen.findByText('Configured')).toBeDefined()
  })

  it('stays usable when the credential describe call fails', async () => {
    credentialsHarness({ describe: vi.fn(async () => { throw new Error('offline') }) })
    expect(await screen.findByText('Voice-Context')).toBeDefined()
  })

  it('stays usable when the credential describe call reports failure', async () => {
    // An unreadable reference reports nothing, so the page keeps its last state.
    credentialsHarness({ describe: vi.fn(async () => undefined) })
    expect(await screen.findByText('Voice-Context')).toBeDefined()
  })

  it('treats an absent credential entry as unconfigured', async () => {
    credentialsHarness({ describe: vi.fn(async () => ({ configured: false, writable: true })) })
    expect(await screen.findByText('Not configured')).toBeDefined()
    expect(screen.getByPlaceholderText<HTMLInputElement>(`value for ${KEY_REF}`).disabled).toBe(false)
  })

  it('writes a typed API key through the credentials domain', async () => {
    const credentials = credentialsHarness()
    const input = screen.getByPlaceholderText(`value for ${KEY_REF}`)
    fireEvent.change(input, { target: { value: 'sk-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => { expect(credentials.set).toHaveBeenCalledWith(KEY_REF, 'sk-123') })
    expect(await screen.findByText('Saved')).toBeDefined()
  })

  it('unsets the credential when the field is cleared', async () => {
    const credentials = credentialsHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => { expect(credentials.unset).toHaveBeenCalledWith(KEY_REF) })
  })

  it('reports a failed credential save', async () => {
    credentialsHarness({ set: vi.fn(async () => { throw new Error('denied') }) })
    fireEvent.change(screen.getByPlaceholderText(`value for ${KEY_REF}`), { target: { value: 'sk-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Save failed')).toBeDefined()
  })

  it('disables the credential controls when not writable', async () => {
    credentialsHarness({ describe: vi.fn(async () => ({ configured: false, writable: false })) })
    const input = screen.getByPlaceholderText(`value for ${KEY_REF}`)
    await vi.waitFor(() => { expect((input as HTMLInputElement).disabled).toBe(true) })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(true)
  })

  it('switches backend and model routing and persists the preference', async () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Local offline'))
    const modelSelect = screen.getByRole('combobox')
    expect(modelSelect).toHaveProperty('value', 'small')
    fireEvent.change(modelSelect, { target: { value: 'large-v3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save voice configuration' }))
    await vi.waitFor(() => { expect(screen.getByText('Configured')).toBeDefined() })
    const stored = window.localStorage.getItem('dsh.voice-context.preference.v1')
    expect(stored).toContain('"backend":"local"')
    expect(stored).toContain('"model":"large-v3"')
  })

  it('keeps the cloud backend and exposes the cloud model', async () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Cloud API'))
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'FunAudioLLM/SenseVoiceSmall')
    expect(screen.getByPlaceholderText(`value for ${KEY_REF}`)).toBeDefined()
  })

  it('labels the local model options from the dictionary', () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Local offline'))
    expect(screen.getByRole('option', { name: 'SenseVoiceSmall (Chinese preferred)' })).toBeDefined()
    expect(screen.getByRole('option', { name: 'faster-whisper large-v3' })).toBeDefined()
  })

  it('renders the Chinese page copy from the zh dictionary', async () => {
    credentialsHarness({}, makeTranslate(zh))
    expect(await screen.findByText('语音输入（Voice-Context）')).toBeDefined()
    expect(screen.getByText('首次使用请选择云端 API 或本地离线模型；麦克风会按此选择逐次转写。')).toBeDefined()
    expect(screen.getByLabelText('云端 API')).toBeDefined()
    expect(screen.getByText('未配置')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存语音配置' }))
    await vi.waitFor(() => { expect(screen.getByText('语音配置已保存')).toBeDefined() })
  })

  it('selects the paired model when switching backends', () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Local offline'))
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'small')
    fireEvent.click(screen.getByLabelText('Cloud API'))
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'FunAudioLLM/SenseVoiceSmall')
  })

  it('shows a configured credential in Chinese', async () => {
    credentialsHarness({ describe: vi.fn(async () => ({ configured: true, writable: true })) }, makeTranslate(zh))
    expect((await screen.findAllByText('已配置')).length).toBeGreaterThan(0)
  })

  it('confirms a Chinese credential save', async () => {
    credentialsHarness({}, makeTranslate(zh))
    fireEvent.change(screen.getByPlaceholderText(`配置 ${KEY_REF} 的值`), { target: { value: 'sk-zh' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已保存')).toBeDefined()
  })

  it('reports a failed Chinese credential save', async () => {
    credentialsHarness({ set: vi.fn(async () => { throw new Error('denied') }) }, makeTranslate(zh))
    fireEvent.change(screen.getByPlaceholderText(`配置 ${KEY_REF} 的值`), { target: { value: 'sk-zh' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存失败')).toBeDefined()
  })

  it('shows the unsaved routing status in Chinese', () => {
    renderUnsaved(makeTranslate(zh))
    expect(screen.getByText('尚未保存')).toBeDefined()
  })

  it('shows the unsaved routing status before a preference is stored', () => {
    window.localStorage.clear()
    renderUnsaved()
    expect(screen.getByText('Not saved')).toBeDefined()
  })
})

/** Render the settings section with no stored routing preference. */
function renderUnsaved(t: VoiceSettingsProps['t'] = makeTranslate(en)): void {
  const props = {
    describeCredential: vi.fn(async () => undefined),
    setCredential: vi.fn(async () => undefined),
    unsetCredential: vi.fn(async () => undefined),
    t,
  } as unknown as VoiceSettingsProps
  render(<VoiceSettingsSection {...props} />)
}
