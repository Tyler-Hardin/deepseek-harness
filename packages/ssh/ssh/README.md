---
description: "The `ctx.ssh` Service Definition for provider authors implementing remote SSH execution worlds and for maintainers reviewing the transport seam."
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh

English | [中文](README.zh.md)

## Summary

Use `dsh-ssh` to describe and open remote execution worlds over SSH: connect to a target with agent-then-keys authentication, resolve `~/.ssh/config` (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), enforce known_hosts policy (TOFU with changed-key rejection), and reach exec plus SFTP channels. Choose it for the `ctx.ssh` contract itself, for the pure config/known_hosts/auth-order helpers, or as the base a provider subclasses. It says nothing about workspaces, sessions, or tools.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Subclass `SshService`, implement the abstract members, and load the subclass as a plugin: it registers `ctx.ssh`, and one live world per connected target serves the exec and SFTP work a consumer asks for.

### When to choose it

Choose `dsh-ssh` for the seam contract itself, for the pure policy helpers, or as the base a provider subclasses. Choose [`ssh-client`](../ssh-client/README.md) when a composition needs a working ssh2 provider. This package says nothing about workspaces, sessions, or tools: the workspace/`worlds` binding and the `fs-ssh`/`bash-ssh` adapters are later phases that consume this seam.

This package owns the Service Definition role of the SSH capability, split so each role can evolve (and swap) independently:

| Package | Role |
|---|---|
| `@deepseek-ai/dsh-ssh` (this) | Service Definition: world descriptor + connection lifecycle + channel verbs + pure config/known_hosts/auth-order policy |
| `@deepseek-ai/dsh-ssh-client` | Service Provider: ssh2-backed connections (agent/keys only, ProxyJump, TOFU) |

### Service API (`ctx.ssh`)

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

### Vocabulary

`SshTarget` is the remote half of a workspace place; `SshWorldId` is a branded opaque id ([branded-ids Agent Note](../../../.agents/notes/archived/architecture/2026-06-20-branded-ids.md)); `ResolvedSshHost` is the concrete connection target after config resolution; `SshExecResult` carries bounded output and settlement facts; `SshError` carries a stable code (`SSH_AUTH_FAILED`, `SSH_HOST_KEY_CHANGED`, `SSH_UNKNOWN_HOST`, `SSH_CONFIG_ERROR`, `SSH_CONNECT_ERROR`, `SSH_TIMEOUT`, `SSH_ABORTED`). `SshError` deliberately re-implements the `HarnessError` shape instead of extending it: the base lives in `@deepseek-ai/dsh-llm`, and a transport seam must not depend on the LLM capability. See `src/types.ts` for the full contracts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the split between the seam and its provider and points at the code that realizes it; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

The seam owns the decisions that need no socket — destination splitting, `~/.ssh/config` resolution, identity-file selection, authentication order, and the known_hosts verdict — as pure functions. A provider subclasses `SshService`, calls those functions, and owns everything that touches the network: hop forwarding, key material, channel capture, and disposal.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service wiring: `SshService`, `SshWorld`, and the abstract verbs |
| [`src/config.ts`](src/config.ts) | Destination and `~/.ssh/config` resolution, identity files, auth order |
| [`src/known-hosts.ts`](src/known-hosts.ts) | known_hosts parsing, host-key verdicts, TOFU line learning |
| [`src/error.ts`](src/error.ts) | `SshError` and its stable codes |
| [`src/types.ts`](src/types.ts) | Target, world, exec, SFTP, and PTY contracts |

### Pure policy (socket-free, unit-tested)

- `parseSshDestination('[user@]host[:port]')` — destination splitting, bracket IPv6 support.
- `resolveSshConfig(alias, configText, homeDir, opts)` — `~/.ssh/config` resolution via the maintained `ssh-config` parser with OpenSSH first-match-wins semantics and `Match exec` evaluation disabled; `HostName`/`Port`/`User` override the destination, `IdentityFile` entries are collected and `~`/`%d`/`%u`/`%h` expanded, and the comma-separated `ProxyJump` chain is parsed (`none` filtered).
- `defaultIdentityFiles(homeDir)` — `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`.
- `selectAuthMethods({ agentSocket, identityFiles })` — the agent-then-keys auth order; there is deliberately no password variant in the type.
- `parseKnownHosts` / `checkHostKey` / `learnKnownHostLine` / `hostKeyAlgorithmFromBlob` / `loadKnownHosts` — the known_hosts policy: TOFU learn, changed-key rejection, optional strict mode (unknown host rejects). Hashed entries are not matched (documented limitation).

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the seam to its provider, its consumers, and the proposals that shaped it.

- [SSH subsystem](../../../docs/subsystems/ssh.md) — the exhaustive transport contract, target resolution, and known_hosts policy.
- [ssh-client](../ssh-client/README.md) — the ssh2-backed provider that implements this seam.
- [ssh-worlds](../ssh-worlds/README.md) — the worlds provider that resolves an ssh place into a remote world.
- [fs-ssh](../../fs/fs-ssh/README.md) — the filesystem backend over a connected ssh world.
- [bash-ssh](../../shell/bash-ssh/README.md) — the shell executor over a connected ssh world.
- [SSH capability seam proposal](../../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.md) — why the Service Definition and its provider split.

-----

<a id="model-experience"></a>
## Model Experience

None, as this seam opens connections and channels only; the `fs-ssh` and `bash-ssh` adapters and their consumers own every model-visible rendering of a remote command's output or exit facts.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this seam is a poor fit or leaves work to its provider. They are current package constraints, not a general SSH comparison or a task backlog.

- **Hashed known_hosts entries are not matched** — `|1|...` lines parse to nothing, so a host whose only entry is hashed is treated as unknown (TOFU re-learns it).
- **One level of ProxyJump nesting** — a hop's own `ProxyJump` config is not followed; only the chain named on the final target is used (matches OpenSSH's common case).
- **`Match` blocks with `exec` criteria never apply** — `matchExec: false` disables shell evaluation of untrusted config text; such blocks are skipped.
- **The `sftp()` handle is provisional** — its contract is pinned when `fs-ssh` lands; consumers must not interpret the session inside it.
- **No reconnect** — a dropped connection closes the world; reconnection is the caller's concern.
- **Session events are not emitted here** — this seam appends no session event of its own; the `ssh-worlds` provider appends `ssh/connect`/`ssh/disconnect` when a session enters or leaves a remote world.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This stateless Service Definition owns types and pure policy functions, and the live-world registry is provider-owned state with no independent event stream for a check to compare.
