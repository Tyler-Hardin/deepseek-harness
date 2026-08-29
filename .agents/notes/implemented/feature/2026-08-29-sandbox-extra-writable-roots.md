# Agent Note: Global extra writable roots for the sandbox

Status: implemented

English | [中文](2026-08-29-sandbox-extra-writable-roots.zh.md)

## Problem

`workspace-write` grants exactly the session workspace root plus the platform temp areas ([`writableRoots`](../../../../packages/sandbox/sandbox/src/roots.ts)). A user whose agent regularly needs a directory outside every workspace — `~/.cache` is the recurring example — has two options, both blunt: approve a `danger-full-access` escalation retry on every write (grants are `allowed-once`, so the prompt repeats), or switch the session to the `danger-full-access` preset, which unlocks the whole filesystem and turns approval off. No standing, targeted grant exists between "workspace + temp" and "everything".

## Decision

Add a host-local extra-writable-roots list to the sandbox policy, configurable globally by the deployment and the user, and enforced by every local dialect through the one shared derivation.

- **`SandboxExecutionPolicy.extraWritableRoots`** — optional absolute host-local directories `workspace-write` may also write under. Carried per call like `workspaceRoot`; stamped by `resolve()` only when non-empty.
- **`writableRoots()` includes them** — the one derivation now means "workspace root + `/tmp` + `os.tmpdir()` + configured extra roots", so the in-process fs fence and the Seatbelt profile cannot drift. The bwrap and Landlock dialects keep their own grant spellings and add one bind / `--rw` grant per extra root. The windows-acl rung keeps its workspace + private-temp grants; extra roots are denied there (documented limitation, per-root ACE grants deferred).
- **`dsh-sandbox-policy` Config `extraWritableRoots`** — the deployment layer, validated at load: absolute paths or `~/`-prefixed home spellings only; relative spellings fail loud. A leading `~` expands to the user's home at resolve time.
- **The `sandbox` settings namespace** — the global user layer over the deployment base, installed through `installSettingsSection` exactly like `permission.defaultPreset`. A stored change reaches the next `resolve()` without restart; detaching the settings provider falls back to the composition entry.
- **Model context** — the `sandbox:policy` workspace-write statement appends `Additional configured writable roots: [...]` while the list is non-empty, so the model knows the standing grants without a capability inventory.
- **General-settings editor row** — `@deepseek-ai/dsh-client-ui-sandbox-settings` registers a `settings.general.item` row in the web settings General section. It follows the shared describe mirror, replaces the whole list through one `settings.mutate` path operation with the descriptor revision, mirrors the host schema's spelling rule client-side before sending, and surfaces server-side rejections as an inline alert.
- **Host-local by contract** — the list names paths on the local host only. Remote execution worlds (ssh) are outside the fence entirely and never receive it, so a local `~/.cache` grant cannot authorize `ssh_host:~/.cache`; per-host remote policy is deferred to remote-containment work. The JSDoc on the policy field states this, and the fs fence is the only consumer of the derived roots on the local path.

The mode ladder is untouched: `read-only` still denies every mutation including extra roots, and `danger-full-access` still bypasses the fence.

## Alternatives considered

**Per-workspace grants.** Rejected: the settings seam is one user document with no per-cwd dimension, and the paths in question are properties of the user's machine, wanted in every workspace. The per-session escape hatch stays the existing `sandbox/mode` override; per-workspace policy would need a new settings dimension for a need that is not per-workspace.

**Grant extra roots only to the fs fence (not bash).** Rejected: the shared `writableRoots` derivation exists precisely so bash and fs cannot confine to different roots; a bash/fs split on extra roots would reintroduce that asymmetry on the POSIX runners.

**Apply the same string list to remote worlds.** Rejected as a security bug: a local path grant is a different trust domain from a remote host's path (different filesystem, possibly a different user, reached through a credential).

## Consequences

The policy vocabulary gains one optional per-call field and the service gains one Config key plus one settings namespace; enforcing consumers read them through the existing policy object, so no capability seam changes shape. The windows-acl rung is the one dialect that does not honor extra roots, reported as a Known Limitation rather than overstated as full. The permission-preset descriptions stay unchanged: they describe the preset's mode bundle, not a config inventory, and the model-facing context carries the exact roots.

This extends — not supersedes — [the cross-family fs sandbox note](2026-07-14-cross-family-fs-sandbox.md), which owns the shared-policy decision this list rides on, and [the sandbox note](2026-07-06-sandbox.md), which owns the mode vocabulary and runner semantics; both stay active and cross-linked.

## Testing

- `roots.spec.ts` — extra roots join the canonical deduplicated allow-list; `read-only` still grants nothing with extra roots configured.
- `policy.spec.ts` — `resolve()` stamps configured roots (agentless and per-session, deduplicated), expands `~`, omits the field when empty, and rejects a relative spelling at load; the prompt context appends the roots sentence; the settings namespace applies a stored change to the next resolve, rejects a relative path at write time, and falls back to the composition entry when the provider detaches.
- `fs-sandbox.spec.ts` — a write and an edit under a configured extra root land; a sibling outside every grant is still denied.
- `sandbox-local` profile tests — bwrap binds each extra root, Landlock adds each `--rw` grant, and the Seatbelt allow form contains the extra subpaths.
- `ui-sandbox-settings` client specs — the settings store reads the resolved list and replaces it wholesale with optimistic concurrency (read/write failure and disposal branches included); the row renders, adds, removes, validates spellings client-side, and surfaces rejections; the browser plugin registers the row with its injected face and removes it on fiber disposal.
