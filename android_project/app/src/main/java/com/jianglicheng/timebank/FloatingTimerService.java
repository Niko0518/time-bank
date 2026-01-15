package com.jianglicheng.timebank;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.animation.ValueAnimator;
import android.animation.AnimatorSet;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
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
                            openApp();
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

    private void openApp() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
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
