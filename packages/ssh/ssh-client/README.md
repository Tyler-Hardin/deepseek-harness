# @deepseek-ai/dsh-ssh-client

English | [中文](README.zh.md)

ssh2-backed Service Provider for the [`@deepseek-ai/dsh-ssh`](../ssh/README.md) transport seam: one connection per world (through however many ProxyJump hops), agent-then-keys authentication only, known_hosts TOFU with changed-key rejection, and exec + SFTP channels for the later fs/shell adapters. Host/config/auth policy lives in the Service Definition's pure layer; this package owns connection mechanics.

## Config

```yaml
- id: ssh-client
  name: '@deepseek-ai/dsh-ssh-client'
  config:
    # knownHostsPath: ~/.ssh/known_hosts   # known_hosts file for TOFU/strict checks
    # configPath: ~/.ssh/config            # ssh config file for alias resolution
    # homeDir: (os homedir)                # home directory for defaults
    # timeoutMs: 15000                     # default connect handshake timeout
    # strictHostKey: false                 # require a pre-existing known_hosts entry
    # defaultMaxOutputBytes: 64000         # combined exec capture ceiling
```

Unrecognized keys fail at plugin construction. `timeoutMs` and `defaultMaxOutputBytes` must be positive finite numbers.

## Behavior

- **Authentication, agent then keys, by default** — when `SSH_AUTH_SOCK` is set, the agent is tried first; then `IdentityFile` entries from `~/.ssh/config`; then the default keys (`~/.ssh/id_ed25519`, `~/.ssh/id_rsa`, `~/.ssh/id_ecdsa`). Key files must be owner-only (`0600`; group/world-accessible keys are refused with a note), and a passphrase-protected or malformed key is skipped with an actionable note. There is **no password path anywhere** — a connect with nothing usable fails loudly naming exactly what was tried. The agent socket is contacted in-process; no agent state is written by us.
- **`~/.ssh/config` is always consulted** — aliases, `HostName`, `User`, `Port`, `IdentityFile`, and comma-separated `ProxyJump` chains resolve exactly like the system `ssh` for the covered cases; `Match exec` is never evaluated (untrusted config text must not run code).
- **known_hosts TOFU** — a first connect learns the host key (appended to `known_hosts`, best-effort); a changed key rejects the connection with `SSH_HOST_KEY_CHANGED`; `strictHostKey: true` rejects an unknown host with `SSH_UNKNOWN_HOST`.
- **ProxyJump** — one ssh connection per hop, each hop forwarding `direct-tcpip` to the next (or to the final host); hops authenticate with the same methods as the target. Hop failures map to the seam vocabulary.
- **Exec** — one remote command per channel with the caller's timeout/cancel, bounded combined capture, and exit-code/timed-out/aborted facts. A caller-initiated timeout or abort resolves immediately with the output captured so far (the remote may hold the channel open forever).
- **SFTP** — `sftp()` returns the branded handle whose session the later `fs-ssh` adapter consumes.
- **Disposal** — `disconnect`/service teardown ends the connection and every hop; double dispose is a no-op.

## Model Experience

Indirectly, through the future `fs-ssh`/`bash-ssh` adapters and their consumers; the provider registers no prompt, schema, or result of its own.

#### KV Cache effect

No direct invalidation; the named consumers own any request-prefix changes.

## Known Limitations and Deferred Work

- **No system-ssh parity for exotic config** — `Include`, `ControlMaster`, `Match exec`, and `%` tokens beyond `%d`/`%u`/`%h` are not honored; such config either fails loud or is ignored, never silently mis-applied.
- **No password auth, by decision** — a passphrase-protected key without an agent fails loudly; there is no credentials integration for passwords.
- **TOFU write is best-effort** — a read-only or unwritable `known_hosts` still lets the connection proceed (the entry lives in memory for the session); the next connect re-learns.
- **Windows agent support is untested** — `SSH_AUTH_SOCK` is POSIX; Pageant support exists in the underlying library but has no coverage here yet.
- **No reconnect** — a dropped connection closes the world; the caller owns reconnection policy.
- **SFTP handle session is opaque** — pinned by the `fs-ssh` adapter in a later phase.
