# v9.2.2 Tasks

## 1. SPEC 文档

- [x] 1.1 创建 v9-2-2 spec.md
- [x] 1.2 创建 tasks.md（本文件）
- [x] 1.3 创建 checklist.md

## 2. P0 修复

### 2.1 beforeunload 中清理 Watch 连接

- [x] 2.1.1 [app-auth.js:2991-3003](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991) 在 `beforeunload` 事件中，已登录时调用 `DAL.unsubscribeAll()` 关闭所有 Watch 连接
- [ ] 2.1.2 验证：刷新页面后控制台不再出现 "no realtime listener found for watchId"

### 2.2 Watchdog 补偿同步延后到重建完成后

- [x] 2.2.1 [app-1.js:1212-1224](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1212) 将固定 8 秒 setTimeout 改为 Promise chain（重建完成后 + 2s 延迟再执行补偿同步）
- [ ] 2.2.2 验证：Watchdog 触发重建后，补偿同步日志出现在"新连接已建立"日志之后

## 3. P1 修复

### 3.1 Watchdog 重建后重置心跳时间戳

- [x] 3.1.1 [app-1.js:1942-1944](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1942) 在 `checkAndRebuildWatchers(true)` 成功路径中，`DAL.loadAll()` 完成后重置所有 `watchLastEventTime` 为当前时间
- [ ] 3.1.2 验证：Watchdog 触发重建后，15 秒后再次检查时 `watchLastEventTime` 不超过 60 秒

## 4. 版本号同步（9 处）

- [x] 4.1 [app-1.js:9](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L9) APP_VERSION = 'v9.2.2'
- [x] 4.2 [app-1.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释追加 v9.2.2
- [x] 4.3 [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.2.2
- [x] 4.4 [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.2.2 · Watch 生命周期修复"
- [x] 4.5 [index.html:1414](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1414) 关于页 v9.2.2
- [x] 4.6 [index.html:1487](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1487) 用户日志新增 v9.2.2 条目
- [x] 4.7 [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.2.2
- [x] 4.8 [sw.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L7) CACHE_NAME v9.2.2
- [x] 4.9 [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) versionCode 47, versionName 9.2.2

## 5. 验证

- [ ] 5.1 刷新页面后控制台不再出现 "no realtime listener found for watchId"
- [ ] 5.2 Watchdog 触发重建后不再出现 #1→#4 连续超时循环
- [ ] 5.3 补偿同步日志出现在"新连接已建立"日志之后（时序正确）
- [ ] 5.4 控制台错误数显著下降

# Task Dependencies

- [Task 2-3] 不依赖其他任务（独立修复）
- [Task 4] 依赖 [Task 2-3]（版本号应反映所有修复）
- [Task 5] 依赖 [Task 2-3]（验证需要先修复）
