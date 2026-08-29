import { describe, expect, it } from 'vitest'
import { Config, resolveConfig } from '@deepseek-ai/dsh-terminal-ssh/src/config.ts'

describe('terminal-ssh config', () => {
  it('defaults every tunable through the explicit resolve step', () => {
    expect(resolveConfig()).toEqual({
      backendType: 'ssh',
      maxReadBytes: 16 * 1024,
      scrollbackMaxBytes: 64 * 1024,
      scrollbackLines: 1000,
      rows: 24,
      cols: 80,
      startupTimeoutMs: 10000,
      sendTimeoutMs: 120000,
      idleSilenceMs: 300,
      pollIntervalMs: 100,
    })
  })

  it('applies explicit overrides and leaves unset fields at their defaults', () => {
    const resolved = resolveConfig({ backendType: 'remote', rows: 40, cols: 160, idleSilenceMs: 50 })
    expect(resolved.backendType).toBe('remote')
    expect(resolved.rows).toBe(40)
    expect(resolved.cols).toBe(160)
    expect(resolved.idleSilenceMs).toBe(50)
    expect(resolved.maxReadBytes).toBe(16 * 1024)
  })

  it('rejects non-natural bounds at the schema boundary', () => {
    expect(() => Config({ rows: -1 })).toThrow()
    expect(() => Config({ idleSilenceMs: 1.5 })).toThrow()
  })
})
