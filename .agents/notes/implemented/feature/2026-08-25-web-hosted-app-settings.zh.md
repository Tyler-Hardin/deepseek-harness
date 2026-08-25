# Agent Note: 应用设置托管到 Web UI

Status: implemented

[English](2026-08-25-web-hosted-app-settings.md) | 中文

## Problem

Android 应用把服务器主机名、证书和诊断设置在原生 Activity 中，配一个悬浮齿轮按钮。这重复了 Web UI 自带的设置入口，把诊断拆分到独立的设备端页面，而且任何未来的非 Android 客户端都得重新实现同样的原生 UI。原生表面还必须能在没有服务器时触达，而设置内容本身无法保证这一点。

## Decision

设置移入 Web UI，成为由新的 `@deepseek-ai/dsh-client-ui-app-settings` 客户端插件贡献的 **App** 设置页。插件只在 `window.DshApp` 存在时注册一个 `settings.section` 贡献（id `app`、order `100`）——`window.DshApp` 是 Android 应用通过 `addJavascriptInterface` 暴露的平台无关原生桥——因此该页面只出现在应用内，绝不出现在桌面浏览器中，也不做 user-agent 嗅探。页面通过桥读写主机名、mTLS 证书和诊断；保存主机名会在新服务器上重新加载页面。Android 桥由 `DshAndroid` 更名为 `DshApp`，并扩展了证书与诊断方法（`getCertInfo`/`forgetCertificate`、`getDiagnostics`/`clearDiagnostics`、`getCrashLog`/`clearCrashLog`）。

原生设置页被裁剪为离线回退：首次启动时打开（还没有配置主机名，因此 Web UI 尚不存在），以及从错误页的"更换服务器"按钮打开（服务器不可达，网页无法渲染）。它只保留主机名字段和证书行；诊断位于 Web UI 页面中。

## Alternatives considered

**保留原生设置 Activity 和齿轮按钮。** 否决：它重复了 Web UI 的设置入口，诊断也只能在独立的原生页面上阅读。

**用 user-agent 嗅探来控制页面。** 否决：基于桥存在性的能力检测精确、能经受客户端改名，也不解析可伪造的字符串。

**以 Android 命名桥和包。** 否决：`window.DshApp` 和 `ui-app-settings` 是平台无关的，未来 iOS（或其他）客户端实现相同的桥表面后，网页无需改动即可工作。

## Consequences

Web 侧改动随 `dsh web` 服务器发布，而不是 APK：部署必须重新构建服务器才能看到 App 页面，在此之前单独安装 APK 不会出现应用内设置入口（离线回退页仍覆盖首次启动和服务器不可达）。桌面浏览器没有任何变化——没有桥时插件什么都不注册。原生崩溃对话框和错误页仍是离线诊断路径；完整的事件环形缓冲和崩溃日志移入 Web UI 页面。
