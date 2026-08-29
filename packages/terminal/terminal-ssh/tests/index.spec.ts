import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { Inbox, type Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import TerminalSessionService, { TerminalBackendCleanupError, TerminalSessionId } from '@deepseek-ai/dsh-terminal'
import type { TerminalBackendSpawnSpec } from '@deepseek-ai/dsh-terminal'
import { SSH_PTY_HANDLE } from '@deepseek-ai/dsh-ssh'
import type { SshPtyHandle, SshPtyOptions, SshWorld } from '@deepseek-ai/dsh-ssh'
import { World, WorldId } from '@deepseek-ai/dsh-worlds'
import type { FileSystem, ShellExecutor, WorldKind, WorldStatus } from '@deepseek-ai/dsh-worlds'
import type { WorkspacePlace } from '@deepseek-ai/dsh-workspace'
import { SshTerminalBackend, shQuote } from '../src/index.ts'
import * as terminalSsh from '../src/index.ts'
import type { ResolvedConfig } from '../src/config.ts'
import { RemotePtySession } from '@deepseek-ai/dsh-terminal-ssh/src/session.ts'
import type { RemotePtyChannel } from '@deepseek-ai/dsh-terminal-ssh/src/session.ts'

class FakeChannel extends EventEmitter implements RemotePtyChannel {
  readonly writes: Array<string | Buffer> = []
  ended = false

  write(data: string | Buffer): boolean {
    if (this.ended) return false
    this.writes.push(data)
    return true
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    this.emit('close')
  }

  emitData(data: string): void {
    this.emit('data', Buffer.from(data, 'utf8'))
  }
}

class FakeWorld extends World {
  readonly id = WorldId('fake-world')
  readonly place: WorkspacePlace

  constructor(
    readonly kind: WorldKind,
    private readonly transport: { pty: (options: SshPtyOptions) => Promise<SshPtyHandle> } | undefined,
  ) {
    super()
    this.place = this.kind === 'ssh' ? { kind: 'ssh', host: 'test' } : { kind: 'local' }
  }

  status(): WorldStatus {
    return 'ready'
  }

  fs(): FileSystem {
    throw new Error('unused')
  }

  shell(): ShellExecutor {
    throw new Error('unused')
  }

  override ssh(): SshWorld | undefined {
    return this.transport as unknown as SshWorld | undefined
  }

  dispose(): Promise<void> {
    return Promise.resolve()
  }
}

function config(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    backendType: 'ssh',
    maxReadBytes: 64,
    scrollbackMaxBytes: 128,
    scrollbackLines: 10,
    rows: 24,
    cols: 80,
    startupTimeoutMs: 200,
    sendTimeoutMs: 100,
    idleSilenceMs: 50,
    pollIntervalMs: 10,
    ...overrides,
  }
}

function agent(ctx: Context, cwd?: string): Agent {
  const id = SessionId('agent')
  const session = Session.create(id, undefined, { version: 0, id, createdAt: 0, ...cwd === undefined ? {} : { cwd } })
  return {
    id, options: {}, session, inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx,
    send: () => {},
    followup: () => {}, steer: () => {}, inject: () => {}, cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

function spec(owner: Agent, overrides: Partial<TerminalBackendSpawnSpec> = {}): TerminalBackendSpawnSpec {
  return { sessionId: TerminalSessionId('pty-1'), owner, type: 'ssh', ...overrides }
}

function stubSession(overrides: Partial<RemotePtySession> = {}): RemotePtySession {
  return {
    motd: '',
    initialize: () => Promise.resolve(),
    startSend: () => { throw new Error('unused') },
    read: () => { throw new Error('unused') },
    signal: () => Promise.resolve({ delivered: true, targetPgid: 1 }),
    status: () => ({ kind: 'running' as const }),
    close: () => Promise.resolve(),
    ...overrides,
  } as unknown as RemotePtySession
}

afterEach(() => { vi.useRealTimers() })

describe('SshTerminalBackend spawn', () => {
  it('composes defaults: resolves the session world, opens the pty, and boots into the workspace path', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const channel = new FakeChannel()
    const pty = vi.fn(async (): Promise<SshPtyHandle> => ({ [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel }))
    const world = new FakeWorld('ssh', { pty })
    ctx.provide('worlds', {
      resolve: async () => world,
      worlds: () => [world],
      get: () => world,
      disconnect: async () => {},
    })
    const backend = new SshTerminalBackend(ctx, config())
    const owner = agent(ctx, '/remote/ws')

    const pending = backend.spawn(spec(owner))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(pty).toHaveBeenCalledWith({ rows: 24, cols: 80 })
    expect(channel.writes).toEqual(["cd '/remote/ws'\r"])
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    const session = await pending
    expect(session.motd).toBe('remote$ ')
    expect(session.status()).toEqual({ kind: 'running' })
    await session.close('test')
  })

  it('prefers the spawn cwd over the header cwd and forwards the path to the world', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const channel = new FakeChannel()
    const pty = vi.fn(async (): Promise<SshPtyHandle> => ({ [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel }))
    const resolveWorld = vi.fn(async () => new FakeWorld('ssh', { pty }))
    const backend = new SshTerminalBackend(
      ctx,
      config(),
      resolveWorld,
      (ch, cfg) => new RemotePtySession(ch, cfg),
    )
    const owner = agent(ctx, '/remote/header')

    const pending = backend.spawn({ ...spec(owner), cwd: '/remote/spec' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolveWorld).toHaveBeenCalledWith(owner.session, '/remote/spec')
    expect(channel.writes).toEqual(["cd '/remote/spec'\r"])
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    const session = await pending
    await session.close('test')
  })

  it('omits the world path and the cd boot when no working path is known', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const channel = new FakeChannel()
    const pty = vi.fn(async (): Promise<SshPtyHandle> => ({ [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel }))
    const world = new FakeWorld('ssh', { pty })
    const resolve = vi.fn(async (_request: { session: unknown; path?: string }) => world)
    ctx.provide('worlds', { resolve, worlds: () => [world], get: () => world, disconnect: async () => {} })
    const backend = new SshTerminalBackend(ctx, config())
    const owner = agent(ctx)

    const pending = backend.spawn(spec(owner))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolve).toHaveBeenCalledWith({ session: owner.session })
    expect(channel.writes).toEqual([])
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    const session = await pending
    await session.close('test')
  })

  it('rejects a local world because a PTY session needs a remote ssh world', async () => {
    const ctx = new Context()
    const backend = new SshTerminalBackend(ctx, config(), async () => new FakeWorld('local', undefined))
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow(
      'requires the owner to run in a remote ssh world',
    )
  })

  it('rejects a remote world that does not expose its transport', async () => {
    const ctx = new Context()
    const bareWorld = { kind: 'ssh' as const } as unknown as World
    const backend = new SshTerminalBackend(ctx, config(), async () => bareWorld)
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow('does not expose its transport')
  })

  it('rejects when the pty open fails', async () => {
    const ctx = new Context()
    const world = new FakeWorld('ssh', { pty: async () => { throw new Error('pty refused') } })
    const backend = new SshTerminalBackend(ctx, config(), async () => world)
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow('pty refused')
  })

  it('rejects a pre-aborted spawn before opening anything', async () => {
    const ctx = new Context()
    const pty = vi.fn()
    const backend = new SshTerminalBackend(ctx, config(), async () => new FakeWorld('ssh', { pty }))
    const controller = new AbortController()
    const reason = new Error('spawn aborted')
    controller.abort(reason)
    await expect(backend.spawn({ ...spec(agent(ctx)), signal: controller.signal })).rejects.toBe(reason)
    expect(pty).not.toHaveBeenCalled()
  })

  it('closes failed startup and aggregates cleanup failure', async () => {
    const ctx = new Context()
    const pty = vi.fn(async (): Promise<SshPtyHandle> => ({ [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel: new FakeChannel() }))
    const world = new FakeWorld('ssh', { pty })

    const closed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const failed = stubSession({ initialize: () => Promise.reject(new Error('startup failed')), close: closed })
    const backend = new SshTerminalBackend(ctx, config(), async () => world, () => failed)
    await expect(backend.spawn(spec(agent(ctx)))).rejects.toThrow('startup failed')
    expect(closed).toHaveBeenCalledWith('PTY startup failed')

    const startupFailure = new Error('startup failed')
    const cleanupFailure = new Error('cleanup failed')
    const doublyFailed = stubSession({
      initialize: () => Promise.reject(startupFailure),
      close: () => Promise.reject(cleanupFailure),
    })
    const aggregate = new SshTerminalBackend(ctx, config(), async () => world, () => doublyFailed)
    await expect(aggregate.spawn(spec(agent(ctx)))).rejects.toEqual(expect.objectContaining({
      name: 'TerminalBackendCleanupError',
      spawnError: startupFailure,
      cleanupError: cleanupFailure,
    } satisfies Partial<TerminalBackendCleanupError>))
  })

  it('starts startup rollback when cancellation wins a stalled initialization', async () => {
    vi.useFakeTimers()
    const ctx = new Context()
    const channel = new FakeChannel()
    const pty = vi.fn(async (): Promise<SshPtyHandle> => ({ [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel }))
    const world = new FakeWorld('ssh', { pty })
    const backend = new SshTerminalBackend(
      ctx,
      config(),
      async () => world,
      (ch, cfg) => new RemotePtySession(ch, cfg),
    )
    const controller = new AbortController()
    const reason = new Error('cancel stalled startup')

    const spawning = backend.spawn(spec(agent(ctx), { signal: controller.signal }))
    const rejected = expect(spawning).rejects.toBe(reason)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    controller.abort(reason)
    await vi.advanceTimersByTimeAsync(120)
    await rejected
    expect(channel.ended).toBe(true)
  })
})

describe('terminal-ssh plugin shape', () => {
  it('keeps name, inject, and Config exports without a default export', () => {
    expect('default' in terminalSsh).toBe(false)
    expect(terminalSsh.name).toBe('terminal-ssh')
    expect(terminalSsh.inject).toEqual(['terminals', 'worlds'])
    expect(terminalSsh.Config).toBeDefined()
  })

  it('quotes remote paths for the POSIX shell', () => {
    expect(shQuote('/plain/path')).toBe("'/plain/path'")
    expect(shQuote("/it's")).toBe("'/it'\\''s'")
  })

  it('registers the configured backend and unregisters on disposal', async () => {
    const ctx = new Context()
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(TerminalSessionService)
    ctx.provide('worlds', {
      resolve: async () => { throw new Error('unused') },
      worlds: () => [],
      get: () => undefined,
      disconnect: async () => {},
    })
    const fiber = await ctx.plugin(terminalSsh, config())
    expect(ctx.terminals.listBackends()).toEqual(['ssh'])
    await fiber.dispose()
    expect(ctx.terminals.listBackends()).toEqual([])
  })
})
