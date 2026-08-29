/**
 * Sandbox preference row: the host-local extra writable roots `workspace-write`
 * may write beyond the session workspace and temp areas. The list is edited
 * as whole replacements through the host Settings API; the server schema
 * rejects non-absolute spellings, and the row mirrors that check before it
 * ever sends one.
 */

import { useEffect, useState } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SandboxSettingsKey } from './locales.ts'
import type { SandboxRootsSettingsState } from './settings-store.ts'
import css from './SandboxRootsRow.module.css'

/** Registration-side business face for the host-backed preference. */
export interface SandboxRootsRowInjected {
  hooks: {
    /** Sandbox roots snapshot bound by the renderer as useSandboxRoots. */
    sandboxRoots: SnapshotStore<SandboxRootsSettingsState>
  }
  /** Load the descriptor when the row first renders. */
  load: () => Promise<void>
  /** Persist one complete extra-writable-roots list. */
  save: (roots: string[]) => Promise<void>
}

/** Full component props. */
export type SandboxRootsRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.sandbox'>
  & InjectFace<SandboxRootsRowInjected>

/** A writable-root spelling: absolute, or `~` / `~/<path>` — the host schema's own rule. */
const WRITABLE_ROOT_PATTERN = /^(?:~(?:\/.*)?|\/[^\0]*|[A-Za-z]:[\\/][^\0]*|\\\\[^\0]*)$/

/** Whether one draft value is a plausible writable-root spelling (the host re-validates on save). */
export function isWritableRootSpelling(value: string): boolean {
  return WRITABLE_ROOT_PATTERN.test(value)
}

/**
 * Render the Sandbox extra-writable-roots editor row.
 * @param props - composed slot props.
 * @returns the row, or null when the host does not expose sandbox settings.
 */
export function SandboxRootsRow({ load, save, useSandboxRoots, t }: SandboxRootsRowProps) {
  const state = useSandboxRoots(snapshot => snapshot)
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'unavailable') return null
  const busy = state.status === 'loading' || state.status === 'saving'

  const addRoot = (): void => {
    const value = draft.trim()
    if (value === '') return
    if (!isWritableRootSpelling(value)) {
      setDraftError(t('invalidPath'))
      return
    }
    if (state.roots.includes(value)) return
    setDraftError(null)
    setDraft('')
    void save([...state.roots, value])
  }

  const removeRoot = (root: string): void => {
    void save(state.roots.filter(existing => existing !== root))
  }

  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('title')}</div>
        <div className={css.desc} role={state.error === null ? undefined : 'alert'}>{state.error ?? t('description')}</div>
      </div>
      <div className={css.list}>
        {state.roots.length === 0
          ? <div className={css.empty}>{t('empty')}</div>
          : state.roots.map(root => (
            <div className={css.item} key={root}>
              <span className={css.path}>{root}</span>
              <button
                type="button"
                className={css.remove}
                disabled={busy || !state.writable}
                onClick={() => { removeRoot(root) }}
              >
                {t('removeLabel')}
              </button>
            </div>
          ))}
      </div>
      <div className={css.addRow}>
        <input
          className={css.input}
          value={draft}
          disabled={busy || !state.writable}
          placeholder={t('addPlaceholder')}
          aria-label={t('title')}
          onChange={(event) => {
            setDraft(event.target.value)
            if (draftError !== null) setDraftError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addRoot()
          }}
        />
        <button
          type="button"
          className={css.add}
          disabled={busy || !state.writable || draft.trim() === ''}
          onClick={addRoot}
        >
          {t('addLabel')}
        </button>
      </div>
      {draftError !== null
        ? <div className={css.error} role="alert">{draftError}</div>
        : null}
    </div>
  )
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sandbox row copy. */
    'settings.sandbox': SandboxSettingsKey
  }
}
