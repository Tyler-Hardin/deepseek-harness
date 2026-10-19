# Local fork features

This file tracks what this fork adds on top of upstream DeepSeek Harness, so a rebase onto a new upstream release never silently loses a feature. It is fork-local documentation, not upstream documentation: keep it in the fork and out of any upstream pull request.

The fork's history rule applies to everything listed here: each feature is its own commit on top of a released upstream tag, each commit is built, linted, gated, and tested on its own, and a fix belongs in the commit that broke it rather than in a trailing cleanup commit.

## How to read the inventory

Each row names the feature, the commit subject that carries it on `rebase-0.2.1`, the paths that own it, and the surface a person or the model actually sees. The detail sections add the usage path, the verification, and what a future rebase must watch out for.

Commits are named by subject, not hash: `pnpm run doc-sync` rejects literal commit hashes in maintained files, and a hash would not survive the next rebase anyway.

| Feature | Commit subject | Where it lives |
|---|---|---|
| Nix flake, NixOS module, dev/test environment | feat(nix): add flake packaging, dsh-web NixOS module, and full dev/test env | `flake.nix`, `flake.lock`, `nix/dsh-web.nix`, `nix/playwright-browsers.nix`, `AGENTS.md` |
| Per-workspace default model | feat(workspace): per-workspace default model | `packages/core/agent-default-model`, `packages/api/session-controller`, `packages/api/workspace-controller`, `packages/client/ui-workspace` |
| Android WebView app + web-hosted App settings | feat(android): dsh Android WebView app with web-hosted App settings | `android/`, `packages/client/ui-app-settings` |
| Android task-completion notifications | feat(android): background task-completion notifications via foreground monitor | `android/app/src/main/java/ai/deepseek/dsh/`, `packages/client/ui-app-settings` |
| Server book (several servers on mobile) | feat(android): keep several servers and switch the active one | `android/app/src/main/java/ai/deepseek/dsh/ServerBook.kt`, `android/`, `packages/client/ui-app-settings` |
| mTLS-only connection (no browser handshake) | fix(connection): serve the configuration plane to https pages and declared trusted hosts (local fork) | `packages/client/connection`, `packages/experimental/inspector`, affected READMEs |
| Chat fold settles across backgrounding | fix(chat): settle a fold batch when the tab is hidden | `packages/client/ui-chat/src/client/chat/flow-motion.ts` |
| Mobile sidebar drawer | feat(sidebar): mobile drawer — swipe gestures and selection auto-close | `packages/client/ui-layout`, `packages/client/ui-sidebar`, `packages/client/ui-workspace` |
| Global extra writable roots | feat(sandbox): global extra writable roots | `packages/sandbox/sandbox-policy`, `packages/sandbox/sandbox`, `packages/sandbox/sandbox-local`, `packages/fs/fs-sandbox` |
| Slot-scan tolerance for a vanished file | fix(scripts): skip a slot-scan file that vanished while the scan ran | `scripts/slot-walk.ts` |
| pnpm install layout + git hooks off the automatic install | fix(tooling): declare pnpm's install layout and keep git hooks off its automatic install | `pnpm-workspace.yaml` |
| Sandbox writable roots on the Plugins settings page | feat(sandbox): edit the extra writable roots from the Plugins settings page | `packages/client/ui-settings-sandbox`, `packages/sandbox/sandbox-policy`, `packages/bundle/web-app` |
| Deployment default model on the Models page | feat(models): set the deployment default model from the Models page | `packages/client/ui-settings-models` |

The branch also carries its own bookkeeping: `pnpm-lock.yaml`, the regenerated catalogs (`docs/config-catalog*`, `docs/module-graph*`, `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`, `packages/extensions/tool-cordis/src/api-catalog.ts`, `packages/preset/agent-preset/skills/cordis-composition-reference/references/packages.md`), and Agent Notes under `.agents/notes/implemented/feature/`.

## Feature details

### Nix flake and dev shell

`nix build .#dsh` builds the CLI plus the Web GUI and the `dsh-web` systemd module; `nix develop` supplies Node, pnpm, the node-gyp toolchain, `uv`, and the Playwright browsers the web e2e lane launches (fixed-output derivations exported through `PLAYWRIGHT_BROWSERS_PATH` and `FONTCONFIG_FILE`). The flake pins nixpkgs and re-harvests the pnpm dependency hash from the release lockfile, so a rebase must update `flake.lock`, then `nix/dsh.nix`'s `fetchPnpmDeps` hash, then rebuild. `AGENTS.md` records that every fork command runs inside the dev shell.

### Per-workspace default model

`ctx.agentDefaultModel` owns the shared selection and at most one explicit override per workspace (`workspaceDefaults`, keyed by workspace id). Resolution order is logged route, then workspace override, then shared default. The Workspace row menu opens a dialog that reads the advisory model catalog and writes the override; the Session switch routes into the workspace override when the Session's Workspace has one. Both saves share one submission-ordered queue, so a rejected write never blocks a later one.

Watch on rebase: `agent-default-model`'s `saveSelection` must capture the submitted values *before* queueing (a caller that mutates its object must not change what lands), and the shared save must preserve sibling overrides. `session-controller`'s `commands.ts` reads `sessionWorkspaceId(...)`; it routes the save to the workspace override or the shared default, and the write stays in the background with `void … .catch(...)`.

### Android app, notifications, and App settings

`android/` is a WebView shell that hosts the Web GUI; `packages/client/ui-app-settings` serves the App settings page the native shell reads (version, notification toggle). The notification monitor is a foreground service that watches task completion and posts a system notification. Nothing here is built by the Node toolchain, so a rebase only needs the client package to compile and its tests to pass.

### mTLS-only connection

The deployment reaches the Host through a TLS reverse proxy that authenticates the client, so Connection runs no browser handshake: no launch token, no cookie, no `credentials` injection. `admit()` applies the Host/Origin fence and returns the shared owner Peer; `authorizeIndex()` always serves; `authenticatedUrl()` returns the deployment URL without a query; `/connect` only redirects. An HTTPS page counts as privileged (`ConnectionLocation.protocol`), which is what lets a TLS-fronted deployment reach the configuration plane.

Watch on rebase: upstream keeps changing this package. Match its current Peer naming, keep `createSharedFetchHandler(…).fetch(request, peer)`, and delete the browser-auth module and its specs whenever it reappears. Tests that script a cookie jar must lose it; the fence is the whole gate.

### Mobile sidebar drawer

Below the auto-collapse breakpoint the sidebar overlays the conversation as a drawer: an edge swipe opens it, a leftward swipe or a scrim tap closes it, and opening or starting a Session closes it. `closeSidebar` is a layout action; the frame gates it to narrow viewports so the desktop column survives selections.

Watch on rebase: keep the gated `closeDrawer` wiring in `AppFrame` and the `closeSidebar` owner-share callback threaded to the workspace browser. Expect the narrow-viewport layout assertions in `apps/web/tests/*.e2e.ts` to need the drawer grid (`[0, 767, 0]` instead of a 56px rail).

### pnpm install layout and git hooks

`pnpm-workspace.yaml` declares the project-local virtual store (`enableGlobalVirtualStore: false`, the layout every install here produces) and turns `verifyDepsBeforeRun` off. Without the first declaration pnpm 11's check compares `false` against `unset` and false-positives on every run; without the second, any residual disagreement makes a hook-driven `pnpm run` spawn a nested `pnpm install`, whose modules-purge prompt waits on lefthook's pseudo-TTY and appears to hang `git commit`/`git push` forever. Installs are explicit in the dev shell, where the prompt is visible.

### Global extra writable roots and the Plugins page

`workspace-write` may write under additional host-local directories (`extraWritableRoots`: absolute or `~/`-prefixed; remote worlds never receive them). The field is volatile, so a settings save reaches the next `resolve()` without a reload, and `@deepseek-ai/dsh-client-ui-settings-sandbox` serves the `沙箱` page that edits it, above the provider-style cards in the `basic` group.

Watch on rebase: schedule the schema stays unannotated (`static Config` without `z<Config>`) because schemastery drops the `Volatile` marker through that mapping. The page needs its `tsconfig.base.json` alias, a client solution reference, the bundle patch row and dependency, and an audited one-sentence Model Experience entry in `scripts/verify-package-readme-model-experience.ts`.

### Deployment default model on the Models page

Model settings carries a Default model row above the provider cards; it reads the live `session/modelCatalog` and writes the `agent-default-model` entry through the shared configuration form, so the write is revision-fenced and per-workspace overrides survive it.

Watch on rebase: the row's store read adds `remote.session.modelCatalog()` to `ModelsSettingsStore.read`, so every test fixture that scripts `ctx.remote.session` must carry it; merging it into an existing `session` face (rather than replacing it) is what the specs now do.

### Dropped upstream features (deliberately not re-applied)

- SSH execution providers and "worlds" containment.
- Voice input and speech-to-text.
- Session unarchive.
- The vendored `dockkit` corpus pin.
- The General-settings row that duplicated the sandbox roots field.

## Activated baseline

The systemd `dsh-web` service runs the dsh build baked into the active NixOS generation. To answer "which commit am I actually using" without trusting `/etc/nixos`, read the commit hash the flake stamped into the running build:

```sh
readlink -f /run/current-system                       # running generation
readlink -f /nix/var/nix/profiles/system              # next-boot generation
nix-store -qR /run/current-system | grep 'dsh-0\.'    # dsh build inside it
nix derivation show "$(nix-store -q --deriver <dsh-build>)" | grep -o '"DSH_CLIENT_COMMIT_HASH":"[0-9a-f]*"'
```

State on 2026-10-18 (unchanged since the last activation):

- Running and next-boot system are both generation 53 (`/nix/store/3q8ljvyz…-nixos-system-gb-26.05.20260924.…`), built 2026-10-05 12:16.
- That generation carries the dsh build `/nix/store/cjxy8cj72m5pqd41dqv0yswvf5xfigd1-dsh-0.1.7-rc.1`.
- Its derivation stamps `DSH_CLIENT_COMMIT_HASH` with the commit the build was made from; the value matches the `dsh-v0.1.7-rc.1` replay's tip, which is why this rebase started from that branch rather than from the never-activated follow-ups.

Generation 51 and 52 carry the same dsh build, so the service has been running the 0.1.7 replay since 2026-10-01 00:12.

## Local build environment notes

- Every command runs inside `nix develop`; nothing here is installed system-wide.
- `verify-repository-references` reports one false positive in this fork: `python/sdk/uv.lock` line 113 carries a wheel `size` whose digits are a commit prefix in this fork's object database (an object upstream does not have). It is upstream's file, so the gate is tolerated only while that is the single finding.
- Three client tests fail on the untouched `dsh-v0.2.1-rc.2` tree and are tolerated the same way: the two `ui-schedule` device-zone assertions (this environment's device zone equals the rule zone) and the `ui-theme` component radius-scale comparison.
- While the hook-fallback path is stale (`node scripts/install-lefthook.mjs` refreshes it, `LEFTHOOK=0` skips it), automated commits use `LEFTHOOK=0` and run the same checks explicitly.
- A clean `pnpm run clean && pnpm run build` matters before judging a suite: an incremental build keeps a stale bundle when a dependency's export changed, which shows up as a module-level import failure in `transform-corpus` rather than as a type error.

### Server book (several servers on mobile)

The Android app keeps a list of dsh hosts instead of one hostname, so a phone can
switch between a personal and a work deployment. `ServerBook`/`ServerEdits` are
platform-free Kotlin and own the two invariants the UI relies on: a URL is unique
across the book (refused at the add and edit seams with the bridge's reason) and
entry ids stay stable, so selection, the remembered mTLS certificate, and the
background monitor follow the row across label and URL edits. The App settings
page lists the servers, marks the active one, and switches with **Use**
(`selectServer` then a reload at that origin); the native screen remains the
offline fallback and edits the active entry.

A pre-multi-server install could reach exactly one backend, so migration has
nothing to disambiguate: it keeps the stored URL and certificate, mints one
entry, and leaves the label empty — the one value the old store never had — which
the UI renders as **unset**. Watch-out on rebase: the bridge is the
platform-neutral contract (`window.DshApp`); the web page treats the server-book
methods as optional so older app builds keep working.

### Chat fold settles across backgrounding

Upstream folds a turn's blank areas by animating row heights on animation frames. Firefox throttles
those frames for a hidden tab, so a batch that starts or outlives backgrounding keeps the collapsed
inline row sizes it applied before the first frame; coming back to the tab shows an empty
conversation until the page reloads.

`fix(chat): settle a fold batch when the tab is hidden` commits the batch's final state at once when
the document is hidden and finishes an in-flight batch on the next `visibilitychange` to visible. A
visible tab keeps the animation unchanged. Watch-out on rebase: upstream's `flow-motion.ts` owns this
file; re-apply the visibility hook if its batch loop is rewritten.

### Tolerated test failures in this environment

Measured against a pristine `dsh-v0.2.1-rc.2` worktree with its own install and build, not by inspection.

Full `pnpm run test` on this machine ends 17 tests short of green, the same set with and without the fork:

- Fourteen need a real interactive shell: `terminal-bash` (7), `apps/desktop` login-shell environment (4), `tool-bash-persistent` (1), `tool-terminal` (1), `terminal-controller` (1). This host has no `/bin/bash` and no PTY.
- `ptc-runtime-python` probes a CPython version the dev shell's interpreter does not report the way the test expects.
- `llm-mock-server` cannot bind `::1` (no IPv6 loopback here).
- The two `ui-schedule` device-zone assertions (this environment's device zone equals the rule zone).

The full web e2e replay lane (`DSH_SNAPSHOT=replay pnpm run test:web:built`) fails these on the pristine tree as well:

- No PTY: `sidebar-terminal`, `shortcuts-panels`, `shipped-composition`.
- No WebKit build: `declared-reasoning`, `session-replay-reload`.
- Failing on upstream in this environment: `user-text-secret-mask`, `fold-blank-matrix`, `seeded-history`, `ptc-round`, `document-preview`, `permission-policy-context`, `minimal-preset.snapshot`, `queue-actions`.

Two 0.2.1 files that pass upstream need the drawer's semantics in this fork, and their goldens record that: `layout-bottom` (the closed rail is an overlay spanning the frame, so the narrow sidebar box is the overlay's) and `schedule-header` (expanding the sidebar at narrow widths overlays the column instead of squeezing it, so the title keeps one line and New stays beside it). `details-session-lifecycle` and `caption-overlays` follow the same narrow layout.

