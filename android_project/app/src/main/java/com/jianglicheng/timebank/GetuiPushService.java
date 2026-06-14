package com.jianglicheng.timebank;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.IBinder;
import android.util.Log;

import com.igexin.sdk.GTIntentService;
import com.igexin.sdk.PushManager;
import com.igexin.sdk.message.GTCmdMessage;
import com.igexin.sdk.message.GTNotificationMessage;
import com.igexin.sdk.message.GTTransmitMessage;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

/**
 * [v9.4.0] 个推 PUSH 透传接收服务
 *
 * 职责：
 * - 个推 SDK 启动后，broker 端推送的"透传消息"会路由到这里
 * - 透传消息内容 = tbPushRelay 写入的 `{_openid, table, docId, _updateTime}`
 * - 收到后，调用 LongConnectionService 内部的 MQTT 发布能力
 *   （如果 broker 未配置，则广播给主进程，主进程走 getNativeDelta 兜底）
 *
 * 关键点：
 * - 必须继承 GTIntentService（个推 SDK 要求）
 * - 在 manifest 中导出 false（系统内部调用）
 * - 个推 AppID/AppKey/AppSecret 通过 manifest meta-data 注入
 * - 父类方法签名（新 SDK 3.3.x）首参为 Context
 */
public class GetuiPushService extends GTIntentService {
    private static final String TAG = "GetuiPushService";
    private static final String PREFS = "tb_longconn";
    private static final String K_GETUI_CLIENT_ID = "getui_client_id";

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "[v9.4.0] GetuiPushService.onCreate (SDK 初始化由 TimeBankApplication.onCreate 完成，此处只打印)");

        // [v9.4.0] SDK 初始化已移到 TimeBankApplication.onCreate（避免重复）
        // 此处只做 SDK 上下文绑定，确保个推 PUSH 通道连通
        try {
            ApplicationInfo ai = getPackageManager().getApplicationInfo(
                getPackageName(), PackageManager.GET_META_DATA
            );
            String appId = ai.metaData != null ? ai.metaData.getString("PUSH_APPID") : null;
            Log.i(TAG, "[v9.4.0] GetuiPushService 配置确认: appId=" + (appId != null ? appId.substring(0, 6) + "..." : "null"));
        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ GetuiPushService 配置读取失败: " + e.getMessage(), e);
        }
    }

    /**
     * [v9.4.0] 透传消息接收（核心）
     * 注：父类签名 3.3.x 为 onReceiveMessageData(Context, GTTransmitMessage)
     */
    @Override
    public void onReceiveMessageData(Context context, GTTransmitMessage msg) {
        try {
            byte[] payload = msg.getPayload();
            if (payload == null) {
                Log.w(TAG, "[v9.4.0] PUSH 消息 payload 为空");
                return;
            }
            String jsonStr = new String(payload, StandardCharsets.UTF_8);
            Log.i(TAG, "[v9.4.0] ← PUSH 透传: " + jsonStr);

            JSONObject obj = new JSONObject(jsonStr);
            String openid = obj.optString("_openid", "");
            String table = obj.optString("table", "");
            String docId = obj.optString("docId", "");
            long updateTime = obj.optLong("_updateTime", System.currentTimeMillis());

            if (openid.isEmpty() || table.isEmpty() || docId.isEmpty()) {
                Log.w(TAG, "[v9.4.0] PUSH 消息字段不全，忽略");
                return;
            }

            // [v9.4.0] 累加 PUSH 接收计数（UI 显示用）
            if (TimeBankApplication.getInstance() != null) {
                TimeBankApplication.getInstance().incrementGetuiPushReceived();
            }

            // [v9.4.0] 唤醒长连接进程（如果未在运行）
            LongConnectionService.startService(this);

            // [v9.4.0] 同时广播给主进程（兜底：MQTT 未连接时也能拉数据）
            Intent broadcast = new Intent(LongConnectionService.ACTION_DELTA);
            broadcast.setPackage(getPackageName());
            broadcast.putExtra(LongConnectionService.EXTRA_OPENID, openid);
            broadcast.putExtra(LongConnectionService.EXTRA_TABLE, table);
            broadcast.putExtra(LongConnectionService.EXTRA_DOC_ID, docId);
            broadcast.putExtra(LongConnectionService.EXTRA_UPDATE_TIME, updateTime);
            sendBroadcast(broadcast);

            Log.i(TAG, "[v9.4.0] ✓ PUSH 唤醒 + 广播完成: " + table + "#" + docId.substring(0, Math.min(8, docId.length())));

        } catch (Exception e) {
            Log.e(TAG, "[v9.4.0] ✗ onReceiveMessageData failed: " + e.getMessage(), e);
        }
    }

    /**
     * [v9.4.0] 个推 clientId 注册成功回调
     */
    @Override
    public void onReceiveClientId(Context context, String clientId) {
        Log.i(TAG, "[v9.4.0] ✓ 个推 clientId = " + clientId);

        // 存到 SharedPreferences
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(K_GETUI_CLIENT_ID, clientId)
            .apply();

        // 通知 TimeBankApplication
        if (TimeBankApplication.getInstance() != null) {
            TimeBankApplication.getInstance().setGetuiClientId(clientId);
        }

        // [v9.4.0] 调 tbMutation.registerPushClientId 上报到云端
        // 由 WebView 主进程在下次登录时统一上传（更安全）
        // 此处仅暂存
    }

    @Override
    public void onReceiveOnlineState(Context context, boolean online) {
        Log.i(TAG, "[v9.4.0] 个推在线状态: " + online);
    }

    @Override
    public void onReceiveCommandResult(Context context, GTCmdMessage cmdMessage) {
        Log.i(TAG, "[v9.4.0] 个推命令结果: " + cmdMessage.getAction());
    }

    @Override
    public void onNotificationMessageArrived(Context context, GTNotificationMessage msg) {
        Log.i(TAG, "[v9.4.0] 通知消息到达: " + msg.getTitle());
    }

    @Override
    public void onNotificationMessageClicked(Context context, GTNotificationMessage msg) {
        Log.i(TAG, "[v9.4.0] 通知消息被点击: " + msg.getTitle());
    }
}

