import { describe, expect, it, vi } from 'vitest'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import {
  SandboxRootsSettingsController, extraRootsOf,
} from '../src/client/settings-store.ts'

function view(roots: string[] | null, revision = 0): SettingsNamespaceView {
  return {
    ns: 'sandbox',
    schema: { uid: 1, refs: { 1: { type: 'object', dict: {} } } },
    value: roots === null ? {} : { extraWritableRoots: roots },
    base: { extraWritableRoots: [] },
    applies: 'live',
    secrets: [],
    revision,
  }
}

function ok<T>(value: T) {
  return { rpcId: 'test', result: { ok: true as const, value } }
}

/** The sandbox controller over a real mirror and one fake wire. */
function sandboxController(api: object) {
  const wire = { settings: api } as never
  const mirror = new SettingsDescribeMirror(wire)
  return { mirror, controller: new SandboxRootsSettingsController(mirror, wire) }
}

describe('sandbox roots settings store', () => {
  it('reads the resolved extra writable roots from the descriptor', () => {
    expect(extraRootsOf(view(['/cache', '~/.local/share']))).toEqual(['/cache', '~/.local/share'])
    expect(extraRootsOf(view([]))).toEqual([])
  })

  it('rejects a malformed value at the wire boundary', () => {
    expect(() => extraRootsOf(view(null))).toThrow(/no extraWritableRoots list/)
    expect(() => extraRootsOf({ ...view([]), value: { extraWritableRoots: '/cache' } })).toThrow(/no extraWritableRoots list/)
    expect(() => extraRootsOf({ ...view([]), value: { extraWritableRoots: ['/cache', 7] } })).toThrow(/no extraWritableRoots list/)
  })

  it('loads and replaces the whole list with optimistic concurrency', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({
      writable: true, hasDocument: false, namespaces: [view(['/cache'], 4)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(view(['/cache', '/extra'], 5))))
    const { controller } = sandboxController({ describe, mutate })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      writable: true,
      roots: ['/cache'],
      revision: 4,
    })
    await controller.save(['/cache', '/extra'])
    expect(mutate).toHaveBeenCalledWith({
      ns: 'sandbox',
      ops: [{ op: 'set', path: ['extraWritableRoots'], value: ['/cache', '/extra'] }],
      expectedRevision: 4,
    })
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      roots: ['/cache', '/extra'],
      revision: 5,
    })
    // The write answer folded into the mirror; no re-read followed.
    expect(describe).toHaveBeenCalledTimes(1)
  })

  it('hides the row when the namespace is absent and contains write failures', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [] })))
    const { controller } = sandboxController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('unavailable')

    const failing = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
      mutate: () => Promise.resolve({
        rpcId: 'test',
        result: {
          ok: false as const,
          error: { code: 'settings-conflict', message: 'stale', details: {} },
        },
      }),
    }).controller
    await failing.load()
    await failing.save(['/cache', '/other'])
    expect(failing.store.getSnapshot()).toMatchObject({ status: 'error', error: 'stale' })
  })

  it('contains read failures and no-ops without a writable view', async () => {
    const mutate = vi.fn()
    const readOnly = sandboxController({
      describe: () => Promise.resolve(ok({
        writable: false, hasDocument: false, namespaces: [view(['/cache'], 2)],
      })),
      mutate,
    }).controller
    await readOnly.load()
    expect(readOnly.store.getSnapshot()).toMatchObject({
      writable: false,
      roots: ['/cache'],
      revision: 2,
    })
    await readOnly.save(['/other'])
    expect(mutate).not.toHaveBeenCalled()

    const rejected = sandboxController({
      describe: () => Promise.resolve({
        rpcId: 'test',
        result: { ok: false as const, error: { code: 'internal', message: 'offline', details: {} } },
      }),
      mutate,
    }).controller
    await rejected.save(['/other'])
    await rejected.load()
    expect(rejected.store.getSnapshot()).toMatchObject({ status: 'error', error: 'offline' })
    expect(mutate).not.toHaveBeenCalled()

    const thrown = sandboxController({
      describe: async () => { throw 'disconnected' },
      mutate,
    }).controller
    await thrown.load()
    expect(thrown.store.getSnapshot()).toMatchObject({ status: 'error', error: 'disconnected' })

    const stringReject = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
      mutate: () => Promise.reject('wire exploded'),
    }).controller
    await stringReject.load()
    await stringReject.save(['/cache', '/other'])
    expect(stringReject.store.getSnapshot()).toMatchObject({ status: 'error', error: 'wire exploded' })

    const malformed = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(null)] })),
      mutate,
    }).controller
    await malformed.load()
    expect(malformed.store.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'sandbox settings has no extraWritableRoots list',
    })
  })

  it('hides the row in a remote browser instead of loading forever', async () => {
    const describeCall = vi.fn()
    const mutate = vi.fn()
    const wire = { settings: { describe: describeCall, mutate } } as never
    const mirror = new SettingsDescribeMirror(wire, 'memory')
    const controller = new SandboxRootsSettingsController(mirror, wire)
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('unavailable')
    await controller.save(['/cache'])
    expect(describeCall).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('follows a mirror refresh without an own read once loaded', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'], 1)] }))
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache', '/extra'], 2)] }))
    const { mirror, controller } = sandboxController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ roots: ['/cache'] })

    await mirror.load()

    expect(controller.store.getSnapshot()).toMatchObject({ roots: ['/cache', '/extra'], revision: 2 })
  })

  it('drops a save submitted while one is already saving', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view(['/cache', '/extra'], 1))))
    const { controller } = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
      mutate,
    })
    await controller.load()
    const first = controller.save(['/cache', '/extra'])
    const second = controller.save(['/cache', '/other'])
    await Promise.all([first, second])
    expect(mutate).toHaveBeenCalledTimes(1)
  })

  it('disposal stops deriving and suppresses in-flight writes', async () => {
    const neverRead = vi.fn()
    const { controller: neverLoaded } = sandboxController({ describe: neverRead, mutate: vi.fn() })
    neverLoaded.dispose()
    await neverLoaded.load()
    expect(neverLoaded.store.getSnapshot().status).toBe('idle')
    expect(neverRead).not.toHaveBeenCalled()

    const read = Promise.withResolvers<ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>>()
    const { mirror, controller: idle } = sandboxController({ describe: () => read.promise, mutate: vi.fn() })
    const loading = idle.load()
    idle.dispose()
    read.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] }))
    await Promise.all([loading, mirror.load()])
    expect(idle.store.getSnapshot().status).toBe('loading')

    const mutation = Promise.withResolvers<ReturnType<typeof ok<SettingsNamespaceView>>>()
    const { controller: active } = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
      mutate: () => mutation.promise,
    })
    await active.load()
    const saving = active.save(['/cache', '/extra'])
    active.dispose()
    mutation.resolve(ok(view(['/cache', '/extra'], 1)))
    await saving
    expect(active.store.getSnapshot().status).toBe('saving')

    const rejectedMutation = Promise.withResolvers<ReturnType<typeof ok<SettingsNamespaceView>>>()
    const { controller: disposedWrite } = sandboxController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
      mutate: () => rejectedMutation.promise,
    })
    await disposedWrite.load()
    const writing = disposedWrite.save(['/cache', '/extra'])
    disposedWrite.dispose()
    rejectedMutation.reject(new Error('late write'))
    await writing
    expect(disposedWrite.store.getSnapshot().status).toBe('saving')
  })
})
