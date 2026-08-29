# SSH 传输

[English](ssh.md) | 中文

SSH 传输接缝由单个包（[dsh-ssh](../../packages/ssh/ssh)，`ctx.ssh`）及其 ssh2 后端 provider（[dsh-ssh-client](../../packages/ssh/ssh-client)）构成：连接到远程执行世界，使用 agent-then-keys 认证，解析 `~/.ssh/config`（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`），执行 known_hosts 策略（TOFU，变更密钥即拒绝），并暴露 exec 与 SFTP 通道。它不涉及工作区、会话或工具——工作区/`worlds` 绑定（[worlds.md](worlds.zh.md)）与 `fs-ssh`/`bash-ssh` 适配器消费此接缝。认证刻意只支持 agent 与密钥：类型中没有密码变体，因此需要密码的配置会响亮地失败，而不是回退。

源码：[`packages/ssh/ssh/src/types.ts`](../../packages/ssh/ssh/src/types.ts) 与 [`packages/ssh/ssh/src/index.ts`](../../packages/ssh/ssh/src/index.ts)

## 目标与连接

`SshTarget` 是工作区位置的远程一半：主机别名或名称，带显式 user/port/path 覆盖。`ctx.ssh.connect` 经 `~/.ssh/config` 把它解析为具体的 `ResolvedSshHost`——具体主机名、端口、用户、有序身份文件与 ProxyJump 链——然后连接。

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

## 远程命令与结果

`SshWorld.exec` 运行一条远程命令并做有界捕获：`stdout`/`stderr` 在合并上限处截断，超时到期会杀死远程进程并报告 `timedOut`，调用方的中止信号报告 `aborted`。

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

## 远程 PTY 会话

`SshWorld.pty` 打开一个带远程伪终端的交互式 shell 通道（登录 shell；SSH 协议的 shell 请求没有 shell 或目录参数）。返回的句柄是不透明的——`SshPtyHandle` 为其 `channel` 打上品牌标记，不直接暴露任何操作——因此只有终端后端读取它：[dsh-terminal-ssh](../../packages/terminal/terminal-ssh) 把该通道驱动为持久远程会话，并在请求了工作目录时先执行显式 `cd`。

## 世界、认证与 known_hosts

已连接的世界是远程工作区位置的传输一半：它独占一条连接（无论经过多少 ProxyJump 跳），并在这条连接上复用 exec 与 SFTP 通道。`SshWorldId` 是品牌化不透明 id；[执行世界服务](worlds.zh.md) 为每个工作区分配自己的 `WorldId`，因此传输的 id 与执行世界的 id 是两个不同的身份。

认证是 agent-then-keys：有 agent socket 时先试 agent，再依次尝试每个已解析的身份文件，绝不用密码（`AuthMethod` 是 `{ kind: 'agent' } | { kind: 'key', path }`）。known_hosts 策略默认 TOFU：未知主机的密钥会被学习并记录；已知主机的密钥变更以 `SSH_HOST_KEY_CHANGED` 拒绝，严格模式以 `SSH_UNKNOWN_HOST` 拒绝任何未知主机。`SshError` 携带稳定的可机读 `SshErrorCode`（`SSH_AUTH_FAILED`、`SSH_HOST_KEY_CHANGED`、`SSH_UNKNOWN_HOST`、`SSH_CONFIG_ERROR`、`SSH_CONNECT_ERROR`、`SSH_TIMEOUT`、`SSH_ABORTED`）；消费者按 `code` 路由，绝不解析消息文本。

## 消费者

[dsh-fs-ssh](../../packages/fs/fs-ssh) 与 [dsh-bash-ssh](../../packages/shell/bash-ssh) 是产品消费者：它们分别固定 SFTP 与 exec 契约，各自服务一个远程执行世界。[dsh-ssh-worlds](../../packages/ssh/ssh-worlds) 是按 ssh 工作区位置为每个世界连接传输世界的 worlds provider，并在其上组合这些适配器。[dsh-terminal-ssh](../../packages/terminal/terminal-ssh) 把 pty 动词消费为持久远程终端后端。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
