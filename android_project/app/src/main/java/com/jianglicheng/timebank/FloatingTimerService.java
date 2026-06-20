package com.jianglicheng.timebank;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.animation.ValueAnimator;
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
    private static final boolean DEBUG_LOG = true; // [v9.3.1] 调试日志开关

    // [v9.3.1] 单例：让 WebAppInterface 主动拉取状态（解决 push 不可靠问题）
    private static FloatingTimerService sInstance;
    public static FloatingTimerService getInstance() { return sInstance; }
    
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
        String taskId;              // [v9.3.1] 关联任务 ID（用于 WebView 拉回时匹配）
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

    // [v9.3.1] 磁盘持久化：让 Service 即使被系统杀死也能恢复
    private static final String PERSIST_PREFS = "floating_timer_persist";
    private static final String PERSIST_KEY_TIMERS = "timers_json";
    private static final String PERSIST_KEY_SAVED_AT = "saved_at";
    private static final long PERSIST_INTERVAL_MS = 5000; // 5 秒刷盘
    private Runnable persistRunnable;
    private boolean persistScheduled = false;

    // [v9.3.1] 跨 WebView 重建的事件恢复（替代 60 秒失效窗口）
    private static final String EVENT_PREFS = "floating_timer_events";
    private static final long EVENT_TTL_MS = 30 * 60 * 1000L; // 30 分钟有效期

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        if (DEBUG_LOG) Log.d(TAG, "[v9.3.1] Service onCreate, restoring timers from disk...");
        // [v9.3.1] 启动时优先从磁盘恢复，确保 Service 跨进程死亡不丢数据
        restoreTimersFromDisk();
        schedulePersist();
    }

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
        String taskId = intent.getStringExtra("TASK_ID");         // [v9.3.1] 任务 ID

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

        // [v9.3.1] ACK 确认：JS 端告知已应用某条事件，Service 清理该事件
        if ("ACK_EVENT".equals(action)) {
            String eventId = intent.getStringExtra("EVENT_ID");
            if (eventId != null) ackEvent(eventId);
            return START_STICKY;
        }

        if (taskName == null || taskName.isEmpty()) {
            taskName = "Task_" + System.currentTimeMillis();
        }

        int duration = intent.getIntExtra("DURATION", 0);
        String colorHex = intent.getStringExtra("COLOR");
        int baseColor = Color.parseColor("#667eea");
        try { if(colorHex != null) baseColor = Color.parseColor(colorHex); } catch(Exception e){}

        // [v9.3.1] 关键修复：同名 timer 已存在时，必须保留已计时时长，绝不 reset 到 0
        long preservedElapsed = 0;
        if (timerMap.containsKey(taskName)) {
            TimerInfo old = timerMap.get(taskName);
            preservedElapsed = getCurrentElapsedTime(old);
            if (DEBUG_LOG) {
                Log.d(TAG, "[v9.3.1] Restarting timer for existing task: " + taskName +
                           ", preserved elapsed=" + preservedElapsed + "ms");
            }
            removeTimer(taskName);
        }

        TimerInfo info = new TimerInfo();
        info.taskName = taskName;
        info.taskId = taskId;       // [v9.3.1]
        info.appPackage = appPackage; // [v7.13.0]
        info.baseColor = baseColor;
        info.isTargetMet = false;
        info.isPaused = false;

        long now = System.currentTimeMillis();
        if (duration > 0) {
            info.isCountDown = true;
            // [v9.3.1] 倒计时：endTime 按当前时间 + duration 重算（因为 startTime 已补偿）
            info.startTime = now - preservedElapsed;
            info.endTime = info.startTime + (duration * 1000L);
        } else {
            info.isCountDown = false;
            // [v9.3.1] 正计时：startTime 倒推 preservedElapsed，确保累计时长不丢
            info.startTime = now - preservedElapsed;
        }

        timerMap.put(taskName, info);
        timerOrder.add(taskName);

        setupFloatingView(info);
        startTimerForInfo(info);
        rearrangeTimers();
        // [v9.3.1] 立即刷盘，避免被杀时丢失本次启动的 preservedElapsed
        persistTimersToDisk();

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
        // [v9.3.1] 移除后立即刷盘
        persistTimersToDisk();
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
        // [v9.3.1] 暂停后刷盘
        persistTimersToDisk();
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
        // [v9.3.1] 恢复后刷盘
        persistTimersToDisk();
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
     * [v7.18.5] 将悬浮窗位置约束在屏幕范围内
     */
    private void clampPositionToScreen() {
        if (windowManager == null) return;
        
        DisplayMetrics metrics = new DisplayMetrics();
        windowManager.getDefaultDisplay().getMetrics(metrics);
        int screenWidth = metrics.widthPixels;
        int screenHeight = metrics.heightPixels;
        
        // 确保至少 48dp 在屏幕内可见，且不超出左/上边缘
        int margin = (int) (48 * metrics.density);
        currentX = Math.max(0, Math.min(currentX, screenWidth - margin));
        currentY = Math.max(0, Math.min(currentY, screenHeight - margin));
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

        // [v7.18.5] 悬浮窗标志
        // FLAG_NOT_FOCUSABLE: 不获取焦点，避免影响底层应用
        // FLAG_NOT_TOUCH_MODAL: 允许悬浮窗外区域正常接收触摸
        // 注意: 不使用 FLAG_LAYOUT_NO_LIMITS，防止悬浮窗被拖出屏幕
        int windowFlags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                windowFlags,
                PixelFormat.TRANSLUCENT);

        params.gravity = Gravity.TOP | Gravity.START;
        // [v7.18.5] 确保位置在屏幕范围内
        clampPositionToScreen();
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
        // 达标后悬浮窗保持显示，直到用户在应用内结束任务
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
                            
                            // [v7.18.5] 约束在屏幕范围内
                            clampPositionToScreen();
                            
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
                            // [v7.18.5] 点击触觉反馈
                            performClickFeedback();
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
     * [v7.18.3-fix4] 获取当前计时器的实际计时值（毫秒）
     * 用于和前端同步时间
     */
    private long getCurrentElapsedTime(TimerInfo info) {
        if (info == null) return 0;
        
        if (info.isCountDown) {
            // 倒计时：返回已经倒计时的时间（目标时间 - 剩余时间）
            if (info.isPaused) {
                // 暂停状态：返回目标时间 - 暂停时的剩余时间
                long targetDuration = info.endTime - info.startTime;
                return Math.max(0, targetDuration - info.pausedRemainingTime);
            } else {
                // 运行状态：返回目标时间 - 当前剩余时间
                long remaining = Math.max(0, info.endTime - System.currentTimeMillis());
                long targetDuration = info.endTime - info.startTime;
                return Math.max(0, targetDuration - remaining);
            }
        } else {
            // 正计时：返回已经计时的时间
            if (info.isPaused) {
                return info.pausedElapsedTime;
            } else {
                return System.currentTimeMillis() - info.startTime;
            }
        }
    }

    /**
     * [v7.18.3-fix4] 保存计时器状态到 SharedPreferences，供前端查询
     */
    private void saveTimerStateToPrefs(String taskName, String action, long elapsedTime) {
        SharedPreferences prefs = getSharedPreferences("floating_timer_sync", MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("taskName", taskName);
        editor.putString("action", action);
        editor.putLong("elapsedTime", elapsedTime);
        editor.putLong("timestamp", System.currentTimeMillis());
        editor.putBoolean("hasPendingSync", true);
        editor.apply();
        if (DEBUG_LOG) Log.d(TAG, "Timer state saved: task=" + taskName + ", action=" + action + ", elapsed=" + elapsedTime);
    }

    /**
     * [v7.18.3-fix4] 清除同步状态
     */
    public static void clearTimerSyncState(Context context) {
        SharedPreferences prefs = context.getSharedPreferences("floating_timer_sync", Context.MODE_PRIVATE);
        prefs.edit().clear().apply();
    }

    /**
     * [v7.18.5] 点击触觉反馈
     * 仅提供轻微震动反馈，不进行位置微调（微调可能干扰系统状态导致跳转失败）
     */
    private void performClickFeedback() {
        try {
            android.os.Vibrator vibrator = (android.os.Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(android.os.VibrationEffect.createOneShot(15, android.os.VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(15);
                }
            }
        } catch (Exception e) {
            // 忽略震动错误
        }
    }

    /**
     * [v7.18.5] 打开 Time Bank 主界面
     * 简化策略：startActivity（前台服务可靠启动）+ moveTaskToFront（辅助）
     * 移除了 AlarmManager 和全屏通知等过于激进的唤醒方式
     */
    private void openApp() {
        if (DEBUG_LOG) Log.d(TAG, "openApp: attempting to bring app to front");
        
        // 主方法: startActivity - 前台服务启动 Activity，Android 10+ 也可靠
        try {
            Intent intent = new Intent(this, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK 
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
            if (DEBUG_LOG) Log.d(TAG, "openApp: startActivity success");
        } catch (Exception e) {
            if (DEBUG_LOG) Log.e(TAG, "openApp: startActivity failed", e);
        }
        
        // 辅助方法: moveTaskToFront - 确保 Task 在前台（不依赖返回值，不 early return）
        try {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                List<ActivityManager.AppTask> appTasks = am.getAppTasks();
                if (appTasks != null && !appTasks.isEmpty()) {
                    appTasks.get(0).moveToFront();
                    if (DEBUG_LOG) Log.d(TAG, "openApp: moveToFront complement success");
                }
            }
        } catch (Exception e) {
            if (DEBUG_LOG) Log.d(TAG, "openApp: moveToFront failed (non-critical)");
        }
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
    /**
     * [v9.3.1] 保存悬浮窗状态到 SharedPreferences，前端在应用恢复时读取
     * 携带当前计时值，确保前端和悬浮窗时间同步
     * 新增：写入带 eventId 的事件队列 + 30 分钟 TTL，替代原本 60 秒失效窗口
     */
    private void notifyWebView(String action, String taskName, long elapsedMillis) {
        // 1. 写入"floating_timer_state"（旧通道，保留兼容）
        SharedPreferences prefs = getSharedPreferences("floating_timer_state", MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("pendingAction", action);
        editor.putString("pendingTaskName", taskName);
        editor.putLong("pendingTimestamp", System.currentTimeMillis());
        editor.putLong("pendingElapsedTime", elapsedMillis);
        editor.apply();
        
        // 2. [v9.3.1] 写入带 eventId 的持久事件队列（TTL 30 分钟）
        String eventId = action + "_" + taskName + "_" + System.currentTimeMillis();
        saveEventToDisk(eventId, action, taskName, elapsedMillis);
        
        // 3. 发送广播通知（如果应用在前台）
        Intent intent = new Intent("com.jianglicheng.timebank.FLOATING_TIMER_ACTION");
        intent.putExtra("action", action);
        intent.putExtra("taskName", taskName);
        intent.putExtra("elapsedTime", elapsedMillis);
        intent.putExtra("eventId", eventId); // [v9.3.1] 让 JS 端 ack 后回传
        sendBroadcast(intent);
        
        if (DEBUG_LOG) Log.d(TAG, "State saved and broadcast sent: action=" + action + ", task=" + taskName + ", elapsed=" + elapsedMillis + ", eventId=" + eventId);
    }

    /**
     * [v9.3.1] 保存事件到磁盘（用于 WebView 重建后回放）
     * 存储格式：eventId -> {action, taskName, elapsed, timestamp}
     */
    private void saveEventToDisk(String eventId, String action, String taskName, long elapsed) {
        try {
            SharedPreferences prefs = getSharedPreferences(EVENT_PREFS, MODE_PRIVATE);
            // 清理过期事件
            long now = System.currentTimeMillis();
            SharedPreferences.Editor editor = prefs.edit();
            for (String key : prefs.getAll().keySet()) {
                long ts = prefs.getLong(key + "_ts", 0);
                if (now - ts > EVENT_TTL_MS) {
                    editor.remove(key);
                    editor.remove(key + "_ts");
                }
            }
            // 写入新事件
            editor.putString(eventId + "_action", action);
            editor.putString(eventId + "_taskName", taskName);
            editor.putLong(eventId + "_elapsed", elapsed);
            editor.putLong(eventId + "_ts", now);
            editor.apply();
        } catch (Exception e) {
            Log.e(TAG, "saveEventToDisk error", e);
        }
    }

    /**
     * [v9.3.1] JS 端 ack 确认：清理指定事件
     */
    private void ackEvent(String eventId) {
        try {
            SharedPreferences prefs = getSharedPreferences(EVENT_PREFS, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.remove(eventId + "_action");
            editor.remove(eventId + "_taskName");
            editor.remove(eventId + "_elapsed");
            editor.remove(eventId + "_ts");
            editor.apply();
            if (DEBUG_LOG) Log.d(TAG, "Event acked: " + eventId);
        } catch (Exception e) {
            Log.e(TAG, "ackEvent error", e);
        }
    }

    /**
     * [v9.3.1] ack 公开方法（供 WebAppInterface 调用）
     */
    public void ackEventPublic(String eventId) {
        ackEvent(eventId);
    }

    /**
     * [v9.3.1] 获取所有未确认的持久事件（供 WebAppInterface 给 JS 拉取）
     * @return JSON 数组字符串
     */
    public String getAllPendingEvents() {
        try {
            SharedPreferences prefs = getSharedPreferences(EVENT_PREFS, MODE_PRIVATE);
            long now = System.currentTimeMillis();
            org.json.JSONArray arr = new org.json.JSONArray();
            for (String key : prefs.getAll().keySet()) {
                if (!key.endsWith("_action")) continue;
                long ts = prefs.getLong(key.replace("_action", "_ts"), 0);
                if (now - ts > EVENT_TTL_MS) continue;
                
                String eventId = key.replace("_action", "");
                String action = prefs.getString(key, "");
                String taskName = prefs.getString(eventId + "_taskName", "");
                long elapsed = prefs.getLong(eventId + "_elapsed", 0);
                
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("eventId", eventId);
                o.put("action", action);
                o.put("taskName", taskName);
                o.put("elapsed", elapsed);
                o.put("timestamp", ts);
                arr.put(o);
            }
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "getAllPendingEvents error", e);
            return "[]";
        }
    }

    private void handleFloatingTimerClick(TimerInfo info) {
        if (DEBUG_LOG) {
            Log.d(TAG, "handleFloatingTimerClick: task=" + info.taskName + 
                       ", appPackage=" + info.appPackage + 
                       ", isPaused=" + info.isPaused +
                       ", isTargetMet=" + info.isTargetMet);
        }
        
        // [v7.25.3] 已达标状态：无论当前在哪个应用，直接跳转回 Time Bank
        // 原因：isAppInForeground() 因悬浮窗前台服务本身属于该进程，
        //       会在几乎所有场景下返回 true，导致走"跳转关联应用"分支，
        //       而非 openApp()，使点击只有振动无跳转。
        if (info.isTargetMet) {
            if (DEBUG_LOG) Log.d(TAG, "handleFloatingTimerClick: isTargetMet=true, opening app directly");
            openApp();
            return;
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
                // [v7.18.3-fix4] 先暂停，再获取准确的暂停后时间
                pauseTimer(info.taskName);
                long currentElapsed = getCurrentElapsedTime(info);
                // 保存到 Service 状态，供前端查询
                saveTimerStateToPrefs(info.taskName, "pause", currentElapsed);
                notifyWebView("pause", info.taskName, currentElapsed); // [v7.18.3-fix4] 传递计时值
                if (DEBUG_LOG) Log.d(TAG, "Timer paused successfully, elapsed=" + currentElapsed);
            } else {
                if (DEBUG_LOG) Log.d(TAG, "Timer already paused, skipping pause");
            }
            openApp();
        } else if (appInForeground) {
            // Time Bank 在前台：恢复计时并跳转关联应用
            if (DEBUG_LOG) Log.d(TAG, "Time Bank in foreground, resuming timer: " + info.taskName);
            if (info.isPaused) {
                resumeTimer(info.taskName);
                long resumedElapsed = getCurrentElapsedTime(info);
                saveTimerStateToPrefs(info.taskName, "resume", resumedElapsed);
                notifyWebView("resume", info.taskName, resumedElapsed); // [v7.18.3-fix4] 传递计时值
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
     * [v9.3.1] 判断当前是否处于关联应用内
     * 增强版：兼容多进程应用（如 com.netease.idv / com.netease.idv:core）
     * 根因：原版 process.processName.equals(appPackage) 严格相等，多进程游戏
     *      （主包名 + ":core"、":push" 等子进程）会因子进程名不匹配而漏检，
     *      导致误判为"不在关联应用内"，进而走错分支重置悬浮窗。
     */
    private boolean isInAssociatedApp(String appPackage) {
        if (appPackage == null || appPackage.isEmpty()) {
            if (DEBUG_LOG) Log.d(TAG, "isInAssociatedApp: empty package");
            return false;
        }
        
        try {
            // 方法1: 通过 RunningAppProcessInfo 检查（支持主包名和子进程）
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<android.app.ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
                if (processes != null) {
                    for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
                        // [v9.3.1] 兼容主包名 + ":xxx" 子进程
                        if (process.processName.equals(appPackage) 
                            || process.processName.startsWith(appPackage + ":")) {
                            boolean isForeground = process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND ||
                                process.importance == 
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND_SERVICE;
                            if (DEBUG_LOG) {
                                Log.d(TAG, "Found process " + process.processName + 
                                           " (matched " + appPackage + "), importance=" + process.importance + 
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
            // [v7.25.3] 方法1（主要）: UsageStats
            // UsageStats 返回真实前台 Activity 所属包名，不受前台服务进程污染，
            // 比 RunningAppProcessInfo 更可靠（后者会把前台服务也算入 FOREGROUND_SERVICE）。
            String topPackage = getTopAppPackageViaUsageStats();
            if (topPackage != null) {
                boolean result = packageName.equals(topPackage);
                if (DEBUG_LOG) Log.d(TAG, "isAppInForeground: " + result + " (UsageStats, top=" + topPackage + ")");
                return result;
            }
            
            // [v7.25.3] 方法2（兜底）: RunningAppProcessInfo，仅在 UsageStats 无权限/无数据时使用
            // 严格使用 IMPORTANCE_FOREGROUND（排除 IMPORTANCE_FOREGROUND_SERVICE），
            // 避免将悬浮窗服务本身误判为「应用在前台」。
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am != null) {
                List<android.app.ActivityManager.RunningAppProcessInfo> processes = am.getRunningAppProcesses();
                if (processes != null) {
                    for (android.app.ActivityManager.RunningAppProcessInfo process : processes) {
                        if (process.processName.equals(packageName)) {
                            boolean isForeground = process.importance ==
                                android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
                            if (DEBUG_LOG) {
                                Log.d(TAG, "isAppInForeground: " + isForeground +
                                           " (RunningAppProcessInfo fallback, importance=" + process.importance + ")");
                            }
                            return isForeground;
                        }
                    }
                }
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

    // ========== [v9.3.1] 拉模型接口：让 WebView 主动查询，取代不可靠的 push ==========

    /**
     * [v9.3.1] 获取所有活动计时器的完整状态（供 WebAppInterface 给 JS 拉取）
     * 这是单一事实来源：WebView 重建后，JS 可通过此方法恢复 runningTasks
     * @return JSON 数组字符串
     */
    public String getAllTimerStates() {
        try {
            org.json.JSONArray arr = new org.json.JSONArray();
            for (TimerInfo info : timerMap.values()) {
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("taskName", info.taskName);
                o.put("taskId", info.taskId == null ? "" : info.taskId);
                o.put("appPackage", info.appPackage == null ? "" : info.appPackage);
                o.put("elapsed", getCurrentElapsedTime(info));
                o.put("isCountDown", info.isCountDown);
                o.put("isPaused", info.isPaused);
                o.put("isTargetMet", info.isTargetMet);
                o.put("baseColor", info.baseColor);
                o.put("startTime", info.startTime);
                if (info.isCountDown) {
                    o.put("endTime", info.endTime);
                }
                arr.put(o);
            }
            return arr.toString();
        } catch (Exception e) {
            Log.e(TAG, "getAllTimerStates error", e);
            return "[]";
        }
    }

    /**
     * [v9.3.1] 根据 taskName 查找 TimerInfo
     */
    public TimerInfo findTimer(String taskName) {
        if (taskName == null) return null;
        return timerMap.get(taskName);
    }

    /**
     * [v9.3.1] 根据 taskName 拉取累计时长（毫秒）
     * @return -1 表示找不到该 timer
     */
    public long getTimerElapsedByName(String taskName) {
        TimerInfo info = findTimer(taskName);
        if (info == null) return -1L;
        return getCurrentElapsedTime(info);
    }

    // ========== [v9.3.1] 磁盘持久化：Service 跨进程死亡仍能恢复 ==========

    /**
     * [v9.3.1] 周期性刷盘
     */
    private void schedulePersist() {
        if (persistScheduled) return;
        persistScheduled = true;
        persistRunnable = new Runnable() {
            @Override
            public void run() {
                persistScheduled = false;
                persistTimersToDisk();
                // 5 秒后再来一次
                if (handler != null) {
                    handler.postDelayed(this, PERSIST_INTERVAL_MS);
                }
            }
        };
        handler.postDelayed(persistRunnable, PERSIST_INTERVAL_MS);
    }

    /**
     * [v9.3.1] 立即将所有 timer 状态持久化到磁盘
     * 解决：Service 被系统杀死后，状态全部丢失的问题
     */
    private void persistTimersToDisk() {
        try {
            org.json.JSONArray arr = new org.json.JSONArray();
            for (TimerInfo info : timerMap.values()) {
                org.json.JSONObject o = new org.json.JSONObject();
                o.put("taskName", info.taskName);
                o.put("taskId", info.taskId == null ? "" : info.taskId);
                o.put("appPackage", info.appPackage == null ? "" : info.appPackage);
                o.put("startTime", info.startTime);
                o.put("endTime", info.endTime);
                o.put("isCountDown", info.isCountDown);
                o.put("isPaused", info.isPaused);
                o.put("pausedElapsedTime", info.pausedElapsedTime);
                o.put("pausedRemainingTime", info.pausedRemainingTime);
                o.put("isTargetMet", info.isTargetMet);
                o.put("baseColor", info.baseColor);
                o.put("accumulatedElapsed", getCurrentElapsedTime(info));
                arr.put(o);
            }
            SharedPreferences prefs = getSharedPreferences(PERSIST_PREFS, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putString(PERSIST_KEY_TIMERS, arr.toString());
            editor.putLong(PERSIST_KEY_SAVED_AT, System.currentTimeMillis());
            editor.apply();
            if (DEBUG_LOG) Log.d(TAG, "Persisted " + arr.length() + " timer(s) to disk");
        } catch (Exception e) {
            Log.e(TAG, "persistTimersToDisk error", e);
        }
    }

    /**
     * [v9.3.1] 启动时从磁盘恢复 timer 状态
     * 关键修复：Service 即使被系统杀死后重启，也能找回之前的计时进度
     * 注意：恢复后只重建内存数据，不重建悬浮窗 View（View 需要在 WindowManager 准备好后单独重建）
     */
    private void restoreTimersFromDisk() {
        try {
            SharedPreferences prefs = getSharedPreferences(PERSIST_PREFS, MODE_PRIVATE);
            String json = prefs.getString(PERSIST_KEY_TIMERS, "[]");
            long savedAt = prefs.getLong(PERSIST_KEY_SAVED_AT, 0);
            if (savedAt == 0 || json.equals("[]")) {
                if (DEBUG_LOG) Log.d(TAG, "No persisted timers to restore");
                return;
            }
            
            // 防止恢复过期太久的（超过 24 小时认为已无效）
            if (System.currentTimeMillis() - savedAt > 24 * 60 * 60 * 1000L) {
                if (DEBUG_LOG) Log.d(TAG, "Persisted timers too old, clearing");
                prefs.edit().clear().apply();
                return;
            }
            
            org.json.JSONArray arr = new org.json.JSONArray(json);
            int restored = 0;
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject o = arr.getJSONObject(i);
                String taskName = o.optString("taskName");
                if (taskName.isEmpty()) continue;
                
                // 避免重复
                if (timerMap.containsKey(taskName)) continue;
                
                TimerInfo info = new TimerInfo();
                info.taskName = taskName;
                info.taskId = o.optString("taskId", "");
                info.appPackage = o.optString("appPackage", "");
                info.startTime = o.optLong("startTime", System.currentTimeMillis());
                info.endTime = o.optLong("endTime", 0);
                info.isCountDown = o.optBoolean("isCountDown", false);
                info.isPaused = o.optBoolean("isPaused", false);
                info.pausedElapsedTime = o.optLong("pausedElapsedTime", 0);
                info.pausedRemainingTime = o.optLong("pausedRemainingTime", 0);
                info.isTargetMet = o.optBoolean("isTargetMet", false);
                info.baseColor = o.optInt("baseColor", Color.parseColor("#667eea"));
                
                // [v9.3.1] 关键修复：恢复后如果处于"暂停"状态，需要将 pausedElapsedTime/pausedRemainingTime
                // 正确转换回 startTime/endTime，确保 getCurrentElapsedTime 计算正确
                if (info.isPaused) {
                    if (info.isCountDown) {
                        // 倒计时：endTime 保持不变，pausedRemainingTime 也保留（双重保险）
                    } else {
                        // 正计时：startTime 倒推 pausedElapsedTime
                        info.startTime = System.currentTimeMillis() - info.pausedElapsedTime;
                    }
                } else if (info.isCountDown) {
                    // 倒计时且未暂停：如果已经超时，标记为达标
                    if (System.currentTimeMillis() >= info.endTime) {
                        info.isTargetMet = true;
                    }
                }
                
                timerMap.put(taskName, info);
                timerOrder.add(taskName);
                
                // 重建悬浮窗 View 和计时器
                if (windowManager == null) {
                    windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
                }
                setupFloatingView(info);
                if (!info.isTargetMet) {
                    startTimerForInfo(info);
                }
                restored++;
            }
            if (restored > 0) {
                rearrangeTimers();
                if (DEBUG_LOG) Log.d(TAG, "Restored " + restored + " timer(s) from disk");
            }
        } catch (Exception e) {
            Log.e(TAG, "restoreTimersFromDisk error", e);
        }
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
        
        // [v7.18.5] 确保位置在屏幕范围内
        clampPositionToScreen();
        
        // 更新所有悬浮窗位置
        updateAllPositions();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        sInstance = null; // [v9.3.1] 清理单例
        // [v9.3.1] 取消刷盘调度
        if (persistRunnable != null) {
            handler.removeCallbacks(persistRunnable);
            persistScheduled = false;
        }
        // [v9.3.1] 销毁前最后一次刷盘（保留状态供下次启动恢复）
        persistTimersToDisk();
        
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
