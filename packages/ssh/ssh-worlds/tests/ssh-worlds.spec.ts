import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Session } from '@deepseek-ai/dsh-session'
import Ssh2Service from '@deepseek-ai/dsh-ssh-client'
import { SshWorlds } from '../src/index.ts'
import { startSshd, type SshdFixture } from './sshd.ts'

function tempHome(fixture: SshdFixture): string {
  const home = mkdtempSync(join(tmpdir(), 'dsh-ssh-worlds-home-'))
  const ssh = join(home, '.ssh')
  mkdirSync(ssh, { recursive: true, mode: 0o700 })
  writeFileSync(join(ssh, 'id_ed25519'), fixture.userKeyPrivate, { mode: 0o600 })
  writeFileSync(join(ssh, 'known_hosts'), `[127.0.0.1]:${fixture.port} ssh-ed25519 ${fixture.hostKeyBlob}\n`, { mode: 0o600 })
  return home
}

describe('dsh-ssh-worlds', () => {
  let fixture: SshdFixture
  let harnesses: Context[] = []

  beforeEach(async () => {
    fixture = await startSshd()
    harnesses = []
  })

  afterEach(async () => {
    for (const ctx of harnesses) await ctx.fiber.dispose()
    await fixture.close()
  })

  async function harness(config: ConstructorParameters<typeof SshWorlds>[1] = {}): Promise<Context> {
    const home = tempHome(fixture)
    const ctx = new Context()
    await ctx.plugin(Ssh2Service, { homeDir: home, timeoutMs: 5000 })
    await ctx.plugin(SshWorlds, config)
    harnesses.push(ctx)
    return ctx
  }

  it('connects with provider config defaults', async () => {
    const ctx = await harness({ connectTimeoutMs: 5000, strictHostKey: false })
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    expect(world.status()).toBe('ready')
  })

  it('resolves an ssh place to a ready world and exposes its backends', async () => {
    const ctx = await harness()
    writeFileSync(join(fixture.root, 'file.txt'), 'hello')
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    expect(world.kind).toBe('ssh')
    expect(world.status()).toBe('ready')
    expect(ctx.worlds.worlds()).toHaveLength(1)

    // The filesystem backend serves the remote world's path namespace.
    const fs = world.fs()
    const target = await fs.resolve('/file.txt')
    expect((await fs.readText(target)).trim()).toBe('hello')
    // The shell backend runs through the remote exec channel.
    const shell = world.shell()
    const result = await shell.run(shell.resolve({ command: 'echo hi' }))
    expect(result.stdout.text).toBe('hi\n')
    // The remote world exposes its ssh transport for transport-specific verbs.
    expect(world.ssh?.()?.status()).toBe('connected')

    await ctx.worlds.disconnect(world.id)
    expect(ctx.worlds.worlds()).toHaveLength(0)
    expect(world.status()).toBe('closed')
  })

  it('refcounts by target and reuses a ready world', async () => {
    const ctx = await harness()
    const place = { kind: 'ssh' as const, host: '127.0.0.1', port: fixture.port, user: 'test' }
    const first = await ctx.worlds.resolve({ place })
    const second = await ctx.worlds.resolve({ place })
    expect(first).toBe(second)
    expect(ctx.worlds.worlds()).toHaveLength(1)
    // get returns the live world and nothing for an unknown id.
    expect(ctx.worlds.get(first.id)).toBe(first)
    expect(ctx.worlds.get('nope' as never)).toBeUndefined()
  })

  it('rejects a local place loudly', async () => {
    const ctx = await harness()
    await expect(ctx.worlds.resolve({ place: { kind: 'local' } }))
      .rejects.toThrow(/local worlds provider/)
    // A session-less, place-less resolve defaults to the local place.
    await expect(ctx.worlds.resolve())
      .rejects.toThrow(/local worlds provider/)
  })

  it('ignores disconnect for an unknown world id', async () => {
    const ctx = await harness()
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    await ctx.worlds.disconnect('nope' as never)
    expect(ctx.worlds.worlds()).toHaveLength(1)
    await ctx.worlds.disconnect(world.id)
    expect(ctx.worlds.worlds()).toHaveLength(0)
  })

  it('disposes live worlds at composition disposal', async () => {
    const ctx = await harness()
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    await ctx.fiber.dispose()
    expect(world.status()).toBe('closed')
  })

  it('resolves through an explicit path for the backends default cwd', async () => {
    const ctx = await harness()
    mkdirSync(join(fixture.root, 'proj'), { recursive: true })
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
      path: '/proj',
    })
    const fs = world.fs()
    const target = await fs.resolve('.')
    expect(target.displayPath).toBe('/proj')
    // The shell backend receives the same default cwd.
    const shell = world.shell()
    const result = await shell.run(shell.resolve({ command: 'pwd', workdir: '/proj' }))
    expect(result.exitCode).toBe(0)
  })

  it('resolves a place without an explicit user (local default user)', async () => {
    const ctx = await harness()
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port },
    })
    expect(world.kind).toBe('ssh')
    expect(ctx.worlds.worlds()).toHaveLength(1)
  })


  it('appends an ssh/connect event when a session enters a remote world', async () => {
    const ctx = await harness()
    const session = Session.create('sess-1' as never)
    await ctx.worlds.resolve({
      session,
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    const connects = session.events.filter(event => event.type === 'ssh/connect')
    expect(connects).toHaveLength(1)
    const first = connects[0]
    if (first === undefined || first.type !== 'ssh/connect') throw new Error('missing ssh/connect')
    expect(first.data.host).toBe('127.0.0.1')
    // Re-resolving the same ready world records another connect entry.
    await ctx.worlds.resolve({
      session,
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    expect(session.events.filter(event => event.type === 'ssh/connect')).toHaveLength(2)
    // Disconnecting the world records one exit event for the bound session,
    // mirroring its connect entries.
    await ctx.worlds.disconnect((await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })).id)
    const disconnects = session.events.filter(event => event.type === 'ssh/disconnect')
    expect(disconnects).toHaveLength(1)
    const exit = disconnects[0]
    if (exit === undefined || exit.type !== 'ssh/disconnect') throw new Error('missing ssh/disconnect')
    expect(exit.data.sessionId).toBe('sess-1')
  })

  it('composes backends without colliding with a parent-scope provider', async () => {
    const ctx = await harness()
    // A router mounted on the parent scope already owns the fs/shell names;
    // the world's backend registrations must land on fresh isolate labels.
    ctx.provide('fs' as never, { standin: true } as never)
    ctx.provide('shell' as never, { standin: true } as never)
    const world = await ctx.worlds.resolve({
      place: { kind: 'ssh', host: '127.0.0.1', port: fixture.port, user: 'test' },
    })
    // Composing the backends registers under the world's own labels and works.
    const fs = world.fs()
    const shell = world.shell()
    const result = await shell.run(shell.resolve({ command: 'echo hi' }))
    expect(result.stdout.text).toBe('hi\n')
    await expect(fs.resolve('/')).resolves.toBeDefined()
  })

  it('reconnects after a world was disposed', async () => {
    const ctx = await harness()
    const place = { kind: 'ssh' as const, host: '127.0.0.1', port: fixture.port, user: 'test' }
    const first = await ctx.worlds.resolve({ place })
    await ctx.worlds.disconnect(first.id)
    // The disposed world is dropped from the registry; a new resolve reconnects.
    const second = await ctx.worlds.resolve({ place })
    expect(second).not.toBe(first)
    expect(second.status()).toBe('ready')
  })
})
