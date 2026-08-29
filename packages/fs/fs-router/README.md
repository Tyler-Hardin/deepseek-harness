# @deepseek-ai/dsh-fs-router

English | [中文](README.zh.md)

Filesystem router provider: implements the `ctx.fs` seam and dispatches each call to the filesystem backend of the world the caller named. `resolve` reads the caller's opaque execution-world identity (`opts.world`), resolves that world's backend through [`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.md), and prefixes the target key with the world id so every later operation routes without re-resolving. A call without a world identity routes to the local world.

Local-only deployments never mount this provider: the default composition keeps the direct local backend. This router is opt-in infrastructure for mixed local/remote compositions.

## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import { FsRouter } from '@deepseek-ai/dsh-fs-router'

export function apply(ctx: Context): void {
  // registers `ctx.fs` (requires `ctx.worlds`)
  ctx.plugin(FsRouter)
}
```

## Behavior

- **World-prefixed target keys** — `resolve(path, { world })` resolves the named world's backend and returns a target whose key is `world:<id>:<backendKey>`; every operation on that target routes to the same world without re-resolving.
- **Local default** — a call without `world` routes to the local world; the tool layer resolves `world(session)` per session and passes it.
- **Synchronous identity helpers** — `processPath` / `fileUrl` / `contains` stay synchronous by reading a world→backend cache that `resolve()` populates; a target whose world was never resolved here refuses loudly, and cross-world containment is always false.
- **Full seam delegation** — `stat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText`, `editText`, and `lstat` delegate to the routed world's backend with the seam's exact semantics.

## Model Experience

Indirectly, through `dsh-tool-fs`, which renders the routed backend's output; this provider registers no tools or prompts of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Local-only deployments should not mount it** — the router adds a dispatch hop; the default composition keeps the direct local backend for zero behavior change.
- **World ids must be resolved before use** — a target key names a world the router must have resolved in this process; a foreign id refuses loudly rather than guessing.
- **`lstat` is path-shaped and routes to the local world** — the seam's lstat carries no world identity; the path is interpreted in the caller's (local) world.
