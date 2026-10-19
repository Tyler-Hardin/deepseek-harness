/** `?session=` deep links: parsing, writing, and reflecting the shown Conversation. */
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SESSION_QUERY, reflectSessionInUrl, sessionFromUrl, urlWithSession } from '../src/client/deep-link.ts'

const sid = (id: string): SessionId => SessionId(id)
const LINKED = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

describe('session deep links', () => {
  it('reads a well-formed Session id and rejects everything else', () => {
    expect(sessionFromUrl(new URL(`https://dsh.example/?${SESSION_QUERY}=${LINKED}`))).toBe(LINKED)
    expect(sessionFromUrl(new URL('https://dsh.example/'))).toBeUndefined()
    expect(sessionFromUrl(new URL('https://dsh.example/?session=not-a-session'))).toBeUndefined()
    expect(sessionFromUrl(new URL('https://dsh.example/?session='))).toBeUndefined()
    expect(sessionFromUrl(new URL('https://dsh.example/?session=../../etc/passwd'))).toBeUndefined()
  })

  it('writes and drops the parameter without disturbing the rest of the address', () => {
    expect(urlWithSession(new URL('https://dsh.example/#chat'), sid(LINKED))).toBe(`/?${SESSION_QUERY}=${LINKED}#chat`)
    expect(urlWithSession(new URL(`https://dsh.example/?tab=1&${SESSION_QUERY}=${OTHER}`), sid(LINKED)))
      .toBe(`/?tab=1&${SESSION_QUERY}=${LINKED}`)
    expect(urlWithSession(new URL(`https://dsh.example/?tab=1&${SESSION_QUERY}=${LINKED}`), undefined))
      .toBe('/?tab=1')
  })

  it('publishes only an address that actually changed', () => {
    const replace = vi.fn<(url: string) => void>()
    reflectSessionInUrl(`https://dsh.example/?${SESSION_QUERY}=${LINKED}`, sid(LINKED), replace)
    expect(replace).not.toHaveBeenCalled()
    reflectSessionInUrl(`https://dsh.example/?${SESSION_QUERY}=${LINKED}`, sid(OTHER), replace)
    expect(replace).toHaveBeenCalledWith(`/?${SESSION_QUERY}=${OTHER}`)
    reflectSessionInUrl(`https://dsh.example/?${SESSION_QUERY}=${LINKED}`, undefined, replace)
    expect(replace).toHaveBeenLastCalledWith('/')
  })
})
