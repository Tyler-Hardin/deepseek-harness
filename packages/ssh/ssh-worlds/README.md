# @deepseek-ai/dsh-ssh-worlds

English | [中文](README.zh.md)

SSH provider for the [`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.md) execution-worlds service: an ssh workspace place resolves to a remote world whose transport is one connected [`@deepseek-ai/dsh-ssh`](../ssh/README.md) world and whose filesystem and shell backends are `dsh-fs-ssh` and `dsh-bash-ssh` instances composed over it. A local place rejects loudly — routing a local place through this provider would attempt an ssh connection for a host directory.

Load as a plugin; it registers `ctx.worlds`. Worlds are refcounted by target: resolving the same ssh destination again returns the ready world without reconnecting; disconnecting closes the transport and its backends.

## Usage

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

## Behavior

- **One world per target** — an ssh place resolves to one world, refcounted by `user@host:port`; a ready world is reused, a disposed one is reconnected.
- **Remote backends** — `world.fs()` / `world.shell()` compose `SshFileSystem` and `SshBashExecutor` over the transport on first use. A resolve `path` (the workspace's remote working path) becomes the backends' default `cwd`; without one they use the transport's default. `world.ssh()` exposes the transport itself for transport-specific verbs (`exec`, `sftp`, `pty`).
- **Lifecycle** — `disconnect(id)` closes the transport; composition disposal disposes every live world.
- **Loud local rejection** — resolving a local place (or a place-less, session-less resolve, which defaults to local) throws a descriptive error.

## Model Experience

Indirectly, through the composed fs/shell backends' consumers (`dsh-tool-fs`, `dsh-tool-bash`); this provider registers no tools, injects no prompts, and writes no session events.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **SSH places only** — a local place requires a local worlds provider; this provider rejects local places loudly.
- **No session binding** — resolving happens per call; connect/disconnect session events (`ssh/connect`, `ssh/disconnect`) and session-header world freezing belong to the session-binding phase.
- **Port-less places connect to 22** — the ssh transport's default; untestable against the in-process random-port fixture.
