# Checklist

## Task 1: 心跳机制从事件驱动改为连接驱动
- [x] 1.1 `subscribeAll` 中各 watcher 注册成功后立即设置 `watchLastEventTime[key] = Date.now()`（5 个 watcher 均已设置）
- [x] 1.2 `onChange` 回调中所有 `watchLastEventTime[key] = Date.now()` 已移除（5 个 watcher 均已移除）
- [x] 1.3 `onError` 回调中增加 `watchLastEventTime[key] = 0`（5 个 watcher 均已添加）
- [x] 1.4 `checkAndRebuildWatchers` 中状态重置逻辑正确（`watchLastEventTime` 重置为 `0` 保持不变）
- [x] 1.5 `DAL.unsubscribeAll` 中取消订阅时 `watchLastEventTime[key] = 0`（已存在，无需修改）
- [x] 1.6 `WATCH_HEARTBEAT_TIMEOUT_MS` 注释已更新

## Task 2: checkAndRebuildWatchers 增加 isSaving 保护
- [x] 2.1 函数入口 `isSaving` 检查已添加
- [x] 2.2 `isSaving = true` 时跳过重建并记录日志
- [x] 2.3 添加 `[v8.2.17]` 版本标记注释

## Task 3: 增加用户操作保护窗口
- [x] 3.1 复用已有全局变量 `lastLocalActionTime`（app-1.js 已声明）
- [x] 3.2 常量 `USER_OPERATION_PROTECTION_MS = 30000` 已声明
- [x] 3.3 `completeTask` 中已设置 `lastLocalActionTime = Date.now()`（已存在，无需修改）
- [x] 3.4 `startTask` 中已设置 `lastLocalActionTime = Date.now()`（已存在，无需修改）
- [x] 3.5 `stopTask` 中已添加 `lastLocalActionTime = Date.now()`
- [x] 3.6 `reconcileCloudAfterWatch` 中保护窗口检查已添加
- [x] 3.7 `checkAndRebuildWatchers` 中保护窗口检查已添加
- [x] 3.8 `scheduleWatchReconnect` 中保护窗口检查已添加
- [x] 3.9 所有检查有明确日志输出

## Task 4: scheduleWatchReconnect 入口保护
- [x] 4.1 `isSaving` 检查已添加
- [x] 4.2 `lastLocalActionTime` 保护窗口检查已添加
- [x] 4.3 保护期内不增加计数器、不弹 Toast
- [x] 4.4 `[v8.2.17]` 版本标记已添加

## Task 5: 注释更新
- [x] 5.1 `WATCH_HEARTBEAT_TIMEOUT_MS` 注释已更新
- [x] 5.2 watchdog 检查函数注释已更新

## Task 6: 验证
- [x] 6.1 `fix-sync-running-conflict` spec 所有任务已完成
- [x] 6.2 不影响 v8.2.15 已实施的修复

## 代码质量检查
- [x] 所有新增代码有 `[v8.2.17]` 版本标记注释
- [x] 日志输出符合项目规范（使用中文、明确的日志级别）
- [x] 未破坏现有数据保护机制（pendingRegistry、时间戳获胜、智能合并）
- [x] 未引入新的竞态条件
- [x] 代码符合项目 JavaScript 风格（无 ES2020+ 特性、camelCase 命名）
