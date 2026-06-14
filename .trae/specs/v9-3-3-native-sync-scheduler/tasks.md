# v9.3.3 Tasks（实施拆解）

> 本文件是给执行开发者（AI 或人类）的逐步任务清单。每个任务原子化、可单独验证。

---

## Task Group A：依赖与基础（最先做）

### A.1 build.gradle 依赖

**文件**：[`android_project/app/build.gradle`](file:///d:/TimeBank/android_project/app/build.gradle)

**操作**：
```gradle
dependencies {
    // ... 现有依赖
    // [v9.3.3] WorkManager：云端同步周期任务（不受 WebView 挂起影响）
    implementation 'androidx.work:work-runtime:2.9.1'
    // [v9.3.3] Gson：Worker 内部 JSON 序列化
    implementation 'com.google.code.gson:gson:2.10.1'
}
```

**验证**：
```bash
cd android_project
./gradlew app:dependencies --configuration debugRuntimeClasspath | grep work-runtime
# 期望输出：+--- androidx.work:work-runtime:2.9.1
```

### A.2 libs.versions.toml 版本号

**文件**：[`android_project/gradle/libs.versions.toml`](file:///d:/TimeBank/android_project/gradle/libs.versions.toml)

**操作**：在 `[versions]` 段追加：
```toml
work = "2.9.1"
gson = "2.10.1"
```

在 `[libraries]` 段追加：
```toml
work-runtime = { group = "androidx.work", name = "work-runtime", version.ref = "work" }
gson = { group = "com.google.code.gson", name = "gson", version.ref = "gson" }
```

并将 `build.gradle` 改为 `implementation libs.work.runtime` + `implementation libs.gson` 形式（与现有风格一致）。

---

## Task Group B：原生层（CloudSyncScheduler + Worker + Application）

### B.1 新建 Application 类（如不存在）

**操作**：检查 `AndroidManifest.xml` 看 `android:name` 是否指向自定义 Application；若无，新建 `android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java`：

```java
package com.jianglicheng.timebank;
import android.app.Application;
public class TimeBankApplication extends Application {
    // [v9.3.3] App 是否在前台（被 MainActivity.onResume/onPause 维护）
    private volatile boolean isForeground = false;
    public boolean isForeground() { return isForeground; }
    public void setForeground(boolean fg) { this.isForeground = fg; }
}
```

并在 `AndroidManifest.xml` 的 `<application>` 标签加 `android:name=".TimeBankApplication"`。

### B.2 新建 CloudSyncScheduler

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)（新文件）

**参考 spec.md 改造 1 的代码骨架**。完整实现要点：

```java
package com.jianglicheng.timebank;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.NonNull;
import androidx.work.*;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.util.concurrent.TimeUnit;

public class CloudSyncScheduler {
    private static final String TAG = "CloudSyncScheduler";
    private static final String WORK_NAME_PERIODIC = "tb_cloud_sync_periodic";
    private static final String WORK_NAME_IMMEDIATE = "tb_cloud_sync_immediate";
    private static final String PREFS = "tb_cloud_sync";
    private static final String KEY_LAST_SYNC_AT = "last_sync_at";
    private static final String KEY_PENDING_DELTA = "pending_delta";
    private static final long PERIODIC_INTERVAL_MIN = 15;
    
    public static synchronized void start(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
            CloudSyncWorker.class, PERIODIC_INTERVAL_MIN, TimeUnit.MINUTES)
            .setConstraints(new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build())
            .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            WORK_NAME_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    }
    
    public static void scheduleImmediate(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CloudSyncWorker.class)
            .setConstraints(new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build())
            .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(
            WORK_NAME_IMMEDIATE, ExistingWorkPolicy.REPLACE, req);
    }
    
    public static String getPendingDelta(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return prefs.getString(KEY_PENDING_DELTA, "[]");
    }
    
    public static void markConsumed(Context ctx, long sinceMs) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs.edit().putLong(KEY_LAST_SYNC_AT, sinceMs).apply();
    }
    
    public static void onAppForeground(Context ctx) {
        scheduleImmediate(ctx);
    }
    
    public static void onAppBackground(Context ctx) {
        // 不取消周期任务（系统调度）
    }
    
    public static boolean isActive(Context ctx) {
        WorkManager wm = WorkManager.getInstance(ctx);
        // 简化判断：检查 WorkInfo 状态
        try {
            var infos = wm.getWorkInfosForUniqueWork(WORK_NAME_PERIODIC).get();
            for (var info : infos) {
                if (info.getState() == WorkInfo.State.RUNNING 
                    || info.getState() == WorkInfo.State.ENQUEUED) {
                    return true;
                }
            }
        } catch (Exception e) { /* ignore */ }
        return false;
    }
}
```

### B.3 新建 CloudSyncWorker

**文件**：可与 CloudSyncScheduler 同文件作为内部类，或新建 `CloudSyncWorker.java`：

```java
public class CloudSyncWorker extends Worker {
    public CloudSyncWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }
    
    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        SharedPreferences prefs = ctx.getSharedPreferences("tb_cloud_sync", Context.MODE_PRIVATE);
        long lastSyncAt = prefs.getLong("last_sync_at", 0);
        
        try {
            // HTTP POST 调用 timebankSync 云函数
            // POST https://your-env.service.tcloudbase.com/timebankSync
            // body: { "action": "delta", "since": lastSyncAt, "_openid": currentOpenid }
            // 需先获取 currentOpenid (从 SharedPreferences TimeBankAuth 读)
            
            // 简化版：用 OkHttp 4 (或 HttpURLConnection)
            JsonObject delta = fetchDelta(ctx, lastSyncAt);
            
            // 写入 pending_delta
            String deltaJson = new Gson().toJson(delta);
            prefs.edit().putString("pending_delta", deltaJson).apply();
            
            // 若前台，注入 WebView
            TimeBankApplication app = (TimeBankApplication) ctx;
            if (app.isForeground()) {
                // 通过 Broadcast 或静态引用调 MainActivity.evaluateJavascript
                // 推荐用 BroadcastReceiver 模式
                Intent intent = new Intent("com.jianglicheng.timebank.NATIVE_DELTA_READY");
                intent.putExtra("delta", deltaJson);
                ctx.sendBroadcast(intent);
            }
            
            // 更新 lastSyncAt
            long maxUpdateTime = extractMaxUpdateTime(delta);
            if (maxUpdateTime > 0) {
                prefs.edit().putLong("last_sync_at", maxUpdateTime).apply();
            }
            
            return Result.success();
        } catch (Exception e) {
            android.util.Log.w("CloudSyncWorker", "sync failed", e);
            return Result.retry();
        }
    }
}
```

**注意**：HTTP 调用需 OkHttp 或 HttpURLConnection。建议引入 OkHttp 4.12.0。

### B.4 MainActivity 接收 NATIVE_DELTA_READY 广播

**位置**：[`MainActivity.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java)

**新增**：注册 `BroadcastReceiver`：

```java
private BroadcastReceiver nativeDeltaReceiver;
@Override
protected void onResume() {
    super.onResume();
    // [v9.3.3] 注册原生层 delta 广播
    nativeDeltaReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String delta = intent.getStringExtra("delta");
            if (delta != null && myWebView != null) {
                myWebView.post(() -> myWebView.evaluateJavascript(
                    "window.__onNativeCloudDelta && window.__onNativeCloudDelta(" 
                    + JSONObject.quote(delta) + ");", null));
            }
        }
    };
    registerReceiver(nativeDeltaReceiver, 
        new IntentFilter("com.jianglicheng.timebank.NATIVE_DELTA_READY"),
        Context.RECEIVER_NOT_EXPORTED);
    // ... 现有 onResume 逻辑
    CloudSyncScheduler.onAppForeground(this);
    // 注入离线差集
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
    if (nativeDeltaReceiver != null) {
        try { unregisterReceiver(nativeDeltaReceiver); } catch (Exception e) {}
        nativeDeltaReceiver = null;
    }
    CloudSyncScheduler.onAppBackground(this);
}
```

### B.5 KeepAliveService 启动调度器

**位置**：[`KeepAliveService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java)

**修改 onStartCommand**：在 `startForeground` 后增加 `CloudSyncScheduler.start(this);`

**修改 onDestroy**：注释掉停止逻辑（WorkManager 不依赖 Service 进程）。

---

## Task Group C：WebAppInterface 桥方法

### C.1 新增 4 个 @JavascriptInterface 方法

**位置**：[`WebAppInterface.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)

在文件中追加：

```java
@JavascriptInterface
public void consumeNativeCloudDelta(String sinceIso) {
    try {
        long sinceMs = Long.parseLong(sinceIso);
        CloudSyncScheduler.markConsumed(mContext, sinceMs);
    } catch (Exception e) {
        android.util.Log.w("TimeBank", "consumeNativeCloudDelta parse error", e);
    }
}

@JavascriptInterface
public String getPendingCloudDelta() {
    try {
        return CloudSyncScheduler.getPendingDelta(mContext);
    } catch (Exception e) {
        android.util.Log.e("TimeBank", "getPendingCloudDelta error", e);
        return "[]";
    }
}

@JavascriptInterface
public boolean isNativeSyncActive() {
    try {
        return CloudSyncScheduler.isActive(mContext);
    } catch (Exception e) {
        return false;
    }
}

@JavascriptInterface
public void markJsHeartbeatFailed(String error) {
    android.util.Log.w("TimeBank", "JS heartbeat failed: " + error);
    try {
        CloudSyncScheduler.scheduleImmediate(mContext);
    } catch (Exception e) {
        android.util.Log.e("TimeBank", "scheduleImmediate failed", e);
    }
}
```

---

## Task Group D：JS 端改造

### D.1 `app-1.js` 心跳失败上报

**位置**：[`js/app-1.js#__startWatchHeartbeat`](file:///d:/TimeBank/js/app-1.js#L976)

**修改**：tick catch 块改为：
```js
} catch (e) {
    // [v9.3.3] 心跳失败 → 通知原生层
    if (window.Android?.markJsHeartbeatFailed) {
        try { window.Android.markJsHeartbeatFailed(String(e?.message || e)); } catch (_) {}
    }
}
```

### D.2 `app-1.js` 新增 `__applyNativeCloudDelta`

**位置**：[`js/app-1.js`](file:///d:/TimeBank/js/app-1.js)（在 `__markWatchSuccess` 函数附近）

**新增函数**：
```js
// [v9.3.3] 接收原生层差集
window.__applyNativeCloudDelta = function(deltaJson) {
    if (!deltaJson) return;
    try {
        const delta = typeof deltaJson === 'string' ? JSON.parse(deltaJson) : deltaJson;
        let maxUpdateTime = 0;
        
        if (Array.isArray(delta.transactions) && delta.transactions.length > 0) {
            mergeTransactionDelta(delta.transactions);
            maxUpdateTime = Math.max(maxUpdateTime, 
                ...delta.transactions.map(d => d._updateTime || 0));
            console.log(`✅ [v9.3.3] 原生层 transaction 差集合并: ${delta.transactions.length} 条`);
        }
        if (Array.isArray(delta.running) && delta.running.length > 0) {
            mergeRunningDelta(delta.running);
            maxUpdateTime = Math.max(maxUpdateTime, 
                ...delta.running.map(d => d._updateTime || 0));
            console.log(`✅ [v9.3.3] 原生层 running 差集合并: ${delta.running.length} 条`);
        }
        if (Array.isArray(delta.tasks) && delta.tasks.length > 0) {
            mergeTaskDelta?.(delta.tasks); // 视实际情况，可能需新增 mergeTaskDelta
            maxUpdateTime = Math.max(maxUpdateTime, 
                ...delta.tasks.map(d => d._updateTime || 0));
        }
        if (Array.isArray(delta.profiles) && delta.profiles.length > 0) {
            // profile 是单条记录（per _openid）
            applyProfileDelta?.(delta.profiles[0]);
            maxUpdateTime = Math.max(maxUpdateTime, 
                delta.profiles[0]._updateTime || 0);
        }
        if (Array.isArray(delta.dailies) && delta.dailies.length > 0) {
            mergeDailyDelta?.(delta.dailies);
            maxUpdateTime = Math.max(maxUpdateTime, 
                ...delta.dailies.map(d => d._updateTime || 0));
        }
        
        if (maxUpdateTime > 0) {
            lastCloudSyncAt = maxUpdateTime;
            localStorage.setItem('tb_lastCloudSyncAt', String(maxUpdateTime));
            if (window.Android?.consumeNativeCloudDelta) {
                window.Android.consumeNativeCloudDelta(String(maxUpdateTime));
            }
        }
        updateAllUI();
    } catch (e) {
        console.error('[v9.3.3] __applyNativeCloudDelta 处理失败:', e);
    }
};
```

### D.3 `app-auth.js` visibilitychange 改造

**位置**：[`js/app-auth.js#visibilitychange`](file:///d:/TimeBank/js/app-auth.js#L2807)

**修改**：在 `if (document.visibilityState === 'visible')` 块开头加：

```js
// [v9.3.3] 任何后台返回都先拉取原生层差集
try {
    if (window.Android?.getPendingCloudDelta) {
        const delta = window.Android.getPendingCloudDelta();
        if (delta && delta !== '[]' && delta !== '{}') {
            window.__applyNativeCloudDelta?.(delta);
        }
    }
} catch (e) { console.warn('[v9.3.3] 拉取原生差集失败:', e); }
```

并将 `else { checkAndRebuildWatchers(false); }` 分支也保持（短休眠也调一次轻量重建）。

### D.4 `app-1.js` 同步到 `android_project/.../www/js/app-1.js`

**操作**：将 D.1 / D.2 的所有改动 mirror 到 `android_project/app/src/main/assets/www/js/app-1.js`。

### D.5 `app-auth.js` 同步到 `android_project/.../www/js/app-auth.js`

**操作**：将 D.3 的所有改动 mirror 到 `android_project/app/src/main/assets/www/js/app-auth.js`。

---

## Task Group E：监控状态显示器

### E.1 index.html 增加"原生层同步"维度

**位置**：[`index.html`](file:///d:/TimeBank/index.html)（监听状态显示器部分）

**新增 DOM**：在现有监控状态旁增加一个 `<span id="nativeSyncStatus">`：

```html
<div class="watch-status-item">
    <span class="watch-status-label">原生层同步:</span>
    <span id="nativeSyncStatus" class="watch-status-value">
        <span class="status-dot status-unknown">⚪</span> 未启动
    </span>
</div>
```

### E.2 JS 轮询更新

**位置**：[`app-1.js` 或 `app-auth.js`](file:///d:/TimeBank/js/app-1.js)

**新增**：
```js
// [v9.3.3] 每 5s 轮询原生层同步状态
setInterval(() => {
    const el = document.getElementById('nativeSyncStatus');
    if (!el) return;
    if (window.Android?.isNativeSyncActive) {
        const active = window.Android.isNativeSyncActive();
        el.innerHTML = active 
            ? '<span class="status-dot status-online">🟢</span> 活跃'
            : '<span class="status-dot status-degraded">🟡</span> 等待';
    } else {
        el.innerHTML = '<span class="status-dot status-unknown">⚪</span> 仅 Web';
    }
}, 5000);
```

---

## Task Group F：版本号同步

### F.1-F.9 与 checklist Phase 8 一一对应

详见 [checklist.md](file:///d:/TimeBank/.trae/specs/v9-3-3-native-sync-scheduler/checklist.md) Phase 8。

---

## Task Group G：实机验证

每完成一个 Task Group 后，停下来让用户安装 APK 验证。

**关键验证步骤**（与 checklist Phase 9 对应）：

1. **基础验证**：长按 home 5 分钟后回前台，看失败队列数（应 < 5）
2. **深度验证**：熄屏 1 小时后回前台，看监控状态指示器（应 30s 内变 🟢）
3. **稳定性验证**：连续 3 天观察失败队列不应持续增长
4. **logcat 验证**：无 ANR / WorkManager 任务失败
5. **持久化验证**：杀掉 App 进程后，WorkManager 周期任务应继续按 15min 触发

---

## 实施纪律（用户原话）

- **每完成 1 个 Task Group 停下来让用户安装真机测试**，确认无 regression 再进下一个
- **每个 Task 的 diff 控制在 1 个文件 + ≤ 100 行**（Worker / Scheduler 除外）
- **任何引入"启动期新网络调用"的尝试**都需明确失败处理（v9.3.1 教训）
- **WorkManager 任务必须 try/catch 包裹 + Result.retry()**，避免 Worker 崩溃导致周期任务被取消
- **HTTP 调用必须带超时**（5s 连接 + 10s 读取），避免 Worker 长期挂起
