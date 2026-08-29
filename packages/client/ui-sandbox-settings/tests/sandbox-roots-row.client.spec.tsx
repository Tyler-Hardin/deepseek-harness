// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { SettingsDescribeMirror } from '@deepseek-ai/dsh-client-ui-settings/src/client/settings-mirror.ts'
import { SandboxRootsRow, type SandboxRootsRowProps } from '../src/client/SandboxRootsRow.tsx'
import { en } from '../src/client/locales.ts'
import { SandboxRootsSettingsController, type SettingsWrite } from '../src/client/settings-store.ts'

afterEach(cleanup)

function view(roots: string[], revision = 0): SettingsNamespaceView {
  return {
    ns: 'sandbox',
    schema: { uid: 1, refs: { 1: { type: 'object', dict: {} } } },
    value: { extraWritableRoots: roots },
    base: { extraWritableRoots: [] },
    applies: 'live',
    secrets: [],
    revision,
  }
}

/** One successful Remote answer (the generated namespaces' result envelope). */
function ok<T>(value: T) {
  return { ok: true as const, value }
}

const dictionary: Record<string, string> = en
const t: SandboxRootsRowProps['t'] = key => dictionary[key] ?? key
const runtime = {
  useSessions: (() => { throw new Error('unused') }) as never,
  useWorkspaces: (() => { throw new Error('unused') }) as never,
  usePanelInfo: (() => { throw new Error('unused') }) as never,
  useSessionPendingInteraction: (() => { throw new Error('unused') }) as never,
  useResource: () => ({ status: 'none' as const, value: undefined, failure: undefined }),
}

function derivedController(api: {
  settings: {
    describe: () => Promise<unknown>
    mutate: (...args: unknown[]) => Promise<unknown>
  }
}) {
  // The mirror reads through `ctx.remote`; the write is the callback the plugin
  // binds from the same namespace, so one script drives both directions.
  const ctx = { remote: api } as never
  const write: SettingsWrite = async (ns, ops, expectedRevision) => {
    const response = await api.settings.mutate(ns, ops, expectedRevision) as {
      readonly ok: boolean
      readonly value?: SettingsNamespaceView
      readonly error?: { readonly code: string; readonly message: string }
    }
    if (response.ok && response.value !== undefined) return { kind: 'written', view: response.value }
    return response.error?.code === 'settings/conflict'
      ? { kind: 'conflict', message: response.error.message }
      : { kind: 'refused', message: response.error?.message ?? 'refused' }
  }
  return new SandboxRootsSettingsController(new SettingsDescribeMirror(ctx), write)
}

function mount(controller: SandboxRootsSettingsController) {
  return render(
    <SandboxRootsRow
      {...runtime}
      load={() => controller.load()}
      save={roots => controller.save(roots)}
      useSandboxRoots={bindSnapshotSelector(controller.store)}
      t={t}
    />,
  )
}

describe('SandboxRootsRow', () => {
  it('loads the descriptor and renders the configured roots', async () => {
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache', '~/.local/share'])] })),
        mutate: vi.fn(),
      },
    })
    mount(controller)
    expect(await screen.findByText('Sandbox extra writable roots')).toBeTruthy()
    expect(screen.getByText('/cache')).toBeTruthy()
    expect(screen.getByText('~/.local/share')).toBeTruthy()
  })

  it('shows the empty state when no roots are configured', async () => {
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view([])] })),
        mutate: vi.fn(),
      },
    })
    mount(controller)
    expect(await screen.findByText('No extra writable roots configured')).toBeTruthy()
  })

  it('adds a valid root as a whole-list replacement and clears the draft', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view(['/cache', '~/extra'], 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
        mutate,
      },
    })
    mount(controller)
    const input = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    fireEvent.change(input, { target: { value: '~/extra' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        'sandbox',
        [{ op: 'set', path: ['extraWritableRoots'], value: ['/cache', '~/extra'] }],
        0,
      )
    })
    expect(input.value).toBe('')
  })

  it('submits the draft with Enter and clears the draft error on the next keystroke', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view(['/cache', '~/extra'], 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
        mutate,
      },
    })
    mount(controller)
    const input = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'relative' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((await screen.findByRole('alert')).textContent).toContain('Enter an absolute path or one starting with ~/')
    expect(mutate).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '~/extra' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => { expect(mutate).toHaveBeenCalledOnce() })
  })

  it('ignores an empty draft and a duplicate root', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view(['/cache'], 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
        mutate,
      },
    })
    mount(controller)
    const input = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    // A non-Enter key does not submit.
    fireEvent.keyDown(input, { key: 'a' })
    expect(mutate).not.toHaveBeenCalled()
    // Enter with an empty draft reaches the add handler directly (the button is disabled).
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
    // A duplicate is dropped without a write.
    fireEvent.change(input, { target: { value: '/cache' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mutate).not.toHaveBeenCalled()
  })

  it('removes one root as a whole-list replacement', async () => {
    const mutate = vi.fn(() => Promise.resolve(ok(view(['~/.local/share'], 1))))
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache', '~/.local/share'])] })),
        mutate,
      },
    })
    mount(controller)
    await screen.findByText('/cache')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    await waitFor(() => {
      expect(mutate).toHaveBeenCalledWith(
        'sandbox',
        [{ op: 'set', path: ['extraWritableRoots'], value: ['~/.local/share'] }],
        0,
      )
    })
  })

  it('renders nothing when the host does not expose sandbox settings', async () => {
    const controller = new SandboxRootsSettingsController(new SettingsDescribeMirror({ settings: {} } as never, 'memory'), { settings: {} } as never)
    const { container } = mount(controller)
    await waitFor(() => { expect(controller.store.getSnapshot().status).toBe('unavailable') })
    expect(container.innerHTML).toBe('')
  })

  it('disables the controls while loading or saving', async () => {
    const pendingRead = Promise.withResolvers<ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>>()
    const controller = derivedController({
      settings: {
        describe: () => pendingRead.promise,
        mutate: vi.fn(),
      },
    })
    const loadingView = mount(controller)
    const loadingInput = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    expect(loadingInput.disabled).toBe(true)
    loadingView.unmount()

    pendingRead.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] }))
    const pendingSave = Promise.withResolvers<ReturnType<typeof ok<SettingsNamespaceView>>>()
    const saving = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
        mutate: () => pendingSave.promise,
      },
    })
    mount(saving)
    const savingInput = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    await waitFor(() => { expect(savingInput.disabled).toBe(false) })
    fireEvent.change(savingInput, { target: { value: '~/extra' } })
    fireEvent.keyDown(savingInput, { key: 'Enter' })
    await waitFor(() => { expect(savingInput.disabled).toBe(true) })
    pendingSave.resolve(ok(view(['/cache', '~/extra'], 1)))
  })

  it('surfaces a rejected write as an alert', async () => {
    const controller = derivedController({
      settings: {
        describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view(['/cache'])] })),
        mutate: () => Promise.resolve({
          ok: false as const,
          error: { code: 'settings/conflict', message: 'stale', details: {} },
        }),
      },
    })
    mount(controller)
    const input = await screen.findByLabelText('Sandbox extra writable roots') as HTMLInputElement
    fireEvent.change(input, { target: { value: '~/extra' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((await screen.findByRole('alert')).textContent).toContain('stale')
  })
})
