# v9.2.2 Watch 生命周期修复 Spec

## Why

`bug反馈.txt` 控制台日志暴露了 3 类连锁问题：CloudBase SDK 报 "no realtime listener found for watchId"（大量重复）、WebSocket 被服务端 close（reason: 'No Realtime Listeners'）、Watchdog 心跳超时循环触发（#1→#4/6）。根因是 `beforeunload` 未清理 Watch 连接，以及 Watchdog 补偿同步与重建完成之间存在时序竞态。

## What Changes

### 修复 1（P0）：`beforeunload` 中清理 Watch 连接

**位置**：[app-auth.js:2991-2997](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991)

**现状**：`beforeunload` 仅在未登录时调用 `saveLocalCache()`，已登录用户关闭/刷新页面时 5 个 WebSocket 连接不会主动 close。服务器端继续推送数据到已失效的 watchId → SDK 报 "no realtime listener found" → 服务端 close WebSocket（code: 3001, reason: 'No Realtime Listeners'）。

**修复**：在 `beforeunload` 中调用 `DAL.unsubscribeAll()` 主动关闭所有 Watch 连接。

### 修复 2（P0）：Watchdog 补偿同步延后到重建完成后

**位置**：[app-1.js:1216-1220](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1216)

**现状**：Watchdog 超时后调用 `checkAndRebuildWatchers(true)`，8 秒后执行 `reconcileCloudAfterWatch('watchdog-timeout')`。但 `checkAndRebuildWatchers(true)` 内部先 `unsubscribeAll()`（含 ~10.55s 动态退避）再 `subscribeAll()`（5 个 watch × 200ms 错峰 = 1s），总耗时约 11.55s。8 秒时新 Watch 尚未建立完成，补偿同步可能失败或触发新的异常。

**修复**：将补偿同步延后到 `checkAndRebuildWatchers` 完成后执行（利用 Promise chain），而非固定 8 秒 setTimeout。

### 修复 3（P1）：Watchdog 重建后重置心跳时间戳

**位置**：[app-1.js:1212-1214](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1212)

**现状**：Watchdog 触发 `checkAndRebuildWatchers(true)` 后，`watchLastEventTime` 在 `unsubscribeAll()` 中被清零，但 `subscribeAll()` 中 `.watch()` 同步返回后立即设为 `Date.now()`。如果新 Watch 的 `onChange` 回调延迟触发（网络延迟），15 秒后 Watchdog 再次检查时 `watchLastEventTime` 可能已超过 60 秒（因为旧值被清零后新值在 `.watch()` 调用时设置，而非在 `onChange` 首次触发时设置），导致再次超时。

**修复**：在 `checkAndRebuildWatchers(true)` 成功完成后，显式重置所有 `watchLastEventTime` 为当前时间，给新 Watch 一个完整的 60 秒窗口。

### 版本号同步（9 处）

与 v9.2.1 相同的 9 处版本号更新，版本号从 `v9.2.1` → `v9.2.2`。

## Impact

- **Affected specs**：v9.2.1（v9.2.2 在它之后）、v9.0.11（Watchdog 限频机制被强化）
- **Affected code**：
  - [app-auth.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js)（1 处：beforeunload 加 Watch 清理）
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（2 处：Watchdog 补偿同步时序 + 重建后心跳重置）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（4 处：title / subtitle / 关于页 / 用户日志）
  - [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js)（2 处：注释 / CACHE_NAME）
  - [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle)（2 处：versionCode / versionName）

## ADDED Requirements

### Requirement: v9.2.2 Watch 生命周期修复

The system SHALL fix the Watch lifecycle management issues that cause "no realtime listener found" errors and Watchdog timeout loops, ensuring:

1. Page close/refresh properly closes all Watch connections
2. Watchdog reconcile sync waits for rebuild completion
3. Watchdog gives newly rebuilt Watch connections a full 60s window before checking again

#### Scenario: 1. 页面关闭/刷新后不再产生僵尸 watchId
- **WHEN** 用户关闭或刷新 PWA 页面
- **THEN** `beforeunload` 中调用 `DAL.unsubscribeAll()` 主动关闭所有 Watch 连接
- **AND** 服务器端不再推送数据到已失效的 watchId
- **AND** 控制台不再出现 "no realtime listener found for watchId" 错误

#### Scenario: 2. Watchdog 补偿同步在重建完成后执行
- **WHEN** Watchdog 检测到心跳超时并触发 `checkAndRebuildWatchers(true)`
- **THEN** `reconcileCloudAfterWatch('watchdog-timeout')` 在 `checkAndRebuildWatchers` 的 Promise 完成后才执行
- **AND** 不再出现补偿同步与重建竞态导致的失败

#### Scenario: 3. Watchdog 重建后不再立即再次超时
- **WHEN** Watchdog 触发重建并成功完成
- **THEN** 所有 `watchLastEventTime` 被重置为当前时间
- **AND** 新 Watch 连接获得完整的 60 秒窗口
- **AND** 不再出现 #1→#4 连续超时循环

## MODIFIED Requirements

### Requirement: PWA beforeunload 生命周期管理

v4.0.0 的 `beforeunload` 仅在未登录时保存本地缓存。v9.2.2 扩展：已登录用户关闭页面时也需清理 Watch 连接，避免服务器端残留僵尸订阅。

**修改位置**：[app-auth.js:2991-2997](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991)

## REMOVED Requirements

无删除的需求。
