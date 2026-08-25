# Agent Note: dsh Web UI 的 Android WebView 客户端

Status: implemented

[English](2026-08-25-android-webview-client.md) | 中文

## Problem

Harness 没有第一方移动客户端。goop 项目中的参考 Android 应用展示了正确的形态——通过 Android KeyChain 提供 mTLS 客户端证书的全屏 WebView——但它带有多种在 Android 上静默、后台或不可见的失败模式：可能产生空白页的 splash→重定向序列；无法携带 KeyChain 客户端证书、会把错误响应注入页面历史的 `shouldInterceptRequest` 探测；永不重置、恢复后可能让应用空白的错误页标志；Android 16 拒绝的主线程 KeyChain 查询；以及后台失败只出现在 logcat 中的前台 WebSocket 服务。

## Decision

仓库新增 `android/`，一个围绕 dsh web UI 的最小化 WebView 包装器。它加载用户配置的主机名（裸主机名自动变为 `https://`），通过 Android KeyChain 执行 mTLS（记住所选证书，且可忘记），为 Web UI 的语音输入转发麦克风权限，支持文件选择器，并把 goop 定时铃声以 `res/raw/notification_bell.ogg` 的形式随 `window.DshApp.notify()` 桥一起发布。所有失败都可见：带状态文字的启动页；用自定义 base URL 标识的主框架失败应用内错误页（因此错误状态随每次导航重置）；在 Web UI 的 App 设置页中展示的事件环形缓冲和磁盘崩溃日志（由 `@deepseek-ai/dsh-client-ui-app-settings` 贡献，见 [web-hosted app settings](2026-08-25-web-hosted-app-settings.zh.md)）；下次启动时的崩溃对话框；以及记录进诊断的 JavaScript 控制台消息。原生设置页只是离线回退——首次启动和错误页的"更换服务器"按钮——只保留主机名字段和证书行；没有悬浮齿轮按钮。刻意缺席：请求拦截/探测、splash→重定向 hack、后台 WebSocket 通知服务。构建环境是与 goop 应用锁定同一 nixpkgs 修订版的 Nix flake dev shell，因此 Android SDK 和工具链派生在 Nix store 中共享。

## Alternatives considered

**移植 goop 的前台 WebSocket 服务以支持后台回合通知。** 否决：它是静默后台失败的来源，与最小包装器的范围矛盾，而且原生通知仍然要求页面或进程存活。

**Trusted Web Activity（TWA）。** 否决：需要 Play 签名和 digital asset links，对自托管 mTLS 部署不合适。

**像 goop 那样的独立仓库。** 否决：移动客户端是此 harness 的客户端表面，应位于 monorepo 中 `apps/web` 旁边。

## Consequences

网页触发的原生通知只在应用进程存活时触发（没有后台服务）；README 记录了这一点。应用用几个更可见的表面换掉了 goop 的不可见失败模式：Web UI 的 App 设置页（带诊断）、离线回退页和崩溃对话框。设置相关改动现在随 `dsh web` 服务器发布（App 设置页），而不只是随 APK。应用使用与 goop 应用相同的 Android 工具链构建（AGP 8.2.0、Kotlin 1.9.22、compileSdk 34、来自 nixpkgs 的 Gradle），因此已验证的构建路径得以延续。
