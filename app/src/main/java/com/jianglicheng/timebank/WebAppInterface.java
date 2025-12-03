package com.jianglicheng.timebank;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class WebAppInterface {
    Context mContext;
    private static final String CHANNEL_ID = "TIME_BANK_CHANNEL";

    WebAppInterface(Context c) {
        mContext = c;
        createNotificationChannel();
    }

    // === 新增：悬浮窗控制接口 ===

    @JavascriptInterface
    public void startFloatingTimer(String taskName, int durationSeconds) {
        // 1. 检查悬浮窗权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mContext)) {
            Toast.makeText(mContext, "请授予悬浮窗权限以显示计时器", Toast.LENGTH_LONG).show();
            // 跳转到设置页
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + mContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            mContext.startActivity(intent);
            return;
        }

        // 2. 启动服务
        Intent intent = new Intent(mContext, FloatingTimerService.class);
        intent.putExtra("TASK_NAME", taskName);
        intent.putExtra("DURATION", (long) durationSeconds);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            mContext.startForegroundService(intent);
        } else {
            mContext.startService(intent);
        }
    }

    @JavascriptInterface
    public void stopFloatingTimer() {
        Intent intent = new Intent(mContext, FloatingTimerService.class);
        intent.setAction("STOP");
        mContext.startService(intent);
    }
    // ==========================

    @JavascriptInterface
    public void showNotification(String title, String body) {
        // ... (保持你之前的代码不变) ...
        // 为了节省篇幅，这里省略 showNotification 和 createNotificationChannel 的具体实现
        // 请务必保留你之前修复好的版本！或者你可以把刚才那段再复制进来。
        // 如果你需要我再发一次完整的，请告诉我。这里假设你保留了之前的逻辑。
        doShowNotificationLogic(title, body); // 假设你封装了这个逻辑
    }

    // 把之前的 showNotification 逻辑放这里，或者直接写在上面
    private void doShowNotificationLogic(String title, String body) {
        try {
            Intent intent = new Intent(mContext, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent = PendingIntent.getActivity(mContext, 0, intent, flags);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(mContext, CHANNEL_ID)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent);

            NotificationManagerCompat.from(mContext).notify((int) System.currentTimeMillis(), builder.build());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            CharSequence name = "时间银行提醒";
            String description = "用于任务完成和习惯打卡提醒";
            int importance = NotificationManager.IMPORTANCE_HIGH;
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, name, importance);
            channel.setDescription(description);
            NotificationManager notificationManager = mContext.getSystemService(NotificationManager.class);
            notificationManager.createNotificationChannel(channel);
        }
    }
}