/** The sandbox policy's settings page: the standing writable roots beyond the workspace. */

import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { SandboxSettingsCardFace } from './sandbox-settings-controller.ts'

/** Props the renderer binds for the sandbox page. */
export type SandboxSettingsCardProps =
  PropsRuntime<'plugins.item'>
  & PropsLocale<'settings.sandbox'>
  & InjectFace<SandboxSettingsCardFace>

/**
 * Render the sandbox policy's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export function SandboxSettingsCard(props: SandboxSettingsCardProps) {
  const { t } = props
  const state = props.useSandboxSettingsCard(snapshot => snapshot)
  if (props.view === 'summary') return t('description')
  return (
    <SettingsForm labels={formLabels(t)} state={state} onSave={props.save} onDiscard={props.discard}>
      <SettingsValueField
        id="plugin-config-sandbox-roots"
        label={t('extraWritableRoots')}
        hint={t('extraWritableRootsHint')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidRoot')}
        disabled={!state.writable}
        {...state.extraWritableRoots}
        onEdit={(text) => { props.edit('extraWritableRoots', text) }}
        onReset={() => { props.resetField('extraWritableRoots') }}
      />
    </SettingsForm>
  )
}
