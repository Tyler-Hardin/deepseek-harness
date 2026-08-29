# SSH Transport

English | [中文](ssh.zh.md)

The SSH transport seam is one package ([dsh-ssh](../../packages/ssh/ssh), `ctx.ssh`) plus its ssh2-backed provider ([dsh-ssh-client](../../packages/ssh/ssh-client)): connect to a remote execution world with agent-then-keys authentication, resolve `~/.ssh/config` (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), enforce known_hosts policy (TOFU with changed-key rejection), and expose exec + SFTP channels. It says nothing about workspaces, sessions, or tools — the workspace/`worlds` binding ([worlds.md](worlds.md)) and the `fs-ssh`/`bash-ssh` adapters consume this seam. Authentication is deliberately agent-and-keys only: there is no password variant in the type, so a config that would need one fails loud rather than falling back.

Source: [`packages/ssh/ssh/src/types.ts`](../../packages/ssh/ssh/src/types.ts) and [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)

## Target and connection

An `SshTarget` is the remote half of a workspace place: a host alias or name with explicit user/port/path overrides. `ctx.ssh.connect` resolves it through `~/.ssh/config` into a concrete `ResolvedSshHost` — concrete hostname, port, user, ordered identity files, and the ProxyJump chain — then connects.

```ts type-equiv
/**
 * The remote half of a workspace place: which ssh host, which user/port, and
 * which remote working path. `host` is the config alias or name; `user`/`port`
 * are explicit overrides resolved through `~/.ssh/config` when absent.
 */
interface SshTarget {
  /** Host alias or name, resolved through `~/.ssh/config`. */
  readonly host: string
  /** Explicit user override; the config or the local user supplies the default. */
  readonly user?: string
  /** Explicit port override; the config or 22 supplies the default. */
  readonly port?: number
  /** Remote working path of the workspace place. Consumed by later phases. */
  readonly path?: string
}
```

```ts type-equiv
/**
 * A fully-resolved connection target after consulting `~/.ssh/config`:
 * concrete hostname, port, user, the ordered identity files to try, and the
 * ProxyJump hop chain (each hop itself a `[user@]host[:port]` destination).
 */
interface ResolvedSshHost {
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
```

```ts type-equiv
/** Options for {@link SshService.connect}. */
interface SshConnectOptions {
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
```

## Remote commands and results

`SshWorld.exec` runs one remote command with bounded capture: `stdout`/`stderr` are truncated at the combined ceiling, timeout expiry kills the remote process and reports `timedOut`, and the caller's abort signal reports `aborted`.

```ts type-equiv
/** Options for one remote command via {@link SshWorld.exec}. */
interface SshExecOptions {
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
```

```ts type-equiv
/** The settled result of one remote command. */
interface SshExecResult {
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
```

## Remote PTY sessions

`SshWorld.pty` opens one interactive shell channel with a remote pseudo-terminal (login shell; the SSH protocol's shell request has no shell or directory parameter). The returned handle is opaque — `SshPtyHandle` brands its `channel` and exposes no operations directly — so only the terminal backend reads it: [dsh-terminal-ssh](../../packages/terminal/terminal-ssh) drives the channel as a persistent remote session, starting an explicit `cd` when a working directory is requested.

## Worlds, auth, and known hosts

A connected world is the transport half of a remote workspace place: it owns exactly one connection (through however many ProxyJump hops) and multiplexes exec and SFTP channels over it. `SshWorldId` is a branded opaque id; the [execution-worlds service](worlds.md) assigns its own `WorldId` per workspace, so the transport's id and the execution world's id are distinct identities.

Authentication is agent-then-keys: the agent socket first when present, then each resolved identity file, and never a password (`AuthMethod` is `{ kind: 'agent' } | { kind: 'key', path }`). Known-host policy is TOFU by default: an unknown host's key is learned and recorded; a changed key for a known host rejects with `SSH_HOST_KEY_CHANGED`, and strict mode rejects any unknown host with `SSH_UNKNOWN_HOST`. `SshError` carries a stable machine-routable `SshErrorCode` (`SSH_AUTH_FAILED`, `SSH_HOST_KEY_CHANGED`, `SSH_UNKNOWN_HOST`, `SSH_CONFIG_ERROR`, `SSH_CONNECT_ERROR`, `SSH_TIMEOUT`, `SSH_ABORTED`); consumers route on `code`, never on message text.

## Consumers

[dsh-fs-ssh](../../packages/fs/fs-ssh) and [dsh-bash-ssh](../../packages/shell/bash-ssh) are the product consumers: they pin the SFTP and exec contracts respectively and serve one remote execution world each. [dsh-ssh-worlds](../../packages/ssh/ssh-worlds) is the worlds provider that connects a transport world per ssh workspace place and composes those adapters over it. [dsh-terminal-ssh](../../packages/terminal/terminal-ssh) consumes the pty verb as a persistent remote terminal backend.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxssh--sshservice-abstract-seam"></a>

### `ctx.ssh` — `SshService` (abstract seam)

Abstract SSH transport service. Subclass, implement the abstract methods, and load the subclass as a plugin — it registers as `ctx.ssh` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

Implementations must honor these semantics:

- connect resolves with a live world or rejects with an SshError; authentication tries the agent first, then the resolved identity files, and never a password.
- Host keys follow the known_hosts policy: TOFU learn on first sight, changed-key rejection, optional strict mode.
- worlds lists every live world; disconnect removes it.
- Disposal of the service disposes every live world.

```ts cordis-catalog
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
```

Source: [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)
<!-- END GENERATED cordis-surface -->
