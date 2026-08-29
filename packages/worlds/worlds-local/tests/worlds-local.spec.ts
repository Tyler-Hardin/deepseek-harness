import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { LocalWorlds } from '../src/index.ts'

describe('dsh-worlds-local', () => {
  it('resolves a local place to the local world and exposes its backends', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(LocalWorlds, {})
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    expect(world.kind).toBe('local')
    expect(world.status()).toBe('ready')
    expect(ctx.worlds.worlds()).toHaveLength(1)

    // The filesystem backend resolves and serves this world's path namespace.
    const fs = world.fs()
    const target = await fs.resolve('/tmp')
    expect(target.displayPath).toBe('/tmp')
    // The shell backend is the same world's executor.
    const shell = world.shell()
    expect(shell.sandboxMode).toBeUndefined()

    await ctx.worlds.disconnect(world.id)
    expect(ctx.worlds.worlds()).toHaveLength(0)
    expect(world.status()).toBe('closed')
    await ctx.fiber.dispose()
  })

  it('defaults a session-less resolve to the local world and refcounts by id', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalWorlds, {})
    const first = await ctx.worlds.resolve()
    const second = await ctx.worlds.resolve()
    expect(first).toBe(second)
    expect(ctx.worlds.worlds()).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('rejects a remote place loudly', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalWorlds, {})
    await expect(ctx.worlds.resolve({ place: { kind: 'ssh', host: 'example.com' } }))
      .rejects.toThrow(/transport-aware worlds provider/)
    await ctx.fiber.dispose()
  })

  it('reports closed after composition disposal and disposes the child context', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalWorlds, {})
    const world = await ctx.worlds.resolve()
    await ctx.fiber.dispose()
    expect(world.status()).toBe('closed')
    // Backend access after dispose is refused loudly.
    expect(() => world.fs()).toThrow(/closed/)
    expect(() => world.shell()).toThrow(/closed/)
  })

  it('disposes idempotently and ignores unknown disconnect ids', async () => {
    const ctx = new Context()
    await ctx.plugin(LocalWorlds, {})
    const world = await ctx.worlds.resolve()
    // Direct dispose, then a second direct dispose is a no-op.
    await world.dispose()
    await world.dispose()
    // Disconnect through the service clears the reference and re-disposes
    // idempotently.
    await ctx.worlds.disconnect(world.id)
    expect(ctx.worlds.worlds()).toHaveLength(0)
    // An unknown id resolves without error.
    await ctx.worlds.disconnect('nope' as never)
    await ctx.fiber.dispose()
  })
})
