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

import android.widget.RemoteViews;

import org.json.JSONArray;

import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * [v7.14.0] 屏幕时间桌面小组件 - 2×1 圆角渐变样式
 * - 尺寸：2×1（与时间余额小组件一致）
 * - 背景：根据使用比例自动切换渐变色（绿/蓝/橙/红）
 * - 圆角：20dp（与时间余额小组件一致）
 */
public class ScreenTimeWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.SCREEN_TIME_WIDGET_UPDATE";
    
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
        int limitMinutes = prefs.getInt("dailyLimitMinutes", 120);
        String whitelistJson = prefs.getString("whitelistApps", "[]");
        
        // 获取今日屏幕时间
        long usedMs = getTodayScreenTime(context, whitelistJson);
        int usedMinutes = (int) (usedMs / 60000);
        int percent = limitMinutes > 0 ? (usedMinutes * 100 / limitMinutes) : 0;
        int displayPercent = Math.min(100, percent);
        
        // [v7.14.0] 2×1 圆角渐变背景样式
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_screen_time_classic);
        
        // 更新数据 - 新布局：右侧大百分比，左侧时长/限额
        views.setTextViewText(R.id.widget_st_percent, percent + "%");
        String usedLimitText = formatTimeShort(usedMinutes) + "/" + formatTimeShort(limitMinutes);
        views.setTextViewText(R.id.widget_st_used_limit, usedLimitText);
        
        // [v7.14.0] 根据使用比例设置渐变背景
        int bgDrawable = getBackgroundDrawable(percent);
        views.setInt(R.id.widget_st_container, "setBackgroundResource", bgDrawable);
        
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

            // [v7.18.2-fix] 获取今天的日期信息，用于过滤
            Calendar today = Calendar.getInstance();
            int todayYear = today.get(Calendar.YEAR);
            int todayDayOfYear = today.get(Calendar.DAY_OF_YEAR);

            for (UsageStats usageStats : stats) {
                String packageName = usageStats.getPackageName();
                // 排除自身应用和白名单应用
                if (packageName.equals(myPackage) || whitelist.contains(packageName)) {
                    continue;
                }
                
                // [v7.18.2-fix] 严格检查数据是否属于今天
                Calendar statCal = Calendar.getInstance();
                statCal.setTimeInMillis(usageStats.getFirstTimeStamp());
                int statYear = statCal.get(Calendar.YEAR);
                int statDayOfYear = statCal.get(Calendar.DAY_OF_YEAR);
                
                // 只累加今天（同一年同一天）的数据
                if (statYear == todayYear && statDayOfYear == todayDayOfYear) {
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

    /**
     * [v7.14.0] 格式化为简短时间 xhxxm/xh
     */
    private static String formatTimeShort(int minutes) {
        int hours = minutes / 60;
        int mins = minutes % 60;
        if (hours > 0 && mins > 0) {
            return hours + "h" + mins + "m";
        } else if (hours > 0) {
            return hours + "h";
        } else {
            return mins + "m";
        }
    }

    /**
     * [v7.14.0] 根据使用比例获取对应渐变背景资源
     */
    private static int getBackgroundDrawable(int percent) {
        if (percent <= 33) {
            return R.drawable.widget_screen_time_green;   // 绿色渐变
        } else if (percent <= 66) {
            return R.drawable.widget_screen_time_blue;    // 蓝色渐变
        } else if (percent <= 100) {
            return R.drawable.widget_screen_time_orange;  // 橙色渐变
        } else {
            return R.drawable.widget_screen_time_red;     // 红色渐变
        }
    }

    @Override
    public void onEnabled(Context context) {
    }

    @Override
    public void onDisabled(Context context) {
    }
}
