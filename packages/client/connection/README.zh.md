---
description: "Web GUI 的浏览器与 Host 之间的协议层：Remote RPC、带重连的事件流投递、精确 Fetch 路由、/api HTTP 桥与浏览器信任栅栏。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

## 概述

本包承载浏览器到 Host 的 Remote 调用、精确 Fetch 响应与 connection generation。Client 插件挂载 `ctx.connection`，其中包含当前页面的 loopback 状态、通用 RPC、当前 generation 及其 Host 信息、可观察的恢复状态、立即重连命令，以及单一 generation source 的注册点。source 报告 ready 后 generation 才可见；source 结束、失败、被撤回或显式 stop 都会清空它，再由 `ConnectionController` 执行重试策略。

## 目录

- [使用本包](#use-this-package)
- [浏览器认证与请求信任](#browser-authentication-and-request-trust)
- [Connection generation](#connection-generation)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`./client` 导入在 Node 中选择独立的 `lib/client.node.js` ESM bundle，在浏览器中选择 `lib/client.browser.js` loader factory。Web Host 仍以逻辑 URL `/plugins/.../client.js` 提供浏览器导出。非页面 Cordis 树应导入 Client 入口；独立的包根入口是 Host 入口。

静态桌面页面可以通过 `__DSH_TRANSPORT__.streamBaseUrl` 提供其所拥有 Host 的 HTTP origin。Gateway 将该 origin 用于 WebSocket，HTTP 传输仍独立选择。桌面载体负责认证；仅设置 origin 不会授予访问权限。

一元 RPC 请求使用 JSON。Host handler 可以返回已经从 JSON 兼容结果值中分离的字节附件，每个附件标明其相对于结果的路径。Connection 将这些值写为 multipart 部分。JSON `metadata` 部分包含带 `null` 占位值的 RPC 响应信封，以及记录各路径、codec 和部分标识符的附件表。路径使用字符串键与数字数组下标，不保留任何业务字段名。Client 校验信封、`rpcId`、附件表和各部分，再将每个字节值恢复为以 `ArrayBuffer` 为底层缓冲区的视图。没有附件的结果（包括 base64 字符串）与失败仍使用 JSON。逻辑 RPC 载体直接返回解码后的原生值。Connection 不识别二进制字段，也不依赖 Typert；拥有结果协议的 handler 在返回前执行按类型或按运行时值的投影。不支持二进制参数、事件和二进制流式结果。

浏览器通过 HTTP POST 执行 Remote 一元调用；API Gateway 自己拥有 `/api/remote.mux` WebSocket 及其逻辑流。由 shell 持有的组合通过 `connection.rpc.open` 提供等价的 Remote 流（包括流的上行），不打开 WebSocket。浏览器插件读取页面 transport、恢复设置与 location，再委托 `installConnection(ctx, options)`。持有自身载体的组合可以直接调用同一个安装函数；整机客户端测试档就是这一消费者。非页面载体通过 `ClientTransportHooks.createWebSocket` 使用与 HTTP 相同的认证 Cookie，并提供 `streamBaseUrl`；`ConnectionHandle.openWebSocket()` 根据该 base 解析 Mux 路径，再调用所选工厂。每次调用都会创建一个归所属 Context 的服务，因此同一 realm 中的多棵 Client 树可以使用不同载体。Host half 始终提供与载体无关的 RPC 注册表和精确 `GET`/`HEAD`/`POST` 路由注册表。存在 Web 载体时，它还持有唯一 `/api` route、Fetch bridge、浏览器认证与 Host/Origin 校验；由 shell 持有的载体则直接分派共享 Fetch handler。每条精确路由会在 bridge 读取任何字节前声明缓冲或流式请求体处理方式。Typert Gateway 认领生成的 Remote endpoint，功能包注册 Session 日志下载、原始文件上传等非 JSON 响应，未认领的请求返回 404。Loopback hostname 判定只供浏览器侧当前页面状态使用，留在包内。浏览器原始请求体传输由 [`dsh-client-file-upload`](../file-upload/README.zh.md) 提供。

-----

<a id="browser-authentication-and-request-trust"></a>
## 浏览器认证与请求信任

通过 Web 载体访问时，一旦 Host/Origin fence 受理请求，每个 Host RPC 方法和 WebSocket 流都代表同一个 Peer，不存在按方法区分的 loopback 层。本地分支：部署经由终止 TLS 并验证客户端证书的反向代理到达该 Host，因此 Connection 不生成启动令牌、不写 cookie，也不在此处重新认证请求。`dsh-web-app` 打印并打开纯应用 URL，保留调用方的 authority 与挂载；`frontend-static` 把根路径和 index 请求交给 `ctx.connection.authorizeIndex`，后者总是放行；`/connect` 只做重定向。静态资源保持公开。



每个请求都经过 `src/api-request-trust.ts`。其 `Host` 必须是 loopback、等于监听器的绑定 IP 字面量（端口不限），或与 `trustedHosts` 条目匹配：带端口的 `host:port` 精确匹配，不带端口的条目匹配任意端口。Host 与配置条目按监听器的 scheme 做 WHATWG 默认端口归一化，不采信转发 header 或 `Origin`。附带的 HTTP(S) `Origin` 必须指向同一 authority；此时按 Origin 的 scheme 解析 Host，以支持 HTTPS 代理转发到 HTTP 上游；`sec-fetch-site: cross-site` 一律拒绝。畸形配置 authority 会让插件加载失败。`allowsRemoteAuthorities` 报告 `trustedHosts` 是否允许非 loopback authority；接受绑定 IP 不会改变该列表。这些检查防御 DNS rebinding 与跨站浏览器请求；在本分支中它们就是全部门槛，自身不建立身份。Host/Origin 校验失败返回 403。`dsh web --host 0.0.0.0` 不受支持。决策记录：[浏览器请求信任](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.zh.md)。

每个请求都代表一个 Peer：`principal` 指明调用方，`interactions` 决定能否参与转发事件，`signal` 在 scope 结束时中止。`ctx.connection.browserPeer` 由每个通过 fence 的浏览器连接共享，principal 为 owner，默认 `interactions: 'answer'`。`ctx.connection.admit(request)` 应用 Host/Origin fence，返回该共享 owner Peer 或拒绝状态；`/api` 路由和 Gateway WebSocket 升级都使用该结果，处理器接收本次调用的 Peer。`ctx.connection.createPeer({ principal, interactions? })` 创建独立进程内 Peer，由读取该服务的 Context 或其自身的 `dispose()` 释放；省略 interactions 时默认 `answer`。导出的 `Peer` 类接受相同参数。`fetch(request, peer)` 和 HTTP bridge 必须显式接收 Peer；对非 owner Peer，exact route 返回 403。其他 principal 的方法级访问归 [`dsh-api-remote-access`](../../api/remote-access/README.zh.md)。

仅供 API 使用的 `GET /connect` 只做重定向，不生成任何凭据：没有 API Cookie、没有 socket 归属交接，也没有按连接释放的 Peer。Connection 仍注册该路由，使旧握手链接落到 GUI 上。`/connect` 不接受 token 参数；fence 与其他请求一样决定它。

通过认证的共享 HTTP 请求在传输请求体之前经过 `connection/request` waterfall。监听器可以拒绝新请求，或等待 `next()` 直到响应完成；释放所属 fiber 会移除准入行为。Desktop 使用此扩展点，在已批准的安装期间锁住新的 API 工作，而不取消已接纳的工作。客户端断开会中止处理函数的信号；桥接器停止写入 socket，并排空剩余响应块。WebSocket 流仍由 API Gateway 负责。

<a id="connection-generation"></a>
## Connection generation

未显式指定时，`installConnection` 将页面的 `interactions` 解析为 `answer`，非页面调用方解析为 `none`。只有回答型 Client 把内部 `$events` 逻辑流注册为唯一 generation source，与有无 `$on` 订阅无关。Host 在 API Remotes source factory 同步挂好所有增量 listener 后，先发送唯一 `{ type: 'ready', clientId, host: { home } }` 项，再发送事件。`ConnectionController` 仅在收到该 ready 项后发布 generation 并调用 `onConnected`，因此 baseline 不会跑在增量 listener 前面。

`$events` 结束、Remote 流报错、收到非 ready 首项或畸形事件项，都会使当前 generation 失效。默认情况下，挂起的握手在 3 秒后记录 Host 响应缓慢告警，在 15 秒后记录就绪超时并中止，包含等待物理 socket 的时间。取消后，source 必须停止投递、释放资源并结束，替换 source 才能启动；已取消 source 迟到的 ready 不能发布 generation。浏览器报告网络可用时，Controller 发布 `connecting`，并在 500ms、1s、2s、4s、8s 与 10s 上限内采用 50%–100% 抖动重试，达到终档后继续尝试直到恢复。每次重试都要求 Gateway 替换一次物理 WebSocket，再重开 `$events`。

`ctx.connection.reconnect()` 会中断活动工作、重置序列，并立即开始 retry 1。浏览器 `offline` 会中断活动工作、发布 `disconnected` 并暂停自动尝试；下一次 `online` 转换会重置序列并从 500ms 档开始。只有 ready 项会发布 `connected`。Gateway mux 不拥有独立重试调度。

可通过 Host Connection 行的 `config.recovery` 覆盖重试上限、增长因子或握手告警与取消时间；[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-connection)列出接受的字段。Host 校验这些值，并将其注入所提供的每个页面。Client 在提供 Connection 前校验启动数据，并在 Gateway 启动循环时采用这些默认值；显式传给 `start()` 的时序覆盖优先。增长因子必须是至少为一的有限数。若就绪、失败、取消或硬期限先于告警发生，该告警会被取消。修改 Host 恢复配置后需重新加载页面。


<a id="model-experience"></a>
## 模型体验

无。协议消费层只在浏览器与主机之间搬运已经组合好的消息；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **缓冲型 `/api` 路由会把每个请求体保留在内存里**：`maxRequestBodyBytes`（默认 300 MiB，按默认 200 MiB 图片总量上限经 base64 膨胀加信封余量得出）限制普通图片与 RPC 信封。显式启用的流式路由接收带背压的分块并绕过总量上限；路由实现负责持久化、取消与存储配额。
- **fence 就是全部门槛**：被受理的请求可以到达每个方法（包括设置面），因此部署必须在请求到达该 Host 之前完成客户端认证：由终止 TLS 并验证客户端证书的反向代理承担，并在 `trustedHosts` 声明其 authority。非 loopback 监听器若不带 TLS，这些流量会以明文传输（[`dsh-host-webserver`](../../host/webserver/README.zh.md)）。
- **不存在按连接的 Peer**：每个被受理的请求都共享 `ctx.connection.browserPeer`，直到 Host 退出，因此本分支没有建联期限、socket 归属交接，也没有按凭据释放的回收。
- **没有 logout 操作**：Connection 中没有按会话划分的状态，因此撤销访问意味着撤回调用方的代理凭据并重启 `dsh`。


<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
