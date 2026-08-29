# @deepseek-ai/dsh-fs-ssh

English | [中文](README.zh.md)

SSH provider for the [`@deepseek-ai/dsh-fs`](../fs/README.md) filesystem capability seam: one remote execution world accessed over SFTP. Paths, contents, and atomic staging files stay on the remote host; reads expose regular UTF-8 text or typed errors, listings are stable and content-free, and mutations are atomic with optional version guards — the full twelve-primitive seam contract.

The provider takes an `SshWorld` (from [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.md)) and pins the seam's provisional `SftpHandle` to the ssh2 wrapper. One instance serves one remote world; the workspace/session binding phase composes instances per remote workspace.

## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'

function compose(ctx: Context, world: SshWorld) {
  // one instance per remote world
  return new SshFileSystem(ctx, { cwd: '/home/user/project' }, world)
}
```

| Option | Default | Meaning |
|---|---|---|
| `cwd` | the world target's path, else `/` | remote base directory for relative paths |
| `diffBasisMaxBytes` | 10 MiB | exclusive UTF-8 byte limit on each overwrite-diff side; a prior file at or above it yields `before: null` |

## Behavior

- **Identity** — `resolve` maps a remote path to its realpath as the stable `targetKey`; a missing target realpaths its nearest existing ancestor and re-appends the suffix, so the key is stable across creation. `processPath`/`fileUrl`/`contains` speak the remote world's paths.
- **Reads** — whole-text, streamed, and bounded raw-byte reads with the seam's validation: regular-file checks, NUL/binary rejection, fatal UTF-8 decoding, and the `maxBytes` cap (stat preflight plus a streamed bound for post-stat growers).
- **Atomic writes** — a write stages a private `0o700` sibling directory, writes a `0o600` temp, preserves the existing mode, and publishes with a same-directory rename; the staging directory is removed best-effort. `createIfAbsent` publishes through a remote hard link (`ln`), the SFTP-level no-replace primitive, so a concurrent creator is preserved. A per-target FIFO lock serializes read→guard→write windows.
- **Edits** — literal replacement with the seam's taxonomy (`FS_EDIT_NOT_FOUND`, `FS_AMBIGUOUS_EDIT`), CRLF-preserving write-back, and the version guard checked before matching.
- **Versions** — derived from SFTP attributes (`size:mtime:mode:uid:gid`). SFTP timestamps have one-second precision, so a same-second, same-size overwrite can produce an identical version (weaker than the local backend; documented limitation).
- **Cancellation** — every operation checks the caller's signal; aborts report `FS_ABORTED`.
- **Transport failures** — a disposed or dropped world maps to `FS_IO_ERROR` with the SSH error as the cause; the SFTP status vocabulary maps to `FS_NOT_FOUND`/`FS_PERMISSION_DENIED`/`FS_IO_ERROR`.

## Model Experience

Indirectly, through [`dsh-tool-fs`](../tool-fs/README.md), which renders remote UTF-8 content, directory results, mutation acknowledgements, and provider errors while the SSH transport remains internal.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

- **Versions are time-second-derived** — SFTP v3 attrs carry one-second timestamps and no inode/device identity, so the version token is weaker than the local backend's; a same-second same-size overwrite may not be detected as stale by a version guard.
- **`createIfAbsent` needs a POSIX shell on the remote host** — the no-replace publication runs `ln` through the world's exec channel; hosts without a POSIX `ln` fail the guarded create loudly.
- **Broken-symlink listing** — a dangling symlink lists as `other` with no version; the seam's directory listing has no symlink-follow contract.
- **No reconnect** — a dropped connection fails operations until the world is reconnected by the caller.
- **The `SftpHandle` pin is ssh2-specific** — the provider reads the session as the ssh2 wrapper; a non-ssh2 world cannot serve this backend.
