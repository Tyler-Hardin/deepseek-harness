/**
 * Service Definition for the `ctx.ssh` capability seam: one SSH execution
 * world per connected target. This package owns the transport contract
 * (world lifecycle, exec and SFTP channels), the pure `~/.ssh/config` /
 * known_hosts / auth-order policy, and the `SshError` vocabulary. The
 * workspace/session binding, world routing, and fs/shell adapters are later
 * phases that consume this seam.
 * @module @deepseek-ai/dsh-ssh
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
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
} from './types.ts'

export { SshError } from './error.ts'
export type { SshErrorCode } from './error.ts'
export { SSH_PTY_HANDLE, SSH_SFTP_HANDLE } from './types.ts'
export type {
  ResolvedSshHost,
  SftpHandle,
  SshPtyHandle,
  SshPtyOptions,
  SshConnectOptions,
  SshExecOptions,
  SshExecResult,
  SshStatus,
  SshTarget,
  SshWorldId,
} from './types.ts'

export {
  defaultIdentityFiles,
  defaultSshUser,
  expandSshPath,
  parseSshDestination,
  resolveSshConfig,
  selectAuthMethods,
} from './config.ts'
export type { AuthMethod, AuthSelectionInput, ParsedSshDestination, ResolveSshConfigOptions } from './config.ts'

export {
  checkHostKey,
  hostKeyAlgorithmFromBlob,
  knownHostPattern,
  learnKnownHostLine,
  loadKnownHosts,
  parseKnownHosts,
} from './known-hosts.ts'
export type { HostKeyCheck, KnownHostsEntry } from './known-hosts.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    ssh: SshService
  }
}

/**
 * One connected SSH execution world. A world is the transport half of a
 * remote workspace place: it owns exactly one connection (through however
 * many ProxyJump hops) and multiplexes exec and SFTP channels over it.
 * Consumers receive a world from {@link SshService.connect} and must call
 * {@link dispose} when done; the service refcounts worlds by id.
 */
export abstract class SshWorld {
  /** Opaque identity of this world. */
  abstract readonly id: SshWorldId
  /** The target this world connected to. */
  abstract readonly target: SshTarget
  /** The resolved connection parameters, when available. */
  abstract readonly resolved: ResolvedSshHost | null

  /**
   * The connection's observable state.
   * @returns `connected` while the transport is usable, `closed` after
   *   dispose or an unrecoverable transport failure.
   */
  abstract status(): SshStatus

  /**
   * Run one remote command over an exec channel and capture its output.
   * @param command - the remote command line (not shell-interpreted locally;
   *   the remote login shell runs it).
   * @param options - timeout/cancel/capture/world options.
   * @returns the settled result; nonzero exits and timeouts resolve, only
   *   transport failures reject.
   */
  abstract exec(command: string, options?: SshExecOptions): Promise<SshExecResult>

  /**
   * Open the world's SFTP session handle. Provisional until the `fs-ssh`
   * adapter pins its contract; the handle is opaque to consumers.
   * @returns a handle bound to this world's connection.
   */
  abstract sftp(): Promise<SftpHandle>

  /**
   * Open an interactive shell channel with a remote pseudo-terminal. The
   * channel launches the account's login shell and stays open until the
   * remote shell exits or the world closes; the `terminal-ssh` backend drives
   * it as a persistent PTY session.
   * @param options - initial PTY geometry and environment entries.
   * @returns a handle bound to this world's connection.
   */
  abstract pty(options?: SshPtyOptions): Promise<SshPtyHandle>

  /**
   * Close the world and its connection. Idempotent; later calls report
   * `closed`. Pending channels settle with a transport failure.
   */
  abstract dispose(): Promise<void>
}

/**
 * Abstract SSH transport service. Subclass, implement the abstract methods,
 * and load the subclass as a plugin — it registers as `ctx.ssh` (one
 * implementation per context; loading a second throws, which is cordis'
 * standard duplicate-service behavior).
 *
 * Implementations must honor these semantics:
 * - {@link connect} resolves with a live world or rejects with an
 *   {@link SshError}; authentication tries the agent first, then the resolved
 *   identity files, and never a password.
 * - Host keys follow the known_hosts policy: TOFU learn on first sight,
 *   changed-key rejection, optional strict mode.
 * - {@link worlds} lists every live world; {@link disconnect} removes it.
 * - Disposal of the service disposes every live world.
 */
export abstract class SshService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'ssh')
  }

  /**
   * Connect to a target and return its world.
   * @param target - the workspace place's remote half.
   * @param options - connect timeout, host-key strictness, and cancellation.
   * @returns the connected world, refcounted by id.
   */
  abstract connect(target: SshTarget, options?: SshConnectOptions): Promise<SshWorld>

  /**
   * List the live worlds.
   * @returns every connected, not-yet-disposed world.
   */
  abstract worlds(): readonly SshWorld[]

  /**
   * Disconnect a world.
   * @param worldId - the world to close; unknown ids resolve without error.
   */
  abstract disconnect(worldId: SshWorldId): Promise<void>
}
