---
description: "The local provider for ctx.worlds: every local workspace place becomes one host world over dsh-fs-local and dsh-bash-local, for deployments that keep execution on the local machine."
kind: "package-reference"
---

# @deepseek-ai/dsh-worlds-local

English | [中文](README.zh.md)

## Summary

Resolve every local workspace place to one host world and keep its filesystem and shell backends out of the parent context. The provider composes `dsh-fs-local` and `dsh-bash-local` on a private child context for `fs` and `shell`, lazily on first use, and refcounts the world by id. Choose it for a mixed local/remote composition that mounts a router, or for any deployment that reaches `ctx.fs` and `ctx.shell` through `ctx.worlds`. An ssh place rejects loudly, so pair it with `dsh-ssh-worlds` when remote hosts are in play.

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

Local provider for the [`@deepseek-ai/dsh-worlds`](../worlds/README.md) execution-worlds service: every local workspace place resolves to one local world whose filesystem and shell backends are `dsh-fs-local` and `dsh-bash-local` instances. Consumers get that world from `ctx.worlds.resolve(...)` and use its `fs()` and `shell()` backends.

### When to choose it

Load as a plugin; it registers `ctx.worlds`. A non-local place (an ssh destination) rejects loudly: this provider owns no transport, and routing a remote place through it would silently run remote paths against the host filesystem. Choose this provider when every place in the deployment is local; mount `dsh-ssh-worlds` instead when the composition also serves ssh destinations.

### Minimal configuration

```ts
import type { Context } from '@deepseek-ai/cordis'
import { LocalWorlds } from '@deepseek-ai/dsh-worlds-local'

export function apply(ctx: Context): void {
  // registers `ctx.worlds`
  ctx.plugin(LocalWorlds, {
    fs: { cwd: '/srv/project' },
    shell: { cwd: '/srv/project' },
  })
}
```

| Field | Default | Meaning |
|---|---|---|
| `fs` | `{}` | Filesystem backend settings (see `dsh-fs-local`); `diffBasisMaxBytes` defaults to 10 MiB |
| `shell` | `{}` | Shell backend settings (see `dsh-bash-local`); timeout/spill/grace defaults match that provider |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-worlds-local) is the exhaustive source for every accepted field.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The provider is a thin composition layer: it resolves places, counts references, and lets the fs and shell providers own their own backends.

### Design concept

Each world composes its backends on a private child context derived from the mounting context, isolated for `fs` and `shell`. The child context keeps the backend service registrations from colliding with a router mounted on the parent context — a router implements `ctx.fs`/`ctx.shell`, so per-world backends cannot register those names on the same context. The child inherits the parent's other services, such as the subprocess provider the shell backend spawns with.

### Behavior

- **One local world** — all local places resolve to the same world (refcounted by id); `worlds()` lists it; `disconnect(id)` closes it.
- **Lazy backends** — `world.fs()` / `world.shell()` compose the backend on first use over the world's private child context; access after `dispose()` rejects.
- **Lifecycle** — composition disposal disposes the world and its child context; direct `dispose()` is idempotent.
- **Loud remote rejection** — resolving an ssh place throws a descriptive error rather than running remote paths locally.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `LocalWorlds` provider and `LocalWorld`: place resolution, refcounting, lazy backend composition |
**Runtime invariant:** No companion is published: the provider's lifecycle is the worlds service contract, so there is no separate observation to check.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the provider-level contract is not enough. They move from the contract to the sibling provider, the composed backends, and the router consumer.

- [Execution worlds subsystem](../../../docs/subsystems/worlds.md) — worlds, places, kinds, and the provider contract.
- [dsh-worlds](../worlds/README.md) — the contract this provider implements.
- [dsh-ssh-worlds](../../ssh/ssh-worlds/README.md) — the provider that serves ssh places.
- [dsh-fs-local](../../fs/fs-local/README.md) — the filesystem backend composed for each world.
- [dsh-bash-local](../../shell/bash-local/README.md) — the shell backend composed for each world.
- [dsh-fs-router](../../fs/fs-router/README.md) — the router consumer whose `ctx.fs` registration the child context avoids colliding with.

-----

<a id="model-experience"></a>
## Model Experience

### Local host world backends

#### What the model sees

No prompt text, tool schema, or session event. A model reaches the local backends indirectly through their consumers (`dsh-tool-fs`, `dsh-tool-bash`), which render file bodies, mutation acknowledgements, and command transcripts from whatever the world composes.

#### Token effect

Zero tokens from this package. A model pays only for what those consumers emit for a call routed to the local world, such as a `read` result body or a capped bash transcript.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when this provider is a poor fit. They are current package constraints, not a task backlog.

- **Local places only** — an ssh place requires a transport-aware provider such as [`dsh-ssh-worlds`](../../ssh/ssh-worlds/README.md); this provider rejects remote places loudly.
- **One local world per composition** — distinct local places share the single local world; per-place backends are not composed (they would be identical host backends).

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
