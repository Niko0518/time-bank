package com.jianglicheng.timebank;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.IBinder;

/**
 * [v7.36.2] 应用保活服务 - 常驻前台服务
 * 确保应用在后台时不被系统杀死，保持数据同步和状态活跃
 */
public class KeepAliveService extends Service {
    private static final String TAG = "KeepAliveService";
    private static final String CHANNEL_ID = "keep_alive_channel";
    private static final int NOTIFICATION_ID = 2; // 区别于悬浮窗服务的ID 1
    
    // SharedPreferences 键名
    private static final String PREFS_NAME = "app_settings";
    private static final String KEY_KEEP_ALIVE_ENABLED = "keep_alive_enabled";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 检查用户是否启用了保活功能
        if (!isKeepAliveEnabled()) {
            // [紧急修复] 走到这里说明服务已被 startForegroundService 拉起（toggle 竞态 / sticky 重启等）：
            // 必须先履约 startForeground 再立即撤销并停止，否则 10 秒后系统抛
            // ForegroundServiceDidNotStartInTimeException 导致整个 App 闪退
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForeground(NOTIFICATION_ID, createNotification());
                stopForeground(STOP_FOREGROUND_REMOVE);
            }
            stopSelf();
            return START_NOT_STICKY;
        }

        // 启动前台服务
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);

        // [v9.3.3] 启动原生层云端同步调度器（不受 WebView 挂起影响）
        CloudSyncScheduler.start(this);

        // 返回 START_STICKY 确保服务被杀死后能自动重启
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // [v9.3.3] 不停止 WorkManager 调度器（系统调度，不依赖 Service 进程）
    }

    /**
     * 创建通知渠道（Android 8.0+）
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "应用保活服务",
                    NotificationManager.IMPORTANCE_MIN // 最低优先级，减少打扰
            );
            channel.setDescription("保持Time Bank应用在后台活跃，确保数据同步和功能正常运行");
            channel.setShowBadge(false); // 不显示角标
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * 创建保活通知
     */
    private Notification createNotification() {
        Notification.Builder builder;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        return builder
                .setContentTitle("Time Bank")
                .setContentText("应用保活服务运行中")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true) // 设置为持续通知，不可滑动删除
                .setPriority(Notification.PRIORITY_MIN) // 最低优先级
                .build();
    }

    /**
     * 检查用户是否启用了保活功能
     */
    private boolean isKeepAliveEnabled() {
        return isKeepAliveEnabledFor(this);
    }

    /**
     * [紧急修复] 静态判定（供 startService 入口门控复用，与实例判定同一份逻辑）
     */
    private static boolean isKeepAliveEnabledFor(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_KEEP_ALIVE_ENABLED, false); // [批次5] 默认关闭（用户显式开启后才保活）
    }

    /**
     * 静态方法：启动保活服务
     */
    public static void startService(Context context) {
        // [紧急修复] 未启用时绝不能调用 startForegroundService：
        // 一旦调用，系统要求 Service 在 10 秒内 startForeground，
        // 而本服务关闭分支若不履约会直接 FATAL 崩溃（MainActivity 无条件调用的历史预埋问题）
        if (!isKeepAliveEnabledFor(context)) return;
        Intent intent = new Intent(context, KeepAliveService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    /**
     * 静态方法：停止保活服务
     */
    public static void stopService(Context context) {
        Intent intent = new Intent(context, KeepAliveService.class);
        context.stopService(intent);
    }

    /**
     * 静态方法：切换保活服务开关
     */
    public static void toggleKeepAlive(Context context, boolean enabled) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putBoolean(KEY_KEEP_ALIVE_ENABLED, enabled).apply();
        
        if (enabled) {
            startService(context);
        } else {
            stopService(context);
        }
    }
}
