---
description: "为原生客户端注册的设备推送会话运行完成、失败与等待中的 Firebase Cloud Messaging 通知。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-push-notify

[English](README.md) | 中文

## 概述

当会话运行完成、失败或开始等待用户时，推送一条结构化的 Firebase Cloud Messaging 消息，因此原生客户端既不需要后台套接字，也不需要前台服务。客户端通过 `POST /push/register` 注册设备令牌；消息携带原因代码、会话 id、由会话工作目录派生的标签，以及注册请求所经过的部署 origin——绝不包含会话内容——本地化文案由客户端负责。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用此包

Web 应用 bundle 用部署的服务账号文件与令牌路径启用该行：

```yaml
- id: push-notify
  name: '@deepseek-ai/dsh-api-push-notify'
  config:
    enabled: true
    serviceAccountPath: !!js dshHomePath('fcm-service-account.json')
    tokenPath: !!js dshHomePath('push', 'device.json')
```

原生客户端向 `/push/register` POST `{"token": "…"}`，该令牌与注册请求经过的部署 origin 一起以 `0600` 保存——origin 取自 `x-forwarded-proto` 与 `host`，或配置的 `publicUrl`。origin 让客户端在点击通知时打开发起推送的部署，这对一台手机跟随多个部署很重要。推送跟随 `api-session/status`（仅运行→空闲的边沿）、`api-session/error`，以及 `approval/request` 与 `user-questions/request` 瀑布事件——其监听器只观察并通过 `next()` 委托。没有 Firebase 项目的部署保持 `enabled` 为真但从不注册令牌，因此不会发送任何消息。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>维护者细节——点击展开</summary>

OAuth2 访问令牌由服务账号在本地签发 RS256 JWT 换取（`https://oauth2.googleapis.com/token`），缓存至过期前一分钟，再用于账号 `project_id` 对应的 FCM v1 发送端点。两个端点都是配置字段，便于测试指向本地服务器。发送失败与被拒绝的注册只记录日志，从不抛回触发事件：推送是通知侧的旁路，即使手机不可达，会话运行也必须完成。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [原生客户端](../../../android/README.zh.md)：接收推送并渲染本地化文案。

-----

<a id="model-experience"></a>
## 模型体验

无，因为推送只携带原因代码、会话 id 与工作目录标签——不含会话内容——也不会进入模型请求。

#### KV Cache effect

没有直接影响；推送不会增加、删除或重排模型上下文中的任何内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 应用中的后台监控（`DshNotificationService`）保留为无 Firebase 时的回退；它侦听 0.1.7 时代的下行路径，而 0.2.1 已替换这些路径，因此没有推送的部署目前收不到提醒。
- 每个部署只保存一个设备令牌：第二台手机会替换第一台。
- 推送不重试；Google 报告为未注册的设备只记录日志。
- `pnpm run test packages/api/push-notify` 覆盖注册、状态迁移与消息体测试。Firebase 的 `google-services.json` 不进入仓库（已在 Android 应用的 `.gitignore` 中），服务账号密钥存放在 dsh home 中，绝不进入仓库文件。

### 开发备注

`pnpm run test packages/api/push-notify` 覆盖注册、状态迁移与消息体；Firebase 配置与服务账号密钥都不进入仓库。
