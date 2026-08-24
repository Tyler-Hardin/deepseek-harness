# Agent Note: nix 开发壳中的 Playwright 浏览器

Status: implemented

[English](2026-08-25-playwright-browsers-in-dev-shell.md) | 中文

> 适用范围：nix 开发壳如何提供 Web e2e 通道（`pnpm run test:web`、`apps/web/tests`）经由仓库固定的 npm `playwright` 启动 Chromium 所需的二进制。通道机制本身见 [GUI 测试体系说明](2026-07-20-gui-testing-system.zh.md)；承载开发壳的 flake 是仓库根目录的 `flake.nix`。

## Problem

Web e2e 通道通过仓库固定的 npm `playwright@1.61.1` 启动 Chromium，后者按精确的修订目录名（`chromium_headless_shell-1228/...`）从 `~/.cache/ms-playwright` 或 `$PLAYWRIGHT_BROWSERS_PATH` 解析浏览器。nix 开发壳两者皆无：无人填充缓存，而 nixpkgs 26.05 自带的 playwright 驱动（`playwright-driver 1.59.1`，chromium 修订 1217）版本不匹配——固定的 npm playwright 会拒绝 1217 修订目录，因此即使预装了 nixpkgs 浏览器集，对它也不可见。

## Decision

开发壳自带一套与固定 npm playwright 解析结果完全一致的浏览器：

- **`nix/playwright-browsers.nix`** 以固定输出 `fetchzip` 派生下载固定 `playwright@1.61.1` 对应的 Chrome for Testing 归档（chromium 修订 1228 / Chrome for Testing 149.0.7827.55）——每个受支持系统一份（x86_64-linux、aarch64-linux、x86_64-darwin、aarch64-darwin）——并组装成 `ms-playwright` 布局（`chromium-1228/`、`chromium_headless_shell-1228/`）。每个归档保留其顶层目录（`stripRoot = false`），这正是 playwright 在浏览器根目录内查找的平台目录名。
- Linux 构建对 nixpkgs 驱动所用同一套运行库（显示/GPU/GLib 库）运行 `autoPatchelfHook`，并加 `appendRunpaths` 驱动库、用 store 版替换内置 Vulkan loader；macOS 归档原样拷贝。
- flake 导出 `packages.playwright-browsers`，开发壳将 `PLAYWRIGHT_BROWSERS_PATH` 指向它，并设置 `FONTCONFIG_FILE`（基于 `dejavu_fonts` 的 `makeFontsConf`），使 headless shell 能渲染文本。

归档内容哈希是**解包后**的 `fetchzip` 输出哈希，而非原始归档哈希：`nix store prefetch-file --unpack` 与 fetchzip 的输出规范化不一致，因此改为从 `fetchzip { hash = ""; }` 构建的 "got:" 行采集。

## Consequences

- `nix develop` 可以端到端运行 Web e2e 通道：浏览器启动步骤解析到 store 中的二进制，不再因缺少 `~/.cache/ms-playwright` 可执行文件而失败。
- 升级仓库的 `playwright` 依赖时，需同步更新 `nix/playwright-browsers.nix` 中的 `revision`/`browserVersion`（取自新 `playwright-core` 的 `browsers.json`）、重新采集八个 fetchzip 哈希，并对照 playwright-core 的 registry 表复核各平台的目录/二进制名。
- 浏览器归档 URL 是按浏览器版本键控的 Chrome for Testing CDN 路径（`cdn.playwright.dev/builds/cft/<version>/...`）；aarch64-linux 归档改走按修订键控的 `dbazure` CDN。

## Alternatives considered

| 已否决 | 一句话理由 |
|---|---|
| 复用 nixpkgs 的 `playwright-driver` 浏览器 | nixpkgs 26.05 自带 1.59.1 集（修订 1217）；固定的 npm playwright 1.61.1 会拒绝该修订目录名 |
| 把仓库 `playwright` 降到 nixpkgs 的 1.59.1 | 为迁就打包便利而降级一个受维护的安全敏感依赖 |
| 在壳里 `playwright install` 到 `~/.cache` | 非封闭、每个环境都要联网，且沙箱壳无法写入该缓存 |
| 把 nixpkgs 驱动的 `browsers.json`/哈希覆盖为 1228 | 修订数据与按修订的哈希硬编码在 nixpkgs 浏览器派生内部；换参数重调仍需要同样的新哈希与本文件所载的 URL 表 |
