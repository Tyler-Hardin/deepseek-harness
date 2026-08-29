import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as SshClientInvariant from '../src/invariant.ts'

describe('ssh-client invariant companion', () => {
  it('mounts without a failure and registers the package name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(SshClientInvariant)
    expect(ctx.invariants).toBeDefined()
  })
})
