package com.jianglicheng.timebank;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

public class BootReceiver extends BroadcastReceiver {
    private static final String SETTINGS_PREFS = "TimeBankSettings";
    private static final String KEY_BOOT_AUTO_START_ENABLED = "bootAutoStartEnabled";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences(SETTINGS_PREFS, Context.MODE_PRIVATE);
            boolean bootAutoStartEnabled = prefs.getBoolean(KEY_BOOT_AUTO_START_ENABLED, true);
            if (!bootAutoStartEnabled) {
                return;
            }

            // 开机后启动主 Activity，触发 checkReminders
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        }
    }
}