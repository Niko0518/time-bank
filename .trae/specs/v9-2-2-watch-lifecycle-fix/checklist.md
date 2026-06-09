# v9.2.2 Checklist

## Phase 1: SPEC 完整性

- [x] spec.md 存在且包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）

## Phase 2: P0 修复

- [x] **2.1.1** [app-auth.js:2991-3003](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991) beforeunload 中已登录时调用 `DAL.unsubscribeAll()` 清理 Watch 连接
- [x] **2.1.2** 代码审查通过（运行时验证需在 PWA 中刷新页面确认）
- [x] **2.2.1** [app-1.js:1212-1224](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1212) Watchdog 补偿同步从固定 8s setTimeout 改为 Promise chain（重建完成后 + 2s 延迟）
- [x] **2.2.2** 代码审查通过（运行时验证需在 PWA 中触发 Watchdog 重建确认）

## Phase 3: P1 修复

- [x] **3.1.1** [app-1.js:1942-1944](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1942) `checkAndRebuildWatchers(true)` 成功路径中重置所有 `watchLastEventTime` 为当前时间
- [x] **3.1.2** 代码审查通过（运行时验证需在 PWA 中触发 Watchdog 重建确认）

## Phase 4: 版本号同步

- [x] **4.1** [app-1.js:9](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L9) APP_VERSION = 'v9.2.2'
- [x] **4.2** [app-1.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释追加 v9.2.2
- [x] **4.3** [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.2.2
- [x] **4.4** [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.2.2 · Watch 生命周期修复"
- [x] **4.5** [index.html:1414](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1414) 关于页 v9.2.2
- [x] **4.6** [index.html:1487](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1487) 用户日志 v9.2.2 条目
- [x] **4.7** [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.2.2
- [x] **4.8** [sw.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L7) CACHE_NAME v9.2.2
- [x] **4.9** [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) versionCode 47, versionName 9.2.2

## Phase 5: 验证

- [ ] **5.1** 刷新页面后控制台不再出现 "no realtime listener found for watchId"
- [ ] **5.2** Watchdog 触发重建后不再出现连续超时循环
- [ ] **5.3** 补偿同步日志时序正确
- [ ] **5.4** 控制台错误数显著下降

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| beforeunload 中 async 不保证完成 | 中 | fire-and-forget 调用 unsubscribeAll，SDK 内部 close() 是同步的 |
| 补偿同步延后可能导致数据短暂不一致 | 低 | 增量同步有 30 分钟窗口，且 Watch onChange 仍会推送实时变更 |
| 重建后心跳重置可能掩盖真实连接问题 | 低 | 60 秒窗口足够检测真实断连，且 Watchdog 限频机制仍生效 |
