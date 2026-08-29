# ssh/ — SSH transport family

English | [中文](README.zh.md)

The SSH transport seam for remote execution worlds: one connection per world with agent-then-keys authentication, `~/.ssh/config` resolution (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), known_hosts TOFU with changed-key rejection, and exec + SFTP channels. The family implements the Service Definition/provider split; the workspace/session binding, world routing, and `fs-ssh`/`bash-ssh` adapters are later phases that consume it ([execution worlds and SSH workspaces proposal](../../.agents/notes/proposed/architecture/2026-08-21-execution-worlds-and-ssh-workspaces.md), [SSH capability seam proposal](../../.agents/notes/proposed/feature/2026-08-21-ssh-capability-seam.md)).

| Package | ctx key | Role |
|---|---|---|
| [`ssh`](ssh/README.md) (`@deepseek-ai/dsh-ssh`) | `ctx.ssh` | Service Definition: world descriptor + lifecycle + channel verbs + pure config/known_hosts/auth-order policy |
| [`ssh-client`](ssh-client/README.md) (`@deepseek-ai/dsh-ssh-client`) | registers `ctx.ssh` | ssh2-backed provider: agent/keys-only auth, ProxyJump hops, TOFU, exec + SFTP |
| [`ssh-worlds`](ssh-worlds/README.md) (`@deepseek-ai/dsh-ssh-worlds`) | registers `ctx.worlds` | execution-worlds provider: ssh places to a remote world with fs-ssh/bash-ssh backends |

Password authentication is deliberately absent from the whole family: agent and keys only, working by default with a standard `~/.ssh` setup. The host is the trust boundary; this transport composes with no local sandbox (the [sandbox seam decision](../../.agents/notes/implemented/feature/2026-07-06-sandbox.md) excludes remote executors from local confinement).
