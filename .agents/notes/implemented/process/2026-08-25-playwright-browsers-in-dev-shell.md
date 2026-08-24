# Agent Note: Playwright browsers in the nix dev shell

Status: implemented

English | [中文](2026-08-25-playwright-browsers-in-dev-shell.zh.md)

> Scope: how the nix dev shell provisions the Chromium binaries the web e2e lane (`pnpm run test:web`, `apps/web/tests`) launches through the repo's pinned npm `playwright`. The lane mechanics themselves are the [GUI testing system note](2026-07-20-gui-testing-system.md); the flake that hosts the dev shell is `flake.nix` at the repository root.

## Problem

The web e2e lane launches Chromium through the repo's pinned npm `playwright@1.61.1`, which resolves its browsers from `~/.cache/ms-playwright` or `$PLAYWRIGHT_BROWSERS_PATH` by an exact revision directory name (`chromium_headless_shell-1228/...`). A nix dev shell has neither: nothing populates the cache, and nixpkgs 26.05's own playwright driver (`playwright-driver 1.59.1`, chromium revision 1217) does not match — the pinned npm playwright rejects the 1217 revision directory, so even a preinstalled nixpkgs browser set is invisible to it.

## Decision

The dev shell provisions its own browser set at exactly the revisions the pinned npm playwright resolves:

- **`nix/playwright-browsers.nix`** fetches the Chrome for Testing archives for the pinned `playwright@1.61.1` (chromium revision 1228 / Chrome for Testing 149.0.7827.55) as fixed-output `fetchzip` derivations — one archive per supported system (x86_64-linux, aarch64-linux, x86_64-darwin, aarch64-darwin) — and assembles the `ms-playwright` layout (`chromium-1228/`, `chromium_headless_shell-1228/`). Each archive keeps its top-level directory (`stripRoot = false`), which is exactly the platform directory playwright looks for inside the browser root.
- Linux builds run `autoPatchelfHook` against the same runtime-library set nixpkgs's driver uses (display/GPU/GLib libraries) plus the `appendRunpaths` driver libraries, and replace the bundled Vulkan loader with the store one; macOS archives are copied as-is.
- The flake exports `packages.playwright-browsers` and the dev shell sets `PLAYWRIGHT_BROWSERS_PATH` to it, plus `FONTCONFIG_FILE` (a `makeFontsConf` over `dejavu_fonts`) so the headless shell renders text.

The archive content hashes are the **unpacked** `fetchzip` output hashes, not the raw archive hashes: `nix store prefetch-file --unpack` does not match fetchzip's output normalization, so they are harvested from the "got:" line of a `fetchzip { hash = ""; }` build instead.

## Consequences

- `nix develop` can run the web e2e lane end to end: the browser launch step resolves store-backed binaries instead of failing on a missing `~/.cache/ms-playwright` executable.
- Bumping the repo's `playwright` dependency requires updating `revision`/`browserVersion` in `nix/playwright-browsers.nix` (from the new `playwright-core`'s `browsers.json`), re-harvesting the eight fetchzip hashes, and re-checking each platform's expected directory/binary names against playwright-core's registry table.
- The browser archive URLs are the Chrome for Testing CDN paths keyed by browser version (`cdn.playwright.dev/builds/cft/<version>/...`); the aarch64-linux archives come from the revision-keyed `dbazure` CDN instead.

## Alternatives considered

| Rejected | One-line reason |
|---|---|
| Reuse nixpkgs's `playwright-driver` browsers | nixpkgs 26.05 ships the 1.59.1 set (revision 1217); the pinned npm playwright 1.61.1 rejects the revision directory name |
| Align the repo's `playwright` down to nixpkgs's 1.59.1 | Downgrades a maintained security-sensitive dependency to match packaging convenience |
| `playwright install` into `~/.cache` from the shell | Non-hermetic, needs network per environment, and sandboxed shells cannot write that cache |
| Override the nixpkgs driver's `browsers.json`/hashes to 1228 | The revision data and per-revision hashes are hardcoded inside nixpkgs's browser derivations; re-calling them with new args still requires the same new hashes and URL table this file carries |
