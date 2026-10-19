/** The browser presence reporter stays inert where no DOM exists. */
import { describe, expect, it } from 'vitest'
import { startPresence } from '../src/client/presence.ts'

describe('presence outside a browser', () => {
  it('returns a no-op disposer', () => {
    const dispose = startPresence()
    expect(() => dispose()).not.toThrow()
  })
})
