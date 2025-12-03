package com.jianglicheng.timebank;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.CountDownTimer;
import android.os.IBinder;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

public class FloatingTimerService extends Service {
    private WindowManager windowManager;
    private View floatingView;
    private CountDownTimer countDownTimer;
    private static final String CHANNEL_ID = "FLOATING_TIMER_CHANNEL";

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        // 启动前台服务，确保不被杀后台
        startForeground(1, createNotification("时间银行", "悬浮窗计时器运行中..."));
        initializeFloatingWindow();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP".equals(action)) {
                stopSelf();
                return START_NOT_STICKY;
            }

            // 获取 JS 传来的数据
            String taskName = intent.getStringExtra("TASK_NAME");
            long durationSeconds = intent.getLongExtra("DURATION", 0);

            if (durationSeconds > 0) {
                startTimer(taskName, durationSeconds);
            }
        }
        return START_STICKY;
    }

    private void initializeFloatingWindow() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        // 加载我们之前写的 XML 布局
        floatingView = LayoutInflater.from(this).inflate(R.layout.floating_timer_layout, null);

        // 配置悬浮窗参数
        int layoutFlag;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
        }

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE, // 不抢占焦点
                PixelFormat.TRANSLUCENT);

        // 初始位置：屏幕左上角
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 50;
        params.y = 200;

        // 关闭按钮逻辑
        TextView closeBtn = floatingView.findViewById(R.id.btn_close_floating);
        closeBtn.setOnClickListener(v -> stopSelf());

        // --- 实现拖动功能 ---
        floatingView.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX + (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingView, params);
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(floatingView, params);
    }

    private void startTimer(String taskName, long totalSeconds) {
        if (countDownTimer != null) countDownTimer.cancel();

        TextView timerText = floatingView.findViewById(R.id.floating_timer_text);

        // Android 端独立倒计时，避免 JS 后台降频问题
        countDownTimer = new CountDownTimer(totalSeconds * 1000, 1000) {
            public void onTick(long millisUntilFinished) {
                long seconds = millisUntilFinished / 1000;
                long h = seconds / 3600;
                long m = (seconds % 3600) / 60;
                long s = seconds % 60;

                String timeStr;
                if (h > 0) timeStr = String.format("%d:%02d:%02d", h, m, s);
                else timeStr = String.format("%02d:%02d", m, s);

                // 显示：任务名 + 时间
                // 为了简洁，只显示时间，或者截取任务名首字
                timerText.setText(timeStr);
            }

            public void onFinish() {
                timerText.setText("完成!");
                timerText.setTextColor(0xFF00FF00); // 绿色
                // 任务完成后 5秒自动关闭悬浮窗
                new android.os.Handler().postDelayed(() -> stopSelf(), 5000);
            }
        }.start();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (floatingView != null) windowManager.removeView(floatingView);
        if (countDownTimer != null) countDownTimer.cancel();
    }

    // --- 通知栏相关 (前台服务必须) ---
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "悬浮窗服务", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    private Notification createNotification(String title, String content) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(content)
                .setSmallIcon(R.mipmap.ic_launcher)
                .build();
    }
}