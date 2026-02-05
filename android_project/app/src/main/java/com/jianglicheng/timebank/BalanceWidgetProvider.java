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
 * [v7.14.0] 时间余额桌面小组件 - 渐变色样式
 * 根据余额区间自动切换背景颜色（与屏幕时间小组件一致）
 * >24h: 蓝色 | 0~24h: 绿色 | -24~0h: 橙色 | <-24h: 红色
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
        
        // [v7.14.0] 根据余额区间获取对应渐变背景
        int bgDrawable = getBackgroundDrawable(balanceSeconds);
        
        // 构建布局
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance);
        views.setTextViewText(R.id.widget_balance_amount, formattedBalance);
        // [v7.14.0] 文字始终使用白色（在渐变背景上）
        views.setTextColor(R.id.widget_balance_amount, Color.parseColor("#ffffff"));
        // [v7.14.0] 设置渐变背景
        views.setInt(R.id.widget_balance_container, "setBackgroundResource", bgDrawable);
        
        // 点击打开应用
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_balance_container, pendingIntent);
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
    
    /**
     * [v7.14.0] 根据余额区间获取对应渐变背景资源
     * 区间与屏幕时间小组件一致：>24h蓝 | 0~24h绿 | -24~0h橙 | <-24h红
     */
    private static int getBackgroundDrawable(long balanceSeconds) {
        double balanceHours = balanceSeconds / 3600.0;
        
        if (balanceHours > 24) {
            return R.drawable.widget_balance_blue;     // >24小时：蓝色（余额充足）
        } else if (balanceHours >= 0) {
            return R.drawable.widget_balance_green;    // 0~24小时：绿色（理想区间）
        } else if (balanceHours >= -24) {
            return R.drawable.widget_balance_orange;   // -24~0小时：橙色（余额偏少）
        } else {
            return R.drawable.widget_balance_red;      // <-24小时：红色（余额不足）
        }
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
