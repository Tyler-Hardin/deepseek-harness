# Agent Note: Align pnpm's virtual-store setting with the installed layout

Status: implemented

English | [中文](2026-08-25-align-pnpm-virtual-store-setting.zh.md)

## Problem

`git push` hung forever on the lefthook pre-push hook (`⠹ waiting: typecheck`) from an interactive dev shell. The hook runs `pnpm run typecheck`, and pnpm 11 defaults `verify-deps-before-run` to `install`: before running any script, `pnpm run` compares the workspace state recorded at install time against the current config and, on any disagreement, spawns `pnpm install` with inherited stdio. The install command resolves `enableGlobalVirtualStore` to `false` by default, so every install records `false` in the workspace state, while a plain `pnpm run` resolves the setting to unset; the comparison false-positives on every run. The workspace's `node_modules/.pnpm/lock.yaml` was also absent, so the spawned install read an unverifiable state and planned a purge-and-reinstall of the modules directory; its confirmation prompt waits on the pseudo-TTY that lefthook gives commands by default, hidden behind the spinner — the push appears to hang forever.

## Decision

`pnpm-workspace.yaml` declares `enableGlobalVirtualStore: false`, matching the project-local virtual store layout that every install in this repository has produced. Install-time and run-time config now agree, so pnpm 11's `verify-deps-before-run` check passes for the right reason and `pnpm run` runs scripts directly without spawning an install. A one-time `pnpm install` repaired the workspace state: it wrote the missing `node_modules/.pnpm/lock.yaml`, recorded the aligned settings, and refreshed `lastValidatedTimestamp` past the newer workspace manifests.

## Alternatives considered

**Disable the check (`verifyDepsBeforeRun: false`).** Rejected: it bypasses a legitimate staleness guard that exists to stop scripts running against stale dependencies.

**Point the dev shell at a workspace-local store through an env var.** Rejected after testing: `store-dir` is not a workspace-state key and does not change the `enableGlobalVirtualStore` comparison, so it cannot make the check pass.

**Set `CI` in the dev shell.** Rejected: CI mode changes pnpm behavior broadly (purge confirmation, reporting) beyond this check.

**Only reinstall.** Rejected: the mismatch is structural — the install command defaults the setting to `false` while `pnpm run` leaves it unset — so a fresh default install records `false` again and the check keeps false-positiving; the setting must be declared.

## Consequences

The `verify-deps-before-run` check stays enabled and now passes: `pnpm run` runs scripts directly, and the pre-push typecheck completes in seconds. The repository declares a project-local virtual store, which matches the layout its installs have always produced. A genuinely stale `node_modules` is again detected by the check instead of being silently auto-installed past.

## Related

The [fast local git hooks](2026-07-22-fast-local-git-hooks.md) decision owns the pre-push checkpoint and its `pnpm run typecheck` command; this note changes pnpm's configuration under that command, not the hook itself.
