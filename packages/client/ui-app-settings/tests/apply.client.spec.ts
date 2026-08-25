// @vitest-environment jsdom
/**
 * Plugin gating and wiring: the App section registers only when
 * `window.DshApp` is present (inside the native app); desktop browsers
 * register nothing. The label thunk follows the active locale, and the
 * injected face forwards every read and mutation to the bridge.
 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, NS } from '../src/client/index.ts'
import { AppSection, type AppSettingsInjected } from '../src/client/AppSection.tsx'

type GlobalWithBridge = { DshApp?: unknown }

afterEach(() => { delete (globalThis as GlobalWithBridge).DshApp })

function stubBridge(bridge: AppSettingsInjected): void {
  (globalThis as GlobalWithBridge).DshApp = bridge
}

function makeBridge(): AppSettingsInjected {
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
  }
}

async function bench(withBridge: boolean, bridge?: AppSettingsInjected) {
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
    injected.setServerUrl('https://new.example.com')
    injected.forgetCertificate()
    injected.clearDiagnostics()
    injected.clearCrashLog()
    expect(bridge.setServerUrl).toHaveBeenCalledWith('https://new.example.com')
    expect(bridge.forgetCertificate).toHaveBeenCalledTimes(1)
    expect(bridge.clearDiagnostics).toHaveBeenCalledTimes(1)
    expect(bridge.clearCrashLog).toHaveBeenCalledTimes(1)
  })
})
