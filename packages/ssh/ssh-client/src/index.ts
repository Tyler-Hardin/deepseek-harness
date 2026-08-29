/**
 * ssh2-backed Service Provider for the SSH transport seam. One connection per
 * world (through however many ProxyJump hops), agent-then-keys authentication
 * only, known_hosts TOFU with changed-key rejection, and exec + SFTP channels
 * for the later fs/shell adapters. The provider owns connection mechanics;
 * host/config/auth policy lives in the Service Definition's pure layer.
 * @module @deepseek-ai/dsh-ssh-client
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Duplex } from 'node:stream'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import * as ssh2 from 'ssh2'
import type {
  AgentAuthMethod,
  ClientChannel,
  ParsedKey,
  PublicKeyAuthMethod,
  SFTPWrapper,
} from 'ssh2'
import {
  SSH_PTY_HANDLE,
  SSH_SFTP_HANDLE,
  SshError,
  SshService,
  SshWorld,
  checkHostKey,
  defaultIdentityFiles,
  hostKeyAlgorithmFromBlob,
  knownHostPattern,
  learnKnownHostLine,
  loadKnownHosts,
  parseSshDestination,
  resolveSshConfig,
  selectAuthMethods,
} from '@deepseek-ai/dsh-ssh'
import type {
  AuthMethod,
  KnownHostsEntry,
  ResolvedSshHost,
  SftpHandle,
  SshConnectOptions,
  SshExecOptions,
  SshExecResult,
  SshPtyHandle,
  SshPtyOptions,
  SshStatus,
  SshTarget,
  SshWorldId,
} from '@deepseek-ai/dsh-ssh'

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  /** Known-hosts file path (default `~/.ssh/known_hosts`). */
  knownHostsPath?: string
  /** `~/.ssh/config` path (default `~/.ssh/config`). */
  configPath?: string
  /** Home directory for defaults (default `os.homedir()`). */
  homeDir?: string
  /** Default connect handshake timeout in milliseconds. */
  timeoutMs?: number
  /** Default host-key strictness: require a pre-existing known_hosts entry. */
  strictHostKey?: boolean
  /** Default combined exec output capture ceiling in bytes. */
  defaultMaxOutputBytes?: number
}

/** The shape after schemastery applied the defaults. */
type ResolvedConfig = Required<Omit<Config, 'knownHostsPath' | 'configPath' | 'homeDir'>> & Pick<Config, 'knownHostsPath' | 'configPath' | 'homeDir'>

/** Reject a resolved config the provider could not run with. */
function assertServiceableConfig(config: ResolvedConfig): void {
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
    throw new Error('ssh-client: timeoutMs must be a positive finite number')
  }
  if (!Number.isFinite(config.defaultMaxOutputBytes) || config.defaultMaxOutputBytes <= 0) {
    throw new Error('ssh-client: defaultMaxOutputBytes must be a positive finite number')
  }
}

/** Read a text file, returning '' when it does not exist. */
function readConfigText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

/** Windows has no POSIX mode bits; the permission check is POSIX-only. */
function isWindows(): boolean {
  /* v8 ignore next -- the win32 branch cannot run on the Linux coverage lane */
  return process.platform === 'win32'
}

/**
 * Load and parse one identity file, collecting a human reason when the key
 * cannot be used. A missing key is silent (default keys are commonly absent);
 * permission and parse failures are recorded for the auth-failed message.
 * @param path - the key path.
 * @param notes - collected skip reasons.
 * @returns the parsed key, or null when unusable.
 */
function loadUsableKey(path: string, notes: string[]): ParsedKey | null {
  let data: Buffer
  try {
    data = readFileSync(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    /* v8 ignore next -- readFileSync throws Error instances only */
    notes.push(`unreadable key ${path}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
  if (!isWindows() && (statSync(path).mode & 0o077) !== 0) {
    notes.push(`refusing group/world-accessible key ${path} (chmod 600)`)
    return null
  }
  const parsed = ssh2.utils.parseKey(data)
  if (parsed instanceof Error) {
    notes.push(`unusable key ${path}: ${parsed.message}`)
    return null
  }
  return parsed
}

/**
 * Build the ordered ssh2 auth method list from the policy's auth order,
 * skipping unusable keys. An agent entry is included only when a socket is
 * present; a passphrase-protected or malformed key is skipped with a note.
 * @param username - the user to authenticate as.
 * @param methods - the policy-ordered auth methods.
 * @param agentSocket - the ssh-agent socket, when present.
 * @param notes - collected skip reasons.
 * @returns the ssh2 auth methods in try order.
 */
function buildAuthMethods(
  username: string,
  methods: readonly AuthMethod[],
  agentSocket: string | null,
  notes: string[],
): Array<AgentAuthMethod | PublicKeyAuthMethod> {
  const list: Array<AgentAuthMethod | PublicKeyAuthMethod> = []
  for (const method of methods) {
    if (method.kind === 'agent') {
      // selectAuthMethods already drops the agent method without a socket, so
      // the no-socket arm here is defense against a hand-built methods list.
      /* v8 ignore start -- unreachable from selectAuthMethods output */
      if (agentSocket !== null && agentSocket !== '') {
        /* v8 ignore stop */
        list.push({ type: 'agent', username, agent: agentSocket })
      }
      continue
    }
    const key = loadUsableKey(method.path, notes)
    if (key !== null) list.push({ type: 'publickey', username, key })
  }
  return list
}

/** The no-auth failure message naming exactly what was tried. */
function noAuthMessage(methods: readonly AuthMethod[], notes: readonly string[]): string {
  /* v8 ignore next -- an agent method always produces an authMethods entry, so only key methods or none reach here */
  const identities = methods.map(method => method.kind === 'key' ? method.path : 'ssh-agent').join(', ')
  const detail = notes.length > 0 ? ` (${notes.join('; ')})` : ''
  return `no usable authentication method: tried ${identities} and none worked (agent and key authentication only)${detail}`
}

/** Append one known_hosts line, best-effort: TOFU must not brick a connect. */
function appendKnownHosts(path: string, line: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    appendFileSync(path, line, { mode: 0o600 })
  } catch {
    // Best-effort persistence: the in-memory entry still satisfies this connect,
    // and the next connect re-learns if the file could not be written.
  }
}

/**
 * Build the host-key verifier for one connection: TOFU learn on first sight,
 * changed-key rejection, optional strict mode. The ssh2 verifier receives the
 * raw key blob, whose base64 is the known_hosts storage form.
 * @param host - the concrete hostname.
 * @param port - the port.
 * @param entries - the known_hosts entries (learned entries are pushed).
 * @param knownHostsPath - the known_hosts file for the TOFU write.
 * @param strictHostKey - strict mode.
 * @param setFailure - records the precise failure for error mapping.
 * @returns the verifier function.
 */
function makeHostVerifier(
  host: string,
  port: number,
  entries: KnownHostsEntry[],
  knownHostsPath: string,
  strictHostKey: boolean,
  setFailure: (error: SshError) => void,
): (key: Buffer) => boolean {
  return (key: Buffer): boolean => {
    const keyBase64 = key.toString('base64')
    const verdict = checkHostKey(entries, host, port, keyBase64)
    if (verdict.kind === 'known') return true
    if (verdict.kind === 'changed') {
      setFailure(new SshError('SSH_HOST_KEY_CHANGED', `host key for ${host}:${port} changed since it was recorded in ${knownHostsPath}; refusing to connect. Remove the stale entry if this change is expected.`))
      return false
    }
    if (strictHostKey) {
      setFailure(new SshError('SSH_UNKNOWN_HOST', `unknown host ${host}:${port} (strict host-key mode; no entry in ${knownHostsPath})`))
      return false
    }
    const algorithm = hostKeyAlgorithmFromBlob(keyBase64)
    /* v8 ignore next -- hostKeyAlgorithmFromBlob returns '' only for malformed blobs, which the ssh transport never presents */
    appendKnownHosts(knownHostsPath, learnKnownHostLine(host, port, algorithm === '' ? 'unknown' : algorithm, keyBase64))
    entries.push({ pattern: knownHostPattern(host, port), keyType: algorithm, keyBase64 })
    return true
  }
}

/** Options for {@link establishSingleClient}. */
interface SingleClientOptions {
  host: string
  port: number
  username: string
  sock?: Duplex
  timeoutMs: number
  authMethods: Array<AgentAuthMethod | PublicKeyAuthMethod>
  hostVerifier: (key: Buffer) => boolean
  signal?: AbortSignal
}

/**
 * Establish one ssh2 client connection and wait for the handshake. Rejects
 * with the ssh2 error (mapped by the caller) or `SSH_ABORTED` when the
 * caller's signal fires; the caller owns mapping to the seam vocabulary.
 * @param options - connection parameters.
 * @returns the connected client.
 */
async function establishSingleClient(options: SingleClientOptions): Promise<ssh2.Client> {
  const conn = new ssh2.Client()
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = (action: () => void): void => {
      /* v8 ignore next -- the once-listeners cannot fire twice, so the guard is defensive */
      if (settled) return
      settled = true
      conn.removeListener('ready', onReady)
      conn.removeListener('error', onError)
      conn.removeListener('close', onClose)
      options.signal?.removeEventListener('abort', onAbort)
      action()
    }
    const onReady = (): void =>{  settle(resolve) }
    const onError = (error: Error): void =>{  settle(() =>{  reject(error) }) }
    // ssh2 emits 'error' (protocol-level) before 'close' for every pre-handshake
    // connection loss, so this arm is defense against a close-only teardown.
    /* v8 ignore start -- unreachable: 'error' always precedes 'close' pre-ready */
    const onClose = (): void =>{  settle(() =>{  reject(new Error('connection closed during handshake')) }) }
    /* v8 ignore stop */
    const onAbort = (): void => {
      endClient(conn)
      settle(() =>{  reject(new SshError('SSH_ABORTED', 'ssh connect aborted')) })
    }
    conn.once('ready', onReady)
    conn.once('error', onError)
    conn.once('close', onClose)
    // Swallow errors after settlement: the rejecting once-listener is removed
    // by settle, and an unhandled 'error' on the doomed client would crash.
    /* v8 ignore next -- post-settlement 'error' timing is transport-dependent */
    conn.on('error', () => {})
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        onAbort()
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    conn.connect({
      host: options.host,
      port: options.port,
      username: options.username,
      readyTimeout: options.timeoutMs,
      ...(options.sock === undefined ? {} : { sock: options.sock }),
      hostVerifier: options.hostVerifier,
      authHandler: options.authMethods,
    })
  })
  return conn
}

/**
 * Open a `direct-tcpip` forward from a connected jump client to a target.
 * @param client - the jump connection.
 * @param host - the target host.
 * @param port - the target port.
 * @returns the forwarded duplex stream, usable as the next hop's `sock`.
 */
function forwardTo(client: ssh2.Client, host: string, port: number): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    client.forwardOut('127.0.0.1', 0, host, port, (error, stream) => {
      if (error !== undefined) {
        reject(new SshError('SSH_CONNECT_ERROR', `ProxyJump to ${host}:${port} failed: ${error.message}`))
        return
      }
      resolve(stream)
    })
  })
}

/** Options for {@link openHopChain}. */
interface HopChainOptions {
  resolved: ResolvedSshHost
  configText: string
  homeDir: string
  methods: AuthMethod[]
  agentSocket: string | null
  knownHostsPath: string
  strictHostKey: boolean
  timeoutMs: number
  signal?: AbortSignal
}

/**
 * Open the ProxyJump chain for a target: one connection per hop, each hop
 * forwarding to the next (or to the final host). Hops authenticate with the
 * same methods as the target, mirroring OpenSSH's default.
 * @param options - resolution and auth context.
 * @returns the forward stream into the final hop plus every hop client (the
 *   caller must keep the hops alive and end them on teardown).
 */
async function openHopChain(options: HopChainOptions): Promise<{ sock: Duplex | null; hops: ssh2.Client[] }> {
  const { resolved } = options
  if (resolved.proxyJumps.length === 0) return { sock: null, hops: [] }
  const hops: ssh2.Client[] = []
  const hopTargets = resolved.proxyJumps.map((destination) => {
    const parsed = parseSshDestination(destination)
    return resolveSshConfig(parsed.host, options.configText, options.homeDir, {
      ...(parsed.user === undefined ? {} : { user: parsed.user }),
      ...(parsed.port === undefined ? {} : { port: parsed.port }),
    })
  })
  let sock: Duplex | null = null
  let hostKeyFailure: SshError | null = null
  try {
    for (const hop of hopTargets) {
      const notes: string[] = []
      const hopClient = await establishSingleClient({
        host: hop.hostName,
        port: hop.port,
        username: hop.user,
        ...(sock === null ? {} : { sock }),
        timeoutMs: options.timeoutMs,
        authMethods: buildAuthMethods(hop.user, options.methods, options.agentSocket, notes),
        hostVerifier: makeHostVerifier(
          hop.hostName,
          hop.port,
          loadKnownHostsMapped(options.knownHostsPath),
          options.knownHostsPath,
          options.strictHostKey,
          (error) => { hostKeyFailure = error },
        ),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      hops.push(hopClient)
      const nextIndex = hopTargets.indexOf(hop) + 1
      const next = hopTargets[nextIndex]
      sock = await forwardTo(hopClient, next?.hostName ?? resolved.hostName, next?.port ?? resolved.port)
    }
  } catch (error) {
    for (const hop of hops) endClient(hop)
    throw mapConnectError(error, hostKeyFailure, [], options.timeoutMs)
  }
  return { sock, hops }
}

/** Options carried by a connected world. */
interface WorldConnectOptions {
  methods: AuthMethod[]
  agentSocket: string | null
  configText: string
  homeDir: string
  knownHostsPath: string
  strictHostKey: boolean
  timeoutMs: number
  defaultMaxOutputBytes: number
  signal?: AbortSignal
}

/**
 * Map a connect-time failure onto the seam vocabulary, preferring the precise
 * host-key verdict, then authentication (with the collected key notes), then
 * timeout/abort, then the generic transport failure.
 * @param error - the thrown value.
 * @param hostKeyFailure - the host-key verdict, when one was recorded.
 * @param notes - key skip reasons collected during auth building.
 * @param timeoutMs - the handshake timeout, for the message.
 * @returns the mapped {@link SshError}.
 */
function mapConnectError(error: unknown, hostKeyFailure: SshError | null, notes: readonly string[], timeoutMs: number): SshError {
  if (error instanceof SshError) return error
  if (hostKeyFailure !== null) return hostKeyFailure
  /* v8 ignore next -- ssh2 and the seam throw Error instances */
  /* v8 ignore next -- ssh2 and the seam throw Error instances */
  const message = error instanceof Error ? error.message : String(error)
  const level = (error as { level?: string }).level
  if (level === 'client-authentication' || message.includes('All configured authentication methods failed')) {
    const detail = notes.length > 0 ? ` (${notes.join('; ')})` : ''
    return new SshError('SSH_AUTH_FAILED', `ssh authentication failed for all configured methods${detail}`)
  }
  if (message.includes('Timed out while waiting for handshake')) {
    return new SshError('SSH_TIMEOUT', `ssh handshake timed out after ${timeoutMs}ms`)
  }
  return new SshError('SSH_CONNECT_ERROR', `ssh connect failed: ${message}`)
}

/** Load known_hosts, mapping IO failures onto the seam vocabulary. */
function loadKnownHostsMapped(path: string): KnownHostsEntry[] {
  try {
    return loadKnownHosts(path)
  } catch (error) {
    /* v8 ignore next -- readFileSync throws Error instances only */
    throw new SshError('SSH_CONFIG_ERROR', `known_hosts at ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** End an ssh2 client, tolerating a never-started protocol (abort before connect). */
function endClient(conn: ssh2.Client): void {
  try {
    conn.end()
  } catch {
    // The protocol layer may not exist before connect() begins; a pre-connect
    // abort must still settle without a secondary throw.
  }
}

/** Quote one POSIX shell word without interpolation (e2b's pattern). */
function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

/**
 * Collect one exec channel's output, bounded, with timeout and abort handling.
 *
 * The result settles on the channel's natural `close` (the exit code's only
 * source). A caller-initiated timeout or abort resolves immediately with the
 * output captured so far: the remote may hold the channel open forever, and
 * the verdict is already decided, so the teardown continues in the background.
 */
function collectChannel(
  stream: ClientChannel,
  options: { maxOutputBytes: number; timeoutMs?: number; signal?: AbortSignal; stdin?: string },
): Promise<SshExecResult> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const outUsed = { n: 0 }
    const errUsed = { n: 0 }
    let stdoutTruncated = false
    let stderrTruncated = false
    let settled = false
    const finish = (
      exitCode: number | null,
      signal: string | null,
      timedOut: boolean,
      aborted: boolean,
    ): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (options.signal !== undefined) options.signal.removeEventListener('abort', onAbort)
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode,
        signal,
        timedOut,
        aborted,
        stdoutTruncated,
        stderrTruncated,
      })
    }
    const push = (chunk: Buffer, target: Buffer[], used: { n: number }, onTruncated: () => void): void => {
      if (used.n >= options.maxOutputBytes) {
        onTruncated()
        return
      }
      const take = chunk.subarray(0, options.maxOutputBytes - used.n)
      used.n += take.length
      if (take.length < chunk.length) onTruncated()
      target.push(take)
    }
    const closeChannel = (): void => {
      try { stream.close() } catch { /* channel already closed */ }
    }
    stream.on('data', (chunk: Buffer) => { push(chunk, stdout, outUsed, () => { stdoutTruncated = true }) })
    stream.stderr.on('data', (chunk: Buffer) => { push(chunk, stderr, errUsed, () => { stderrTruncated = true }) })
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => {
      try { stream.signal('KILL') } catch { /* channel already closed */ }
      closeChannel()
      finish(null, null, true, false)
    }, options.timeoutMs)
    const onAbort = (): void => {
      closeChannel()
      finish(null, null, false, true)
    }
    if (options.signal !== undefined) {
      if (options.signal.aborted) {
        onAbort()
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true })
      }
    }
    stream.once('close', (code: number | null, remoteSignal: string | null) => {
      finish(code ?? null, remoteSignal ?? null, false, false)
    })
    if (options.stdin !== undefined) {
      stream.write(options.stdin)
      stream.end()
    }
  })
}

/** One connected SSH execution world owned by {@link Ssh2Service}. */
class Ssh2World extends SshWorld {
  readonly id: SshWorldId
  readonly target: SshTarget
  readonly resolved: ResolvedSshHost | null
  private conn: ssh2.Client | null = null
  private hopClients: ssh2.Client[] = []
  private state: SshStatus = 'closed'
  private sftpSession: SFTPWrapper | null = null
  private options: WorldConnectOptions | null = null

  constructor(id: SshWorldId, target: SshTarget, resolved: ResolvedSshHost | null) {
    super()
    this.id = id
    this.target = target
    this.resolved = resolved
  }

  status(): SshStatus {
    return this.state
  }

  /** Establish the connection (through ProxyJump hops) and enter `connected`. */
  async connect(options: WorldConnectOptions): Promise<void> {
    const resolved = this.resolved
    /* v8 ignore next -- Ssh2Service only constructs worlds with a resolution */
    if (resolved === null) throw new SshError('SSH_CONFIG_ERROR', 'world has no resolved host')
    this.options = options
    const { sock, hops } = await openHopChain({
      resolved,
      configText: options.configText,
      homeDir: options.homeDir,
      methods: options.methods,
      agentSocket: options.agentSocket,
      knownHostsPath: options.knownHostsPath,
      strictHostKey: options.strictHostKey,
      timeoutMs: options.timeoutMs,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    const conn = new ssh2.Client()
    this.conn = conn
    this.hopClients = hops
    const entries = loadKnownHostsMapped(options.knownHostsPath)
    const notes: string[] = []
    const authMethods = buildAuthMethods(resolved.user, options.methods, options.agentSocket, notes)
    if (authMethods.length === 0) {
      endClient(conn)
      throw new SshError('SSH_AUTH_FAILED', noAuthMessage(options.methods, notes))
    }
    let hostKeyFailure: SshError | null = null
    try {
      const established = await establishSingleClient({
        host: resolved.hostName,
        port: resolved.port,
        username: resolved.user,
        ...(sock === null ? {} : { sock }),
        timeoutMs: options.timeoutMs,
        authMethods,
        hostVerifier: makeHostVerifier(
          resolved.hostName,
          resolved.port,
          entries,
          options.knownHostsPath,
          options.strictHostKey,
          (error) => { hostKeyFailure = error },
        ),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
      this.conn = established
      conn.end()
    } catch (error) {
      endClient(conn)
      throw mapConnectError(error, hostKeyFailure, notes, options.timeoutMs)
    }
    const settled = this.conn
    settled.on('close', () => { this.state = 'closed' })
    this.state = 'connected'
  }

  async exec(command: string, options: SshExecOptions = {}): Promise<SshExecResult> {
    const conn = this.conn
    const worldOptions = this.options
    if (conn === null || worldOptions === null || this.state !== 'connected') {
      throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
    }
    const effective = options.cwd === undefined ? command : `cd ${quotePosix(options.cwd)} && ${command}`
    const stream = await new Promise<ClientChannel>((resolve, reject) => {
      conn.exec(effective, options.env === undefined ? {} : { env: options.env }, (error, channel) => {
        if (error !== undefined) {
          reject(new SshError('SSH_CONNECT_ERROR', `ssh exec failed: ${error.message}`))
          return
        }
        resolve(channel)
      })
    })
    return collectChannel(stream, {
      maxOutputBytes: options.maxOutputBytes ?? worldOptions.defaultMaxOutputBytes,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    })
  }

  async sftp(): Promise<SftpHandle> {
    const conn = this.conn
    if (conn === null || this.state !== 'connected') {
      throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
    }
    if (this.sftpSession === null) {
      this.sftpSession = await new Promise<SFTPWrapper>((resolve, reject) => {
        conn.sftp((error, sftp) => {
          if (error !== undefined) {
            reject(new SshError('SSH_CONNECT_ERROR', `sftp open failed: ${error.message}`))
            return
          }
          resolve(sftp)
        })
      })
    }
    return { [SSH_SFTP_HANDLE]: SSH_SFTP_HANDLE, session: this.sftpSession }
  }

  async pty(options: SshPtyOptions = {}): Promise<SshPtyHandle> {
    const conn = this.conn
    if (conn === null || this.state !== 'connected') {
      throw new SshError('SSH_CONNECT_ERROR', 'world is not connected')
    }
    const channel = await new Promise<ClientChannel>((resolve, reject) => {
      conn.shell({
        rows: options.rows ?? 24,
        cols: options.cols ?? 80,
        term: 'xterm-256color',
      }, {
        ...(options.env === undefined ? {} : { env: options.env }),
      }, (error, stream) => {
        if (error !== undefined) {
          reject(new SshError('SSH_CONNECT_ERROR', `ssh pty open failed: ${error.message}`))
          return
        }
        resolve(stream)
      })
    })
    return { [SSH_PTY_HANDLE]: SSH_PTY_HANDLE, channel }
  }

  dispose(): Promise<void> {
    if (this.conn === null && this.state === 'closed') return Promise.resolve()
    this.state = 'closed'
    this.sftpSession = null
    const conn = this.conn
    this.conn = null
    for (const hop of this.hopClients) endClient(hop)
    this.hopClients = []
    /* v8 ignore next -- a null conn with a non-closed state cannot occur: conn is assigned before any state transition */
    if (conn !== null) endClient(conn)
    return Promise.resolve()
  }
}

/**
 * ssh2-backed SSH transport provider. Load as a plugin; it registers as
 * `ctx.ssh` (one implementation per context).
 */
export class Ssh2Service extends SshService {
  static Config: z<Config> = z.object({
    knownHostsPath: z.string(),
    configPath: z.string(),
    homeDir: z.string(),
    timeoutMs: z.number().default(15_000),
    strictHostKey: z.boolean().default(false),
    defaultMaxOutputBytes: z.number().default(64_000),
  })

  private readonly registry = new Map<SshWorldId, Ssh2World>()

  constructor(ctx: Context, config: Config) {
    super(ctx)
    const entry = config as ResolvedConfig
    assertServiceableConfig(entry)
    this.resolvedConfig = entry
    ctx.effect(() => () => {
      for (const world of [...this.registry.values()]) void world.dispose()
    })
  }

  /** Validated config (schemastery applied the defaults before construction). */
  private readonly resolvedConfig: ResolvedConfig

  async connect(target: SshTarget, options: SshConnectOptions = {}): Promise<SshWorld> {
    const homeDir = this.resolvedConfig.homeDir ?? homedir()
    const configPath = this.resolvedConfig.configPath ?? join(homeDir, '.ssh', 'config')
    let configText: string
    try {
      configText = readConfigText(configPath)
    } catch (error) {
      /* v8 ignore next -- readFileSync throws Error instances only */
      throw new SshError('SSH_CONFIG_ERROR', `~/.ssh/config at ${configPath} could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
    const resolved = resolveSshConfig(target.host, configText, homeDir, {
      ...(target.user === undefined ? {} : { user: target.user }),
      ...(target.port === undefined ? {} : { port: target.port }),
    })
    const identityFiles = resolved.identityFiles.length > 0 ? resolved.identityFiles : defaultIdentityFiles(homeDir)
    const agentSocket = process.env.SSH_AUTH_SOCK ?? null
    const methods = selectAuthMethods({ agentSocket, identityFiles })
    const world = new Ssh2World(randomUUID() as SshWorldId, target, resolved)
    await world.connect({
      methods,
      agentSocket,
      configText,
      homeDir,
      knownHostsPath: this.resolvedConfig.knownHostsPath ?? join(homeDir, '.ssh', 'known_hosts'),
      strictHostKey: options.strictHostKey ?? this.resolvedConfig.strictHostKey,
      timeoutMs: options.timeoutMs ?? this.resolvedConfig.timeoutMs,
      defaultMaxOutputBytes: this.resolvedConfig.defaultMaxOutputBytes,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    })
    this.registry.set(world.id, world)
    return world
  }

  worlds(): readonly SshWorld[] {
    return [...this.registry.values()]
  }

  async disconnect(worldId: SshWorldId): Promise<void> {
    const world = this.registry.get(worldId)
    if (world === undefined) return
    await world.dispose()
    this.registry.delete(worldId)
  }
}

export default Ssh2Service
