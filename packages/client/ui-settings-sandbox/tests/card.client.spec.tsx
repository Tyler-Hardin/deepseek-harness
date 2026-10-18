// @vitest-environment jsdom
/** The sandbox page as the Plugins page renders it: its one-liner, its roots field, and what a save does. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SettingsFieldState, SettingsFormShell } from '@deepseek-ai/dsh-client-ui-primitives'
import { SandboxSettingsCard, type SandboxSettingsCardProps } from '../src/client/SandboxSettingsCard.tsx'
import type { SandboxSettingsCardState } from '../src/client/sandbox-settings-controller.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en) => en[key]

const settled: SettingsFormShell = { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false }

function field(text: string, rest: Partial<SettingsFieldState> = {}): SettingsFieldState {
  return { text, overridden: false, invalid: false, ...rest }
}

function renderCard(state: Partial<SandboxSettingsCardState> = {}, view: 'summary' | 'page' = 'page') {
  const store = createSnapshotStore<SandboxSettingsCardState>({
    ...settled, extraWritableRoots: field(''), ...state,
  })
  const actions = { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
  const props = { ...actions, view, t, useSandboxSettingsCard: bindSnapshotSelector(store) } as SandboxSettingsCardProps
  render(<SandboxSettingsCard {...props} />)
  return actions
}

describe('SandboxSettingsCard', () => {
  it('renders its one-liner alone in the summary view', () => {
    renderCard({}, 'summary')

    expect(document.body.textContent).toBe(en.description)
    expect(screen.queryByLabelText(en.extraWritableRoots)).toBeNull()
  })

  it('says the plugin is not loaded in place of its field while its namespace is unavailable', () => {
    renderCard({ available: false })

    expect(screen.getByRole('status').textContent).toBe(en.unavailable)
    expect(screen.queryByLabelText(en.extraWritableRoots)).toBeNull()
  })

  it('shows its roots field at once on its page, without a title of its own', () => {
    renderCard()

    expect(screen.getByLabelText(en.extraWritableRoots)).toBeTruthy()
    expect(screen.queryByText(en.title)).toBeNull()
  })

  it('stages an edit instead of writing it', () => {
    const actions = renderCard()

    fireEvent.change(screen.getByLabelText(en.extraWritableRoots), { target: { value: '~/.cache, /srv/cargo' } })

    expect(actions.edit).toHaveBeenCalledWith('extraWritableRoots', '~/.cache, /srv/cargo')
    expect(actions.save).not.toHaveBeenCalled()
  })

  it('offers the reset for an overridden field only', () => {
    const actions = renderCard({ extraWritableRoots: field('~/.cache', { overridden: true }) })

    expect(screen.getAllByText(en.overridden)).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: en.reset }))

    expect(actions.resetField).toHaveBeenCalledWith('extraWritableRoots')
  })

  it('keeps the save inert until something is staged and writes the staged edit when saved', () => {
    renderCard()
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    cleanup()

    const actions = renderCard({ dirty: true, extraWritableRoots: field('~/.cache', { overridden: true }) })
    fireEvent.click(screen.getByRole('button', { name: en.save }))

    expect(actions.save).toHaveBeenCalledOnce()
    expect(actions.discard).not.toHaveBeenCalled()
  })

  it('drops the staged edits when it leaves the page', () => {
    const actions = renderCard({ dirty: true })
    expect(actions.discard).not.toHaveBeenCalled()

    cleanup()

    expect(actions.discard).toHaveBeenCalledOnce()
  })

  it('blocks the save while a draft is invalid and says why, reports a save in flight, and a refused save', () => {
    renderCard({ dirty: true, invalid: true, extraWritableRoots: field('relative/cache', { invalid: true }) })
    expect(screen.getByRole('button', { name: en.save })).toHaveProperty('disabled', true)
    expect(screen.getByText(en.invalidRoot)).toBeTruthy()
    cleanup()

    renderCard({ dirty: true, saving: true })
    expect(screen.getByRole('button', { name: en.saving })).toHaveProperty('disabled', true)
    cleanup()

    renderCard({ dirty: true, failed: true })
    expect(screen.getByText(en.saveFailed)).toBeTruthy()
    expect(screen.getByLabelText(en.extraWritableRoots)).toBeTruthy()
  })

  it('says the document is read-only and disables its control', () => {
    renderCard({ writable: false })

    expect(screen.getByRole('status')).toHaveProperty('textContent', en.readOnly)
    expect(screen.getByLabelText(en.extraWritableRoots)).toHaveProperty('disabled', true)
  })
})
