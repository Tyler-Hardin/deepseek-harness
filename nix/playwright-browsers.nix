# Chromium and Chromium Headless Shell at the browser revisions the
# repository's pinned `playwright@1.61.1` expects (chromium revision 1228 /
# Chrome for Testing 149.0.7827.55), assembled into the `ms-playwright`
# layout so `PLAYWRIGHT_BROWSERS_PATH` resolves for the web e2e lane
# (`apps/web/tests`, `pnpm run test:web`). nixpkgs 26.05 ships the playwright
# 1.59.1 browser set (revision 1217), whose revision directory the pinned npm
# playwright rejects by name, so the dev shell fetches its own fixed-output
# Chrome for Testing archives instead of reusing the nixpkgs driver.
{
  pkgs,
}:
let
  inherit (pkgs) lib stdenv;
  inherit (stdenv.hostPlatform) system;

  # playwright-core 1.61.1 browsers.json (node_modules/.pnpm/playwright-core@1.61.1).
  revision = "1228";
  browserVersion = "149.0.7827.55";

  cftUrl = path: "https://cdn.playwright.dev/builds/cft/${browserVersion}/${path}";
  registryUrl =
    archive:
    "https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/${revision}/${archive}";

  # One Chrome for Testing archive per supported system: download URL and the
  # fixed-output content hash (`nix store prefetch-file`). stripRoot stays
  # false so each archive keeps its top-level directory — which is exactly
  # the directory name playwright looks for inside the browser root.
  archives = {
    x86_64-linux = {
      chromium = {
        url = cftUrl "linux64/chrome-linux64.zip";
        hash = "sha256-XE+5c2thl/YUCMNCWrdi9E6Hee4GamLP8IPEbGyRXXI=";
      };
      headlessShell = {
        url = cftUrl "linux64/chrome-headless-shell-linux64.zip";
        hash = "sha256-wnN0SL8QqiFGZdevm06WOhR9o6q34+kHL5ay1mRYnxs=";
      };
    };
    aarch64-linux = {
      chromium = {
        url = registryUrl "chromium-linux-arm64.zip";
        hash = "sha256-Pv8TGESK41Sfz6cbc7oVnl5Bj1lBi58Br98fpaUztew=";
      };
      headlessShell = {
        url = registryUrl "chromium-headless-shell-linux-arm64.zip";
        hash = "sha256-d9Qr3q4GjtUp2ZVFSq+M2Ap++WKaEscRzEkk4JwXL/E=";
      };
    };
    x86_64-darwin = {
      chromium = {
        url = cftUrl "mac-x64/chrome-mac-x64.zip";
        hash = "sha256-LGnaeRgWq496mgoosN20ayiGmNyIFHMLM2Jl/lpALMg=";
      };
      headlessShell = {
        url = cftUrl "mac-x64/chrome-headless-shell-mac-x64.zip";
        hash = "sha256-eZXicAwu+9OFELVz+O/Lv6jEMTeLY6i+BZhY5RZ0+xA=";
      };
    };
    aarch64-darwin = {
      chromium = {
        url = cftUrl "mac-arm64/chrome-mac-arm64.zip";
        hash = "sha256-aJbvZQ1hY0FfDC+ZktfW2yNW3nwc0kh/P30+n/cmLf0=";
      };
      headlessShell = {
        url = cftUrl "mac-arm64/chrome-headless-shell-mac-arm64.zip";
        hash = "sha256-qWrMOreqTOFhmFBROlXIPXrM3wqNT7iJJwpelVFke6I=";
      };
    };
  };
  archive = archives.${system};

  browser =
    info:
    pkgs.fetchzip {
      inherit (info) url hash;
      stripRoot = false;
    };
in
stdenv.mkDerivation {
  pname = "playwright-browsers";
  version = "1.61.1";

  src = null;
  dontUnpack = true;
  dontConfigure = true;
  dontBuild = true;

  # Linux builds ship unpatchable Google binaries: repoint their dynamic
  # linkage at the store and add the display/GPU libraries Chromium dlopens
  # (the same set nixpkgs's playwright driver uses). macOS archives are used
  # as-is.
  nativeBuildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    pkgs.autoPatchelfHook
    pkgs.patchelf
  ];
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    pkgs.alsa-lib
    pkgs.at-spi2-atk
    pkgs.atk
    pkgs.cairo
    pkgs.cups
    pkgs.dbus
    pkgs.expat
    pkgs.glib
    pkgs.gobject-introspection
    pkgs.libgbm
    pkgs.libgcc.lib
    pkgs.libxkbcommon
    pkgs.nspr
    pkgs.nss
    pkgs.pango
    pkgs.stdenv.cc.cc.lib
    pkgs.systemd
    pkgs.libx11
    pkgs.libxcomposite
    pkgs.libxdamage
    pkgs.libxext
    pkgs.libxfixes
    pkgs.libxrandr
    pkgs.libxcb
  ];
  # Extra rpaths for the driver libraries Chromium loads at runtime.
  appendRunpaths = lib.makeLibraryPath [
    pkgs.libGL
    pkgs.vulkan-loader
    pkgs.pciutils
  ];
  # The bundled Vulkan loader is replaced by the store one (same-directory
  # lookup would otherwise shadow the rpath), as nixpkgs's driver does.
  postFixup = lib.optionalString stdenv.hostPlatform.isLinux ''
    ln -sf "${pkgs.lib.getLib pkgs.vulkan-loader}/lib/libvulkan.so.1" \
      $out/chromium-${revision}/chrome-linux*/libvulkan.so.1
  '';

  # Playwright resolves executable paths inside the browser roots from its
  # own registry (chromium-<rev>/<platform dir>/<binary>); each archive's
  # top-level directory already matches, so the copies are verbatim.
  installPhase = ''
    runHook preInstall

    mkdir -p $out/chromium-${revision} $out/chromium_headless_shell-${revision}
    cp -R ${browser archive.chromium}/. $out/chromium-${revision}/
    cp -R ${browser archive.headlessShell}/. $out/chromium_headless_shell-${revision}/

    runHook postInstall
  '';

  dontStrip = true;
}
