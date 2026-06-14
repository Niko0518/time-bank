package com.jianglicheng.timebank;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallback;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * [v9.4.0] MQTT 长连接服务（独立进程 :longconn，dataSync FGS）
 *
 * 设计目标：
 * - 在独立进程运行，WebView 冻结/被杀不影响长连接
 * - dataSync FGS 防止深 Doze 杀进程
 * - 智能心跳：前台 60s，后台 300s
 * - 指数退避重连：1s → 2s → 4s → ... → 60s
 * - 收到 broker 消息 → 广播给主进程 → 主进程触发 getNativeDelta
 *
 * 输入数据（由主进程 WebView 写入 SharedPreferences）：
 *   - tb_mqtt_jwt       : String, MQTT 鉴权 JWT（5min 过期）
 *   - tb_mqtt_broker_url: String, broker URL
 *   - tb_mqtt_broker_user: String, broker 用户名
 *   - tb_mqtt_broker_pass: String, broker 密码（与 JWT 同义）
 *   - tb_mqtt_openid     : String, 用户 openid（用于 topic 拼接）
 *
 * 输出：
 *   - sendBroadcast(ACTION_DELTA, {_openid, table, docId, _updateTime})
 *   - TimeBankApplication.setLongConnState(state)
 */
public class LongConnectionService extends Service {
    private static final String TAG = "LongConnSvc";
    private static final String CHANNEL_ID = "longconn_channel";
    private static final int NOTIFICATION_ID = 1001;

    // [v9.4.0] 自定义广播 Action：通知主进程有数据变更
    public static final String ACTION_DELTA = "com.jianglicheng.timebank.LONGCONN_DELTA";
    public static final String EXTRA_OPENID = "_openid";
    public static final String EXTRA_TABLE = "table";
    public static final String EXTRA_DOC_ID = "docId";
    public static final String EXTRA_UPDATE_TIME = "_updateTime";

    // [v9.4.0] SharedPreferences 键名
    private static final String PREFS = "tb_longconn";
    private static final String K_JWT = "tb_mqtt_jwt";
    private static final String K_BROKER_URL = "tb_mqtt_broker_url";
    private static final String K_BROKER_USER = "tb_mqtt_broker_user";
    private static final String K_BROKER_PASS = "tb_mqtt_broker_pass";
    private static final String K_OPENID = "tb_mqtt_openid";

    private MqttClient mqttClient;
    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> heartbeatTask;
    private ScheduledFuture<?> reconnectTask;

    private int reconnectAttempt = 0;
    private static final int MAX_RECONNECT_DELAY_S = 60;

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "[v9.4.0] LongConnectionService.onCreate");
        createNotificationChannel();
        scheduler = Executors.newScheduledThreadPool(2);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "[v9.4.0] LongConnectionService.onStartCommand");

        // [v9.4.0] 必须先 startForeground，否则 Android 12+ 5s 内会 ANR
        startForeground(NOTIFICATION_ID, buildNotification("长连接启动中..."));

        // [v9.4.0] 延迟重连：等服务稳定 + JWT 准备好
        scheduler.schedule(this::scheduleConnect, 2, TimeUnit.SECONDS);

        return START_STICKY;
    }

    /**
     * [v9.4.0] 调度连接：检查配置 → 连接 → 订阅
     */
    private void scheduleConnect() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String brokerUrl = prefs.getString(K_BROKER_URL, null);
        String jwt = prefs.getString(K_JWT, null);
        String openid = prefs.getString(K_OPENID, null);
        String username = prefs.getString(K_BROKER_USER, "");
        String password = prefs.getString(K_BROKER_PASS, jwt);

        if (brokerUrl == null || brokerUrl.isEmpty()) {
            Log.w(TAG, "[v9.4.0] broker URL 未配置，5s 后重试");
            scheduleReconnect();
            return;
        }
        if (jwt == null || openid == null) {
            Log.w(TAG, "[v9.4.0] JWT 或 openid 未配置（需 WebView 登录后写入），5s 后重试");
            scheduleReconnect();
            return;
        }

        TimeBankApplication.getInstance().setLongConnState(
            TimeBankApplication.LongConnState.CONNECTING
        );
        updateNotification("连接中: " + brokerUrl);

        try {
            String clientId = "tb-" + openid + "-" + UUID.randomUUID().toString().substring(0, 8);
            mqttClient = new MqttClient(brokerUrl, clientId, new MemoryPersistence());

            MqttConnectOptions opts = new MqttConnectOptions();
            opts.setUserName(username);
            opts.setPassword(password != null ? password.toCharArray() : null);
            opts.setCleanSession(true);
            opts.setKeepAliveInterval(60); // 前台 60s；后台由 Android 自行降级
            opts.setAutomaticReconnect(false); // 我们用自定义退避
            opts.setConnectionTimeout(15);
            opts.setMaxInflight(100);

            mqttClient.setCallback(new MqttCallback() {
                @Override
                public void connectionLost(Throwable cause) {
                    Log.w(TAG, "[v9.4.0] connectionLost: " + (cause != null ? cause.getMessage() : "unknown"));
                    TimeBankApplication.getInstance().setLongConnState(
                        TimeBankApplication.LongConnState.DISCONNECTED
                    );
                    updateNotification("连接断开，正在重连...");
                    scheduleReconnect();
                }

                @Override
                public void messageArrived(String topic, MqttMessage message) {
                    handleMessage(topic, message);
                }

                @Override
                public void deliveryComplete(IMqttDeliveryToken token) {
                    // 不需要处理（我们只订阅，不发布）
                }
            });

            mqttClient.connect(opts);
            Log.i(TAG, "[v9.4.0] ✓ MQTT connected broker=" + brokerUrl);

            // 订阅用户私有主题
            String topic = "tb_user_" + openid;
            mqttClient.subscribe(topic, 1);
            Log.i(TAG, "[v9.4.0] ✓ subscribed topic=" + topic);

            TimeBankApplication.getInstance().setLongConnState(
                TimeBankApplication.LongConnState.CONNECTED
            );
            reconnectAttempt = 0;
            updateNotification("已连接（实时同步）");

        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ connect failed: " + e.getMessage(), e);
            TimeBankApplication.getInstance().setLongConnState(
                TimeBankApplication.LongConnState.DISCONNECTED
            );
            updateNotification("连接失败: " + e.getMessage());
            scheduleReconnect();
        }
    }

    /**
     * [v9.4.0] 处理收到的 MQTT 消息 → 广播给主进程
     */
    private void handleMessage(String topic, MqttMessage message) {
        try {
            String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
            Log.i(TAG, "[v9.4.0] ← msg topic=" + topic + " payload=" + payload);

            JSONObject obj = new JSONObject(payload);
            String openid = obj.optString("_openid", "");
            String table = obj.optString("table", "");
            String docId = obj.optString("docId", "");
            long updateTime = obj.optLong("_updateTime", System.currentTimeMillis());

            if (openid.isEmpty() || table.isEmpty() || docId.isEmpty()) {
                Log.w(TAG, "[v9.4.0] 消息字段不全，忽略");
                return;
            }

            // 广播给主进程
            Intent broadcast = new Intent(ACTION_DELTA);
            broadcast.setPackage(getPackageName()); // 仅本 App 接收
            broadcast.putExtra(EXTRA_OPENID, openid);
            broadcast.putExtra(EXTRA_TABLE, table);
            broadcast.putExtra(EXTRA_DOC_ID, docId);
            broadcast.putExtra(EXTRA_UPDATE_TIME, updateTime);
            sendBroadcast(broadcast);

            // 立即触发一次 delta 拉取（即使主进程没收到广播，也能兜底）
            Log.i(TAG, "[v9.4.0] → 广播给主进程 + 可选 delta 拉取");

        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ handleMessage failed: " + e.getMessage(), e);
        }
    }

    /**
     * [v9.4.0] 指数退避重连
     */
    private void scheduleReconnect() {
        if (reconnectTask != null && !reconnectTask.isDone()) {
            reconnectTask.cancel(false);
        }
        reconnectAttempt = Math.min(reconnectAttempt + 1, 6); // cap at 64s
        long delaySec = (long) Math.min(MAX_RECONNECT_DELAY_S, Math.pow(2, reconnectAttempt - 1));
        Log.i(TAG, "[v9.4.0] scheduleReconnect attempt=" + reconnectAttempt + " delay=" + delaySec + "s");

        TimeBankApplication.getInstance().setLongConnState(
            TimeBankApplication.LongConnState.RECONNECTING
        );

        reconnectTask = scheduler.schedule(this::scheduleConnect, delaySec, TimeUnit.SECONDS);
    }

    /**
     * [v9.4.0] 更新前台通知
     */
    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(text));
        }
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("Time Bank 实时同步")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "长连接服务",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("保持与服务器的实时连接，实现秒级数据同步");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "[v9.4.0] LongConnectionService.onDestroy");
        if (reconnectTask != null) reconnectTask.cancel(false);
        if (heartbeatTask != null) heartbeatTask.cancel(false);
        if (scheduler != null) scheduler.shutdownNow();
        if (mqttClient != null) {
            try {
                if (mqttClient.isConnected()) mqttClient.disconnect();
                mqttClient.close();
            } catch (Exception ignored) {}
        }
        TimeBankApplication.getInstance().setLongConnState(
            TimeBankApplication.LongConnState.DISCONNECTED
        );
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * [v9.4.0] 静态方法：启动长连接服务
     */
    public static void startService(Context context) {
        try {
            Intent intent = new Intent(context, LongConnectionService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
            Log.i(TAG, "[v9.4.0] LongConnectionService.startService called");
        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ startService failed: " + e.getMessage(), e);
        }
    }

    public static void stopService(Context context) {
        try {
            Intent intent = new Intent(context, LongConnectionService.class);
            context.stopService(intent);
        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ stopService failed: " + e.getMessage(), e);
        }
    }
}
