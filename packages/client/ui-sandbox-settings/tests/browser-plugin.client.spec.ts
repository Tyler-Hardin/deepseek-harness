// @vitest-environment jsdom
/**
 * ui-sandbox-settings browser half on a real cordis Context with the real
 * ui-settings describe mirror: the plugin registers the Sandbox
 * extra-writable-roots row into General settings with its injected face; the
 * row's locale dictionary is registered; fiber disposal removes the
 * contribution (HMR safety).
 */
import { describe, expect, it } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotTestRuntime, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as settingsApply, inject as settingsInject } from '@deepseek-ai/dsh-client-ui-settings/client'
import { SandboxRootsRow, type SandboxRootsRowInjected } from '../src/client/SandboxRootsRow.tsx'
import { apply, inject } from '../src/client/index.ts'

async function bench() {
  const runtime = await SlotTestRuntime.create()
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  runtime.provide('locale', locale)
  new TestRemote(runtime.ctx)
  runtime.provide('connection', {
    api: {
      settings: {
        describe: () => Promise.resolve({
          rpcId: 'describe',
          result: { ok: true as const, value: { writable: true, hasDocument: false, namespaces: [] } },
        }),
        mutate: () => Promise.reject(new Error('settings mutation is not exercised')),
      },
    },
  } as never)
  await runtime.root.declare({
    'settings.general.item': { kind: 'list', scope: 'root' },
  } as never, (_p: { renderSlot?: unknown }) => null)
  await runtime.mount({ inject: [...settingsInject], apply: settingsApply })
  const fiber = await runtime.mount({ inject: [...inject], apply })
  return { runtime, fiber }
}

describe('ui-sandbox-settings browser plugin', () => {
  it('registers the sandbox extra-writable-roots row into General settings', async () => {
    const { runtime } = await bench()
    try {
      const row = runtime.slots.entries('settings.general.item')
        .find(entry => entry.component === SandboxRootsRow)
      expect(row).toBeDefined()
      expect(row?.options).toEqual({ id: 'sandbox', order: -10 })
      const injected = row?.inject?.() as SandboxRootsRowInjected | undefined
      expect(injected?.hooks.sandboxRoots).toBeDefined()
      expect(typeof injected?.load).toBe('function')
      expect(typeof injected?.save).toBe('function')
      // The injected wrappers reach the controller without a rendered row (the
      // bench's describe exposes no sandbox namespace, so the save no-ops).
      await injected?.load()
      await injected?.save([])
      expect(injected?.hooks.sandboxRoots.getSnapshot().status).toBe('unavailable')
    } finally {
      await runtime.dispose()
    }
  })

  it('removes the row on fiber disposal (HMR safety)', async () => {
    const { runtime, fiber } = await bench()
    await fiber.dispose()
    expect(runtime.slots.entries('settings.general.item')
      .find(entry => entry.component === SandboxRootsRow)).toBeUndefined()
    await runtime.dispose()
  })
})
