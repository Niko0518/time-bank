# Tasks

- [x] Task 1: 版本号更新至 v9.3.1（7 个位置）
  - [x] 1.1 更新 `js/app-1.js`: `APP_VERSION` = `"v9.3.1"`
  - [x] 1.2 更新 `index.html`: `<title>` 标签
  - [x] 1.3 更新 `index.html`: `.version-subtitle`
  - [x] 1.4 更新 `index.html`: 关于页版本号
  - [x] 1.5 更新 `sw.js`: 文件头部注释
  - [x] 1.6 更新 `sw.js`: `CACHE_NAME` = `timebank-cache-v9.3.1`
  - [x] 1.7 更新 `android_project/app/build.gradle`: `versionName` = `"9.3.1"`

- [x] Task 2: 云函数新增 `startSleep` / `endSleep` 两个 case
  - [x] 2.1 在 `cloudbase-functions/tbMutation/index.js` 中 switch 块增加 `case 'startSleep':` 处理（读 profile → CAS isSleeping === false → set 全字段 → 返回 0/1002）
  - [x] 2.2 在 `cloudbase-functions/tbMutation/index.js` 中 switch 块增加 `case 'endSleep':` 处理（读 profile → 幂等检查 → set 清空字段 → 返回 0/410）
  - [x] 2.3 字段值：`isSleeping` / `sleepStartTime` / `sleepType` / `startedByDeviceId` / `startedByDeviceName` / `cancelled` / `lastUpdated`
  - [x] 2.4 复用 `_.set` 与 `db.collection(TABLES.PROFILE).where({ _openid: uid })` 模式
  - [x] 2.5 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 3: 客户端 `startUnifiedSleep` 改造（无离线容忍版）
  - [x] 3.1 在 `js/app-sleep.js` 倒计时确认回调中改为先调 `DAL.callMutation('startSleep', {...})`
  - [x] 3.2 仅当 `code === 0` 时设本地闹钟 + 写本地 UI 缓存
  - [x] 3.3 当 `code === 1002` 时撤销本地闹钟（已设则 cancel）+ 提示"已被 [设备名] 抢占"
  - [x] 3.4 当调用抛出异常（断网）时撤销本地闹钟 + 提示"网络异常"
  - [x] 3.5 移除原先"先写本地再异步同步云端"的链式逻辑
  - [x] 3.6 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 4: 客户端 `endUnifiedSleep` 改造
  - [x] 4.1 在 `js/app-sleep.js` `endUnifiedSleep` 中先调 `DAL.callMutation('endSleep', { cancelled: false })`
  - [x] 4.2 仅当云端成功（或本机原本在睡眠）才执行本地 `doSleepSettlement`
  - [x] 4.3 增加"远端结束"分支：本机 `isSleeping === false` 但云端 `isSleeping === true` 时，使用云端 `sleepStartTime` 做结算
  - [x] 4.4 远端结束时，UI 提示"已为 [startedByDeviceName] 结束睡眠"
  - [x] 4.5 网络异常时撤销本地闹钟 + 提示"网络异常"
  - [x] 4.6 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 5: 客户端 `cancelSleep` 走云函数
  - [x] 5.1 在 `js/app-sleep.js` `cancelSleep` 中增加 `DAL.callMutation('endSleep', { cancelled: true })` 调用
  - [x] 5.2 取消本地闹钟逻辑保持
  - [x] 5.3 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 6: Profile Watcher 远端停铃分支
  - [x] 6.1 在 `js/app-1.js` profile watcher onChange 中检测 `sleepState.isSleeping: true→false` 变化
  - [x] 6.2 若本机 `sleepState.isSleeping === true`（本机曾设过闹钟），调 `cancelAlarmWithId(ALARM_ID_SLEEP)` 与 `cancelAlarmWithId(ALARM_ID_NAP)`
  - [x] 6.3 调 `Android.stopSleepMonitor()`
  - [x] 6.4 清本机 UI 缓存（`sleepState.isSleeping = false`），不写云端
  - [x] 6.5 显示通知"睡眠已被其他设备结束"
  - [x] 6.6 若云端 `cancelled === true`，通知文案为"睡眠已被取消"
  - [x] 6.7 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 7: 客户端 `saveSleepState` 改为写云端统一字段
  - [x] 7.1 修改 `js/app-sleep.js` `saveSleepState`，云端写入改为 `DAL.saveProfile({ sleepState: _.set(criticalState) })`
  - [x] 7.2 不再写 `deviceSleepState.${currentDeviceId}`
  - [x] 7.3 移除"先写 Android 原生 → localStorage → 云端"三级降级中的权威语义，改为"云端成功后再写本地 UI 缓存"
  - [x] 7.4 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 8: 客户端 `applySleepStateFromCloud` 接收统一对象
  - [x] 8.1 修改 `js/app-sleep.js` `applySleepStateFromCloud`，参数由 `deviceSleepState[deviceId]` 改为直接 `sleepState` 单一对象
  - [x] 8.2 字段处理：`isSleeping` / `sleepStartTime` / `cancelled` / `lastUpdated`
  - [x] 8.3 按 `lastUpdated` 比较决定是否覆盖本地 UI 缓存
  - [x] 8.4 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 9: 客户端 `initSleepSettings` 不再以本地为权威
  - [x] 9.1 修改 `js/app-sleep.js` `initSleepSettings`，移除"本地有则保持本地"决策
  - [x] 9.2 本地 `sleepState` 仅在 Watcher 未就绪时作 UI 占位（保持 `isSleeping: false` 默认）
  - [x] 9.3 移除对 `deviceSleepState[deviceId]` 的读取
  - [x] 9.4 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 10: UI "远端睡眠中" 状态分支
  - [x] 10.1 修改 `js/app-sleep.js` `updateSleepCard`，增加第三种状态：本机 `isSleeping === false` 且云端 `isSleeping === true`
  - [x] 10.2 statusEl 显示 `睡眠中（${startedByDeviceName}）`
  - [x] 10.3 主按钮文案 = "结束睡眠"，点击触发 `endUnifiedSleep`
  - [x] 10.4 所有新增/修改日志包含 `[v9.3.1]` 标记

- [x] Task 11: deviceSleepState → sleepState 一次性迁移
  - [x] 11.1 在 `js/app-sleep.js` 增加 `migrateDeviceSleepStateToUnified` 函数
  - [x] 11.2 检测 `profileData.deviceSleepState` 存在且 `profileData.sleepState` 不存在
  - [x] 11.3 取 Map 中 `isSleeping=true` 且 `lastUpdated` 最大的那条，写入新 `sleepState`
  - [x] 11.4 调用一次 `DAL.saveProfile` 把新 `sleepState` 写回云端并删除 `deviceSleepState` 字段
  - [x] 11.5 在 `initSleepSettings` 中、`applySleepStateFromCloud` 之前调用
  - [x] 11.6 所有新增/修改日志包含 `[v9.3.1]` 标记

# Task Dependencies
- Task 1（版本号）无依赖，可立即执行
- Task 2（云函数）无依赖，是其他客户端任务的前置
- Task 3（startUnifiedSleep）依赖 Task 2（云函数接口）
- Task 4（endUnifiedSleep）依赖 Task 2
- Task 5（cancelSleep）依赖 Task 2
- Task 6（Watcher 远端停铃）依赖 Task 2
- Task 7（saveSleepState）独立，可与其他任务并行
- Task 8（applySleepStateFromCloud）依赖 Task 2（接收新结构）
- Task 9（initSleepSettings）依赖 Task 11（迁移先于读取）
- Task 10（UI 远端睡眠分支）独立
- Task 11（迁移）独立

# 建议执行顺序
1. Task 1（版本号，立即可做）
2. Task 2（云函数，基础接口）
3. 并行：Task 3 / Task 4 / Task 5 / Task 6 / Task 7 / Task 8 / Task 10 / Task 11
4. Task 9（最后改 initSleepSettings，避免影响前面任务）
