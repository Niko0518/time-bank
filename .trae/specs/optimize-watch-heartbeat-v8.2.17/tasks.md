# Tasks

- [x] Task 1: 心跳机制从事件驱动改为连接驱动
  - [x] 1.1 修改 `subscribeAll` 中各 watcher 的注册逻辑：注册成功后立即设置 `watchLastEventTime[key] = Date.now()`
  - [x] 1.2 修改 `onChange` 回调：移除所有 `watchLastEventTime[key] = Date.now()` 赋值
  - [x] 1.3 修改 `onError` 回调：增加 `watchLastEventTime[key] = 0`（标记断连）
  - [x] 1.4 修改 `checkAndRebuildWatchers` 中的状态重置：`watchLastEventTime` 重置为 `0` 保持不变
  - [x] 1.5 修改 `DAL.unsubscribeAll`：取消订阅时 `watchLastEventTime[key] = 0`（已存在，无需修改）
  - [x] 1.6 更新 WATCH_HEARTBEAT_TIMEOUT_MS 注释，说明现在表示"连接建立后无错误的最长容忍时间"

- [x] Task 2: checkAndRebuildWatchers 增加 isSaving 保护
  - [x] 2.1 在 `checkAndRebuildWatchers` 函数入口增加 `isSaving` 检查
  - [x] 2.2 若 `isSaving = true`，跳过重建并记录日志
  - [x] 2.3 添加 `[v8.2.17]` 版本标记注释

- [x] Task 3: 增加用户操作保护窗口
  - [x] 3.1 复用已有全局变量 `lastLocalActionTime`（app-1.js 已声明）
  - [x] 3.2 新增常量 `USER_OPERATION_PROTECTION_MS = 30000`
  - [x] 3.3 `completeTask` 中已设置 `lastLocalActionTime = Date.now()`（已存在，无需修改）
  - [x] 3.4 `startTask` 中已设置 `lastLocalActionTime = Date.now()`（已存在，无需修改）
  - [x] 3.5 `stopTask` 中已设置 `lastSaveTimestamp = Date.now()`（保护已有），`lastLocalActionTime` 需在 stopTask 中添加
  - [x] 3.6 `reconcileCloudAfterWatch` 中增加保护窗口检查
  - [x] 3.7 `checkAndRebuildWatchers` 中增加保护窗口检查
  - [x] 3.8 `scheduleWatchReconnect` 中增加保护窗口检查
  - [x] 3.9 所有新增检查添加明确的日志输出

- [x] Task 4: scheduleWatchReconnect 入口保护
  - [x] 4.1 `isSaving` 检查已添加
  - [x] 4.2 `lastLocalActionTime` 保护窗口检查已添加
  - [x] 4.3 保护期内不增加计数器、不弹 Toast
  - [x] 4.4 `[v8.2.17]` 版本标记已添加

- [x] Task 5: 更新 WATCH_HEARTBEAT_TIMEOUT_MS 注释
  - [x] 5.1 `WATCH_HEARTBEAT_TIMEOUT_MS` 注释已更新
  - [x] 5.2 watchdog 检查函数注释已更新

- [x] Task 6: 验证现有 spec 已完成
  - [x] 6.1 确认 `fix-sync-running-conflict` spec 所有任务已完成
  - [x] 6.2 确认不影响 v8.2.15 已实施的修复

# Task Dependencies
- Task 1（心跳机制重构）无依赖，可立即执行
- Task 2（isSaving 保护）无依赖，可与 Task 1 并行
- Task 3（用户操作保护窗口）无依赖，可与 Task 1 并行
- Task 4（scheduleWatchReconnect 保护）依赖 Task 3（需要 lastLocalActionTime 变量）
- Task 5（注释更新）依赖 Task 1
- Task 6（验证）依赖所有任务完成
