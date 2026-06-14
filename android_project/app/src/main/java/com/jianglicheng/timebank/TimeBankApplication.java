package com.jianglicheng.timebank;

import android.app.Application;
import android.content.Context;
import android.content.SharedPreferences;

/**
 * [v9.3.3] TimeBank 全局 Application 类
 *
 * 职责：
 * 1. 维护 isForeground 标志位（被 MainActivity.onResume/onPause 翻转）
 * 2. 提供全局 SharedPreferences 访问入口
 * 3. 作为 CloudSyncScheduler / CloudSyncWorker 的状态持有者
 *
 * 关键点：
 * - 这个类不持有任何 UI 引用，只做"跨组件状态共享"
 * - WorkManager 周期任务调度后，即便 App 进程被杀，下次启动 WorkManager 仍能恢复
 * - isForeground 标志用于决定 Worker 是"注入到 WebView"还是"仅暂存到 SharedPreferences"
 */
public class TimeBankApplication extends Application {
    private static final String TAG = "TimeBankApp";
    private static final String PREFS_GLOBAL = "tb_app_global";

    private volatile boolean isForeground = false;

    // 单例
    private static TimeBankApplication instance;

    public static TimeBankApplication getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        android.util.Log.i(TAG, "[v9.3.3] TimeBankApplication.onCreate");
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
}
