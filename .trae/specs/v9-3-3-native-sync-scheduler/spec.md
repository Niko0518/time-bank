# v9.3.3 监控机制原生层保活 Spec

## Why

`debug-monitor-listener.md` + 用户当前反馈：当前监控链路（CloudBase Watch 5 张表 + 60s watchdog + 20s JS 心跳 + 10s activeSync + visibilitychange 恢复）**全部基于 JS `setTimeout/setInterval`**，而 JS 定时器在 Android WebView 后台会被 **Doze + App Standby 双重冻结**。这导致 5 个连锁问题：

1. **WebSocket 静默死亡不上报 onError** — CloudBase SDK v2 WebSocket 被系统回收时不上报，前端 watchdog 永远等不到 `lastTime=0` 触发条件
2. **20s JS 心跳随 WebView 一起挂起** — [`__startWatchHeartbeat`](file:///d:/TimeBank/js/app-1.js#L976) 的 `setInterval` 在后台被 Android 限流到分钟级
3. **watchdog 自己也用 setTimeout** — [`startWatchHeartbeatWatchdog`](file:///d:/TimeBank/js/app-1.js#L1186) 的 60s 超时检查在后台根本不执行
4. **activeSync 10s 同步同样挂起** — [`startActiveSync`](file:///d:/TimeBank/js/app-1.js#L2178) 的 10s `setInterval` 后台冻结
5. **visibilitychange 阈值太宽松** — [`app-auth.js:2811`](file:///d:/TimeBank/js/app-auth.js#L2811) 的 60s 阈值让 30s~60s 的后台返回不做主动重建

**用户可观测症状**：长后台后从"已同步"切回前台，失败队列出现 168/8（168 条云端差集 / 8 次重试），必须频繁点击"重启"按钮才能恢复。

**v9.2.0 之后明显恶化**的根因：v9.2.0+ 引入了 [`qpsLimiter`](file:///d:/TimeBank/js/app-1.js) 与 [`MUTATION_ERROR_CODE`](file:///d:/TimeBank/js/app-1.js#L1294) 分类，失败被如实记录到 [`tb_failed_mutations`](file:///d:/TimeBank/js/app-1.js) 持久化队列，**让原本被掩盖的失败被用户看到**——但底层保活机制（KeepAliveService + JS 心跳）从 v7.36.2 至今没变。

**用户原始诉求**：
> "机制完善，而非补丁，完善机制解决问题，状态不一致的问题是否能迎刃而解"

**回归基线**：当前 v9.3.2 增量（10s activeSync + Bug 1/2 修复），不含 v9.3.1 睡眠云同步（用户明确排除）。

**用户拍板决策**（2026-06-12）：
- 调度器实现：**WorkManager**（15min 周期 + 前台即时任务）
- 实施节奏：**v9.3.3 一次性打全 P0**（CloudSyncScheduler + JS 配合）
- 范围：明确排除睡眠云同步

---

## What Changes

### 改造 1（P0）：新增 `CloudSyncScheduler`（原生层同步调度器）

**新建文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)

**核心职责**：
- 用 **WorkManager 周期任务** 兜底（最小 15min，受 Doze 影响但比 `setInterval` 可靠）
- 前台时通过 **前台即时任务** 触发（不依赖 WebView）
- 每次触发：调用 `timebankSync` 云函数拉取 `_updateTime > lastSyncAt` 的差集
- 后台时差集暂存到 SharedPreferences `pending_cloud_delta`
- 前台时通过 `MainActivity.evaluateJavascript` 注入 `window.__onNativeCloudDelta(json)`

**关键 API**：

```java
public class CloudSyncScheduler {
    public static synchronized void start(Context ctx);        // 注册 WorkManager 周期任务
    public static void scheduleImmediate(Context ctx);          // 前台时立即触发一次
    public static String getPendingDelta(Context ctx);          // JS 端拉取后台差集
    public static void markConsumed(Context ctx, long since);   // JS 端消费完毕
    public static void onAppForeground(Context ctx);            // MainActivity.onResume 调用
    public static void onAppBackground(Context ctx);            // MainActivity.onPause 调用
    public static boolean isActive(Context ctx);                // UI 显示用
}
```

**WorkManager 任务实现**（内部类 `CloudSyncWorker extends Worker`）：

```java
public Result doWork() {
    // 1. 读 lastSyncAt (SharedPreferences "tb_last_native_sync_at")
    // 2. HTTP POST 调用 timebankSync 云函数 { action: "delta", since: lastSyncAt }
    // 3. 序列化差集 JSON → SharedPreferences "pending_cloud_delta"
    // 4. 若 App 在前台（Application.isForeground 标志）→ MainActivity.evaluateJavascript("window.__onNativeCloudDelta(...)")
    // 5. 更新 lastSyncAt
    return Result.success();
}
```

**关键设计决策**：**不引入 CloudBase Java SDK**（避免 APK 增大 2MB），改用 **HTTP REST API 调用 `timebankSync` 云函数**。云函数已部署，复用现有云端能力。

### 改造 2（P0）：`WebAppInterface` 增加 4 个桥方法

**位置**：[`WebAppInterface.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)

**新增方法**：

```java
@JavascriptInterface
public void consumeNativeCloudDelta(String sinceIso); // 标记消费完毕
@JavascriptInterface
public String getPendingCloudDelta();                  // 拉取后台差集
@JavascriptInterface
public boolean isNativeSyncActive();                   // UI 显示用
@JavascriptInterface
public void markJsHeartbeatFailed(String error);       // JS 心跳失败上报
```

### 改造 3（P0）：`MainActivity.onResume / onPause` 调度原生层

**位置**：[`MainActivity.java:232-238`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java#L232)

```java
@Override
protected void onResume() {
    super.onResume();
    checkPendingFloatingTimerAction();
    notifyJsSystemThemeChanged();
    // [v9.3.3] 通知原生层 + 注入后台差集
    CloudSyncScheduler.onAppForeground(this);
    try {
        final String delta = CloudSyncScheduler.getPendingDelta(this);
        if (delta != null && !delta.isEmpty() && !"[]".equals(delta) && !"{}".equals(delta)) {
            myWebView.post(() -> myWebView.evaluateJavascript(
                "window.__onNativeCloudDelta && window.__onNativeCloudDelta(" 
                + JSONObject.quote(delta) + ");", null));
        }
    } catch (Exception e) { Log.w("TimeBank", "delta inject failed", e); }
}

@Override
protected void onPause() {
    super.onPause();
    CloudSyncScheduler.onAppBackground(this);
}
```

### 改造 4（P0）：`KeepAliveService` 启动调度器

**位置**：[`KeepAliveService.java:33-46`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java#L33)

```java
@Override
public int onStartCommand(Intent intent, int flags, int startId) {
    if (!isKeepAliveEnabled()) { stopSelf(); return START_NOT_STICKY; }
    startForeground(NOTIFICATION_ID, createNotification());
    CloudSyncScheduler.start(this);  // [v9.3.3] 启动云端同步调度器
    return START_STICKY;
}

@Override
public void onDestroy() {
    super.onDestroy();
    // [v9.3.3] 不停止 WorkManager 调度器（系统调度，不依赖 Service 进程）
}
```

### 改造 5（P0）：`AndroidManifest.xml` 权限与依赖

**新增依赖**（`build.gradle`）：
```gradle
dependencies {
    implementation 'androidx.work:work-runtime:2.9.1'
    implementation 'com.google.code.gson:gson:2.10.1'
}
```

**版本**（`gradle/libs.versions.toml`）：
```toml
work = "2.9.1"
gson = "2.10.1"
work-runtime = { group = "androidx.work", name = "work-runtime", version.ref = "work" }
gson = { group = "com.google.code.gson", name = "gson", version.ref = "gson" }
```

**Manifest**：WorkManager 自动注册，无需手动声明 service。

### 改造 6（P0）：`app-auth.js` visibilitychange 改为 always-reconcile

**位置**：[`app-auth.js:2807-2899`](file:///d:/TimeBank/js/app-auth.js#L2807)

**修改策略**：
- 移除 60s 阈值的"是否要主动 reconcile"判断
- **任何长度的后台返回**都先拉取 `getPendingCloudDelta()` + 触发 `checkAndRebuildWatchers`
- 长休眠 (>60s) 保留原有 `triggerSync + autoSettleScreenTime` 链

### 改造 7（P0）：`app-1.js` 心跳失败上报原生层

**位置**：[`app-1.js:976-996`](file:///d:/TimeBank/js/app-1.js#L976)

**修改**：`__startWatchHeartbeat` 的 `tick` 失败时调用 `window.Android.markJsHeartbeatFailed(error)`，由原生层兜底触发 reconcile。

### 改造 8（P0）：`app-1.js` 新增 `__applyNativeCloudDelta` 函数

**位置**：[`app-1.js`](file:///d:/TimeBank/js/app-1.js)（在 `__markWatchSuccess` 附近）

**功能**：接收原生层差集 JSON，调用 `mergeTransactionDelta` / `mergeRunningDelta` 等合并函数，更新 `lastCloudSyncAt`，调用 `consumeNativeCloudDelta(since)` 通知原生层已消费。

### 改造 9（P1）：监控状态显示器增加"原生层同步"维度

**位置**：[`index.html`](file:///d:/TimeBank/index.html) 监听状态显示器

**新增显示**：
- 🟢 `原生层同步：活跃`
- 🟡 `原生层同步：等待`
- 🔴 `原生层同步：失败`

调用 `window.Android.isNativeSyncActive()` 实时反映。

### 版本号同步（9 处）

版本号 `v9.3.2` → `v9.3.3`：
- `app-1.js:14` `APP_VERSION`
- `app-1.js:1-12` 启动日志注释
- `index.html:12` `<title>`
- `index.html:242` `.version-subtitle` → "TimeBank v9.3.3 · 监控保活搬到原生层"
- `index.html:1420` 关于页版本号
- `index.html:1479` 用户日志新增 v9.3.3 条目
- `sw.js:1` 注释
- `sw.js:6` `CACHE_NAME`
- `build.gradle:15-16` `versionCode 51 → 52`, `versionName "9.3.2" → "9.3.3"`

---

## Impact

**Affected specs**：
- v9.2.1（v9.3.3 在它之后）
- v9.2.2（Watch 生命周期被扩展到原生层）
- v9.2.3（监听状态显示器增加"原生层同步"维度）
- v9.3.0（同步链路失败处理扩展到原生层）
- v9.3.2（10s activeSync 与原生层协同）

**Affected code**（变更清单）：
- **新增**：[`android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)
- **修改**：[`WebAppInterface.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)（+4 个桥方法）
- **修改**：[`MainActivity.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java)（onResume/onPause + delta 注入）
- **修改**：[`KeepAliveService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java)（启动调度器）
- **修改**：[`build.gradle`](file:///d:/TimeBank/android_project/app/build.gradle)（+work-runtime + gson 依赖）
- **修改**：[`gradle/libs.versions.toml`](file:///d:/TimeBank/android_project/gradle/libs.versions.toml)（+work + gson 版本）
- **修改**：[`js/app-1.js`](file:///d:/TimeBank/js/app-1.js)（心跳上报 + `__applyNativeCloudDelta` + 版本号）
- **修改**：[`js/app-auth.js`](file:///d:/TimeBank/js/app-auth.js)（visibilitychange always-reconcile + 拉取原生差集）
- **修改**：[`android_project/app/src/main/assets/www/js/app-1.js`](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（同上 JS 改动同步）
- **修改**：[`android_project/app/src/main/assets/www/js/app-auth.js`](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js)（同上 JS 改动同步）
- **修改**：[`index.html`](file:///d:/TimeBank/index.html)（4 处版本号 + 状态显示器）
- **修改**：[`android_project/app/src/main/assets/www/index.html`](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（同上同步）
- **修改**：[`sw.js`](file:///d:/TimeBank/sw.js)（2 处版本号）
- **修改**：[`android_project/app/src/main/assets/www/sw.js`](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js)（同上同步）

---

## ADDED Requirements

### Requirement: v9.3.3 原生层云端同步调度器

The system SHALL schedule cloud sync tasks at the **Java native layer**, ensuring data sync continues even when WebView is suspended.

#### Scenario: 1. WorkManager 周期任务兜底
- **WHEN** App 启动后，`KeepAliveService.startService(this)` 调用 `CloudSyncScheduler.start(this)`
- **THEN** 注册 `PeriodicWorkRequest<CloudSyncWorker>(15, MINUTES)` + `Constraints(NetworkType.CONNECTED)`
- **AND** 每次触发：调用 `timebankSync` 云函数 `{ action: "delta", since: lastSyncAt }` 拉取差集
- **AND** 差集写入 SharedPreferences `pending_cloud_delta`
- **AND** 若 App 在前台 → 注入到 WebView；否则仅暂存

#### Scenario: 2. 前台时即时任务
- **WHEN** `MainActivity.onResume()` 触发
- **THEN** `CloudSyncScheduler.onAppForeground(this)` 调度 `OneTimeWorkRequest<CloudSyncWorker>` + `ExistingWorkPolicy.REPLACE`
- **AND** 同时拉取 `getPendingDelta()` 注入 WebView
- **AND** 5s 内完成

#### Scenario: 3. 后台时仅依赖周期任务
- **WHEN** `MainActivity.onPause()` 触发
- **THEN** `CloudSyncScheduler.onAppBackground(this)` 取消前台即时任务
- **AND** WorkManager 周期任务保留

#### Scenario: 4. JS 端心跳失败由原生层兜底
- **WHEN** `__startWatchHeartbeat` 的 `tick` 抛异常
- **THEN** 调用 `window.Android.markJsHeartbeatFailed(error)` 通知原生层
- **AND** 原生层立即调度 OneTimeWorkRequest 触发 reconcile

#### Scenario: 5. visibilitychange 改为 always-reconcile
- **WHEN** 用户从任何长度（含 1s）的后台返回前台
- **THEN** 拉取 `getPendingCloudDelta()` 并调用 `__applyNativeCloudDelta`
- **AND** 调用 `checkAndRebuildWatchers(false)`
- **AND** 不再等待 60s 阈值

### Requirement: v9.3.3 监控状态显示器增加原生层维度

**位置**：[`index.html`](file:///d:/TimeBank/index.html) 监听状态显示器

**新增显示**：
- 🟢 `原生层同步：活跃` — WorkManager 任务在 15min 内触发过
- 🟡 `原生层同步：等待` — WorkManager 任务触发中
- 🔴 `原生层同步：失败` — WorkManager 任务连续 3 次失败

调用 `window.Android.isNativeSyncActive()` 实时反映。

---

## MODIFIED Requirements

### Requirement: PWA Watch JS 端保活（v9.2.2）

v9.2.2 的 `beforeunload` 清理 Watch 机制保留。v9.3.3 **扩展**：
- JS 端心跳失败时主动上报原生层
- JS 端 visibilitychange 改为 always-reconcile
- JS 端不再独立做"主"保活，原生层做"兜底"保活

### Requirement: KeepAliveService 职责（v7.36.2）

v7.36.2 的 KeepAliveService 仅保活 WebView 进程。v9.3.3 **扩展**：
- 启动时调用 `CloudSyncScheduler.start(this)` 注册 WorkManager 周期任务
- onDestroy 时**不**停止调度器（WorkManager 由系统调度，不依赖 Service 进程）

---

## REMOVED Requirements

无删除的需求。
