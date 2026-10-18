/**
 * The Models page's Default model row: the deployment-wide selection every
 * Session without its own starts from. The row sits above the provider cards
 * because it applies across all of them, and it says what it does not decide —
 * a Workspace carrying its own default overrides this one for Sessions created
 * in it. Picking a model writes that namespace through the page store, so the
 * write is revision-fenced and a refusal leaves the selection where it was.
 */

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types'
import {
  defaultModelId, defaultModelLabel, defaultModelOptions, type DefaultModelState,
} from './default-model.ts'
import type { ModelsKey } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Injected dependencies of {@link DefaultModelRow}. */
export interface DefaultModelRowProps {
  /** The row state the page store derived. */
  state: DefaultModelState
  /**
   * Save one picked selection through the page store.
   * @param selection - the route and model the user picked.
   * @returns whether the Host accepted the write.
   */
  save: (selection: ModelSelection) => Promise<boolean>
  /** Whether the settings document accepts writes. */
  readOnly: boolean
  /** Page copy. */
  t: (key: ModelsKey) => string
}

/**
 * Render the Default model row.
 * @param props - the derived state, the page's save callback, and page copy.
 * @returns the row, or null when the deployment serves no shared default.
 */
export function DefaultModelRow({ state, save, readOnly, t }: DefaultModelRowProps): ReactNode {
  const options = useMemo(
    () => state.status === 'ready' ? defaultModelOptions(state.groups) : [],
    [state],
  )
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  if (state.status === 'unavailable') return null

  if (state.status === 'error') {
    return (
      <section className={styles['defaultCard']} aria-label={t('defaultModelLabel')}>
        <span className={styles['rowName']}>{t('defaultModelLabel')}</span>
        <p className={styles['rowHint']}>{t('defaultModelHint')}</p>
        <p className={styles['error']} role="alert">{`${t('defaultModelLoadFailed')}: ${state.message}`}</p>
      </section>
    )
  }

  const currentId = defaultModelId(state.selection)
  const currentLabel = defaultModelLabel(options, state.selection)
  // Provider headings come straight from the groups so an empty group contributes
  // no heading; a provider whose catalog failed contributes none at all.
  const items: MenuEntry[] = state.groups.flatMap(group => [
    { type: 'label' as const, id: `group:${group.id}`, text: group.name },
    ...group.models.map(model => ({
      id: defaultModelId({ provider: group.id, model: model.id }),
      label: model.name,
    })),
  ])
  const failedGroups = state.failures.map(failure => failure.name).join(', ')

  const choose = (id: string): void => {
    setOpen(false)
    const option = options.find(candidate => candidate.id === id)
    if (option === undefined || option.id === currentId) return
    setSaving(true)
    setFailed(false)
    void save(option.selection)
      .catch(() => false)
      .then((accepted) => {
        setSaving(false)
        setFailed(!accepted)
      })
  }

  return (
    <section className={styles['defaultCard']} aria-label={t('defaultModelLabel')}>
      <span className={styles['rowName']}>{t('defaultModelLabel')}</span>
      <p className={styles['rowHint']}>{t('defaultModelHint')}</p>
      <Menu
        open={open}
        items={items}
        selectedId={currentId}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        portal
        anchor={(
          <button
            type="button"
            className={styles['defaultTrigger']}
            aria-haspopup="menu"
            aria-expanded={open}
            // The action and the value it stands for together: the visible text
            // is the model name alone, which as an accessible name would leave
            // the control without an action.
            aria-label={`${t('defaultModelPickAria')} ${currentLabel}`}
            disabled={readOnly || saving}
            onClick={() => { setOpen(!open) }}
          >
            <span className={styles['defaultTriggerLabel']}>
              {saving ? t('defaultModelSaving') : currentLabel}
            </span>
            <span className={styles['defaultChevron']} aria-hidden>
              <IconChevronDownOutlineRegular />
            </span>
          </button>
        )}
      />
      {items.length === 0 && <p className={styles['rowHint']}>{t('defaultModelEmpty')}</p>}
      {failedGroups.length > 0 && (
        <p className={styles['rowHint']}>{`${t('defaultModelGroupsFailed')} ${failedGroups}`}</p>
      )}
      {failed && <p className={styles['error']} role="alert">{t('defaultModelSaveFailed')}</p>}
    </section>
  )
}
