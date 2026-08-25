# Agent Note: Align pnpm's virtual-store setting with the installed layout

Status: implemented

[English](2026-08-25-align-pnpm-virtual-store-setting.md) | 中文

## 问题

在交互式开发 shell 中执行 `git push` 时，lefthook 的 pre-push 钩子（`⠹ waiting: typecheck`）会永远挂起。该钩子运行 `pnpm run typecheck`，而 pnpm 11 将 `verify-deps-before-run` 默认设为 `install`：运行任何脚本之前，`pnpm run` 会把安装时记录的工作区状态与当前配置比较，一旦不一致就用继承的 stdio 启动 `pnpm install`。install 命令默认把 `enableGlobalVirtualStore` 解析为 `false`，因此每次安装都会在工作区状态中记录 `false`，而普通的 `pnpm run` 将该设置解析为未设置；该比较每次运行都会误报。工作区的 `node_modules/.pnpm/lock.yaml` 也缺失，被启动的 install 读到无法验证的状态，于是计划清除并重装模块目录；其确认提示在 lefthook 默认提供给命令的伪终端上等待输入，被 spinner 遮住——push 看起来永远挂起。

## 决策

`pnpm-workspace.yaml` 声明 `enableGlobalVirtualStore: false`，与本仓库每次安装产生的项目本地虚拟 store 布局一致。安装时与运行时的配置现在一致，pnpm 11 的 `verify-deps-before-run` 检查因此以正确理由通过，`pnpm run` 直接运行脚本而不再启动安装。一次 `pnpm install` 修复了工作区状态：写入了缺失的 `node_modules/.pnpm/lock.yaml`，记录了对齐后的设置，并把 `lastValidatedTimestamp` 刷新到更新的工作区 manifest 之后。

## 备选方案

**禁用检查（`verifyDepsBeforeRun: false`）。** 被否决：它绕过了为防止脚本在过期依赖上运行而存在的合法过期守卫。

**通过环境变量让开发 shell 使用工作区本地 store。** 经测试后被否决：`store-dir` 不是工作区状态键，也不会改变 `enableGlobalVirtualStore` 的比较，因此无法让检查通过。

**在开发 shell 中设置 `CI`。** 被否决：CI 模式会改变此检查之外的 pnpm 行为（清除确认、报告）。

**仅重新安装。** 被否决：不一致是结构性的——install 命令默认把该设置解析为 `false`，而 `pnpm run` 保持未设置——因此一次默认安装会再次记录 `false`，检查仍会误报；必须声明该设置。

## 影响

`verify-deps-before-run` 检查保持启用且现在通过：`pnpm run` 直接运行脚本，pre-push typecheck 数秒内完成。仓库声明了项目本地虚拟 store，与其实装一直产生的布局一致。真正过期的 `node_modules` 会再次被检查发现，而不会被悄悄自动安装带过。

## 相关

[快速本地 git 钩子](2026-07-22-fast-local-git-hooks.zh.md)决策拥有 pre-push 检查点及其 `pnpm run typecheck` 命令；本笔记改变的是该命令下 pnpm 的配置，而非钩子本身。
