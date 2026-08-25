// @vitest-environment jsdom
/**
 * Bridge detection: `hasAppBridge` accepts only a full bridge object, and
 * `requireBridge` throws when it is absent.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { hasAppBridge, requireBridge } from '../src/client/bridge.ts'

type GlobalWithBridge = { DshApp?: unknown }

afterEach(() => { delete (globalThis as GlobalWithBridge).DshApp })

describe('window.DshApp bridge detection', () => {
  it('detects a complete bridge', () => {
    (globalThis as GlobalWithBridge).DshApp = { getServerUrl: () => 'https://dsh.example.com' }
    expect(hasAppBridge()).toBe(true)
    expect(requireBridge().getServerUrl()).toBe('https://dsh.example.com')
  })

  it('treats a partial or absent bridge as not an app', () => {
    (globalThis as GlobalWithBridge).DshApp = { notify: () => {} }
    expect(hasAppBridge()).toBe(false)
    delete (globalThis as GlobalWithBridge).DshApp
    expect(hasAppBridge()).toBe(false)
    expect(() => requireBridge()).toThrow()
  })
})
