/**
 * Active-viewer presence for push suppression.
 *
 * The workspace shell knows which Session the page shows, so it reports that
 * Session to the Host while the tab is visible, focused, and has received
 * recent input. The Host holds phone pushes only while a fresh report names
 * the same Session; a stale report, a hidden tab, or no Session lets the push
 * through. The report is best-effort: every failure is ignored because a
 * missing heartbeat only means the phone rings.
 *
 * @module @deepseek-ai/dsh-client-ui-workspace/src/client/presence
 */
import { sessionFromAddress } from './deep-link.ts'

/** Heartbeat while the viewer is active; the Host TTL spans several beats. */
const HEARTBEAT_MS = 10_000
/** Input older than this marks the viewer away even while the tab stays visible. */
const IDLE_MS = 45_000
/** Same-origin Host route owned by `push-notify`. */
const PRESENCE_PATH = '/push/presence'

/** One report the Host stores until the TTL or an inactive report. */
interface PresenceReport {
  readonly clientId: string
  readonly sessionId: string
  readonly active: boolean
}

/** A per-page id: presence distinguishes tabs, it does not authenticate. */
function clientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Send one report; the unload path prefers a beacon that survives teardown. */
function send(report: PresenceReport, beacon: boolean): void {
  const body = JSON.stringify(report)
  if (beacon && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(PRESENCE_PATH, new Blob([body], { type: 'application/json' }))
    return
  }
  void fetch(PRESENCE_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

/**
 * Report the shown Session while this page is actively used.
 * @returns a disposer that stops the heartbeat and clears the report.
 */
export function startPresence(): () => void {
  if (typeof window === 'undefined') return () => {}
  const id = clientId()
  let lastInput = Date.now()
  let lastActive: boolean | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let visible = document.visibilityState === 'visible' && document.hasFocus()

  const tick = (): void => {
    const sessionId = sessionFromAddress()
    const active = visible && sessionId !== undefined && Date.now() - lastInput < IDLE_MS
    if (!active && lastActive === false) return
    lastActive = active
    send({ clientId: id, sessionId: active ? sessionId : '', active }, false)
  }

  const armIdle = (): void => {
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = undefined
      tick()
    }, IDLE_MS)
  }

  const input = (): void => {
    lastInput = Date.now()
    armIdle()
    if (lastActive !== true) tick()
  }

  const rereadVisibility = (): void => {
    visible = document.visibilityState === 'visible' && document.hasFocus()
    tick()
  }

  const focus = rereadVisibility
  const blur = (): void => { visible = false; tick() }

  const heartbeat = setInterval(tick, HEARTBEAT_MS)
  document.addEventListener('visibilitychange', rereadVisibility)
  window.addEventListener('focus', focus)
  window.addEventListener('blur', blur)
  document.addEventListener('pointerdown', input, { passive: true })
  document.addEventListener('pointermove', input, { passive: true })
  document.addEventListener('keydown', input)
  document.addEventListener('wheel', input, { passive: true })
  document.addEventListener('touchstart', input, { passive: true })
  window.addEventListener('scroll', input, { passive: true, capture: true })
  armIdle()
  tick()

  return () => {
    clearInterval(heartbeat)
    if (idleTimer !== undefined) clearTimeout(idleTimer)
    document.removeEventListener('visibilitychange', rereadVisibility)
    window.removeEventListener('focus', focus)
    window.removeEventListener('blur', blur)
    document.removeEventListener('pointerdown', input)
    document.removeEventListener('pointermove', input)
    document.removeEventListener('keydown', input)
    document.removeEventListener('wheel', input)
    document.removeEventListener('touchstart', input)
    window.removeEventListener('scroll', input, { capture: true })
    send({ clientId: id, sessionId: '', active: false }, true)
  }
}
