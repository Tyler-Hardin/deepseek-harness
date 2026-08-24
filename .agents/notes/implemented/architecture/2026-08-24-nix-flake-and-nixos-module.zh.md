# Agent Note: Nix flake 打包与 dsh-web NixOS 模块

Status: implemented

[English](2026-08-24-nix-flake-and-nixos-module.md) | 中文

## 问题

本仓库此前没有任何 Nix 打包：flake 只提供开发 shell（devShell），因此把 `dsh web` 当作服务器运行意味着手动安装工具并手工管理进程。从仓库直接打包应用还面临两个环境约束：nixpkgs 的 Node.js 构建会让预编译的 `node-addon-require-builtin` 原生模块在运行时失败（`Unsupported/no-getter`，见 [flake.nix](../../../../flake.nix)——loader 访问 Node 内部模块必须使用官方二进制）；手工编写的依赖抓取还必须保持可复现。

## 决策

[flake.nix](../../../../flake.nix) 现在暴露：

- `packages.<system>.dsh`（以及 `.default`）：从本仓库构建的应用——依赖通过 nixpkgs 的 `fetchPnpmDeps`（固定输出 store 压缩包，fetcherVersion 3）与 `pnpmConfigHook`（构建内的离线 `pnpm install`）获取，随后执行完整工作区 `pnpm run build`，连同完整目录树一起交付，使 profile loader 在运行时能解析每个工作区包，并包装为在官方 Node.js 二进制下运行。
- `apps.<system>.default`：同一个 CLI，`nix run .# -- web` 即可启动服务器。
- `nixosModules.default`：[模块](../../../../nix/dsh-web.nix) 暴露 `services.dsh-web`——`user`、`group`、`workingDir`（默认：运行用户的家目录）、`dshHome`（默认不设置，因此服务解析运行用户的 `~/.dsh`，与该用户 CLI 的设置、凭据和会话共享）、`host`、`port`、`trustedHosts`、`environment`、`inheritSystemPath`（默认 `true`）、`extraPackages`（默认 `[ ]`）与 `extraArgs`。unit 始终传入 `--no-open`，失败时重启，并加入 `multi-user.target`。Agent 的 bash 命令在继承服务环境的 bwrap 沙箱中执行，因此 `inheritSystemPath` 通过 `systemd.services.<name>.path` 将系统 profile（`config.system.path`，即 `environment.systemPackages` 的 profile）前置到服务 PATH；设为 `false` 则保持最小 systemd PATH 及包装脚本的 bubblewrap 与 bash 条目。`extraPackages` 将命名包加入服务 PATH：继承系统 profile 时位于其后，关闭 `inheritSystemPath` 时单独生效，因此最小化部署仍能获得所需工具。按用户 profile（home-manager、`nix-env`）不在其中。
- `devShells` 与 `formatter` 不变。

flake 输入为 `nixos-26.05` 分支，它带有完整的 pnpm 机制；此前锁定的 unstable 修订只有 `pnpmConfigHook` 而没有 `fetchPnpmDeps`。

## 曾考虑的替代方案

- **发布 npm 包**——已否决：模块必须构建仓库自己的版本，而不是下载的 tarball。
- **手工编写固定输出依赖抓取**——已否决：`pnpm install` 会把时间戳（`.modules.yaml` 的 `prunedAt`、`.pnpm-workspace-state-v1.json` 的 `lastValidatedTimestamp`）和安装路径 shim 写入 `node_modules`，因此对安装输出做哈希不可复现；`fetchPnpmDeps` 只对规范化后的内容寻址 store 做哈希。
- **nixpkgs 的 Node.js 构建**——已否决：`node-addon-require-builtin` 在其上会失败；官方二进制与 CI 一致。
- **保持最小 systemd PATH**——已否决：安装在 `environment.systemPackages` 中的 `git`、`node`、`curl` 等主机工具在沙箱内只能通过绝对路径解析，而 `user` 选项承诺服务行为与用户从终端启动的 `dsh web` 一致。
- **要么继承整个系统 profile，要么什么都没有**——已否决：关闭 `inheritSystemPath` 的部署仍需要特定工具，且部分工具不在系统 profile 中。

## 后果

- 官方 Node.js 版本在 flake 中固定（24.18.0）；tarball 的 `npm`/`npx`/`corepack` 符号链接目标会写入 store 本地的 shebang，因为 Nix 沙箱内不存在 `/usr/bin/env`。
- lockfile 变更需要重新引导 `dshDeps` 哈希（`hash = ""`，构建，粘贴报告的值）。
- `services.dsh-web` unit 是普通 systemd 服务，因此 `systemd.services.dsh-web.*` 覆盖仍然可用。
- 运行时验证：打包后的 `dsh web` 在 `127.0.0.1:3080` 上返回 HTTP 200，headless profile 启动到预期的缺少凭据阶段，`nix build` / `nix run .# -- web` 在干净检出下均可工作。
- 服务 PATH 默认包含系统 profile，因此 `environment.systemPackages` 工具可在沙箱内无需绝对路径即可解析；`nix eval` 渲染出系统 profile 的 `bin` 与 `sbin` 条目位于 `Environment=PATH` 开头，并确认 `inheritSystemPath = false` 时这些条目不存在。PATH 宽度不是安全边界：沙箱始终通过 bwrap 限制文件写入。
