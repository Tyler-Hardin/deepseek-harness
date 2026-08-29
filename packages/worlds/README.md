---
description: "The execution-worlds package group: the ctx.worlds Service Definition and the local world provider, for readers choosing or navigating the family."
kind: "package-group"
---

# worlds/ — execution-worlds capability family

English | [中文](README.zh.md)

## Summary

Run agents in more than one execution environment. `worlds/` resolves a workspace place to a world — a local directory tree, or a remote host reached through a transport — owns that world's lifecycle, and exposes its filesystem and shell backends so router providers can dispatch capability calls per world; `worlds-local/` serves every local place from the host. Choose this family for mixed local/remote compositions. Local-only deployments mount no router, so the default composition is unchanged.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

One world is one coherent execution environment — a local directory tree, or a remote host reached through a transport — with per-world filesystem and shell backends composed over it. Remote-ness is a property of the workspace definition: a workspace's `place` (from [`workspace/`](../workspace/README.md)) says whether it is local or an ssh destination, and this family turns places into worlds that router providers dispatch seam calls to.

| Package | Role | ctx key |
|---|---|---|
| [`worlds/`](worlds/README.md) | Execution-worlds Service Definition: `World`/`Worlds` contract, `WorldId`, place→kind policy | `ctx.worlds` (provider-mounted) |
| [`worlds-local/`](worlds-local/README.md) | Local provider: every local place resolves to one host world over `dsh-fs-local` and `dsh-bash-local` | registers `ctx.worlds` |

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the shared vocabulary, then the adjacent owners that supply places, transports, and router consumers.

- [Execution worlds subsystem](../../docs/subsystems/worlds.md) — worlds, places, kinds, and the world lifecycle.
- [Workspace subsystem](../../docs/subsystems/workspace.md) — the `place` a world resolves from.
- [ssh subsystem](../../docs/subsystems/ssh.md) — the transport a remote world runs over.
- [Portable execution world consumers decision](../../.agents/notes/implemented/architecture/2026-07-28-portable-execution-world-consumers.md) — why a world is the composition root for its per-seam backends.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
