---
description: "The execution-worlds provider that resolves an ssh workspace place into a remote world, for deployments routing session work to remote hosts and for maintainers debugging world lifetime and backend composition."
kind: "package-reference"
---

# @deepseek-ai/dsh-ssh-worlds

English | [中文](README.zh.md)

## Summary

Use `dsh-ssh-worlds` to run a session's work on a remote host: an ssh workspace place resolves to one world whose transport is a connected `dsh-ssh` world, and whose filesystem and shell backends are `dsh-fs-ssh` and `dsh-bash-ssh` instances composed over it. Worlds are refcounted by `user@host:port`, so resolving the same destination again reuses the ready world, and disconnecting closes the transport and its backends. Choose it when a deployment already mounts `dsh-worlds` and a `ctx.ssh` provider; a local place rejects loudly.

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

Mount this provider when a composition needs workspace places to run on remote hosts; it registers `ctx.worlds` (one implementation per context) and requires a loaded `ctx.ssh` provider.

### When to choose it

Choose `dsh-ssh-worlds` when a deployment already mounts [`worlds`](../../worlds/worlds/README.md) and an SSH provider such as [`ssh-client`](../ssh-client/README.md). A local place needs a local worlds provider: routing one through this provider would attempt an ssh connection for a host directory, so it is rejected.

### Minimal configuration

Load the provider as a plugin and pass the connect options the transport should use; both are optional and default to the `ctx.ssh` provider's own values.

```ts
import type { Context } from '@deepseek-ai/cordis'
import { SshWorlds } from '@deepseek-ai/dsh-ssh-worlds'

export function apply(ctx: Context): void {
  // registers `ctx.worlds` (requires `ctx.ssh`)
  ctx.plugin(SshWorlds, {
    connectTimeoutMs: 15000,
    strictHostKey: false,
  })
}
```

| Option | Default | Meaning |
|---|---|---|
| `connectTimeoutMs` | `ctx.ssh` default | connect handshake timeout, passed to `ctx.ssh.connect` |
| `strictHostKey` | `ctx.ssh` default | require a pre-existing known_hosts entry, passed to `ctx.ssh.connect` |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-ssh-worlds) is the exhaustive source for every accepted option.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how a place becomes a world and points at the code that does it; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

Each resolved world owns an isolated child context for its fs and shell registrations, so a router mounted on the parent scope cannot collide with them, and it composes both backends lazily over the one transport it connected. A resolve records the session's entry into that world as a log-only session event.

### Behavior

- **One world per target** — an ssh place resolves to one world, refcounted by `user@host:port`; a ready world is reused, a disposed one is reconnected.
- **Remote backends** — `world.fs()` / `world.shell()` compose `SshFileSystem` and `SshBashExecutor` over the transport on first use. A resolve `path` (the workspace's remote working path) becomes the backends' default `cwd`; without one they use the transport's default. `world.ssh()` exposes the transport itself for transport-specific verbs (`exec`, `sftp`, `pty`).
- **Lifecycle** — `disconnect(id)` closes the transport; composition disposal disposes every live world.
- **Loud local rejection** — resolving a local place (or a place-less, session-less resolve, which defaults to local) throws a descriptive error.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the provider to the services it bridges and the backends it composes.

- [SSH subsystem](../../../docs/subsystems/ssh.md) — the exhaustive transport contract, target resolution, and known_hosts policy.
- [Worlds subsystem](../../../docs/subsystems/worlds.md) — the execution-world contract this provider implements.
- [ssh](../ssh/README.md) — the transport seam the world is built on.
- [ssh-client](../ssh-client/README.md) — the ssh2 provider that connects that transport.
- [fs-ssh](../../fs/fs-ssh/README.md) — the filesystem backend composed over the world.
- [bash-ssh](../../shell/bash-ssh/README.md) — the shell executor composed over the world.

-----

<a id="model-experience"></a>
## Model Experience

None, as this provider connects worlds and composes their backends only, appending log-only `ssh/connect` and `ssh/disconnect` events; the `fs-ssh` and `bash-ssh` consumers (`dsh-tool-fs`, `dsh-tool-bash`) own every model-visible rendering of remote file and command work.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this provider is a poor fit or needs special operational care. They are current package constraints, not a general SSH comparison or a task backlog.

- **SSH places only** — a local place requires a local worlds provider; this provider rejects local places loudly.
- **A resolve without a session logs nothing** — entry into a remote world is appended as `ssh/connect` only when the resolve carries the caller's `Session` (mirrored by `ssh/disconnect` when that world closes); resolving without one connects the world with no session-log entry.
- **Port-less places connect to 22** — the ssh transport's default; untestable against the in-process random-port fixture.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The provider maps ssh places to connected worlds, the connection lifecycle belongs to the SSH transport seam, and the fs/shell composition is delegated to the adapters.
