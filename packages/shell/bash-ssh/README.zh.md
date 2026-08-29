# @deepseek-ai/dsh-bash-ssh

[English](README.md) | 中文

基于 [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.zh.md) world 的 exec 通道实现的 `@deepseek-ai/dsh-shell` 执行器 seam 的 SSH Service Provider：`SshBashExecutor` 用 seam 的 exec/collect 生命周期运行前台命令（配置钳制的超时、取消、有界输出、stdin 与环境），并在远端主机上分离地运行后台进程，再通过 world 的 SFTP 会话读回其 pid、状态与输出文件。

该 provider 接收一个 `SshWorld`（来自 [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.zh.md)），并负责远端一侧所有与 bash 相关的职责：命令默认值与上限、超时与取消分类、适合模型的终端环境，以及后台读取时面向模型的 stdout/stderr 合并。传输机制（认证、主机密钥策略、连接生命周期）属于 SSH seam。一个实例服务于一个远端 world；工作区/会话绑定阶段会按远端工作区组合实例。

## 使用

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshBashExecutor } from '@deepseek-ai/dsh-bash-ssh'

async function compose(ctx: Context, world: SshWorld) {
  // one instance per remote world
  const shell = new SshBashExecutor(ctx, { cwd: '/home/user/project' }, world)
  const spec = shell.resolve({ command: 'npm test' })
  return await shell.run(spec)
}
```

| 选项 | 默认值 | 含义 |
|---|---|---|
| `cwd` | world 目标路径，否则为 `/` | 相对路径的远端基准目录 |
| `timeoutMs` | 120000 | 前台默认超时（毫秒） |
| `maxTimeoutMs` | 600000 | 单次调用超时覆盖的上限 |
| `maxOutputBytes` | 64000 | 每流的进程内输出上限（前台捕获与后台尾部） |
| `runtimeRoot` | `~/.dsh-bash` | 后台进程文件的远端目录；`~` 展开为远端 home |
| `pollMs` | 50 | 后台状态/输出文件的轮询周期（毫秒） |
| `graceMs` | 3000 | 后台 kill 的 SIGTERM→SIGKILL 宽限期（毫秒） |

## 行为

- **前台运行** — `run()` 把已解析的命令交给 world 的 exec 通道，携带配置钳制的超时、调用方的 signal、显式环境（先终端覆盖、再调用方环境、后受管 `DSH_*` 快照）、可选的 stdin，以及一个会过度捕获的组合捕获上限，使任一流都不会低于其 seam 预算。传输层自身的分类（退出码、远端 signal、`timedOut`、`aborted`、每流截断）直接映射到 seam 结果上。
- **后台进程** — `start()` 立即返回一个活跃的 `ShellProcess` 句柄，无超时。launch exec 立即返回：远端 wrapper 在新会话（`setsid`）中把命令放到后台、记录其 pid、等待并写出退出状态。轮询循环通过 SFTP 读取 pid、状态与输出文件；输出读取是增量的，内存中保留有界尾部，`readOutput()` 把 stdout/stderr 合并为一份消耗式增量，stderr 置于 `[stderr]` 标记之下。
- **Kill 与取消** — `kill()`（或 spec 的 `AbortSignal`）把进程标记为已杀死，并针对远端进程*组*（`setsid` 使其成为会话/组组长）升级 SIGTERM→SIGKILL，从而杀死整棵进程树。wrapper 在组被杀后仍然存活以写出最终状态。自我发信号的命令同样以 `killed` 结算，与本地执行器一致。
- **spawn 失败以 killed 结算** — launch 拒绝（world 未连接）或从未发布 pid 时，进程以 `killed` 结算，并附带一条经 `readOutput()` 单次投递的 `spawn failed: …` 说明，与 `dsh-bash-local` 保持一致。
- **断连即结算** — 若 world 的连接在运行中中断，待决的 SFTP 读取会与会话的 close 信号赛跑，进程以 `killed` 结算并附带连接丢失说明，而不是永久挂起。
- **`~` runtime root** — `~/.dsh-bash` 形式的 runtime root 会通过向远端登录 shell 询问 `$HOME` 在每个执行器上展开一次，因为带引号的 `~` 永远不会在 wrapper 中展开，而 SFTP 路径需要字面绝对形式。
- **活跃进程的销毁** — 所属组合销毁时仍在运行的进程会被标记为已杀死，其远端组会被升级处理。

## 模型体验

间接通过 `dsh-tool-bash`，它渲染该执行器的有界 stdout/stderr 尾部、后台进程增量与基础设施故障。

#### KV 缓存影响

无直接失效；具名消费者拥有任何请求前缀变化。

## 已知限制与延期工作

- **远端命令需要带 `setsid` 的 POSIX shell** — 后台 wrapper 使用 `setsid`（util-linux）把命令分离到自己的会话/组中；没有它的主机（例如原装 macOS）会大声地让后台启动失败。
- **后台退出信号由 128+n 状态推断** — wrapper 记录 `wait` 的状态，因此只有标准的 POSIX 信号序号会以 `signal` 呈现；非常规状态会按退出码报告。
- **远端后台输出没有 spill 恢复** — 被截断的后台尾部只保留有界的进程内尾部并标记 `lossy`；完整远端文件不会作为本地 spill 路径暴露（seam 的 spill 字段是本地路径）。
- **无重连** — 连接中断会以 killed 结算进程；重连并恢复轮询循环属于延期加固。
- **`SftpHandle` 钉扎是 ssh2 特有的** — provider 把会话读作 ssh2 wrapper；非 ssh2 的 world 无法支撑该后端。
