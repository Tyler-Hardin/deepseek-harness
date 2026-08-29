import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { Buffer } from 'node:buffer'
import { TerminalError } from '@deepseek-ai/dsh-terminal'
import type { TerminalSessionStatus } from '@deepseek-ai/dsh-terminal'
import { RemotePtySession } from '@deepseek-ai/dsh-terminal-ssh/src/session.ts'
import type { RemotePtyChannel } from '@deepseek-ai/dsh-terminal-ssh/src/session.ts'
import type { ResolvedConfig } from '@deepseek-ai/dsh-terminal-ssh/src/config.ts'

class FakeChannel extends EventEmitter implements RemotePtyChannel {
  readonly writes: Array<string | Buffer> = []
  ended = false
  endThrows = false

  write(data: string | Buffer): boolean {
    if (this.ended) return false
    this.writes.push(data)
    return true
  }

  end(): void {
    if (this.endThrows) throw new Error('end failed')
    if (this.ended) return
    this.ended = true
    this.emit('close')
  }

  emitData(data: string): void {
    this.emit('data', Buffer.from(data, 'utf8'))
  }

  emitExit(code: number | null, signalName = ''): void {
    this.emit('exit', code, signalName)
  }

  emitClose(): void {
    this.emit('close')
  }

  emitError(error: unknown): void {
    this.emit('error', error)
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

afterEach(() => { vi.useRealTimers() })

async function initialize(session: RemotePtySession, channel: FakeChannel, boot?: string): Promise<void> {
  const pending = session.initialize(undefined, boot)
  channel.emitData('remote$ ')
  await vi.advanceTimersByTimeAsync(60)
  await pending
}

describe('RemotePtySession readiness and output', () => {
  it('boots an optional line, captures the MOTD, and settles sends on output silence', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())

    const startup = session.initialize(undefined, "cd '/remote/dir'")
    expect(channel.writes).toEqual(["cd '/remote/dir'\r"])
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    await startup
    expect(session.motd).toBe('remote$ ')

    const operation = session.startSend({ text: 'ls', submit: true })
    expect(channel.writes).toEqual(["cd '/remote/dir'\r", 'ls\r'])
    channel.emitData('out\n')
    await vi.advanceTimersByTimeAsync(60)
    expect(await operation.done).toMatchObject({
      waitReason: 'inferred_idle',
      viewport: 'out\n',
      sessionStatus: { kind: 'running' },
    })
    expect(operation.readOutput()).toEqual({ delta: 'out\n', truncated: false })
    expect(operation.readOutput()).toEqual({ delta: '', truncated: false })
    expect(operation.cancel()).toBe(false)
    // Late continuations on a settled operation are ignored.
    const internal = operation as unknown as {
      append(text: string): void
      settle(reason: 'timeout', status: TerminalSessionStatus, inherited: boolean): void
      fail(error: unknown): void
      output: { append(text: string): void }
    }
    internal.output.append('')
    internal.append('ignored')
    internal.settle('timeout', { kind: 'running' }, false)
    internal.fail(new Error('ignored'))
  })

  it('does not treat startup silence as readiness and rejects on the startup deadline', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    const pending = session.initialize()
    const rejected = expect(pending).rejects.toThrow('did not reach readiness before startup timeout')
    await vi.advanceTimersByTimeAsync(40)
    let settled = false
    void pending.then(() => { settled = true }, () => { settled = true })
    await vi.advanceTimersByTimeAsync(20)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(150)
    await rejected
    await session.close('test')
  })

  it('rejects startup when the send deadline beats the startup deadline', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config({ sendTimeoutMs: 100, startupTimeoutMs: 500 }))
    const pending = session.initialize()
    const rejected = expect(pending).rejects.toThrow('did not reach readiness before startup timeout')
    await vi.advanceTimersByTimeAsync(100)
    await rejected
    await session.close('test')
  })

  it('rejects startup when the startup deadline fires before the send deadline', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config({ startupTimeoutMs: 60, sendTimeoutMs: 100 }))
    const pending = session.initialize()
    const rejected = expect(pending).rejects.toThrow('did not reach readiness before startup timeout')
    await vi.advanceTimersByTimeAsync(70)
    await rejected
    await session.close('test')
  })

  it('rejects startup when the remote shell exits', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    const pending = session.initialize()
    channel.emitExit(1)
    channel.emitClose()
    await expect(pending).rejects.toThrow('exited during startup')
    expect(session.status()).toEqual({ kind: 'exited', exitCode: 1, signal: null })
  })

  it('preserves the caller abort reason when startup is canceled before the first write', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    const controller = new AbortController()
    controller.abort(new Error('caller canceled'))
    await expect(session.initialize(controller.signal)).rejects.toThrow('caller canceled')
  })

  it('settles a send on timeout and tracks the exit signal name', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    const timeout = session.startSend({ text: 'blocked', submit: false })
    channel.emitData('.')
    await vi.advanceTimersByTimeAsync(40)
    channel.emitData('.')
    await vi.advanceTimersByTimeAsync(30)
    channel.emitData('.')
    await vi.advanceTimersByTimeAsync(40)
    expect((await timeout.done).waitReason).toBe('timeout')

    const exiting = session.startSend({ text: 'exit', submit: true })
    channel.emitExit(null, 'SIGTERM')
    channel.emitClose()
    expect(await exiting.done).toMatchObject({
      waitReason: 'session_exit',
      sessionStatus: { kind: 'exited', exitCode: null, signal: 'SIGTERM' },
    })
    expect(() => session.startSend({ text: '', submit: false })).toThrow('has exited')
  })

  it('keeps the session running when exit arrives before close', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)
    channel.emitExit(0)
    expect(session.status()).toEqual({ kind: 'running' })
    channel.emitClose()
    expect(session.status()).toEqual({ kind: 'exited', exitCode: 0, signal: null })
  })

  it('cancels with a SIGINT control byte and refuses concurrent sends', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    const controller = new AbortController()
    const operation = session.startSend({ text: 'sleep', submit: true, signal: controller.signal })
    let caught: unknown
    try {
      session.startSend({ text: 'again', submit: true })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TerminalError)
    expect((caught as TerminalError).code).toBe('SEND_ACTIVE')

    controller.abort()
    expect(channel.writes).toContainEqual(Buffer.from([0x03]))
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    await operation.done

    const preAborted = new AbortController()
    preAborted.abort()
    expect(() => session.startSend({ text: '', submit: false, signal: preAborted.signal })).toThrow('aborted before write')
  })

  it('delivers control bytes for SIGINT and SIGTSTP and closes the channel otherwise', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    expect(await session.signal('SIGINT')).toEqual({ delivered: true, targetPgid: 0 })
    expect(await session.signal('SIGTSTP')).toEqual({ delivered: true, targetPgid: 0 })
    expect(channel.writes).toContainEqual(Buffer.from([0x03]))
    expect(channel.writes).toContainEqual(Buffer.from([0x1a]))

    for (const signal of ['SIGTERM', 'SIGKILL', 'SIGHUP'] as const) {
      const closing = new FakeChannel()
      const other = new RemotePtySession(closing, config())
      await initialize(other, closing)
      await other.signal(signal)
      expect(closing.ended).toBe(true)
    }
  })

  it('rejects signals after close', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)
    await session.close('test')
    await expect(session.signal('SIGINT')).rejects.toThrow('closing')
  })

  it('records an exit without a code or signal name as nulls', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)
    channel.emitExit(null)
    channel.emitClose()
    expect(session.status()).toEqual({ kind: 'exited', exitCode: null, signal: null })
  })

  it('contains stale poll continuations and reschedules without leaking timers', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)
    const internal = session as unknown as { schedulePoll(operation: unknown): void }
    internal.schedulePoll({}) // stale operation: the guard returns without scheduling

    const operation = session.startSend({ text: '', submit: false })
    internal.schedulePoll(operation) // an earlier poll timer is still pending: replaced, not stacked
    channel.emitData('more')
    await vi.advanceTimersByTimeAsync(60)
    expect((await operation.done).waitReason).toBe('inferred_idle')
  })

  it('contains stale deadline and readiness continuations', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    const operation = session.startSend({ text: '', submit: false })
    const internal = session as unknown as {
      active: unknown
      statusValue: TerminalSessionStatus
      pollReadiness(operation: unknown): void
    }
    // A deadline firing after the send was already released skips settlement.
    internal.active = undefined
    await vi.advanceTimersByTimeAsync(110)
    // A readiness poll observing an exited session settles it as session_exit.
    internal.active = operation
    internal.statusValue = { kind: 'exited', exitCode: 3, signal: null }
    internal.pollReadiness(operation)
    expect(await operation.done).toMatchObject({
      waitReason: 'session_exit',
      sessionStatus: { kind: 'exited', exitCode: 3, signal: null },
    })
  })
})

describe('RemotePtySession bounds, transport failure, and teardown', () => {
  it('validates pagination and enforces line and UTF-8 bounds', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    expect(() => session.read({ offset: -1 })).toThrow('non-negative safe integer')
    expect(() => session.read({ offset: 1.5 })).toThrow('non-negative safe integer')
    expect(() => session.read({ count: 0 })).toThrow('positive safe integer')
    expect(() => session.read({ count: -2 })).toThrow('positive safe integer')
    expect(() => session.read({ count: 1.5 })).toThrow('positive safe integer')

    // An empty scrollback page reports zero retained lines.
    const blank = new RemotePtySession(new FakeChannel(), config())
    expect(blank.read({ offset: 0 })).toMatchObject({ text: '', totalLines: 0, lineBegin: 0, lineEnd: 0 })

    const first = session.read({ offset: 0, count: 1 })
    expect(first.text).toBe('remote$ ')
    expect(first.totalLines).toBe(1)

    expect(session.read({ offset: 5 })).toMatchObject({ text: '', lineBegin: 5, lineEnd: 5 })

    for (let index = 0; index < 12; index += 1) {
      channel.emitData(`line-${index}\n`)
    }
    // The trailing newline makes the newest retained "line" empty.
    expect(session.read({ offset: 0, count: 1 }).text).toBe('')
    const paged = session.read({ offset: 0, count: 3 })
    expect(paged.text.split('\n')).toHaveLength(3)
    expect(paged.truncated).toBe(true)

    const bounded = session.read({ offset: 0, count: 500 })
    expect(Buffer.byteLength(bounded.text)).toBeLessThanOrEqual(64)
    expect(bounded.truncated).toBe(true)

    // The live viewport bound also applies to unread operation output.
    const streaming = session.startSend({ text: '', submit: false })
    channel.emitData('x'.repeat(200))
    expect(streaming.readOutput().truncated).toBe(true)
    channel.emitData('remote$ ')
    await vi.advanceTimersByTimeAsync(60)
    await streaming.done
  })

  it('fails the active send on transport failure and preserves the first failure through close', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    const operation = session.startSend({ text: 'ls', submit: true })
    const failed = operation.done.then(
      () => { throw new Error('operation resolved') },
      (error: unknown) => error,
    )
    channel.emitError('connection reset')
    const failure = await failed
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('connection reset')
    expect(session.status()).toEqual({ kind: 'exited', exitCode: null, signal: null })

    // The error listener is single-shot; a later failure keeps the first one.
    const internal = session as unknown as { onTransportFailure(error: unknown): void }
    internal.onTransportFailure(new Error('second failure'))
    await expect(session.close('test')).rejects.toThrow('connection reset')

    // A transport failure during channel teardown swallows the end error but
    // still surfaces the session as exited.
    const tearing = new FakeChannel()
    tearing.endThrows = true
    const torn = new RemotePtySession(tearing, config())
    await initialize(torn, tearing)
    tearing.emitError(new Error('wire cut'))
    expect(torn.status()).toEqual({ kind: 'exited', exitCode: null, signal: null })
    await expect(torn.close('teardown')).rejects.toThrow('PTY cleanup failed (teardown)')
  })

  it('closes idempotently, settles an active send as session_exit, and rejects cleanup failure', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)

    const operation = session.startSend({ text: 'sleep', submit: true })
    const first = session.close('test')
    const second = session.close('test')
    expect(second).toBe(first)
    expect((await operation.done).waitReason).toBe('session_exit')
    await first
    expect(channel.ended).toBe(true)
    await session.close('again')

    const broken = new FakeChannel()
    broken.endThrows = true
    const failing = new RemotePtySession(broken, config())
    await initialize(failing, broken)
    const active = failing.startSend({ text: 'x', submit: false })
    const rejected = active.done.then(
      () => { throw new Error('operation resolved') },
      (error: unknown) => error,
    )
    await expect(failing.close('broken')).rejects.toThrow('PTY cleanup failed (broken)')
    expect(await rejected).toBeInstanceOf(Error)
    await expect(failing.close('broken')).rejects.toThrow('PTY cleanup failed (broken)')
  })

  it('rejects new sends while closing and settles a no-op teardown without an active send', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    await initialize(session, channel)
    await session.close('test')
    expect(() => session.startSend({ text: '', submit: false })).toThrow('closing')
  })

  it('replaces invalid UTF-8 and flushes a partial decode at close', async () => {
    vi.useFakeTimers()
    const channel = new FakeChannel()
    const session = new RemotePtySession(channel, config())
    const pending = session.initialize()
    channel.emit('data', Buffer.from([0xc3]))
    channel.emit('data', Buffer.from([0x28]))
    await vi.advanceTimersByTimeAsync(60)
    await pending
    expect(session.motd).toContain('\uFFFD')
    await session.close('test')
  })
})
