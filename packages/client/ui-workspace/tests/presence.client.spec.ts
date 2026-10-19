// @vitest-environment jsdom
/** Active-viewer presence: visibility, focus, idle, Session, and beacon behavior. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startPresence } from '../src/client/presence.ts'

const SESSION = '11111111-1111-1111-1111-111111111111'
const PATH = '/push/presence'

interface Report { readonly clientId: string; readonly sessionId: string; readonly active: boolean }

let visibility: DocumentVisibilityState
let beacon: ReturnType<typeof vi.fn>
let calls: { body: string; keepalive?: boolean | undefined }[]
let fetchMock: ReturnType<typeof vi.fn>
let originalBeacon: PropertyDescriptor | undefined

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  window.history.replaceState(null, '', `/?session=${SESSION}`)
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  calls = []
  fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ body: typeof init?.body === 'string' ? init.body : '', keepalive: init?.keepalive })
    return new Response('', { status: 204 })
  })
  vi.stubGlobal('fetch', fetchMock)
  originalBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
  beacon = vi.fn(() => true)
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'visibilityState')
  if (originalBeacon === undefined) Reflect.deleteProperty(navigator, 'sendBeacon')
  else Object.defineProperty(navigator, 'sendBeacon', originalBeacon)
})

/** The most recent report the client sent. */
function lastReport(): Report {
  expect(calls.length).toBeGreaterThan(0)
  return JSON.parse(calls[calls.length - 1]!.body) as Report
}

describe('presence', () => {
  it('reports the shown Session and heartbeats while active', async () => {
    const dispose = startPresence()
    expect(lastReport()).toMatchObject({ sessionId: SESSION, active: true })
    expect(calls[0]!.keepalive).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toHaveLength(2)
    expect(lastReport()).toMatchObject({ sessionId: SESSION, active: true })
    // Input while active refreshes the idle clock without another post.
    document.dispatchEvent(new Event('pointermove'))
    expect(calls).toHaveLength(2)
    dispose()
  })

  it('goes inactive when input stops and active again on input', async () => {
    const dispose = startPresence()
    await vi.advanceTimersByTimeAsync(45_000)
    expect(lastReport()).toMatchObject({ sessionId: '', active: false })
    const afterIdle = calls.length
    await vi.advanceTimersByTimeAsync(20_000)
    expect(calls).toHaveLength(afterIdle)
    document.dispatchEvent(new Event('pointermove'))
    expect(lastReport()).toMatchObject({ sessionId: SESSION, active: true })
    dispose()
  })

  it('disposes after the idle timer already fired', () => {
    const dispose = startPresence()
    vi.advanceTimersByTime(50_000)
    dispose()
    expect(beacon).toHaveBeenCalledTimes(1)
  })

  it('goes inactive when the tab hides, blurs, or loses focus', async () => {
    visibility = 'hidden'
    const dispose = startPresence()
    expect(lastReport()).toMatchObject({ active: false })

    visibility = 'visible'
    window.dispatchEvent(new Event('focus'))
    expect(lastReport()).toMatchObject({ sessionId: SESSION, active: true })

    vi.mocked(document.hasFocus).mockReturnValue(false)
    window.dispatchEvent(new Event('focus'))
    expect(lastReport()).toMatchObject({ active: false })
    vi.mocked(document.hasFocus).mockReturnValue(true)

    window.dispatchEvent(new Event('blur'))
    expect(lastReport()).toMatchObject({ active: false })

    visibility = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(lastReport()).toMatchObject({ active: true })
    visibility = 'hidden'
    document.dispatchEvent(new Event('visibilitychange'))
    expect(lastReport()).toMatchObject({ active: false })
    dispose()
  })

  it('reports inactive when no Session is shown', () => {
    window.history.replaceState(null, '', '/')
    const dispose = startPresence()
    expect(lastReport()).toMatchObject({ sessionId: '', active: false })
    dispose()
  })

  it('clears the report with a beacon on dispose', async () => {
    const dispose = startPresence()
    dispose()
    expect(beacon).toHaveBeenCalledTimes(1)
    const [path, blob] = beacon.mock.calls[0]!
    expect(path).toBe(PATH)
    expect(JSON.parse(await (blob as Blob).text())).toMatchObject({ sessionId: '', active: false })
  })

  it('falls back to fetch when sendBeacon is unavailable', () => {
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: undefined })
    const dispose = startPresence()
    calls.length = 0
    dispose()
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ active: false })
  })

  it('ignores a failed report', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const dispose = startPresence()
    await Promise.resolve()
    dispose()
  })
})
