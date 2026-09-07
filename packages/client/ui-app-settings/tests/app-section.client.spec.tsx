// @vitest-environment jsdom
/**
 * AppSection rendering and gestures: initial values come from the injected
 * bridge face, Save forwards the trimmed hostname, Forget clears the
 * certificate and refreshes the row, the Clear buttons forward to the
 * diagnostics and crash-log clear methods and refresh, Refresh re-reads the
 * whole surface, and a throwing bridge surfaces a visible alert instead of
 * crashing.
 */
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppSection, type AppSettingsInjected } from '../src/client/AppSection.tsx'
import { en, type AppSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(cleanup)

/** Locale stub faithful to the real interpolation ({name} placeholders). */
const t = (key: string, params?: Record<string, unknown>): string => {
  const text = en[key as AppSettingsLocaleKey] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' ? value : ''
  })
}



interface BridgeHarness {
  // Spies stay a plain record of function properties: intersecting them with
  // the bridge interface would give every member a method signature, and
  // reading an unbound method off that record is what `unbound-method` refuses.
  calls: {
    getServerUrl: Mock<() => string>
    setServerUrl: Mock<(url: string) => void>
    getCertInfo: Mock<() => string>
    forgetCertificate: Mock<() => void>
    getDiagnostics: Mock<() => string>
    clearDiagnostics: Mock<() => void>
    getCrashLog: Mock<() => string>
    clearCrashLog: Mock<() => void>
    getAppInfo: Mock<() => string>
    /** Spies only on native builds that ship the monitoring bridge. */
    getMonitoringEnabled?: Mock<() => boolean>
    setMonitoringEnabled?: Mock<(enabled: boolean) => void>
  }
  renderSection: () => ReturnType<typeof render>
}

/**
 * Project the spy record onto the section's injected face. The monitoring
 * members are assigned only when present: the face declares them optional, and
 * assigning an explicit `undefined` would violate exactOptionalPropertyTypes.
 * @param calls - spy record driving the section.
 * @returns the injected props for one render.
 */
function appSettingsProps(calls: BridgeHarness['calls']): AppSettingsInjected {
  const { getServerUrl, setServerUrl, getCertInfo, forgetCertificate, getDiagnostics,
    clearDiagnostics, getCrashLog, clearCrashLog, getAppInfo,
    getMonitoringEnabled, setMonitoringEnabled } = calls
  const props: AppSettingsInjected = {
    getServerUrl: () => getServerUrl(),
    setServerUrl: (url) => { setServerUrl(url) },
    getCertInfo: () => getCertInfo(),
    forgetCertificate: () => { forgetCertificate() },
    getDiagnostics: () => getDiagnostics(),
    clearDiagnostics: () => { clearDiagnostics() },
    getCrashLog: () => getCrashLog(),
    clearCrashLog: () => { clearCrashLog() },
    getAppInfo: () => getAppInfo(),
  }
  if (getMonitoringEnabled !== undefined) {
    props.getMonitoringEnabled = () => getMonitoringEnabled()
  }
  if (setMonitoringEnabled !== undefined) {
    props.setMonitoringEnabled = (enabled: boolean) => { setMonitoringEnabled(enabled) }
  }
  return props
}

/** Mutable bridge stub: getters reflect prior mutations, setters are spies. */
function makeBridge(): BridgeHarness {
  let cert = 'user-cert'
  let events = 'line1\nline2'
  let crash = 'crash log'
  let monitoring = true
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
    getMonitoringEnabled: vi.fn(() => monitoring),
    setMonitoringEnabled: vi.fn((enabled: boolean) => { monitoring = enabled }),
  }
  return {
    calls,
    renderSection: () => render(<AppSection {...appSettingsProps(calls)} t={t} />),
  }
}

/** A native build that predates the monitoring bridge: no monitoring methods. */
function makeLegacyBridge(): BridgeHarness {
  const { calls, renderSection } = makeBridge()
  delete calls.getMonitoringEnabled
  delete calls.setMonitoringEnabled
  return { calls, renderSection }
}

describe('AppSection', () => {
  it('renders the bridge state on mount', () => {
    const { renderSection } = makeBridge()
    renderSection()
    expect(screen.getByLabelText<HTMLInputElement>('Web UI hostname').value)
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

  it('renders the monitoring toggle on when the bridge enables it', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    const toggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(toggle.checked).toBe(true)
    expect(calls.getMonitoringEnabled).toHaveBeenCalledTimes(1)
  })

  it('toggling monitoring off forwards to the bridge and refreshes the state', () => {
    const { calls, renderSection } = makeBridge()
    renderSection()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(calls.setMonitoringEnabled).toHaveBeenCalledTimes(1)
    expect(calls.setMonitoringEnabled).toHaveBeenCalledWith(false)
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false)
    expect(calls.getMonitoringEnabled).toHaveBeenCalledTimes(2)
  })

  it('hides the monitoring controls on native builds that predate monitoring', () => {
    const { renderSection } = makeLegacyBridge()
    renderSection()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Notify me when a task finishes')).toBeNull()
  })

  it('a throwing bridge surfaces a visible alert instead of crashing', () => {
    const { calls } = makeBridge()
    const throwing = { ...calls, getServerUrl: vi.fn(() => { throw new Error('bridge down') }) }
    render(<AppSection {...appSettingsProps(throwing)} t={t} />)
    expect(screen.getByRole('alert').textContent).toBe('Loading app settings failed')
  })
})
