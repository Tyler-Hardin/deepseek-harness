---
description: "The SSH transport package group: the `ctx.ssh` Service Definition, its ssh2 provider, and the execution-worlds provider that runs session work on remote hosts."
kind: "package-group"
---

# ssh/ — SSH transport family

English | [中文](README.zh.md)

## Summary

The `ssh/` family connects a workspace to a remote execution world: one connection per world with agent-then-keys authentication, `~/.ssh/config` resolution (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), known_hosts TOFU with changed-key rejection, and exec plus SFTP channels. `ssh/` owns the `ctx.ssh` contract, `ssh-client/` the ssh2 provider, and `ssh-worlds/` the `ctx.worlds` provider that composes both. Choose it when work must run on a host that already trusts your `~/.ssh` setup: the host is the trust boundary, so the transport composes with no local sandbox and offers no password path.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Three packages carry the SSH transport roles; the subsystem reference owns the exhaustive contracts.

| Package | ctx key | Role |
|---|---|---|
| [`ssh`](ssh/README.md) (`@deepseek-ai/dsh-ssh`) | `ctx.ssh` | Service Definition: world descriptor + lifecycle + channel verbs + pure config/known_hosts/auth-order policy |
| [`ssh-client`](ssh-client/README.md) (`@deepseek-ai/dsh-ssh-client`) | registers `ctx.ssh` | ssh2-backed provider: agent/keys-only auth, ProxyJump hops, TOFU, exec + SFTP |
| [`ssh-worlds`](ssh-worlds/README.md) (`@deepseek-ai/dsh-ssh-worlds`) | registers `ctx.worlds` | execution-worlds provider: ssh places to a remote world with fs-ssh/bash-ssh backends |

Password authentication is deliberately absent from the whole family: agent and keys only, working by default with a standard `~/.ssh` setup. The host is the trust boundary; this transport composes with no local sandbox (the [sandbox seam decision](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) excludes remote executors from local confinement).

<a id="related-documentation"></a>
## Related documentation

Start with the subsystem reference for the transport vocabulary, then the decisions that shaped the family.

- [SSH subsystem](../../docs/subsystems/ssh.md) — target resolution, authentication order, known_hosts policy, and the connection lifecycle.
- [Execution worlds and SSH workspaces proposal](../../.agents/notes/proposed/architecture/2026-08-21-execution-worlds-and-ssh-workspaces.md) — how an ssh place becomes a remote execution world.
- [SSH capability seam proposal](../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.md) — why the Service Definition and its provider split.
- [Sandbox seam decision](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) — why remote executors stay outside local confinement.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
