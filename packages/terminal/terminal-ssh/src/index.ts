/**
 * Persistent remote shell PTY backend over an ssh world's pty channel: one
 * login shell per session, silence-based readiness, control-byte signals, and
 * channel-owned cleanup. `dsh-tool-terminal` routes to this backend when the
 * session runs in a remote ssh world.
 * @module @deepseek-ai/dsh-terminal-ssh
 */

import { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { TerminalBackendCleanupError } from '@deepseek-ai/dsh-terminal'
import type { TerminalBackend, TerminalBackendSpawnSpec } from '@deepseek-ai/dsh-terminal'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import type { World } from '@deepseek-ai/dsh-worlds'
import { type Config, type ResolvedConfig, resolveConfig } from './config.ts'
import { RemotePtySession, type RemotePtyChannel } from './session.ts'

export { Config } from './config.ts'
export type { Config as TerminalSshConfig } from './config.ts'

/** Cordis plugin name. */
export const name = 'terminal-ssh'
/** Required services: PTY registry and the execution-worlds service. */
export const inject = ['terminals', 'worlds']

/* jscpd:ignore-start -- this SSH PTY backend mirrors the local PTY backend for
   the same terminal seam; extract shared code when a third backend appears. */

/**
 * Single-quote a path for the remote POSIX shell.
 * @param path - the absolute remote path.
 * @returns the path wrapped in single quotes with embedded quotes escaped.
 */
export function shQuote(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`
}

/**
 * Write the boot line (a `cd` into the session's working path) and wait for
 * the shell to reach output idle.
 * @param session - the fresh remote PTY session.
 * @param cwd - the remote working path, or undefined to keep the login directory.
 * @param signal - optional cancellation while the shell reaches readiness.
 */
async function startupSession(session: RemotePtySession, cwd: string | undefined, signal?: AbortSignal): Promise<void> {
  await session.initialize(signal, cwd === undefined ? undefined : `cd ${shQuote(cwd)}`)
}

/** Remote shell backend registered under the configured type. */
export class SshTerminalBackend implements TerminalBackend {
  readonly type: string

  constructor(
    ctx: Context,
    private readonly config: ResolvedConfig,
    private readonly resolveWorld: (session: Session, cwd: string | undefined) => Promise<World> = (session, cwd) =>
      ctx.worlds.resolve({ session, ...cwd !== undefined ? { path: cwd } : {} }),
    private readonly createSession: (channel: RemotePtyChannel, config: ResolvedConfig) => RemotePtySession = (channel, config) =>
      new RemotePtySession(channel, config),
  ) {
    this.type = config.backendType
  }

  async spawn(spec: TerminalBackendSpawnSpec): Promise<RemotePtySession> {
    spec.signal?.throwIfAborted()
    const cwd = spec.cwd ?? spec.owner.session.header.cwd
    const world = await this.resolveWorld(spec.owner.session, cwd)
    if (world.kind !== 'ssh') {
      throw new Error('terminal-ssh: a PTY session requires the owner to run in a remote ssh world')
    }
    const transport: SshWorld | undefined = world.ssh?.()
    if (transport === undefined) {
      throw new Error('terminal-ssh: the resolved ssh world does not expose its transport')
    }
    const handle = await transport.pty({
      rows: this.config.rows,
      cols: this.config.cols,
    })
    const session = this.createSession(handle.channel as RemotePtyChannel, this.config)
    try {
      await startupSession(session, cwd, spec.signal)
      return session
    } catch (error) {
      try {
        await session.close('PTY startup failed')
      } catch (closeError: unknown) {
        throw new TerminalBackendCleanupError(error, closeError)
      }
      throw error
    }
  }
}
/* jscpd:ignore-end */

/** Register the remote PTY backend. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.terminals.registerBackend(new SshTerminalBackend(ctx, resolved))
}
