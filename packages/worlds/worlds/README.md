# @deepseek-ai/dsh-worlds

English | [中文](README.zh.md)

Execution-worlds Service Definition for the DeepSeek Harness: one world is one coherent execution environment — a local directory tree, or a remote host reached through a transport — with per-world filesystem and shell backends composed over it. The `ctx.worlds` service resolves the world for a session (or a workspace place), owns world lifecycles, and exposes the per-world fs/shell backends that router providers dispatch seam calls to.

Remote-ness lives in the workspace definition: a workspace's `place` (from [`@deepseek-ai/dsh-workspace`](../../workspace/workspace/README.md)) says whether it is local or an ssh destination, and this package turns that place into a world. Local-only deployments never mount a router, so `ctx.worlds` is optional infrastructure for mixed local/remote compositions — the default composition is unchanged.

## Usage

```ts
import { Worlds, type World, type WorldId, type WorldsResolveRequest } from '@deepseek-ai/dsh-worlds'

// subclass and load as a plugin (registers `ctx.worlds`)
class MyWorlds extends Worlds {
  async resolve(request?: WorldsResolveRequest): Promise<World> {
    // local places resolve to the local world; remote places connect one
    return { kind: 'local' } as unknown as World
  }
  worlds(): readonly World[] { return [] }
  get(_worldId: WorldId): World | undefined { return undefined }
  async disconnect(_worldId: WorldId): Promise<void> {}
}
```

## Shape

- `WorldId` / `WorldId(id)` — opaque branded identity of one execution world; the owning service maps ids to worlds.
- `WorldKind` — `'local' | 'ssh'`; `worldKindOf(place)` is the pure place→kind policy providers and routers share.
- `World` (abstract) — `id`, `kind`, `place`, `status()` (`'ready' | 'closed'`), and lazy `fs()` / `shell()` backend accessors. A world is the composition root for its backends: the filesystem backend serves exactly this world's path namespace, the shell backend exactly its process namespace. Consumers never use a backend across worlds. Remote worlds additionally expose their ssh transport through an optional `ssh()` accessor for transport-specific verbs (`exec`, `sftp`, `pty`); local worlds leave it absent.
- `Worlds` (abstract service) — `resolve({ session?, place? })` resolves the session's workspace place (or an explicit place) to a world, connecting a remote world on first resolve and refcounting by id; `worlds()` lists live worlds; `disconnect(worldId)` closes one. Disposal of the service disposes every live world.

## Model Experience

Indirectly, through the router providers (`dsh-fs-router` / `dsh-shell-router`), which dispatch seam calls to the resolved world's backends. This package registers no tools, injects no prompts, and writes no session events.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Contract-only** — this package declares the world vocabulary and lifecycle; the actual world implementations (local, ssh) live in providers (`dsh-worlds-local`, and the transport-specific ssh provider in a later phase).
- **No session event emission** — world connect/disconnect lifecycle events (`ssh/connect`, `ssh/disconnect`) belong to the session-binding phase, which emits them from the provider that owns the transport.
- **Backends are lazy and provider-composed** — a world's `fs()`/`shell()` may connect on first use; consumers must not cache a backend across worlds or reuse it after `dispose()`.
