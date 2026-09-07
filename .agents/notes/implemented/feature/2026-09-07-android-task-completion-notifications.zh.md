# Agent Note: Android 后台任务完成通知

Status: implemented

[English](2026-09-07-android-task-completion-notifications.md) | 中文

## Problem

Android 应用（[android WebView client](2026-08-25-android-webview-client.zh.md)）无法在手机退到后台或熄屏时告诉用户某个会话运行已结束：应用不在屏幕前时 WebView 页面会暂停或被挂起，页面侧监听器无法投递；而 [app-settings 决策](2026-08-25-web-hosted-app-settings.zh.md) 交付的 `window.DshApp.notify()` 一直没有调用方。此前的设计刻意不带后台服务；goop 的隐藏后台服务教会我们：一个失败不可见的监控器比没有更糟。需求是：当一次运行结束、出错或停下来等待用户输入时响铃，可靠到"我把长任务丢在应用里走开"是受支持的使用姿势。

## Decision

Android 应用新增后台任务完成监控器：一个前台服务，自带到 dsh 主机的只读连接，只在应用不在屏幕前时发送原生通知。投递完全不依赖 WebView 页面。Web UI 的 App 设置页新增"后台任务通知"开关（默认开启），桥契约新增可选的 `getMonitoringEnabled()` / `setMonitoringEnabled()` 成员，使早于本监控器的原生构建无需改动即可继续工作。

原生部分（`android/`）：

- **`DshNotificationService`** —— 前台服务（`foregroundServiceType="specialUse"`，子类型 `task-completion-monitoring`）。它拥有一个监控 `HandlerThread`；所有分类器与套接字状态都限定在该线程上。它显示一条常驻的低重要性**监控**通知，文字如实反映连接状态（已连接 / 连接中 / 重连中 / 证书错误）并带"停止监控"操作，因此监控器永远不会不可见；每次启动删除并重建**告警**频道，把铃声与振动推送给已安装的应用。
- **`DshDownlink`** —— 一条 dsh 下行流的 OkHttp WebSocket：每 30 秒协议 ping、零客户端帧（dsh 对任何客户端消息都以 1008 关闭下行套接字）、上限 30 秒的指数退避重连、256 KB 帧大小保护（历史重放可能携带监控器不需要的巨型条目）。
- 分类器规则（作用于 `session.list` 种子或实时帧报告的会话；子代理子会话与空白会话永不响铃）：
  - 会话运行中收到 `question/requested` 或 `approval/requested` → **需要你的输入**（每个请求 id 一次，重放安全）。
  - `host/session-status running:true→false` 且无未决交互 → **任务完成**，延迟 4 秒，避免排队的轮次之间的压缩维护误响。
  - 结束边之前收到 `host/agent-error` → **任务出错**。
  - 断线对账：重连后重新拉取 `session.list`，对断线时正在运行、现在已空闲或消失的会话响铃。
- mTLS 使用同一个被记住的 KeyChain 证书，经 PKCS12→OkHttp `sslSocketFactory` 构建于监控线程上（Android 16 拒绝主线程 KeyChain 调用）；证书失败显示在监控通知中并重试——绝不静默降级为明文连接。
- 启动/停止：`MainActivity` 在获得 `POST_NOTIFICATIONS` 且已配置服务器 URL 后于启动时开启服务，在 `onResume`/`onPause` 中跟踪前台标志，并在服务器 URL 变更时重启监控器；Web 开关停止它；在 Android 13+ 尚未授权时开启开关会经由 Activity 的运行时权限请求，而不是启动一个通知无法显示的服务。

Web 部分（`packages/client/ui-app-settings`）：`DshAppBridge` 新增两个可选监控成员；注入面仅在桥提供它们时转发；`AppSection` 仅在此时渲染"后台任务通知"复选框，因此旧版应用构建只是省略该块。

## Wire contract (监控器读取的接缝)

dsh 主机已经通过两条只读下行流推送所需的一切，无需客户端流量、无需每客户端订阅：`/api/events.host`（`host/session-status{running}`、`host/session-added{cwd}`、`host/session-removed`、`host/agent-error`）和 `/api/events.mux`（`question/requested`、`approval/requested`、`question/resolved`、`approval/resolved`；套接字打开时仍待处理的内容会重放）。每条消息都是完整形式的 `server-request` 信封；解析器以 `payload.type` 为键。主机状态帧只在状态切换时发出，因此服务先用一次一元 RPC 播种状态（`POST /api/session.list`，请求体 `{type:"client-request", rpcId, method:"session.list", payload:{}}`），该 RPC 还提供显示标题回退（持久 `projections.title`，否则 cwd 基名，否则短 id——与 Web 客户端回退一致）。代理在等待问题或审批时保持 `running`，因此 `running:false` 确实意味着轮次结束。这些接缝在 Phase 0 中对照真实主机钉死，包括捕获到与正在运行的代理 id 匹配的真实 `host/session-status running:false` 帧。

## Alternatives considered

**用前台服务让 WebView 页面保持存活，由 Web 侧监听器响铃。** 被拒绝：投递会依赖我们无法控制、也无法在设备上验证的 Chromium 隐藏页节流语义；监控器在后台还要在内存里带着整个 GUI 页面。

**镜像浏览器连接层的原生完整 JSON-RPC 客户端。** 被拒绝：不成比例——两条下行流加一次一元 RPC 就精确暴露所需事实，无需重新实现协议。

**用定时器轮询 `session.list` 代替套接字。** 被拒绝：单靠轮询无法区分"已完成"与"停下来等你输入"（交互在 mux 流上，不在列表行里），且为了更差的结果付出延迟与电量。

**经 FCM 的服务器推送。** 被拒绝：自托管 mTLS 部署需要 Google 服务与推送网关。

**goop 的隐藏前台 WebSocket 服务。** 仍被拒绝，但理由相反：它不可见。本监控器保留前台服务形态，并加上常驻、反映状态的通知与"停止"操作，使它诚实可见。

## Consequences

应用此前"没有后台 WebSocket 服务"的立场对本监控器而言被反转，README 与 [android WebView client 笔记](2026-08-25-android-webview-client.zh.md) 记录了该反转。代价是监控开启（默认）时的一条常驻低重要性通知，以及两条带协议 ping 的小套接字加超时刷新的部分唤醒锁的电量成本；监控器绝不运行整个 WebView。告警覆盖所配置服务器报告的所有会话；按工作区过滤推迟到有部署需要时。跨完整断网投递为尽力而为：断线期间开始又结束的运行会在下次成功播种时对账。在持久标题登上监控器读取的帧之前，告警正文以 cwd 基名或短 id 称呼会话。仍需在设备上确认的通知语义（取消问答的边界、Doze 行为、存量安装的告警声音升级）列在 Android README 的 deferred work 中。

## Testing

Web 半部分由 `ui-app-settings` 规格钉死：桥契约、按能力门控的注入（早于它的桥省略监控成员）、组件行为（仅受支持时渲染开关、转发翻转、刷新）；包测试通道与 `tsc -b` 通过。Kotlin 半部分在本仓库没有单元测试装置；`nix develop -c gradle assembleDebug` 是编译门禁且 APK 可构建。设备上验证（后台投递、问答暂停响铃、进程被杀恢复、权限拒绝）尚待完成（Phase 3），可对照已部署主机执行。

## Related

- [dsh Web UI 的 Android WebView 客户端](2026-08-25-android-webview-client.zh.md) —— 本监控器所在的应用；该笔记的被拒备选记录由本笔记修订。
- [Web-hosted App settings](2026-08-25-web-hosted-app-settings.zh.md) —— 本开关所扩展的设置页与桥契约。
