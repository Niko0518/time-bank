package com.jianglicheng.timebank;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

/**
 * [v5.10.0] 屏幕时间通透模式桌面小组件
 */
public class ScreenTimeGlassWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.SCREEN_TIME_GLASS_WIDGET_UPDATE";
    
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            ScreenTimeWidgetProvider.updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_UPDATE.equals(intent.getAction())) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(
                    new ComponentName(context, ScreenTimeGlassWidgetProvider.class));
            for (int appWidgetId : appWidgetIds) {
                // 设置为通透模式
                SharedPreferences prefs = context.getSharedPreferences("TimeBankWidget", Context.MODE_PRIVATE);
                prefs.edit().putString("screenTimeStyle_" + appWidgetId, "glass").apply();
                ScreenTimeWidgetProvider.updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    @Override
    public void onEnabled(Context context) {
    }

    @Override
    public void onDisabled(Context context) {
    }
}
