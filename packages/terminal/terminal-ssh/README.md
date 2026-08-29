---
description: "The ssh terminal backend for ctx.terminals: persistent remote PTY sessions over one ssh world's pty channel, for deployments whose workspaces live on remote hosts."
kind: "package-reference"
---

# @deepseek-ai/dsh-terminal-ssh

English | [中文](README.zh.md)

## Summary

Keep an interactive shell alive on a remote host across tool calls. The backend opens the account's login shell through one ssh world's pty channel (`SshWorld.pty`), retains bounded line-oriented output, and drives readiness, signalling, and teardown on that channel, so a session whose workspace lives over ssh gets a persistent shell in the same world its filesystem and bash tools use. Choose it with an ssh worlds provider and `dsh-tool-terminal`; readiness is silence-based, so a silent long-running command settles early.

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

Persistent remote shell backend for `ctx.terminals` over one ssh world's pty channel. It opens the account's login shell with a remote pseudo-terminal through `@deepseek-ai/dsh-ssh` (`SshWorld.pty`), retains bounded line-oriented output, and drives readiness, signalling, and teardown directly on the channel. Sessions opened this way run in the session's remote execution world, so an agent whose workspace lives over ssh gets a persistent interactive shell in the same world its filesystem and bash tools use.

### When to choose it

Load as a plugin; it registers the configured backend type on `ctx.terminals`. Choose it when the session's world is an ssh world and `ctx.worlds` is mounted; use [`terminal-bash`](../terminal-bash/README.md) for local interactive shells. A PTY consumer such as [`tool-terminal`](../tool-terminal/README.md) is required for a model to reach these sessions at all.

### Minimal configuration

```yaml
- name: '@deepseek-ai/dsh-terminal-ssh'
  config:
    idleSilenceMs: 300
```

| Field | Default | Meaning |
|---|---|---|
| `backendType` | `ssh` | Backend type registered under `ctx.terminals` |
| `idleSilenceMs` | `300` | Output silence, in milliseconds, that settles a send |
| `startupTimeoutMs` | `10000` | Boot-to-readiness timeout in milliseconds |
| `sendTimeoutMs` | `120000` | Per-send settle timeout in milliseconds |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-terminal-ssh) is the exhaustive source for every accepted field, including the read, scrollback, and viewport bounds.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Plugin wiring

The plugin injects `pty` and `worlds`, then registers the configured backend type (`ssh`). At spawn it resolves the owner's session world through `ctx.worlds.resolve({ session, path })` and rejects a non-ssh world loudly — routing a local session here would try to open a PTY on a transport the world does not own. The backend opens `world.pty({ rows, cols })`, which launches the login shell; when a working path is known (the spawn `cwd`, else the session header `cwd`), the boot line `cd <path>` runs before readiness so the shell starts in the workspace path, and the same path is passed to the world as its backend default. `startupTimeoutMs` bounds the boot-to-readiness wait and `sendTimeoutMs` bounds every later send.

### Readiness and teardown

Readiness is silence-based: a send settles when output has been quiet for `idleSilenceMs` after at least one output event, or immediately on remote exit or close; startup additionally requires observed output, so zero-output silence cannot publish an empty session. The ssh transport exposes no foreground process-group introspection, so there is no prompt-marker or stdin-wait tier like the local backend's. `SIGINT` and `SIGTSTP` write their terminal control bytes to the channel; `SIGTERM`, `SIGKILL`, and `SIGHUP` have no control byte, so the backend closes the channel, terminating the remote shell and its children. `close` ends the channel, settles the active send as `session_exit`, and awaits quiescence before resolving; a transport failure fails the active send and surfaces the first failure through `close`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the backend-level contract is not enough. They move from the contract to the session service, the sibling backend, and the transport.

- [Terminal subsystem](../../../docs/subsystems/terminal.md) — session ids, backend contracts, send readiness, and bounded reads.
- [dsh-terminal](../../terminal/README.md) — the `ctx.terminals` contract this backend registers on.
- [dsh-terminal-bash](../terminal-bash/README.md) — the local interactive backend.
- [dsh-tool-terminal](../tool-terminal/README.md) — the model-facing consumer of these sessions.
- [dsh-ssh](../../ssh/ssh/README.md) — the transport whose pty channel this backend drives.
- [dsh-worlds](../../worlds/worlds/README.md) — the service that resolves the session's ssh world.

-----

<a id="model-experience"></a>
## Model Experience

### Remote PTY sessions

#### What the model sees

No prompt text or tool schema of its own. A model reaches these sessions through `dsh-tool-terminal` or another PTY consumer, which renders the bounded MOTD, send deltas, scrollback pages, and cleanup errors this backend produces.

#### Token effect

Zero tokens from this package. A model pays only for what that consumer returns, such as a send delta or a scrollback page bounded by `maxReadBytes` and `scrollbackLines`.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this backend is a poor fit. They are current package constraints, not a task backlog.

**Runtime invariant:** No companion is published: the backend registers a terminal backend on `ctx.terminals` and owns no independently observable data relationship of its own.

- **Login shell only** — the SSH protocol's shell request has no shell or directory parameter, so the backend always launches the account's login shell and starts an explicit `cd` for a working path; selecting a different remote shell is unsupported.
- **Silence-based readiness only** — with no remote foreground-process introspection, a send settles on output silence; a long-running command that prints nothing settles early (the model can poll scrollback), and there is no prompt-marker tier even on bash remotes.
- **Coarse signals** — `SIGTERM`/`SIGKILL`/`SIGHUP` close the channel instead of delivering the named signal, and no remote process group is ever identified (`targetPgid` is `0`).
- **POSIX shell required** — the boot `cd` line assumes a POSIX login shell on the remote.
- **Sessions do not survive harness process exit.**

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
