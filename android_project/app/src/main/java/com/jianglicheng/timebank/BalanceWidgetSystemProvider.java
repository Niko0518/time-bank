package com.jianglicheng.timebank;

import android.app.PendingIntent;
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

/**
 * [v7.14.0] 时间余额桌面小组件 - 通透模式方案二：系统透明
 * 使用系统透明背景，依赖系统 launcher 的模糊处理
 */
public class BalanceWidgetSystemProvider extends AppWidgetProvider {

    public static final String ACTION_UPDATE = "com.jianglicheng.timebank.WIDGET_SYSTEM_UPDATE";
    
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
                    new ComponentName(context, BalanceWidgetSystemProvider.class));
            for (int appWidgetId : appWidgetIds) {
                updateAppWidget(context, appWidgetManager, appWidgetId);
            }
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("TimeBankWidget", Context.MODE_PRIVATE);
        long balanceSeconds = prefs.getLong("currentBalance", 0);
        String formattedBalance = formatTime(balanceSeconds);
        
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance_system);
        
        // [v7.14.0] 生成渐变文字 Bitmap
        Bitmap gradientTextBitmap = createGradientTextBitmap(context, formattedBalance, balanceSeconds, 28);
        views.setImageViewBitmap(R.id.widget_balance_system_amount, gradientTextBitmap);
        
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_balance_system_container, pendingIntent);
        
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
    
    /**
     * [v7.14.0] 创建渐变文字 Bitmap
     */
    private static Bitmap createGradientTextBitmap(Context context, String text, long balanceSeconds, int textSizeSp) {
        float scale = context.getResources().getDisplayMetrics().density;
        int textSizePx = (int) (textSizeSp * scale);
        
        // 测量文字尺寸
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setTextSize(textSizePx);
        paint.setFakeBoldText(true);
        float textWidth = paint.measureText(text);
        Paint.FontMetrics fm = paint.getFontMetrics();
        int height = (int) (fm.descent - fm.ascent + 10);
        int width = (int) (textWidth + 10);
        
        // 创建 Bitmap
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        
        // 根据余额设置渐变颜色
        int[] colors = getGradientColors(balanceSeconds);
        
        // 设置渐变 shader
        LinearGradient shader = new LinearGradient(0, 0, width, 0, colors[0], colors[1], Shader.TileMode.CLAMP);
        paint.setShader(shader);
        
        // 绘制文字
        canvas.drawText(text, 5, -fm.ascent + 5, paint);
        
        return bitmap;
    }
    
    /**
     * [v7.14.0] 根据余额获取渐变颜色
     */
    private static int[] getGradientColors(long balanceSeconds) {
        double balanceHours = balanceSeconds / 3600.0;
        if (balanceHours > 24) {
            return new int[] {0xFF3498db, 0xFF9b59b6}; // 蓝色 -> 紫色
        } else if (balanceHours >= 0) {
            return new int[] {0xFF27ae60, 0xFF1abc9c}; // 绿色 -> 青色
        } else if (balanceHours >= -24) {
            return new int[] {0xFFf39c12, 0xFFe74c3c}; // 橙色 -> 红色
        } else {
            return new int[] {0xFFe74c3c, 0xFF8e44ad}; // 红色 -> 紫色
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
    public void onEnabled(Context context) {}

    @Override
    public void onDisabled(Context context) {}
}
