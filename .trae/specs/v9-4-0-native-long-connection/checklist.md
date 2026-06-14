# v9.4.0 Checklist

## Phase 1: SPEC 完整性
- [x] spec.md 存在且包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements / REMOVED Requirements
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）
- [x] 用户已确认版本号 v9.4.0
- [x] 用户已确认 A 腾讯云 MQTT
- [x] 用户已确认个推（Getui）PUSH
- [x] 用户已确认阶段二跳一验节奏
- [x] 用户已确认联动修复 v9.3.3

## Phase 2: 服务端（云函数内嵌触发器 + MQTT）

- [x] **2.1** 新建 [`tbConnectToken`](file:///d:/TimeBank/cloudbase-functions/tbConnectToken/index.js) 云函数：签发 5min JWT
  - [x] JWT HS256 签发，5min TTL
  - [x] 鉴权（无 OPENID → 401）
  - [x] 返回 broker 配置（可选）
  - [x] 部署验证：`tcb fn invoke tbConnectToken --params '{}'` → 401
- [x] **2.2** 新建 [`tbPushRelay`](file:///d:/TimeBank/cloudbase-functions/tbPushRelay/index.js) 云函数：relay 到腾讯云 MQTT
  - [x] 接收 `_openid` / `table` / `docId` / `_updateTime`
  - [x] 查 tb_profile.devicePushMap 拿 clientId
  - [x] 调用个推 REST API（缺环境变量时跳过）
  - [x] 对 tb_profile 自身变更跳过（防递归）
  - [x] 部署验证：`tcb fn invoke tbPushRelay --params '{}'` → 400
- [x] **2.3** [`tbMutation/index.js`](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js) 集成 `notifyPushRelay()`
  - [x] 顶部定义 fire-and-forget 辅助函数
  - [x] 10 个写操作分支注入：addTransaction / updateTransaction / deleteTransaction / saveTask / deleteTask / startTask / stopTask / updateRunningTask / saveProfile
  - [x] 部署验证
- [x] **2.4** 新增 `tbMutation.registerPushClientId` action（v9.4.0，供原生层上报 clientId）
  - [x] 部署验证
- [x] **2.5** 环境变量（控制台）
  - [x] `MQTT_TOKEN_SECRET` 设为开发占位（`tb_v940_dev_secret_*`）
  - [x] `MQTT_BROKER_URL` / `MQTT_USERNAME` / `MQTT_PASSWORD` 留空
  - [x] `GETUI_APPID` / `GETUI_APPKEY` / `GETUI_APPSECRET` 留空
  - [ ] **2.6** 部署前替换 `MQTT_TOKEN_SECRET` 为随机强密码（用户）

> ⚠️ **设计变更**：弃用 CloudBase 控制台 DB 触发器。理由：①新版控制台触发器入口难找 ② 触发器单环境限频 200 QPS ③ 内嵌方式更可控（只对成功写发通知，对失败重试不发）。

## Phase 3: 客户端基础（依赖 + Manifest）

- [x] **3.1** [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle) 新增 paho-mqtt + getui-gtsdk 依赖
  - [x] `paho-mqtt` 1.2.5
  - [x] `getui-gtsdk` 3.3.0.0
  - [x] 个推 PUSH 模板注入（GETUI_APPID / GETUI_APPKEY / GETUI_APPSECRET）
  - [x] versionCode → 53，versionName → "9.4.0"
- [x] **3.2** [gradle/libs.versions.toml](file:///d:/TimeBank/android_project/gradle/libs.versions.toml) 新增版本号
- [x] **3.3** [AndroidManifest.xml](file:///d:/TimeBank/android_project/app/src/main/AndroidManifest.xml) 新增：
  - [x] `FOREGROUND_SERVICE_DATA_SYNC` 权限
  - [x] `LongConnectionService` 声明（`process=":longconn"` + `foregroundServiceType="dataSync"`）
  - [x] 个推 PUSH 元数据（PUSH_APPID / PUSH_APPKEY / PUSH_APPSECRET）
  - [x] `application android:name=".TimeBankApplication"`（已存在）
- [x] **3.4** [settings.gradle](file:///d:/TimeBank/android_project/settings.gradle) 添加个推 maven 仓库
  - [x] `https://mvn.getui.com/nexus/content/repositories/public/`

## Phase 4: 客户端核心（LongConnectionService + GetuiPushService + 状态管理）

- [x] **4.1** [TimeBankApplication.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java) 扩展
  - [x] 新增 `LongConnState` 枚举（DISCONNECTED/CONNECTING/CONNECTED/RECONNECTING）
  - [x] 新增 getuiClientId / lastDeltaSyncAt 状态（持久化到 SharedPreferences）
  - [x] 新增 `getTbDeviceId()`（避免与 ContextWrapper.getDeviceId() 冲突）
- [x] **4.2** 新建 [LongConnectionService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java)
  - [x] process=":longconn" 独立进程
  - [x] foregroundServiceType="dataSync" FGS
  - [x] MQTT 连接（paho 客户端，TLS 友好）
  - [x] 智能心跳：keepAlive=60s
  - [x] 指数退避重连：1→2→4→8→16→32→60s
  - [x] 收到消息 → 广播 `com.jianglicheng.timebank.LONGCONN_DELTA`
- [x] **4.3** 新建 [GetuiPushService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java)
  - [x] 继承 GTIntentService
  - [x] 启动个推 SDK（检测占位符，未配置则跳过）
  - [x] 透传消息接收 → 唤醒 LongConnectionService + 广播主进程
  - [x] clientId 接收 → 存 prefs + 更新 TimeBankApplication
- [x] **4.4** [KeepAliveService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/KeepAliveService.java) 改造
  - [x] onStartCommand 启动 `LongConnectionService`
- [x] **4.5** 编译验证
  - [x] `.\gradlew.bat :app:assembleDebug` → **BUILD SUCCESSFUL** ✅
  - [x] APK: `app/build/outputs/apk/debug/app-debug.apk`
  - [x] versionCode=53, versionName="9.4.0"
  - [x] 编译警告：个推 SDK D8 stack map warning（无害）

## Phase 5: v9.3.3 bug 修复

- [ ] **5.1** [timebankSync/index.js](file:///d:/TimeBank/cloudbase-functions/timebankSync/index.js) 新增 `getNativeDelta` case：
  - [ ] 5 张表差集 + maxUpdateTime
  - [ ] 鉴权
  - [ ] 部署验证：`tcb fn invoke timebankSync --params '{"action":"getNativeDelta","data":{"lastSyncAt":0}}'`
- [ ] **5.2** [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) `__onNativeCloudDelta`：
  - [ ] tasks 调 `mergeTasksSmart`
  - [ ] profiles 调 `applyProfileDelta`（**新增函数**）
  - [ ] dailies 调 `mergeDailyDelta`（**新增函数**）
- [ ] **5.3** [CloudSyncScheduler.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java)：
  - [ ] CLOUDBASE_FUNCTION_URL 改用 BuildConfig
  - [ ] 兼容 v9.4.0 格式

## Phase 6: 监控状态显示器

- [ ] **6.1** [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)：
  - [ ] 新增 `longConnStatus` 元素
  - [ ] 新增 `getuiPushStatus` 元素
- [ ] **6.2** [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)：
  - [ ] 5s 轮询长连接状态
  - [ ] 30s 轮询个推 PUSH 状态
- [ ] **6.3** [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)：
  - [ ] `getLongConnectionState()` 方法
  - [ ] `getGetuiPushState()` 方法

## Phase 7: 两端代码同步

- [ ] **7.1** `android_project/.../www/` 副本与根目录 `js/` / `index.html` / `sw.js` 同步（推送时）
- [ ] **7.2** 任何 JS 改动需同时同步到 `js/app-1.js` ↔ `android_project/app/src/main/assets/www/js/app-1.js`

## Phase 8: 版本号同步（9 处）

- [ ] **8.1** [app-1.js:14](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L14) `APP_VERSION = 'v9.4.0'`
- [ ] **8.2** [app-1.js:1-12](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1) 启动日志注释追加 v9.4.0
- [ ] **8.3** [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.4.0
- [ ] **8.4** [index.html:201](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L201) `.version-subtitle` "TimeBank v9.4.0 · 原生长连接 + 个推推送"
- [ ] **8.5** [index.html:1346](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1346) 关于页 v9.4.0
- [ ] **8.6** [index.html:1405](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1405) 用户日志新增 v9.4.0 条目
- [ ] **8.7** [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.4.0
- [ ] **8.8** [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) `CACHE_NAME = 'timebank-cache-v9.4.0'`
- [ ] **8.9** [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) `versionCode 52 → 53`, `versionName "9.3.3" → "9.4.0"`

## Phase 9: 验证清单（alpha）

> 用户拿到 v9.4.0-alpha APK 后验证：

- [ ] **9.1** `adb shell ps | grep longconn` 看到独立进程
- [ ] **9.2** 监控状态显示 🟢 已连接
- [ ] **9.3** 设备 A 改数据 → 设备 B（前台）≤ 3s 收到
- [ ] **9.4** logcat 看到 `LongConnectionService 启动` + `MQTT 连接成功`
- [ ] **9.5** 切到后台 5min，回到前台 ≤ 1s 收到差集
- [ ] **9.6** 杀掉 App 进程，长连接进程仍在（`adb shell ps` 验证）
- [ ] **9.7** 无 ANR / 无 FGS 类型警告

## Phase 10: 验证清单（beta）

> 用户拿到 v9.4.0-beta APK 后验证：

- [ ] **10.1** 设备 A 改数据 → 设备 B（后台）≤ 3s 收到（依赖个推 PUSH）
- [ ] **10.2** 深 Doze + 息屏 1h，回到前台 ≤ 3s 收到差集
- [ ] **10.3** 失败队列 24h 后 ≤ 5
- [ ] **10.4** 长跑 24h，`dumpsys meminfo` 看到独立进程 < 50MB
- [ ] **10.5** v9.3.3 logcat 看到 `Worker 成功`（证明 v9.3.3 bug 已修）
- [ ] **10.6** 个推 PUSH clientId 上报到云端成功
- [ ] **10.7** 重启手机，长连接自动恢复 ≤ 30s

## Phase 11: 验证清单（rc 灰度）

> v9.4.0-rc 发版前手动试：

- [ ] **11.1** 灰度 10% 用户 7 天
- [ ] **11.2** 0 个 P0/P1 问题
- [ ] **11.3** APK 体积增加 ≤ 2MB
- [ ] **11.4** 启动时间增加 ≤ 500ms
