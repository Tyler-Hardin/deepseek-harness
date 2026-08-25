// @vitest-environment jsdom
/**
 * AppSection rendering and gestures: initial values come from the injected
 * bridge face, Save forwards the trimmed hostname, Forget clears the
 * certificate and refreshes the row, the Clear buttons forward to the
 * diagnostics and crash-log clear methods and refresh, Refresh re-reads the
 * whole surface, and a throwing bridge surfaces a visible alert instead of
 * crashing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppSection, type AppSettingsInjected } from '../src/client/AppSection.tsx'
import { en, type AppSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Locale stub faithful to the real interpolation ({name} placeholders). */
const t = (key: string, params?: Record<string, unknown>): string => {
  const text = en[key as AppSettingsLocaleKey] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
}

interface BridgeHarness {
  calls: AppSettingsInjected & {
    getServerUrl: ReturnType<typeof vi.fn>
    setServerUrl: ReturnType<typeof vi.fn>
    getCertInfo: ReturnType<typeof vi.fn>
    forgetCertificate: ReturnType<typeof vi.fn>
    getDiagnostics: ReturnType<typeof vi.fn>
    clearDiagnostics: ReturnType<typeof vi.fn>
    getCrashLog: ReturnType<typeof vi.fn>
    clearCrashLog: ReturnType<typeof vi.fn>
    getAppInfo: ReturnType<typeof vi.fn>
  }
  renderSection: () => ReturnType<typeof render>
}

/** Mutable bridge stub: getters reflect prior mutations, setters are spies. */
function makeBridge(): BridgeHarness {
  let cert = 'user-cert'
  let events = 'line1\nline2'
  let crash = 'crash log'
  const calls = {
    getServerUrl: vi.fn(() => 'https://dsh.example.com:3080'),
    setServerUrl: vi.fn(),
    getCertInfo: vi.fn(() => cert),
    forgetCertificate: vi.fn(() => { cert = 'none' }),
    getDiagnostics: vi.fn(() => events),
    clearDiagnostics: vi.fn(() => { events = '' }),
    getCrashLog: vi.fn(() => crash),
    clearCrashLog: vi.fn(() => { crash = '' }),
    getAppInfo: vi.fn(() => 'dsh 0.1.0 · Android 36'),
  }
  return {
    calls,
    renderSection: () => render(<AppSection {...calls} t={t} />),
  }
}

describe('AppSection', () => {
  it('renders the bridge state on mount', () => {
    const { renderSection } = makeBridge()
    renderSection()
    expect((screen.getByLabelText('Web UI hostname') as HTMLInputElement).value)
      .toBe('https://dsh.example.com:3080')
    expect(screen.getByText('Using certificate: user-cert')).toBeDefined()
    expect(screen.getByText(/line1\s+line2/)).toBeDefined()
    expect(screen.getByText('crash log')).toBeDefined()
    expect(screen.getByText('dsh 0.1.0 · Android 36')).toBeDefined()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('saves the trimmed hostname through the bridge', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    fireEvent.change(screen.getByLabelText('Web UI hostname'), { target: { value: '  dsh.example.com  ' } })
    fireEvent.click(screen.getByText('Save'))
    expect(calls.setServerUrl).toHaveBeenCalledTimes(1)
    expect(calls.setServerUrl).toHaveBeenCalledWith('dsh.example.com')
  })

  it('forgetting the certificate updates the row', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    fireEvent.click(screen.getByText('Forget certificate'))
    expect(calls.forgetCertificate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('No certificate selected — the system asks when the server requests one.')).toBeDefined()
  })

  it('the clear buttons forward to the bridge and refresh the rows', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    fireEvent.click(screen.getAllByText('Clear')[0]!)
    expect(calls.clearDiagnostics).toHaveBeenCalledTimes(1)
    expect(screen.getByText('(empty)')).toBeDefined()
    expect(screen.getByText('crash log')).toBeDefined()
    fireEvent.click(screen.getAllByText('Clear')[1]!)
    expect(calls.clearCrashLog).toHaveBeenCalledTimes(1)
    expect(screen.getAllByText('(empty)')).toHaveLength(2)
  })

  it('refresh re-reads the bridge surface', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    expect(calls.getServerUrl).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Refresh'))
    expect(calls.getServerUrl).toHaveBeenCalledTimes(2)
    expect(calls.getCertInfo).toHaveBeenCalledTimes(2)
  })

  it('a throwing bridge surfaces a visible alert instead of crashing', () => {
    const { calls } = makeBridge()
    const throwing = {
      ...calls,
      getServerUrl: vi.fn(() => { throw new Error('bridge down') }),
    }
    render(<AppSection {...throwing} t={t} />)
    expect(screen.getByRole('alert').textContent).toBe('Loading app settings failed')
  })
})
