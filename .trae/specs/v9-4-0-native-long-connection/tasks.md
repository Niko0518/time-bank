# v9.4.0 Tasks（实施拆解）

> 本文件是给执行开发者（AI 或人类）的逐步任务清单。每个任务原子化、可单独验证。
> 用户决策（2026-06-13）：A 腾讯云 MQTT broker + 个推（Getui）PUSH + 阶段二跳一验（alpha+beta 一起、rc 单独）+ 联动修复 v9.3.3 + 版本号 v9.4.0

---

## Task Group A：服务端基础（最先做）
### A.1 创建 `tbConnectToken` 云函数
**文件**：[`cloudbase-functions/tbConnectToken/index.js`](file:///d:/TimeBank/cloudbase-functions/tbConnectToken/index.js)（新建）
**职责**：
- 验证 `context.OPENID`（必须已登录）
- 生成短时 token（JWT，TTL 5min）
- payload：`{ _openid, exp, iat, jti }`
- 密钥：环境变量 `MQTT_TOKEN_SECRET`
- 返回 `{ code: 0, token, expiresAt, broker? }`

### A.2 创建 `tbPushRelay` 云函数
**文件**：[`cloudbase-functions/tbPushRelay/index.js`](file:///d:/TimeBank/cloudbase-functions/tbPushRelay/index.js)（新建）
**职责**：
- 接收 `tbMutation` 内部 `notifyPushRelay()` 调用
- 查 `tb_profile.devicePushMap` 拿所有设备 clientId
- 若 `GETUI_*` 环境变量配置 → 调用个推 REST API 透传推送
- 若 `MQTT_BROKER_URL` 配置 → 预留发布接口（v9.4.1 实装）
- 任何失败仅日志，不影响主流程

### A.3 在 `tbMutation` 中集成 `notifyPushRelay()` 辅助函数
**文件**：[`cloudbase-functions/tbMutation/index.js`](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js)（修改）
**职责**：
- 顶部定义 `notifyPushRelay(table, docId, _openid)` 函数（fire-and-forget）
- 10 个写操作分支成功后调用：`addTransaction` / `updateTransaction` / `deleteTransaction` / `saveTask` / `deleteTask` / `startTask` / `stopTask` / `updateRunningTask` / `saveProfile`
- **不用 CloudBase 控制台 DB 触发器**（入口难找、限频 200 QPS、调试不便）

> 为什么不直接用 CloudBase 控制台 DB 触发器：①新版控制台触发器入口难找 ② 触发器单环境限频 200 QPS ③ 内嵌方式更可控（只对成功写发通知，对失败重试不发）

**验证**：
```bash
tcb fn deploy tbConnectToken --force
tcb fn invoke tbConnectToken --params '{}'
# 期望：{ code: 0, token: "eyJ...", expiresAt: 1234567890 }
```

### A.2 创建 `tbPushRelay` 云函数

**文件**：[`cloudbase-functions/tbPushRelay/index.js`](file:///d:/TimeBank/cloudbase-functions/tbPushRelay/index.js)（新建）

**职责**：
- 入参：`{ _openid, table, docId, _updateTime }`
- 用腾讯云 MQTT SDK（`mqtt-node-sdk`）连接 broker
- 向主题 `tb_user_${_openid}` 发布消息，payload = 入参
- 5s 内完成
- 失败时记日志返回 `{ code: 503 }`

**broker 配置**（环境变量）：
- `MQTT_BROKER_URL`：wss://your-broker.mqtt.qq.com:8084
- `MQTT_USERNAME` / `MQTT_PASSWORD`：服务端账号

**验证**：
```bash
tcb fn deploy tbPushRelay --force
```

### A.3 数据库触发器配置

**位置**：CloudBase 控制台 → 数据库 → 5 张表

**每张表添加触发器**：
- 事件：`doc.add` / `doc.update` / `doc.delete`
- 动作类型：调用云函数
- 云函数：`tbPushRelay`
- 传参：`{ _openid: doc._openid, table: <tableName>, docId: doc._id, _updateTime: doc._updateTime }`

**注意**：tb_profile 是单条记录（per _openid），用 `doc.update` 即可

---

## Task Group B：客户端基础（依赖与配置）

### B.1 build.gradle 新增依赖

**文件**：[`android_project/app/build.gradle`](file:///d:/TimeBank/android_project/app/build.gradle)

**新增**：
```gradle
dependencies {
    // [v9.4.0] MQTT 客户端
    implementation 'org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5'
    // [v9.4.0] 个推 PUSH SDK
    implementation 'com.getui:gtsdk:3.3.0.0'
}
```

### B.2 libs.versions.toml 新增

**文件**：[`android_project/gradle/libs.versions.toml`](file:///d:/TimeBank/android_project/gradle/libs.versions.toml)

**新增**：
```toml
[versions]
paho = "1.2.5"
getui = "3.3.0.0"

[libraries]
paho-mqtt = { group = "org.eclipse.paho", name = "org.eclipse.paho.client.mqttv3", version.ref = "paho" }
getui-gtsdk = { group = "com.getui", name = "gtsdk", version.ref = "getui" }
```

### B.3 AndroidManifest.xml 新增

**文件**：[`android_project/app/src/main/AndroidManifest.xml`](file:///d:/TimeBank/android_project/app/src/main/AndroidManifest.xml)

**新增权限**：
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```

**新增 service 声明**：
```xml
<service
    android:name=".LongConnectionService"
    android:process=":longconn"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

**新增个推 PUSH 元数据**：
```xml
<meta-data
    android:name="PUSH_APPID"
    android:value="${GETUI_APPID}" />
<meta-data
    android:name="PUSH_APPKEY"
    android:value="${GETUI_APPKEY}" />
<meta-data
    android:name="PUSH_APPSECRET"
    android:value="${GETUI_APPSECRET}" />
```

**在 `<application>` 标签加 `android:name=".TimeBankApplication"`**（如不存在）

---

## Task Group C：客户端核心（LongConnectionService）

### C.1 新建 TimeBankApplication

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java)（新建）

**职责**：
- 持有 `isForeground` 标志（v9.3.3 已有，扩展）
- 持有 `longConnectionState` 标志（DISCONNECTED / CONNECTING / CONNECTED / BACKOFF）
- 持有 `getuiPushRegistered` 标志
- 提供全局单例访问

### C.2 新建 LongConnectionService（核心）

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java)（新建）

**结构**：
```
LongConnectionService extends Service
├── onCreate
│   ├── createNotificationChannel
│   ├── loadMQTTConfig (SharedPreferences)
│   └── initGetuiPush (如未注册)
├── onStartCommand
│   ├── startForeground (dataSync FGS)
│   ├── scheduleConnect (调用 internal method)
│   └── return START_STICKY
├── internal: connect()
│   ├── tbConnectToken 云函数 → token
│   ├── MqttClient.connect(token)
│   ├── subscribe("tb_user_${_openid}")
│   └── setState(CONNECTED)
├── internal: smartHeartbeat()
│   ├── 根据设备状态计算间隔
│   ├── sendPing()
│   └── scheduleNext()
├── internal: reconnectWithBackoff()
│   ├── 计算延迟（指数退避）
│   └── scheduleConnect(延迟)
├── internal: onMessageReceived(msg)
│   ├── 解析 { table, docId, _updateTime }
│   ├── 写 SharedPreferences pending_native_delta
│   ├── sendBroadcast(NATIVE_DELTA_READY)
│   └── 若前台 → 立即注入
├── onDestroy
│   ├── mqttClient.disconnect()
│   └── 不取消 WorkManager 调度器
└── inner class: GetuiPushMessageHandler
    ├── onNewToken(token)
    └── onMessageReceived(msg)
        ├── 触发重连
        └── 拉差集
```

**MQTT 配置来源**（SharedPreferences `tb_long_conn`）：
- `mqtt_broker_url`
- `mqtt_client_id_prefix`（用 `deviceId + _openid` 拼接）
- `mqtt_topic`（`tb_user_${_openid}`）

**首次启动时**：
- 若 SharedPreferences 无配置 → 调 `tbConnectToken` 获取 broker 配置
- 配置保存到 SharedPreferences

### C.3 新建 GetuiPushService（如需要）

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java)（新建）

**职责**：
- 继承个推 PUSH 的 `GTIntentService`
- 处理 `onReceiveClientId(Context, String clientId)`：上报到 `tbMutation.registerPushClientId`
- 处理 `onReceiveMessageData(Context, GTTransmitMessage msg)`：解析 payload，调用 LongConnectionService 的 `onPushWake` 触发重连+拉差集

---

## Task Group D：v9.3.3 bug 修复

### D.1 timebankSync 云函数加 `getNativeDelta` action

**文件**：[`cloudbase-functions/timebankSync/index.js`](file:///d:/TimeBank/cloudbase-functions/timebankSync/index.js)

**修改**：在 switch 中加 `getNativeDelta` case（详细代码见 spec.md 改造 6.1）

**部署**：
```bash
tcb fn deploy timebankSync --force
```

### D.2 `__onNativeCloudDelta` 补齐合并

**文件**：[`android_project/app/src/main/assets/www/js/app-1.js`](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)

**修改**：tasks / profiles / dailies 改为实际调用合并函数（不是仅记录日志）

**新增函数**（如不存在）：
- `applyProfileDelta(profileDoc)`
- `mergeDailyDelta(dailyDocs)`

### D.3 CloudSyncScheduler 修复

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)

**修改**：
- `CLOUDBASE_FUNCTION_URL` 改为动态配置（从 BuildConfig 读）
- `getPendingDelta` 兼容 v9.4.0 的 LongConnectionService 写入格式
- 失败时不再 retry 时打印 "action 不存在" 错误（因为已修复）

---

## Task Group E：JS 端监控状态

### E.1 index.html 监控状态显示器扩展

**文件**：[`android_project/app/src/main/assets/www/index.html`](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)

**新增 DOM**：
```html
<div class="watch-status-item">
    <span class="watch-status-label">原生长连接:</span>
    <span id="longConnStatus" class="watch-status-value">⚪ 未启动</span>
</div>
<div class="watch-status-item">
    <span class="watch-status-label">个推 PUSH:</span>
    <span id="getuiPushStatus" class="watch-status-value">⚪ 未注册</span>
</div>
```

### E.2 JS 轮询更新

**文件**：[`android_project/app/src/main/assets/www/js/app-1.js`](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)

**新增**：
```js
// [v9.4.0] 长连接状态轮询
setInterval(() => {
    const el = document.getElementById('longConnStatus');
    if (!el || !window.Android?.getLongConnectionState) return;
    const state = window.Android.getLongConnectionState();
    el.innerHTML = ({
        'CONNECTED': '🟢 已连接',
        'CONNECTING': '🟡 连接中',
        'BACKOFF': '🟡 重连中',
        'DISCONNECTED': '🔴 断开'
    })[state] || '⚪ 未知';
}, 5000);

// [v9.4.0] 个推 PUSH 状态轮询
setInterval(() => {
    const el = document.getElementById('getuiPushStatus');
    if (!el || !window.Android?.getGetuiPushState) return;
    el.innerHTML = window.Android.getGetuiPushState()
        ? '📱 已注册'
        : '⚪ 未注册';
}, 30000);
```

### E.3 WebAppInterface 新增桥方法

**文件**：[`android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)

**新增**：
```java
@JavascriptInterface
public String getLongConnectionState() {
    return TimeBankApplication.getInstance().getLongConnectionState();
}

@JavascriptInterface
public boolean getGetuiPushState() {
    return TimeBankApplication.getInstance().isGetuiPushRegistered();
}
```

---

## Task Group F：版本号同步（9 处）

与 checklist Phase 6 一一对应。

---

## Task Group G：实机验证（2 个里程碑）

### G.1 alpha 验证（v9.4.0-alpha APK）

用户安装后验证：
- [ ] App 启动后 `dumpsys jobscheduler` 看到 `:longconn` 进程
- [ ] 监控状态显示 🟢 已连接
- [ ] 设备 A 改数据 → 设备 B（前台）3s 内收到
- [ ] logcat 看到 `LongConnectionService` 启动 + MQTT 连接成功
- [ ] 切到后台 5min，回到前台 ≤ 1s 收到差集

### G.2 beta 验证（v9.4.0-beta APK）

用户安装后验证：
- [ ] 设备 A 改数据 → 设备 B（后台）3s 内收到（依赖个推 PUSH）
- [ ] 深 Doze + 息屏 1h，回到前台 ≤ 3s 收到差集
- [ ] 失败队列 24h 后 ≤ 5
- [ ] 长跑 24h，无内存泄漏
- [ ] v9.3.3 logcat 看到 `Worker 成功`（证明 v9.3.3 bug 已修）

### G.3 rc 验证（v9.4.0-rc APK）

用户安装前手动试：
- [ ] 灰度发布给 10% 用户
- [ ] 连续 7 天无 P0/P1 问题
- [ ] APK 体积增加 ≤ 2MB

---

## 实施纪律

- **每完成 1 个 Task Group 停下来让用户安装真机测试**
- **每个 Task 的 diff 控制在 1 个文件 + ≤ 200 行**（LongConnectionService 除外）
- **任何引入"启动期新网络调用"的尝试**都需明确失败处理（v9.3.1/v9.3.3 教训）
- **MQTT 连接必须 try/catch + 指数退避**，避免连接风暴
- **个推 PUSH 注册失败不能阻塞 App 启动**（try/catch + log 即可）
