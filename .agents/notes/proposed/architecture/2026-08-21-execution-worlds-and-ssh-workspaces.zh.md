# Agent Note: 执行世界与 SSH 工作区

Status: proposed

[English](2026-08-21-execution-worlds-and-ssh-workspaces.md) | 中文

## Problem

dsh 的每个工作区都是本地目录。工作区注册表用本地 `fs.realpath` 规范化路径，`SessionHeader.cwd` 必须是本地绝对路径，而 fs/shell/subprocess 接缝在每个进程内只挂载一个提供方。因此无法让一个会话的文件与命令运行在远程主机上——尽管接缝本身已围绕"一个执行世界"来定义，仓库里也已经有一个远程世界族（`dsh-e2b`：一个全局沙箱，其 fs/subprocess 适配器在组合时替换本地提供方）。

可借鉴的参考实现是 goop agent，它通过切换每会话的 `Transport::Local | Ssh` 来支持 SSH：`ssh` 工具将会话提升为远程，`disconnect` 降级回本地，所有文件/命令工具都经由当前传输层路由，连接状态持久化在每会话的状态文件中。这个模型不适合 dsh：会话在创建时绑定到工作区，工作区是持久的身份与分组单元，而单个 harness 进程必须同时服务**混合的**本地与远程会话。goop 的模型是单会话、以传输为中心的；dsh 需要以工作区为中心的远程能力。

本笔记是 [SSH 能力接缝提案](../feature/2026-08-21-ssh-capability-seam.zh.md) 背后的架构决策。它建立在[可移植执行世界消费者决策](../../implemented/architecture/2026-07-28-portable-execution-world-consumers.zh.md)之上——该决策确立了 `ctx.fs` + `ctx.subprocess` 共同定义一个执行世界，远程提供方作为环境一致的整体替换整个接缝（即 e2b POC）——并为其扩展了一层路由，使单个进程可以服务混合世界，再加上 e2b POC 刻意不需要的工作区位置模型。它决定远程能力放在哪里、提供方如何按会话选择，以及采用何种安全姿态。[沙箱接缝决策](../../implemented/feature/2026-07-06-sandbox.zh.md)已把远程执行器排除在本地沙箱后端之外；本笔记将该边界采纳为准则。

## Proposal

### 远程性是工作区定义的属性

工作区由其**位置**定义：`{ kind: 'local', path }` 或 `{ kind: 'ssh', host, user?, port?, path }`。一切从这一个字段派生：

- **工作区注册表**：`create` 校验位置（本地用 `realpath`，远程则通过传输层连接后做远程 stat）；`status()` 是本地目录检查或远程可达性探测；`attachSession` 按位置匹配，而非按本地规范路径。
- **会话绑定**：会话的世界从工作区位置读出，并在创建时冻结进会话头（在 `cwd` 旁增加一个可选不可变 `world` 字段；`cwd` 仍表示"工作路径"，对远程会话而言是远程绝对路径）。恢复时从头部 `world` + 工作区记录重建传输。
- **没有会话级传输状态**：没有 `ssh`/`disconnect` 工具、没有每会话传输开关、没有重连 preamble 机制。会话就停留在创建它的工作区上。这是对 goop 模型的有意背离。

### 执行世界与按会话路由

现有接缝已是按世界的契约；缺失的是"会话的调用运行在哪个世界"的选择机制。由于工具插件在激活时绑定 `ctx.fs`/`ctx.shell`，通过作用域链做按会话的提供方遮蔽会迫使每个消费者改为惰性按调用解析。因此：

- 新增 `ctx.worlds` 服务，解析 `world(session)`——默认 `local`，或该工作区的远程世界——与今天 `ctx.sandboxPolicy.resolve({ session })` 解析按会话策略的方式完全一致。
- fs 与 shell 接缝契约各增加一个可选的按调用字段（`resolve(opts.world)`、`spec.world`）。轻量的**路由提供方**（`dsh-fs-router`、`dsh-shell-router`）实现接缝并按世界分派到各后端实例；`resolve` 之后，路由依赖不透明的品牌化 `targetKey`（带路由前缀），因此只有 resolve 需要世界。
- 纯本地部署从不挂载路由：默认组合保持现有直接提供方，行为零变化、默认 bundle 零扰动。

沙箱接缝的既有表述被采纳为准则：远程执行器**不是**沙箱后端——它们作为环境一致的整体替换整个能力接缝的 Service Provider。对远程世界请求本地沙箱模式会响亮失败；远程主机就是信任边界。

### 认证与安全姿态

仅支持 agent 与密钥认证，且在标准 `~/.ssh` 环境下默认可用：

1. **ssh-agent 优先**：POSIX 上设置了 `SSH_AUTH_SOCK` 时，或 Windows 上存在 OpenSSH agent 管道时。
2. **配置的密钥**：按顺序尝试 `~/.ssh/config` 中的 `IdentityFile`。
3. **默认密钥**：`~/.ssh/id_ed25519`、`~/.ssh/id_rsa`、`~/.ssh/id_ecdsa`。

**完全没有密码路径**——工具参数、credentials、提示符都不支持。需要口令而无 agent 可用的密钥会响亮失败并给出可操作的提示。`~/.ssh/config` 始终被读取（别名、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`）；密钥文件必须仅属主可读；known_hosts 采用 TOFU（首次见到即学习，密钥变更则拒绝），并提供可选的 strict 模式。

`ssh/connect { worldId, host, user?, port, path }` 与 `ssh/disconnect` 是仅日志的会话事件，为可重建性所必需：只有日志记录了回合运行在哪个世界，远程工具结果才可解释。任何事件都不出现凭据。

### M1 范围边界

本笔记决定架构；传输接缝本身（包、契约、认证流程、测试）见 [SSH 能力接缝提案](../feature/2026-08-21-ssh-capability-seam.zh.md)。工作区/会话绑定改造、路由、fs/shell 适配器与 GUI 工作是后续阶段，消费本决策。

## Acceptance criteria

- 工作区记录可以携带 ssh 位置；在其上创建的会话无需任何会话级传输状态即可派生出远程世界。
- 同一进程内本地与远程会话共存；工具层像今天选择沙箱策略一样按调用选择世界。
- 默认认证在 agent 或默认密钥配置下可用，除提供方组合外无需任何配置；密码认证完全不在 API 面中。
- 连接新主机是 TOFU；主机密钥变更会拒绝连接。
- `ssh/connect`/`ssh/disconnect` 事件使每个远程工具结果都能从会话日志重建。
- 本地专用部署在本改动前后行为完全一致。

## Progress

**M4（已实现，未合并）** — 按提案实现执行世界层：`Workspace.place`（本地/ssh）与 `SessionHeader.world`（不透明、创建时冻结，不提升格式版本——可选的附加头元数据）、带 `dsh-worlds-local` 与 `dsh-ssh-worlds` provider 的 `ctx.worlds` 服务，以及把接缝调用分发到已解析世界后端的 `dsh-fs-router` / `dsh-shell-router` provider。传输自身的世界 id 已更名为 `SshWorldId`，使目录可将其与执行世界的 `WorldId` 区分。世界在隔离的子上下文（`isolate('fs').isolate('shell')`）上组合各自的 fs/shell 后端，因此挂载在父作用域的路由不会与世界的注册冲突；dispose 只切断世界的引用，不触碰父 fiber。`dsh-host-apiproxy` 在创建会话时从工作区位置解析会话的世界；`ssh-worlds` 在会话进入时记录按会话的 `ssh/connect`，并在世界断开时为每个绑定会话记录对应的 `ssh/disconnect`。worlds/ssh/路由各包共 141 个测试，100% 覆盖率；cordis/config/doc-graphs 目录已纳入新服务及其子系统页面。

**M5（已实现，未合并）** — 远程工作区创建：`Workspace.createAtPlace`（本地委托目录检查流程，ssh 通过 `createRemoteCanonical` 按 `host+path` 复用），按 place 感知的 `attachSession`（ssh place 采用精确的远端路径相等），注册表仍停留在存储层——可达性探测由消费方负责。`dsh-host-apiproxy` 在为 ssh place 执行 `workspace.create` 前，通过可选的 `ctx.worlds` 结构边（`worlds.resolve({place, path})` 加 `world.fs().lstat`）探测远端路径，并暴露 `WorkspaceView.place`（缺省即本地）。GUI 新增了工作区选择器中的远程添加表单（host/user/port/path）与远程行的 `SSH <host>` 徽标。双语 README 与目录已更新；workspace/apiproxy/ui-workspace/client-runtime 共 932 个测试，100% 覆盖率。

**M6（已实现，未合并）** — 面向智能体的远程终端：`SshWorld.pty()` 通过 ssh2 shell 通道打开带远程伪终端的会话（登录 shell；SSH 协议的 shell 请求没有 shell 或目录参数，因此从 `SshPtyOptions` 中删除了无法实现的 `shell`/`cwd` 选项），`dsh-terminal-ssh` 注册 `ssh` 终端后端。该后端通过 `ctx.worlds` 解析所有者的会话世界（`World` SD 增加了由 `ssh-worlds` 实现的可选 `ssh()` 传输访问器），响亮拒绝非 ssh 世界，在就绪检测前引导 `cd` 进入工作路径，按输出静默结算 send（`idleSilenceMs`；ssh2 上没有前台进程组内省，因此没有提示符标记或 stdin-wait 档位），通过终端控制字节发送信号（SIGINT/SIGTSTP；SIGTERM/SIGKILL/SIGHUP 关闭通道），并在关闭时结束通道。terminal-ssh 共 34 个测试，100% 覆盖率，加上 ssh/ssh-client/ssh-worlds/worlds 各套件；ProxyJump 与 agent 认证路径已由 ssh-client e2e fixture 测试覆盖。

## Risks

- **路由间接层**为选择加入的组合中的每次 fs/shell 调用增加一跳；按调用世界字段是可选的接缝扩展，现有提供方忽略它，因此风险仅限于路由用户。
- **TOFU 比预置 known_hosts 更弱**；strict 模式可为安全敏感部署缓解，且密钥变更拒绝可阻止静默的中间人延续。
- **agent 优先认证可能挂起**，若 agent 套接字存在但无响应；必须有有界的连接超时。
- **混合世界语义**（例如远程世界的会话引用本地路径）必须响亮失败，而不是静默解析到错误世界；由路由负责此检查。
- **头格式增长**（`world` 字段）是会话格式变更；预发布政策允许，拒绝旧格式可接受。

## Alternatives considered

- **按会话作用域挂载**（把 `fs-ssh`/`bash-ssh` 挂进每工作区作用域层）：否决。工具插件在激活时绑定 `ctx.fs`/`ctx.shell`，按会话遮蔽会迫使每个消费者改为惰性按调用 `ctx.get()`——一次侵入性极强的跨切面重构，失败模式比路由更差。
- **整个 harness 远程化**（组合时用 ssh 提供方替换本地提供方，e2b 风格）：否决。需求是一个进程内混合本地与远程工作区；全局替换只能服务一个远程世界。
- **goop 的会话传输模型**（每会话 `Transport::Local | Ssh`、`ssh`/`disconnect` 工具、状态文件）：否决。它以传输为中心而非以工作区为中心，无法与 dsh 的工作区实体、会话头不可变性与多会话服务组合。
- **经 credentials 能力支持密码认证**：按决策否决——表面任何地方都不存在密码路径；仅密钥与 agent。
