{
  description = "DeepSeek Harness monorepo: dev shell, dsh package, and NixOS module";

  inputs = {
    # 26.05 ships the complete pnpm packaging machinery (fetchPnpmDeps,
    # pnpmConfigHook) used by nixpkgs's vitejs; unstable lacks the fetcher.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;

      dshVersion = (builtins.fromJSON (builtins.readFile ./apps/cli/package.json)).version;
      # Official builds pin the client commit hash; the sandbox has no .git.
      commitHash = self.sourceInfo.rev or "0000000";

      # Official Node.js binaries rather than nixpkgs's source build. The
      # harness reads Node internals through the prebuilt
      # node-addon-require-builtin native module, whose runtime layout
      # detection recognizes only the official build's compiled accessor code;
      # nixpkgs's build (system ICU, shared libraries) makes it fail with
      # "Unsupported/no-getter" and profile boot then cannot resolve plugin
      # packages. CI runs the official binaries, so this matches the builder
      # of record. Version kept in step with nixpkgs's nodejs_24.
      nodeVersion = "24.18.0";
      officialNode =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          archive =
            {
              x86_64-linux = {
                arch = "linux-x64";
                ext = "tar.xz";
                sha256 = "55aa7153f9d88f28d765fcdad5ae6945b5c0f98a36881703817e4c450fa76742";
              };
              aarch64-linux = {
                arch = "linux-arm64";
                ext = "tar.xz";
                sha256 = "58c9520501f6ae2b52d5b210444e24b9d0c029a58c5011b797bc1fe7105886f6";
              };
              aarch64-darwin = {
                arch = "darwin-arm64";
                ext = "tar.gz";
                sha256 = "e1a97e14c99c803e96c7339403282ea05a499c32f8d83defe9ef5ec66f979ed1";
              };
            }
            .${system};
        in
        pkgs.stdenv.mkDerivation {
          pname = "nodejs-official";
          version = nodeVersion;
          src = pkgs.fetchurl {
            url = "https://nodejs.org/dist/v${nodeVersion}/node-v${nodeVersion}-${archive.arch}.${archive.ext}";
            sha256 = archive.sha256;
          };
          dontConfigure = true;
          dontBuild = true;
          dontStrip = true;
          # Official Linux binaries carry an /lib64 interpreter and glibc
          # linkage; repoint them at Nix's store so they run on NixOS.
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.autoPatchelfHook ];
          buildInputs = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
            pkgs.glibc
            pkgs.gcc.cc.lib
          ];
          installPhase = ''
            mkdir -p $out
            cp -R ./* $out/
            # The tarball's bin/npm, bin/npx, and bin/corepack are symlinks
            # into lib/node_modules whose targets carry `#!/usr/bin/env node`
            # shebangs; /usr/bin/env does not exist inside the Nix sandbox.
            # Patch the targets in place (never through the symlinks).
            sed -i "1s|^#!.*|#!$out/bin/node|" \
              $out/lib/node_modules/npm/bin/npm-cli.js \
              $out/lib/node_modules/npm/bin/npx-cli.js \
              $out/lib/node_modules/corepack/dist/corepack.js
          '';
        };

      # The repository's dependencies, fetched once through nixpkgs's pnpm
      # machinery: fetchPnpmDeps hashes a normalized, content-addressed store
      # tarball (timestamps stripped, permissions fixed), and pnpmConfigHook
      # performs a real offline `pnpm install` in each build.
      dshDeps =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.fetchPnpmDeps {
          pname = "dsh";
          version = dshVersion;
          src = self;
          # No workspace filter: the app build compiles the whole workspace.
          pnpmWorkspaces = [ ];
          fetcherVersion = 3;
          pnpm = pkgs.pnpm_11;
          # Set to the value reported by `nix build .#dshDeps` with "" on
          # first setup.
          hash = "sha256-05inTFX9qmJrkEJmDevdByPL708ILrER1hkVpgNGVrQ=";
        };

      # The dsh app built from this repository: full workspace build (tsc,
      # tsdown, vite frontend) against the fetched dependencies, shipped with
      # the complete tree so the profile loader resolves every workspace
      # package at runtime, wrapped to run under official Node.
      dsh =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = officialNode system;

          # landlock-run: the static-musl Landlock launcher the sandbox falls
          # back to when bubblewrap is missing or user namespaces are
          # restricted. Upstream builds the binaries in per-arch CI and packs
          # them into the npm platform packages; a workspace checkout has none
          # (git-ignored), so the packed dsh tree resolves an empty `bin/` and
          # probes "unusable" even on a Landlock kernel. Build the checked-in C
          # source with the same flags as native/landlock-run/scripts/build.ts
          # (-static against musl). Linux-only; the thunk is only forced by the
          # guarded installPhase below.
          landlockRun = pkgs.pkgsMusl.stdenv.mkDerivation {
            pname = "landlock-run";
            version = (builtins.fromJSON (builtins.readFile ./native/landlock-run/package.json)).version;
            src = self + "/native/landlock-run/packages/entry/src";
            dontConfigure = true;
            buildPhase = ''
              mkdir -p build
              cc -std=c11 -Os -Wall -Wextra -static -s -o build/landlock-run main.c
            '';
            installPhase = ''
              mkdir -p $out/bin
              cp build/landlock-run $out/bin/
            '';
          };
        in
        pkgs.stdenv.mkDerivation {
          pname = "dsh";
          version = dshVersion;
          src = self;
          nativeBuildInputs = [
            nodejs
            pkgs.pnpm_11
            pkgs.pnpmConfigHook
          ];
          pnpmDeps = dshDeps system;
          DSH_CLIENT_COMMIT_HASH = commitHash;
          buildPhase = ''
            pnpm run build
          '';
          installPhase = ''
            mkdir -p $out/bin $out/lib/dsh
            cp -a . $out/lib/dsh/
            ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
              # Ship the Landlock launcher where launcherPath() resolves it:
              # native/landlock-run/packages/linux-x64/bin/landlock-run (the
              # platform package under node_modules/.pnpm symlinks back here).
              mkdir -p $out/lib/dsh/native/landlock-run/packages/linux-x64/bin
              cp ${landlockRun}/bin/landlock-run \
                $out/lib/dsh/native/landlock-run/packages/linux-x64/bin/landlock-run
            ''}
            cat > $out/bin/dsh <<EOF
            #!${pkgs.runtimeShell}
            ${pkgs.lib.optionalString pkgs.stdenv.hostPlatform.isLinux ''
              # bubblewrap + bash: the sandbox wraps bash -c CMD and the bwrap
              # container inherits this PATH, so both must resolve inside it
              # (execvp looks them up there; NixOS has no /bin/bash).
              export PATH=${pkgs.bubblewrap}/bin:${pkgs.bash}/bin:\$PATH
            ''}
            exec ${nodejs}/bin/node $out/lib/dsh/apps/cli/lib/bin.js "\$@"
            EOF
            chmod +x $out/bin/dsh
          '';
          dontStrip = true;
        };

      # The local speech-to-text backend for Voice-Context: the FastAPI/uvicorn
      # STT server plus faster-whisper, assembled from nixpkgs. funasr (the
      # SenseVoiceSmall engine) is not packaged in nixpkgs, so that path keeps
      # the pip-based `/voice-local install` flow; everything the
      # faster-whisper path needs resolves here. Wire it into the web service
      # with `services.dsh-web.voiceContext = pkgs.dsh-stt;`.
      dshStt =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.python3.withPackages (ps: [
          ps.fastapi
          ps.uvicorn
          ps.python-multipart
          ps.python-dotenv
          ps.requests
          ps.huggingface-hub
          ps.faster-whisper
        ]);

      # Playwright browsers at the revisions the repo's pinned npm playwright
      # resolves (see nix/playwright-browsers.nix); the dev shell exports
      # PLAYWRIGHT_BROWSERS_PATH at them so the web e2e lane can launch.
      playwrightBrowsers =
        system:
        (import ./nix/playwright-browsers.nix) {
          pkgs = nixpkgs.legacyPackages.${system};
        };

      # The dev shell's fontconfig, shared by both Chromium builds: Chrome for
      # Testing is bundled with its own config, the headless shell reads this.
      devShellFontsConf =
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        pkgs.makeFontsConf {
          fontDirectories = [
            pkgs.dejavu_fonts
          ];
        };
    in
    {
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);

      packages = forAllSystems (system: {
        dsh = dsh system;
        dshDeps = dshDeps system;
        dsh-stt = dshStt system;
        playwright-browsers = playwrightBrowsers system;
        # `nix build` builds the repo-built dsh app by default.
        default = dsh system;
      });

      apps = forAllSystems (system: {
        # `nix run` launches the dsh CLI, e.g. `nix run .# -- web`.
        default = {
          type = "app";
          program = "${dsh system}/bin/dsh";
        };
      });

      # The NixOS module; the package option defaults to this flake's own
      # repo-built dsh, still overridable through `services.dsh-web.package`.
      nixosModules.default =
        { pkgs, lib, ... }:
        {
          imports = [ ./nix/dsh-web.nix ];
          config.services.dsh-web.package = lib.mkDefault self.packages.${pkgs.system}.dsh;
        };

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = officialNode system;

          # node-pty is the only native addon built from source: node-gyp
          # compiles it during `pnpm install`, so the C++ toolchain, make, and
          # Python must be on PATH. landlock-run's native build compiles with
          # musl-gcc (musl.dev), and the sandbox capability's tests shell out
          # to bubblewrap; both are Linux-only.
          nativeBuildInputs =
            with pkgs;
            [
              gcc
              gnumake
              pkg-config
              python3
            ]
            ++ lib.optionals stdenv.hostPlatform.isLinux [
              bubblewrap
              musl.dev
            ];
        in
        {
          default = pkgs.mkShell {
            packages =
              with pkgs;
              [
                nodejs # official build; see officialNode above.
                # pnpm/pnpx/yarn shims that honor package.json's packageManager
                # field, so the shell always runs the repo's pinned pnpm@11.7.0.
                corepack
                # python/sdk workflows: `uv sync --project python/sdk`.
                uv
                # lefthook postinstall and repo scripts call git.
                git
                jq
              ]
              ++ nativeBuildInputs;

            env = {
              # corepack downloads the pinned pnpm without prompting; the first
              # `pnpm` invocation fetches pnpm@11.7.0 into ~/.cache/node/corepack.
              COREPACK_ENABLE_DOWNLOAD_PROMPT = "0";
              # The web e2e lane (`pnpm run test:web`) launches Chromium through
              # the repo's pinned npm playwright; point it at the store-backed
              # browsers above instead of ~/.cache/ms-playwright.
              PLAYWRIGHT_BROWSERS_PATH = "${playwrightBrowsers system}";
              FONTCONFIG_FILE = devShellFontsConf system;
            };

            shellHook = ''
              pkg_manager="$(${nodejs}/bin/node -p 'try { require("./package.json").packageManager } catch { "unset" }' 2>/dev/null || echo unset)"
              echo "deepseek-harness dev shell: node $(${nodejs}/bin/node --version) · pnpm via corepack ($pkg_manager)"
            '';
          };
        }
      );
    };
}
