import { useState, type ReactNode } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './AppSection.module.css'

/** Bridge-backed data access the section renders. */
export interface AppSettingsInjected {
  /** The configured server URL (origin), or empty. */
  getServerUrl: () => string
  /** Persist a new server URL; the native app reloads the page at it. */
  setServerUrl: (url: string) => void
  /** Configured servers as JSON; absent on native builds that predate multiple servers. */
  getServers?: () => string
  /** Add a server and return the resulting list JSON. */
  addServer?: (label: string, url: string) => string
  /** Edit a server's label and URL and return the resulting list JSON. */
  updateServer?: (id: string, label: string, url: string) => string
  /** Remove a server and return the resulting list JSON. */
  removeServer?: (id: string) => string
  /** Select the server the app opens; the native app reloads at it. */
  selectServer?: (id: string) => string
  /** Remembered client certificate alias, or "none". */
  getCertInfo: () => string
  /** Forget the remembered certificate. */
  forgetCertificate: () => void
  /** Recent app/WebView/console events, one per line. */
  getDiagnostics: () => string
  /** Clear the event ring buffer. */
  clearDiagnostics: () => void
  /** The on-disk crash log. */
  getCrashLog: () => string
  /** Clear the on-disk crash log. */
  clearCrashLog: () => void
  /** One-line app version/platform/certificate state. */
  getAppInfo: () => string
  /** Read the background task-completion monitoring opt-out; present only on native builds that support monitoring. */
  getMonitoringEnabled?: () => boolean
  /** Persist the monitoring opt-out; starts/stops the native monitor. */
  setMonitoringEnabled?: (enabled: boolean) => void
}

/**
 * Full component props: the localized copy face plus the injected bridge
 * access. The section never needs the shell's owner props (it has no flow
 * that leaves settings), so [PropsRuntime] is deliberately absent.
 */
export type AppSectionProps =
  PropsLocale<'settings.app'>
  & InjectFace<AppSettingsInjected>

/** One configured server as the bridge reports it. */
export interface ServerRow {
  id: string
  label: string
  url: string
  certAlias: string
  active: boolean
}

/** The configured servers and the active selection. */
export interface ServerList {
  rows: ServerRow[]
  activeId: string
}

/** An edit form target: absent id means "add". */
interface ServerForm {
  id?: string
  label: string
  url: string
}

/**
 * Parse the bridge's server list JSON.
 * @param json bridge output.
 * @returns the list, or null when the payload is not the documented JSON.
 */
export function parseServerList(json: string): ServerList | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return null
    const rows = (parsed as { servers?: unknown }).servers
    if (!Array.isArray(rows)) return null
    const list: ServerRow[] = []
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) return null
      const value = row as Record<string, unknown>
      if (typeof value.id !== 'string' || typeof value.url !== 'string') return null
      list.push({
        id: value.id,
        label: typeof value.label === 'string' ? value.label : '',
        url: value.url,
        certAlias: typeof value.certAlias === 'string' ? value.certAlias : '',
        active: value.active === true,
      })
    }
    const activeId = (parsed as { activeId?: unknown }).activeId
    return { rows: list, activeId: typeof activeId === 'string' ? activeId : '' }
  } catch {
    return null
  }
}

/** Error code an edit returns, or null when it applied. */
export function editError(json: string): string | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return 'failed'
    const value = parsed as Record<string, unknown>
    if (value.ok === true) return null
    return typeof value.error === 'string' ? value.error : 'failed'
  } catch {
    return 'failed'
  }
}

/** One snapshot of everything the section reads from the bridge. */
interface ViewState {
  serverUrl: string
  /** Configured servers, or null when this native build has no server list. */
  servers: ServerList | null
  cert: string
  diagnostics: string
  crashLog: string
  appInfo: string
  /** Monitoring opt-out; only meaningful when [monitoringSupported]. */
  monitoringEnabled: boolean
  /** Whether this native build exposes the monitoring bridge. */
  monitoringSupported: boolean
  loadFailed: boolean
}

/** Read the whole bridge surface once; failures surface as a visible alert. */
function readAll(deps: AppSettingsInjected): ViewState {
  try {
    const supported = deps.getMonitoringEnabled !== undefined
    return {
      serverUrl: deps.getServerUrl(),
      servers: deps.getServers === undefined ? null : parseServerList(deps.getServers()),
      cert: deps.getCertInfo(),
      diagnostics: deps.getDiagnostics(),
      crashLog: deps.getCrashLog(),
      appInfo: deps.getAppInfo(),
      monitoringSupported: supported,
      monitoringEnabled: deps.getMonitoringEnabled?.() ?? true,
      loadFailed: false,
    }
  } catch {
    return { serverUrl: '', servers: null, cert: '', diagnostics: '', crashLog: '', appInfo: '', monitoringEnabled: true, monitoringSupported: false, loadFailed: true }
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
  const [form, setForm] = useState<ServerForm | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const refresh = (): void => {
    const next = readAll(deps)
    setState(next)
    setHostname(next.serverUrl)
  }

  const save = (): void => { deps.setServerUrl(hostname.trim()) }

  /** Apply a bridge edit: keep the list on success, report the reason on refusal. */
  const applyEdit = (json: string): boolean => {
    const error = editError(json)
    if (error !== null) {
      setServerError(error)
      return false
    }
    setServerError(null)
    refresh()
    return true
  }

  const useServer = (row: ServerRow): void => {
    if (deps.selectServer === undefined) return
    if (applyEdit(deps.selectServer(row.id))) globalThis.location.assign(row.url)
  }

  const submitServer = (): void => {
    const current = form
    if (current === null) return
    const json = current.id === undefined
      ? deps.addServer?.(current.label, current.url)
      : deps.updateServer?.(current.id, current.label, current.url)
    if (json === undefined) return
    if (applyEdit(json)) setForm(null)
  }

  const removeServer = (row: ServerRow): void => {
    if (deps.removeServer === undefined) return
    if (applyEdit(deps.removeServer(row.id))) setForm(null)
  }
  const forget = (): void => { deps.forgetCertificate(); refresh() }
  const clearEvents = (): void => { deps.clearDiagnostics(); refresh() }
  const clearCrash = (): void => { deps.clearCrashLog(); refresh() }
  const toggleMonitoring = (): void => {
    // Older native builds hide the control entirely; the guard keeps this handler total.
    /* v8 ignore next -- unreachable on supported builds (control not rendered without the setter). */
    if (deps.setMonitoringEnabled === undefined) return
    deps.setMonitoringEnabled(!state.monitoringEnabled)
    refresh()
  }

  return (
    <div className={css.section}>
      <h2 className={css.title}>{t('title')}</h2>
      <p className={css.intro}>{t('intro')}</p>

      {state.loadFailed && <p className={css.error} role="alert">{t('loadFailed')}</p>}

      {state.monitoringSupported && (
        <fieldset className={css.block}>
          <legend className={css.legend}>{t('monitorLabel')}</legend>
          <label className={css.row}>
            <input type="checkbox" checked={state.monitoringEnabled} onChange={toggleMonitoring} />
            <span>{t('monitorToggle')}</span>
          </label>
          <p className={css.hint}>{t('monitorHint')}</p>
        </fieldset>
      )}

      <fieldset className={css.block}>
        <legend className={css.legend}>{state.servers === null ? t('serverLabel') : t('serversLabel')}</legend>
        {state.servers === null ? (
          <>
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
          </>
        ) : (
          <>
            <ul className={css.serverList}>
              {state.servers.rows.map(row => (
                <li key={row.id} className={css.serverRow} data-server-active={row.active ? '' : undefined}>
                  <div className={css.serverText}>
                    <span className={css.serverName}>{row.label.trim() === '' ? t('serverUnset') : row.label}</span>
                    {row.active && <span className={css.serverBadge}>{t('serverActive')}</span>}
                    <span className={css.serverUrl}>{row.url}</span>
                  </div>
                  <div className={css.row}>
                    {!row.active && <Button variant="primary" onClick={() => { useServer(row) }}>{t('serverUse')}</Button>}
                    <Button variant="outline" onClick={() => { setForm({ id: row.id, label: row.label, url: row.url }) }}>{t('serverEdit')}</Button>
                    <Button variant="outline" onClick={() => { removeServer(row) }}>{t('serverRemove')}</Button>
                  </div>
                </li>
              ))}
            </ul>
            {state.servers.rows.length === 0 && <p className={css.hint}>{t('serversEmpty')}</p>}
            {serverError !== null && (
              <p className={css.error} role="alert">
                {serverError === 'duplicate-url' ? t('serverDuplicate') : serverError === 'invalid-url' ? t('serverInvalid') : t('serverFailed')}
              </p>
            )}
            {form === null ? (
              <div className={css.row}>
                <Button variant="primary" onClick={() => { setServerError(null); setForm({ label: '', url: '' }) }}>{t('serverAdd')}</Button>
              </div>
            ) : (
              <div className={css.form}>
                <div className={css.row}>
                  <div className={css.inputWrap}>
                    <Input
                      aria-label={t('serverNameLabel')}
                      value={form.label}
                      onChange={(event) => { setForm({ ...form, label: event.target.value }) }}
                      placeholder={t('serverUnset')}
                    />
                  </div>
                  <div className={css.inputWrap}>
                    <Input
                      aria-label={t('serverUrlLabel')}
                      value={form.url}
                      onChange={(event) => { setForm({ ...form, url: event.target.value }) }}
                      placeholder={t('serverPlaceholder')}
                    />
                  </div>
                </div>
                <div className={css.row}>
                  <Button variant="primary" onClick={submitServer}>{t('save')}</Button>
                  <Button variant="outline" onClick={() => { setForm(null); setServerError(null) }}>{t('cancel')}</Button>
                </div>
              </div>
            )}
            <p className={css.hint}>{t('serversHint')}</p>
          </>
        )}
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
