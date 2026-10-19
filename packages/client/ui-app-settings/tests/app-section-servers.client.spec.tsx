// @vitest-environment jsdom
/**
 * AppSection's server book: the page lists the configured servers, marks the
 * active one, refuses a duplicate URL through the bridge's error payload,
 * reloads at a server chosen with Use, and keeps older native builds on the
 * single-hostname field when the bridge has no server list.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppSection, type AppSettingsInjected } from '../src/client/AppSection.tsx'
import { en, type AppSettingsLocaleKey } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const t = (key: string, params?: Record<string, unknown>): string => {
  const text = en[key as AppSettingsLocaleKey] ?? key
  return text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params?.[name]
    return typeof value === 'string' ? value : ''
  })
}

interface Row { id: string; label: string; url: string; certAlias: string; active: boolean }

/** Bridge stub backed by a mutable server list. */
function makeServers(rows: Row[], activeId: string) {
  const list = rows.map(row => ({ ...row }))
  const encode = (): string => JSON.stringify({
    ok: true,
    servers: list.map(row => ({ ...row, active: row.id === activeId })),
    activeId,
  })
  const reject = (error: string): string => JSON.stringify({ ok: false, error })
  const calls = {
    getServers: vi.fn(encode),
    addServer: vi.fn((label: string, url: string) => {
      if (list.some(row => row.url === url)) return reject('duplicate-url')
      if (!url.startsWith('https://')) return reject('invalid-url')
      list.push({ id: `id-${list.length + 1}`, label, url, certAlias: '', active: false })
      return encode()
    }),
    updateServer: vi.fn((id: string, label: string, url: string) => {
      const row = list.find(candidate => candidate.id === id)
      if (row === undefined) return reject('unknown-id')
      if (list.some(candidate => candidate.id !== id && candidate.url === url)) return reject('duplicate-url')
      row.label = label
      row.url = url
      return encode()
    }),
    removeServer: vi.fn((id: string) => {
      const index = list.findIndex(candidate => candidate.id === id)
      if (index < 0) return reject('unknown-id')
      list.splice(index, 1)
      return encode()
    }),
    selectServer: vi.fn((id: string) => {
      if (!list.some(candidate => candidate.id === id)) return reject('unknown-id')
      activeId = id
      return encode()
    }),
  }
  const props: AppSettingsInjected = {
    getServerUrl: () => list.find(row => row.id === activeId)?.url ?? '',
    setServerUrl: () => {},
    getCertInfo: () => 'none',
    forgetCertificate: () => {},
    getDiagnostics: () => '',
    clearDiagnostics: () => {},
    getCrashLog: () => '',
    clearCrashLog: () => {},
    getAppInfo: () => 'dsh 0.1.0 · Android 36',
    ...calls,
  }
  return { calls, props }
}

describe('AppSection servers', () => {
  it('lists the servers, marks the active one, and shows an unnamed label as unset', () => {
    const { props } = makeServers([
      { id: 'a', label: '', url: 'https://home.example', certAlias: 'home-cert', active: true },
      { id: 'b', label: 'work', url: 'https://work.example', certAlias: '', active: false },
    ], 'a')
    render(<AppSection {...props} t={t} />)
    expect(screen.getByText('unset')).toBeDefined()
    expect(screen.getByText('active')).toBeDefined()
    expect(screen.getByText('work')).toBeDefined()
    // Use appears only on the inactive row.
    expect(screen.getAllByText('Use')).toHaveLength(1)
  })

  it('adds a server through the bridge and closes the form', () => {
    const { calls, props } = makeServers([
      { id: 'a', label: 'home', url: 'https://home.example', certAlias: '', active: true },
    ], 'a')
    render(<AppSection {...props} t={t} />)
    fireEvent.click(screen.getByText('Add server'))
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'work' } })
    fireEvent.change(screen.getByLabelText('Server URL'), { target: { value: 'https://work.example' } })
    fireEvent.click(screen.getByText('Save'))
    expect(calls.addServer).toHaveBeenCalledWith('work', 'https://work.example')
    expect(screen.getByText('work')).toBeDefined()
    expect(screen.queryByLabelText('Server URL')).toBeNull()
  })

  it('reports a duplicate URL and keeps the form open', () => {
    const { calls, props } = makeServers([
      { id: 'a', label: 'home', url: 'https://home.example', certAlias: '', active: true },
    ], 'a')
    render(<AppSection {...props} t={t} />)
    fireEvent.click(screen.getByText('Add server'))
    fireEvent.change(screen.getByLabelText('Server URL'), { target: { value: 'https://home.example' } })
    fireEvent.click(screen.getByText('Save'))
    expect(calls.addServer).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toBe('Another server already uses that URL.')
    expect(screen.getByLabelText('Server URL')).toBeDefined()
  })

  it('selects a server and reloads the page at it', () => {
    const assign = vi.fn()
    // The page reloads through globalThis.location.assign; stub only that.
    vi.stubGlobal('location', { assign })
    const { calls, props } = makeServers([
      { id: 'a', label: 'home', url: 'https://home.example', certAlias: '', active: true },
      { id: 'b', label: 'work', url: 'https://work.example', certAlias: '', active: false },
    ], 'a')
    render(<AppSection {...props} t={t} />)
    fireEvent.click(screen.getByText('Use'))
    expect(calls.selectServer).toHaveBeenCalledWith('b')
    expect(assign).toHaveBeenCalledWith('https://work.example')
  })

  it('removes a server through the bridge', () => {
    const { calls, props } = makeServers([
      { id: 'a', label: 'home', url: 'https://home.example', certAlias: '', active: true },
      { id: 'b', label: 'work', url: 'https://work.example', certAlias: '', active: false },
    ], 'a')
    render(<AppSection {...props} t={t} />)
    const removers = screen.getAllByText('Remove')
    fireEvent.click(removers[1]!)
    expect(calls.removeServer).toHaveBeenCalledWith('b')
    expect(screen.queryByText('work')).toBeNull()
  })

  it('keeps the single-hostname field when the bridge has no server list', () => {
    const props: AppSettingsInjected = {
      getServerUrl: () => 'https://home.example',
      setServerUrl: () => {},
      getCertInfo: () => 'none',
      forgetCertificate: () => {},
      getDiagnostics: () => '',
      clearDiagnostics: () => {},
      getCrashLog: () => '',
      clearCrashLog: () => {},
      getAppInfo: () => 'dsh 0.1.0 · Android 36',
    }
    render(<AppSection {...props} t={t} />)
    expect(screen.getByLabelText('Web UI hostname')).toBeDefined()
    expect(screen.queryByText('Add server')).toBeNull()
  })
})
