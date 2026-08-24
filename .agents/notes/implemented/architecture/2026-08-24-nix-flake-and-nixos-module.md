# Agent Note: Nix flake packaging and the dsh-web NixOS module

Status: implemented

English | [中文](2026-08-24-nix-flake-and-nixos-module.zh.md)

## Problem

The repository had no Nix packaging: the flake provided only a development shell, so running `dsh web` as a server meant manual tool installation and process supervision. Packaging the app from the repository also faced two environment constraints: nixpkgs's Node.js build makes the prebuilt `node-addon-require-builtin` native module fail at runtime (`Unsupported/no-getter`, see [flake.nix](../../../../flake.nix) — the official binary is required for the loader's internal-module access), and a hand-rolled dependency fetch must stay reproducible.

## Decision

The flake ([flake.nix](../../../../flake.nix)) now exposes:

- `packages.<system>.dsh` (and `.default`): the app built from this repository — dependencies via nixpkgs's `fetchPnpmDeps` (fixed-output store tarball, fetcherVersion 3) and `pnpmConfigHook` (offline `pnpm install` in the build), then the full workspace `pnpm run build`, shipped with the complete tree so the profile loader resolves every workspace package, wrapped to run under official Node.js binaries.
- `apps.<system>.default`: the same CLI, so `nix run .# -- web` launches the server.
- `nixosModules.default`: a [module](../../../../nix/dsh-web.nix) exposing `services.dsh-web` — `user`, `group`, `workingDir` (default: the run user's home), `dshHome` (default unset, so the service resolves `~/.dsh` of the run user and shares settings, credentials, and sessions with that user's CLI), `host`, `port`, `trustedHosts`, `environment`, `inheritSystemPath` (default `true`), `extraPackages` (default `[ ]`), and `extraArgs`. The unit always passes `--no-open`, restarts on failure, and joins `multi-user.target`. Agent bash commands run in a bwrap sandbox that inherits the service environment, so `inheritSystemPath` prepends the system profile (`config.system.path`, the `environment.systemPackages` profile) to the service PATH through `systemd.services.<name>.path`; `false` keeps the minimal systemd PATH plus the wrapper's bubblewrap and bash entries. `extraPackages` adds named packages to the service PATH after the system profile when inherited, and alone when `inheritSystemPath` is off, so a minimal deployment still gets the tools it needs. Per-user profiles (home-manager, `nix-env`) are excluded.
- `devShells` and `formatter` unchanged.

The flake input is the `nixos-26.05` branch, which ships the complete pnpm machinery; the previously locked unstable revision had `pnpmConfigHook` but not `fetchPnpmDeps`.

## Alternatives considered

- **Publish the npm package** — rejected: the module must build the repository's own version, not a downloaded tarball.
- **Hand-rolled fixed-output dependency fetch** — rejected: `pnpm install` writes timestamps (`.modules.yaml` `prunedAt`, `.pnpm-workspace-state-v1.json` `lastValidatedTimestamp`) and install-path shims into `node_modules`, so hashing the install output was non-reproducible; `fetchPnpmDeps` hashes only the normalized content-addressed store.
- **nixpkgs's Node.js build** — rejected: `node-addon-require-builtin` fails on it; official binaries match CI.
- **Keep the minimal systemd PATH** — rejected: host tools such as `git`, `node`, and `curl` installed in `environment.systemPackages` resolve only by absolute path inside the sandbox, and the `user` option promises a service that behaves like `dsh web` started from a terminal by that user.
- **Only inherit the whole system profile or nothing** — rejected: a deployment that disables `inheritSystemPath` still needs specific tools, and some tools are not in the system profile.

## Consequences

- The official Node.js version is pinned in the flake (24.18.0); the tarball's `npm`/`npx`/`corepack` symlink targets get store-local shebangs because `/usr/bin/env` does not exist inside the Nix sandbox.
- A lockfile change requires re-bootstrapping the `dshDeps` hash (`hash = ""`, build, paste the reported value).
- The `services.dsh-web` unit is an ordinary systemd service, so `systemd.services.dsh-web.*` overrides remain available.
- Runtime verification: the packaged `dsh web` serves HTTP 200 on `127.0.0.1:3080`, the headless profile boots to the expected missing-credential stage, and `nix build` / `nix run .# -- web` work from a clean checkout.
- The service PATH includes the system profile by default, so `environment.systemPackages` tools resolve inside the sandbox without absolute paths; `nix eval` renders the system-profile `bin` and `sbin` entries leading `Environment=PATH` and confirms they are absent with `inheritSystemPath = false`. PATH breadth is not a security boundary: the sandbox confines file writes through bwrap regardless.
