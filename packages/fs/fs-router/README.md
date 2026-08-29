---
description: "The execution-world router for ctx.fs, for deployments and maintainers composing mixed local and remote filesystem backends."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-router

English | [中文](README.zh.md)

## Summary

Use `dsh-fs-router` when one composition must serve files from more than one execution world. It implements the `ctx.fs` seam and dispatches each call to the backend of the world the caller named: `resolve` reads the caller's opaque world identity, resolves that world through `dsh-worlds`, and prefixes the target key with the world id so every later operation routes without re-resolving. A call naming no world routes to the local world. Local-only deployments keep the direct local backend; mount this router only for mixed local and remote compositions.

## Table of Contents

- [Usage](#usage)
- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="usage"></a>
## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import { FsRouter } from '@deepseek-ai/dsh-fs-router'

export function apply(ctx: Context): void {
  // registers `ctx.fs` (requires `ctx.worlds`)
  ctx.plugin(FsRouter)
}
```

-----

<a id="behavior"></a>
## Behavior

- **World-prefixed target keys** — `resolve(path, { world })` resolves the named world's backend and returns a target whose key is `world:<id>:<backendKey>`; every operation on that target routes to the same world without re-resolving.
- **Local default** — a call without `world` routes to the local world; the tool layer resolves `world(session)` per session and passes it.
- **Synchronous identity helpers** — `processPath` / `fileUrl` / `contains` stay synchronous by reading a world→backend cache that `resolve()` populates; a target whose world was never resolved here refuses loudly, and cross-world containment is always false.
- **Full seam delegation** — `stat`, `readText`, `streamText`, `readBytes`, `listDir`, `writeText`, `editText`, and `lstat` delegate to the routed world's backend with the seam's exact semantics.

-----

<a id="model-experience"></a>
## Model Experience

### Routed backend results

#### What the model sees

Nothing of the router's own. `dsh-tool-fs` renders the routed backend's file content, directory listings, mutation acknowledgements, and error messages exactly as that backend produced them; this provider registers no tool, prompt, or result text.

#### Token effect

A routed call costs only the tokens of the routed backend's own result; the router contributes no text of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Local-only deployments should not mount it** — the router adds a dispatch hop; the default composition keeps the direct local backend for zero behavior change.
- **World ids must be resolved before use** — a target key names a world the router must have resolved in this process; a foreign id refuses loudly rather than guessing.
- **`lstat` is path-shaped and routes to the local world** — the seam's lstat carries no world identity; the path is interpreted in the caller's (local) world.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer working context — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The router forwards every call to the world's own backend, whose implementation carries the filesystem checks, and its only owned state is the world cache, whose lifecycle mirrors the worlds service.
