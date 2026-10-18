// @vitest-environment jsdom
/** The Models page's Default model row: what it shows and what one pick writes. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DefaultModelRow } from '../src/client/DefaultModelRow.tsx'
import type { DefaultModelRowProps } from '../src/client/DefaultModelRow.tsx'
import type { DefaultModelState } from '../src/client/default-model.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t: DefaultModelRowProps['t'] = key => en[key]

/** The picker's accessible name: the action, then the model it stands for. */
const TRIGGER = new RegExp(`^${en.defaultModelPickAria}`)

const READY: DefaultModelState = {
  status: 'ready',
  selection: { provider: 'origin-gateway', model: 'origin-large' },
  groups: [
    {
      id: 'origin-gateway',
      name: 'Origin Gateway',
      models: [{ id: 'origin-large', name: 'Origin Large' }],
    },
    { id: 'acme-gateway', name: 'Acme Gateway', models: [{ id: 'acme-large', name: 'Acme Large' }] },
  ],
  failures: [],
}

function renderRow(overrides: Partial<DefaultModelRowProps> = {}) {
  const save = overrides.save ?? vi.fn(() => Promise.resolve(true))
  render(<DefaultModelRow state={READY} save={save} readOnly={false} t={t} {...overrides} />)
  return { save }
}

describe('DefaultModelRow', () => {
  it('renders nothing when the deployment serves no shared default', () => {
    const { container } = render(
      <DefaultModelRow state={{ status: 'unavailable' }} save={vi.fn()} readOnly={false} t={t} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('names the current default beside what the row does not decide', () => {
    renderRow()
    expect(screen.getByText(en.defaultModelLabel)).toBeTruthy()
    expect(screen.getByText(en.defaultModelHint)).toBeTruthy()
    expect(screen.getByRole('button', { name: TRIGGER }).textContent)
      .toContain('Origin Large')
  })

  it('saves the model one menu row picks', async () => {
    const { save } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Acme Large' }))
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith({ provider: 'acme-gateway', model: 'acme-large' })
    })
  })

  it('leaves the stored default alone when the picked row is already current', () => {
    const { save } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Origin Large' }))
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a refused write without leaving the picker mid-save', async () => {
    const save = vi.fn(() => Promise.resolve(false))
    renderRow({ save })
    fireEvent.click(screen.getByRole('button', { name: TRIGGER }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Acme Large' }))
    expect(await screen.findByText(en.defaultModelSaveFailed)).toBeTruthy()
    // The trigger is usable again, still naming the stored default.
    const trigger = screen.getByRole('button', { name: TRIGGER })
    expect(trigger.hasAttribute('disabled')).toBe(false)
    expect(trigger.textContent).toContain('Origin Large')
  })

  it('reports a failed catalog read in place of the picker', () => {
    renderRow({ state: { status: 'error', message: 'catalog down' } })
    expect(screen.getByRole('alert').textContent).toBe(`${en.defaultModelLoadFailed}: catalog down`)
    expect(screen.queryByRole('button', { name: TRIGGER })).toBeNull()
    // The row still explains itself: the page around it is unaffected.
    expect(screen.getByText(en.defaultModelHint)).toBeTruthy()
  })

  it('locks the picker while the settings document is read-only', () => {
    renderRow({ readOnly: true })
    expect(screen.getByRole<HTMLButtonElement>('button', { name: TRIGGER }).disabled).toBe(true)
  })

  it('says when no route currently offers a model', () => {
    renderRow({ state: { ...READY, groups: [] } })
    expect(screen.getByText(en.defaultModelEmpty)).toBeTruthy()
  })

  it('names the providers whose catalogs failed', () => {
    renderRow({ state: { ...READY, failures: [{ id: 'ghost', name: 'Ghost', message: 'unreachable' }] } })
    expect(screen.getByText(`${en.defaultModelGroupsFailed} Ghost`)).toBeTruthy()
  })
})
