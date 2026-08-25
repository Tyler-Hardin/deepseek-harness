import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { apply as applyNodeHalf } from '../src/index.ts'
import * as VoiceContextUiInvariant from '../src/invariant.ts'

describe('ui-voice-context invariant companion', () => {
  it('reserves the package name against duplicate registration', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(VoiceContextUiInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-client-ui-voice-context', () => {})
    }).toThrow(/already registered/)
  })

  it('node half apply is a no-op', () => {
    expect(applyNodeHalf()).toBeUndefined()
  })
})
