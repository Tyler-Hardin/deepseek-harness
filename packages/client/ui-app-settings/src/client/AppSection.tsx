import { useState, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AppSection.module.css'

/** Bridge-backed data access the section renders. */
export interface AppSettingsInjected {
  /** The configured server URL (origin), or empty. */
  getServerUrl(): string
  /** Persist a new server URL; the native app reloads the page at it. */
  setServerUrl(url: string): void
  /** Remembered client certificate alias, or "none". */
  getCertInfo(): string
  /** Forget the remembered certificate. */
  forgetCertificate(): void
  /** Recent app/WebView/console events, one per line. */
  getDiagnostics(): string
  /** Clear the event ring buffer. */
  clearDiagnostics(): void
  /** The on-disk crash log. */
  getCrashLog(): string
  /** Clear the on-disk crash log. */
  clearCrashLog(): void
  /** One-line app version/platform/certificate state. */
  getAppInfo(): string
}

/**
 * Full component props: the localized copy face plus the injected bridge
 * access. The section never needs the shell's owner props (it has no flow
 * that leaves settings), so [PropsRuntime] is deliberately absent.
 */
export type AppSectionProps =
  PropsLocale<'settings.app'>
  & InjectFace<AppSettingsInjected>

/** One snapshot of everything the section reads from the bridge. */
interface ViewState {
  serverUrl: string
  cert: string
  diagnostics: string
  crashLog: string
  appInfo: string
  loadFailed: boolean
}

/** Read the whole bridge surface once; failures surface as a visible alert. */
function readAll(deps: AppSettingsInjected): ViewState {
  try {
    return {
      serverUrl: deps.getServerUrl(),
      cert: deps.getCertInfo(),
      diagnostics: deps.getDiagnostics(),
      crashLog: deps.getCrashLog(),
      appInfo: deps.getAppInfo(),
      loadFailed: false,
    }
  } catch {
    return { serverUrl: '', cert: '', diagnostics: '', crashLog: '', appInfo: '', loadFailed: true }
  }
}

/**
 * The App settings page — server hostname, mTLS certificate, and
 * diagnostics, read and written through the native client bridge. Only
 * rendered inside the app: the plugin registers the section only when
 * `window.DshApp` is present.
 * @param props - the section renderer props (locale `t` plus the injected
 * bridge face).
 * @returns the section content.
 */
export function AppSection(props: AppSectionProps): ReactNode {
  const { t, ...deps } = props
  const [state, setState] = useState<ViewState>(() => readAll(deps))
  const [hostname, setHostname] = useState(state.serverUrl)

  const refresh = (): void => {
    const next = readAll(deps)
    setState(next)
    setHostname(next.serverUrl)
  }

  const save = (): void => { deps.setServerUrl(hostname.trim()) }
  const forget = (): void => { deps.forgetCertificate(); refresh() }
  const clearEvents = (): void => { deps.clearDiagnostics(); refresh() }
  const clearCrash = (): void => { deps.clearCrashLog(); refresh() }

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {state.loadFailed && <p className={css.error} role="alert">{t('loadFailed')}</p>}

      <fieldset className={css.block}>
        <legend className={css.legend}>{t('serverLabel')}</legend>
        <div className={css.row}>
          <div className={css.inputWrap}>
            <Input
              aria-label={t('serverLabel')}
              value={hostname}
              onChange={(event) => { setHostname(event.target.value) }}
              placeholder={t('serverPlaceholder')}
            />
          </div>
          <Button variant="primary" onClick={save}>{t('save')}</Button>
        </div>
        <p className={css.hint}>{t('serverHint')}</p>
      </fieldset>

      <fieldset className={css.block}>
        <legend className={css.legend}>{t('certLabel')}</legend>
        <p className={css.text}>
          {state.cert === 'none' ? t('certNone') : t('certUsed', { alias: state.cert })}
        </p>
        <div className={css.row}>
          <Button variant="outline" onClick={forget}>{t('forget')}</Button>
        </div>
      </fieldset>

      <fieldset className={css.block}>
        <legend className={css.legend}>{t('diagLabel')}</legend>
        <h4 className={css.sub}>{t('eventsLabel')}</h4>
        <pre className={css.pre}>{state.diagnostics || t('empty')}</pre>
        <div className={css.row}>
          <Button onClick={clearEvents}>{t('clear')}</Button>
        </div>
        <h4 className={css.sub}>{t('crashLabel')}</h4>
        <pre className={css.pre}>{state.crashLog || t('empty')}</pre>
        <div className={css.row}>
          <Button onClick={clearCrash}>{t('clear')}</Button>
        </div>
        <div className={css.row}>
          <Button onClick={refresh}>{t('refresh')}</Button>
        </div>
      </fieldset>

      <fieldset className={css.block}>
        <legend className={css.legend}>{t('appLabel')}</legend>
        <p className={css.text}>{state.appInfo}</p>
      </fieldset>
    </div>
  )
}
