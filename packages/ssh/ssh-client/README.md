---
description: "The ssh2-backed `ctx.ssh` provider for deployments connecting remote execution worlds and for maintainers debugging authentication, config resolution, and known_hosts behavior."
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-client

English | [中文](README.zh.md)

## Summary

Use `dsh-ssh-client` to give a composition working SSH connections: mount it once and `ctx.ssh` serves one connection per world through however many ProxyJump hops, authenticating with the agent and then your keys, never a password. `~/.ssh/config` is always consulted, a first connect learns the host key while a changed key is rejected, and each connected world exposes exec and SFTP channels for the fs and shell adapters. Choose it when a deployment must reach remote execution worlds from a standard `~/.ssh` setup.

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

Mount the provider as a `cordis.yml` row; it registers `ctx.ssh`, and the seam's consumers then open worlds over real ssh connections.

### When to choose it

Choose `dsh-ssh-client` for a deployment that must reach remote execution worlds from a standard `~/.ssh` setup. Choose [`ssh`](../ssh/README.md) for the seam contract itself, and [`ssh-worlds`](../ssh-worlds/README.md) when workspace places must resolve to those worlds.

### Minimal configuration

Every field is optional: `static Config` supplies the defaults, and the generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-ssh-client) is the exhaustive source for each one.

```yaml
- id: ssh-client
  name: '@deepseek-ai/dsh-ssh-client'
  config:
    # knownHostsPath: ~/.ssh/known_hosts   # known_hosts file for TOFU/strict checks
    # configPath: ~/.ssh/config            # ssh config file for alias resolution
    # homeDir: (os homedir)                # home directory for defaults
    # timeoutMs: 15000                     # default connect handshake timeout
    # strictHostKey: false                 # require a pre-existing known_hosts entry
    # defaultMaxOutputBytes: 64000         # combined exec capture ceiling
```

Unrecognized keys fail at plugin construction. `timeoutMs` and `defaultMaxOutputBytes` must be positive finite numbers.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the provider realizes the seam and points at the code that does it; the observable behavior is fully covered in [Use this package](#use-this-package).

### Behavior

- **Authentication, agent then keys, by default** — when `SSH_AUTH_SOCK` is set, the agent is tried first; then `IdentityFile` entries from `~/.ssh/config`; then the default keys (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`). Key files must be owner-only (`0600`; group/world-accessible keys are refused with a note), and a passphrase-protected or malformed key is skipped with an actionable note. There is **no password path anywhere** — a connect with nothing usable fails loudly naming exactly what was tried. The agent socket is contacted in-process; no agent state is written by us.
- **`~/.ssh/config` is always consulted** — aliases, `HostName`, `User`, `Port`, `IdentityFile`, and comma-separated `ProxyJump` chains resolve exactly like the system `ssh` for the covered cases; `Match exec` is never evaluated (untrusted config text must not run code).
- **known_hosts TOFU** — a first connect learns the host key (appended to `known_hosts`, best-effort); a changed key rejects the connection with `SSH_HOST_KEY_CHANGED`; `strictHostKey: true` rejects an unknown host with `SSH_UNKNOWN_HOST`.
- **ProxyJump** — one ssh connection per hop, each hop forwarding `direct-tcpip` to the next (or to the final host); hops authenticate with the same methods as the target. Hop failures map to the seam vocabulary.
- **Exec** — one remote command per channel with the caller's timeout/cancel, bounded combined capture, and exit-code/timed-out/aborted facts. A caller-initiated timeout or abort resolves immediately with the output captured so far (the remote may hold the channel open forever).
- **SFTP** — `sftp()` returns the branded handle whose session the later `fs-ssh` adapter consumes.
- **Disposal** — `disconnect`/service teardown ends the connection and every hop; double dispose is a no-op.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the provider to the seam it implements and the consumers it serves.

- [SSH subsystem](../../../docs/subsystems/ssh.md) — the exhaustive transport contract, target resolution, and known_hosts policy.
- [ssh](../ssh/README.md) — the Service Definition this provider implements.
- [ssh-worlds](../ssh-worlds/README.md) — the worlds provider that resolves an ssh place over this transport.
- [fs-ssh](../../fs/fs-ssh/README.md) — the filesystem backend that consumes the SFTP handle.
- [bash-ssh](../../shell/bash-ssh/README.md) — the shell executor that consumes `exec`.
- [SSH capability seam proposal](../../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.md) — why the Service Definition and its provider split.

-----

<a id="model-experience"></a>
## Model Experience

None, as this provider implements the transport contract only; the consuming fs and shell adapters and their tools own every model-visible rendering of captured output, exit codes, and timeout or abort facts.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this provider needs special operational care or is a poor fit. They are current package constraints, not a general SSH comparison or a task backlog.

- **No system-ssh parity for exotic config** — `Include`, `ControlMaster`, `Match exec`, and `%` tokens beyond `%d`/`%u`/`%h` are not honored; such config either fails loud or is ignored, never silently mis-applied.
- **No password auth, by decision** — a passphrase-protected key without an agent fails loudly; there is no credentials integration for passwords.
- **TOFU write is best-effort** — a read-only or unwritable `known_hosts` still lets the connection proceed (the entry lives in memory for the session); the next connect re-learns.
- **Windows agent support is untested** — `SSH_AUTH_SOCK` is POSIX; Pageant support exists in the underlying library but has no coverage here yet.
- **No reconnect** — a dropped connection closes the world; the caller owns reconnection policy.
- **SFTP handle session is opaque** — pinned by the `fs-ssh` adapter in a later phase.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The live-world registry is private provider state with no independent event stream for a check to compare; the `ssh/connect` and `ssh/disconnect` session events that would give it an observable relation arrive with the workspace/session binding phase.
