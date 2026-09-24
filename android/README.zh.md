# dsh Android 应用

[English](README.md) | 中文

DeepSeek Harness Web UI（`dsh web`）的最小化 Android 包装器。它是一个全屏 WebView，指向用户配置的主机名，通过 Android KeyChain 支持客户端证书（mTLS），并且刻意让所有失败可见而不是静默。

## 功能

- 在配置的主机名加载 dsh web UI（首次启动时询问）。
- **设置位于 Web UI 中。** Web UI 的设置导航会多出一个 **App** 页面——主机名、证书、诊断——由 `@deepseek-ai/dsh-client-ui-app-settings` 客户端插件贡献，该插件只在页面运行于应用内时注册（`window.DshApp` 桥只存在于应用内）。一个极简的原生页面保留为离线回退：首次启动（还没有主机名，因此没有 Web UI）和错误页的"更换服务器"按钮（服务器不可达，Web UI 无法渲染）。
- **mTLS**：服务器请求客户端证书时，出现 Android 系统证书选择器；所选证书会被记住。App 设置页显示当前使用的证书，并可忘记它。
- **语音输入**：Web UI 的语音转文字使用麦克风；应用请求 `RECORD_AUDIO` 并把授权转发给 WebView。
- **原生通知**：Web UI 可调用 `window.DshApp.notify()` 发送通知，播放 `res/raw/notification_bell.ogg` 中的定时铃声（从 goop 应用复制而来）。
- **可见的错误**：连接、TLS 和 HTTP 失败会渲染应用内错误页，显示失败 URL 以及"重试"和"更换服务器"按钮；连接期间显示带状态文字的启动页；控制台消息、WebView 事件和崩溃都记录在 Web UI 的 App 设置页中可读。没有任何错误只存在于 logcat。

## 环境要求

- Android 8.0（API 26）或更高。
- 设备可访问的 `dsh web` 实例，始终位于 TLS 之后并带有客户端证书（mTLS）。输入裸主机名时应用假定为 `https`。

## 构建

Nix flake 提供构建环境（Android SDK 34、Gradle、JDK 17、adb）——与构建 goop 应用相同的工具链：

```sh
cd android
nix develop -c gradle assembleDebug
```

这会在 `android/` 中写入 `.android-sdk/` 和 `.gradle-home/`（均已 gitignore）。APK 位于 `app/build/outputs/apk/debug/app-debug.apk`。

不使用 Nix 时，任何版本相同的 Android Studio 项目都可以：AGP 8.2.0、Kotlin 1.9.22、compileSdk 34、minSdk 26、targetSdk 34、JDK 17。

## 安装

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## 配置

1. 启动应用；它会打开原生服务器页（离线回退）。
2. 输入 Web UI 主机名，例如 `dsh.example.com:3080` 或 `https://dsh.example.com:3080`（裸主机名会自动加上 `https://`）。
3. 首次连接时服务器会请求客户端证书；在系统选择器中选中你的证书。请先在设备上安装客户端证书（设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书 / 用户凭据）。
4. 此后设置都在 Web UI 中：打开侧边栏齿轮，再打开 **App** 页面。如果连接失败，错误页会显示原因和 URL，并有"重试"和"更换服务器"按钮。

`dsh web` 默认监听 `127.0.0.1` 并拒绝绑定 `0.0.0.0`；请通过终止 TLS 并要求客户端证书的反向代理对外暴露它，然后让本应用指向该代理。

## 设计说明——错误刻意可见

之前的 goop 应用难以运维，因为它的失败是静默的、后台的或不可见的。本应用刻意避开每一种模式：

- **不做请求拦截/探测。** 探测无法携带 KeyChain 客户端证书，因此在 mTLS 之后总是失败，并把错误的错误响应注入页面历史。WebView 用自己的、支持 mTLS 的栈处理所有请求。
- **没有 splash→重定向 hack。** 直接加载真实 URL；WebView 错误回调驱动一个确定的错误页（用自定义 base URL 标识，永远不会与真实导航混淆）。
- **错误状态随每次导航重置。** 卡住的"已显示错误页"标志（可能在恢复后让应用空白）不可能出现：`onPageStarted` 清除它，只有主框架失败才显示错误页。
- **KeyChain 查询在线程上运行。** Android 16 拒绝在主线程调用 `KeyChain.getPrivateKey`；记住证书的路径和选择器回调都分发到工作线程。
- **没有后台 WebSocket 服务。** 通知只在应用进程存活时触发；没有前台服务的静默死亡来掩盖"监控中"的虚假承诺。
- **崩溃处理器写入文件并标记下次启动。** 下次启动时显示对话框，而不是让崩溃只存在于 logcat。
- **一切都会记录到诊断。** WebView 生命周期、TLS、证书、HTTP 和 JavaScript 控制台事件都进入内存环形缓冲（`DshDiagnostics`），可从 Web UI 的 App 设置页读取，连同崩溃日志和应用/Android 版本。

## `window.DshApp` 桥

WebView 暴露 `window.DshApp`——Web UI 与原生应用之间的平台无关契约。未来的 iOS（或其他）客户端实现相同的表面后，Web 侧 App 设置页无需改动即可工作：

| 方法 | 用途 |
| --- | --- |
| `getServerUrl()` / `setServerUrl(url)` | 读取/更新配置的主机名（保存后会在新服务器上重新加载页面） |
| `getCertInfo()` / `forgetCertificate()` | 读取/忘记记住的 mTLS 证书 |
| `getDiagnostics()` / `clearDiagnostics()` | 读取/清除事件环形缓冲 |
| `getCrashLog()` / `clearCrashLog()` | 读取/清除磁盘崩溃日志 |
| `getAppInfo()` | 一行应用/版本/证书状态 |
| `notify(title, body)` | 发送带定时铃声的原生通知 |
| `openSettings()` | 打开原生离线回退页面 |

## 目录结构

```
android/
  flake.nix, flake.lock   # Nix build environment (SDK 34, Gradle, JDK 17)
  app/                    # Gradle module
    src/main/
      AndroidManifest.xml
      java/ai/deepseek/dsh/
        DshApp.kt         # preferences, crash handler, URL normalization
        MainActivity.kt   # WebView, mTLS, error page, splash
        DshJsBridge.kt    # window.DshApp bridge
        DshErrorPage.kt   # self-contained error page HTML
        DshDiagnostics.kt # event ring buffer surfaced in the web UI
        SettingsActivity.kt  # offline fallback (first run / unreachable)
      res/raw/notification_bell.ogg
      res/drawable/…      # icons and backgrounds
```
