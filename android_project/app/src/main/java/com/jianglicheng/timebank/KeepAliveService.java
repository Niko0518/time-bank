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
            stopSelf();
            return START_NOT_STICKY;
        }

        // 启动前台服务
        Notification notification = createNotification();
        startForeground(NOTIFICATION_ID, notification);

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
        // 服务销毁时的清理工作
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
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_KEEP_ALIVE_ENABLED, true); // 默认启用
    }

    /**
     * 静态方法：启动保活服务
     */
    public static void startService(Context context) {
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
