/**
 * Shared vocabulary of the SSH transport seam. Types only — no runtime code.
 * @module @deepseek-ai/dsh-ssh/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * The remote half of a workspace place: which ssh host, which user/port, and
 * which remote working path. `host` is the config alias or name; `user`/`port`
 * are explicit overrides resolved through `~/.ssh/config` when absent.
 */
export interface SshTarget {
  /** Host alias or name, resolved through `~/.ssh/config`. */
  readonly host: string
  /** Explicit user override; the config or the local user supplies the default. */
  readonly user?: string
  /** Explicit port override; the config or 22 supplies the default. */
  readonly port?: number
  /** Remote working path of the workspace place. Consumed by later phases. */
  readonly path?: string
}

/**
 * Opaque identity of one connected execution world. Never parse it: the owning
 * service maps ids to worlds, and a string that walks and talks like a
 * `SshWorldId` from another world must not be interchangeable with one.
 */
export type SshWorldId = Branded<'SshWorldId'>

/** Observability state of a world's underlying connection. */
export type SshStatus = 'connected' | 'closed'

/** Options for {@link SshService.connect}. */
export interface SshConnectOptions {
  /** Connect timeout in milliseconds; a connect exceeding it fails with `SSH_TIMEOUT`. */
  timeoutMs?: number
  /**
   * Strict host-key mode: require a pre-existing known_hosts entry and reject
   * an unknown host with `SSH_UNKNOWN_HOST`. Defaults to false (TOFU).
   */
  strictHostKey?: boolean
  /** Aborts the connect attempt; settled connects ignore it. */
  signal?: AbortSignal
}

/** Options for one remote command via {@link SshWorld.exec}. */
export interface SshExecOptions {
  /** Command timeout in milliseconds; expiry reports `timedOut` and kills the remote process. */
  timeoutMs?: number
  /** Aborts the command; reports `aborted`. */
  signal?: AbortSignal
  /** Combined stdout/stderr capture ceiling in bytes; overflow truncates at the boundary. */
  maxOutputBytes?: number
  /** Remote working directory for the command (the world's login shell cwd otherwise). */
  cwd?: string
  /** Explicit environment entries merged over the remote login environment. */
  env?: Readonly<Record<string, string>>
  /** Bytes to write to the command's stdin before closing it; absent leaves stdin closed. */
  stdin?: string
}

/** The settled result of one remote command. */
export interface SshExecResult {
  /** Captured stdout, bounded by `maxOutputBytes`. */
  readonly stdout: string
  /** Captured stderr, bounded by `maxOutputBytes`. */
  readonly stderr: string
  /** Remote exit code, or `null` when the process did not exit normally. */
  readonly exitCode: number | null
  /** The terminating remote signal, when the process died from one; `null` otherwise. */
  readonly signal: string | null
  /** True when the caller's timeout expired and the remote process was killed. */
  readonly timedOut: boolean
  /** True when the caller's signal aborted the command before settlement. */
  readonly aborted: boolean
  /** True when stdout was truncated at the capture ceiling. */
  readonly stdoutTruncated: boolean
  /** True when stderr was truncated at the capture ceiling. */
  readonly stderrTruncated: boolean
}

/**
 * A fully-resolved connection target after consulting `~/.ssh/config`:
 * concrete hostname, port, user, the ordered identity files to try, and the
 * ProxyJump hop chain (each hop itself a `[user@]host[:port]` destination).
 */
export interface ResolvedSshHost {
  /** Concrete hostname to connect to (the alias's `HostName`, or the alias). */
  readonly hostName: string
  /** Port to connect to (explicit, config `Port`, or 22). */
  readonly port: number
  /** User to authenticate as (explicit, config `User`, or the local user). */
  readonly user: string
  /** Ordered private-key paths from config `IdentityFile` entries, `~`-expanded. */
  readonly identityFiles: readonly string[]
  /** ProxyJump chain from config, each entry a `[user@]host[:port]` destination. */
  readonly proxyJumps: readonly string[]
}

/** Brand key for the opaque SFTP transport handle. */
export const SSH_SFTP_HANDLE: unique symbol = Symbol('dsh.ssh.sftp')

/**
 * Opaque handle to the world's SFTP session. Provisional until the `fs-ssh`
 * adapter pins its contract in a later phase: consumers must not interpret
 * `session`; the owning adapter reads it through the Service Definition.
 */
export interface SftpHandle {
  /** Brand marker; not data. */
  readonly [SSH_SFTP_HANDLE]: typeof SSH_SFTP_HANDLE
  /**
   * The transport-owned SFTP session. The `fs-ssh` adapter pins the real
   * contract in a later phase and reads this through the Service Definition.
   */
  readonly session: unknown
}

/** Brand key for the opaque PTY channel handle. */
export const SSH_PTY_HANDLE: unique symbol = Symbol('dsh.ssh.pty')

/**
 * Opaque handle to the world's interactive shell channel with a remote
 * pseudo-terminal. Consumers must not interpret `channel` directly; the
 * `terminal-ssh` backend reads it through the Service Definition.
 */
export interface SshPtyHandle {
  /** Brand marker; not data. */
  readonly [SSH_PTY_HANDLE]: typeof SSH_PTY_HANDLE
  /** The transport-owned PTY channel (ssh2 ClientChannel shape). */
  readonly channel: unknown
}

/**
 * Options for {@link SshWorld.pty}. The remote login shell always launches
 * (the SSH protocol's shell request has no shell or directory parameter); the
 * `terminal-ssh` backend starts an initial `cd` for a working directory.
 */
export interface SshPtyOptions {
  /** Initial rows (terminal geometry). */
  rows?: number
  /** Initial columns (terminal geometry). */
  cols?: number
  /** Explicit environment entries merged over the remote login environment. */
  env?: Readonly<Record<string, string>>
}
