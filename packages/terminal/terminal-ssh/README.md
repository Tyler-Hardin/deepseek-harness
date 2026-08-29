# @deepseek-ai/dsh-terminal-ssh

English | [中文](README.zh.md)

Persistent remote shell backend for `ctx.terminals` over one ssh world's pty channel. It opens the account's login shell with a remote pseudo-terminal through `@deepseek-ai/dsh-ssh` (`SshWorld.pty`), retains bounded line-oriented output, and drives readiness, signalling, and teardown directly on the channel. Sessions opened this way run in the session's remote execution world, so an agent whose workspace lives over ssh gets a persistent interactive shell in the same world its filesystem and bash tools use.

## Plugin (`terminal-ssh`)

The plugin injects `pty` and `worlds`, then registers the configured backend type (`ssh`). At spawn it resolves the owner's session world through `ctx.worlds.resolve({ session, path })` and rejects a non-ssh world loudly — routing a local session here would try to open a PTY on a transport the world does not own. The backend opens `world.pty({ rows, cols })`, which launches the login shell; when a working path is known (the spawn `cwd`, else the session header `cwd`), the boot line `cd <path>` runs before readiness so the shell starts in the workspace path, and the same path is passed to the world as its backend default. `startupTimeoutMs` bounds the boot-to-readiness wait and `sendTimeoutMs` bounds every later send.

Readiness is silence-based: a send settles when output has been quiet for `idleSilenceMs` after at least one output event, or immediately on remote exit or close; startup additionally requires observed output, so zero-output silence cannot publish an empty session. The ssh transport exposes no foreground process-group introspection, so there is no prompt-marker or stdin-wait tier like the local backend's. `SIGINT` and `SIGTSTP` write their terminal control bytes to the channel; `SIGTERM`, `SIGKILL`, and `SIGHUP` have no control byte, so the backend closes the channel, terminating the remote shell and its children. `close` ends the channel, settles the active send as `session_exit`, and awaits quiescence before resolving; a transport failure fails the active send and surfaces the first failure through `close`.

## Model Experience

Indirectly, through `@deepseek-ai/dsh-tool-terminal` or another PTY consumer, which renders the bounded MOTD, send deltas, scrollback pages, and cleanup errors this backend produces.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Login shell only** — the SSH protocol's shell request has no shell or directory parameter, so the backend always launches the account's login shell and starts an explicit `cd` for a working path; selecting a different remote shell is unsupported.
- **Silence-based readiness only** — with no remote foreground-process introspection, a send settles on output silence; a long-running command that prints nothing settles early (the model can poll scrollback), and there is no prompt-marker tier even on bash remotes.
- **Coarse signals** — `SIGTERM`/`SIGKILL`/`SIGHUP` close the channel instead of delivering the named signal, and no remote process group is ever identified (`targetPgid` is `0`).
- **POSIX shell required** — the boot `cd` line assumes a POSIX login shell on the remote.
- **Sessions do not survive harness process exit.**
