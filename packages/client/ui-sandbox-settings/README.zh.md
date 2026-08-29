# @deepseek-ai/dsh-client-ui-sandbox-settings

[English](README.md) | 中文

General 设置中的沙箱额外可写根目录行。它读取显式暴露的 `sandbox` 设置描述符，从其解析值派生当前根目录列表，并以描述符修订号写入一次整体列表的 `settings.mutate` 路径操作（`extraWritableRoots`），因此添加或移除都是整体替换而非合并。其可观察状态经由 slot 系统的 `hooks` 隔离区承载，渲染器负责 React hook 绑定；推送失效会重新获取描述符。该行在发送前镜像宿主 schema 的拼写规则（绝对路径或 `~/` 前缀），并把服务端拒绝以内联告警呈现；宿主仍是权威。工作区与临时目录之外的根目录（`~/.cache` 之类）会成为每个本地能力无需批准提示即可写入的常驻 `workspace-write` 授权；远程执行世界永远不会收到它们。

`/client` 导出为插件主体（`apply`／`inject`）。

## 模型体验

间接地，通过该行写入的沙箱策略事实：存储的 `sandbox.extraWritableRoots` 列表会加宽后续 `ctx.sandboxPolicy.resolve()` 调用中 `workspace-write` 的 allow-list，因此当列表非空时，模型的 `sandbox:policy` 上下文会多出 `Additional configured writable roots: [...]` 一句。该行本身不增加提示内容。

#### KV Cache 影响

不会直接使 KV Cache 失效；请求前缀变更由策略上下文消费方负责。

## 已知限制与暂缓事项

- **设置行仅限 Web**——非 Web 客户端仍可通过 `sandbox` 设置文档配置列表，但不会收到这一浏览器贡献。
- **仅支持整体列表编辑**——该行始终写入完整的替换列表；来自其他表面的并发编辑会被该行的最后一次写入覆盖。
