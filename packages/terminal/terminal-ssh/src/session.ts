/** Persistent remote PTY session over one ssh world's pty channel. */

import { Buffer } from 'node:buffer'
import type {
  TerminalBackendSession,
  TerminalReadRequest,
  TerminalReadResult,
  TerminalSendOperation,
  TerminalSendRead,
  TerminalSendRequest,
  TerminalSendResult,
  TerminalSessionStatus,
  TerminalSignal,
  TerminalSignalResult,
  TerminalWaitReason,
} from '@deepseek-ai/dsh-terminal'
import { TerminalError } from '@deepseek-ai/dsh-terminal'
import type { ResolvedConfig } from './config.ts'

/** The minimal ssh2 ClientChannel surface this backend drives. */
export interface RemotePtyChannel {
  write(data: string | Buffer): boolean
  on(event: 'data', listener: (data: Buffer) => void): void
  once(event: 'exit', listener: (code: number | null, signalName: string) => void): void
  once(event: 'close', listener: () => void): void
  once(event: 'error', listener: (error: Error) => void): void
  end(): void
}

/* jscpd:ignore-start -- this SSH PTY session mirrors the local PTY backend's
   session implementation for the same terminal seam (bounded-output helpers
   verbatim, session lifecycle adapted to the channel); extract to a shared
   terminal package when a third backend needs them. */
function utf8Tail(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (Buffer.byteLength(text) <= maxBytes) return { text, truncated: false }
  const chars = Array.from(text)
  let bytes = 0
  let start = chars.length
  while (start > 0) {
    const next = Buffer.byteLength(chars[start - 1] as string)
    if (bytes + next > maxBytes) break
    bytes += next
    start -= 1
  }
  return { text: chars.slice(start).join(''), truncated: true }
}

/** Bounded byte/line buffer shared by the live viewport and scrollback. */
class BoundedTextBuffer {
  private value = ''
  private dropped = false

  constructor(
    private readonly maxBytes: number,
    private readonly maxLines?: number,
  ) {}

  append(text: string): void {
    if (text.length === 0) return
    this.value += text
    if (this.maxLines !== undefined) {
      const lines = this.value.split('\n')
      if (lines.length > this.maxLines) {
        this.value = lines.slice(lines.length - this.maxLines).join('\n')
        this.dropped = true
      }
    }
    const tail = utf8Tail(this.value, this.maxBytes)
    this.value = tail.text
    this.dropped ||= tail.truncated
  }

  consume(): TerminalSendRead {
    const delta = this.value
    const truncated = this.dropped
    this.value = ''
    this.dropped = false
    return { delta, truncated }
  }

  snapshot(): { text: string; truncated: boolean } {
    return { text: this.value, truncated: this.dropped }
  }
}

/** One exclusive send operation over the remote channel. */
class RemoteSendOperation implements TerminalSendOperation {
  private readonly output: BoundedTextBuffer
  private readonly promise: PromiseWithResolvers<TerminalSendResult>
  private finished = false

  constructor(
    maxBytes: number,
    readonly startedAt: number,
    private readonly onCancel: () => void,
  ) {
    this.output = new BoundedTextBuffer(maxBytes)
    this.promise = Promise.withResolvers<TerminalSendResult>()
  }

  get done(): Promise<TerminalSendResult> {
    return this.promise.promise
  }

  append(text: string): void {
    if (!this.finished) this.output.append(text)
  }

  settle(waitReason: TerminalWaitReason, sessionStatus: TerminalSessionStatus, inheritedTruncation: boolean): void {
    if (this.finished) return
    this.finished = true
    const read = this.output.snapshot()
    this.promise.resolve({
      viewport: read.text,
      waitReason,
      sessionStatus,
      truncated: read.truncated || inheritedTruncation,
    })
  }

  fail(error: unknown): void {
    if (this.finished) return
    this.finished = true
    this.promise.reject(error)
  }

  readOutput(): TerminalSendRead {
    return this.output.consume()
  }

  cancel(): boolean {
    if (this.finished) return false
    this.onCancel()
    return true
  }
}

/**
 * Remote PTY session over one ssh pty channel. Readiness is silence-based: a
 * send settles when output has been quiet for `idleSilenceMs` after at least
 * one output event, or immediately on remote exit/close. The ssh transport
 * exposes no foreground process-group introspection, so there is no marker or
 * stdin-wait evidence like the local backend's; `signal` writes the terminal
 * control byte for the requested signal (or closes the channel when the
 * signal has no control byte) and reports the channel itself as the target.
 */
export class RemotePtySession implements TerminalBackendSession {
  motd = ''
  private readonly decoder = new TextDecoder()
  private readonly scrollback: BoundedTextBuffer
  private readonly outputEnded = Promise.withResolvers<void>()
  private statusValue: TerminalSessionStatus = { kind: 'running' }
  private active: RemoteSendOperation | undefined
  private activeTimer: NodeJS.Timeout | undefined
  private activeDeadlineTimer: NodeJS.Timeout | undefined
  private activeAbort: (() => void) | undefined
  private lastOutputAt = Date.now()
  private initializing = false
  private closing = false
  private closePromise: Promise<void> | undefined
  private transportFailure: Error | undefined
  private channelClosed = false
  private exitCode: number | null = null
  private exitSignal: NodeJS.Signals | null = null

  constructor(
    private readonly channel: RemotePtyChannel,
    private readonly config: ResolvedConfig,
  ) {
    this.scrollback = new BoundedTextBuffer(config.scrollbackMaxBytes, config.scrollbackLines)
    channel.on('data', this.onChannelData)
    channel.once('exit', this.onChannelExit)
    channel.once('close', this.onChannelClose)
    channel.once('error', this.onChannelError)
  }

  /**
   * Wait for the remote shell to reach output idle after startup, optionally
   * after running one boot line (used to `cd` into the workspace path).
   * @param signal - optional cancellation while the shell reaches readiness.
   * @param boot - optional boot line written with submit before the wait.
   * @returns Resolves after startup readiness; rejects on exit or startup timeout.
   */
  async initialize(signal?: AbortSignal, boot?: string): Promise<void> {
    this.initializing = true
    try {
      const operation = this.startSend({
        text: boot ?? '',
        submit: boot !== undefined,
        ...signal !== undefined ? { signal } : {},
      })
      const deadline = Promise.withResolvers<never>()
      const timer = setTimeout(() => {
        deadline.reject(new Error('remote PTY shell did not reach readiness before startup timeout'))
      }, this.config.startupTimeoutMs)
      let result: TerminalSendResult
      try {
        result = await Promise.race([operation.done, deadline.promise])
      } finally {
        clearTimeout(timer)
      }
      if (result.waitReason === 'session_exit') throw new Error('remote PTY shell exited during startup')
      if (result.waitReason === 'timeout') throw new Error('remote PTY shell did not reach readiness before startup timeout')
      this.motd = result.viewport
    } catch (error: unknown) {
      signal?.throwIfAborted()
      throw error
    } finally {
      this.initializing = false
    }
  }

  startSend(request: TerminalSendRequest): TerminalSendOperation {
    if (this.closing) throw new Error('PTY session is closing')
    if (this.statusValue.kind === 'exited') throw new Error('PTY session has exited')
    if (this.active !== undefined) {
      throw new TerminalError('PTY session already has an active send', 'SEND_ACTIVE')
    }
    if (request.signal?.aborted === true) throw new Error('PTY send aborted before write')

    const operation = new RemoteSendOperation(
      this.config.maxReadBytes,
      Date.now(),
      () => { this.interrupt() },
    )
    this.active = operation
    this.lastOutputAt = Date.now()

    if (request.signal !== undefined) {
      const onAbort = (): void => { operation.cancel() }
      request.signal.addEventListener('abort', onAbort, { once: true })
      this.activeAbort = () => request.signal?.removeEventListener('abort', onAbort)
    }
    this.activeDeadlineTimer = setTimeout(() => {
      if (this.active === operation) {
        this.settleActive('timeout')
      }
    }, this.config.sendTimeoutMs)
    this.beginSend(operation, request)
    return operation
  }

  private beginSend(operation: RemoteSendOperation, request: TerminalSendRequest): void {
    const input = `${request.text}${request.submit ? '\r' : ''}`
    if (input.length > 0) {
      this.lastOutputAt = Date.now()
      this.channel.write(input)
    }
    this.schedulePoll(operation)
  }

  read(request: TerminalReadRequest): TerminalReadResult {
    const snapshot = this.scrollback.snapshot()
    const lines = snapshot.text.split('\n')
    const totalLines = snapshot.text.length === 0 ? 0 : lines.length
    const offset = request.offset ?? 0
    const count = request.count ?? 500
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('PTY read offset must be a non-negative safe integer')
    if (!Number.isSafeInteger(count) || count <= 0) throw new Error('PTY read count must be a positive safe integer')
    if (offset >= totalLines) {
      return { text: '', totalLines, lineBegin: offset, lineEnd: offset, truncated: snapshot.truncated }
    }
    const end = totalLines - offset
    const start = Math.max(0, end - count)
    const requested = lines.slice(start, end).join('\n')
    const bounded = utf8Tail(requested, this.config.maxReadBytes)
    const returnedLines = bounded.text.length === 0 ? 0 : bounded.text.split('\n').length
    return {
      text: bounded.text,
      totalLines,
      lineBegin: offset,
      lineEnd: offset + returnedLines,
      truncated: snapshot.truncated || bounded.truncated,
    }
  }

  signal(signal: TerminalSignal): Promise<TerminalSignalResult> {
    if (this.closing) return Promise.reject(new Error('PTY session is closing'))
    // SIGINT and SIGTSTP have terminal control bytes the foreground process
    // interprets; the remaining signals have none, so close the channel,
    // which terminates the remote shell and its children.
    const controlByte = signal === 'SIGINT' ? 0x03 : signal === 'SIGTSTP' ? 0x1a : null
    if (controlByte !== null) this.channel.write(Buffer.from([controlByte]))
    else this.channel.end()
    // The ssh transport exposes no remote process group, so the channel itself
    // is the delivery target and the pgid is reported as unknown (0).
    return Promise.resolve({ delivered: true, targetPgid: 0 })
  }

  status(): TerminalSessionStatus {
    return this.statusValue
  }

  close(reason: string): Promise<void> {
    this.closing = true
    if (this.closePromise !== undefined) return this.closePromise
    const closing = this.closeOnce(reason).catch((error: unknown) => {
      this.closePromise = undefined
      this.failActive(error)
      throw error
    })
    this.closePromise = closing
    return closing
  }

  private readonly onChannelData = (chunk: Buffer): void => {
    this.onData(this.decoder.decode(chunk, { stream: true }))
  }

  private readonly onChannelExit = (code: number | null, signalName: string): void => {
    if (typeof code === 'number') this.exitCode = code
    else this.exitSignal = signalName.length > 0 ? signalName as NodeJS.Signals : null
    this.settleExit()
  }

  private readonly onChannelClose = (): void => {
    this.channelClosed = true
    this.onData(this.decoder.decode())
    this.outputEnded.resolve()
    this.settleExit()
  }

  private readonly onChannelError = (error: Error): void => {
    this.onTransportFailure(error)
    this.outputEnded.resolve()
  }

  private settleExit(): void {
    if (!this.channelClosed) return
    if (this.statusValue.kind === 'exited') return
    this.statusValue = { kind: 'exited', exitCode: this.exitCode, signal: this.exitSignal }
    this.settleActive('session_exit')
  }

  private onTransportFailure(error: unknown): void {
    const failure = error instanceof Error ? error : new Error(String(error))
    this.transportFailure ??= failure
    this.statusValue = { kind: 'exited', exitCode: null, signal: null }
    this.failActive(failure)
    try {
      this.channel.end()
    } catch {
      /* the channel is already torn down; nothing left to end */
    }
  }

  private onData(data: string): void {
    if (data.length === 0) return
    this.lastOutputAt = Date.now()
    this.scrollback.append(data)
    this.active?.append(data)
  }

  private schedulePoll(operation: RemoteSendOperation, delayMs = this.config.pollIntervalMs): void {
    if (this.active !== operation) return
    if (this.activeTimer !== undefined) clearTimeout(this.activeTimer)
    this.activeTimer = setTimeout(() => {
      this.activeTimer = undefined
      this.pollReadiness(operation)
    }, delayMs)
  }

  private pollReadiness(operation: RemoteSendOperation): void {
    if (this.active !== operation) return
    try {
      if (this.statusValue.kind === 'exited') {
        this.settleActive('session_exit')
        return
      }
      const idleFor = Date.now() - this.lastOutputAt
      // Startup needs at least one output event before idle can mean "prompt".
      const hasOutput = !this.initializing || this.scrollback.snapshot().text.length > 0
      if (hasOutput && idleFor >= this.config.idleSilenceMs) {
        this.settleActive('inferred_idle')
      }
    } finally {
      if (this.active === operation) this.schedulePoll(operation)
    }
  }

  private settleActive(waitReason: TerminalWaitReason): void {
    const operation = this.active
    if (operation === undefined) return
    const scrollbackTruncated = this.scrollback.snapshot().truncated
    this.clearActive()
    operation.settle(waitReason, this.statusValue, scrollbackTruncated)
  }

  private stopPolling(): void {
    if (this.activeTimer !== undefined) clearTimeout(this.activeTimer)
    this.activeTimer = undefined
    if (this.activeDeadlineTimer !== undefined) clearTimeout(this.activeDeadlineTimer)
    this.activeDeadlineTimer = undefined
  }

  private clearActive(): void {
    this.stopPolling()
    this.activeAbort?.()
    this.activeAbort = undefined
    this.active = undefined
  }

  private failActive(error: unknown): void {
    const operation = this.active
    if (operation === undefined) return
    this.clearActive()
    operation.fail(error)
  }

  private interrupt(): void {
    this.channel.write(Buffer.from([0x03]))
  }

  private async closeOnce(reason: string): Promise<void> {
    // Stop readiness polling but retain the active operation: teardown settles
    // it as session_exit below, so an in-flight send is never mis-settled as
    // inferred_idle/timeout during the grace period.
    this.stopPolling()
    try {
      this.channel.end()
    } catch (error: unknown) {
      throw new Error(`PTY cleanup failed (${reason})`, { cause: error })
    }
    this.settleActive('session_exit')
    await this.outputEnded.promise
    if (this.transportFailure !== undefined) throw this.transportFailure
  }
}
/* jscpd:ignore-end */
