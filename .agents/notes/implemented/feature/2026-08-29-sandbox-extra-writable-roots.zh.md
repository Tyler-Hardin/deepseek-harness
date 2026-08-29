# Agent Note: 沙箱的全局额外可写根目录

Status: implemented

[English](2026-08-29-sandbox-extra-writable-roots.md) | 中文

## 问题

`workspace-write` 恰好授予会话工作区根目录加平台临时区域（[`writableRoots`](../../../../packages/sandbox/sandbox/src/roots.ts)）。用户若经常需要 agent 写入每个工作区之外的目录——`~/.cache` 就是反复出现的例子——只有两种都很生硬的选择：每次写入都批准一次 `danger-full-access` 升权重试（授权是 `allowed-once`，提示会反复出现），或者把会话切换到 `danger-full-access` 预设，它会解锁整个文件系统并关闭批准。在「工作区＋临时区域」与「一切」之间，不存在常驻的、有目标性的授权。

## 决策

在沙箱策略中加入一份宿主机本地额外可写根目录列表，由部署和用户全局配置，并通过唯一共享的派生逻辑由每个本地方言强制执行。

- **`SandboxExecutionPolicy.extraWritableRoots`**：`workspace-write` 在会话工作区与平台临时区域之外还可写入的可选绝对宿主机本地目录。和 `workspaceRoot` 一样逐调用携带；`resolve()` 只在非空时写入策略。
- **`writableRoots()` 纳入它们**——这条唯一派生现在表示「工作区根目录＋`/tmp`＋`os.tmpdir()`＋配置的额外根目录」，因此进程内 fs 围栏与 Seatbelt profile 不可能漂移。bwrap 与 Landlock 方言保留各自的授权拼写，并为每个额外根目录增加一次绑定挂载或一条 `--rw` 授权。windows-acl 档保留工作区＋私有临时目录授权；额外根目录在那里会被拒绝（记为已知限制，逐根目录 ACE 授权暂缓）。
- **`dsh-sandbox-policy` Config `extraWritableRoots`**——部署层，加载时验证：只接受绝对路径或 `~/` 前缀的主目录拼写；相对拼写会响亮失败。开头的 `~` 在解析时展开为用户主目录。
- **`sandbox` 设置命名空间**——部署基础之上的全局用户层，通过 `installSettingsSection` 安装，与 `permission.defaultPreset` 完全一致。存储的变更无需重启即可到达下一次 `resolve()`；设置提供方分离时回退到组合条目。
- **模型上下文**——`sandbox:policy` 的 workspace-write 说明在列表非空时追加 `Additional configured writable roots: [...]`，因此模型无需能力清单也能知道常驻授权。
- **General 设置编辑行**——`@deepseek-ai/dsh-client-ui-sandbox-settings` 在 Web 设置 General 区注册一个 `settings.general.item` 行。它跟随共享 describe 镜像，通过一次带描述符修订号的 `settings.mutate` 路径操作整体替换列表，在发送前于客户端镜像宿主 schema 的拼写规则，并把服务端拒绝以内联告警呈现。
- **按约定仅限宿主机本地**——列表只指宿主机上的路径。远程执行世界（ssh）完全在围栏之外，永远不会收到它，因此本地 `~/.cache` 授权无法授权 `ssh_host:~/.cache`；按主机的远程策略暂缓至远程约束工作。策略字段上的 JSDoc 写明了这一点，而 fs 围栏是本地路径上派生根目录的唯一消费方。

模式阶梯保持不变：`read-only` 仍然拒绝一切变更（包括额外根目录），`danger-full-access` 仍然绕过围栏。

## 备选方案

**按工作区授权。** 拒绝：设置 seam 是一份用户文档，没有按 cwd 的维度，而且这些路径是用户机器的属性，每个工作区都需要。逐会话逃生门仍是既有的 `sandbox/mode` 覆盖；按工作区的策略需要为并非按工作区的需求新增一个设置维度。

**只把额外根目录授予 fs 围栏（不给 bash）。** 拒绝：共享 `writableRoots` 派生存在的意义正是让 bash 与 fs 不会约束到不同根目录；在额外根目录上制造 bash/fs 分裂，会在 POSIX runner 上重新引入那种不对称。

**把同一份字符串列表应用到远程世界。** 以安全缺陷为由拒绝：本地路径授权与远程主机路径属于不同的信任域（不同文件系统、可能是不同用户、经由凭据访问）。

## 后果

策略词汇新增一个可选的逐调用字段，服务新增一个 Config 键和一个设置命名空间；强制执行消费方通过既有策略对象读取它们，因此没有能力 seam 改变形态。windows-acl 档是唯一不兑现额外根目录的方言，记为已知限制而非夸大为完整。权限预设的描述保持不变：它们描述的是预设的模式组合，而非配置清单，而面向模型的上下文携带确切的根目录。

这是对[跨家族 fs 沙箱 Agent Note](2026-07-14-cross-family-fs-sandbox.zh.md)的扩展——而非取代——该笔记拥有本列表赖以存在的共享策略决策；[沙箱 Agent Note](2026-07-06-sandbox.zh.md)拥有模式词汇与 runner 语义；两者都保持有效并交叉链接。

## 测试

- `roots.spec.ts`——额外根目录加入规范化去重后的 allow-list；`read-only` 即使配置了额外根目录也仍不授予任何内容。
- `policy.spec.ts`——`resolve()` 写入配置的根目录（无 agent 与逐会话场景，已去重）、展开 `~`、为空时省略字段、并在加载时拒绝相对拼写；提示上下文追加根目录句；设置命名空间把存储的变更应用到下一次解析、在写入时拒绝相对路径、并在提供方分离时回退到组合条目。
- `fs-sandbox.spec.ts`——写入与编辑配置的额外根目录下的文件都会落盘；所有授权之外的同级目录仍被拒绝。
- `sandbox-local` profile 测试——bwrap 绑定每个额外根目录，Landlock 增加每条 `--rw` 授权，Seatbelt allow 表单包含额外 subpath。
- `ui-sandbox-settings` 客户端 spec——设置 store 读取解析后的列表并以乐观并发整体替换（含读写失败与释放分支）；行渲染、添加、移除、客户端拼写校验与拒绝呈现；浏览器插件注册该行及其注入面，并在 fiber 释放时移除。
