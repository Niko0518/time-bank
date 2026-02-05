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
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Shader;
import android.widget.RemoteViews;

import org.json.JSONArray;

import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * [v7.14.0] 屏幕时间桌面小组件 - 通透模式方案一：毛玻璃
 * 使用半透明背景模拟毛玻璃效果
 */
public class ScreenTimeWidgetGlassProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.SCREEN_TIME_GLASS_UPDATE";
    
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
                    new ComponentName(context, ScreenTimeWidgetGlassProvider.class));
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("TimeBankWidget", Context.MODE_PRIVATE);
        int limitMinutes = prefs.getInt("dailyLimitMinutes", 120);
        String whitelistJson = prefs.getString("whitelistApps", "[]");
        
        long usedMs = getTodayScreenTime(context, whitelistJson);
        int usedMinutes = (int) (usedMs / 60000);
        int percent = limitMinutes > 0 ? (usedMinutes * 100 / limitMinutes) : 0;
        String percentText = percent + "%";
        
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_screen_time_glass);
        
        // [v7.14.0] 生成渐变大百分比文字 Bitmap
        Bitmap gradientPercentBitmap = createGradientTextBitmap(context, percentText, percent, 20);
        views.setImageViewBitmap(R.id.widget_st_glass_percent, gradientPercentBitmap);
        
        // [v7.14.0] 生成渐变使用时长/限额文字 Bitmap
        String usedLimitText = formatTimeShort(usedMinutes) + "/" + formatTimeShort(limitMinutes);
        Bitmap gradientUsedLimitBitmap = createGradientTextBitmap(context, usedLimitText, percent, 14);
        views.setImageViewBitmap(R.id.widget_st_glass_used_limit, gradientUsedLimitBitmap);
        
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_st_glass_container, pendingIntent);
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
    
    /**
     * [v7.14.0] 创建渐变文字 Bitmap
     */
    private static Bitmap createGradientTextBitmap(Context context, String text, int percent, int textSizeSp) {
        float scale = context.getResources().getDisplayMetrics().density;
        int textSizePx = (int) (textSizeSp * scale);
        
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(textSizePx);
        paint.setFakeBoldText(true);
        float textWidth = paint.measureText(text);
        Paint.FontMetrics fm = paint.getFontMetrics();
        int height = (int) (fm.descent - fm.ascent + 8);
        int width = (int) (textWidth + 8);
        
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        
        // 根据屏幕时间比例设置渐变颜色
        int[] colors = getGradientColors(percent);
        
        LinearGradient shader = new LinearGradient(0, 0, width, 0, colors[0], colors[1], Shader.TileMode.CLAMP);
        paint.setShader(shader);
        
        canvas.drawText(text, 4, -fm.ascent + 4, paint);
        
        return bitmap;
    }
    
    /**
     * [v7.14.0] 根据屏幕时间比例获取渐变颜色
     */
    private static int[] getGradientColors(int percent) {
        if (percent <= 33) {
            return new int[] {0xFF27ae60, 0xFF1abc9c}; // 绿色 -> 青色
        } else if (percent <= 66) {
            return new int[] {0xFF3498db, 0xFF9b59b6}; // 蓝色 -> 紫色
        } else if (percent <= 100) {
            return new int[] {0xFFf39c12, 0xFFe74c3c}; // 橙色 -> 红色
        } else {
            return new int[] {0xFFe74c3c, 0xFF8e44ad}; // 红色 -> 紫色
        }
    }

    private static long getTodayScreenTime(Context context, String whitelistJson) {
        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
            if (usageStatsManager == null) return 0;

            Set<String> whitelist = new HashSet<>();
            try {
                JSONArray arr = new JSONArray(whitelistJson);
                for (int i = 0; i < arr.length(); i++) {
                    whitelist.add(arr.getString(i));
                }
            } catch (Exception e) {}

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

    @Override
    public void onEnabled(Context context) {}

    @Override
    public void onDisabled(Context context) {}
}
