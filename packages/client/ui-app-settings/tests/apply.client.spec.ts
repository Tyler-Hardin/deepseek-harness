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

function makeBridge(): BridgeStub {
  let monitoring = true
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
    getMonitoringEnabled: () => monitoring,
    setMonitoringEnabled: vi.fn((enabled: boolean) => { monitoring = enabled }),
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
    const injected = (entry.inject as unknown as () => AppSettingsInjected)()
    expect(injected.getServerUrl()).toBe('https://dsh.example.com')
    expect(injected.getCertInfo()).toBe('user-cert')
  })

  it('the injected face forwards reads and mutations to the bridge', async () => {
    const bridge = makeBridge()
    const b = await bench(true, bridge)
    declare(b.slots)
    await Promise.resolve()
    const injected = (b.slots.entries('settings.section')[0]!.inject as unknown as () => AppSettingsInjected)()
    expect(injected.getDiagnostics()).toBe('line')
    expect(injected.getCrashLog()).toBe('log')
    expect(injected.getAppInfo()).toBe('dsh 0.1.0')
    expect(injected.getMonitoringEnabled?.()).toBe(true)
    injected.setMonitoringEnabled?.(false)
    expect(injected.getMonitoringEnabled?.()).toBe(false)
    injected.setServerUrl('https://new.example.com')
    injected.forgetCertificate()
    injected.clearDiagnostics()
    injected.clearCrashLog()
    const mocks = bridge as unknown as {
      setServerUrl: ReturnType<typeof vi.fn>
      forgetCertificate: ReturnType<typeof vi.fn>
      clearDiagnostics: ReturnType<typeof vi.fn>
      clearCrashLog: ReturnType<typeof vi.fn>
      setMonitoringEnabled: ReturnType<typeof vi.fn>
    }
    expect(mocks.setServerUrl).toHaveBeenCalledWith('https://new.example.com')
    expect(mocks.forgetCertificate).toHaveBeenCalledTimes(1)
    expect(mocks.clearDiagnostics).toHaveBeenCalledTimes(1)
    expect(mocks.clearCrashLog).toHaveBeenCalledTimes(1)
    expect(mocks.setMonitoringEnabled).toHaveBeenCalledWith(false)
  })

  it('omits monitoring from the injected face on native builds that predate it', async () => {
    const bridge = makeBridge()
    const legacy = { ...bridge }
    expect(legacy.getMonitoringEnabled).toBeDefined()
    expect(legacy.setMonitoringEnabled).toBeDefined()
    delete legacy.getMonitoringEnabled
    delete legacy.setMonitoringEnabled
    const b = await bench(true, legacy)
    declare(b.slots)
    await Promise.resolve()
    const injected = (b.slots.entries('settings.section')[0]!.inject as unknown as () => AppSettingsInjected)()
    // Absent, not undefined-valued: the face omits the members entirely.
    expect(Object.hasOwn(injected, 'getMonitoringEnabled')).toBe(false)
    expect(Object.hasOwn(injected, 'setMonitoringEnabled')).toBe(false)
  })
})
