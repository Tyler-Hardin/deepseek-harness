# @deepseek-ai/dsh-worlds-local

English | [中文](README.zh.md)

Local provider for the [`@deepseek-ai/dsh-worlds`](../worlds/README.md) execution-worlds service: local workspace places resolve to one local world whose filesystem and shell backends are `dsh-fs-local` and `dsh-bash-local` instances composed on a private child context. The child context keeps the backend service registrations from colliding with a router mounted on the parent context — a router implements `ctx.fs`/`ctx.shell`, so per-world backends cannot register those names on the same context.

Load as a plugin; it registers `ctx.worlds`. A non-local place (an ssh destination) rejects loudly: this provider owns no transport, and routing a remote place through it would silently run remote paths against the host filesystem.

## Usage

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

| Option | Default | Meaning |
|---|---|---|
| `fs` | `{}` | Filesystem backend settings (see `dsh-fs-local`); `diffBasisMaxBytes` defaults to 10 MiB |
| `shell` | `{}` | Shell backend settings (see `dsh-bash-local`); timeout/spill/grace defaults match that provider |

## Behavior

- **One local world** — all local places resolve to the same world (refcounted by id); `worlds()` lists it; `disconnect(id)` closes it.
- **Lazy backends** — `world.fs()` / `world.shell()` compose the backend on first use over the world's private child context; access after `dispose()` rejects.
- **Lifecycle** — composition disposal disposes the world and its child context; direct `dispose()` is idempotent.
- **Loud remote rejection** — resolving an ssh place throws a descriptive error rather than running remote paths locally.

## Model Experience

Indirectly, through the local backends' consumers (`dsh-tool-fs`, `dsh-tool-bash`); this provider registers no tools, injects no prompts, and writes no session events.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Local places only** — an ssh place requires a transport-aware worlds provider (the ssh worlds provider in a later phase); this provider rejects remote places loudly.
- **One local world per composition** — distinct local places share the single local world; per-place backends are not composed (they would be identical host backends).
