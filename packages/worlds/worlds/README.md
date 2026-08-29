---
description: "The execution-worlds Service Definition: per-session world resolution over workspace places, for plugin authors and maintainers composing local and remote worlds."
kind: "package-reference"
---

# @deepseek-ai/dsh-worlds

English | [中文](README.zh.md)

## Summary

Subclass `Worlds` to give one composition a coherent execution environment for every workspace place. The service resolves the world for a session or an explicit place, connects a remote world on first resolve, refcounts worlds by id, owns their lifecycles, and exposes each world's filesystem and shell backends so router providers dispatch capability calls to the right environment. Choose it when consumers must reach local and remote worlds through one seam, `dsh-worlds-local` when every place is local, or `dsh-ssh-worlds` for remote hosts.

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

Load a provider, because this package ships none: mount [`dsh-worlds-local`](../worlds-local/README.md) for host places or [`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.md) for remote ones. Consumers then call `ctx.worlds.resolve({ session, path })` and use the returned world's `fs()` and `shell()` backends instead of assuming one global filesystem and shell.

### When to choose it

Remote-ness lives in the workspace definition: a workspace's `place` (from [`@deepseek-ai/dsh-workspace`](../../workspace/workspace/README.md)) says whether it is local or an ssh destination, and this package turns that place into a world. Local-only deployments never mount a router, so `ctx.worlds` is optional infrastructure for mixed local/remote compositions — the default composition is unchanged. Choose it when more than one place must be served at once.

### Loading a provider

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

This package declares no configuration of its own; a deployment configures the provider it mounts.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is a contract rather than an implementation: it declares the world vocabulary, the place→kind policy, and the lifecycle every provider honors, while each live world and its refcounts belong to the mounted provider.

### Design concept

A world is the composition root for its backends — the filesystem backend serves exactly that world's path namespace and the shell backend exactly its process namespace — so a consumer that resolved a world never needs to know which provider supplies it, and never uses a backend across worlds. Providers connect their environment before publishing a world, so backend composition is synchronous once a world exists.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `World`, `Worlds`, `WorldId`, `WorldKind`, `worldKindOf`, `WorldsResolveRequest` |
**Runtime invariant:** No companion is published: the mounted provider owns live-world state, so this Service Definition has no independent observation to cross-check.

### Service surface

- `WorldId` / `WorldId(id)` — opaque branded identity of one execution world; the owning service maps ids to worlds.
- `WorldKind` — `'local' | 'ssh'`; `worldKindOf(place)` is the pure place→kind policy providers and routers share.
- `World` (abstract) — `id`, `kind`, `place`, `status()` (`'ready' | 'closed'`), and lazy `fs()` / `shell()` backend accessors. A world is the composition root for its backends: the filesystem backend serves exactly this world's path namespace, the shell backend exactly its process namespace. Consumers never use a backend across worlds. Remote worlds additionally expose their ssh transport through an optional `ssh()` accessor for transport-specific verbs (`exec`, `sftp`, `pty`); local worlds leave it absent.
- `Worlds` (abstract service) — `resolve({ session?, place? })` resolves the session's workspace place (or an explicit place) to a world, connecting a remote world on first resolve and refcounting by id; `worlds()` lists live worlds; `disconnect(worldId)` closes one. Disposal of the service disposes every live world.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the contract to the providers, the place vocabulary, and the router consumers.

- [Execution worlds subsystem](../../../docs/subsystems/worlds.md) — the shared vocabulary, resolution rules, and world lifecycle.
- [worlds-local](../worlds-local/README.md) — the local provider for host places.
- [dsh-ssh-worlds](../../ssh/ssh-worlds/README.md) — the provider that connects a remote host over ssh.
- [dsh-workspace](../../workspace/workspace/README.md) — the workspace place this service resolves.
- [dsh-ssh](../../ssh/ssh/README.md) — the transport a remote world runs over.
- [dsh-fs-router](../../fs/fs-router/README.md) — the consumer that routes `ctx.fs` calls to the resolved world.

-----

<a id="model-experience"></a>
## Model Experience

### Resolved execution worlds

#### What the model sees

No prompt text, tool schema, or session event. A model reaches worlds indirectly through the router providers (`dsh-fs-router` / `dsh-shell-router`), which dispatch each capability call to the resolved world's backends, and the consuming tools render whatever those backends return.

#### Token effect

Zero tokens from this package. A model pays only for what the resolved backends' consumers emit, such as a file body returned by `dsh-tool-fs` or a command transcript returned by `dsh-tool-bash`.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this contract alone is not enough. They are current package constraints, not a task backlog.

- **Contract-only** — this package declares the world vocabulary and lifecycle; the world implementations live in providers: [`dsh-worlds-local`](../worlds-local/README.md) for host places and [`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.md) for remote hosts.
- **No session event emission** — this package writes no session events; the provider that owns the transport records the world connect/disconnect events (`ssh/connect`, `ssh/disconnect`) from its session binding.
- **Backends are lazy and provider-composed** — a world's `fs()`/`shell()` may connect on first use; consumers must not cache a backend across worlds or reuse it after `dispose()`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
