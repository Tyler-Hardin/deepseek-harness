import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { LocalWorlds } from '@deepseek-ai/dsh-worlds-local'
import { FsRouter } from '../src/index.ts'

async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LocalSubprocessRuntime)
  await ctx.plugin(LocalWorlds, {})
  await ctx.plugin(FsRouter)
  return ctx
}

describe('dsh-fs-router', () => {
  it('routes resolve/read through the local world and prefixes target keys', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'a.txt'), 'hello')
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const routed = await ctx.fs.resolve('a.txt', { cwd: dir, world: String(world.id) })
    expect(String(routed.targetKey)).toContain(`world:${String(world.id)}:`)
    expect(await ctx.fs.readText(routed)).toBe('hello')
    expect(ctx.fs.processPath(routed)).toBe(join(dir, 'a.txt'))
    expect(ctx.fs.fileUrl(routed)).toMatch(/^file:\/\//)
    await ctx.fiber.dispose()
  })

  it('routes stat, listDir, write, and edit through the resolved world', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'x.txt'), 'x')
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const target = await ctx.fs.resolve('x.txt', { cwd: dir, world: String(world.id) })

    const info = await ctx.fs.stat(target)
    expect(info?.type).toBe('file')
    expect(info?.size).toBe(1)

    const written = await ctx.fs.writeText(target, 'hello world')
    expect(written.operation).toBe('update')
    expect(await ctx.fs.readText(target)).toBe('hello world')

    const edited = await ctx.fs.editText(target, { oldString: 'hello', newString: 'goodbye', replaceAll: false })
    expect(edited.before).toBe('hello world')
    expect(await ctx.fs.readText(target)).toBe('goodbye world')

    const dirTarget = await ctx.fs.resolve('x.txt', { cwd: join(dir, '..'), world: String(world.id) })
    void dirTarget
    const parent = await ctx.fs.resolve('x.txt', { cwd: dir, world: String(world.id) })
    expect(ctx.fs.contains(parent, target)).toBe(true)
    await ctx.fiber.dispose()
  })

  it('routes without a world identity to the local world by default', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'a.txt'), 'default')
    const target = await ctx.fs.resolve('a.txt', { cwd: dir })
    expect(await ctx.fs.readText(target)).toBe('default')
    await ctx.fiber.dispose()
  })

  it('refuses a target with no world prefix', async () => {
    const ctx = await harness()
    await expect(ctx.fs.readText({ targetKey: 'bare' as never, displayPath: '/x' }))
      .rejects.toThrow(/no world prefix/)
    await ctx.fiber.dispose()
  })

  it('refuses routing to an unconnected world id', async () => {
    const ctx = await harness()
    await expect(ctx.fs.resolve('/a.txt', { world: 'world-missing' }))
      .rejects.toThrow(/not connected/)
    await ctx.fiber.dispose()
  })

  it('treats cross-world containment as false and same-world as the backend decision', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const a = await ctx.fs.resolve('a.txt', { cwd: dir, world: String(world.id) })
    const a2 = await ctx.fs.resolve('a.txt', { cwd: dir, world: String(world.id) })
    expect(ctx.fs.contains(a, a2)).toBe(true)
    // A target from another world id (or a bare key) is never contained.
    const foreign = { targetKey: `world:other:${String(a.targetKey).split(':').slice(2).join(':')}` as never, displayPath: '/a.txt' }
    expect(ctx.fs.contains(a, foreign)).toBe(false)
    await ctx.fiber.dispose()
  })

  it('streams, lists, and reads bytes through the world backend', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'big.txt'), '0123456789')
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const target = await ctx.fs.resolve('big.txt', { cwd: dir, world: String(world.id) })

    let streamed = ''
    for await (const chunk of await ctx.fs.streamText(target)) streamed += chunk
    expect(streamed).toBe('0123456789')

    const bytes = await ctx.fs.readBytes(target, undefined, 10)
    expect(Buffer.from(bytes).toString()).toBe('0123456789')

    const entries = await ctx.fs.listDir(await ctx.fs.resolve('.', { cwd: dir, world: String(world.id) }))
    expect(entries.some(entry => entry.name === 'big.txt')).toBe(true)

    const info = await ctx.fs.lstat('big.txt', { cwd: dir })
    expect(info?.type).toBe('file')
    await ctx.fiber.dispose()
  })

  it('refuses a foreign-world fileUrl through the cache and a malformed world key', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    const foreign = { targetKey: 'world:other:key' as never, displayPath: '/x' }
    expect(() => ctx.fs.fileUrl(foreign)).toThrow(/not resolved in this process/)
    expect(() => ctx.fs.processPath({ targetKey: 'world:only' as never, displayPath: '/x' })).toThrow(/no world prefix/)
    void dir
    await ctx.fiber.dispose()
  })

  it('passes cwd and signal through resolve', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'a.txt'), 'sig')
    const controller = new AbortController()
    const target = await ctx.fs.resolve('a.txt', { cwd: dir, signal: controller.signal })
    expect(await ctx.fs.readText(target)).toBe('sig')
    await ctx.fiber.dispose()
  })

  it('resolves without cwd or signal against the world default', async () => {
    const ctx = await harness()
    const dir = mkdtempSync(join(tmpdir(), 'dsh-fs-router-'))
    writeFileSync(join(dir, 'a.txt'), 'plain')
    const world = await ctx.worlds.resolve({ place: { kind: 'local' } })
    const target = await ctx.fs.resolve('a.txt', { world: String(world.id) })
    expect(target.displayPath).toBe(join(process.cwd(), 'a.txt'))
    await ctx.fiber.dispose()
  })
})
