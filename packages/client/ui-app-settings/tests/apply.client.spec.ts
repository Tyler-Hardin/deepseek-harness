// @vitest-environment jsdom
/**
 * Plugin gating and wiring: the App section registers only when
 * `window.DshApp` is present (inside the native app); desktop browsers
 * register nothing. The label thunk follows the active locale, and the
 * injected face forwards every read and mutation to the bridge.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { AppSection, type AppSettingsInjected } from '../src/client/AppSection.tsx'

type GlobalWithBridge = { DshApp?: unknown }

afterEach(() => { delete (globalThis as GlobalWithBridge).DshApp })

function stubBridge(bridge: AppSettingsInjected): void {
  (globalThis as GlobalWithBridge).DshApp = bridge
}

/** One bridge-shaped record of function properties plus its assertions. */
interface BridgeStub extends AppSettingsInjected {
  getServerUrl: () => string
  setServerUrl: Mock<(url: string) => void>
  getCertInfo: () => string
  forgetCertificate: Mock<() => void>
  getDiagnostics: () => string
  clearDiagnostics: Mock<() => void>
  getCrashLog: () => string
  clearCrashLog: Mock<() => void>
  getAppInfo: () => string
  getMonitoringEnabled?: () => boolean
  setMonitoringEnabled?: Mock<(enabled: boolean) => void>
}

/**
 * One native bridge stub.
 * @param monitoring - false omits the optional monitoring pair, as a build
 * that predates the monitor does.
 * @returns the bridge stub.
 */
function makeBridge(monitoring = true): BridgeStub {
  let enabled = true
  return {
    getServerUrl: () => 'https://dsh.example.com',
    setServerUrl: vi.fn(),
    getCertInfo: () => 'user-cert',
    forgetCertificate: vi.fn(),
    getDiagnostics: () => 'line',
    clearDiagnostics: vi.fn(),
    getCrashLog: () => 'log',
    clearCrashLog: vi.fn(),
    getAppInfo: () => 'dsh 0.1.0',
    ...monitoring
      ? {
        getMonitoringEnabled: () => enabled,
        setMonitoringEnabled: vi.fn((next: boolean) => { enabled = next }),
      }
      : {},
  }
}

async function bench(withBridge: boolean, bridge?: BridgeStub) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  if (withBridge) {
    stubBridge(bridge ?? makeBridge())
  } else {
    delete (globalThis as GlobalWithBridge).DshApp
  }
  await ctx.plugin({ inject: [...inject], apply }).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    {
      name: 'root',
      children: {
        'settings.section': { kind: 'list', scope: 'root' },
      },
    } as never,
    () => null,
  )
}

describe('ui-app-settings apply', () => {
  it('declares the services and dictionary namespace it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
    expect(NS).toBe('settings.app')
  })

  it('registers nothing on desktop (no bridge)', async () => {
    const b = await bench(false)
    declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
  })

  it('calls every bridge member on the injected object, never a detached copy', async () => {
    // Android's WebView refuses a bridge method invoked off its injected object
    // ("can't be invoked on a non-injected object"), which is why the face must
    // reach members through `window.DshApp` rather than destructuring them.
    const detached: string[] = []
    const guard = (name: string): (() => unknown) => function (this: unknown) {
      if (this !== (globalThis as GlobalWithBridge).DshApp) detached.push(name)
      return name === 'getServers' ? '{"ok":true,"servers":[],"activeId":""}' : 'ok'
    }
    const bridge = {
      getServerUrl: guard('getServerUrl'),
      setServerUrl: () => {},
      getCertInfo: guard('getCertInfo'),
      forgetCertificate: () => {},
      getDiagnostics: guard('getDiagnostics'),
      clearDiagnostics: () => {},
      getCrashLog: guard('getCrashLog'),
      clearCrashLog: () => {},
      getAppInfo: guard('getAppInfo'),
      getMonitoringEnabled: guard('getMonitoringEnabled'),
      setMonitoringEnabled: () => {},
      getServers: guard('getServers'),
      addServer: guard('addServer'),
      updateServer: guard('updateServer'),
      removeServer: guard('removeServer'),
      selectServer: guard('selectServer'),
    }
    const b = await bench(true, bridge as never)
    declare(b.slots)
    await Promise.resolve()
    const face = b.slots.entries('settings.section')[0]!.inject!() as Record<string, (...args: unknown[]) => unknown>
    for (const member of ['getServerUrl', 'getCertInfo', 'getDiagnostics', 'getCrashLog', 'getAppInfo', 'getMonitoringEnabled']) {
      face[member]!()
    }
    for (const member of ['getServers', 'addServer', 'updateServer', 'removeServer', 'selectServer']) {
      face[member]!('a', 'b', 'c')
    }
    expect(detached).toEqual([])
  })

  it('registers the App section when the bridge is present', async () => {
    const b = await bench(true)
    declare(b.slots)
    await Promise.resolve()
    const entries = b.slots.entries('settings.section')
    expect(entries).toHaveLength(1)
    const entry = entries[0]!
    expect(entry.component).toBe(AppSection)
    expect(entry.options).toMatchObject({ id: 'app', order: 100 })
    expect(resolveSlotLabel(entry.options.label)).toBe('App')
    const face = entry.inject!()
    expect((face.getServerUrl as () => string)()).toBe('https://dsh.example.com')
    expect((face.getCertInfo as () => string)()).toBe('user-cert')
  })

  it('the injected face forwards reads and mutations to the bridge', async () => {
    const bridge = makeBridge()
    const b = await bench(true, bridge)
    declare(b.slots)
    await Promise.resolve()
    const face = b.slots.entries('settings.section')[0]!.inject!()
    expect((face.getDiagnostics as () => string)()).toBe('line')
    expect((face.getCrashLog as () => string)()).toBe('log')
    expect((face.getAppInfo as () => string)()).toBe('dsh 0.1.0')
    expect((face.getMonitoringEnabled as () => boolean)()).toBe(true)
    const setMonitoringEnabled = face.setMonitoringEnabled as (enabled: boolean) => void
    setMonitoringEnabled(false)
    expect((face.getMonitoringEnabled as () => boolean)()).toBe(false)
    const setServerUrl = face.setServerUrl as (url: string) => void
    const forgetCertificate = face.forgetCertificate as () => void
    const clearDiagnostics = face.clearDiagnostics as () => void
    const clearCrashLog = face.clearCrashLog as () => void
    setServerUrl('https://new.example.com')
    forgetCertificate()
    clearDiagnostics()
    clearCrashLog()
    expect(bridge.setServerUrl).toHaveBeenCalledWith('https://new.example.com')
    expect(bridge.forgetCertificate).toHaveBeenCalledTimes(1)
    expect(bridge.clearDiagnostics).toHaveBeenCalledTimes(1)
    expect(bridge.clearCrashLog).toHaveBeenCalledTimes(1)
    expect(bridge.setMonitoringEnabled).toHaveBeenCalledWith(false)
  })

  it('omits monitoring from the injected face on native builds that predate it', async () => {
    const b = await bench(true, makeBridge(false))
    declare(b.slots)
    await Promise.resolve()
    const face = b.slots.entries('settings.section')[0]!.inject!()
    // Absent, not undefined-valued: the face omits the members entirely.
    expect(Object.hasOwn(face, 'getMonitoringEnabled')).toBe(false)
    expect(Object.hasOwn(face, 'setMonitoringEnabled')).toBe(false)
  })

  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })
})
