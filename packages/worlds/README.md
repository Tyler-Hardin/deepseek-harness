# worlds/ — execution-worlds capability family

English | [中文](README.zh.md)

The execution-worlds family: one world is one coherent execution environment — a local directory tree, or a remote host reached through a transport — with per-world filesystem and shell backends composed over it. Remote-ness is a property of the workspace definition: a workspace's `place` (from [`workspace/`](../workspace/README.md)) says whether it is local or an ssh destination, and this family turns places into worlds that router providers dispatch seam calls to.

| Package | Role | ctx key |
|---|---|---|
| [`worlds/`](worlds/README.md) | Execution-worlds Service Definition: `World`/`Worlds` contract, `WorldId`, place→kind policy | `ctx.worlds` (provider-mounted) |

Local-only deployments never mount a router, so this family is optional infrastructure for mixed local/remote compositions — the default composition is unchanged.
