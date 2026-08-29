# Agent Note: Execution worlds and SSH workspaces

Status: proposed

English | [中文](2026-08-21-execution-worlds-and-ssh-workspaces.zh.md)

## Problem

Every dsh workspace is a local directory. The workspace registry canonicalizes paths with local `fs.realpath`, `SessionHeader.cwd` must be a local absolute path, and the fs/shell/subprocess seams mount exactly one provider per process. There is no way to run a session whose files and commands live on a remote host, even though the seams already define themselves around "one execution world" and the repository already ships one remote world family (`dsh-e2b`: one global sandbox whose fs/subprocess adapters replace the local providers at composition time).

The reference implementation to copy from is the goop agent, which supports SSH by toggling a per-session `Transport::Local | Ssh`: an `ssh` tool promotes the session, `disconnect` demotes it, all file/shell tools route through the active transport, and the connection state persists in a per-session state file. That model does not fit dsh: sessions are bound to a workspace at creation, the workspace is the durable unit of identity and grouping, and a single harness process must serve **mixed** local and remote sessions at once. goop's model is single-session and transport-centric; dsh needs workspace-centric remote-ness.

This note is the architectural decision behind the [SSH capability seam proposal](../feature/2026-08-21-ssh-capability-seam.md). It builds on the [portable execution-world consumers decision](../../implemented/architecture/2026-07-28-portable-execution-world-consumers.md) — which established that `ctx.fs` + `ctx.subprocess` define one execution world and that remote providers replace whole seams as environment-coherent groups (the e2b POC) — and extends that family with a routing layer so one process can serve mixed worlds, plus the workspace-place model that the e2b POC deliberately did not need. It decides where remote-ness lives, how providers are selected per session, and what security posture applies. The [sandbox seam decision](../../implemented/feature/2026-07-06-sandbox.md) already excludes remote executors from local sandbox backends; this note adopts that boundary as doctrine.

## Proposal

### Remote-ness is a property of the workspace definition

A workspace is defined by its **place**: `{ kind: 'local', path }` or `{ kind: 'ssh', host, user?, port?, path }`. Everything derives from that one field:

- **Workspace registry**: `create` validates the place (local `realpath`, or a connect + remote stat over the transport); `status()` is a local directory check or a remote reachability probe; `attachSession` matches on place, not on a local canonical path.
- **Session binding**: a session's world is read off its workspace's place and frozen in the session header at creation (an optional immutable `world` field beside `cwd`, which keeps meaning "the working path" and is the remote absolute path for remote sessions). Resume rebinds the transport from header `world` + workspace record.
- **No session-level transport state**: no `ssh`/`disconnect` tools, no per-session transport toggle, no reconnect-preamble machinery. A session is on the workspace it was created on, full stop. This is the deliberate departure from goop's model.

### Execution worlds and per-session routing

The existing seams are already per-world contracts; the missing piece is selecting which world a session's calls run in. Because tool plugins bind `ctx.fs`/`ctx.shell` at activation, per-session provider shadowing through scope chains would require converting every consumer to lazy per-call resolution. Instead:

- A new `ctx.worlds` service resolves `world(session)` — `local` by default, or the workspace's remote world — exactly the way `ctx.sandboxPolicy.resolve({ session })` resolves per-session policy today.
- The fs and shell seam contracts gain one optional per-call field (`resolve(opts.world)`, `spec.world`). Thin **router providers** (`dsh-fs-router`, `dsh-shell-router`) implement the seams and dispatch to per-world backend instances; after `resolve`, routing rides the opaque branded `targetKey` (router-prefixed), so only resolve needs the world.
- Local-only deployments never mount the router: the default composition keeps the current direct providers, so there is zero behavior change and no default-bundle churn.

The sandbox seam's existing statement is adopted as doctrine: remote executors are **not** sandbox backends — they replace Service Providers for whole capability seams as environment-coherent groups. Requesting a local sandbox mode for a remote world fails loud; the remote host is the trust boundary.

### Authentication and security posture

Agent and key authentication only, working by default with a standard `~/.ssh` setup:

1. **ssh-agent** first when `SSH_AUTH_SOCK` is set (POSIX) or the OpenSSH agent pipe exists (Windows).
2. **Configured keys**: `IdentityFile` entries from `~/.ssh/config`, in order.
3. **Default keys**: `~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`.

There is **no password path at all** — not via tool arguments, not via credentials, not via prompts. A key that needs a passphrase without an agent available fails loudly with an actionable message. `~/.ssh/config` is always consulted (aliases, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`); key files must be owner-only; known_hosts uses TOFU (learn on first sight, reject a changed key), with an optional strict mode.

`ssh/connect { worldId, host, user?, port, path }` and `ssh/disconnect` are log-only session events, required for reconstructability: a remote tool result is only explainable if the log records which world the turn ran in. No credentials appear in any event.

### M1 scope boundary

This note decides the architecture; the transport seam itself (packages, contracts, auth flow, tests) is the [SSH capability seam proposal](../feature/2026-08-21-ssh-capability-seam.md). The workspace/session binding changes, routers, fs/shell adapters, and GUI work are later phases that consume this decision.

## Acceptance criteria

- A workspace record can carry an ssh place, and a session created on it derives a remote world without any session-level transport state.
- Mixed local and remote sessions coexist in one process; the tool layer selects the world per call the way it selects sandbox policy today.
- Default auth works with agent or default-key setups and no configuration beyond the provider composition; password auth is absent from the API surface.
- Connecting to a new host is TOFU; a changed host key rejects the connection.
- `ssh/connect`/`ssh/disconnect` events make every remote tool result reconstructable from the session log.
- Local-only deployments are behaviorally identical before and after this change.

## Progress

**M4 (Implemented, unmerged)** — the execution-worlds layer as proposed: `Workspace.place` (local/ssh) and `SessionHeader.world` (opaque, frozen at creation, no format-version bump — additive optional header metadata), the `ctx.worlds` service with `dsh-worlds-local` and `dsh-ssh-worlds` providers, and the `dsh-fs-router` / `dsh-shell-router` providers that dispatch seam calls to the resolved world's backends. The transport's own world id was renamed `SshWorldId` so the catalog can distinguish it from the execution-worlds `WorldId`. Worlds compose their per-world fs/shell backends on an isolated child context (`isolate('fs').isolate('shell')`), so a router mounted on the parent scope cannot collide with the world's own registrations; dispose severs the world's references without touching the parent fiber. `dsh-host-apiproxy` resolves a session's world from its workspace place at session creation; `ssh-worlds` records the per-session `ssh/connect` on entry and the mirrored `ssh/disconnect` for each bound session when the world disconnects. 141 tests across the worlds/ssh/router packages at 100% coverage; the cordis/config/doc-graphs catalogs gained the new services and their subsystem pages.

**M5 (Implemented, unmerged)** — remote workspace creation: `Workspace.createAtPlace` (local delegates the directory-checked flow, ssh reuses by `host+path` via `createRemoteCanonical`), place-aware `attachSession` (exact remote-path equality for ssh places), and the registry stays storage-layer — reachability probing lives in the consumer. `dsh-host-apiproxy` probes the remote path through the optional `ctx.worlds` structural edge (`worlds.resolve({place, path})` + `world.fs().lstat`) before `workspace.create` for ssh places and exposes `WorkspaceView.place` (absent = local). The GUI gained a remote-add form in the workspace picker (host/user/port/path) and an `SSH <host>` badge on remote rows. Bilingual READMEs and catalogs updated; 932 tests across workspace/apiproxy/ui-workspace/client-runtime at 100% coverage.

**M6 (Implemented, unmerged)** — the agent-facing remote terminal: `SshWorld.pty()` opens an ssh2 shell channel with a remote pseudo-terminal (login shell; the SSH protocol's shell request has no shell or directory parameter, so the unimplementable `shell`/`cwd` options were dropped from `SshPtyOptions`), and `dsh-terminal-ssh` registers the `ssh` terminal backend. The backend resolves the owner's session world through `ctx.worlds` (the `World` SD gained an optional `ssh()` transport accessor implemented by `ssh-worlds`), rejects non-ssh worlds loudly, boots `cd` into the working path before readiness, settles sends on output silence (`idleSilenceMs`; no foreground-pgid introspection exists over ssh2, so there is no prompt-marker or stdin-wait tier), signals via terminal control bytes (SIGINT/SIGTSTP; SIGTERM/SIGKILL/SIGHUP close the channel), and ends the channel on close. 34 terminal-ssh tests at 100% coverage plus the ssh/ssh-client/ssh-worlds/worlds suites; the ProxyJump and agent-auth paths were already covered by the ssh-client e2e fixture tests.

## Risks

- **Router indirection** adds a hop to every fs/shell call in compositions that opt in; the per-call world field is an optional seam extension that existing providers ignore, so the risk is confined to router users.
- **TOFU is a weaker guarantee than pre-seeded known_hosts**; a strict mode mitigates this for security-sensitive deployments, and the changed-key rejection prevents silent MITM continuation.
- **Agent-first auth can hang** if the agent socket is present but unresponsive; bounded connect timeouts are required.
- **Mixed-world semantics** (e.g. a session referencing a local path from a remote world) must fail loud rather than silently resolve against the wrong world; the router owns this check.
- **Header format growth** (`world` field) is a session-format change; pre-release policy permits it, and old-format rejection is acceptable.

## Alternatives considered

- **Per-session scope mounts** (mount `fs-ssh`/`bash-ssh` into a per-workspace scope layer): rejected because tool plugins bind `ctx.fs`/`ctx.shell` at activation, so shadowing per session would force every consumer to lazy per-call `ctx.get()` — an invasive cross-cutting refactor with worse failure modes than a router.
- **Whole-harness remote** (replace the local providers with ssh providers at composition, e2b-style): rejected because the requirement is mixed local and remote workspaces in one process; global replacement serves one remote world only.
- **goop's session-transport model** (per-session `Transport::Local | Ssh`, `ssh`/`disconnect` tools, state file): rejected as transport-centric rather than workspace-centric; it does not compose with dsh's workspace entity, session-header immutability, or multi-session server.
- **Password auth via the credentials capability**: rejected by decision — no password path exists anywhere in the surface; keys and agent only.
