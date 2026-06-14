# v9.3.3 Checklist

## Phase 1: SPEC 完整性
- [x] spec.md 存在且包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）

## Phase 2: 原生层基础（CloudSyncScheduler + WorkManager）

- [ ] **2.1** [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle) 新增 `androidx.work:work-runtime:2.9.1` 依赖
- [ ] **2.2** [gradle/libs.versions.toml](file:///d:/TimeBank/android_project/gradle/libs.versions.toml) 新增 `work` / `gson` 版本号与 library 引用
- [ ] **2.3** 新建 [CloudSyncScheduler.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)：
  - `start(Context)` 注册 `PeriodicWorkRequest<CloudSyncWorker>(15, MINUTES)`
  - `scheduleImmediate(Context)` 注册 `OneTimeWorkRequest + ExistingWorkPolicy.REPLACE`
  - `getPendingDelta(Context)` 读 SharedPreferences `pending_cloud_delta`
  - `markConsumed(Context, long)` 更新 SharedPreferences `tb_last_native_sync_at`
  - `onAppForeground(Context)` 调度即时任务 + 注入 WebView（通过 Application.isForeground 标志）
  - `onAppBackground(Context)` 取消前台即时任务
  - `isActive(Context)` 读 WorkManager 状态
- [ ] **2.4** 内部类 `CloudSyncWorker extends Worker`：
  - 读 lastSyncAt
  - HTTP POST 调用 `timebankSync` 云函数（action: "delta", since: lastSyncAt）
  - 解析返回 JSON
  - 写入 SharedPreferences `pending_cloud_delta`
  - 若 App 在前台 → 调 `MainActivity.evaluateJavascript("window.__onNativeCloudDelta(...)")`
  - 更新 lastSyncAt
  - 失败时 `Result.retry()`
- [ ] **2.5** `Application` 类（如不存在需新建）持有 `isForeground` 标志，由 `MainActivity.onResume/onPause` 维护

## Phase 3: 桥方法与 MainActivity 改造

- [ ] **3.1** [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) 新增 4 个 `@JavascriptInterface` 方法：
  - `consumeNativeCloudDelta(String sinceIso)` → `CloudSyncScheduler.markConsumed(mContext, ...)`
  - `getPendingCloudDelta()` → `CloudSyncScheduler.getPendingDelta(mContext)`
  - `isNativeSyncActive()` → `CloudSyncScheduler.isActive(mContext)`
  - `markJsHeartbeatFailed(String error)` → `CloudSyncScheduler.scheduleImmediate(mContext)` + `Log.w`
- [ ] **3.2** [MainActivity.java#onResume](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java#L232)：
  - 调用 `CloudSyncScheduler.onAppForeground(this)`
  - 读 `getPendingDelta()`，若非空则 `evaluateJavascript("window.__onNativeCloudDelta(...)")`
- [ ] **3.3** [MainActivity.java#onPause](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java) 新增：
  - 调用 `CloudSyncScheduler.onAppBackground(this)`

## Phase 4: KeepAliveService 集成

- [ ] **4.1** [KeepAliveService.java#onStartCommand](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java#L33)：
  - 在 `startForeground` 之后调用 `CloudSyncScheduler.start(this)`
- [ ] **4.2** [KeepAliveService.java#onDestroy](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java#L54)：
  - **不**停止 WorkManager 调度器（系统调度，不依赖 Service 进程）

## Phase 5: JS 端改造

- [ ] **5.1** [app-1.js#__startWatchHeartbeat](file:///d:/TimeBank/js/app-1.js#L976)：
  - `tick` catch 块增加 `window.Android.markJsHeartbeatFailed(error)` 调用
- [ ] **5.2** [app-1.js](file:///d:/TimeBank/js/app-1.js) 新增 `window.__applyNativeCloudDelta` 函数：
  - 解析 delta JSON
  - 调用 `mergeTransactionDelta` / `mergeRunningDelta`（task / profile / daily 类似）
  - 更新 `lastCloudSyncAt` 与 `localStorage.tb_lastCloudSyncAt`
  - 调用 `window.Android.consumeNativeCloudDelta(since)`
  - 调用 `updateAllUI()`
- [ ] **5.3** [app-auth.js#visibilitychange](file:///d:/TimeBank/js/app-auth.js#L2807) 改为 always-reconcile：
  - 任何后台返回都先调 `window.Android.getPendingCloudDelta()`
  - 若非空调 `window.__applyNativeCloudDelta(delta)`
  - 短休眠（≤60s）也调 `checkAndRebuildWatchers(false)`
  - 保留长休眠（>60s）的 `triggerSync + autoSettleScreenTime` 链

## Phase 6: 监控状态显示器

- [ ] **6.1** [index.html](file:///d:/TimeBank/index.html) 监听状态显示器新增"原生层同步"维度
- [ ] **6.2** 调用 `window.Android.isNativeSyncActive()` 实时反映

## Phase 7: 两端代码同步

- [ ] **7.1** `android_project/.../www/` 副本与根目录 `js/` / `index.html` / `sw.js` 同步
- [ ] **7.2** 任何 JS 改动需同时同步到 `js/app-1.js` ↔ `android_project/app/src/main/assets/www/js/app-1.js`

## Phase 8: 版本号同步（9 处）

- [ ] **8.1** [app-1.js:14](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L14) `APP_VERSION = 'v9.3.3'`
- [ ] **8.2** [app-1.js:1-12](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1) 启动日志注释追加 v9.3.3
- [ ] **8.3** [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.3.3
- [ ] **8.4** [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.3.3 · 监控保活搬到原生层"
- [ ] **8.5** [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) 关于页 v9.3.3
- [ ] **8.6** [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) 用户日志新增 v9.3.3 条目
- [ ] **8.7** [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.3.3
- [ ] **8.8** [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) `CACHE_NAME = 'timebank-cache-v9.3.3'`
- [ ] **8.9** [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) `versionCode 51 → 52`, `versionName "9.3.2" → "9.3.3"`

## Phase 9: 验证清单（用户实机）

- [ ] **9.1** 安装 v9.3.3 APK，启动后能在 `dumpsys jobscheduler` 看到 `androidx.work.impl.background.systemjob.SystemJobService` 注册
- [ ] **9.2** 长按 home 退出 App，5 分钟后回前台 → 失败队列数 < 5
- [ ] **9.3** 熄屏 1 小时后回前台 → < 30s 内完成 reconcile，状态指示器变 🟢
- [ ] **9.4** 后台 30 分钟 → 回前台 → 监控状态显示"原生层同步：活跃"
- [ ] **9.5** 频繁点击"重启"按钮的 workaround 不再被使用
- [ ] **9.6** logcat 无 ANR / Service 启动失败
- [ ] **9.7** 静默飞行模式 → 恢复网络 → 原生层差集自动注入（不需要用户操作）
