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
 * [v5.10.0] 时间余额桌面小组件
 * 显示当前时间余额
 */
public class BalanceWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.WIDGET_UPDATE";
    
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_UPDATE.equals(intent.getAction())) {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            int[] appWidgetIds = appWidgetManager.getAppWidgetIds(
                    new ComponentName(context, BalanceWidgetProvider.class));
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        // 获取存储的余额数据
        SharedPreferences prefs = context.getSharedPreferences("TimeBankWidget", Context.MODE_PRIVATE);
        long balanceSeconds = prefs.getLong("currentBalance", 0);
        
        // 格式化时间
        String formattedBalance = formatTime(balanceSeconds);
        boolean isNegative = balanceSeconds < 0;
        
        // 构建布局
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance);
        views.setTextViewText(R.id.widget_balance_amount, formattedBalance);
        views.setTextColor(R.id.widget_balance_amount, 
                isNegative ? Color.parseColor("#e74c3c") : Color.parseColor("#3498db"));
        
        // 点击打开应用
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_balance_container, pendingIntent);
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static String formatTime(long seconds) {
        long absSeconds = Math.abs(seconds);
        long hours = absSeconds / 3600;
        long minutes = (absSeconds % 3600) / 60;
        
        String sign = seconds < 0 ? "-" : "";
        if (hours > 0) {
            return sign + hours + "h" + (minutes > 0 ? minutes + "m" : "");
        } else {
            return sign + minutes + "m";
        }
    }

    @Override
    public void onEnabled(Context context) {
        // 小组件首次添加时
    }

    @Override
    public void onDisabled(Context context) {
        // 所有小组件被移除时
    }
}
