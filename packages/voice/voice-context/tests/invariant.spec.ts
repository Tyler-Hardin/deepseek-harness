import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as VoiceContextInvariant from '../src/invariant.ts'

describe('voice-context invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(VoiceContextInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-voice-context', () => {})
    }).toThrow(/already registered/)
  })
})
