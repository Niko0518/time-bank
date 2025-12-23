package com.jianglicheng.timebank;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class WebAppInterface {
    Context mContext;

    WebAppInterface(Context c) {
        mContext = c;
    }

    // 直接保存 JSON 字符串到下载目录
    @JavascriptInterface
    public void saveFileDirectly(String jsonContent, String fileName) {
        try {
            // 保存到下载目录
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File file = new File(downloadsDir, fileName);
            
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(jsonContent.getBytes("UTF-8"));
            fos.close();
            
            // 在主线程显示 Toast
            android.os.Handler handler = new android.os.Handler(mContext.getMainLooper());
            handler.post(() -> Toast.makeText(mContext, "✅ 已保存到: Download/" + fileName, Toast.LENGTH_LONG).show());
        } catch (Exception e) {
            e.printStackTrace();
            android.os.Handler handler = new android.os.Handler(mContext.getMainLooper());
            handler.post(() -> Toast.makeText(mContext, "❌ 保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show());
        }
    }

    // 保存文件到下载目录 (base64 版本)
    @JavascriptInterface
    public void saveFile(String dataUrl, String fileName) {
        try {
            // 解析 data URL
            String base64Data = dataUrl.substring(dataUrl.indexOf(",") + 1);
            byte[] data = Base64.decode(base64Data, Base64.DEFAULT);
            
            // 生成文件名
            String timestamp = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.getDefault()).format(new java.util.Date());
            String finalFileName = "timebank_backup_" + timestamp + ".json";
            
            // 保存到下载目录
            File downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            File file = new File(downloadsDir, finalFileName);
            
            FileOutputStream fos = new FileOutputStream(file);
            fos.write(data);
            fos.close();
            
            Toast.makeText(mContext, "✅ 已保存到: Download/" + finalFileName, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            e.printStackTrace();
            Toast.makeText(mContext, "❌ 保存失败: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    // 发送普通通知
    @JavascriptInterface
    public void showNotification(String title, String message) {
        Intent intent = new Intent(mContext, AlarmReceiver.class);
        intent.setAction("com.jianglicheng.timebank.SHOW_NOTIFICATION");
        intent.putExtra("title", title);
        intent.putExtra("message", message);
        mContext.sendBroadcast(intent);
    }

    // 开启悬浮窗
    @JavascriptInterface
    public void startFloatingTimer(String taskName, int durationSeconds, String colorHex) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(mContext)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + mContext.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            mContext.startActivity(intent);
            return;
        }

        Intent serviceIntent = new Intent(mContext, FloatingTimerService.class);
        serviceIntent.putExtra("TASK_NAME", taskName);
        serviceIntent.putExtra("DURATION", durationSeconds);
        serviceIntent.putExtra("COLOR", colorHex);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            mContext.startForegroundService(serviceIntent);
        } else {
            mContext.startService(serviceIntent);
        }
    }

    // 停止悬浮窗 [v5.3.0] 支持按任务名称停止特定计时器
    @JavascriptInterface
    public void stopFloatingTimer(String taskName) {
        Intent serviceIntent = new Intent(mContext, FloatingTimerService.class);
        serviceIntent.putExtra("ACTION", "STOP");
        serviceIntent.putExtra("TASK_NAME", taskName);
        mContext.startService(serviceIntent);
    }

    // 原生闹钟接口：实现精准唤醒
    @JavascriptInterface
    public void scheduleAlarm(String title, String message, long delayMs) {
        try {
            android.app.AlarmManager alarmManager = (android.app.AlarmManager) mContext.getSystemService(Context.ALARM_SERVICE);

            Intent intent = new Intent(mContext, AlarmReceiver.class);
            intent.setAction("com.jianglicheng.timebank.ALARM_TRIGGER");
            intent.putExtra("title", title);
            intent.putExtra("message", message);

            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            }

            android.app.PendingIntent pendingIntent = android.app.PendingIntent.getBroadcast(mContext, 0, intent, flags);

            long triggerTime = System.currentTimeMillis() + delayMs;

            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
            } else {
                alarmManager.setExact(android.app.AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @JavascriptInterface
    public void cancelAlarm() {
        try {
            Intent intent = new Intent(mContext, AlarmReceiver.class);
            intent.setAction("com.jianglicheng.timebank.ALARM_TRIGGER");
            int flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                flags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            }
            android.app.PendingIntent pendingIntent = android.app.PendingIntent.getBroadcast(mContext, 0, intent, flags);
            android.app.AlarmManager alarmManager = (android.app.AlarmManager) mContext.getSystemService(Context.ALARM_SERVICE);
            alarmManager.cancel(pendingIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    // [v4.10.0] 新增：启动外部应用
    @JavascriptInterface
    public void launchApp(String packageName) {
        try {
            PackageManager pm = mContext.getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                mContext.startActivity(intent);
            } else {
                Toast.makeText(mContext, "未安装该应用: " + packageName, Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            e.printStackTrace();
            Toast.makeText(mContext, "启动应用失败: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    // ========== [v5.2.0] 屏幕时间管理接口 ==========

    /** 检查是否有使用情况访问权限 */
    @JavascriptInterface
    public boolean hasUsageStatsPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return false;
        }
        AppOpsManager appOps = (AppOpsManager) mContext.getSystemService(Context.APP_OPS_SERVICE);
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(), mContext.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** 跳转到使用情况访问权限设置页 */
    @JavascriptInterface
    public void openUsageAccessSettings() {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        mContext.startActivity(intent);
    }

    /**
     * 获取今日屏幕使用时间（毫秒）
     * @param excludedPackagesJson JSON 数组字符串，如 ["com.example.app1", "com.example.app2"]
     * @return 使用时间（毫秒），-1 表示无权限，-2 表示异常
     */
    @JavascriptInterface
    public long getTodayScreenTime(String excludedPackagesJson) {
        if (!hasUsageStatsPermission()) {
            return -1;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return -2;
        }

        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager)
                    mContext.getSystemService(Context.USAGE_STATS_SERVICE);

            // 解析排除列表
            Set<String> excludedPackages = new HashSet<>();
            if (excludedPackagesJson != null && !excludedPackagesJson.isEmpty()) {
                JSONArray jsonArray = new JSONArray(excludedPackagesJson);
                for (int i = 0; i < jsonArray.length(); i++) {
                    excludedPackages.add(jsonArray.getString(i));
                }
            }

            // 今日零点到现在
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            long startTime = calendar.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            // 查询使用统计
            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            long totalTime = 0;
            if (stats != null) {
                for (UsageStats usageStats : stats) {
                    if (!excludedPackages.contains(usageStats.getPackageName())) {
                        totalTime += usageStats.getTotalTimeInForeground();
                    }
                }
            }
            return totalTime;
        } catch (Exception e) {
            e.printStackTrace();
            return -2;
        }
    }

    /** 获取已安装应用列表（用于白名单选择） */
    @JavascriptInterface
    public String getInstalledApps() {
        try {
            PackageManager pm = mContext.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);

            JSONArray result = new JSONArray();
            for (ApplicationInfo app : apps) {
                // 只返回有启动器图标的应用（用户可见应用）
                if (pm.getLaunchIntentForPackage(app.packageName) != null) {
                    JSONObject obj = new JSONObject();
                    obj.put("packageName", app.packageName);
                    obj.put("appName", pm.getApplicationLabel(app).toString());
                    result.put(obj);
                }
            }
            return result.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return "[]";
        }
    }

    /**
     * [v5.5.0] 获取今日各应用使用时长列表（按时长降序排列）
     * @param excludedPackagesJson 排除的应用包名 JSON 数组
     * @return JSON 数组字符串 [{packageName, appName, timeMs}, ...]，按时长降序
     */
    @JavascriptInterface
    public String getAppUsageList(String excludedPackagesJson) {
        if (!hasUsageStatsPermission()) {
            return "[]";
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return "[]";
        }

        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager)
                    mContext.getSystemService(Context.USAGE_STATS_SERVICE);
            PackageManager pm = mContext.getPackageManager();

            // 解析排除列表
            Set<String> excludedPackages = new HashSet<>();
            if (excludedPackagesJson != null && !excludedPackagesJson.isEmpty()) {
                JSONArray jsonArray = new JSONArray(excludedPackagesJson);
                for (int i = 0; i < jsonArray.length(); i++) {
                    excludedPackages.add(jsonArray.getString(i));
                }
            }

            // 今日零点到现在
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            long startTime = calendar.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            // 查询使用统计
            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            // 收集有效数据并排序
            List<JSONObject> appUsageList = new ArrayList<>();
            if (stats != null) {
                for (UsageStats usageStats : stats) {
                    String packageName = usageStats.getPackageName();
                    long timeMs = usageStats.getTotalTimeInForeground();
                    
                    // 排除白名单应用和时长为0的应用
                    if (excludedPackages.contains(packageName) || timeMs <= 0) {
                        continue;
                    }
                    
                    // 获取应用名称
                    String appName;
                    try {
                        ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
                        appName = pm.getApplicationLabel(appInfo).toString();
                    } catch (PackageManager.NameNotFoundException e) {
                        appName = packageName; // 找不到就用包名
                    }
                    
                    JSONObject obj = new JSONObject();
                    obj.put("packageName", packageName);
                    obj.put("appName", appName);
                    obj.put("timeMs", timeMs);
                    appUsageList.add(obj);
                }
            }

            // 按时长降序排序
            Collections.sort(appUsageList, (a, b) -> {
                try {
                    return Long.compare(b.getLong("timeMs"), a.getLong("timeMs"));
                } catch (Exception e) {
                    return 0;
                }
            });

            // 转换为 JSONArray
            JSONArray result = new JSONArray();
            for (JSONObject obj : appUsageList) {
                result.put(obj);
            }
            return result.toString();
        } catch (Exception e) {
            e.printStackTrace();
            return "[]";
        }
    }

    /** 获取单个应用今日使用时间（毫秒） */
    @JavascriptInterface
    public long getAppScreenTime(String packageName) {
        if (!hasUsageStatsPermission()) {
            return -1;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return -2;
        }

        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager)
                    mContext.getSystemService(Context.USAGE_STATS_SERVICE);

            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            long startTime = calendar.getTimeInMillis();
            long endTime = System.currentTimeMillis();

            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            if (stats != null) {
                for (UsageStats usageStats : stats) {
                    if (packageName.equals(usageStats.getPackageName())) {
                        return usageStats.getTotalTimeInForeground();
                    }
                }
            }
            return 0;
        } catch (Exception e) {
            e.printStackTrace();
            return -2;
        }
    }

    /**
     * [v5.2.0] 获取指定日期的屏幕使用时间（用于历史补结算）
     * @param dateString 日期字符串，格式 "YYYY-MM-DD"
     * @param excludedPackagesJson JSON 数组字符串
     * @return 使用时间（毫秒），-1 表示无权限，-2 表示异常
     */
    @JavascriptInterface
    public long getScreenTimeForDate(String dateString, String excludedPackagesJson) {
        if (!hasUsageStatsPermission()) {
            return -1;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return -2;
        }

        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager)
                    mContext.getSystemService(Context.USAGE_STATS_SERVICE);

            // 解析日期字符串
            String[] parts = dateString.split("-");
            int year = Integer.parseInt(parts[0]);
            int month = Integer.parseInt(parts[1]) - 1; // Calendar 月份从 0 开始
            int day = Integer.parseInt(parts[2]);

            // 解析排除列表
            Set<String> excludedPackages = new HashSet<>();
            if (excludedPackagesJson != null && !excludedPackagesJson.isEmpty()) {
                JSONArray jsonArray = new JSONArray(excludedPackagesJson);
                for (int i = 0; i < jsonArray.length(); i++) {
                    excludedPackages.add(jsonArray.getString(i));
                }
            }

            // 指定日期的零点到次日零点
            Calendar startCal = Calendar.getInstance();
            startCal.set(year, month, day, 0, 0, 0);
            startCal.set(Calendar.MILLISECOND, 0);
            long startTime = startCal.getTimeInMillis();

            Calendar endCal = Calendar.getInstance();
            endCal.set(year, month, day, 23, 59, 59);
            endCal.set(Calendar.MILLISECOND, 999);
            long endTime = endCal.getTimeInMillis();

            // 不能查询未来的日期
            long now = System.currentTimeMillis();
            if (startTime > now) {
                return 0;
            }
            if (endTime > now) {
                endTime = now;
            }

            // 查询使用统计
            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            long totalTime = 0;
            if (stats != null) {
                for (UsageStats usageStats : stats) {
                    if (!excludedPackages.contains(usageStats.getPackageName())) {
                        totalTime += usageStats.getTotalTimeInForeground();
                    }
                }
            }
            return totalTime;
        } catch (Exception e) {
            e.printStackTrace();
            return -2;
        }
    }

    /**
     * [v5.3.0] 获取指定应用在指定日期的使用时间
     * @param packageName 应用包名
     * @param dateString 日期字符串，格式 "YYYY-MM-DD"
     * @return 使用时间（毫秒），-1 表示无权限，-2 表示异常
     */
    @JavascriptInterface
    public long getAppScreenTimeForDate(String packageName, String dateString) {
        if (!hasUsageStatsPermission()) {
            return -1;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            return -2;
        }

        try {
            UsageStatsManager usageStatsManager = (UsageStatsManager)
                    mContext.getSystemService(Context.USAGE_STATS_SERVICE);

            // 解析日期字符串
            String[] parts = dateString.split("-");
            int year = Integer.parseInt(parts[0]);
            int month = Integer.parseInt(parts[1]) - 1;
            int day = Integer.parseInt(parts[2]);

            // 指定日期的零点到次日零点
            Calendar startCal = Calendar.getInstance();
            startCal.set(year, month, day, 0, 0, 0);
            startCal.set(Calendar.MILLISECOND, 0);
            long startTime = startCal.getTimeInMillis();

            Calendar endCal = Calendar.getInstance();
            endCal.set(year, month, day, 23, 59, 59);
            endCal.set(Calendar.MILLISECOND, 999);
            long endTime = endCal.getTimeInMillis();

            // 不能查询未来的日期
            long now = System.currentTimeMillis();
            if (startTime > now) {
                return 0;
            }
            if (endTime > now) {
                endTime = now;
            }

            // 查询使用统计
            List<UsageStats> stats = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_DAILY, startTime, endTime);

            if (stats != null) {
                for (UsageStats usageStats : stats) {
                    if (usageStats.getPackageName().equals(packageName)) {
                        return usageStats.getTotalTimeInForeground();
                    }
                }
            }
            return 0;
        } catch (Exception e) {
            e.printStackTrace();
            return -2;
        }
    }
}