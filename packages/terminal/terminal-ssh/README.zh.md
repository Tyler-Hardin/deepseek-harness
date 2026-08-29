# @deepseek-ai/dsh-terminal-ssh

[English](README.md) | 中文

基于某个 ssh 执行世界的 pty 通道、为 `ctx.terminals` 提供的持久远程 shell 后端。它通过 `@deepseek-ai/dsh-ssh`（`SshWorld.pty`）以远程伪终端打开账户的登录 shell，保留有界的逐行输出，并直接在通道上驱动就绪检测、信号发送与拆除。这样打开的会话运行在会话的远程执行世界中，因此工作区位于 ssh 之上的智能体，会得到与文件系统和 bash 工具同一执行世界的持久交互式 shell。

## 插件（`terminal-ssh`）

该插件注入 `pty` 和 `worlds`，然后注册所配置的后端类型（`ssh`）。spawn 时，它通过 `ctx.worlds.resolve({ session, path })` 解析所有者的会话执行世界，并大声拒绝非 ssh 执行世界——把本地会话路由到这里，等于试图在并非该世界所有的传输上打开 PTY。后端调用 `world.pty({ rows, cols })` 打开登录 shell；当已知工作路径（spawn 的 `cwd`，否则为会话头的 `cwd`）时，会在就绪检测前先执行引导行 `cd <path>`，使 shell 从工作区路径启动，同时把同一路径作为后端默认路径传给执行世界。`startupTimeoutMs` 限制引导到就绪的等待时间，`sendTimeoutMs` 限制之后每次 send 的等待时间。

就绪检测基于静默：当至少出现一次输出事件后，输出静默达到 `idleSilenceMs` 时 send 结算，或在远端退出／关闭时立即结算；启动阶段还要求已经观察到输出，因此零输出静默不能发布空会话。ssh 传输不暴露前台进程组内省，因此没有本地后端那样的提示符标记或 stdin-wait 档位。`SIGINT` 与 `SIGTSTP` 向通道写入各自的终端控制字节；`SIGTERM`、`SIGKILL` 与 `SIGHUP` 没有控制字节，后端因此关闭通道，从而终止远端 shell 及其子进程。`close` 结束通道，把活跃 send 结算为 `session_exit`，并在解析前等待安静；传输故障会失败活跃 send，并通过 `close` 浮出第一个故障。

## 模型体验

间接地，通过 `@deepseek-ai/dsh-tool-terminal` 或其他 PTY 消费方呈现本后端产生的有界 MOTD、发送增量、scrollback 页与清理错误。

#### KV Cache 影响

无直接失效；由具名消费方负责任何请求前缀变化。

## 已知限制与暂缓事项

- **仅登录 shell** —— SSH 协议的 shell 请求没有 shell 或目录参数，因此后端始终启动账户的登录 shell，并针对工作路径执行显式 `cd`；不支持选择其他远端 shell。
- **仅基于静默的就绪检测** —— 没有远端前台进程内省，send 在输出静默时结算；长时间运行且不打印任何内容的命令会提前结算（模型可以轮询 scrollback），即使在 bash 远端上也没有提示符标记档位。
- **粗略的信号** —— `SIGTERM`／`SIGKILL`／`SIGHUP` 关闭通道而非投递具名信号，且永远不会识别远端进程组（`targetPgid` 为 `0`）。
- **需要 POSIX shell** —— 引导 `cd` 行假定远端登录 shell 为 POSIX 兼容。
- **harness 进程退出后，会话无法继续存在。**
