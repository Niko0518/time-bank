# v9.4.0 原生层独立进程长连接 + 个推 PUSH Spec

> 版本号: v9.4.0
> 制定日期: 2026-06-13
> 状态: **待用户审阅，未实施**
> 上游 spec: v9.3.3 (CloudSyncScheduler) / v9.0.0 (callMutation 架构)

---

## Why

### 用户原话
> "我希望该软件实现社交通信软件、甚至是游戏级别的同步反应速度。为什么我经历了几百次调整，都无法做到"

### 现状产品级症状
- 用户从后台切回前台，经常看到"几小时未同步"状态
- 监控状态显示 "保活中xxx（几百）/8"（累积失败 / 当前重试次数）
- KeepAliveService 通知栏常驻，但**保活不等于同步**——后台期间几乎不工作
- v9.0.0 之后"重构过"但 sync 体验没有质变

### 现状技术级根因（已被本次调研证实）

#### 根因 1: 整个网络层在 WebView 的 JS 里
[CloudSyncScheduler.java#L230-289](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java) 的 `doWork()` 行为：
```java
reqBody.addProperty("action", "getNativeDelta");  // ← 调用云函数
```
但 [timebankSync/index.js#L89](file:///d:/TimeBank/cloudbase-functions/timebankSync/index.js#L89) 的 switch：
```javascript
default: return { code: 400, message: `未知操作: ${action}` };
```
**`timebankSync` 云函数根本没有 `getNativeDelta` action**。Worker 一直收到 `code: 400`，持续 `Result.retry()`。**v9.3.3 整个原生层兜底链路从未成功过一次**。

#### 根因 2: 修复后仍然不够
即使 v9.3.3 的 bug 修复了（云函数加 `getNativeDelta` + 5 张表差集），WorkManager 周期任务**最低 15min 间隔**，**远不是"社交通信级"**（社交通信级 = 秒级）。

#### 根因 3: 行业共识
参考 [Android 官方 - 针对低电耗模式和应用待机模式进行优化](https://android-docs.cn/training/monitoring-device-state/doze-standby)：
> "如果您的应用需要使用消息功能与后端服务集成……强烈建议您使用 FCM 而无需保持你自己的持久网络连接，FCM 经过优化，适用于低电耗模式和应用待机模式。"

参考 [腾讯 Mars 智能心跳 + 美团 Shark 长连接体系](https://blog.csdn.net/guojin08/article/details/92637980)：
- 微信、QQ、美团长连接**全部跑在独立 Java 进程**
- 前台服务被收紧（Android 14+ `dataSync` 类型 FGS；Android 15 起 6h 硬限）
- 必须有 push 通道兜底

#### 根因 4: 旧路径降级不充分
当前 JS 层的 `setInterval` / `setTimeout` / `CloudBase SDK Watch` / `visibilitychange` / `self-healing probe` **5 条路径全在 WebView 进程里**。WebView 进程被 Doze 视为"普通应用"，这 5 条路径在后台都被冻结。几百次失败就来源于此。

### Why Now
- 用户在 v9.0.0 之后已经付出 9 次迭代（v9.0.10 → v9.3.3），问题没有质变
- 用户明确要求"社交通信/游戏级"
- 在 WebView/JS 层继续打补丁**永远做不到**（架构性死局）
- 必须把网络层搬到原生层 + push 通道

---

## What Changes

### 决策记录（用户拍板）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 推送网关 | **A. 腾讯云 MQTT** | 免运维、有 SLA、接入快 |
| **PUSH 通道** | **个推（Getui）** | 1 个 SDK 覆盖国内所有厂商（荣耀/华为/小米/OPPO/VIVO/魅族）、免费版够用、账号注册小时级 |
| 发版节奏 | **alpha + beta 一起验，rc 单独** | 阶段二跳一验（折中） |
| v9.3.3 bug 联动修复 | **是** | 半个 1 天工作量，避免污染 |
| 版本号 | **v9.4.0** | 用户确认 |

### 改造 1（服务端 P0）：云函数内集成"伪触发器" → 腾讯云 MQTT + 个推 PUSH

**位置**：[`cloudbase-functions/tbMutation/index.js`](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js) 内 `notifyPushRelay()` 辅助函数

**每张表（事务/任务/运行中/Profile）写操作成功后**：
- 客户端调用 `tb.callFunction({ name: 'tbMutation', data: { action: 'xxx', ... } })`
- 云函数在 10 个写操作分支（`addTransaction` / `updateTransaction` / `deleteTransaction` / `saveTask` / `deleteTask` / `startTask` / `stopTask` / `updateRunningTask` / `saveProfile`）成功后**异步**调用 `notifyPushRelay(table, docId, _openid)`
- `notifyPushRelay` 内：`app.callFunction({ name: 'tbPushRelay', data: { _openid, table, docId, _updateTime } })`
- `tbPushRelay` 内：① 查 tb_profile.devicePushMap 拿 clientId；② 调用个推 REST API 推送透传（可选）；③ 预留 MQTT 通道（v9.4.1 实装）
- 主题订阅鉴权：客户端连接时携带 `_openid` + 短时 token，token 由 `tbConnectToken` 云函数签发

**为什么用"内嵌触发器"而不是 CloudBase 控制台 DB 触发器**：
- CloudBase 文档型 DB 触发器**只能通过控制台配置**，无 CLI/API；新版控制台入口难找
- 触发器单环境限频 200 QPS，写热点场景不够
- 内嵌方式粒度更细（可以只对成功的写发通知，不对失败重试发）
- 调试方便（云函数日志能直接看到推送链路）

**需要新建的云函数**：
| 函数 | 用途 | 超时 |
|------|------|------|
| `tbConnectToken` | 签发 MQTT 短时 token（5min） | 5s |
| `tbPushRelay` | 接收通知，relay 到 MQTT + 个推 PUSH | 10s |

**成本**：腾讯云 MQTT 按连接数计费，个人版 ≈ ¥0.27/百万消息，按用户量预估月成本 < ¥10。

### 改造 2（客户端 P0）：LongConnectionService（独立进程）

**位置**：[`android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java)（新建）

**Manifest 声明**：
```xml
<service
    android:name=".LongConnectionService"
    android:process=":longconn"
    android:foregroundServiceType="dataSync"
    android:exported="false" />
```

**权限**：
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```

**核心职责**：
- 维护 WSS / MQTT 长连接（独立进程，不受 WebView 生命周期影响）
- 智能心跳 FSM（25s/45s/不发，Doze 自适应）
- 指数退避重连（1s → 60s 封顶）
- 网络切换检测（`ConnectivityManager.NetworkCallback`）
- 收到差集 → 写 SharedPreferences `pending_native_delta` + 广播 `NATIVE_DELTA_READY`

### 改造 3（客户端 P0）：WSS / MQTT 客户端

**位置**：同上文件内嵌 `LongConnectionClient` 内部类

**选型决策**：
| 方案 | 选 / 不选 | 理由 |
|------|----------|------|
| **腾讯云 MQTT（EMQX 兼容）** | ✅ 选 | 服务端已选 MQTT；客户端用 `org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5`（成熟、稳定） |
| OkHttp WebSocket | 备选 | 若 MQTT 走不通降级到 WSS |

**FSM 状态**：
```
DISCONNECTED → CONNECTING → CONNECTED ⇄ PING_PONG → RECEIVING_DELTA
                ↓ 失败        ↓ 断开
              BACKOFF ←────── 重连
```

**智能心跳**：
| 设备状态 | 心跳间隔 |
|----------|----------|
| 前台 + 亮屏 | 25s |
| 后台 + 联网 | 45s |
| 深 Doze + 息屏 | **不发**（靠个推 PUSH 唤起） |
| 充电 + WiFi | 30s |

**指数退避**：1s → 2s → 4s → 8s → 16s → 32s → 60s（封顶）

### 改造 4（客户端 P0）：与 WebView 协作

| 节点 | 流程 |
|------|------|
| LongConnectionService 收到差集 | 1) 写 SharedPreferences `pending_native_delta` 2) 发广播 `NATIVE_DELTA_READY` |
| MainActivity.onResume | 1) `getPendingDelta` 拉 SharedPreferences 2) `evaluateJavascript` 注入 WebView |
| MainActivity 在前台时收到广播 | 直接注入 WebView |
| MainActivity.onPause | 注销广播接收器（避免后台唤醒） |
| WebAppInterface | 复用 v9.3.3 已有 4 个桥方法 |

### 改造 5（客户端 P0）：个推 PUSH 通道

**目标**：深 Doze + 息屏时，长连接不可达，**用个推 PUSH 唤起进程**。

**为什么选个推**：
- 1 个 SDK 覆盖国内所有 Android 厂商（荣耀/华为/小米/OPPO/VIVO/魅族）
- 不需要逐厂商注册开发者账号（个推账号 1 小时审核）
- 免费版推送额度够个人使用
- 推送通道不依赖 GMS

**实施步骤**：
1. 注册个推开发者账号（[www.getui.com](https://www.getui.com)）
2. 创建应用、获取 AppID/AppSecret/Master Secret
3. 集成个推 SDK（`com.getui:gtsdk:3.3.0.0+` 或更新）
4. 配置 `AndroidManifest.xml`：
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
5. 在 `TimeBankApplication.onCreate` 中初始化个推 SDK
6. 在 `LongConnectionService` 中实现 `GTIntentService`（处理透传消息）
7. 收到个推 PUSH → 检查 MQTT 长连接状态 → 若断开则重连 + 拉差集

**PUSH 触发时机**（服务端）：
- tbPushRelay 发布 MQTT 消息后，**同时**调用个推 REST API 发送"数据更新"通知
- 通知 payload：`{ _openid, table, docId, _updateTime }`
- 客户端收到 PUSH → 拉差集（不强制全拉，按 _updateTime > lastSyncAt 增量）

**个推 REST API 调用**（tbPushRelay 内）：
```javascript
const https = require('https');
const pushPayload = {
    message: { appkey: process.env.GETUI_APPKEY, transmission: { template_id: "your_template_id", transmission_content: JSON.stringify({ _openid, table, docId, _updateTime }) } },
    cid: clientIdForOpenid, // 需要先通过个推 API 查询 _openid 对应的 clientId
    push: { push_channel: "DefaultChannel" }
};
// POST https://restapi.getui.com/v2/${GETUI_APPID}/push/single/cid
```

**clientId 映射**：
- 客户端 SDK 首次启动时获取个推 clientId
- 客户端调用 `tbMutation` action `registerPushClientId` 写入 tb_profile.devicePushMap
- 服务端 tbPushRelay 查询 devicePushMap 获取 clientId

### 改造 6（客户端 P0）：v9.3.3 bug 修复（联动）

#### 6.1 云函数加 `getNativeDelta` action
**位置**：[`cloudbase-functions/timebankSync/index.js`](file:///d:/TimeBank/cloudbase-functions/timebankSync/index.js)

**新增 case**：
```javascript
case 'getNativeDelta': {
    const { lastSyncAt = 0 } = data;
    const PAGE_SIZE = 100;
    const tables = ['tb_transaction', 'tb_running', 'tb_task', 'tb_daily', 'tb_profile'];
    const result = { transactions: [], running: [], tasks: [], profiles: [], dailies: [], maxUpdateTime: 0 };
    
    for (const tbl of tables) {
        let cursor = new Date(Number(lastSyncAt));
        while (true) {
            const q = await db.collection(tbl).where({
                _openid: uid,
                _updateTime: _.gt(cursor)
            }).orderBy('_updateTime', 'asc').limit(PAGE_SIZE).get();
            
            const items = q.data.map(d => ({...d, _table: tbl}));  // 标 _table
            if (tbl === 'tb_transaction') result.transactions = result.transactions.concat(items);
            else if (tbl === 'tb_running') result.running = result.running.concat(items);
            else if (tbl === 'tb_task') result.tasks = result.tasks.concat(items);
            else if (tbl === 'tb_daily') result.dailies = result.dailies.concat(items);
            else if (tbl === 'tb_profile') result.profiles = result.profiles.concat(items);
            
            for (const it of items) {
                if ((it._updateTime?.getTime?.() || 0) > result.maxUpdateTime) {
                    result.maxUpdateTime = it._updateTime.getTime();
                }
            }
            if (items.length < PAGE_SIZE) break;
            cursor = items[items.length - 1]._updateTime;
        }
    }
    
    return { code: 0, delta: result, serverTime: Date.now() };
}
```

#### 6.2 `__onNativeCloudDelta` 补齐合并
**位置**：[`js/app-1.js`](file:///d:/TimeBank/js/app-1.js)

**当前 bug**：tasks / profiles / dailies 只"记录日志不合并"。**改为调用现有 merge 函数**：
- `mergeTransactionDelta`（已有）
- `mergeRunningDelta`（已有）
- `mergeTasksSmart`（已有）
- `mergeDailyDelta`（**需新增**，参考 v9.1.0 dailyChanges 推送逻辑）
- `applyProfileDelta`（**需新增**）

### 改造 7（客户端 P1）：旧路径降级

| 旧机制 | v9.4.0 角色 |
|--------|-------------|
| CloudBase SDK Watch（5 张表 onChange） | **降级为前台补漏**（已收的实时事件保留） |
| 20s JS 心跳（`__startWatchHeartbeat`） | **保留**（前台时仍有用） |
| 60s 自愈探针（`__startWatchSelfHealingProbe`） | **保留**（双保险） |
| 10s/30s `startActiveSync` setInterval | **前台保留**，**后台禁用**（v9.3.3 WorkManager 兜底） |
| visibilitychange always-reconcile | **保留**（前台兜底） |
| WorkManager 周期 15min（v9.3.3 CloudSyncScheduler） | **保留修复**（push 不可达时兜底） |
| KeepAliveService | **启动 LongConnectionService** |

### 改造 8（客户端 P1）：监控状态显示器

**位置**：[`index.html`](file:///d:/TimeBank/index.html) 监听状态显示器

**新增显示项**：
- 🟢 `原生长连接：已连接`（WSS/MQTT CONNECTED）
- 🟡 `原生长连接：重连中`（BACKOFF）
- 🔴 `原生长连接：断开`（DISCONNECTED > 30s）
- ⚪ `原生长连接：未启动`
- 📱 `个推 PUSH：已注册 / 未注册`

**调用 `window.Android.getLongConnectionState()` + `window.Android.getGetuiPushState()` 实时反映**。

### 改造 9：版本号同步（9 处）

`v9.3.3` → `v9.4.0`：
- `app-1.js:14` `APP_VERSION`
- `app-1.js:1-12` 启动日志注释
- `index.html:12` `<title>`
- `index.html:201` `.version-subtitle` → "TimeBank v9.4.0 · 原生长连接 + 个推推送"
- `index.html:1346` 关于页版本号
- `index.html:1405` 用户日志新增 v9.4.0 条目
- `sw.js:1` 注释
- `sw.js:6` `CACHE_NAME`
- `build.gradle:15-16` `versionCode 52 → 53`, `versionName "9.3.3" → "9.4.0"`

---

## Impact

### Affected specs
- v9.3.3（bug 修复联动）
- v9.0.0（callMutation 架构与新链路协同）
- v9.0.10（Watch 降级状态机扩展为长连接状态机）
- v9.0.11（修复链路被原生层替代）
- v9.0.12（onChange 心跳被原生层替代）
- v9.2.2（Watch 生命周期被扩展到 LongConnectionService）
- v9.3.1（睡眠云同步与新链路协同）

### Affected code

**新增**：
- [`android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java)
- [`android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java)（如不存在）
- [`android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java)
- [`cloudbase-functions/tbConnectToken/index.js`](file:///d:/TimeBank/cloudbase-functions/tbConnectToken/index.js)
- [`cloudbase-functions/tbPushRelay/index.js`](file:///d:/TimeBank/cloudbase-functions/tbPushRelay/index.js)

**修改**：
- [`android_project/app/src/main/AndroidManifest.xml`](file:///d:/TimeBank/android_project/app/src/main/AndroidManifest.xml)（+ LongConnectionService 声明 + 个推元数据）
- [`android_project/app/build.gradle`](file:///d:/TimeBank/android_project/app/build.gradle)（+ paho mqtt + 个推 SDK）
- [`android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java)（启动 LongConnectionService）
- [`android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java)（onResume 拉长连接差集）
- [`android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java`](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)（+ 2 个桥方法）
- [`cloudbase-functions/timebankSync/index.js`](file:///d:/TimeBank/cloudbase-functions/timebankSync/index.js)（+ `getNativeDelta` case）
- [`js/app-1.js`](file:///d:/TimeBank/js/app-1.js)（`__onNativeCloudDelta` 补齐合并 + 监控状态）
- [`js/app-auth.js`](file:///d:/TimeBank/js/app-auth.js)（visibilitychange 协调）
- [`index.html`](file:///d:/TimeBank/index.html)（9 处版本号 + 监控状态 UI）

**两端同步**：
- `android_project/app/src/main/assets/www/js/app-1.js` ↔ `js/app-1.js`
- `android_project/app/src/main/assets/www/js/app-auth.js` ↔ `js/app-auth.js`
- `android_project/app/src/main/assets/www/index.html` ↔ `index.html`
- `android_project/app/src/main/assets/www/sw.js` ↔ `sw.js`

### Cost

| 项目 | 估算 |
|------|------|
| 腾讯云 MQTT 个人版 | ¥0.27/百万消息，月 < ¥10 |
| 个推开发者账号 | 免费（小时级审核） |
| 个推推送额度 | 免费版够个人（< 500 万/天） |
| 服务端云函数调用 | 5 张表 × 每次写入 1 次 = tbPushRelay 调用，月 < ¥5 |
| 客户端 APK 体积增加 | paho mqtt ~500KB + 个推 SDK ~1.5MB |

---

## ADDED Requirements

### Requirement: 端到端推送链路（v9.4.0 核心）

The system SHALL establish a server-to-client push pipeline that delivers data changes within 3 seconds, **independent of WebView lifecycle**.

#### Scenario: 1.1 数据变更触发推送
- **WHEN** tb_transaction / tb_running / tb_task / tb_daily / tb_profile 任一表有 add/update/delete
- **THEN** 数据库触发器调 `tbPushRelay` 云函数
- **AND** `tbPushRelay` 发布 MQTT 消息到 `tb_user_${_openid}` 主题
- **AND** 5 秒内完成

#### Scenario: 1.2 客户端接收推送
- **WHEN** LongConnectionService 收到 MQTT 消息 `{ table, docId, _updateTime }`
- **THEN** 写 SharedPreferences `pending_native_delta`（合并去重）
- **AND** 发广播 `NATIVE_DELTA_READY`
- **AND** 若 App 在前台 → 立即注入 WebView
- **AND** 若 App 在后台 → 仅暂存，下次前台时注入

#### Scenario: 1.3 前台时立即同步
- **WHEN** MainActivity.onResume 触发
- **THEN** 拉 `getPendingDelta` 注入 WebView
- **AND** 调用 `window.__applyNativeCloudDelta(delta)`
- **AND** 调 `__onNativeCloudDelta` 完成 ≤ 1s

#### Scenario: 1.4 后台时仅暂存
- **WHEN** MainActivity.onPause 触发
- **THEN** 注销 NATIVE_DELTA_READY 广播接收器
- **AND** LongConnectionService 继续在独立进程运行
- **AND** 差集继续写入 SharedPreferences

### Requirement: 原生层独立进程长连接

The system SHALL maintain a persistent network connection in an **independent Android process** (`:longconn`), decoupled from WebView lifecycle.

#### Scenario: 2.1 进程独立
- **THEN** `LongConnectionService` 声明在 `android:process=":longconn"`
- **AND** 独立进程被杀不影响主进程
- **AND** 主进程被杀不影响长连接进程

#### Scenario: 2.2 前台服务类型
- **THEN** `foregroundServiceType="dataSync"`
- **AND** 包含 `FOREGROUND_SERVICE_DATA_SYNC` 权限
- **AND** KeepAliveService 启动 LongConnectionService 后，**两个前台服务并存**

#### Scenario: 2.3 智能心跳
- **WHEN** 设备前台 + 亮屏
- **THEN** 心跳间隔 25s
- **WHEN** 设备后台 + 联网
- **THEN** 心跳间隔 45s
- **WHEN** 设备深 Doze + 息屏
- **THEN** **不发心跳**（依赖个推 PUSH 唤起）
- **WHEN** 充电 + WiFi
- **THEN** 心跳间隔 30s

#### Scenario: 2.4 指数退避重连
- **WHEN** 长连接断开
- **THEN** 重连间隔 1s → 2s → 4s → 8s → 16s → 32s → 60s（封顶）
- **AND** 网络恢复时（`ConnectivityManager.NetworkCallback.onAvailable`）立即重连

#### Scenario: 2.5 网络切换检测
- **WHEN** 网络从 WiFi 切到移动 / 反之
- **THEN** 立即断开旧连接并重连
- **AND** 走新网络的重连逻辑

### Requirement: 个推 PUSH 通道（v9.4.0）

The system SHALL integrate 个推 (Getui) SDK to wake up the process during deep Doze, **without requiring the user to bring the app to foreground**.

#### Scenario: 3.1 SDK 集成
- **THEN** `build.gradle` 包含 `com.getui:gtsdk:3.3.0.0+`
- **AND** `AndroidManifest.xml` 配置 `PUSH_APPID` / `PUSH_APPKEY` / `PUSH_APPSECRET` 元数据
- **AND** `TimeBankApplication.onCreate` 初始化个推 SDK

#### Scenario: 3.2 透传消息处理
- **WHEN** 收到个推 PUSH 透传消息 `{ _openid, table, docId, _updateTime }`
- **THEN** 检查 LongConnectionService 连接状态
- **AND** 若连接断开 → 触发重连
- **AND** 重连成功后自动拉取差集

#### Scenario: 3.3 PUSH 触发率验证
- **WHEN** App 后台 + 息屏 + 深 Doze 中
- **THEN** 个推 PUSH 成功率 ≥ 90%（含荣耀/华为/小米/OPPO/VIVO/魅族）
- **AND** 长连接不在线时 PUSH 唤起后 ≤ 5s 完成同步

#### Scenario: 3.4 clientId 注册
- **WHEN** 客户端首次获取个推 clientId
- **THEN** 调用 `tbMutation.registerPushClientId({ deviceId, clientId })` 写入 tb_profile
- **AND** tbPushRelay 通过 clientId 定向推送

### Requirement: v9.3.3 bug 修复

The system SHALL fix the v9.3.3 native sync layer that has been silently broken.

#### Scenario: 4.1 云函数 action 缺失
- **WHEN** `CloudSyncWorker` 调 `timebankSync` action: `getNativeDelta`
- **THEN** 云函数返回 `{ code: 0, delta: {...5 张表...} }`
- **AND** 不再返回 `code: 400`

#### Scenario: 4.2 `__onNativeCloudDelta` 补齐合并
- **WHEN** 收到原生层差集 `delta.tasks / delta.profiles / delta.dailies`
- **THEN** 调用 `mergeTasksSmart(delta.tasks)`（已有）
- **AND** 调用 `applyProfileDelta(delta.profiles[0])`（**新增**）
- **AND** 调用 `mergeDailyDelta(delta.dailies)`（**新增**）
- **AND** 不再仅"记录日志"

### Requirement: 监控状态显示器

The system SHALL display native long connection and 个推 PUSH status in real-time.

#### Scenario: 5.1 长连接状态
- **THEN** 显示 🟢 / 🟡 / 🔴 / ⚪ 对应 4 个状态
- **AND** 5s 轮询一次 `window.Android.getLongConnectionState()`

#### Scenario: 5.2 个推 PUSH 状态
- **THEN** 显示 📱 个推 PUSH 已注册 / 未注册
- **AND** 30s 轮询一次 `window.Android.getGetuiPushState()`

### Requirement: 版本号更新至 v9.4.0

所有 9 个位置的版本号 MUST 更新为 `v9.4.0`。

---

## MODIFIED Requirements

### Requirement: KeepAliveService 职责（v7.36.2）

v7.36.2 的 KeepAliveService 仅保活 WebView 进程。v9.4.0 **扩展**：
- 启动时调用 `LongConnectionService.start(this)` 启动独立进程长连接
- 监听 `LongConnectionService` 状态，若意外退出则重启

### Requirement: startActiveSync 行为（v7.34.0）

v7.34.0 的 `startActiveSync` 用 10s setInterval 全程跑。v9.4.0 **修改**：
- **前台**保留 10s/30s setInterval 行为
- **后台**时 `setInterval` 自动降频为 5min
- 后台同步主要依赖 LongConnectionService 推送

### Requirement: 推送鉴权（v9.0.0）

v9.0.0 的 `callMutation` 通过云函数 `context.OPENID` 鉴权。v9.4.0 **扩展**：
- MQTT 连接鉴权：客户端用 `_openid` + `tbConnectToken` 云函数签发的短时 token
- token TTL: 5min，连接建立时一次性使用

---

## REMOVED Requirements

### Requirement: 20s JS 心跳保活
**Reason**: LongConnectionService 接管长连接保活，JS 心跳重复且低效。
**Migration**:
- `__startWatchHeartbeat` 在 v9.4.0-alpha 阶段**保留**（双保险）
- v9.4.0-beta 阶段标记为 deprecated
- v9.4.1 移除

### Requirement: 60s JS 自愈探针
**Reason**: 长连接断开由 LongConnectionService FSM + 指数退避处理，JS 自愈探针在 Doze 下被冻结。
**Migration**:
- `__startWatchSelfHealingProbe` 保留，但仅在前台且 `__watchDegradeStatus === 'paused'` 时启动
- 状态机由 LongConnectionService 上报

---

## 验收指标（量化）

### 必达
- [ ] 后台 → 前台收敛 ≤ 3s
- [ ] 跨设备 running 同步 ≤ 3s
- [ ] 跨设备 transaction 同步 ≤ 3s
- [ ] 睡眠状态推送 ≤ 3s（云端权威）
- [ ] v9.3.3 修后，原生层兜底链路真正工作（logcat 看到 `Worker 成功`）

### 期望
- [ ] 后台 24h 后失败队列 ≤ 5
- [ ] 个推 PUSH 唤起成功率 ≥ 90%（含荣耀/华为/小米/OPPO/VIVO/魅族设备）
- [ ] APK 体积增加 ≤ 2MB

### 不可接受
- [ ] 主进程 ANR
- [ ] 独立进程内存泄漏（持续运行 24h < 50MB）
- [ ] 个推 PUSH 唤起后不能恢复同步

---

## 风险登记

| 风险 | 等级 | 触发条件 | 缓解 |
|------|------|----------|------|
| Android 15 `dataSync` FGS 6h 硬限 | 高 | 用户持续后台 > 6h | 个推 PUSH 唤起重置 FGS |
| 个推 PUSH 触发率受厂商策略 | 中 | 个推 SDK 内部已聚合厂商通道 | 引导用户加白名单 |
| MQTT broker 单点 | 低 | 服务异常 | 客户端指数退避 + WorkManager 兜底 |
| 独立进程内存泄漏 | 中 | 长跑 | 8h 后主动 GC；监控堆内存 |
| MQTT TLS 证书过期 | 低 | 一年后 | 监控 + 自动更新 |
| 5 张表触发器调用次数激增 | 中 | 高频写入 | 触发器内做去重（5s 窗口） |

---

## 不在 v9.4.0 范围（明确排除）

- 不在 v9.4.0 范围（明确排除）
- 逐厂商 PUSH（个推已覆盖，无需单独接）→ 已包含
- 改造 WebView 加载机制
- 改造 JS 业务逻辑
- 改造云函数业务
- 改造 UI 设计
- 改造鉴权流程（除新增 token 签发）
- 优化 Sleep 云同步（v9.3.1 已做）
