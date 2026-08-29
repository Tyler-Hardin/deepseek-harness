# @deepseek-ai/dsh-fs-ssh

[English](README.md) | 中文

[`@deepseek-ai/dsh-fs`](../fs/README.zh.md) 文件系统能力接缝的 SSH 提供方：经 SFTP 访问一个远程执行世界。路径、内容与原子暂存文件都留在远程主机上；读取暴露常规 UTF-8 文本或类型化错误，目录列表稳定且不含内容，变更原子化并带可选版本守卫——完整的十二原语接缝契约。

提供方接收一个 `SshWorld`（来自 [`@deepseek-ai/dsh-ssh`](../../ssh/ssh/README.zh.md)），并把接缝的暂定 `SftpHandle` 固定为 ssh2 包装器。一个实例服务一个远程世界；工作区/会话绑定阶段按远程工作区组合实例。

## Usage

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { SshWorld } from '@deepseek-ai/dsh-ssh'
import { SshFileSystem } from '@deepseek-ai/dsh-fs-ssh'

function compose(ctx: Context, world: SshWorld) {
  // one instance per remote world
  return new SshFileSystem(ctx, { cwd: '/home/user/project' }, world)
}
```

| 选项 | 默认 | 含义 |
|---|---|---|
| `cwd` | 世界目标的路径，否则 `/` | 相对路径所用的远程基目录 |
| `diffBasisMaxBytes` | 10 MiB | 每次覆盖 diff 一侧的 UTF-8 字节独占上限；达到或超过该上限的旧文件使 `before` 为 `null` |

## Behavior

- **身份**——`resolve` 把远程路径映射为其 realpath 作为稳定 `targetKey`；缺失目标对其最近的已存在祖先做 realpath 并重新追加后缀，因此键在创建前后保持稳定。`processPath`/`fileUrl`/`contains` 使用远程世界的路径。
- **读取**——整文件、流式与有界原始字节读取，带接缝的校验：常规文件检查、NUL/二进制拒绝、致命 UTF-8 解码，以及 `maxBytes` 上限（stat 预检加针对 stat 后增长的流式边界）。
- **原子写入**——写入先在私有 `0o700` 兄弟目录中暂存，写入 `0o600` 临时文件，保留既有模式，然后以同目录 rename 发布；暂存目录尽力清理。`createIfAbsent` 通过远程硬链接（`ln`）发布——这是 SFTP 层级的 no-replace 原语——从而保留并发创建者。每目标 FIFO 锁串行化读→守卫→写窗口。
- **编辑**——字面替换，带接缝错误分类（`FS_EDIT_NOT_FOUND`、`FS_AMBIGUOUS_EDIT`），保留 CRLF 的写回，版本守卫在匹配前检查。
- **版本**——由 SFTP 属性派生（`size:mtime:mode:uid:gid`）。SFTP 时间戳只有一秒精度，因此同一秒内同尺寸的覆盖可能产生相同版本（比本地后端弱；文档化限制）。
- **取消**——每个操作都检查调用方的 signal；中止报告 `FS_ABORTED`。
- **传输失败**——已 dispose 或断开的世界上操作映射为 `FS_IO_ERROR` 并以 SSH 错误为 cause；SFTP 状态词汇映射为 `FS_NOT_FOUND`/`FS_PERMISSION_DENIED`/`FS_IO_ERROR`。

## Model Experience

间接——经由 [`dsh-tool-fs`](../tool-fs/README.zh.md)，它渲染远程 UTF-8 内容、目录结果、变更确认与提供方错误，SSH 传输保持内部。

#### KV Cache effect

无直接失效；命名消费者拥有各自的请求前缀变更。

## Known Limitations and Deferred Work

- **版本由秒级时间派生**——SFTP v3 属性只有一秒时间戳且无 inode/设备身份，因此版本 token 弱于本地后端；同一秒内同尺寸的覆盖可能不被版本守卫判为陈旧。
- **`createIfAbsent` 需要远程主机上的 POSIX shell**——no-replace 发布经世界 exec 通道运行 `ln`；无 POSIX `ln` 的主机会让受守卫创建响亮失败。
- **悬空符号链接的列表**——悬空链接以 `other` 列出且无版本；接缝的目录列表没有符号链接跟随契约。
- **无重连**——连接断开后操作失败，直到调用方重连世界。
- **`SftpHandle` 固定为 ssh2 专用**——提供方把会话读作 ssh2 包装器；非 ssh2 世界无法服务此后端。
