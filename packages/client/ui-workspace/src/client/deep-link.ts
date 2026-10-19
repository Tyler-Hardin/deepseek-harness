/**
 * Session deep links: `?session=<id>` names the Conversation a page should show,
 * so a refresh, a shared address, or a native notification tap lands on that run.
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Query parameter carrying the Session id a page should open. */
export const SESSION_QUERY = 'session'

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

/**
 * Read the Session id a page URL names.
 * @param url - the page URL.
 * @returns the branded Session id, or undefined when absent or malformed.
 */
export function sessionFromUrl(url: URL): SessionId | undefined {
  const value = url.searchParams.get(SESSION_QUERY)
  return value !== null && SESSION_ID.test(value) ? value as SessionId : undefined
}

/**
 * Rewrite a page URL with the Session it should name, preserving the path, other
 * query parameters, and the hash.
 * @param url - the current page URL.
 * @param sessionId - the selected Session, or undefined to drop the parameter.
 * @returns the address to write into history.
 */
export function urlWithSession(url: URL, sessionId: SessionId | undefined): string {
  const next = new URL(url.href)
  if (sessionId === undefined) next.searchParams.delete(SESSION_QUERY)
  else next.searchParams.set(SESSION_QUERY, sessionId)
  return `${next.pathname}${next.search}${next.hash}`
}

/** Page address and history when this host has them; DOM-less test and worker hosts do not. */
interface PageGlobals {
  readonly location?: Location
  readonly history?: History
}

const page = globalThis as PageGlobals

/**
 * Keep the address bar in step with the shown Session; a reload or a copied link
 * then reopens it. Only a changed address reaches the history owner.
 * @param href - the current page URL.
 * @param sessionId - the selected Session, or undefined when no Conversation is shown.
 * @param replace - replaces the current history entry with the given address.
 */
export function reflectSessionInUrl(
  href: string,
  sessionId: SessionId | undefined,
  replace: (url: string) => void,
): void {
  const current = new URL(href)
  const next = urlWithSession(current, sessionId)
  if (next === `${current.pathname}${current.search}${current.hash}`) return
  replace(next)
}

/**
 * Read the Session the page address names, when the host has one.
 * @returns the linked Session id, or undefined outside a browser or without a link.
 */
export function sessionFromAddress(): SessionId | undefined {
  const location = page.location
  return location === undefined ? undefined : sessionFromUrl(new URL(location.href))
}

/**
 * Mirror the shown Session into the page address; a load without a DOM address is a no-op.
 * @param sessionId - the shown Session, or undefined when no Conversation is shown.
 */
export function reflectSessionInAddress(sessionId: SessionId | undefined): void {
  const { location, history } = page
  if (location === undefined || history === undefined) return
  reflectSessionInUrl(location.href, sessionId, (url) => { history.replaceState(null, '', url) })
}
