import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { LocalWorlds } from '@deepseek-ai/dsh-worlds-local'
import { ShellRouter } from '../src/index.ts'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalWorlds, {})
  await ctx.plugin(ShellRouter)
  return ctx
}

describe('dsh-shell-router', () => {
  it('defaults resolve and stamps the caller world identity', async () => {
    const ctx = await harness()
    const spec = ctx.shell.resolve({ command: 'echo hi', world: 'world-abc' })
    expect(spec.command).toBe('echo hi')
    expect(spec.timeoutMs).toBe(120_000)
    expect(spec.stdoutMaxBytes).toBe(64_000)
    expect(spec.world).toBe('world-abc')
    expect(spec.workdir).toBe(process.cwd())

    const bare = ctx.shell.resolve({ command: 'echo hi' })
    expect(bare.world).toBeUndefined()
    await ctx.fiber.dispose()
  })

  it('rejects invalid resolve inputs', async () => {
    const ctx = await harness()
    expect(() => ctx.shell.resolve({ command: 'x', timeoutMs: 0 })).toThrow(/timeoutMs/)
    expect(() => ctx.shell.resolve({ command: 'x', stdoutMaxBytes: -1 })).toThrow(/stdoutMaxBytes/)
    await ctx.fiber.dispose()
  })

  it('passes optional request fields through resolve', async () => {
    const ctx = await harness()
    const controller = new AbortController()
    const spec = ctx.shell.resolve({
      command: 'x',
      signal: controller.signal,
      stdin: 'in',
      env: { A: '1' },
      dshEnv: { DSH_TEST: '2' },
      sandboxPolicy: { kind: 'spawn' } as never,
    })
    expect(spec.signal).toBe(controller.signal)
    expect(spec.stdin).toBe('in')
    expect(spec.env).toEqual({ A: '1' })
    expect(spec.dshEnv).toEqual({ DSH_TEST: '2' })
    expect(spec.sandboxPolicy).toEqual({ kind: 'spawn' })
    await ctx.fiber.dispose()
  })

  it('runs through the resolved world executor', async () => {
    const ctx = await harness()
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const spec = ctx.shell.resolve({ command: 'echo hi', world: String(world.id) })
    const result = await ctx.shell.run(spec)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('hi\n')
    await ctx.fiber.dispose()
  })

  it('routes a world-less spec to the local world', async () => {
    const ctx = await harness()
    const spec = ctx.shell.resolve({ command: 'echo local' })
    const result = await ctx.shell.run(spec)
    expect(result.stdout.text).toBe('local\n')
    await ctx.fiber.dispose()
  })

  it('starts a background process through the resolved world', async () => {
    const ctx = await harness()
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const spec = ctx.shell.resolve({ command: 'echo bg', world: String(world.id) })
    const proc = ctx.shell.start(spec)
    await proc.done
    expect(proc.status).toBe('completed')
    expect(proc.readOutput().delta).toBe('bg\n')
    // A repeated start reuses the cached world.
    const again = ctx.shell.start(spec)
    await again.done
    expect(again.readOutput().delta).toBe('bg\n')
    await ctx.fiber.dispose()
  })

  it('routes a world-less start to the local world once resolved', async () => {
    const ctx = await harness()
    await ctx.worlds.resolve({ place: { kind: 'local' } })
    const spec = ctx.shell.resolve({ command: 'echo local' })
    const proc = ctx.shell.start(spec)
    await proc.done
    expect(proc.readOutput().delta).toBe('local\n')
    await ctx.fiber.dispose()
  })

  it('refuses routing to an unconnected or never-resolved world', async () => {
    const ctx = await harness()
    const spec = ctx.shell.resolve({ command: 'echo x', world: 'world-missing' })
    await expect(ctx.shell.run(spec)).rejects.toThrow(/not connected/)
    // A start without a prior run (empty cache) refuses.
    const bare = { ...ctx.shell.resolve({ command: 'echo y' }), world: 'world-nocache' }
    expect(() => ctx.shell.start(bare)).toThrow(/not resolved in this process/)
    await ctx.fiber.dispose()
  })
})
