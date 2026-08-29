# @deepseek-ai/dsh-bash-ssh

English | [中文](README.zh.md)

SSH Service Provider for the `@deepseek-ai/dsh-shell` executor seam over an [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.md) world's exec channel: `SshBashExecutor` runs foreground commands with the seam's exec/collect lifecycle — config-clamped timeouts, cancellation, bounded output, stdin, and env — and runs background processes detached on the remote host, reading their pid, status, and output files back over the world's SFTP session.

The provider takes an `SshWorld` (from [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.md)) and owns everything bash-shaped on the remote side: command defaulting and caps, timeout/cancel classification, the model-friendly terminal environment, and the model-facing stdout/stderr merge for background reads. Transport mechanics (authentication, host-key policy, connection lifecycle) are the SSH seam's. One instance serves one remote world; the workspace/session binding phase composes instances per remote workspace.

## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshBashExecutor } from '@deepseek-ai/dsh-bash-ssh'

async function compose(ctx: Context, world: SshWorld) {
  // one instance per remote world
  const shell = new SshBashExecutor(ctx, { cwd: '/home/user/project' }, world)
  const spec = shell.resolve({ command: 'npm test' })
  return await shell.run(spec)
}
```

| Option | Default | Meaning |
|---|---|---|
| `cwd` | the world target's path, else `/` | remote base directory for relative paths |
| `timeoutMs` | 120000 | default foreground timeout in milliseconds |
| `maxTimeoutMs` | 600000 | cap for per-call timeout overrides |
| `maxOutputBytes` | 64000 | per-stream in-memory output cap (foreground capture and background tails) |
| `runtimeRoot` | `~/.dsh-bash` | remote directory for background-process files; `~` expands to the remote home |
| `pollMs` | 50 | poll cadence for background status/output files in milliseconds |
| `graceMs` | 3000 | SIGTERM→SIGKILL grace for background kills in milliseconds |

## Behavior

- **Foreground runs** — `run()` hands the resolved command to the world's exec channel with the config-clamped timeout, the caller's signal, an explicit env (terminal overrides first, then caller env, then the managed `DSH_*` snapshot), optional stdin, and a combined capture ceiling that over-captures so neither stream drops below its seam budget. The transport's own classification (exit code, remote signal, `timedOut`, `aborted`, per-stream truncation) maps straight onto the seam result.
- **Background processes** — `start()` returns a live `ShellProcess` handle immediately with no timeout. The launch exec returns instantly: the remote wrapper backgrounds the command in a new session (`setsid`), records its pid, waits, and writes the exit status. A poll loop reads the pid, status, and output files over SFTP; output reads are incremental with bounded in-memory tails, and `readOutput()` merges stdout/stderr into one consuming delta with stderr under a `[stderr]` marker.
- **Kill and cancellation** — `kill()` (or the spec's `AbortSignal`) marks the process killed and escalates SIGTERM → SIGKILL against the remote process *group* (`setsid` makes it a session/group leader), so the whole tree dies. The wrapper survives the group kill to write the final status. A self-signaled command also settles as `killed`, matching the local executor.
- **Spawn failures settle as killed** — a launch that rejects (world not connected) or never publishes a pid settles the process as `killed` with a `spawn failed: …` note delivered once through `readOutput()`, mirroring `dsh-bash-local`.
- **Disconnection settles** — if the world's connection drops mid-run, the pending SFTP reads are raced against the session's close signal and the process settles as `killed` with a connection-lost note instead of hanging forever.
- **The `~` runtime root** — a `~/.dsh-bash` runtime root is expanded once per executor by asking the remote login shell for `$HOME`, since a quoted `~` never expands in the wrapper and SFTP paths need the literal absolute form.
- **Live-process teardown** — processes still running when the owning composition disposes are marked killed and their remote groups escalated.

## Model Experience

Indirectly, through `dsh-tool-bash`, which renders this executor's bounded stdout/stderr tails, background-process deltas, and infrastructure failures.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Remote commands need a POSIX shell with `setsid`** — the background wrapper uses `setsid` (util-linux) to detach the command into its own session/group; hosts without it (e.g. stock macOS) fail background launches loudly.
- **Background exit signals are inferred from 128+n statuses** — the wrapper records `wait`'s status, so a signal death appears as `signal` only for the standard POSIX signums; exotic or nonstandard statuses report as exit codes.
- **No spill recovery for remote background output** — truncated background tails keep only the bounded in-memory tail and flag `lossy`; the full remote file is not exposed as a local spill path (the seam's spill fields are local paths).
- **No reconnect** — a dropped connection settles the process as killed; reconnecting and resuming the poll loop is deferred hardening.
- **The `SftpHandle` pin is ssh2-specific** — the provider reads the session as the ssh2 wrapper; a non-ssh2 world cannot serve this backend.
