package com.jianglicheng.timebank;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * [v9.3.3] 原生层云端同步调度器
 *
 * 核心职责：
 * 1. 用 WorkManager 周期任务（15min）兜底同步，**不受 WebView 挂起影响**
 * 2. 前台时调度 OneTimeWorkRequest 即时同步（5s 内完成）
 * 3. Worker 内部直接 HTTP 调用 timebankSync 云函数拉取差集
 * 4. 差集暂存到 SharedPreferences "pending_cloud_delta"
 * 5. 前台时通过 Broadcast 通知 MainActivity 注入到 WebView
 *
 * 设计决策：
 * - 不引入 CloudBase Java SDK（避免 APK +2MB），用 HttpURLConnection
 * - 不需要鉴权（云函数允许匿名调用或 _openid 在 body 校验）
 * - WorkManager 任务在 App 进程被杀后仍能被系统拉起（Doze/AppStandby 仍可调度）
 */
public class CloudSyncScheduler {
    private static final String TAG = "CloudSyncScheduler";

    // WorkManager 任务唯一名
    private static final String WORK_NAME_PERIODIC = "tb_cloud_sync_periodic";
    private static final String WORK_NAME_IMMEDIATE = "tb_cloud_sync_immediate";

    // 周期任务间隔（WorkManager 最小是 15min）
    private static final long PERIODIC_INTERVAL_MIN = 15;

    // SharedPreferences key
    private static final String PREFS_NAME = "tb_cloud_sync";
    private static final String KEY_LAST_SYNC_AT = "last_sync_at";
    private static final String KEY_PENDING_DELTA = "pending_delta";

    // 广播：Worker 拉取差集完成后通知 MainActivity 注入 WebView
    public static final String ACTION_DELTA_READY = "com.jianglicheng.timebank.NATIVE_DELTA_READY";
    public static final String EXTRA_DELTA_JSON = "delta";

    // [v9.17.9] sync 端点不再硬编码，从 CloudConfigManager 读取
    // （原 CLOUDBASE_FUNCTION_URL 常量已移除，避免遗漏的硬编码引用）

    /**
     * [v9.3.3] 注册 WorkManager 周期任务
     * 由 KeepAliveService.onStartCommand 调用
     */
    public static synchronized void start(Context ctx) {
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                CloudSyncWorker.class, PERIODIC_INTERVAL_MIN, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .addTag("tb-cloud-sync")
                .build();

            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_NAME_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);

            Log.i(TAG, "[v9.3.3] 周期任务已注册，间隔 " + PERIODIC_INTERVAL_MIN + " 分钟");
        } catch (Exception e) {
            Log.e(TAG, "[v9.3.3] 周期任务注册失败", e);
        }
    }

    /**
     * [v9.3.3] 立即调度一次同步（前台时使用）
     * 由 MainActivity.onResume + JS markJsHeartbeatFailed 触发
     */
    public static void scheduleImmediate(Context ctx) {
        try {
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(CloudSyncWorker.class)
                .setConstraints(constraints)
                .addTag("tb-cloud-sync")
                .build();

            WorkManager.getInstance(ctx).enqueueUniqueWork(
                WORK_NAME_IMMEDIATE, ExistingWorkPolicy.REPLACE, req);

            Log.i(TAG, "[v9.3.3] 即时任务已调度");
        } catch (Exception e) {
            Log.e(TAG, "[v9.3.3] 即时任务调度失败", e);
        }
    }

    /**
     * [v9.3.3] 读取后台期间累积的差集 JSON
     * 由 JS getPendingCloudDelta() 桥方法调用
     * @return JSON 字符串，格式：{"transactions":[],"running":[],"tasks":[],"profiles":[],"dailies":[],"maxUpdateTime":0}
     */
    public static String getPendingDelta(Context ctx) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            return prefs.getString(KEY_PENDING_DELTA, "{\"transactions\":[],\"running\":[],\"tasks\":[],\"profiles\":[],\"dailies\":[],\"maxUpdateTime\":0}");
        } catch (Exception e) {
            Log.e(TAG, "[v9.3.3] getPendingDelta 失败", e);
            return "{\"transactions\":[],\"running\":[],\"tasks\":[],\"profiles\":[],\"dailies\":[],\"maxUpdateTime\":0}";
        }
    }

    /**
     * [v9.3.3] 标记 JS 端已消费完差集，更新 lastSyncAt
     * 由 JS consumeNativeCloudDelta(since) 桥方法调用
     * @param sinceMs 最大的 _updateTime（毫秒）
     */
    public static void markConsumed(Context ctx, long sinceMs) {
        try {
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putLong(KEY_LAST_SYNC_AT, sinceMs).apply();
            // [v9.3.3] 消费完成后清空 pending_delta，避免重复注入
            prefs.edit().remove(KEY_PENDING_DELTA).apply();
            Log.i(TAG, "[v9.3.3] markConsumed: lastSyncAt=" + sinceMs);
        } catch (Exception e) {
            Log.e(TAG, "[v9.3.3] markConsumed 失败", e);
        }
    }

    /**
     * [v9.3.3] App 进入前台
     * 由 MainActivity.onResume 调用
     */
    public static void onAppForeground(Context ctx) {
        TimeBankApplication app = (TimeBankApplication) ctx.getApplicationContext();
        app.setForeground(true);
        // 立即调度一次同步，确保后台期间累积的数据被拉取
        scheduleImmediate(ctx);
    }

    /**
     * [v9.3.3] App 进入后台
     * 由 MainActivity.onPause 调用
     */
    public static void onAppBackground(Context ctx) {
        TimeBankApplication app = (TimeBankApplication) ctx.getApplicationContext();
        app.setForeground(false);
        // 不取消周期任务（系统调度）
    }

    /**
     * [v9.3.3] 查询 WorkManager 是否在跑同步（UI 显示用）
     */
    public static boolean isActive(Context ctx) {
        try {
            WorkManager wm = WorkManager.getInstance(ctx);
            List<WorkInfo> infos = wm.getWorkInfosForUniqueWork(WORK_NAME_PERIODIC).get();
            for (WorkInfo info : infos) {
                WorkInfo.State s = info.getState();
                if (s == WorkInfo.State.RUNNING || s == WorkInfo.State.ENQUEUED) {
                    return true;
                }
            }
            // 也检查 immediate
            List<WorkInfo> immInfos = wm.getWorkInfosForUniqueWork(WORK_NAME_IMMEDIATE).get();
            for (WorkInfo info : immInfos) {
                WorkInfo.State s = info.getState();
                if (s == WorkInfo.State.RUNNING || s == WorkInfo.State.ENQUEUED) {
                    return true;
                }
            }
        } catch (Exception e) {
            // get() 可能抛 ExecutionException
        }
        return false;
    }

    // ====================================================================
    // CloudSyncWorker
    // ====================================================================

    /**
     * [v9.3.3] WorkManager Worker：实际执行云端同步
     * - 读取 lastSyncAt
     * - HTTP POST 调用 timebankSync 云函数（action: "getNativeDelta"）
     * - 解析差集 → 暂存 SharedPreferences
     * - 若前台 → 广播通知 MainActivity 注入 WebView
     */
    public static class CloudSyncWorker extends Worker {
        private static final String TAG_WORKER = "CloudSyncWorker";
        private static final int HTTP_TIMEOUT_CONN_MS = 5000;
        private static final int HTTP_TIMEOUT_READ_MS = 10000;

        public CloudSyncWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
            super(ctx, params);
        }

        @NonNull
        @Override
        public Result doWork() {
            Context ctx = getApplicationContext();
            SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            long lastSyncAt = prefs.getLong(KEY_LAST_SYNC_AT, 0);

            // [v9.12.2] 从 TimeBankAuth prefs 读取 _openid，供云函数鉴权
            SharedPreferences authPrefs = ctx.getSharedPreferences("TimeBankAuth", Context.MODE_PRIVATE);
            String userOpenId = authPrefs.getString("userOpenId", "");
            if (userOpenId == null || userOpenId.isEmpty()) {
                Log.w(TAG_WORKER, "[v9.12.2] userOpenId 未保存，跳过同步（用户未登录）");
                return Result.success(); // 不重试，等用户登录后保存
            }

            Log.i(TAG_WORKER, "[v9.12.2] Worker 启动，lastSyncAt=" + lastSyncAt);

            try {
                // [v9.12.2] HTTP POST 调用 timebankSync 云函数
                // action: "getNativeDelta"（5 集合增量差集，专供原生层用）
                // _openid: 鉴权字段（云函数用 context.OPENID || event._openid 校验）
                // [v9.17.9] 端点从 CloudConfigManager 读取，消除硬编码
                CloudConfigManager cfgManager = CloudConfigManager.getInstance(ctx);
                String syncEndpoint = cfgManager.getEndpoint("sync");

                JsonObject reqBody = new JsonObject();
                reqBody.addProperty("action", "getNativeDelta");
                reqBody.addProperty("_openid", userOpenId);
                JsonObject data = new JsonObject();
                data.addProperty("lastSyncAt", lastSyncAt);
                reqBody.add("data", data);

                String response = httpPost(syncEndpoint, new Gson().toJson(reqBody));
                if (response == null || response.isEmpty()) {
                    Log.w(TAG_WORKER, "[v9.3.3] 云函数返回空");
                    return Result.retry();
                }

                JsonObject respJson;
                try {
                    respJson = new Gson().fromJson(response, JsonObject.class);
                } catch (Exception parseErr) {
                    Log.e(TAG_WORKER, "[v9.3.3] 解析响应失败: " + response.substring(0, Math.min(200, response.length())), parseErr);
                    return Result.retry();
                }

                int code = respJson.has("code") ? respJson.get("code").getAsInt() : -1;
                if (code != 0) {
                    Log.w(TAG_WORKER, "[v9.3.3] 云函数返回非 0: " + respJson.toString());
                    return Result.retry();
                }

                // [v9.3.3] 差集结构：
                // { code:0, delta: { transactions:[...], running:[...], tasks:[...], profiles:[...], dailies:[...], maxUpdateTime: 12345 } }
                JsonObject delta = respJson.has("delta") ? respJson.getAsJsonObject("delta") : new JsonObject();

                // 写入 pending_delta
                prefs.edit().putString(KEY_PENDING_DELTA, delta.toString()).apply();

                long maxUpdateTime = delta.has("maxUpdateTime") ? delta.get("maxUpdateTime").getAsLong() : 0;
                if (maxUpdateTime > 0) {
                    prefs.edit().putLong(KEY_LAST_SYNC_AT, maxUpdateTime).apply();
                }

                Log.i(TAG_WORKER, "[v9.3.3] 差集已暂存，maxUpdateTime=" + maxUpdateTime);

                // [v9.3.3] 若 App 在前台 → 广播通知 MainActivity 注入 WebView
                TimeBankApplication app = (TimeBankApplication) ctx;
                if (app.isForeground()) {
                    Intent intent = new Intent(ACTION_DELTA_READY);
                    intent.putExtra(EXTRA_DELTA_JSON, delta.toString());
                    ctx.sendBroadcast(intent);
                    Log.i(TAG_WORKER, "[v9.3.3] 前台：已广播 DELTA_READY");
                } else {
                    Log.i(TAG_WORKER, "[v9.3.3] 后台：差集仅暂存，下次前台时注入");
                }

                return Result.success();
            } catch (Exception e) {
                Log.e(TAG_WORKER, "[v9.3.3] Worker 失败", e);
                return Result.retry();
            }
        }

        /**
         * 简单的 HTTP POST 请求（带超时）
         */
        private String httpPost(String urlStr, String body) throws Exception {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            try {
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                conn.setRequestProperty("Accept", "application/json");
                conn.setDoOutput(true);
                conn.setDoInput(true);
                conn.setConnectTimeout(HTTP_TIMEOUT_CONN_MS);
                conn.setReadTimeout(HTTP_TIMEOUT_READ_MS);

                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                    os.flush();
                }

                int code = conn.getResponseCode();
                if (code != 200) {
                    Log.w(TAG_WORKER, "[v9.3.3] HTTP " + code + " from " + urlStr);
                    return null;
                }

                StringBuilder sb = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                }
                return sb.toString();
            } finally {
                conn.disconnect();
            }
        }
    }
}
