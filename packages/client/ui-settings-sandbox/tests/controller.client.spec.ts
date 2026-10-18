/** The sandbox page's staged list: comma-separated roots, one revision-fenced write. */

import { describe, expect, it, vi } from 'vitest'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import { stubConfigForm, type StubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { SandboxSettingsController, type SandboxSettings } from '../src/client/sandbox-settings-controller.ts'

/** Make the stub behave like a Host that accepts every write. */
function acceptWrites<T>(host: StubConfigForm<T>): void {
  const section = (): Record<string, unknown> => ({ ...host.scope.getSnapshot().value as object })
  const layer = (): Record<string, unknown> => ({ ...host.scope.getSnapshot().user as object })
  host.mutate.mockImplementation((ops: readonly SettingsPathOpView[]) => {
    const value = { ...section() }
    const user = { ...layer() }
    for (const op of ops) {
      const field = op.path[0]!
      if (op.op === 'set') {
        value[field] = op.value
        user[field] = op.value
      } else {
        Reflect.deleteProperty(user, field)
        value[field] = (host.scope.getSnapshot().base as Record<string, unknown> | undefined)?.[field]
      }
    }
    host.publish({ value: value as T, user })
    return Promise.resolve(true)
  })
  host.unset.mockImplementation((field: string) => {
    const user = Object.fromEntries(Object.entries(layer()).filter(([key]) => key !== field))
    const base = host.scope.getSnapshot().base as Record<string, unknown> | undefined
    host.publish({ value: { ...section(), [field]: base?.[field] } as T, user })
  })
}

describe('SandboxSettingsController', () => {
  it('renders the roots as a comma-separated list and saves them in one write', async () => {
    const host = stubConfigForm<SandboxSettings>()
    acceptWrites(host)
    const controller = new SandboxSettingsController(host.scope)
    host.publish({
      status: 'ready',
      writable: true,
      value: { extraWritableRoots: ['/srv/cache'] },
      base: { extraWritableRoots: [] },
      user: { extraWritableRoots: ['/srv/cache'] },
    })
    const face = controller.inject()

    expect(face.hooks.sandboxSettingsCard.getSnapshot()).toMatchObject({
      available: true,
      writable: true,
      dirty: false,
      extraWritableRoots: { text: '/srv/cache', overridden: true, invalid: false },
    })

    face.edit('extraWritableRoots', '~/.cache, /srv/cargo')
    expect(face.hooks.sandboxSettingsCard.getSnapshot().dirty).toBe(true)
    expect(face.hooks.sandboxSettingsCard.getSnapshot().extraWritableRoots.invalid).toBe(false)

    face.save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalledTimes(1) })
    expect(host.mutate.mock.calls.map(([ops]) => ops))
      .toEqual([[{ op: 'set', path: ['extraWritableRoots'], value: ['~/.cache', '/srv/cargo'] }]])
    expect(face.hooks.sandboxSettingsCard.getSnapshot().dirty).toBe(false)
  })

  it('blocks the save on a relative spelling, and clears the field when it empties', async () => {
    const host = stubConfigForm<SandboxSettings>()
    acceptWrites(host)
    const controller = new SandboxSettingsController(host.scope)
    host.publish({ status: 'ready', writable: true, value: { extraWritableRoots: ['/srv/cache'] }, user: {} })
    const face = controller.inject()

    face.edit('extraWritableRoots', 'relative/cache')
    expect(face.hooks.sandboxSettingsCard.getSnapshot()).toMatchObject({ invalid: true })
    face.save()
    expect(host.mutate).not.toHaveBeenCalled()

    face.edit('extraWritableRoots', '   ')
    expect(face.hooks.sandboxSettingsCard.getSnapshot()).toMatchObject({ invalid: false })
    face.save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['extraWritableRoots'] }], undefined) })
  })

  it('formats an absent list as an empty draft and discards staged edits', () => {
    const host = stubConfigForm<SandboxSettings>()
    const controller = new SandboxSettingsController(host.scope)
    host.publish({ status: 'ready', writable: true, value: {}, user: {} })
    const face = controller.inject()

    expect(face.hooks.sandboxSettingsCard.getSnapshot().extraWritableRoots.text).toBe('')
    face.edit('extraWritableRoots', '/srv/cache')
    face.discard()
    expect(face.hooks.sandboxSettingsCard.getSnapshot().extraWritableRoots.text).toBe('')
    controller.dispose()
    expect(host.set).not.toHaveBeenCalled()
  })
})
