/**
 * SSH provider for the bash executor seam: commands run through one remote
 * world's exec channel. Foreground calls use the seam's exec/collect lifecycle
 * with config-clamped timeouts and cancellation; background processes run
 * detached through a remote wrapper that records a pid file, redirects output
 * to remote files, and writes an exit-status file — the provider reads those
 * files over SFTP. One instance serves one remote world; the workspace/session
 * binding phase composes instances per remote workspace.
 * @module @deepseek-ai/dsh-bash-ssh
 */

import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ShellExecutor } from '@deepseek-ai/dsh-shell'
import type {
  ShellExecRequest,
  ShellExecSpec,
  ShellProcess,
  ShellProcessRead,
  ShellRunResult,
} from '@deepseek-ai/dsh-shell'
import { SshError } from '@deepseek-ai/dsh-ssh'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { clampTimeout } from '@deepseek-ai/dsh-timeout'
import type { SFTPWrapper, Stats } from 'ssh2'

/* jscpd:ignore-start -- this SSH bash backend mirrors the local bash backend
   for the same executor seam (and shares SFTP error mapping with fs-ssh);
   extract shared code when a third backend appears. */

/**
 * Model-friendly environment overrides: disable colors, pagers, and
 * interactive terminal features that would garble tool output (the same set
 * `dsh-bash-local` hardcodes). Merged first into the explicit env, so a
 * trusted caller's own entry still wins.
 */
export const ENV_OVERRIDES = {
  NO_COLOR: '1',
  TERM: 'dumb',
  PAGER: 'cat',
  GIT_PAGER: 'cat',
} as const

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_TIMEOUT_MS = 600_000
const DEFAULT_MAX_OUTPUT_BYTES = 64_000
const DEFAULT_RUNTIME_ROOT = '~/.dsh-bash'
const DEFAULT_POLL_MS = 50
const DEFAULT_GRACE_MS = 3_000
const STATUS_NO_SUCH_FILE = 2
/** How long (in poll ticks) a background process may take to publish its pid. */
const MAX_PID_ATTEMPTS = 100

/** Configuration for the SSH bash executor. */
export interface Config {
  /** Remote base directory for relative paths; defaults to the world target's path, else `/`. */
  cwd?: string
  /** Default foreground timeout in milliseconds. */
  timeoutMs?: number
  /** Upper bound for per-call timeout overrides. */
  maxTimeoutMs?: number
  /** Per-stream in-memory output cap in bytes (foreground capture and background tails). */
  maxOutputBytes?: number
  /** Remote directory for background-process files; `~` expands to the remote home. */
  runtimeRoot?: string
  /** Poll cadence for background status/output files in milliseconds. */
  pollMs?: number
  /** SIGTERM→SIGKILL grace for background kills in milliseconds. */
  graceMs?: number
}

type ResolvedConfig = Required<Config>

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`bash-ssh: ${name} must be a positive finite number`)
  }
}

/** Whether an ssh2 SFTP failure means "no such file". */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: unknown }).code === STATUS_NO_SUCH_FILE
}

/** Quote one POSIX shell word without interpolation (e2b's pattern). */
function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

/** Map a remote signal name onto the seam's `NodeJS.Signals` vocabulary. */
function toNodeSignal(signal: string | null): NodeJS.Signals | null {
  if (signal === null || !NODE_SIGNALS.has(signal)) return null
  return signal as NodeJS.Signals
}

/** Standard POSIX signal names the transport reports (128+n statuses and exec close). */
const NODE_SIGNALS: ReadonlySet<string> = new Set([
  'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT', 'SIGBUS', 'SIGFPE',
  'SIGKILL', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGPIPE', 'SIGALRM', 'SIGTERM', 'SIGCHLD',
  'SIGCONT', 'SIGSTOP', 'SIGTSTP', 'SIGTTIN', 'SIGTTOU', 'SIGURG', 'SIGXCPU', 'SIGXFSZ',
  'SIGVTALRM', 'SIGPROF', 'SIGWINCH', 'SIGIO', 'SIGPOLL', 'SIGPWR', 'SIGSYS', 'SIGEMT',
])

/** Exit-status → signal names for the wrapper's 128+n convention (POSIX signums). */
const STATUS_SIGNALS: Readonly<Record<number, string>> = {
  1: 'SIGHUP', 2: 'SIGINT', 3: 'SIGQUIT', 4: 'SIGILL', 5: 'SIGTRAP', 6: 'SIGABRT',
  7: 'SIGBUS', 8: 'SIGFPE', 9: 'SIGKILL', 10: 'SIGUSR1', 11: 'SIGSEGV', 12: 'SIGUSR2',
  13: 'SIGPIPE', 14: 'SIGALRM', 15: 'SIGTERM',
}

function callStat(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return new Promise((resolve, reject) => {
    sftp.stat(path, (error, stats) => { if (error) reject(error); else resolve(stats) })
  })
}

function callReadFile(sftp: SFTPWrapper, path: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    sftp.readFile(path, (error, data) => { if (error) reject(error); else resolve(data) })
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms) })
}

/** One remote output stream's incremental reader: pending delta plus consumed offset. */
interface StreamState {
  /** Bytes already appended to `pending` (the remote file only grows). */
  offset: number
  /** Output produced since the previous read, bounded to the in-memory tail. */
  pending: string
  /** True when bytes were dropped to keep the in-memory tail bounded. */
  lossy: boolean
}

/**
 * SSH bash executor. Construct with the world whose exec channel commands run
 * on; one instance serves one remote execution world.
 */
export class SshBashExecutor extends ShellExecutor {
  private readonly config: ResolvedConfig
  private readonly live = new Set<SshBashProcess>()
  private homeDir: Promise<string> | null = null

  constructor(ctx: Context, config: Config, private readonly world: SshWorld) {
    super(ctx)
    const entry = {
      cwd: config.cwd ?? world.target.path ?? '/',
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxTimeoutMs: config.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS,
      maxOutputBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      runtimeRoot: config.runtimeRoot ?? DEFAULT_RUNTIME_ROOT,
      pollMs: config.pollMs ?? DEFAULT_POLL_MS,
      graceMs: config.graceMs ?? DEFAULT_GRACE_MS,
    }
    assertPositiveFinite('timeoutMs', entry.timeoutMs)
    assertPositiveFinite('maxTimeoutMs', entry.maxTimeoutMs)
    assertPositiveFinite('maxOutputBytes', entry.maxOutputBytes)
    assertPositiveFinite('pollMs', entry.pollMs)
    assertPositiveFinite('graceMs', entry.graceMs)
    this.config = entry
    ctx.effect(() => () => {
      for (const proc of this.live) proc.terminate()
    })
  }

  /**
   * Resolve a request into a fully-specified spec: fill `workdir` from the
   * configured remote base, and `timeoutMs` from the default, capped at the
   * maximum. The tool layer calls this before {@link run}/{@link start}, so
   * those methods receive explicit values and never re-default.
   * @param request - the caller's execution request.
   * @returns the resolved spec with every required field filled.
   */
  resolve(request: ShellExecRequest): ShellExecSpec {
    const timeoutMs = clampTimeout(
      request.timeoutMs,
      this.config.timeoutMs,
      this.config.maxTimeoutMs,
      'bash-ssh: request.timeoutMs',
    )
    const stdoutMaxBytes = request.stdoutMaxBytes ?? this.config.maxOutputBytes
    assertPositiveFinite('request.stdoutMaxBytes', stdoutMaxBytes)
    return {
      command: request.command,
      workdir: request.workdir ?? this.config.cwd,
      timeoutMs,
      stdoutMaxBytes,
      // Carry the router's world identity through verbatim — optional, no
      // config default; this executor always runs in the given world.
      ...request.world !== undefined ? { world: request.world } : {},
      ...request.signal ? { signal: request.signal } : {},
      // Carry stdin/ordinary env/trusted dshEnv through verbatim — optional,
      // no config default. The world's exec channel owns the merge order.
      ...request.stdin !== undefined ? { stdin: request.stdin } : {},
      ...request.env !== undefined ? { env: request.env } : {},
      ...request.dshEnv !== undefined ? { dshEnv: request.dshEnv } : {},
      // Carry a sandbox policy through verbatim: this executor never
      // confines, so the field is inert here (the seam contract).
      sandboxPolicy: request.sandboxPolicy,
    }
  }

  /** One explicit env map: terminal overrides, then caller env, then the managed DSH_* snapshot. */
  private mergedEnv(spec: ShellExecSpec): Readonly<Record<string, string>> {
    return { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv }
  }

  override async run(spec: ShellExecSpec): Promise<ShellRunResult> {
    // The transport's capture ceiling is combined stdout/stderr; over-capture
    // with the larger budget so neither stream drops below its seam budget.
    const result = await this.world.exec(spec.command, {
      cwd: spec.workdir,
      env: this.mergedEnv(spec),
      timeoutMs: spec.timeoutMs,
      ...spec.signal !== undefined ? { signal: spec.signal } : {},
      maxOutputBytes: Math.max(spec.stdoutMaxBytes, this.config.maxOutputBytes),
      ...spec.stdin !== undefined ? { stdin: spec.stdin } : {},
    })
    return {
      exitCode: result.exitCode,
      signal: toNodeSignal(result.signal),
      timedOut: result.timedOut,
      aborted: result.aborted,
      timeoutMs: spec.timeoutMs,
      stdout: { text: result.stdout, truncated: result.stdoutTruncated },
      stderr: { text: result.stderr, truncated: result.stderrTruncated },
    }
  }

  override start(spec: ShellExecSpec): ShellProcess {
    // Background runs ignore timeoutMs; callers stop them through kill() or spec.signal.
    const proc = new SshBashProcess(this.world, this.config, this.runtimeRoot(), {
      command: spec.command,
      workdir: spec.workdir,
      env: this.mergedEnv(spec),
      signal: spec.signal,
    })
    this.live.add(proc)
    void proc.handle.done.then(() => { this.live.delete(proc) })
    return proc.handle
  }

  /**
   * The resolved remote runtime root for background files: the configured
   * `runtimeRoot` verbatim, or with a leading `~/` expanded to the remote
   * home (learned once per executor over the world's exec channel, since a
   * quoted `~` never expands in the wrapper and SFTP paths need the literal
   * absolute form).
   * @returns the absolute remote runtime root.
   */
  private runtimeRoot(): Promise<string> {
    const root = this.config.runtimeRoot
    if (!root.startsWith('~/')) return Promise.resolve(root)
    this.homeDir ??= this.world.exec('printf %s "$HOME"', { maxOutputBytes: 4096 })
      /* v8 ignore start -- a login shell always sets $HOME; the fallback guards a bare remote */
      .then(result => result.stdout.trim() || '/')
      /* v8 ignore stop */
    return this.homeDir.then(home => posix.join(home, root.slice(2)))
  }
}

/** Runtime parameters for one background process. */
interface ProcessOptions {
  command: string
  workdir: string
  env: Readonly<Record<string, string>>
  signal: AbortSignal | undefined
}

/**
 * One remote background process. The launch exec returns immediately; the
 * remote wrapper backgrounds the command in a new session (setsid), records
 * its pid, waits, and writes the exit status. A poll loop reads the pid,
 * status, and output files over SFTP; reads are incremental with bounded
 * in-memory tails.
 */
class SshBashProcess {
  readonly handle: ShellProcess
  private readonly config: ResolvedConfig
  private readonly world: SshWorld
  private readonly options: ProcessOptions
  private readonly runtimeRoot: Promise<string>
  private readonly id = randomUUID()
  private doneResolve: (() => void) | null = null
  private readonly done = new Promise<void>((resolve) => { this.doneResolve = resolve })
  private sftpSession: SFTPWrapper | null = null
  private sessionClosed: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  private ticking = false
  private settled = false
  private killedByUs = false
  private spawnFailureNote: string | undefined
  private pidResolve!: (pid: number) => void
  private pidReject!: (error: unknown) => void
  private readonly pidKnown: Promise<number> = new Promise((resolve, reject) => {
    this.pidResolve = resolve
    this.pidReject = reject
  })
  private readonly stdout: StreamState = { offset: 0, pending: '', lossy: false }
  private readonly stderr: StreamState = { offset: 0, pending: '', lossy: false }

  constructor(
    world: SshWorld,
    config: ResolvedConfig,
    runtimeRoot: Promise<string>,
    options: ProcessOptions,
  ) {
    this.world = world
    this.config = config
    this.options = options
    this.runtimeRoot = runtimeRoot
    // The pid becomes known once the wrapper writes its file; kill() may run
    // before that, so the killer awaits this same promise. The paths need the
    // resolved root first, so the read starts after boot resolves it.
    this.handle = {
      status: 'running',
      exitCode: null,
      signal: null,
      done: this.done,
      readOutput: () => this.readOutput(),
      kill: () => this.kill(),
    }
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        this.kill()
      } else {
        options.signal.addEventListener('abort', () => { this.kill() }, { once: true })
      }
    }
    // The pid promise must be observed even when only the spawn-failure path
    // settles (e.g. the launch exec rejects), so its rejection is swallowed
    // here; boot and escalateKill still await it directly.
    /* v8 ignore next -- a rejected pidKnown with no killer is swallowed to avoid an unhandled rejection */
    void this.pidKnown.catch(() => {})
    void this.boot()
  }

  /** The world's SFTP session, opened on first use and cached for the process's lifetime. */
  private async sftp(): Promise<SFTPWrapper> {
    if (this.world.status() !== 'connected') {
      throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
    }
    if (this.sftpSession === null) {
      const handle = await this.world.sftp()
      this.sftpSession = handle.session as SFTPWrapper
      // A dropped connection leaves in-flight SFTP requests pending forever;
      // the session's close/end signal lets the poll loop settle instead.
      this.sessionClosed = new Promise<void>((resolve) => {
        const session = this.sftpSession as SFTPWrapper
        session.once('close', () => { resolve() })
        session.once('end', () => { resolve() })
      })
    }
    return this.sftpSession
  }

  /**
   * Race an SFTP operation against the session closing, so a dropped world
   * settles the process instead of leaving the poll loop hung on a request
   * the dead connection can never answer.
   * @param op - the SFTP operation to run.
   * @returns the operation's result, or an SSH_CONNECT_ERROR once the session closes.
   */
  private async guarded<T>(op: () => Promise<T>): Promise<T> {
    // The session promise is set when the session opens; the null arm guards
    // a call before any sftp() resolved (impossible by construction).
    /* v8 ignore next -- guarded is only reached through sftp(), which sets sessionClosed first */
    const closed = this.sessionClosed ?? Promise.resolve()
    return Promise.race([
      op(),
      closed.then(() => {
        throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
      }),
    ])
  }

  private async boot(): Promise<void> {
    try {
      const runtimeDir = posix.join(await this.runtimeRoot, this.id)
      const pidPath = posix.join(runtimeDir, 'pid')
      const statusPath = posix.join(runtimeDir, 'status')
      const stdoutPath = posix.join(runtimeDir, 'out')
      const stderrPath = posix.join(runtimeDir, 'err')
      // The wrapper backgrounds the command in a new session (setsid), records
      // its pid, waits for it, and writes the exit status. The launch exec
      // returns immediately: the whole wrapper is backgrounded with its stdio
      // detached, so the exec channel closes without waiting for the command.
      const inner = `cd ${quotePosix(this.options.workdir)}; `
        + `setsid sh -c ${quotePosix(this.options.command)} > ${quotePosix(stdoutPath)} 2> ${quotePosix(stderrPath)} < /dev/null & `
        + `echo $! > ${quotePosix(pidPath)}; wait $!; echo $? > ${quotePosix(statusPath)}`
      const launch = `{ mkdir -p ${quotePosix(runtimeDir)} && nohup sh -c ${quotePosix(inner)} ; } > /dev/null 2>&1 & echo $!`
      const launched = await this.world.exec(launch, {
        env: this.options.env,
        timeoutMs: this.config.timeoutMs,
      })
      /* v8 ignore start -- the launch backgrounds a compound and always exits 0; a nonzero launch is a transport anomaly */
      if (launched.exitCode !== 0 || launched.signal !== null) {
        throw new Error(launched.stderr.trim() || `launch failed with exit ${String(launched.exitCode)}`)
      }
      /* v8 ignore stop */
      const pid = await this.readPid(pidPath)
      this.pidResolve(pid)
      this.timer = setInterval(() => { void this.tick(statusPath, stdoutPath, stderrPath) }, this.config.pollMs)
      await this.tick(statusPath, stdoutPath, stderrPath)
    } catch (error: unknown) {
      this.pidReject(error)
      // Errors here are thrown by the code above; the non-Error arm guards a
      // primitive throw that no current path produces.
      /* v8 ignore next -- every thrown value in boot is an Error */
      this.settleWithNote(`spawn failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Read the wrapper's pid file, retrying until it appears. */
  private async readPid(pidPath: string): Promise<number> {
    for (let attempt = 0; ; attempt++) {
      try {
        const sftp = await this.sftp()
        const buffer = await this.guarded(() => callReadFile(sftp, pidPath))
        const pid = Number(buffer.toString('utf8').trim())
        /* v8 ignore next -- the wrapper writes `echo $!`, which is always a positive integer */
        if (Number.isInteger(pid) && pid > 0) return pid
      } catch (error) {
        /* v8 ignore next -- only NO_SUCH_FILE retries; any other failure is a transport fault */
        if (!isNotFound(error)) throw error
      }
      /* v8 ignore next -- the wrapper writes the pid first, so only a wrapper dying before its first write can exhaust the retry */
      if (attempt >= MAX_PID_ATTEMPTS) throw new Error('remote process did not publish its pid')
      await sleep(this.config.pollMs)
    }
  }

  /** One poll: refresh output tails, then settle from the status file when present. */
  private async tick(statusPath: string, stdoutPath: string, stderrPath: string): Promise<void> {
    // Polls can overlap when SFTP round trips outlast the interval; a shared
    // offset/tail state must never be read by two ticks at once.
    if (this.ticking) return
    this.ticking = true
    try {
      const sftp = await this.sftp()
      await this.refreshTail(sftp, stdoutPath, this.stdout)
      await this.refreshTail(sftp, stderrPath, this.stderr)
      await this.pollStatus(sftp, statusPath)
    } catch (error) {
      /* v8 ignore start -- a disconnected world settles; transient SFTP faults keep polling */
      if (error instanceof SshError) {
        this.settleWithNote(`connection to the remote host was lost: ${error.message}`)
      }
      /* v8 ignore stop */
    } finally {
      this.ticking = false
    }
  }

  /** Append newly-written output to the stream's bounded pending tail. */
  private async refreshTail(sftp: SFTPWrapper, path: string, state: StreamState): Promise<void> {
    let size: number
    try {
      size = (await this.guarded(() => callStat(sftp, path))).size
    } catch (error) {
      // The wrapper opens out/err with its redirects before writing the pid,
      // so a missing file means external removal, not a startup race.
      /* v8 ignore next -- the wrapper's redirects create out/err before the pid file */
      if (isNotFound(error)) return
      throw error
    }
    /* v8 ignore start -- the wrapper only appends; a smaller file means external replacement */
    if (size < state.offset) {
      state.offset = 0
      state.lossy = true
    }
    /* v8 ignore stop */
    if (size === state.offset) return
    await this.guarded(async () => {
      const stream = sftp.createReadStream(path, { start: state.offset })
      // A dropped connection delivers its in-flight read error as a stream
      // 'error' event; the sessionClose race settles the poll, so keep that
      // redundant event from surfacing as an unhandled stream error.
      stream.on('error', () => {})
      const chunks: Buffer[] = []
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(chunk)
      const text = Buffer.concat(chunks).toString('utf8')
      state.offset += Buffer.byteLength(text)
      state.pending += text
      if (state.pending.length > this.config.maxOutputBytes) {
        state.pending = state.pending.slice(-this.config.maxOutputBytes)
        state.lossy = true
      }
    })
  }

  /** Settle the process from the status file once it appears. */
  private async pollStatus(sftp: SFTPWrapper, statusPath: string): Promise<void> {
    let buffer: Buffer
    try {
      buffer = await this.guarded(() => callReadFile(sftp, statusPath))
    } catch (error) {
      /* v8 ignore start -- missing status means still running; any other failure is the session-close signal sftp() already surfaces */
      if (isNotFound(error)) return // still running
      throw error
      /* v8 ignore stop */
    }
    const code = Number(buffer.toString('utf8').trim())
    /* v8 ignore next -- the wrapper writes a decimal status; a non-numeric file means remote tampering */
    if (!Number.isInteger(code)) return
    const signalName = code > 128 ? STATUS_SIGNALS[code - 128] ?? null : null
    this.settle(signalName === null ? code : null, toNodeSignal(signalName))
  }

  private settle(exitCode: number | null, signal: NodeJS.Signals | null): void {
    /* v8 ignore next -- settle is idempotent against a racing tick and kill */
    if (this.settled) return
    this.settled = true
    this.handle.exitCode = exitCode
    this.handle.signal = signal
    // Any signal termination is killed, including a command signaling itself.
    this.handle.status = this.killedByUs || signal !== null ? 'killed' : 'completed'
    // The timer is always set before the first poll; a missing timer means
    // settle ran twice, which the settled guard above already rejected.
    /* v8 ignore next -- the settled guard makes a timer-less settle unreachable */
    if (this.timer !== undefined) clearInterval(this.timer)
    this.doneResolve?.()
  }

  private settleWithNote(note: string): void {
    /* v8 ignore next -- settle is idempotent against a racing tick and kill */
    if (this.settled) return
    this.settled = true
    this.spawnFailureNote = note
    this.handle.status = 'killed'
    if (this.timer !== undefined) clearInterval(this.timer)
    this.doneResolve?.()
  }

  private readOutput(): ShellProcessRead {
    const out = this.stdout.pending
    const err = this.stderr.pending
    this.stdout.pending = ''
    this.stderr.pending = ''
    // A failed launch never produced process output, so the note and real
    // stderr text are mutually exclusive.
    const errText = err.length > 0 ? err : this.consumeSpawnFailure()
    // Single newline between sections: stdout chunks usually end with one
    // already; add it only when missing.
    const separator = out.length > 0 && !out.endsWith('\n') ? '\n' : ''
    return {
      delta: out + (errText.length > 0 ? `${separator}[stderr]\n${errText}` : ''),
      lossy: this.stdout.lossy || this.stderr.lossy,
    }
  }

  private consumeSpawnFailure(): string {
    const note = this.spawnFailureNote ?? ''
    this.spawnFailureNote = undefined
    return note
  }

  private kill(): boolean {
    if (this.handle.status !== 'running') return false
    this.killedByUs = true
    this.handle.status = 'killed'
    void this.escalateKill()
    return true
  }

  /** Best-effort teardown for composition disposal: mark killed and escalate. */
  terminate(): void {
    // Disposal only tracks live processes; a settled one was already removed.
    /* v8 ignore next -- composition disposal iterates live processes only */
    if (this.handle.status === 'running') {
      this.killedByUs = true
      this.handle.status = 'killed'
      void this.escalateKill()
    }
  }

  /** SIGTERM the remote process group, then SIGKILL after the grace period. */
  private async escalateKill(): Promise<void> {
    try {
      // kill() may run before the pid file exists; await the same read the
      // boot path uses so the escalation still lands on the right group.
      const pid = await this.pidKnown
      await this.world.exec(`kill -TERM -- -${pid}`)
      await sleep(this.config.graceMs)
      /* v8 ignore next -- the group usually dies on TERM; KILL is a fallback for stuck trees */
      await this.world.exec(`kill -KILL -- -${pid}`)
    } catch {
      // The pid read failed (spawn failure) or the group is already gone; the
      // spawn-failure note or status poll settles the process.
    }
  }
}

export default SshBashExecutor
/* jscpd:ignore-end */
