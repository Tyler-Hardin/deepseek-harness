# Agent Note: Declare pnpm's install layout and keep git hooks off its automatic install

Status: implemented

English | [中文](2026-08-25-align-pnpm-virtual-store-setting.zh.md)

## Problem

`git push` hung forever on the lefthook pre-push hook (`⠹ waiting: typecheck`) from an interactive dev shell. The hook runs `pnpm run typecheck`, and pnpm 11 defaults `verify-deps-before-run` to `install`: before running any script, `pnpm run` compares the workspace state recorded at install time against the current config and, on any disagreement, spawns `pnpm install` with inherited stdio. The install command resolves `enableGlobalVirtualStore` to `false` by default, so every install records `false` in the workspace state, while a plain `pnpm run` resolves the setting to unset; the comparison false-positives on every run. The workspace's `node_modules/.pnpm/lock.yaml` was also absent, so the spawned install read an unverifiable state and planned a purge-and-reinstall of the modules directory; its confirmation prompt waits on the pseudo-TTY that lefthook gives commands by default, hidden behind the spinner — the push appears to hang forever.

## Decision

`pnpm-workspace.yaml` makes two declarations.

`enableGlobalVirtualStore: false` matches the project-local virtual store layout (`<repo>/node_modules/.pnpm`) that every install in this repository has produced, so install-time and run-time config agree and the false positive is gone rather than bypassed.

`verifyDepsBeforeRun: false` keeps a script run from ever attempting an install. `pnpm run` driven by a git hook has no TTY, so any residual disagreement — a different store directory, a dependency added on another machine — cannot be answered: the modules-purge confirmation waits on a prompt nobody can see, and the hook blocks. Installs happen by hand in the dev shell after a dependency change, which is where the developer can see the prompt and answer it.

## Alternatives considered

**Declare only the layout and leave the automatic install enabled.** Rejected: the guard still fires whenever the recorded state and the resolved config disagree for an unrelated reason (store directory, machine-specific manifests), and in a hook that is a hang rather than a question.

**Declare only `verifyDepsBeforeRun: false` and leave the layout implicit.** Rejected: the layout would remain a resolved default that can flip with a pnpm release, and the check would keep false-positiving for anyone who re-enables it.

**Point the dev shell at a workspace-local store through an env var.** Rejected after testing: `store-dir` is not a workspace-state key and does not change the `enableGlobalVirtualStore` comparison, so it cannot make the check pass.

**Set `CI` in the dev shell.** Rejected: CI mode changes pnpm behavior broadly (purge confirmation, reporting) beyond this check.

**Only reinstall.** Rejected: the mismatch is structural — the install command defaults the setting to `false` while `pnpm run` leaves it unset — so a fresh default install records `false` again and the check keeps false-positiving; the setting must be declared.

## Consequences

`pnpm run` runs scripts directly, so the pre-push typecheck completes in seconds and no hook can block on an unseen prompt. A genuinely stale `node_modules` is no longer auto-repaired by a script run: run `pnpm install` yourself after changing dependencies.

## Related

The [fast local git hooks](../../archived/process/2026-07-22-fast-local-git-hooks.md) decision owns the pre-push checkpoint and its `pnpm run typecheck` command; this note changes pnpm's configuration under that command, not the hook itself.
