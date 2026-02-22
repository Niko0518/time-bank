package com.jianglicheng.timebank;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        android.util.Log.d("TimeBank", "AlarmReceiver received action: " + action);
        boolean isAlarmTrigger = action != null && action.startsWith("com.jianglicheng.timebank.ALARM_TRIGGER");
        
        // [v7.9.3] 使用 startsWith 匹配所有闹钟 action (ALARM_TRIGGER, ALARM_TRIGGER_1, ALARM_TRIGGER_2 等)
        if (action != null && (isAlarmTrigger ||
                action.equals("com.jianglicheng.timebank.SHOW_NOTIFICATION"))) {

            String title = intent.getStringExtra("title");
            String message = intent.getStringExtra("message");
            int alarmId = intent.getIntExtra("alarmId", 0);
            
            android.util.Log.d("TimeBank", "Showing alarm notification: " + title + " (alarmId=" + alarmId + ")");

            // [v7.19.0] 所有闹钟触发统一使用最大强度提醒
            boolean highPriority = isAlarmTrigger;
            showNotification(context, title, message, alarmId, highPriority);
            
            // [v7.19.0] 高强度提醒统一额外振动
            if (highPriority) {
                vibrateDevice(context);
            }
        }
    }

    // [v7.9.3] 振动设备
    private void vibrateDevice(Context context) {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vibratorManager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vibratorManager.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }
            
            if (vibrator != null && vibrator.hasVibrator()) {
                // 振动模式: 等待100ms, 振动300ms, 等待200ms, 振动300ms, 等待200ms, 振动500ms
                long[] pattern = {100, 300, 200, 300, 200, 500};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    vibrator.vibrate(pattern, -1);
                }
            }
        } catch (Exception e) {
            android.util.Log.e("TimeBank", "Vibrate error", e);
        }
    }

    private void showNotification(Context context, String title, String message, int alarmId, boolean highPriority) {
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        
        // [v7.19.0] 闹钟触发统一走高强度闹钟通道
        String channelId = highPriority ? "tb_max_alarm_channel" : "task_channel";
        String channelName = highPriority ? "Time Bank 强提醒闹钟" : "任务通知";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int importance = highPriority ? NotificationManager.IMPORTANCE_HIGH : NotificationManager.IMPORTANCE_DEFAULT;
            NotificationChannel channel = new NotificationChannel(channelId, channelName, importance);
            
            if (highPriority) {
                // 高优先级通道：启用振动和声音
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{100, 300, 200, 300, 200, 500});
                Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (alarmSound == null) {
                    alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                }
                AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build();
                channel.setSound(alarmSound, audioAttributes);
                channel.setBypassDnd(true); // 绕过勿扰模式
            }
            
            notificationManager.createNotificationChannel(channel);
        }

        Intent appIntent = new Intent(context, MainActivity.class);
        appIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(context, alarmId, appIntent, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, channelId);
        } else {
            builder = new Notification.Builder(context);
        }

        builder.setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true);
        
        // [v7.9.3] 高优先级通知额外设置
        if (highPriority) {
            builder.setPriority(Notification.PRIORITY_MAX);
            builder.setDefaults(Notification.DEFAULT_ALL);
            builder.setVibrate(new long[]{100, 300, 200, 300, 200, 500});
            Uri alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmSound == null) {
                alarmSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            builder.setSound(alarmSound);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                builder.setCategory(Notification.CATEGORY_ALARM);
                builder.setVisibility(Notification.VISIBILITY_PUBLIC);
            }
            // 使用固定 ID 以便可以更新/取消
            int notifyId = alarmId > 0 ? alarmId : (int) System.currentTimeMillis();
            notificationManager.notify(notifyId, builder.build());
        } else {
            notificationManager.notify((int)System.currentTimeMillis(), builder.build());
        }
    }
}