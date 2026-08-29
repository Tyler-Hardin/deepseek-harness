# @deepseek-ai/dsh-shell-router

English | [中文](README.zh.md)

Shell router provider: implements the `ctx.shell` seam and dispatches each call to the shell executor of the world the caller named. `resolve` is the seam's synchronous defaulting step, so it performs the defaulting itself (the same defaults the local executor applies) and stamps the caller's opaque execution-world identity (`request.world`) into the spec; `run` and `start` then resolve that world's executor through [`@deepseek-ai/dsh-worlds`](../../worlds/worlds/README.md) and delegate. A call without a world identity routes to the local world.

Local-only deployments never mount this provider: the default composition keeps the direct local executor. This router is opt-in infrastructure for mixed local/remote compositions.

## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import { ShellRouter } from '@deepseek-ai/dsh-shell-router'

export function apply(ctx: Context): void {
  // registers `ctx.shell` (requires `ctx.worlds`)
  ctx.plugin(ShellRouter)
}
```

## Behavior

- **Router-owned defaulting** — `resolve(request)` clamps `timeoutMs` into `[120_000, 600_000]`, defaults `stdoutMaxBytes` to `64_000`, fills `workdir` from the process cwd, and stamps the caller's `world` into the spec. Invalid hints refuse loudly.
- **World dispatch** — `run` resolves the spec's world (or the local world when absent) through `ctx.worlds` and delegates to that world's executor; a world id that names no live world refuses loudly.
- **Synchronous start** — `start` is the seam's synchronous entry, so it reads a world→executor cache that a prior `run` (or a `ctx.worlds`-resolved world) populated; a world never resolved in this process refuses loudly.
- **Full seam delegation** — the routed executor's `run` / `start` semantics apply unchanged, including background processes and output bounds.

## Model Experience

Indirectly, through `dsh-tool-bash`, which renders the routed executor's output; this provider registers no tools or prompts of its own.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Local-only deployments should not mount it** — the router adds a dispatch hop; the default composition keeps the direct local executor for zero behavior change.
- **`start` requires a prior resolution** — a background process needs a world the router has already seen in this process; a never-resolved world id refuses loudly rather than connecting on demand.
