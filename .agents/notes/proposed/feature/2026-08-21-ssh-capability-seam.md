# Agent Note: SSH capability seam

Status: proposed

English | [中文](2026-08-21-ssh-capability-seam.zh.md)

## Problem

The [execution worlds and SSH workspaces decision](../architecture/2026-08-21-execution-worlds-and-ssh-workspaces.md) makes remote-ness a property of the workspace definition and selects worlds per session through router providers. Before any workspace can be remote, the harness needs a transport seam: connect to an ssh host with agent/key authentication that works by default, resolve `~/.ssh/config` (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), enforce known_hosts policy, and expose exec + SFTP channels that the future `fs-ssh` and `bash-ssh` adapters will consume. Nothing in the repository does this today; the reference behavior is the system `ssh` command and goop's `ssh.rs`/`transport.rs` implementation.

## Proposal

Add the `packages/ssh/` group with two packages (M1 scope — transport only; fs/shell adapters, routers, workspace/session binding, and GUI are later phases):

| Package | Path | ctx surface | Role |
|---|---|---|---|
| `@deepseek-ai/dsh-ssh` | `packages/ssh/ssh/` | `ctx.ssh` | Service Definition: world descriptor + connection lifecycle + channel verbs + pure config/known_hosts/auth-order policy |
| `@deepseek-ai/dsh-ssh-client` | `packages/ssh/ssh-client/` | registers `ctx.ssh` | ssh2-backed provider |

### `dsh-ssh` — Service Definition

- **Vocabulary**: `SshTarget` (`host`, `user?`, `port?`, `path` — the ssh workspace place), branded `WorldId` (from `dsh-brand`), `ResolvedSshHost` (hostName, port, user, identityFiles, proxyJumps), `SshError` with a stable code set (`SSH_AUTH_FAILED`, `SSH_HOST_KEY_CHANGED`, `SSH_UNKNOWN_HOST` (strict mode), `SSH_CONFIG_ERROR`, `SSH_CONNECT_ERROR`, `SSH_TIMEOUT`, `SSH_ABORTED`).
- **Pure policy, exported and unit-tested without sockets**:
  - `parseSshDestination('[user@]host[:port]')` and `resolveSshConfig(alias, configText, home)` — `~/.ssh/config` parsing via the maintained `ssh-config` dependency, first-match-wins `Host`/`Match` globs (`*`, `?`), `IdentityFile` `~` expansion, comma-separated `ProxyJump` chains.
  - `defaultIdentityFiles(home)` — `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`.
  - `selectAuthMethods(opts)` — agent first when `SSH_AUTH_SOCK`/agent pipe is present, then configured keys, then default keys; **no password variant exists in the type**.
  - known_hosts policy: `loadKnownHosts(path)`, `checkHostKey(entries, host, port, key)`, `learnHostKey(entries, host, port, key)` — TOFU learn, changed-key rejection, optional strict mode (pre-existing entry required).
- **Service contract**: abstract `SshService` (extends cordis `Service`) with `connect(target, opts): Promise<SshWorld>` (refcounted per world id), `worlds()`, `disconnect(worldId)`; abstract `SshWorld` with `id`, `target`, `status`, `exec(command, opts): Promise<ExecResult>` (bounded output, timeout/cancel), `sftp(): Promise<SftpHandle>` (opaque to consumers until `fs-ssh` lands), `dispose()`.
- `./invariant` companion and README with the canonical Model Experience section (indirect — registers no model context).

### `dsh-ssh-client` — ssh2 provider

- Implements `SshService` over `ssh2`: `hostVerifier` wired to the known_hosts policy; auth in the exact order above (agent via `ssh2`'s `Agent`, then public keys read from disk); keys rejected unless owner-only (`0600` file / `0700` `.ssh`); a passphrase-protected key with no agent fails loudly with an actionable message.
- **ProxyJump**: one ssh connection per hop, `direct-tcpip` channel to the next hop's `host:port`, the resulting socket passed as the next client's `sock`; chains resolve recursively, bounded by config.
- Bounded connect timeout; agent-first but bounded so an unresponsive agent socket cannot hang a connect.
- `exec` runs one remote command with the caller's timeout/cancel and bounded stdout/stderr; `sftp` returns the ssh2 SFTP wrapper handle for the later `fs-ssh` adapter.

### Testing

- `ssh2`'s bundled `Server` class is an in-process sshd: generated host key + a generated user key, `publickey` auth — the whole client is unit-testable with no network or CI sshd.
- Agent auth tested against an in-process `AgentProtocol` listener on a unix socket.
- Pure-policy suites: config parsing (globs, negation, ProxyJump chains, `IdentityFile` expansion, first-match-wins), known_hosts (learn/changed/reject/strict), auth selection.
- Coverage gate: per-file 100% on both packages' `src`.

## Acceptance criteria

- `dsh-ssh-client` connects to the in-process sshd with a generated key and with agent auth, with no configuration beyond the target.
- Default identity files and `~/.ssh/config` entries (alias, `User`, `Port`, `IdentityFile`, `ProxyJump`) resolve exactly like the system `ssh` for the covered cases.
- First connect learns the host key (TOFU); a changed host key rejects the connection; strict mode rejects an unknown host.
- No password-accepting code path exists anywhere in the two packages.
- Both packages pass `test:coverage`, `typecheck`, `lint`, and the doc gates (README Model Experience + Known Limitations, translation pairing, invariant registration).

## Progress

**M1 (Merged)** — `packages/ssh/ssh` (SD) and `packages/ssh/ssh-client` (ssh2 provider) as proposed; 57 client tests against the in-process sshd, per-file 100% coverage, all gates green.

**M2 (Merged)** — `packages/fs/fs-ssh` pins the provisional `SftpHandle` to the ssh2 wrapper and implements the full twelve-primitive filesystem seam over SFTP: realpath-stable target keys, binary/UTF-8 validation, atomic writes through a private staging directory, version guards, and per-target FIFO locks. `createIfAbsent` publishes through a remote hard link (`ln`), the SFTP-level no-replace primitive (SFTP v3 has no no-replace rename). Versions are time-second-derived from SFTP attrs — weaker than the local backend, documented. 25 tests, 100% coverage.

**M3 (Merged)** — `packages/shell/bash-ssh` implements the bash executor seam over the world's exec channel. Foreground runs map the transport's exec/collect lifecycle onto the seam's result (config-clamped timeout, abort, stdin, env, per-stream truncation). Background processes launch a detached remote wrapper (`setsid` new session, pid/status/out/err files) that the poll loop reads over SFTP: pid-read retries, status settlement with 128+n signal inference, bounded incremental output tails with `lossy` flags, SIGTERM→SIGKILL group escalation for `kill()`/abort, and spawn-failure/connection-lost settlement so `done` never hangs. 24 tests, 100% coverage.

## Risks

- **ssh2 is a pure-JS protocol implementation**; exotic `~/.ssh/config` features (e.g. `Match exec`, `Include`, `ControlMaster`) are out of scope and must fail loud, not silently mis-connect.
- **Agent protocol variance** (OpenSSH vs Pageant) may need platform-specific handling; Windows agent support is a follow-up, documented as a known limitation.
- **The `sftp()` handle type is provisional** until `fs-ssh` pins the adapter contract in M2; keeping it opaque now avoids a churny public type.

## Alternatives considered

- **System `ssh`/`sftp` binaries through `dsh-subprocess`**: rejected for M1 because subprocess-per-operation is slow without ControlMaster, the protocol tests would need a real sshd or brittle fixture scripting, and `ssh2`'s in-process `Server` gives deterministic protocol tests. The SD's pure policy layer keeps a binary-backed provider possible later without touching the contract.
- **Password auth (tool arg, credentials, or prompt)**: rejected by decision — agent and keys only; a passphrase-protected key without an agent fails loudly instead.
- **Hand-rolled config parser and host-key verification**: rejected per the dependencies-over-hand-rolling policy; `ssh-config` and `ssh2` are maintained, and the pure policy layer keeps the semantics unit-testable.
