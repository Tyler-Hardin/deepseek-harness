# @deepseek-ai/dsh-ssh

English | [中文](README.zh.md)

The **`SshService`** (`ctx.ssh`) defines the SSH transport seam: connect to a remote execution world with agent-then-keys authentication, resolve `~/.ssh/config` (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), enforce known_hosts policy (TOFU with changed-key rejection), and expose exec + SFTP channels. It says nothing about workspaces, sessions, or tools — the workspace/`worlds` binding and the `fs-ssh`/`bash-ssh` adapters are later phases that consume this seam.

This package owns the Service Definition role of the SSH capability, split so each role can evolve (and swap) independently:

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-ssh` (this) | Service Definition: world descriptor + connection lifecycle + channel verbs + pure config/known_hosts/auth-order policy |
| `@deepseek-ai/dsh-ssh-client` | Service Provider: ssh2-backed connections (agent/keys only, ProxyJump, TOFU) |

## Service API (`ctx.ssh`)

A backend subclasses `SshService` and implements the abstract members.

| Member | Semantics |
|---|---|
| `connect(target, opts?)` | Connect to a target (`SshTarget`: host alias, explicit user/port, remote path) and return a live `SshWorld`. Rejects with an `SshError`; authentication tries the agent first, then the resolved identity files, and never a password. |
| `worlds()` | Every live, not-yet-disposed world. |
| `disconnect(worldId)` | Close a world; unknown ids resolve without error. |
| `SshWorld.exec(command, opts?)` | Run one remote command and capture bounded stdout/stderr, exit code, timeout/abort facts. |
| `SshWorld.sftp()` | Open the world's SFTP session handle (provisional until `fs-ssh` pins its contract). |
| `SshWorld.dispose()` | Close the connection (idempotent). |

A host composes exactly one provider of `ctx.ssh` (mounting two fails loud on the duplicate service registration), matching the one-provider-per-seam rule every capability seam follows.

## Pure policy (socket-free, unit-tested)

- `parseSshDestination('[user@]host[:port]')` — destination splitting, bracket IPv6 support.
- `resolveSshConfig(alias, configText, homeDir, opts)` — `~/.ssh/config` resolution via the maintained `ssh-config` parser with OpenSSH first-match-wins semantics and `Match exec` evaluation disabled; `HostName`/`Port`/`User` override the destination, `IdentityFile` entries are collected and `~`/`%d`/`%u`/`%h` expanded, and the comma-separated `ProxyJump` chain is parsed (`none` filtered).
- `defaultIdentityFiles(homeDir)` — `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`.
- `selectAuthMethods({ agentSocket, identityFiles })` — the agent-then-keys auth order; there is deliberately no password variant in the type.
- `parseKnownHosts` / `checkHostKey` / `learnKnownHostLine` / `hostKeyAlgorithmFromBlob` / `loadKnownHosts` — the known_hosts policy: TOFU learn, changed-key rejection, optional strict mode (unknown host rejects). Hashed entries are not matched (documented limitation).

## Vocabulary

`SshTarget` is the remote half of a workspace place; `SshWorldId` is a branded opaque id ([branded-ids Agent Note](../../../.agents/notes/implemented/architecture/2026-06-20-branded-ids.md)); `ResolvedSshHost` is the concrete connection target after config resolution; `SshExecResult` carries bounded output and settlement facts; `SshError` carries a stable code (`SSH_AUTH_FAILED`, `SSH_HOST_KEY_CHANGED`, `SSH_UNKNOWN_HOST`, `SSH_CONFIG_ERROR`, `SSH_CONNECT_ERROR`, `SSH_TIMEOUT`, `SSH_ABORTED`). `SshError` deliberately re-implements the `HarnessError` shape instead of extending it: the base lives in `@deepseek-ai/dsh-llm`, and a transport seam must not depend on the LLM capability. See `src/types.ts` for the full contracts.

## Model Experience

Indirectly, through the future `fs-ssh`/`bash-ssh` adapters and their consumers; this seam registers no prompt, schema, or result of its own.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

- **Hashed known_hosts entries are not matched** — `|1|...` lines parse to nothing, so a host whose only entry is hashed is treated as unknown (TOFU re-learns it).
- **One level of ProxyJump nesting** — a hop's own `ProxyJump` config is not followed; only the chain named on the final target is used (matches OpenSSH's common case).
- **`Match` blocks with `exec` criteria never apply** — `matchExec: false` disables shell evaluation of untrusted config text; such blocks are skipped.
- **The `sftp()` handle is provisional** — its contract is pinned when `fs-ssh` lands; consumers must not interpret the session inside it.
- **No reconnect** — a dropped connection closes the world; reconnection is the caller's concern.
- **Session events are not emitted here** — `ssh/connect`/`ssh/disconnect` session events land with the workspace/session binding phase, which also owns the model-visible ⟺ logged requirement.
