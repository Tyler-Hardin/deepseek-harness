---
description: "The execution-world router for ctx.shell, for deployments and maintainers composing mixed local and remote shell executors."
kind: "package-reference"
---

# @deepseek-ai/dsh-shell-router

English | [中文](README.zh.md)

## Summary

Use `dsh-shell-router` when one composition must run commands in more than one execution world. It implements the `ctx.shell` seam: `resolve` performs the seam's synchronous defaulting (the same defaults the local executor applies) and stamps the caller's opaque world identity into the spec, and `run` and `start` resolve that world's executor through `dsh-worlds` and delegate. A call naming no world routes to the local world. Local-only deployments keep the direct local executor; mount this router only for mixed local and remote compositions.

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
import { ShellRouter } from '@deepseek-ai/dsh-shell-router'

export function apply(ctx: Context): void {
  // registers `ctx.shell` (requires `ctx.worlds`)
  ctx.plugin(ShellRouter)
}
```

-----

<a id="behavior"></a>
## Behavior

- **Router-owned defaulting** — `resolve(request)` clamps `timeoutMs` into `[120_000, 600_000]`, defaults `stdoutMaxBytes` to `64_000`, fills `workdir` from the process cwd, and stamps the caller's `world` into the spec. Invalid hints refuse loudly.
- **World dispatch** — `run` resolves the spec's world (or the local world when absent) through `ctx.worlds` and delegates to that world's executor; a world id that names no live world refuses loudly.
- **Synchronous start** — `start` is the seam's synchronous entry, so it reads a world→executor cache that a prior `run` (or a `ctx.worlds`-resolved world) populated; a world never resolved in this process refuses loudly.
- **Full seam delegation** — the routed executor's `run` / `start` semantics apply unchanged, including background processes and output bounds.

-----

<a id="model-experience"></a>
## Model Experience

### Routed executor results

#### What the model sees

Nothing of the router's own. `dsh-tool-bash` renders the routed executor's output exactly as that executor produced it; this provider registers no tool, prompt, or result text.

#### Token effect

A routed call costs only the tokens of the routed executor's own result; the router contributes no text of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Local-only deployments should not mount it** — the router adds a dispatch hop; the default composition keeps the direct local executor for zero behavior change.
- **`start` requires a prior resolution** — a background process needs a world the router has already seen in this process; a never-resolved world id refuses loudly rather than connecting on demand.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer working context — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The router forwards every call to the world's own executor, whose implementation carries the shell checks, and its only owned state is the world cache, whose lifecycle mirrors the worlds service.
