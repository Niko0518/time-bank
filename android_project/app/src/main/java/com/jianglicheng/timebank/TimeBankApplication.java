package com.jianglicheng.timebank;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

/**
 * [v9.4.0] TimeBank 全局 Application 类
 *
 * 职责（v9.4.0 扩展）：
 * 1. 维护 isForeground 标志位（被 MainActivity.onResume/onPause 翻转）
 * 2. 提供全局 SharedPreferences 访问入口
 * 3. 作为 CloudSyncScheduler / CloudSyncWorker 的状态持有者
 * 4. [v9.4.0] 维护个推 PUSH clientId / 长连接状态
 * 5. [v9.4.0] 提供 deviceId（UUID，存 prefs）供 broker 鉴权使用
 *
 * 关键点：
 * - 这个类不持有任何 UI 引用，只做"跨组件状态共享"
 * - WorkManager 周期任务调度后，即便 App 进程被杀，下次启动 WorkManager 仍能恢复
 * - isForeground 标志用于决定 Worker 是"注入到 WebView"还是"仅暂存到 SharedPreferences"
 */
public class TimeBankApplication extends Application {
    private static final String TAG = "TimeBankApp";
    private static final String PREFS_GLOBAL = "tb_app_global";
    private static final String PREFS_LC = "tb_longconn";

    private volatile boolean isForeground = false;

    // [v9.4.0] 长连接状态（独立进程里的 Service 写，主进程读）
    public enum LongConnState { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING }

    // [v9.4.0] 跨进程状态
    private volatile LongConnState longConnState = LongConnState.DISCONNECTED;
    private volatile String getuiClientId = null;
    private volatile String lastDeltaSyncAt = "0";
    // [v9.4.0] 本次会话收到 PUSH 数量（UI 显示用）
    private volatile int getuiPushReceived = 0;

    // 单例
    private static TimeBankApplication instance;

    public static TimeBankApplication getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        android.util.Log.i(TAG, "[v9.4.0] TimeBankApplication.onCreate");

        // [v9.4.0] 启动时从 prefs 恢复个推 clientId
        SharedPreferences lc = getSharedPreferences(PREFS_LC, Context.MODE_PRIVATE);
        getuiClientId = lc.getString("getui_client_id", null);
        lastDeltaSyncAt = String.valueOf(lc.getLong("last_delta_sync_at", 0L));

        // [v9.4.0-应急] 个推 SDK 3.3.x 的 onReceiveClientId 回调不稳定（有时不触发）
        // 直接从 SDK 自己的 getui_sp.xml 读 sc 字段，绕过回调
        String scFromGetuiSp = readGetuiClientIdFromSdkSp();
        if (scFromGetuiSp != null && (getuiClientId == null || getuiClientId.isEmpty())) {
            android.util.Log.i(TAG, "[v9.4.0-应急] 从 getui_sp.xml 读到 clientId: " + scFromGetuiSp);
            setGetuiClientId(scFromGetuiSp);
        }

        // [v9.4.0] 主动初始化个推 SDK（不在 GetuiPushService 里 lazy init）
        initGetuiSdk();

        // [v9.4.0] 启动长连接服务（独立进程）
        LongConnectionService.startService(this);
    }

    /**
     * [v9.4.0] 主动初始化个推 SDK
     * - 不依赖 GetuiPushService.onCreate 的 lazy 触发
     * - 必须在 App 启动早期调用，SDK 才会自动注册到个推服务器
     */
    private void initGetuiSdk() {
        try {
            ApplicationInfo ai = getPackageManager().getApplicationInfo(
                getPackageName(), PackageManager.GET_META_DATA
            );
            String appId = ai.metaData != null ? ai.metaData.getString("PUSH_APPID") : null;
            String appKey = ai.metaData != null ? ai.metaData.getString("PUSH_APPKEY") : null;
            String appSecret = ai.metaData != null ? ai.metaData.getString("PUSH_APPSECRET") : null;

            if (appId == null || appId.startsWith("placeholder")) {
                android.util.Log.w(TAG, "[v9.4.0] 个推未配置（appId=" + appId + "），跳过初始化");
                return;
            }

            // 个推 SDK 初始化（async）
            com.igexin.sdk.PushManager.getInstance().initialize(this);
            android.util.Log.i(TAG, "[v9.4.0] ✓ 个推 SDK initialize() 已调用 (appId=" + appId.substring(0, 6) + "...)");

            // 注册透传 IntentService 类（让 SDK 知道回调类）
            com.igexin.sdk.PushManager.getInstance().registerPushIntentService(
                this, com.jianglicheng.timebank.GetuiPushService.class
            );
            android.util.Log.i(TAG, "[v9.4.0] ✓ 个推 IntentService 注册: " + GetuiPushService.class.getName());
        } catch (Throwable e) {
            android.util.Log.e(TAG, "[v9.4.0] ✗ 个推 SDK init 异常", e);
        }
    }

    // [v9.3.3] App 是否在前台（被 MainActivity.onResume/onPause 维护）
    public boolean isForeground() {
        return isForeground;
    }

    public void setForeground(boolean foreground) {
        this.isForeground = foreground;
        android.util.Log.d(TAG, "isForeground = " + foreground);
    }

    // [v9.3.3] 全局 SharedPreferences 便捷访问
    public SharedPreferences getGlobalPrefs() {
        return getSharedPreferences(PREFS_GLOBAL, Context.MODE_PRIVATE);
    }

    // ============================================================
    // [v9.4.0] 长连接状态管理
    // ============================================================

    public LongConnState getLongConnState() {
        return longConnState;
    }

    public void setLongConnState(LongConnState state) {
        this.longConnState = state;
        android.util.Log.i(TAG, "[v9.4.0] longConnState = " + state);
    }

    public String getGetuiClientId() {
        return getuiClientId;
    }

    public void setGetuiClientId(String clientId) {
        this.getuiClientId = clientId;
        if (clientId != null) {
            getSharedPreferences(PREFS_LC, Context.MODE_PRIVATE)
                .edit()
                .putString("getui_client_id", clientId)
                .apply();
        }
    }

    /**
     * [v9.4.0] 判断个推 PUSH 是否已注册到个推服务器
     * 条件：getuiClientId 不为 null 且 SharedPreferences 中已持久化
     * 供 WebAppInterface.getGetuiPushState() 调用
     */
    public boolean isGetuiPushRegistered() {
        if (getuiClientId != null && !getuiClientId.isEmpty()) return true;
        SharedPreferences lc = getSharedPreferences(PREFS_LC, Context.MODE_PRIVATE);
        String saved = lc.getString("getui_client_id", null);
        return saved != null && !saved.isEmpty();
    }

    public long getLastDeltaSyncAt() {
        try {
            return Long.parseLong(lastDeltaSyncAt);
        } catch (Exception e) {
            return 0L;
        }
    }

    public void setLastDeltaSyncAt(long ts) {
        this.lastDeltaSyncAt = String.valueOf(ts);
        getSharedPreferences(PREFS_LC, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_delta_sync_at", ts)
            .apply();
    }

    // [v9.4.0] 累加 PUSH 接收计数
    public int getGetuiPushReceived() { return getuiPushReceived; }
    public void incrementGetuiPushReceived() { this.getuiPushReceived++; }

    /**
     * [v9.4.0] 获取或生成稳定的 deviceId（存 prefs，重装即丢失，符合需求）
     * 命名加 Tb 前缀，避免与 ContextWrapper.getDeviceId() 冲突（后者返回 int）
     */
    public String getTbDeviceId() {
        SharedPreferences sp = getGlobalPrefs();
        String id = sp.getString("device_id", null);
        if (id == null) {
            id = "and-" + java.util.UUID.randomUUID().toString().substring(0, 12);
            sp.edit().putString("device_id", id).apply();
        }
        return id;
    }

    /**
     * [v9.4.0-应急] 直接从个推 SDK 自己的 SharedPreferences 读 clientId
     * 个推 SDK 内部把 clientId 存在 getui_sp.xml，key = "sc"
     * 用于绕过 onReceiveClientId 回调不稳定的场景
     * @return clientId 字符串，未注册时返回 null
     */
    private String readGetuiClientIdFromSdkSp() {
        try {
            SharedPreferences sdkSp = getSharedPreferences("getui_sp", Context.MODE_PRIVATE);
            return sdkSp.getString("sc", null);
        } catch (Throwable t) {
            android.util.Log.w(TAG, "[v9.4.0-应急] 读 getui_sp.xml 失败: " + t.getMessage());
            return null;
        }
    }
}
