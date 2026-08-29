---
description: "The SSH/SFTP backend for ctx.fs, for deployments and maintainers serving one remote execution world's files."
kind: "package-reference"
---

# @deepseek-ai/dsh-fs-ssh

English | [中文](README.zh.md)

## Summary

Use `dsh-fs-ssh` to serve one remote execution world through the [`@deepseek-ai/dsh-fs`](../fs/README.md) seam over SFTP. Paths, contents, and atomic staging files stay on the remote host; reads expose regular UTF-8 text or typed errors, listings are stable and content-free, and mutations are atomic with optional version guards. The provider takes an `SshWorld` from [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.md), pins the seam's provisional `SftpHandle` to the ssh2 wrapper, and serves one remote world per instance; the workspace/session binding phase composes instances per remote workspace. Choose `fs-local` for host files, and `fs-router` when one composition spans several worlds.

## Table of Contents

- [Usage](#usage)
- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="usage"></a>
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

-----

<a id="behavior"></a>
## Behavior

- **Identity** — `resolve` maps a remote path to its realpath as the stable `targetKey`; a missing target realpaths its nearest existing ancestor and re-appends the suffix, so the key is stable across creation. `processPath`/`fileUrl`/`contains` speak the remote world's paths.
- **Reads** — whole-text, streamed, and bounded raw-byte reads with the seam's validation: regular-file checks, NUL/binary rejection, fatal UTF-8 decoding, and the `maxBytes` cap (stat preflight plus a streamed bound for post-stat growers).
- **Atomic writes** — a write stages a private `0o700` sibling directory, writes a `0o600` temp, preserves the existing mode, and publishes with a same-directory rename; the staging directory is removed best-effort. `createIfAbsent` publishes through a remote hard link (`ln`), the SFTP-level no-replace primitive, so a concurrent creator is preserved. A per-target FIFO lock serializes read→guard→write windows.
- **Edits** — literal replacement with the seam's taxonomy (`FS_EDIT_NOT_FOUND`, `FS_AMBIGUOUS_EDIT`), CRLF-preserving write-back, and the version guard checked before matching.
- **Versions** — derived from SFTP attributes (`size:mtime:mode:uid:gid`). SFTP timestamps have one-second precision, so a same-second, same-size overwrite can produce an identical version (weaker than the local backend; documented limitation).
- **Cancellation** — every operation checks the caller's signal; aborts report `FS_ABORTED`.
- **Transport failures** — a disposed or dropped world maps to `FS_IO_ERROR` with the SSH error as the cause; the SFTP status vocabulary maps to `FS_NOT_FOUND`/`FS_PERMISSION_DENIED`/`FS_IO_ERROR`.

-----

<a id="model-experience"></a>
## Model Experience

### Remote filesystem results

#### What the model sees

`dsh-tool-fs` renders remote UTF-8 content, directory results, mutation acknowledgements, and provider errors while the SSH transport stays internal. Failures arrive as the seam's typed codes — `FS_NOT_FOUND`, `FS_PERMISSION_DENIED`, `FS_IO_ERROR`, and `FS_ABORTED` — with the SSH error kept as the cause.

#### Token effect

Remote results are the only model-visible cost: a read, listing, or mutation acknowledgement contributes only the content it returns, under the consuming tool's retention limits. SFTP attribute details stay inside the provider.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Versions are time-second-derived** — SFTP v3 attrs carry one-second timestamps and no inode/device identity, so the version token is weaker than the local backend's; a same-second same-size overwrite may not be detected as stale by a version guard.
- **`createIfAbsent` needs a POSIX shell on the remote host** — the no-replace publication runs `ln` through the world's exec channel; hosts without a POSIX `ln` fail the guarded create loudly.
- **Broken-symlink listing** — a dangling symlink lists as `other` with no version; the seam's directory listing has no symlink-follow contract.
- **No reconnect** — a dropped connection fails operations until the world is reconnected by the caller.
- **The `SftpHandle` pin is ssh2-specific** — the provider reads the session as the ssh2 wrapper; a non-ssh2 world cannot serve this backend.

-----

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Maintainer working context — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Each operation returns the SFTP transport's committed result directly, with no independent event sequence or cache to cross-check, and the world's connection lifecycle belongs to the SSH seam.
