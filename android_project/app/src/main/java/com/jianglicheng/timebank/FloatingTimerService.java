package com.jianglicheng.timebank;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.animation.ValueAnimator;
import android.animation.AnimatorSet;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.OvershootInterpolator;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * [v5.3.0] 支持多个悬浮窗计时器堆叠显示
 * - 收起状态：所有悬浮窗堆叠在一起，只有最上层可见
 * - 展开状态：悬浮窗向下展开显示
 * - 长按切换展开/收起状态
 * - 拖动时所有悬浮窗一起移动
 * - 达标任务始终在最上层
 */
public class FloatingTimerService extends Service {
    private static final String TAG = "FloatingTimer";
    private static final boolean DEBUG_LOG = true; // [v7.14.0] 调试日志开关
    
    private WindowManager windowManager;
    private Handler handler = new Handler(Looper.getMainLooper());

    private static class TimerInfo {
        TextView view;
        WindowManager.LayoutParams params;
        long endTime;
        long startTime;
        boolean isCountDown;
        int baseColor;
        String taskName;
        String appPackage;          // [v7.13.0] 关联应用包名
        Runnable timerRunnable;
        int stackIndex;
        boolean isTargetMet;
        boolean isPaused;           // [v5.8.1] 暂停状态
        long pausedElapsedTime;     // [v5.8.1] 暂停时已计时的毫秒数
        long pausedRemainingTime;   // [v5.8.1] 暂停时剩余的毫秒数（倒计时用）
    }

    private Map<String, TimerInfo> timerMap = new HashMap<>();
    private List<String> timerOrder = new ArrayList<>();

    // 堆叠状态
    private boolean isExpanded = false;
    
    // 展开时的间距（确保不重叠）
    private static final int EXPAND_OFFSET_V = 110;  // 竖屏垂直展开间距
    private static final int EXPAND_OFFSET_H = 210; // 横屏水平展开间距
    // 收起时的微小偏移（向左上方偏移，让用户知道有多个）
    private static final int COLLAPSE_OFFSET_Y = -6;
    private static final int COLLAPSE_OFFSET_X = -6;
    
    // 当前位置
    private int currentX = 50;
    private int currentY = 300;
    
    // [v5.8.1] 位置记忆
    private static final String PREFS_NAME = "floating_timer_prefs";
    private static final String KEY_PORTRAIT_X = "portrait_x";
    private static final String KEY_PORTRAIT_Y = "portrait_y";
    private static final String KEY_LANDSCAPE_X = "landscape_x";
    private static final String KEY_LANDSCAPE_Y = "landscape_y";
    private int portraitX = 50, portraitY = 300;
    private int landscapeX = 50, landscapeY = 200;
    
    // 长按检测
    private static final long LONG_PRESS_THRESHOLD = 400; // ms
    private Handler longPressHandler = new Handler(Looper.getMainLooper());
    private Runnable longPressRunnable;
    private boolean isLongPressTriggered = false;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        startForeground(1, createNotification());
        
        // [v5.8.1] 加载保存的位置
        loadSavedPositions();

        String action = intent.getStringExtra("ACTION");
        String taskName = intent.getStringExtra("TASK_NAME");
        String appPackage = intent.getStringExtra("APP_PACKAGE"); // [v7.13.0]

        if ("STOP".equals(action) && taskName != null) {
            removeTimer(taskName);
            if (timerMap.isEmpty()) {
                stopSelf();
            }
            return START_STICKY;
        }
        
        // [v5.8.1] 暂停计时器
        if ("PAUSE".equals(action) && taskName != null) {
            pauseTimer(taskName);
            return START_STICKY;
        }
        
        // [v5.8.1] 恢复计时器
        if ("RESUME".equals(action) && taskName != null) {
            resumeTimer(taskName);
            return START_STICKY;
        }

        if (taskName == null || taskName.isEmpty()) {
            taskName = "Task_" + System.currentTimeMillis();
        }

        int duration = intent.getIntExtra("DURATION", 0);
        String colorHex = intent.getStringExtra("COLOR");
        int baseColor = Color.parseColor("#667eea");
        try { if(colorHex != null) baseColor = Color.parseColor(colorHex); } catch(Exception e){}

        if (timerMap.containsKey(taskName)) {
            removeTimer(taskName);
        }

        TimerInfo info = new TimerInfo();
        info.taskName = taskName;
        info.appPackage = appPackage; // [v7.13.0]
        info.baseColor = baseColor;
        info.isTargetMet = false;
        info.isPaused = false;

        if (duration > 0) {
            info.isCountDown = true;
            info.endTime = System.currentTimeMillis() + (duration * 1000L);
        } else {
            info.isCountDown = false;
            info.startTime = System.currentTimeMillis();
        }

        timerMap.put(taskName, info);
        timerOrder.add(taskName);

        setupFloatingView(info);
        startTimerForInfo(info);
        rearrangeTimers();

        return START_STICKY;
    }

    private void removeTimer(String taskName) {
        TimerInfo info = timerMap.remove(taskName);
        timerOrder.remove(taskName);
        if (info != null) {
            if (info.timerRunnable != null) {
                handler.removeCallbacks(info.timerRunnable);
            }
            if (info.view != null && windowManager != null) {
                try { windowManager.removeView(info.view); } catch (Exception e) {}
            }
        }
        rearrangeTimers();
    }
    
    /**
     * [v5.8.1] 暂停计时器
     */
    private void pauseTimer(String taskName) {
        TimerInfo info = timerMap.get(taskName);
        if (info == null || info.isPaused) return;
        
        info.isPaused = true;
        
        // 停止计时 runnable
        if (info.timerRunnable != null) {
            handler.removeCallbacks(info.timerRunnable);
        }
        
        // 保存当前状态
        long now = System.currentTimeMillis();
        if (info.isCountDown) {
            info.pausedRemainingTime = Math.max(0, info.endTime - now);
        } else {
            info.pausedElapsedTime = now - info.startTime;
        }
        
        // 更新显示：添加暂停图标
        updatePausedDisplay(info);
    }
    
    /**
     * [v5.8.1] 恢复计时器
     */
    private void resumeTimer(String taskName) {
        TimerInfo info = timerMap.get(taskName);
        if (info == null || !info.isPaused) return;
        
        info.isPaused = false;
        
        // 恢复时间状态
        long now = System.currentTimeMillis();
        if (info.isCountDown) {
            info.endTime = now + info.pausedRemainingTime;
        } else {
            info.startTime = now - info.pausedElapsedTime;
        }
        
        // 恢复正常背景
        restoreNormalDisplay(info);
        
        // 重新启动计时
        startTimerForInfo(info);
    }
    
    /**
     * [v5.8.1] 更新暂停状态显示
     */
    private void updatePausedDisplay(TimerInfo info) {
        if (info.view == null) return;
        
        // 显示暂停图标
        String timeText;
        if (info.isCountDown) {
            timeText = "⏸ " + formatDuration(info.pausedRemainingTime);
        } else {
            timeText = "⏸ " + formatDuration(info.pausedElapsedTime);
        }
        info.view.setText(timeText);
        
        // 降低透明度表示暂停
        android.graphics.drawable.GradientDrawable gd = new android.graphics.drawable.GradientDrawable();
        gd.setColor(info.baseColor);
        gd.setAlpha(160); // 降低透明度
        gd.setCornerRadius(50);
        info.view.setBackground(gd);
    }
    
    /**
     * [v5.8.1] 恢复正常显示
     */
    private void restoreNormalDisplay(TimerInfo info) {
        if (info.view == null) return;
        
        android.graphics.drawable.GradientDrawable gd = new android.graphics.drawable.GradientDrawable();
        gd.setColor(info.baseColor);
        gd.setAlpha(255);
        gd.setCornerRadius(50);
        info.view.setBackground(gd);
    }
    
    /**
     * [v5.8.1] 加载保存的位置
     */
    private void loadSavedPositions() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        portraitX = prefs.getInt(KEY_PORTRAIT_X, 50);
        portraitY = prefs.getInt(KEY_PORTRAIT_Y, 300);
        landscapeX = prefs.getInt(KEY_LANDSCAPE_X, 50);
        landscapeY = prefs.getInt(KEY_LANDSCAPE_Y, 200);
        
        // 根据当前屏幕方向设置位置
        if (isLandscape()) {
            currentX = landscapeX;
            currentY = landscapeY;
        } else {
            currentX = portraitX;
            currentY = portraitY;
        }
    }
    
    /**
     * [v5.8.1] 保存当前位置
     */
    private void saveCurrentPosition() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        
        if (isLandscape()) {
            landscapeX = currentX;
            landscapeY = currentY;
            editor.putInt(KEY_LANDSCAPE_X, landscapeX);
            editor.putInt(KEY_LANDSCAPE_Y, landscapeY);
        } else {
            portraitX = currentX;
            portraitY = currentY;
            editor.putInt(KEY_PORTRAIT_X, portraitX);
            editor.putInt(KEY_PORTRAIT_Y, portraitY);
        }
        
        editor.apply();
    }

    /**
     * 获取排序后的计时器列表：达标任务（倒计时）在前
     */
    private List<String> getSortedTimerList() {
        List<String> countDownTasks = new ArrayList<>();
        List<String> normalTasks = new ArrayList<>();

        for (String name : timerOrder) {
            TimerInfo info = timerMap.get(name);
            if (info != null) {
                if (info.isCountDown) {
                    countDownTasks.add(name);
                } else {
                    normalTasks.add(name);
                }
            }
        }

        List<String> result = new ArrayList<>();
        result.addAll(countDownTasks);
        result.addAll(normalTasks);
        return result;
    }

    /**
     * 重新排列所有悬浮窗的位置和z-order
     */
    private void rearrangeTimers() {
        List<String> sortedList = getSortedTimerList();
        
        // 更新stackIndex
        for (int i = 0; i < sortedList.size(); i++) {
            TimerInfo info = timerMap.get(sortedList.get(i));
            if (info != null) {
                info.stackIndex = i;
            }
        }
        
        // 按z-order顺序重新添加View（后添加的在上层）
        // 最上层的任务（stackIndex=0）最后添加
        for (int i = sortedList.size() - 1; i >= 0; i--) {
            String name = sortedList.get(i);
            TimerInfo info = timerMap.get(name);
            if (info != null && info.view != null && info.params != null) {
                updateTimerPosition(info);
                try {
                    windowManager.removeView(info.view);
                    windowManager.addView(info.view, info.params);
                } catch (Exception e) {}
            }
        }
    }

    /**
     * 检测当前是否为横屏
     */
    private boolean isLandscape() {
        return getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
    }

    /**
     * 更新单个计时器的位置
     */
    private void updateTimerPosition(TimerInfo info) {
        if (info.params == null) return;
        
        if (isExpanded) {
            // 展开状态
            if (isLandscape()) {
                // 横屏：水平排列
                info.params.x = currentX + (info.stackIndex * EXPAND_OFFSET_H);
                info.params.y = currentY;
            } else {
                // 竖屏：垂直排列
                info.params.x = currentX;
                info.params.y = currentY + (info.stackIndex * EXPAND_OFFSET_V);
            }
        } else {
            // 收起状态：微小偏移堆叠（向左上方）
            info.params.x = currentX + (info.stackIndex * COLLAPSE_OFFSET_X);
            info.params.y = currentY + (info.stackIndex * COLLAPSE_OFFSET_Y);
        }
    }

    /**
     * 更新所有悬浮窗的位置（不改变z-order）
     */
    private void updateAllPositions() {
        for (TimerInfo info : timerMap.values()) {
            if (info.view != null && info.params != null) {
                updateTimerPosition(info);
                try {
                    windowManager.updateViewLayout(info.view, info.params);
                } catch (Exception e) {}
            }
        }
    }

    /**
     * 切换展开/收起状态（带Q弹动画）
     */
    private void toggleExpand() {
        isExpanded = !isExpanded;
        animateToNewPositions();
    }

    /**
     * 带Q弹效果的动画过渡到新位置（不调整z-order，避免闪烁）
     */
    private void animateToNewPositions() {
        List<String> sortedList = getSortedTimerList();
        
        // 只执行位置动画，不调整z-order
        for (int i = 0; i < sortedList.size(); i++) {
            final TimerInfo info = timerMap.get(sortedList.get(i));
            if (info == null || info.view == null || info.params == null) continue;
            
            info.stackIndex = i;
            
            // 计算目标位置
            int targetX, targetY;
            if (isExpanded) {
                if (isLandscape()) {
                    targetX = currentX + (i * EXPAND_OFFSET_H);
                    targetY = currentY;
                } else {
                    targetX = currentX;
                    targetY = currentY + (i * EXPAND_OFFSET_V);
                }
            } else {
                targetX = currentX + (i * COLLAPSE_OFFSET_X);
                targetY = currentY + (i * COLLAPSE_OFFSET_Y);
            }
            
            final int startX = info.params.x;
            final int startY = info.params.y;
            final int endX = targetX;
            final int endY = targetY;
            
            // 为每个悬浮窗创建动画
            ValueAnimator animator = ValueAnimator.ofFloat(0f, 1f);
            animator.setDuration(420);
            // Q弹插值器：tension越大越弹
            animator.setInterpolator(new OvershootInterpolator(1.2f));
            // 错开启动时间，让动画更有层次感
            animator.setStartDelay(i * 36L);
            
            animator.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
                @Override
                public void onAnimationUpdate(ValueAnimator animation) {
                    float fraction = animation.getAnimatedFraction();
                    info.params.x = (int) (startX + (endX - startX) * fraction);
                    info.params.y = (int) (startY + (endY - startY) * fraction);
                    try {
                        windowManager.updateViewLayout(info.view, info.params);
                    } catch (Exception e) {}
                }
            });
            
            animator.start();
        }
    }

    private void setupFloatingView(TimerInfo info) {
        if (windowManager == null) {
            windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        }

        TextView view = new TextView(this);
        view.setTextColor(Color.WHITE);
        view.setTextSize(14);
        view.setGravity(Gravity.CENTER);
        view.setPadding(32, 14, 32, 14);

        android.graphics.drawable.GradientDrawable gd = new android.graphics.drawable.GradientDrawable();
        gd.setColor(info.baseColor);
        gd.setAlpha(255);
        gd.setCornerRadius(50);
        view.setBackground(gd);

        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.START;
        params.x = currentX;
        params.y = currentY;

        info.view = view;
        info.params = params;

        windowManager.addView(view, params);
        setupTouchListener(info);
    }

    private void startTimerForInfo(TimerInfo info) {
        if (info.timerRunnable != null) handler.removeCallbacks(info.timerRunnable);

        info.timerRunnable = new Runnable() {
            @Override
            public void run() {
                long now = System.currentTimeMillis();

                if (info.isCountDown) {
                    long millisUntilFinished = info.endTime - now;
                    if (millisUntilFinished > 0) {
                        info.view.setText(formatDuration(millisUntilFinished));
                        handler.postDelayed(this, 1000);
                    } else {
                        enterTargetMetState(info);
                    }
                } else {
                    long millisElapsed = now - info.startTime;
                    info.view.setText(formatDuration(millisElapsed));
                    handler.postDelayed(this, 1000);
                }
            }
        };
        handler.post(info.timerRunnable);
    }

    private void enterTargetMetState(TimerInfo info) {
        info.isTargetMet = true;
        info.view.setText("已达标");
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                removeTimer(info.taskName);
                if (timerMap.isEmpty()) {
                    stopSelf();
                }
            }
        }, 15000);
    }

    private String formatDuration(long millis) {
        long seconds = millis / 1000;
        long minutes = seconds / 60;
        long hours = minutes / 60;

        long remainMinutes = minutes % 60;
        long remainSeconds = seconds % 60;

        if (hours > 0) {
            return String.format(Locale.getDefault(), "%d:%02d:%02d", hours, remainMinutes, remainSeconds);
        } else {
            return String.format(Locale.getDefault(), "%02d:%02d", remainMinutes, remainSeconds);
        }
    }

    private void setupTouchListener(TimerInfo info) {
        info.view.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private long touchStartTime;
            private boolean isMoved = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = currentX;
                        initialY = currentY;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        touchStartTime = System.currentTimeMillis();
                        isMoved = false;
                        isLongPressTriggered = false;
                        
                        // 设置长按检测
                        longPressRunnable = new Runnable() {
                            @Override
                            public void run() {
                                if (!isMoved) {
                                    isLongPressTriggered = true;
                                    toggleExpand();
                                }
                            }
                        };
                        longPressHandler.postDelayed(longPressRunnable, LONG_PRESS_THRESHOLD);
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        float deltaX = event.getRawX() - initialTouchX;
                        float deltaY = event.getRawY() - initialTouchY;
                        
                        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                            isMoved = true;
                            // 取消长按检测
                            longPressHandler.removeCallbacks(longPressRunnable);
                            
                            // 更新全局位置
                            currentX = initialX + (int) deltaX;
                            currentY = initialY + (int) deltaY;
                            
                            // 移动所有悬浮窗
                            updateAllPositions();
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        // 取消长按检测
                        longPressHandler.removeCallbacks(longPressRunnable);
                        
                        // [v5.8.1] 如果有移动，保存位置
                        if (isMoved) {
                            saveCurrentPosition();
                        }
                        
                        // 如果没有移动且没有触发长按，则是点击
                        if (!isMoved && !isLongPressTriggered && 
                            (System.currentTimeMillis() - touchStartTime < LONG_PRESS_THRESHOLD)) {
                            // [v7.13.0] 点击悬浮窗：恢复计时 + 跳转关联应用
                            handleFloatingTimerClick(info);
                        }
                        return true;
                        
                    case MotionEvent.ACTION_CANCEL:
                        longPressHandler.removeCallbacks(longPressRunnable);
                        return true;
                }
                return false;
            }
        });
    }

    /**
     * [v7.16.3] 打开 Time Bank 主界面
     * 优先使用 moveTaskToFront 直接操作任务栈，解决沉浸模式游戏下 startActivity 无法切换前台的问题
     */
    private void openApp() {
        // 方法1: moveTaskToFront - 直接操作任务栈，在全屏沉浸模式下比 startActivity 更可靠
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                List<ActivityManager.AppTask> appTasks = am.getAppTasks();
                if (appTasks != null && !appTasks.isEmpty()) {
                    appTasks.get(0).moveToFront();
                    if (DEBUG_LOG) Log.d(TAG, "openApp: moveToFront via AppTask");
                    return;
                }
            }
        } catch (Exception e) {
            if (DEBUG_LOG) Log.e(TAG, "AppTask.moveToFront failed", e);
        }
        
        // 方法2: 兜底 startActivity
        if (DEBUG_LOG) Log.d(TAG, "openApp: fallback to startActivity");
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        startActivity(intent);
    }
    
    // [v7.14.0] 通过 UsageStatsManager 获取当前前台应用包名
    private String getTopAppPackageViaUsageStats() {
        try {
            UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;
            
            long now = System.currentTimeMillis();
            // 查询最近 5 秒的使用统计
            List<UsageStats> stats = usm.queryUsageStats(
                    UsageStatsManager.INTERVAL_BEST, 
                    now - 5000, 
                    now);
            
            if (stats == null || stats.isEmpty()) return null;
            
            String topPackage = null;
            long lastTimeUsed = 0;
            
            for (UsageStats usageStats : stats) {
                if (usageStats.getLastTimeUsed() > lastTimeUsed) {
                    lastTimeUsed = usageStats.getLastTimeUsed();
                    topPackage = usageStats.getPackageName();
                }
            }
            
            return topPackage;
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * [v7.14.0] 处理悬浮窗点击事件 - 智能跳转逻辑
     * - 如果在关联应用内：暂停计时 + 跳转回 Time Bank
     * - 如果 Time Bank 在前台：恢复计时 + 跳转关联应用
     * - 如果 Time Bank 在后台：打开 Time Bank 主界面
     */
    private void handleFloatingTimerClick(TimerInfo info) {
        if (DEBUG_LOG) {
            Log.d(TAG, "handleFloatingTimerClick: task=" + info.taskName + 
                       ", appPackage=" + info.appPackage + 
                       ", isPaused=" + info.isPaused);
        }
        
        boolean inAssociatedApp = isInAssociatedApp(info.appPackage);
        boolean appInForeground = isAppInForeground();
        
        if (DEBUG_LOG) {
            Log.d(TAG, "State check: inAssociatedApp=" + inAssociatedApp + 
                       ", appInForeground=" + appInForeground);
        }
        
        if (inAssociatedApp) {
            // 在关联应用内：暂停计时并返回 Time Bank
            if (DEBUG_LOG) Log.d(TAG, "In associated app, pausing timer: " + info.taskName);
            if (!info.isPaused) {
                pauseTimer(info.taskName);
                if (DEBUG_LOG) Log.d(TAG, "Timer paused successfully");
            } else {
                if (DEBUG_LOG) Log.d(TAG, "Timer already paused, skipping pause");
            }
            openApp();
        } else if (appInForeground) {
            // Time Bank 在前台：恢复计时并跳转关联应用
            if (DEBUG_LOG) Log.d(TAG, "Time Bank in foreground, resuming timer: " + info.taskName);
            if (info.isPaused) {
                resumeTimer(info.taskName);
            }
            if (info.appPackage != null && !info.appPackage.isEmpty()) {
                launchApp(info.appPackage);
            }
        } else {
            // Time Bank 在后台：打开主界面
            if (DEBUG_LOG) Log.d(TAG, "Time Bank in background, opening app");
            openApp();
        }
    }
    
    /**
     * [v7.14.0] 判断当前是否处于关联应用内
     * 增强版：兼容 Android 12+ 并添加多重验证
     */
    private boolean isInAssociatedApp(String appPackage) {
        if (appPackage == null || appPackage.isEmpty()) {
            if (DEBUG_LOG) Log.d(TAG, "isInAssociatedApp: empty package");
            return false;
        }
        
        try {
            // 方法1: 通过 RunningAppProcessInfo 检查
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<android.app.ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
                if (processes != null) {
                    for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
                        if (process.processName.equals(appPackage)) {
                            // [v7.14.0] 放宽判断：接受 FOREGROUND 或 FOREGROUND_SERVICE
                            boolean isForeground = process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
                                process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE;
                            if (DEBUG_LOG) {
                                Log.d(TAG, "Found process " + appPackage + ", importance=" + process.importance + 
                                           ", isForeground=" + isForeground);
                            }
                            if (isForeground) {
                                return true;
                            }
                        }
                    }
                }
            }
            
            // 方法2: 通过 UsageStats 检查（Android 5.0+ 更可靠，适用于 Android 12+）
            String topPackage = getTopAppPackageViaUsageStats();
            if (topPackage != null && topPackage.equals(appPackage)) {
                if (DEBUG_LOG) Log.d(TAG, "UsageStats confirms " + appPackage + " is top app");
                return true;
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error checking associated app", e);
        }
        
        if (DEBUG_LOG) Log.d(TAG, "isInAssociatedApp: " + appPackage + " not detected in foreground");
        return false;
    }
    
    /**
     * [v7.14.0] 判断 Time Bank 是否在前台
     * 增强版：添加多重验证机制，兼容 Android 12+
     */
    private boolean isAppInForeground() {
        String packageName = getPackageName();
        
        try {
            // 方法1: RunningAppProcessInfo
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<android.app.ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
                if (processes != null) {
                    for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
                        if (process.processName.equals(packageName)) {
                            // [v7.14.0] 放宽判断：接受 FOREGROUND 或 FOREGROUND_SERVICE
                            boolean isForeground = process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
                                process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE;
                            if (isForeground) {
                                if (DEBUG_LOG) Log.d(TAG, "isAppInForeground: true (RunningAppProcessInfo)");
                                return true;
                            }
                        }
                    }
                }
            }
            
            // 方法2: UsageStats（Android 12+ 更可靠）
            String topPackage = getTopAppPackageViaUsageStats();
            if (packageName.equals(topPackage)) {
                if (DEBUG_LOG) Log.d(TAG, "isAppInForeground: true (UsageStats)");
                return true;
            }
            
        } catch (Exception e) {
            Log.e(TAG, "Error checking app foreground state", e);
        }
        
        if (DEBUG_LOG) Log.d(TAG, "isAppInForeground: false");
        return false;
    }
    
    /**
     * [v7.13.0] 启动外部应用
     */
    private void launchApp(String packageName) {
        try {
            PackageManager pm = getPackageManager();
            Intent intent = pm.getLaunchIntentForPackage(packageName);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private Notification createNotification() {
        String channelId = "floating_timer_channel";
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    channelId, "悬浮窗服务", NotificationManager.IMPORTANCE_LOW);
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, channelId);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder.setContentTitle("TimeBank").setContentText("Timer Running").setSmallIcon(R.mipmap.ic_launcher).build();
    }
    
    /**
     * [v5.8.1] 处理屏幕旋转
     */
    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        
        // 切换到对应屏幕方向的保存位置
        if (newConfig.orientation == Configuration.ORIENTATION_LANDSCAPE) {
            currentX = landscapeX;
            currentY = landscapeY;
        } else {
            currentX = portraitX;
            currentY = portraitY;
        }
        
        // 更新所有悬浮窗位置
        updateAllPositions();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        longPressHandler.removeCallbacksAndMessages(null);
        for (TimerInfo info : timerMap.values()) {
            if (info.timerRunnable != null) {
                handler.removeCallbacks(info.timerRunnable);
            }
            if (info.view != null) {
                try { windowManager.removeView(info.view); } catch (Exception e) {}
            }
        }
        timerMap.clear();
        timerOrder.clear();
    }
}
