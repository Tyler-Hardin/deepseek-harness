// @vitest-environment jsdom
// VoiceSettingsSection (settings page): backend/model routing preference,
// cloud credential write through the credentials domain, and status display.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VoiceSettingsSection } from '../src/client/VoiceSettings.tsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

const KEY_REF = 'SILICONFLOW_API_KEY'
const CLOUD_PREFERENCE = JSON.stringify({ backend: 'cloud', model: 'FunAudioLLM/SenseVoiceSmall' })

function credentialsHarness(overrides: Partial<Record<'describe' | 'set' | 'unset', ReturnType<typeof vi.fn>>> = {}) {
  // Cloud routing renders the credential section; the routing tests switch to
  // local explicitly.
  window.localStorage.setItem('dsh.voice-context.preference.v1', CLOUD_PREFERENCE)
  const credentials = {
    describe: vi.fn(async () => ({
      result: { ok: true, value: { credentials: { [KEY_REF]: { configured: false, writable: true } } } },
    })),
    set: vi.fn(async () => {}),
    unset: vi.fn(async () => {}),
    ...overrides,
  }
  render(<VoiceSettingsSection {...({ api: { credentials } } as unknown as Parameters<typeof VoiceSettingsSection>[0])} />)
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
      describe: vi.fn(async () => ({
        result: { ok: true, value: { credentials: { [KEY_REF]: { configured: true, writable: true } } } },
      })),
    })
    expect(await screen.findByText('Configured')).toBeDefined()
  })

  it('stays usable when the credential describe call fails', async () => {
    credentialsHarness({ describe: vi.fn(async () => { throw new Error('offline') }) })
    expect(await screen.findByText('Voice-Context')).toBeDefined()
  })

  it('stays usable when the credential describe call reports failure', async () => {
    credentialsHarness({ describe: vi.fn(async () => ({ result: { ok: false } })) })
    expect(await screen.findByText('Voice-Context')).toBeDefined()
  })

  it('treats an absent credential entry as unconfigured', async () => {
    credentialsHarness({
      describe: vi.fn(async () => ({
        result: { ok: true, value: { credentials: {} } },
      })),
    })
    expect(await screen.findByText('Not configured')).toBeDefined()
    expect((screen.getByPlaceholderText(`value for ${KEY_REF}`) as HTMLInputElement).disabled).toBe(false)
  })

  it('writes a typed API key through the credentials domain', async () => {
    const credentials = credentialsHarness()
    const input = screen.getByPlaceholderText(`value for ${KEY_REF}`)
    fireEvent.change(input, { target: { value: 'sk-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(credentials.set).toHaveBeenCalledWith({ ref: KEY_REF, value: 'sk-123' }))
    expect(await screen.findByText('Saved')).toBeDefined()
  })

  it('unsets the credential when the field is cleared', async () => {
    const credentials = credentialsHarness()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(credentials.unset).toHaveBeenCalledWith({ ref: KEY_REF }))
  })

  it('reports a failed credential save', async () => {
    credentialsHarness({ set: vi.fn(async () => { throw new Error('denied') }) })
    fireEvent.change(screen.getByPlaceholderText(`value for ${KEY_REF}`), { target: { value: 'sk-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Save failed')).toBeDefined()
  })

  it('disables the credential controls when not writable', async () => {
    credentialsHarness({
      describe: vi.fn(async () => ({
        result: { ok: true, value: { credentials: { [KEY_REF]: { configured: false, writable: false } } } },
      })),
    })
    const input = screen.getByPlaceholderText(`value for ${KEY_REF}`)
    await vi.waitFor(() => expect((input as HTMLInputElement).disabled).toBe(true))
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('switches backend and model routing and persists the preference', async () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Local offline'))
    const modelSelect = screen.getByRole('combobox')
    expect(modelSelect).toHaveProperty('value', 'small')
    fireEvent.change(modelSelect, { target: { value: 'large-v3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save voice configuration' }))
    await vi.waitFor(() => expect(screen.getByText('Configured')).toBeDefined())
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

  it('uses the Chinese copy for zh browsers', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'zh-CN' })
    credentialsHarness()
    expect(await screen.findByText('语音输入（Voice-Context）')).toBeDefined()
    expect(screen.getByLabelText('云端 API')).toBeDefined()
    expect(screen.getByText('未配置')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '保存语音配置' }))
    await vi.waitFor(() => expect(screen.getByText('语音配置已保存')).toBeDefined())
  })

  it('selects the paired model when switching backends', () => {
    credentialsHarness()
    fireEvent.click(screen.getByLabelText('Local offline'))
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'small')
    fireEvent.click(screen.getByLabelText('Cloud API'))
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'FunAudioLLM/SenseVoiceSmall')
  })

  it('shows a configured credential in Chinese', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'zh-CN' })
    credentialsHarness({
      describe: vi.fn(async () => ({
        result: { ok: true, value: { credentials: { [KEY_REF]: { configured: true, writable: true } } } },
      })),
    })
    expect((await screen.findAllByText('已配置')).length).toBeGreaterThan(0)
  })

  it('confirms a Chinese credential save', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'zh-CN' })
    credentialsHarness()
    fireEvent.change(screen.getByPlaceholderText(`配置 ${KEY_REF} 的值`), { target: { value: 'sk-zh' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('已保存')).toBeDefined()
  })

  it('reports a failed Chinese credential save', async () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'zh-CN' })
    credentialsHarness({ set: vi.fn(async () => { throw new Error('denied') }) })
    fireEvent.change(screen.getByPlaceholderText(`配置 ${KEY_REF} 的值`), { target: { value: 'sk-zh' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(await screen.findByText('保存失败')).toBeDefined()
  })

  it('shows the unsaved routing status in Chinese', () => {
    vi.stubGlobal('navigator', { ...navigator, language: 'zh-CN' })
    renderUnsaved()
    expect(screen.getByText('尚未保存')).toBeDefined()
  })

  it('shows the unsaved routing status before a preference is stored', () => {
    window.localStorage.clear()
    renderUnsaved()
    expect(screen.getByText('Not saved')).toBeDefined()
  })
})

/** Render the settings section with no stored routing preference. */
function renderUnsaved(): void {
  const props = {
    api: { credentials: { describe: vi.fn(), set: vi.fn(), unset: vi.fn() } },
  } as unknown as Parameters<typeof VoiceSettingsSection>[0]
  render(<VoiceSettingsSection {...props} />)
}
