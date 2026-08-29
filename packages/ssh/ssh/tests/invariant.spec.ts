import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SshInvariant from '../src/invariant.ts'

describe('ssh invariant companion', () => {
  it('mounts without a failure and registers the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(SshInvariant)
    expect(ctx.invariants).toBeDefined()
  })
})
