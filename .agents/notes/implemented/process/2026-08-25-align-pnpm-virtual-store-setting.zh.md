# Agent Note：声明 pnpm 的安装布局，并让 git 钩子不再触发自动安装

Status: implemented

[English](2026-08-25-align-pnpm-virtual-store-setting.md) | 中文

## 问题

在交互式开发 shell 中，`git push` 会永久卡在 lefthook 的 pre-push 钩子（`⠹ waiting: typecheck`）上。该钩子运行 `pnpm run typecheck`，而 pnpm 11 把 `verify-deps-before-run` 默认设为 `install`：运行任何脚本之前，`pnpm run` 会比较安装时记录的 workspace 状态与当前配置，一旦不一致就以继承的 stdio 启动 `pnpm install`。install 命令默认把 `enableGlobalVirtualStore` 解析为 `false`，因此每次安装都会在 workspace 状态里记录 `false`，而普通的 `pnpm run` 把该设置解析为未设置；比较因此每次都误报。workspace 的 `node_modules/.pnpm/lock.yaml` 也缺失，于是被启动的安装读到不可验证的状态，计划清空并重装 modules 目录；它的确认提示在等待 lefthook 默认提供的伪终端，隐藏在海豚动画之后——push 看起来就永久卡住了。

## 决策

`pnpm-workspace.yaml` 作出两项声明。

`enableGlobalVirtualStore: false` 与本仓库每次安装产生的项目内虚拟存储布局（`<repo>/node_modules/.pnpm`）一致，安装时与运行时的配置因此相符，误报被消除而不是被绕过。

`verifyDepsBeforeRun: false` 保证脚本运行永远不会尝试安装。由 git 钩子驱动的 `pnpm run` 没有终端，任何残留的不一致——不同的 store 目录、在另一台机器上新增的依赖——都无法被回答：清空重装的确认会等待一个没人能看见的提示，钩子就此阻塞。依赖变更后在开发 shell 里手动执行安装，那里开发者能看到提示并作答。

## 考虑过的替代方案

**只声明布局，保留自动安装。** 否决：只要记录状态与解析配置因无关原因不一致（store 目录、机器专属 manifest），该检查仍会触发，而在钩子里那是卡死而不是提问。

**只声明 `verifyDepsBeforeRun: false`，让布局保持隐式。** 否决：布局会继续是随 pnpm 版本可能翻转的默认值；一旦有人重新启用该检查，误报立刻回来。

**通过环境变量让开发 shell 使用 workspace 内的 store。** 测试后否决：`store-dir` 不是 workspace 状态键，不改变 `enableGlobalVirtualStore` 的比较，因此无法让检查通过。

**在开发 shell 里设置 `CI`。** 否决：CI 模式会在这项检查之外广泛改变 pnpm 行为（清空确认、上报）。

**只重新安装。** 否决：错配是结构性的——install 命令把该设置默认为 `false`，而 `pnpm run` 保持未设置——因此重新做一次默认安装仍会记录 `false`，检查会继续误报；必须声明该设置。

## 后果

`pnpm run` 直接运行脚本，pre-push 的 typecheck 数秒内完成，任何钩子都不会阻塞在看不见的提示上。真正过期的 `node_modules` 不再由脚本运行自动修复：依赖变更后请自行运行 `pnpm install`。

## 相关

[本地快速 git 钩子](../../archived/process/2026-07-22-fast-local-git-hooks.md)决策拥有 pre-push 检查点及其 `pnpm run typecheck` 命令；本记录改变该命令之下的 pnpm 配置，而不是钩子本身。
