package com.jianglicheng.timebank;

import android.app.PendingIntent;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

import org.json.JSONArray;

import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * [v5.10.0] 屏幕时间桌面小组件
 * 支持经典模式和通透模式
 */
public class ScreenTimeWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.SCREEN_TIME_WIDGET_UPDATE";
    public static final String EXTRA_WIDGET_STYLE = "widget_style"; // "classic" or "glass"
    
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
                    new ComponentName(context, ScreenTimeWidgetProvider.class));
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("TimeBankWidget", Context.MODE_PRIVATE);
        String style = prefs.getString("screenTimeStyle_" + appWidgetId, "classic");
        int limitMinutes = prefs.getInt("dailyLimitMinutes", 120);
        String whitelistJson = prefs.getString("whitelistApps", "[]");
        
        // 获取今日屏幕时间
        long usedMs = getTodayScreenTime(context, whitelistJson);
        int usedMinutes = (int) (usedMs / 60000);
        int percent = limitMinutes > 0 ? (usedMinutes * 100 / limitMinutes) : 0;
        int displayPercent = Math.min(100, percent);
        
        // 选择布局
        int layoutId = "glass".equals(style) ? R.layout.widget_screen_time_glass : R.layout.widget_screen_time_classic;
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
        
        // 更新数据
        views.setTextViewText(R.id.widget_st_percent, percent + "%");
        views.setTextViewText(R.id.widget_st_used, formatMinutes(usedMinutes));
        views.setTextViewText(R.id.widget_st_limit, "/ " + formatMinutes(limitMinutes));
        views.setProgressBar(R.id.widget_st_progress, 100, displayPercent, false);
        
        // 经典模式：根据使用比例设置背景颜色
        if ("classic".equals(style)) {
            int bgColor = getBackgroundColor(percent);
            views.setInt(R.id.widget_st_container, "setBackgroundColor", bgColor);
        }
        
        // 通透模式：设置进度条颜色
        if ("glass".equals(style)) {
            int progressColor = getProgressColor(percent);
            views.setInt(R.id.widget_st_progress, "setColorFilter", progressColor);
        }
        
        // 点击打开应用
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_st_container, pendingIntent);
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static long getTodayScreenTime(Context context, String whitelistJson) {
        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usageStatsManager == null) return 0;

            // 解析白名单
            Set<String> whitelist = new HashSet<>();
            try {
                JSONArray arr = new JSONArray(whitelistJson);
                for (int i = 0; i < arr.length(); i++) {
                    whitelist.add(arr.getString(i));
                }
            } catch (Exception e) {
                // 忽略解析错误
            }

            // 获取今日开始时间
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            long startTime = calendar.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            if (stats == null) return 0;

            long totalTime = 0;
            String myPackage = context.getPackageName();

            for (UsageStats usageStats : stats) {
                String packageName = usageStats.getPackageName();
                // 排除自身应用和白名单应用
                if (!packageName.equals(myPackage) && !whitelist.contains(packageName)) {
                    totalTime += usageStats.getTotalTimeInForeground();
                }
            }
            return totalTime;
        } catch (Exception e) {
            return 0;
        }
    }

    private static String formatMinutes(int minutes) {
        if (minutes < 60) {
            return minutes + "分钟";
        }
        int hours = minutes / 60;
        int mins = minutes % 60;
        return mins > 0 ? hours + "h" + mins + "m" : hours + "小时";
    }

    private static int getBackgroundColor(int percent) {
        if (percent <= 33) {
            return Color.parseColor("#27ae60"); // 绿色
        } else if (percent <= 66) {
            return Color.parseColor("#3498db"); // 蓝色
        } else if (percent <= 100) {
            return Color.parseColor("#f39c12"); // 橙色
        } else {
            return Color.parseColor("#e74c3c"); // 红色
        }
    }

    private static int getProgressColor(int percent) {
        if (percent <= 60) {
            return Color.parseColor("#22c55e"); // 绿色
        } else if (percent <= 90) {
            return Color.parseColor("#eab308"); // 黄色
        } else if (percent <= 100) {
            return Color.parseColor("#f97316"); // 橙色
        } else {
            return Color.parseColor("#ef4444"); // 红色
        }
    }

    @Override
    public void onEnabled(Context context) {
    }

    @Override
    public void onDisabled(Context context) {
    }
}
