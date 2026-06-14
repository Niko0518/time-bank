# TimeBank 版本更新日志

> ⚠️ 本文档为 [AGENTS.md](../AGENTS.md)「第二部分：版本更新日志」剥离后的独立文档（v9.4.0 起）。
>
> 历史位置：原 AGENTS.md 行 403-1876。
>
> 更早版本（v9.0 之前）见 [`version-history-archive.md`](./version-history-archive.md)。
>
> **📌 最新版本**：[v9.5.1](#v951跨设备补录守卫--自动检测多设备场景误退款修复) — 跨设备补录守卫：自动检测多设备场景误退款修复（2026-06-14）

---

# 第二部分：版本更新日志（仅在用户明确给出撰写指令或者推送时更新）

更早版本见"附录：历史版本索引"与 [`version-history-archive.md`](./version-history-archive.md)。

---

## v9.5.1（跨设备补录守卫 — 自动检测多设备场景误退款修复）

> 🛡️ **v9.5.1 是一个纯 Bug 修复版本**：在 `aggregateAutoDetectForTaskDates` 中加跨设备守卫，修复"多设备用户在设备 B 手动记录 → 设备 A 误判'多记'退款"的竞态。

### 根因（v9.5.0 之前）

`autoDetectAppUsage` 跨设备聚合存在两个数据源同步节奏不一致的问题：

| 数据源 | 同步路径 | 延迟 |
|--------|---------|------|
| `transactions`（含其他设备的补录交易） | `tbMutation` 云函数 | 较快（秒级） |
| `deviceSpecificData[deviceId].autoDetectRawRecords`（其他设备的 UsageStats 原始记录） | `saveDeviceSpecificDataDebounced` | **2s 防抖 + dot-notation 写回不及时** |

复现路径（用户场景）：
1. 用户在设备 B 玩 50 分钟游戏并手动记录
2. 交易记录经 `tbMutation` 同步到云端 → 设备 A 收到
3. 设备 A 运行自动检测：本地 UsageStats=0，`transactions` 含 50min 记录
4. 此时设备 B 的 UsageStats 原始记录尚未上云（防抖窗口内）
5. `collectAutoDetectRawRecords` 只读到设备 A：`deviceRecords = [A(0)]`
6. `totalActual=0, recorded=50, diff=-50` → 触发 **correction -50min** → 错误退款

衍生问题：第二轮自动检测时，第一轮创建的 correction 交易会被 `getTaskRecordedTimeForDateIncludeAuto` **减去**（`autoDetectType==='correction'` 分支），recorded 归零，而设备 B 的原始记录此时已上云、actual=50，又触发 **makeup +50min**。一扣一退，账目乱掉。

### 修复方案

在 [app-systems.js:aggregateAutoDetectForTaskDates](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2920-L3011) 中加两道守卫。

#### 1. 跨设备 UsageStats 守卫（correction + makeup 都用）

```javascript
const _localDeviceId = currentDeviceId || 'local';
const _currentDeviceActual = deviceRecords.find(r => r.deviceId === _localDeviceId)?.actualMinutes || 0;
const _otherDevicesActual = deviceRecords
    .filter(r => r.deviceId !== _localDeviceId)
    .reduce((sum, r) => sum + (r.actualMinutes || 0), 0);
const _isCrossDeviceUsage = _currentDeviceActual === 0 && _otherDevicesActual > 0;
```

- **correction 路径**：本机 0 + 其他设备 > 0 → 跳过修正（防止误退款）
- **makeup 路径**：本机 0 + 其他设备 > 0 → 跳过补录（防止代其他设备补录造成双扣）

#### 2. 时间启发守卫（仅 correction 路径）

```javascript
const _FRESH_RECORD_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 小时
const _hasRecentRecordOnDate = _currentDeviceActual === 0 && recordedMinutes > 0 &&
    transactions.some(t => {
        if (t.taskId !== task.id) return false;
        if (t.isHabitReward || t.isStreakAdvancement || t.isSystem) return false;
        const _tDateStr = t.autoDetectData?.originalDate || getLocalDateString(new Date(t.timestamp));
        return _tDateStr === dateStr && (Date.now() - t.timestamp) < _FRESH_RECORD_THRESHOLD_MS;
    });
```

针对"`otherDevicesActual = 0` 但 `recorded > 0`"的盲区（其他设备原始记录尚未上云，但交易已同步）——用"记录创建时间 < 6h"作为"可能是其他设备刚同步过来"的信号。

**为什么是 6 小时**：
- 大多数跨设备同步场景会在 30s 内收敛
- 用户日常"玩手机 → 放下 → 第二天再开"的窗口在 12h+
- 6h 兜底绝大多数同步延迟，同时不阻塞真"删 App 后 UsageStats 归零"的修正（这种场景 records 通常 > 24h 前创建）

#### 3. 跳过行为

被守卫跳过的日期**不更新 `processedDates`**，留给下一轮重试：
- 第一轮：数据未同步完成 → 跳过
- 第二轮：原始记录已上云 → 数据收敛，正常处理

诊断详情新增 `cross_device_deferred` 状态，附 `reason` 字段（`other_devices_have_usage` / `recent_record_synced`）与各端 actualMinutes 对比。

### 改动文件

| 文件 | 改动 |
|------|------|
| `android_project/app/src/main/assets/www/js/app-systems.js` | `aggregateAutoDetectForTaskDates` 加两道守卫，约 25 行新增 |
| 9 处版本号位置 | `v9.5.0` → `v9.5.1`（app-1.js APP_VERSION、sw.js 注释 + CACHE_NAME、index.html 4 处、build.gradle versionName + versionCode 55） |

### 已知边界

- 极端情况：其他设备**永久离线**时，其产生的 UsageStats 不会被任何一端补录。用户可手动记录，或重新打开离线设备。
- 6h 阈值对绝大多数用户无感；只有"刚装好 App 立即玩 + 记录在 6h 内"的边角场景可能延迟 6h 才修正。
- 单设备用户行为完全不变（`currentDeviceActual > 0` 时守卫不触发）。

---

## v9.5.0（Watch 重连机制架构重构 + 降级强警告）

> ⚠️ **v9.5.0 是一次纯架构 + UX 升级**：把 v9.0.10 以来"职责过度耦合"的 110+ 行单一重连函数拆为 4 层架构，并把"自愈探针"这种"几乎无效"的功能彻底删除，换成"用户必看的降级警告横幅"。

### 核心问题（v9.4.0 之前架构）

1. **职责过度耦合**：`scheduleWatchReconnect` 函数 110+ 行混合 5 个职责（重连调度 + 状态管理 + UI 更新 + 错误处理 + 业务执行），违反单一职责原则
2. **状态分散管理**：`watchReconnectAttempts`（5 个 watcher 各自计数器）、`__watchDegradeStatus`（全局降级状态机）、`watchRegistered`/`watchConnected`（注册和连接状态）分散在全局作用域
3. **UI 与业务耦合**：`scheduleWatchReconnect` 中直接调用 `updateWatchStatusUI`，业务逻辑与 UI 更新无法独立测试
4. **策略硬编码**：指数退避算法（baseDelay × 1.5^n）、防抖时间 2s、最大重试次数 8 全部硬编码，无法按网络环境切换
5. **自愈探针几乎无效**：v9.0.10 引入的 60s 一次自愈探针实际从未成功恢复连接（WebSocket 重建依赖 SDK 状态、用户认证、网络层多重因素），制造"系统在努力"的幻觉反而干扰用户

### 4 层架构 + 策略模式

```
┌─────────────────────────────────────────────────────────────┐
│  WatchReconnectScheduler  调度层：定时器、防抖、重试决策     │
│  ↑                          ↓                                │
│  ReconnectStrategy        策略层：指数退避算法（可替换）     │
│  ↑                          ↓                                │
│  WatchStateManager        状态层：状态机/计数器/持久化       │
│  ↑                          ↓                                │
│  WatchReconnectExecutor   执行层：登录检查/subscribeAll/同步 │
│  ↑                          ↓                                │
│  EventBus                 事件总线：解耦各层通信              │
└─────────────────────────────────────────────────────────────┘
```

### 5 个新增类（约 540 行，文件末尾 IIFE 包裹）

| 类 | 行数 | 职责 |
|---|---|---|
| `WatchEventBus` | ~35 | 极简 pub-sub，解耦各层通信 |
| `ReconnectStrategy` + `ExponentialBackoffStrategy` | ~50 | 策略模式：可替换的退避算法 |
| `WatchStateManager` | ~130 | 状态机 + 5 watcher 计数器 + localStorage 持久化 |
| `WatchReconnectExecutor` | ~80 | 业务执行：登录检查 / needsReconnect 判定 / subscribeAll / reconcile |
| `WatchReconnectScheduler` | ~115 | 调度器：防抖 / 定时器 / 重试决策 / forceReconnect |

### 关键改进

#### 1. 单一职责 + 可独立测试
- `WatchStateManager` 单元测试：可独立测试 5 个状态转换路径（markFailure / markSuccess / incrementReconnectAttempts / transitionToPaused / resetReconnectAttempts）
- `ExponentialBackoffStrategy` 单元测试：可独立测试各种 attempts 下的延迟计算
- `WatchReconnectExecutor` 单元测试：可 mock DAL + reconcileCloudAfterWatch 测试各业务路径

#### 2. 可替换的重连策略
```javascript
// 未来可按网络环境切换策略
class AggressiveStrategy extends ReconnectStrategy { ... }    // 弱网激进
class ConservativeStrategy extends ReconnectStrategy { ... } // 海外保守
class FixedIntervalStrategy extends ReconnectStrategy { ... } // 固定间隔（调试用）
```

#### 3. 事件驱动 UI 解耦
```javascript
// 业务逻辑只触发事件
__wbScheduler.schedule('task-error');
// → EventBus 触发 'reconnect:scheduled' / 'state:changed' / 'reconnect:paused'
// → UI 监听器自动响应
__watchEventBus.on('state:paused', () => showWatchDegradedWarning());
```

#### 4. 兼容旧 API
- `window.scheduleWatchReconnect(reason)` 仍可调用（5 处 onError 回调：task/transaction/running/profile/daily 无需修改）
- `window.__markWatchFailure(reason)` / `window.__markWatchSuccess()` 兼容
- 内部委托给新调度器，对调用方完全透明

### 自愈探针已删除

| 旧功能 | 删除原因 | 新方案 |
|---|---|---|
| `__startWatchSelfHealingProbe`（60s 一次）| WebSocket 重建依赖 SDK 状态、用户认证、网络层多重因素，60s 一次几乎从未成功恢复 | 删除 |
| `__startSelfHealingCountdownTicker`（1s 倒计时）| 与自愈探针配合，删除探针后失去意义 | 删除 |
| `__watchSelfHealingTimer` / `__watchSelfHealingProbeCount` / `__watchSelfHealingCountdown` / `__watchCountdownTicker` | 探针相关状态 | 删除 |
| `WATCH_SELF_HEAL_INTERVAL_MS` 常量 | 探针间隔 | 删除 |
| `diagProbeCount` / `diagCountdown` UI 字段 | 探针展示 | 简化诊断面板 |

### 降级警告横幅（用户必看）

用户原话："**对降级处理感到恐惧，担心用户会一直处于降级状态而不自知**"

#### 设计目标
- 用户**绝对无法忽略**降级状态
- 提供**一键重试**入口，由用户主动决策
- 显示**降级时长**（每秒累加），让用户感知"已暂停多久"

#### 视觉设计
- **全屏固定顶部**（`position: fixed; z-index: 9999`），覆盖所有内容
- **红色脉冲背景**（`linear-gradient + box-shadow 2s 无限脉冲`）
- **图标抖动动画**（⚠️ 每 0.5s 旋转 ±8°）
- **降级时长高亮显示**（背景色块 + 等宽数字 + 1s 累加）
- **失败原因 + 失败次数**展示
- **"立即重试" + "详情" + "× 关闭"** 三个交互按钮

#### 触发条件
- `state.status === 'paused'` 时通过 `state:paused` 事件自动触发
- 跨刷新恢复：启动时 `__initWatchDegradeState` 检测到 `paused` 状态会重新显示横幅

### 监听状态显示器重构

| 维度 | 旧（v9.4.0） | 新（v9.5.0） |
|---|---|---|
| 状态分级 | 5 级（emoji + 文字） | 5 级 + 视觉规范（`WATCH_STATUS_VISUAL` 常量集中管理） |
| 降级状态视觉 | 普通红色圆点 | 红色脉冲边框 + 抖动 3 次动画 + 红色半透明背景 |
| tooltip | 长文，多行混杂 | "状态 + 原因 + 操作建议"三段式 |
| hover 反馈 | 无 | 浅色/暗色主题的悬浮背景色 |
| 倒计时数字 | 文本变化会抖动 | `font-variant-numeric: tabular-nums` 等宽数字 |

### 兼容性

- ✅ 5 处 onError 回调（task/transaction/running/profile/daily）无需修改，自动通过 `scheduleWatchReconnect` 兼容层走新调度器
- ✅ 持久化数据结构兼容（旧 `localStorage` 中的 `tb_watchDegradeState` 字段被新 `WatchStateManager.load()` 兼容读取，丢失 `probeCountdown`/`probeCount` 字段无影响）
- ✅ `__markWatchFailure` / `__markWatchSuccess` / `__recordWatchDegrade` / `__loadWatchDegradeState` 兼容
- ✅ Watchdog 探针（v9.0.11 引入的独立于自愈探针的轻量探针）保留，仅注释更新

### 影响范围（文件清单）

| 文件 | 变更类型 | 行数变化 |
|---|---|---|
| `android_project/app/src/main/assets/www/js/app-1.js` | 重构 + 追加 | +540（新类）/-210（自愈探针 + 原 scheduleWatchReconnect）= +330 |
| `android_project/app/src/main/assets/www/index.html` | 追加 HTML + 用户日志 | +35（横幅 DOM）/+18（用户日志）= +53 |
| `android_project/app/src/main/assets/www/css/main.css` | 重构 + 追加 | 重构 .watch-status 块（约 30 行）+ 追加 .watch-degraded-warning 块（约 110 行）= +140 |
| `android_project/app/src/main/assets/www/sw.js` | 版本号 | 2 处 v9.4.0 → v9.5.0 |
| `android_project/app/build.gradle` | 版本号 | versionCode 53→54, versionName 9.4.0→9.5.0 |
| `docs/version-changelog.md` | 追加技术日志 | +180（本节） |

### 回归测试关注点

1. **正常流程**：已登录 + 网络正常 → 状态显示器显示 🟢 已同步，hover 提示显示心跳时间
2. **弱网抖动**：偶发断连 → 状态显示器显示 🟠 保活中 1/8，倒计时实时更新
3. **持续断网**：连续 8 次失败 → 触发降级警告横幅（红色脉冲 + 图标抖动 + 时长累加）
4. **降级恢复**：用户点击"立即重试" + 网络恢复 → 横幅消失，状态恢复 🟢
5. **跨刷新恢复**：降级状态下刷新页面 → 启动时自动重新显示横幅
6. **未登录场景**：未登录用户不触发横幅
7. **暗色模式**：降级横幅在暗色主题下颜色略提亮，保持可读性
8. **5 个 watcher 单独失败**：某个 watcher 失败不影响其他 watcher 的状态计数器

### 用户原话回顾

> "我要做的事情是实现同步和监听机制的完善。我希望应用能达到通信软件级别的同步和监听能力。"
>
> "我对降级处理感到恐惧，我担心用户会一直处于降级状态而不自知，如果你要降级，请再使用界面给出明显的警告。"
>
> "顺便重构监听状态显示器，更加美观、简洁、直观。"
>
> "自愈探针几乎没有作用，如果你的重构方案里没有它，可以直接删除或者替代。"

v9.5.0 完全回应了以上 3 个关切：
- **架构层面**：4 层解耦，未来扩展不再需要改核心
- **降级感知**：强制视觉警告，用户绝无可能"静默卡死"
- **显示器**：5 级视觉规范 + 降级强提示 + 暗色兼容
- **自愈探针**：已删除，由"明确告知 + 一键重试"替代

---

## v9.4.0（同步链路重构：原生层独立进程长连接 + 个推 PUSH 集成 + 事件驱动同步）

> ⚠️ **v9.4.0 是一次根本性架构升级**：把"实时同步"的所有权从 WebView 收回，交给 Android 原生层（独立进程长连接 + 个推 PUSH 通道）统一接管。WebView 退化为纯 UI 渲染层，不再是同步决策者。
>
> **未完成项（用户决定本次范围到此为止，未来再解决）**：
> - 9 处版本号同步未执行（`APP_VERSION` 仍为 v9.3.2 → 等待用户明确给出 v9.4.0 推送指令）
> - 同步状态条点击展开详情未做回归测试
> - 公开 broker `wss://broker.emqx.io:8084/mqtt` 在大陆网络不稳
> - 个推控制台"应用配置"包名/状态未确认填写
> - 数据库触发器（5 张表）是否在 CloudBase 配齐未确认
> - `tb_profile.devicePushMap` 是否真有数据未确认
> - `tbPushRelay` 鉴权 `GETUI_MASTERSECRET` 环境变量未确认

### 核心问题（v9.3.2 之前架构）

1. **WebView 单点失败**：所有同步逻辑（30s activeSync、Watch 心跳、增量拉取、状态展示）全部挤在 `app-1.js`，WebView 重建/切后台/被杀即停
2. **同步滞后 10-30 秒**：最坏情况下 30 秒后才看到云端变更，Watch 断线期间完全失同步
3. **缺乏多端"我也要被通知"机制**：一账号多设备无法独立收推送
4. **跨进程架构未建立**：Java JS Bridge 只覆盖 1 个主进程，长连接、推送服务无法独立运行

### 架构升级（三层协作 + 独立进程）

```
[ 云端数据写入 ]                  [ 设备端原生层 ]                  [ 客户端 UI ]
 tb_task / tb_transaction                ↓                        ↓
        ↓                  ┌──────────────────────┐    ┌──────────────────┐
  数据库触发器              │  LongConnection      │    │  WebView         │
        ↓                  │  :longconn 进程      │    │  (UI 层)         │
 tbPushRelay 云函数          │  MQTT 长连接          │←──│  仅渲染          │
        ↓                  │  subscribe tb_user_X │    └──────────────────┘
  ┌────┴────┐              └──────────────────────┘             ↑
  ↓         ↓                        ↑                           │
个推 REST   MQTT                ┌──────────────────────┐           │
API 推送   发布                  │ GetuiPushService     │───────────┘
  ↓         ↓                   │ :pushservice 进程    │
  └────→  设备  ──────────→ │ 接收透传+广播        │
        ↑                   └──────────────────────┘
  透传 {"_openid","table","docId",...}
```

### 三大架构改造

| # | 改造 | 体现 |
|---|------|------|
| **1** | **从轮询到事件驱动** | 旧：30s 主动拉取；新：云端变更 → 触发器 → tbPushRelay → 个推/长连接 → 设备 → 增量拉取 |
| **2** | **从 WebView 单点到原生多进程** | 旧：JS 单点；新：MQTT 进程 / PUSH 进程 / 主进程三进程协作，App 被杀也能收推送（个推厂商通道） |
| **3** | **从单通道到双通道冗余** | MQTT 长连接（实时性高）+ 个推 PUSH（杀进程也能到）任一失败不影响另一条 |

### 新增模块（5 个）

| 模块 | 位置 | 职责 |
|------|------|------|
| **LongConnectionService** | `android_project/.../LongConnectionService.java` | 独立 `:longconn` 进程，Foreground Service，MQTT 长连接订阅 `tb_user_<openid>`，断线指数退避重试 |
| **GetuiPushService** | `android_project/.../GetuiPushService.java` | 继承 `GTIntentService`，接收个推透传消息 → 启动 LongConnectionService + 广播 `ACTION_DELTA` |
| **TimeBankApplication** | `android_project/.../TimeBankApplication.java` | 初始化个推 SDK（`PushManager.preInit` + `initialize`），从 `getui_sp.xml` 兜底读 clientId，保存 broker config |
| **tbPushRelay** | `cloudbase-functions/tbPushRelay/index.js` | 数据库触发器入口；查 `tb_profile.devicePushMap` 拿 clientId → 调个推 REST API 推送 + MQTT 预留 |
| **同步状态条** | `app-1.js` + `index.html` `#syncStatusBar` | 顶部固定条；5 维度（MQTT/PUSH/上次同步/待注入/原生层）5s 轮询原生层状态 |

### Web ↔ 原生层 JS 桥扩展

| 接口 | 位置 | 职责 |
|------|------|------|
| `getGetuiClientId()` | `WebAppInterface.java` | 暴露个推 clientId 给 Web 端注册到 `tb_profile.devicePushMap` |
| `getTbDeviceId()` | `WebAppInterface.java` | 暴露设备 ID（与 `getGetuiClientId` 一同上报表） |
| `getNativeSyncState()` | `WebAppInterface.java` | 5 维度同步状态聚合（JSON 字符串） |
| `saveMqttConfig(url, username, password, topic)` | `WebAppInterface.java` | Web 端从云端拉到 broker config 后持久化到 `tb_longconn.xml` |
| `getMqttBrokerConfig()` | `WebAppInterface.java` | Web 端读取 broker config 供 `tbPushRelay` 写入 |
| `startLongConnection(openid)` | `WebAppInterface.java` | Web 端在拿到 openid 后通知原生层启动 `LongConnectionService` |

### 修复项（v9.4.0）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **同步状态条不再卡"初始化中"** | `app-1.js` 新增 `__startSyncMonitor()` + `__renderSyncBar()` + `__toggleSyncDetail()`：5s 轮询 `getNativeSyncState()` → 5 维度展示 → 点击展开/收起详情 |
| **2** | **app-1.js 解析失败（孤立 `}`）** | `app-1.js` line 8672 删除孤立 `}` —— 整个 JS 解析失败导致应用白屏卡死 |
| **3** | **`__mqttConfigRefreshed` 未声明** | `app-1.js` 顶部 `let __mqttConfigRefreshed = false;` —— `__renderSyncBar` 引用未声明变量抛 ReferenceError |
| **4** | **`__refreshMqttConfig` 缺失** | `app-1.js` 新增 `__refreshMqttConfig()`：从云端 `tbPushRelay` 拉 broker config → 调用 `Android.saveMqttConfig` 写入 `tb_longconn.xml` |
| **5** | **`getCurrentUid` 引用 `DAL.getCurrentUid`** | `app-1.js` `__registerPushClientIdOnce` 中显式使用 `DAL.getCurrentUid()`，避免 `currentUid` 自由变量 ReferenceError |
| **6** | **`__registerPushClientIdOnce` 401 修复** | `app-1.js` `tbMutation.registerPushClientId` 请求 body 加 `_openid: currentUid` —— 缺少鉴权信息导致 401 |
| **7** | **`getGetuiClientId` SDK 兜底** | `TimeBankApplication.java` `readGetuiClientIdFromSdkSp()`：当 `onReceiveClientId` 回调未触发时，直接从 `getui_sp.xml` 读 `sc` 字段 |
| **8** | **个推 PUSH 接收服务** | `GetuiPushService extends GTIntentService` 重写 `onReceiveMessageData` / `onReceiveClientId` / `onReceiveOnlineState` / `onReceiveServicePid` —— 接收透传后启动 `LongConnectionService` + 广播 `ACTION_DELTA` |
| **9** | **AndroidManifest 长连接/个推服务声明** | 新增 `LongConnectionService`（`process=":longconn"`、`foregroundServiceType="dataSync"`） + `GetuiPushService`（`process=":pushservice"`） + `PUSH_APPID` metadata + 个推服务 receiver/permission 声明 |
| **10** | **依赖配置** | `build.gradle` 引入 `com.getui:gtsdk:3.3.13.0` + `com.getui:gtc:3.x` + `org.eclipse.paho:org.eclipse.paho.client.mqttv3:1.2.5` + `manifestPlaceholders` 注入 GETUI_APPID/APPKEY/APPSECRET |
| **11** | **tbPushRelay 云函数** | `cloudbase-functions/tbPushRelay/index.js`：数据库触发器 → 查 `tb_profile.devicePushMap` → 调个推 REST API（POST `https://restapi.getui.com/v2/${appId}/push_single`）→ 错误日志输出 pushed.getui / mqtt 数量 |

### 关键设计原则（v9.4.0 五大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **事件驱动优于轮询** | 30s activeSync 仍存在作为兜底，但主路径改为"云端变更 → 推送" |
| **2** | **原生层是同步事实来源** | 同步状态、broker config、clientId 全部由原生层管理，WebView 只是镜像 |
| **3** | **多通道冗余** | 个推 PUSH + MQTT 长连接两条独立通道；任一失败不影响另一条 |
| **4** | **进程隔离** | LongConnection / GetuiPushService / MainActivity 三个进程互不干扰，主进程崩溃不影响后台推送 |
| **5** | **配置云端化** | broker config、devicePushMap 都存云端；新设备登录即自动拉取；旧设备丢失本地缓存可从云端恢复 |

### 关键 Bug 防御

| 场景 | v9.3.2 之前 | v9.4.0 起 |
|------|------------|----------|
| 同步状态显示 | 卡"初始化中"（ReferenceError）| 5 维度实时展示（MQTT/PUSH/上次同步/待注入/原生层）|
| WebView 被杀 | 同步完全停止 | 个推 PUSH 仍能唤醒设备 + 推送增量变更 |
| 跨设备变更最大滞后 | 10 秒（activeSync） | 秒级（推送到达即拉取）|
| 新设备无本地缓存 | 需手动从云端拉 broker config | 自动从云端 tb_profile 拉 + 写入 tb_longconn.xml |
| 个推 clientId 拿不到 | onReceiveClientId 回调未触发时无解 | 兜底从 getui_sp.xml 读 sc 字段 |
| tbPushRelay 401 鉴权失败 | _openid 缺失 | 显式传入 currentUid |

### 用户可见改善

| 现象 | v9.3.2 之前 | v9.4.0 起 |
|------|------------|----------|
| 顶部同步状态条 | 一直"初始化中" / 无法展开详情 | 5 维度实时状态 + 点击展开详情 |
| 多端推送 | 不支持 | 一账号多设备独立收推送 |
| App 被杀后变更同步 | 完全失同步 | 个推厂商通道唤醒 |
| 长连接稳定性 | WebView 切后台就断 | 独立进程 Foreground Service 保活 |

### 已知遗留（v9.4.0 未解决）

1. **9 处版本号同步未做**：APP_VERSION 仍为 v9.3.2，需要用户明确给出"推送 v9.4.0"指令后才执行
2. **公开 broker `wss://broker.emqx.io:8084/mqtt` 在大陆网络不稳**：长连接持续 attempt=N delay=N×2s 退避重试；建议切到国内 broker（EMQX Cloud 国内节点 / 阿里云 MQTT）
3. **个推控制台配置**："包名"必须填 `com.jianglicheng.timebank`，"应用状态"必须是"已上线/联调中"而非"待配置"；当前未在控制台确认
4. **数据库触发器**：5 张表（tb_task / tb_transaction / tb_running / tb_daily / tb_profile）需要在 CloudBase 控制台配 trigger → tbPushRelay
5. **`tb_profile.devicePushMap`**：需用户首次启动后由 `__registerPushClientIdOnce` 自动写入；当前未在控制台确认
6. **`tbPushRelay` 鉴权**：需要 `GETUI_MASTERSECRET` 环境变量设置；当前未在 CloudBase 控制台配置
7. **同步状态条点击展开详情**：HTML 元素 + JS 逻辑已就位，但未做用户回归测试

### 部署要求（v9.4.0）

| 模块 | 类型 | 操作 |
|------|------|------|
| `tbPushRelay` 云函数 | 新增 | 必须在 CloudBase 控制台部署 |
| `tb_profile` 集合索引 | 已有 | 无需新增（devicePushMap 是普通字段）|
| `tb_profile.devicePushMap` | 新增字段 | 由 `__registerPushClientIdOnce` 自动写入（用户首次启动后）|
| CloudBase 5 张表触发器 | 需用户配置 | 在控制台配置 trigger → tbPushRelay |
| Android 端 | 重新打包 | `D:\TimeBank\log&data\sync.ps1` 构建并安装 Debug APK |

### 调试验证步骤（开发者已实测通过）

```powershell
# 1. 监控个推/同步链路日志
adb logcat -c
adb logcat -v threadtime -s GetuiPushService:* GetuiPushSdk:* IGtBroadcast:* TimeBank:*

# 2. 查看 broker config 是否写入
adb shell run-as com.jianglicheng.timebank cat /data/data/com.jianglicheng.timebank/shared_prefs/tb_longconn.xml
# 期望看到: getui_client_id / tb_mqtt_broker_url / tb_mqtt_openid / tb_mqtt_topic_prefix

# 3. 查看个推控制台"应用配置"→ 包名 com.jianglicheng.timebank → 应用状态"联调中"
#    推送测试 → SDK 透传 → 按 ClientID 推送 → clientId=bf2ab0dd95920e9b4a5158525aecaab2
#    透传内容: {"_openid":"2011857504337661952","table":"tb_task","docId":"test","_updateTime":1718000000000}
```

### 影响范围

- 新增 3 个 Android 文件：
  - [LongConnectionService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/LongConnectionService.java)
  - [GetuiPushService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/GetuiPushService.java)
  - [TimeBankApplication.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/TimeBankApplication.java)
- 修改 4 个 Android 文件：
  - [AndroidManifest.xml](file:///d:/TimeBank/android_project/app/src/main/AndroidManifest.xml) — 新增服务/元数据
  - [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) — 6 个新 JS 桥
  - [MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java) — 启动 LongConnectionService
  - [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle) — 依赖 + manifestPlaceholders
- 修改 2 个 Web 端文件：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) — 同步状态条 + PUSH 注册 + MQTT config
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html) — `#syncStatusBar` 元素
- 新增 1 个云函数：[tbPushRelay/index.js](file:///d:/TimeBank/cloudbase-functions/tbPushRelay/index.js)

### 教训（v9.4.0 复盘）

1. **Edit 工具的"成功"提示与 Read 工具的显示都有缓存**，不能完全信任；必须用 `Get-Content -Raw` + `Select-String -AllMatches` 直接查文件实际内容
2. **WebView 端"功能看着有" ≠ "实际有"**：app-1.js 解析失败整个白屏，但 IDE 仍能定位到"line 8413"——错误位置是 IDE 上次成功读取的缓存
3. **孤立 `}` 是 silent killer**：JS 解析失败只表现为"应用不加载数据"，控制台无明显报错
4. **"声明优于隐式"铁律再次验证**：`__mqttConfigRefreshed` 隐式全局 → ReferenceError；v9.0.12 已为此加过 `let isImportMode = false` 教训
5. **多通道冗余必须真的能 fallback**：个推 PUSH 配置未完成时，UI 必须清晰告知用户"PUSH 未配置"而不是假装正常

---

## [基础设施] CloudBase AI 原生开发工具链升级

> 非产品功能版本，属于开发基础设施重大升级。本次升级使 AI 编程助手能够在 Trae IDE 内直接通过自然语言操作 CloudBase 云资源。

### 升级内容

| # | 组件 | 版本/规模 | 说明 |
|---|------|----------|------|
| 1 | **CloudBase CLI** | v3.5.6 | 从 v1/v2 升级至 v3，命令体系对齐 `tcb fn ...`，新增统一日志 `tcb logs search`、终端文档 `tcb docs`、云 API 直连 `tcb api` |
| 2 | **CloudBase MCP** | v2.22.0 | 全局配置写入 `C:\Users\15700\.trae\mcp.json`，Trae 重启后 AI 可直接调用 CloudBase 工具 |
| 3 | **CloudBase Skills** | 71 agents | 安装路径 `.agents\skills\cloudbase`，覆盖云函数/云托管/数据库/AI 大模型/运维/架构设计全场景 |

### 对 AI 编程助手的指导

- **优先级**：涉及 CloudBase 操作时，先尝试通过 MCP/Skills 自动完成；若当前 AI 会话未暴露 MCP 工具，则回退到 `tcb` 命令行
- **可用自然语言指令示例**：
  - "部署 timebankSync 云函数"
  - "查看 timebankAI 最近 10 分钟的报错日志"
  - "列出当前环境所有数据库集合"
  - "为 tb_task 创建 _openid + _updateTime 复合索引"
- **CLI 命令仍有效**：`tcb fn deploy --all --force`、`tcb logs search`、`tcb env usage` 等命令在终端中可直接使用

### 相关文档

- CloudBase CLI v3 迁移指南：`https://docs.cloudbase.net/cli-v1/migrate-v3`
- CloudBase Trae 配置指南：`https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/trae`
- Trae MCP 使用文档：`https://docs.trae.ai/ide/use-mcp-servers-in-agents?_lang=zh`

---

## v9.3.2（任务复活修复：stopTask 静默期 + 云端权威源）

> ⚠️ **v9.3.2 是 v9.3.1 引入的"任务复活"回归的紧急修复**。v9.3.1 上线后用户复现：在 30 分钟悬浮窗返回 → 正常结束任务 → 1 秒后任务复活。根因是 v9.3.1 的"找不到 runningTask → 从原生 Service 拉回"恢复逻辑被晚到的浮窗 pause 事件触发，复活已被 stopTask 删除的任务。**云端才是唯一权威源**——这一原则在 v9.3.1 被原生 Service 取代，在 v9.3.2 重新回归。

### 根因（v9.3.1 架构缺陷）

1. **恢复逻辑过于激进**：[app-2.js:4785-4851](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4785) v9.3.1 的 `__onFloatingTimerAction` 把"找不到 runningTask"等同于"需要从原生 Service 拉回"——但忽略了"用户可能已经 stopTask 过了"
2. **scheduleRetry 重试窗口期与 stopTask 竞争**：[MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java) `scheduleRetry` 最多重试 15 次（3 秒）—— 正好覆盖"用户从浮窗进入 TimeBank → 1~3 秒内点结束"的窗口
3. **EVENT_PREFS 30 分钟 TTL**：[FloatingTimerService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java) 持久事件队列的 30 分钟 TTL 让"30 分钟前的浮窗 pause 事件"在 v9.3.1 场景下成为定时炸弹
4. **原生 Service 仍持有已暂停 timer**：`stopTask` 调用 `stopFloatingTimer` 是异步 Intent，scheduleRetry 重试触发时 Service 可能尚未处理 STOP Intent
5. **历史版本同样存在该症状**：v9.0.5 之前症状为"任务在 UI 上消失但浮窗仍暂停计时"；v9.0.5 ~ v9.3.0 症状为"周期性复活"（30 秒 activeSync 后从云端拉回）

### 核心改造（v9.3.2 三重防护）

| # | 防护层 | 触发条件 | 行为 |
|---|--------|----------|------|
| **1** | **静默期**（最快路径） | `stopTask` / `cancelTask` 后 5 秒内 | 直接丢弃事件 + ack，**不进入恢复逻辑** |
| **2** | **云端权威**（默认路径） | 静默期外，`runningTask` 仍缺失 | 优先查云端 `DAL.loadRunningTasks`，云端无则丢弃 + ack |
| **3** | **maxElapsed 校验**（离线兜底） | 云端查询失败（离线） | 查原生 Service，**但若 `nativeElapsed <= maxElapsed` 视为陈旧，丢弃 + ack** |

### 修复项（v9.3.2）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **静默期追踪** | [app-2.js:4721-4744](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4721) 新增 `__stopTaskSilenceUntil` Map + `markStopTaskSilence(taskId, maxElapsed)`，stopTask/cancelTask 入口记录 5 秒静默期 + maxElapsed |
| **2** | **云端优先恢复** | [app-2.js:4803-4834](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4803) 恢复逻辑改为先查 `DAL.loadRunningTasks`，**云端无记录 → 直接 `return 'ok'` 丢弃事件** |
| **3** | **maxElapsed 双重防护** | [app-2.js:4844-4858](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4844) 离线回退路径增加 `nativeElapsed <= recentMax + 5000` 检查 |
| **4** | **返回值 "ok" 语义化** | [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js) 新增 `"ok"` 返回值表示"主动丢弃事件"，区分于 `"applied"`（已应用）和 `"waiting"`（等待依赖） |
| **5** | **MainActivity scheduleRetry 明确处理** | [MainActivity.java:324-363](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java#L324) `scheduleRetry` 收到 `"ok"` 立即停止重试并日志记录 |
| **6** | **stopTask 静默期用原生权威时长** | [app-2.js:5092-5104](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L5092) `markStopTaskSilence` 的 `maxElapsed` 优先用 `getTimerElapsedByName` 取原生 Service 权威值 |
| **7** | **9 处版本号同步** | APP_VERSION / CACHE_NAME / index.html / build.gradle versionCode 50→51 / AGENTS.md / sw.js |

### 关键设计原则

| # | 原则 | 体现 |
|---|------|------|
| **1** | **云端是唯一权威源**（回归 v9.0.9 原则） | 找不到 runningTask 时永远先问云端，云端无则视为"用户已停止" |
| **2** | **"找不到"不等于"需要恢复"** | v9.3.1 把"找不到"等同"恢复"，v9.3.2 增加"静默期/陈旧/已停止"三种丢弃原因 |
| **3** | **静默期快路径优先** | 静默期内连云端查询都不做，节省一次网络往返 |
| **4** | **历史 bug 一起闭环** | v9.0.5+ 所有"任务复活/不消失"症状均由该根因导致，v9.3.2 一并修复 |

### 用户可见改善

| 现象 | v9.3.1 之前 | v9.3.2 起 |
|------|------------|----------|
| 30 分钟后悬浮窗返回 → 结束任务 → 1 秒后 | 🔥 任务复活 | ✅ 任务正常结束，无复活 |
| 静默期（5 秒）内的浮窗 pause 事件 | 🔥 触发恢复逻辑 | ✅ 一律 ack + 丢弃 |
| 离线场景 + 用户已 stopTask | 🔥 原生残留 timer 复活 | ✅ maxElapsed 校验丢弃 |
| scheduleRetry 收到 "ok" 返回 | ⚠️ 静默重试浪费 | ✅ 立即停止，日志可读 |

### 影响范围

- 修改 3 个文件：
  - [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js)（约 +90 行：静默期工具函数 + 恢复逻辑重构 + stopTask/cancelTask 入口埋点）
  - [MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java)（+15 行：scheduleRetry 注释与 "ok" 区分日志）
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) / [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html) / [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js) / [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle) / [AGENTS.md](file:///d:/TimeBank/AGENTS.md)（版本号同步）
- 9 处版本号同步 v9.3.1 → v9.3.2
- 无需部署云函数（纯客户端变更）

### Bug 2 修复（v9.3.2 续作：跨设备同步滞后）

> ⚠️ v9.3.2 原本仅修复 Bug 1（任务复活），但用户复现第二个 bug：跨设备取消任务后另一台设备 30+ 秒才同步。经诊断为**架构性缺陷**（fetchDelta 不覆盖 tb_running + activeSync 周期太长 + 复合索引缺失），在 v9.3.2 续作中一并修复。

#### Bug 2 根因

1. **fetchDelta 不覆盖 tb_running**：[app-1.js:4268-4315](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4268) `DAL.fetchDelta` 走 `timebankSync` 云函数 `getDelta` action 只返 transactions，对 tb_running 视而不见
2. **activeSync 30 秒间隔**：[app-1.js:2173](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2173) 30 秒周期即便覆盖了 tb_running，跨设备变更最大滞后 30 秒
3. **Watch 推送依赖网络健壮性**：Doze / 标签页 throttle / 4G 切换瞬间 / watchdog 雪崩（v9.0.11 限频 6 次/小时）都会让 watch 断开，断开期间跨设备完全失同步
4. **复合索引缺失**：`_updateTime` 范围查询无复合索引支撑，频繁查询拖慢云端

#### Bug 2 修复项（D + E + F + G）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **D** | **`DAL.fetchRunningDelta(lastSyncAt)`** | [app-1.js:4317-4351](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4317) 新增 `db.collection(TABLES.RUNNING).where({ _openid, _updateTime: db.command.gt(lastSyncAt) }).get()`，独立于 fetchDelta，不依赖云函数 |
| **E** | **`mergeRunningDelta(deltaRecords)` + reconcileCloudAfterWatch 集成** | [app-1.js:4939-5013](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4939) 新增合并函数；[app-1.js:1607-1628](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1607) `reconcileCloudAfterWatch` 增量路径在 `mergeTransactionDelta` 之后调用 `mergeRunningDelta`，错误隔离不影响主流程 |
| **F** | **activeSync 30s → 10s 恒定** | [app-1.js:2179](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2179) `ACTIVE_SYNC_INTERVAL_MS = 10000`，跨设备变更最大滞后从 30 秒降至 10 秒 |
| **G** | **云函数建复合索引** | [cloudbase-functions/tbMutation/index.js:31-56](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L31) `ensureIndexes()` 创建 `idx_openid_updateTime` 复合索引（_openid ASC + _updateTime DESC），main 函数首次调用时幂等执行 |

#### 合并规则（mergeRunningDelta）

| 场景 | 处理 |
|------|------|
| 文档存在 + 同一 clientId（本机回声） | 跳过（watch onChange 会处理，避免重复） |
| 文档 _isDeleted=true（云函数墓碑） | 从本地 runningTasks 删除（v9.3.0 1003→410 幂等的删除传播） |
| 文档存在 + 任务不在本地 | 追加（跨设备新增） |
| 文档存在 + 任务在本地 | 用云端数据覆盖（云端是权威源） |
| 任何变化 | saveLocalCache + updateAllUI |

#### Bug 2 用户可见改善

| 现象 | v9.3.1 之前 | v9.3.2 起 |
|------|------------|----------|
| 跨设备取消任务 → 另一台查看 | 30 秒内不同步（worst case 30+ 秒） | 10 秒内同步 |
| 跨设备开始任务 → 另一台查看 | 30 秒内不同步 | 10 秒内同步 |
| watch 断开期间 | 完全失同步 | 10 秒 activeSync 兜底 |
| fetchDelta 云函数不可用 | tb_running 永远不同步 | fetchRunningDelta 独立工作 |
| _updateTime 范围查询性能 | 慢（全表扫描） | 快（复合索引） |

#### Bug 2 部署说明

- **必须部署云函数** `tbMutation`（含 ensureIndexes 索引创建）
- 客户端无需重新打包（增量同步逻辑已就位在 v9.3.2 客户端代码中）
- 部署后首次调用 `tbMutation` 任一 action 会自动创建索引（幂等）

### 已知遗留（v9.3.2 范围外）

- 原生 Service 仍持有已暂停的 timer（已通过 A + B + C 静默期 + maxElapsed 校验防御，但根本方案是让 Service 改为"被动显示云端数据"，非本版本范围）
- Watchdog 雪崩治理 v0.0.11 限频 6 次/小时仍生效

---

## v9.3.1（悬浮窗架构重构：原生 Service 成为定时器唯一事实来源）

> ⚠️ **v9.3.1 是一次根本性架构改造**：把"悬浮窗定时器状态"的所有权从 WebView 的 `runningTasks` Map 收回，交给 Android 原生 `FloatingTimerService` 统一管理。WebView 沦为纯镜像，不再是事实来源。**修复了 30+ 分钟后任务消失 / 计时被吞 / 点击开始重置悬浮窗 的核心 bug。**

### 根因（v9.3.0 之前架构）

1. **双状态不同步**：悬浮窗状态同时存在于 4 个独立存储（Java `timerMap` / JS `runningTasks` / 云端 `tb_running` / SharedPreferences），缺乏单一事实来源（SSOT）
2. **Push 机制不可靠**：广播 + 60 秒 SharedPreferences 失效窗口在 WebView 重建时序下极易丢失
3. **同名 timer reset 隐患**：`startFloatingTimer` 在同名 timer 存在时直接 `removeTimer` + 重置 `startTime`，用户已计时的时长被静默丢弃
4. **多进程游戏漏检**：`isInAssociatedApp` 用 `process.processName.equals(appPackage)` 严格相等匹配，《第五人格》的 `com.netease.idv:core` 子进程会漏检
5. **JS 时钟漂移**：`stopTask/cancelTask` 用 JS 自己算的 elapsed（`elapsedTime + Date.now() - startTime`），WebView 暂停期间时钟不准

### 核心改造（v9.3.1 五大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **SSOT：原生 Service 是唯一事实来源** | `FloatingTimerService.timerMap` + 磁盘持久化（每 5 秒刷盘），WebView 只是镜像 |
| **2** | **拉模型取代 Push** | 新增 `getAllActiveFloatingTimers` / `getTimerElapsedByName` / `getAllPendingFloatingTimerEvents` 三个 JS 拉取接口，JS 主动查询而非被动接收广播 |
| **3** | **ACK 确认机制** | JS 处理完事件后通过 `ackFloatingTimerEvent` 回传确认，原生层才清理该事件，TTL 从 60 秒延长到 30 分钟 |
| **4** | **重试队列取代固定延迟** | `scheduleRetry` 最多重试 15 次（3 秒），配合 JS 端 `waiting/applied` 返回值，解决"500ms 固定延迟不够"问题 |
| **5** | **同名 timer 绝不 reset** | `startTask` 启动前先查原生是否有同名 timer 残留，若有则复用 `preservedElapsed`，**绝不重置 startTime** |

### 修复项（v9.3.1）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **磁盘持久化** | [FloatingTimerService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java) 新增 `PERSIST_PREFS` + `persistTimersToDisk()` + `restoreTimersFromDisk()`，5 秒刷盘一次，进程死亡后重启可完整恢复 |
| **2** | **单例模式 + 拉模型接口** | `FloatingTimerService.getInstance()` + `getAllTimerStates()` + `getTimerElapsedByName(taskName)` + `findTimer(taskName)`，供 WebAppInterface 暴露给 JS |
| **3** | **新 JS 接口** | [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) 新增 4 个 `@JavascriptInterface`：`getAllActiveFloatingTimers` / `getTimerElapsedByName` / `ackFloatingTimerEvent` / `getAllPendingFloatingTimerEvents` |
| **4** | **持久事件队列** | `EVENT_PREFS` + 30 分钟 TTL + `saveEventToDisk` / `ackEvent` / `getAllPendingEvents`，替代原 `floating_timer_state` 的 60 秒窗口 |
| **5** | **重试队列** | [MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java) `scheduleRetry(jsCode, attempt)` 最多重试 15 次（200ms 间隔），接收 `waiting` 返回值继续重试 |
| **6** | **同名 timer 复用** | [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js) `startTask` 启动前先调 `getAllActiveFloatingTimers` 查询，若有同名 timer 且 `elapsed > 0` 则用 `preservedElapsed` 构造 `runningData`，**不再调用 `startFloatingTimer` reset** |
| **7** | **多源状态恢复** | `__onFloatingTimerAction` 找不到 `runningTask` 时主动从原生 Service → 云端 `DAL.loadRunningTasks` 两级拉回，不再静默 `return`；新增返回值 `'applied' / 'waiting' / 'ok'` |
| **8** | **多进程游戏识别** | `isInAssociatedApp` 改为 `process.processName.equals(appPackage) || process.processName.startsWith(appPackage + ":")`，兼容 `:core`、`:push` 等子进程 |
| **9** | **权威时长** | `stopTask` / `cancelTask` 优先用 `window.Android.getTimerElapsedByName(task.name)` 取原生层时长，失败再兜底用 JS 算 |
| **10** | **`startFloatingTimer` 新增 `taskId` 参数** | [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) + [FloatingTimerService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java) `TimerInfo.taskId` 字段，用于 WebView 拉回时精确匹配 |
| **11** | **广播携带 `eventId`** | [MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java) `floatingTimerReceiver` 增加 `eventId` extra，JS 端 `ackFloatingTimerEvent(eventId)` 回传确认 |
| **12** | **保留 elapsed 的 startTime 倒推** | `FloatingTimerService.onStartCommand` 在同名 timer 存在时计算 `preservedElapsed = getCurrentElapsedTime(old)`，新 `startTime = now - preservedElapsed`（正计时）/ `new endTime = startTime + duration`（倒计时） |

### 关键设计原则

| 场景 | v9.3.0 之前 | v9.3.1 |
|------|------------|--------|
| 30 分钟后 WebView 重建 | `runningTasks` 为空 → 任务显示"未开始" | 原生 Service 持久化 + JS 多源拉回 → 任务正常显示 |
| 点击"开始"按钮（task 误判为未开始时） | 原生 `removeTimer` + 0 重置 → 30 分钟被吞 | 复用 `preservedElapsed` → 保留已计时时长 |
| 广播丢失 | 60 秒窗口失效 → 事件丢失 | 30 分钟 TTL + ACK 机制 → 可靠 |
| WebView 加载未就绪 | 500ms 固定延迟不够 | `scheduleRetry` 最长 3 秒自适应 |
| 多进程游戏（第五人格等） | 子进程名不匹配 → 走错分支 | `startsWith(packageName + ":")` 兼容 |
| `stopTask` 时长不准 | JS 时钟漂移 / WebView 暂停期间 | 原生层权威时长 |

### 用户可见改善

| 现象 | v9.3.0 之前 | v9.3.1 起 |
|------|------------|----------|
| 游戏类任务 30 分钟后回到 TimeBank | 任务消失 / 无法结束 | 任务正常显示已计时 / 可正常结束 |
| 点击"开始"按钮（误判为未开始时） | 重置悬浮窗、丢弃已计时时长 | 复用已计时时长、不重置 |
| 长时间后台后回来 | 时长显示不准确 | 准确显示原生权威时长 |
| 多进程游戏点击悬浮窗 | 误判"不在游戏内"→ 走错分支 | 准确识别游戏前后台 |
| `__onFloatingTimerAction` 找不到 runningTask | 静默 return + UI 错乱 | 主动从原生/云端拉回 + UI 错误提示 |

### 影响范围

- 修改 4 个文件：
  - [FloatingTimerService.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java)（约 +270 行：持久化 + 拉模型 + ACK）
  - [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)（+130 行：4 个新接口）
  - [MainActivity.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java)（+90 行：scheduleRetry + 事件队列）
  - [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js)（+220 行：`__onFloatingTimerAction` 重构 + `startTask`/`stopTask`/`cancelTask` 集成原生时长）
- 9 处版本号同步 v9.3.0 → v9.3.1（APP_VERSION / CACHE_NAME / index.html 4 处 / build.gradle versionCode 49→50 / AGENTS.md / sw.js）
- 无需部署：纯客户端变更，不涉及云函数

---

## v9.3.0（同步链路幂等修复：1003→410 幂等 + 1003 静默化 + recordFailure 错误序列化）

> ⚠️ **v9.3.0 是一次"链路层兜底修复"**：云函数 `tbMutation` 在记录不存在时（`stopTask / deleteTask / updateTransaction / deleteTransaction`）返回 1003 错误码，导致客户端 `MutationFailureHandler` 持续记录失败、触发回滚、堆积"数据不存在"红标。v9.3.0 把"记录不存在"从错误码改为幂等成功，客户端不再误判。

### 根因

1. **云函数 `tbMutation` 非幂等**：`stopTask` 在 `tb_running` 中无该 taskId 时返回 `{ code: 1003, message: '数据不存在' }`；客户端视为失败，触发回滚 + toast 提示
2. **失败队列累积"不存在"条目**：用户已成功停止任务（旧记录已被清理），再次同步时 `stopTask` 返回 1003 → 失败队列 +1 → 状态条显示 "失败队列 5" 红标
3. **`recordFailure` 序列化不可读**：错误体 `{ error: {...} }` 走 `String()` 默认转换 → 日志显示 `[object Object]`，调试困难
4. **1003 业务错误扰民**：`callMutation` 对所有 1003 弹 toast "❌ 数据不存在"，但用户已经成功操作

### 修复项（v9.3.0）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **云函数 1003 → 410 幂等化** | [cloudbase-functions/tbMutation/index.js](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js) `stopTask / deleteTask / updateTransaction / deleteTransaction` 4 个 action 在记录不存在时改返回 `{ code: 410, message: '记录不存在（幂等）' }`，客户端视为成功 |
| **2** | **1003 业务错误静默化** | [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) `callMutation` 中 1003 仍记录失败（兜底防护）、仍触发回滚，但**不再弹 toast 打扰用户** |
| **3** | **`recordFailure` 错误序列化** | `MutationFailureHandler.recordFailure` 错误序列化增加 `error.stack` + `JSON.stringify` 兜底，杜绝 `[object Object]` |
| **4** | **9 处版本号同步** | APP_VERSION / CACHE_NAME / index.html 4 处 / build.gradle versionCode 48→49 / AGENTS.md / sw.js |

### 关键设计原则

| # | 原则 | 体现 |
|---|------|------|
| **1** | **幂等优于报错** | 重复 `stopTask` 不应算错误，应视为成功（操作已完成的目标状态） |
| **2** | **静默兜底优于弹窗** | 1003 业务错误真实存在但不影响用户操作时，优先静默（仍记录失败，便于排查） |
| **3** | **可读日志优于隐式序列化** | `recordFailure` 错误体必须可读，调试时不浪费时间在 `[object Object]` 上 |

### 用户可见改善

- **失败队列红标**：从"持续累积'数据不存在'条目" → "不再累积"
- **错误 toast**：从"❌ 数据不存在"反复弹 → "静默通过"
- **调试日志**：从 `[object Object]` → 可读的 stack + JSON
- **兼容旧数据**：升级前已有的 1003 失败记录保留；升级后新增走新路径

### 影响范围

- 修改 5 个文件：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（`callMutation` 1003 静默化 + `recordFailure` 序列化增强）
  - [app-auth.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js)（同步代码）
  - [app-reports.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js)（同步代码）
  - [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java)（+27 行：相关 Java 端接口调整）
  - [cloudbase-functions/tbMutation/index.js](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js)（4 个 action 1003→410 幂等化）
- 9 处版本号同步 v9.2.3 → v9.3.0
- 需部署：云函数 `tbMutation`（**必须部署**——4 个 action 行为变更）

---

## v9.2.3（冷启动不加载数据修复 + 监听状态显示器优化）

> ⚠️ **v9.2.3 是一次热修复（hotfix）**：用户在 PWA 控制台反馈"冷启动后任务/交易列表为空，但状态显示已同步"，必须手动"关闭重开"才能恢复。同时"监听状态指示器"无法区分"已同步"和"已连接"，用户体验模糊。

### 修复项（v9.2.3）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **冷启动不加载数据修复** | [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) `DAL.init()` 增加 2 次重试（200/600ms 退避）；`handlePostLoginDataInit` 移除 `if (hasData)` gate，始终走完整数据加载链 |
| **2** | **监听状态显示器升级 5 态** | 拆分 🟢 "已同步"（数据加载完成）和 🟡 "已连接"（Watch 建立但数据未到）两态；过渡动画 + 100ms 防抖；保活中显示"重连倒计时" |
| **3** | **自愈探针成功后补偿同步** | 断网期间云端产生的新数据不再丢失——探针恢复后立即调用 `reconcileCloudAfterWatch` 拉取 delta |
| **4** | **登出重置降级状态** | 退出登录时清零 `__watchDegradeStatus`，避免再次登录时残留旧 `paused` 状态 |
| **5** | **Android `restartApp()` 桥接** | [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) 新增 `@JavascriptInterface restartApp()`，`FLAG_ACTIVITY_CLEAR_TASK + startActivity + finishAffinity + killProcess` 实现真正"应用重启" |

### 用户可见改善

- **冷启动+断网恢复双场景**：均无数据丢失
- **监听状态显示**：从"🟢 已同步（但列表为空）" → "🟡 已连接 → 🟢 已同步" 两阶段
- **诊断面板倒计时**：每秒自动更新
- **右侧图标**：从"重置 Watch / 手动同步"两个无用按钮 → 单一"🔄 重启"按钮（彻底关闭+重新启动进程）

### 影响范围

- 修改 4 个文件：[app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js) / [app-auth.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js) / [WebAppInterface.java](file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java) / [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)
- v9.2.3 是热修复，无独立 commit（与 v9.3.0 同期合并发布）

---

## v9.2.2（Watch 生命周期修复：beforeunload 清理 + Watchdog 时序 + 重建心跳重置）

> ⚠️ **v9.2.2 修复 3 类 PWA 控制台连锁报错**：`no realtime listener found for watchId`（大量重复）→ `WebSocket close(reason: 'No Realtime Listeners')` → `Watchdog 心跳超时循环（#1→#4/6）`。根因是 `beforeunload` 未清理 Watch + Watchdog 补偿同步与重建竞态。

### 根因

1. **`beforeunload` 不清理 Watch**：[app-auth.js:2991-2997](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991) 仅未登录时 `saveLocalCache()`；已登录用户关闭/刷新页面时 5 个 WebSocket 不主动 close → 服务端推送数据到已失效 watchId → SDK 报 "no realtime listener found"
2. **Watchdog 补偿同步时序竞态**：[app-1.js:1216-1220](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1216) 8 秒后 `reconcileCloudAfterWatch`，但 `checkAndRebuildWatchers(true)` 含 ~10.55s 动态退避 + 1s 错峰订阅 → 8 秒时新 Watch 未建立完成
3. **Watchdog 重建后心跳时间戳问题**：[app-1.js:1212-1214](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1212) `unsubscribeAll` 清零 `watchLastEventTime`，`.watch()` 同步返回后立即设为 `Date.now()`；但 `onChange` 首次触发延迟时 15s 后再次检查可能误判超时

### 修复项（v9.2.2）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **`beforeunload` 清理 Watch** | [app-auth.js:2991-2997](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2991) 已登录分支加 `DAL.unsubscribeAll()` |
| **2** | **Watchdog 补偿同步延后到重建完成** | [app-1.js:1216-1220](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1216) `reconcileCloudAfterWatch` 改用 Promise chain 而非固定 8 秒 setTimeout |
| **3** | **Watchdog 重建后心跳重置** | [app-1.js:1212-1214](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1212) `checkAndRebuildWatchers(true)` 完成后显式 `watchLastEventTime = Date.now()` |
| **4** | **9 处版本号同步** | APP_VERSION / CACHE_NAME / index.html 4 处 / build.gradle versionCode 46→47 / AGENTS.md / sw.js |

### 用户可见改善

- **控制台 `no realtime listener found`**：从 700+ 出现 → 几乎不出现
- **僵尸 watchId 推送**：页面关闭/刷新后立即清理
- **Watchdog 60s 循环**：从"超时→重建→再超时" → "重建后完整 60s 窗口"
- **雪崩循环**：从 5+ 次/小时 → 1h 最多 6 次（v9.0.11 限频 + v9.2.2 强化）

### 影响范围

- 修改 3 个文件：
  - [app-auth.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js)（1 处：beforeunload 加 Watch 清理）
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（2 处：Watchdog 时序 + 重建心跳重置）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html) + [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js) + [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle)（版本号同步）
- 9 处版本号同步 v9.2.1 → v9.2.2
- 无需部署云函数

---


## v9.0.12（Watch onChange 心跳补全 + 客户端 ID 端到端 + 幽灵变量治理）

> ⚠️ **v9.0.12 是 v9.0.11 修复不彻底的彻底清理**：v9.0.11 修复了 5 类连锁问题，但通过对 PWA 控制台日志的深入分析，发现还有 3 类真 Bug 未修复或修复不彻底——本次彻底拆解。

### 核心问题（开发者对话原文摘录）

> "请你深入项目内部分析日志反应的问题是否真实存在。并思考解决方案" → "立即以v9.0.12版本号开始实施上述修复"

### 根因（v9.0.11 修复不彻底的部分）

1. **真 Bug 1：`isImportMode is not defined`（v9.0.11 漏修）**
   - [app-1.js:3966](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3966) Transaction onChange 读取 `isImportMode` 抛 ReferenceError
   - `isImportMode` 在文件中**仅作隐式全局**赋值，从未用 `let` 声明
   - 非严格模式下"赋值未声明变量"静默创建全局，但"读取未声明变量"必抛错
   - PWA 启动后未调过 `importFromBackup` 时，onChange 第一次读即抛错 → Transaction/Daily 数据未进数组、余额不更新、习惯连胜不重算

2. **Watch 60s 雪崩修复不彻底**
   - v9.0.11 声称"5 处 onChange 恢复心跳刷新"，但实际**只补 3 处**（Task / Running / Daily）
   - **遗漏 2 处**：
     - **Transaction onChange** [app-1.js:3947](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3947) — 漏加
     - **Profile onChange** [app-1.js:4119](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4119) — 显式注释"v8.2.17 移除心跳更新"，与 v9.0.11 设计矛盾
   - 触发链：stopTask 路径上，Transaction 变更但无心跳刷新 → 60s 后 watchdog 误判 → 整个连接重建 → 雪崩

3. **Running 事件来源识别失败**（3 处缺一不可的根因链）
   - 客户端 [app-2.js:4450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4450) `runningData` 不含 `clientId`
   - 客户端 [app-1.js:3567-3582](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3567) `DAL.startTask` callMutation data 未传 `clientId`
   - 云函数 [tbMutation/index.js:275-286](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L275) 写入 `tb_running` 的 doc 缺 `clientId` 字段
   - 客户端 watch handler `remoteClientId = doc.clientId || doc.data?.clientId` 永远取到 undefined
   - `undefined === 'client_xxx'` 为 false → 走"其他设备"分支 → 重复 add

4. **僵尸 WatchId**
   - [app-1.js:4224-4280](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4224) `unsubscribeAll` 800ms 固定等待不足
   - 客户端 watchers[key]=null 后，SDK 内部 WebSocket 复用时，老 watch 的 unsubscribe 与新 watch 的 subscribe 消息在网络层交错
   - 服务器可能先收到新 subscribe 后才收到老 unsubscribe，导致老 watchId 仍然订阅中
   - 800ms 固定等待不足以应对网络拥塞

5. **completionCount 落后 1 笔**（v9.0.11 部分修复）
   - 日志证据：`[completionCount 修复] taskId=1761905981691, 交易数=275, 存储=274 → 修正为275`
   - v9.0.11 已实现"修 + 写回云端"，但 `DAL.addTransaction` 成功后**没有立即更新本地 `task.completionCount`**
   - 必须等 watchdog 触发的 activeSync（最长 60s）才被修复
   - 三处修复循环（[app-1.js:2229-2250](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2229) / [4537-4555](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4537) / [5107-5134](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5107)）逻辑完全相同，重复维护

### 修复项（v9.0.12）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1（P0）** | **`isImportMode` 显式声明** | [app-1.js:42](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L42) `let isImportMode = false;`（顶部 clientId 声明区附近），7 处隐式赋值不变 |
| **2A（P0）** | **Transaction onChange 补心跳刷新** | [app-1.js:3949-3951](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3949) 开头加 `watchLastEventTime.transaction = Date.now();` |
| **2B（P0）** | **Profile onChange 补心跳刷新** | [app-1.js:4121-4123](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4121) 删 v8.2.17 旧注释 + 加 `watchLastEventTime.profile = Date.now();` |
| **3A（P1）** | **客户端 runningData 含 clientId** | [app-2.js:4450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4450) `runningData` 构造时加 `clientId: clientId` |
| **3B（P1）** | **DAL.startTask 传 clientId** | [app-1.js:3579-3581](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3579) callMutation data 加 `clientId: data.clientId \|\| clientId` |
| **3C（P1）** | **云函数 tbMutation.startTask 写 clientId** | [tbMutation/index.js:282-284](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L282) 写入 doc 加 `clientId: data.clientId \|\| runningData.clientId \|\| null` |
| **3D（P1）** | **onChange 端 null-safe 防御** | [app-1.js:4063, 4073, 4083, 4089](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4063) `if (remoteClientId && remoteClientId === clientId)` 兼容旧云端数据（无 clientId 字段） |
| **4（P1）** | **unsubscribeAll 动态退避** | [app-1.js:4266-4272](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4266) 800ms 固定 → 800ms × 1.5^n，最多 5 次（总 ≤ 11.5s） |
| **5A（P2）** | **addTransaction 即时更新本地 completionCount** | [app-1.js:3414-3418](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3414) 提交云函数后立即 `__fixCompletionCount(taskId, +1)`，onRollback 对称 -1 |
| **5B（P2）** | **抽取公共 `__fixCompletionCount()`** | [app-1.js:1150-1177](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1150) 统一 activeSync / loadAll / handleIncrementalSync 三处重复逻辑（消除 ~30 行重复代码） |
| **6** | **11 处版本号同步** | APP_VERSION / CACHE_NAME / index.html title / version-subtitle / 关于页 / 用户日志 / build.gradle versionName+versionCode / AGENTS.md |

### 关键设计原则（v9.0.12 三大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **声明优于隐式** | `isImportMode` 显式 `let` 声明，消除幽灵变量导致的 ReferenceError |
| **2** | **端到端优于局部** | Running 事件 clientId 3 处端到端修复（客户端 → 客户端 → 云端），不能只改一端 |
| **3** | **抽公共优于复制粘贴** | `__fixCompletionCount()` 统一 3 处重复逻辑，未来加新场景不再需要复制 30 行代码 |

### 用户可见改善

| 现象 | 修复前 | 修复后 |
|------|--------|--------|
| `isImportMode is not defined` 错误 | 必抛 → Transaction/Daily 数据未处理 | 静默通过 |
| Watch 60s 雪崩 | 1 分钟一次 → 5+ 次/小时 | 业务事件持续刷新心跳 → 几乎不触发 |
| 本机 startTask 被错认为"来自其他设备" | runningTasks 重复 add | 正确识别本机 → 跳过 |
| 僵尸 watchId 持续推送 9 次 | 出现 | 几乎不出现（动态退避留足 ACK 窗口） |
| completionCount 落后 1 笔 | 60s 后才修复 | 立即修复（addTransaction 成功后即 +1） |

### 影响范围

- 修改 4 个文件：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（6 处：isImportMode 声明、Transaction onChange、Profile onChange、DAL.startTask、unsubscribeAll、addTransaction + __fixCompletionCount 抽取 + 3 处调用替换）
  - [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js)（1 处：runningData）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（1 处：用户日志 v9.0.12 条目）
  - [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js)（2 处：注释 + CACHE_NAME）
  - [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle)（2 处：versionCode 42→43 + versionName）
- 修改 1 个云函数文件：
  - [cloudbase-functions/tbMutation/index.js](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js)（1 处：startTask 写 clientId）
- 11 处版本号同步到 v9.0.12
- 需部署：云函数 `tbMutation`（startTask 写 clientId 字段新增）

### 关键 Bug 防御

| 场景 | v9.0.11 之前 | v9.0.12 |
|------|-------------|---------|
| PWA 启动后第一次 Transaction 推送 | ReferenceError → 数据丢失 | 正常处理 |
| stopTask 60s 后 watchdog 误判 | 触发雪崩 | 心跳持续刷新 |
| 本机 startTask 事件 | 重复 add | 正确识别本机 |
| 弱网时 unsubscribe | 僵尸 watchId | 动态退避等 ACK |
| completionCount 落后 | 60s 后修复 | 立即修复 |

---

## v9.0.11（PWA 端控制台 bug 反馈修复 + Watch 雪崩治理）

> ⚠️ **v9.0.11 是一次"机制层修复"**：把多个互相叠加的脆弱性（fetchDelta 自由变量 / SDK 加载失败 / Watch 60s 雪崩 / completionCount 修而不写 / 按钮 ID 错位 / AI 服务刷屏）一次性拆解。问题不是某个独立 bug，而是一组**机制层面的脆弱性叠加**——本版本一次性把它们拆解、修复。

### 核心问题（开发者对话原文摘录）

> PWA 端在 CloudBase SDK 启动后几分钟内出现 5 类连锁报错：[DAL.fetchDelta] currentUid is not defined 反复出现 / initCloudBase SDK not available 反复刷屏 / Watchdog 心跳超时 5+ 次循环 / completionCount 反复 +1 修复 / #registerButton 关键元素不存在。

### 根因（v9.0.10 之前架构）

1. **真 Bug 1**：`DAL.fetchDelta`（[app-1.js:4179](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4179)）引用了自由变量 `currentUid`，但函数顶部没有声明（同文件其他方法如 `saveTask` 都有声明）→ 第一次增量同步必抛 `ReferenceError` → waitForCloudBase 静默吞掉 → 错误退化为 warn
2. **SDK 加载连环失败**：本地 SDK `ERR_CONNECTION_RESET`，CDN 兜底也失败；`initCloudBase` 在 4s 内打 60+ 行错误；每次重建 watcher 又触发 initCloudBase 失败
3. **Watch 60s 雪崩**：`onError` 把 `watchLastEventTime=0`，v8.2.17 后 `onChange` 不再刷新心跳 → 60s 后 watchdog 误判心跳超时 → 触发 checkAndRebuildWatchers + 2s 后 reconcileCloudAfterWatch 拉增量 → 增量因 #1 失败 → 又触发 scheduleWatchReconnect → 死循环 → **5 次循环产生 700+ 行日志**
4. **completionCount 修而不写**：三处"修复"循环（activeSync / loadAll / handleIncrementalSync）只改内存；`DAL.saveTask` 和 `tbMutation.saveTask` 的 taskData 都不写 `completionCount` 字段 → 下次 loadAll 又读到 stored=N-1，循环报警
5. **按钮 ID 错位**：`setupTaskModalEventListeners` 绑定了 `#registerButton` / `#loginButton`，但 index.html 实际是 `#startSyncButton` / `#emailLoginBtn` / `#emailRegisterBtn`，且该函数是死函数没人调；`setAuthLoading` 用裸 getElementById，按钮不存在时抛 `Cannot set properties of null`
6. **AI 服务 3s 刷屏**：`app-reports.js:8171` setInterval 3 秒一报 "CloudBase 尚未初始化"

### 修复项（v9.0.11）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **真 Bug 修：** `DAL.fetchDelta` 补 currentUid | [app-1.js:4171](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4171) 函数顶部加 `const currentUid = await this.getCurrentUid(); if (!currentUid) return null;` |
| **2A** | **unsubscribeAll 真正等 ws 关闭** | [app-1.js:4126](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4126) 批量收集 close() Promise + 800ms 等待服务器 ACK + 状态重置 |
| **2B** | **watchdog 限频 + 自愈探针** | [app-1.js:1100](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1100) `MAX_WATCHDOG_ACTIONS_PER_HOUR=6`；1h 超过 6 次进入自愈探针模式（60s 一次探活）；`__watchdogActionsInFlight` 限并发；补偿同步延后 8s |
| **2C** | **5 处 onChange 恢复心跳刷新** | [app-1.js:3825](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3825) / 3890 / 3982 / 4059 / 4128；v8.2.17 移除后导致 watchdog 误判，业务事件本身就是"连接还活着"的最真实信号 |
| **3A** | **引入 whenCloudBaseReady** Promise | [app-1.js:336](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L336) 单例 Promise + 5s 超时静默 |
| **3B** | **initCloudBase 失败仅首次打日志** | `__initCloudBaseLogged` 标记；`waitForCloudBase` 扩到 150×200ms=30s |
| **3C** | **refreshLoginState 改用 await** | [app-1.js:655](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L655) 用 whenCloudBaseReady 替代裸 null 检查 + warn |
| **4A** | **客户端 saveTask 写 completionCount** | [app-1.js:3135](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3135) taskData 加 `completionCount: task.completionCount \|\| 0` 字段 |
| **4B** | **云函数 tbMutation.saveTask 同步加字段** | [tbMutation/index.js:216](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L216) 双向端到端修复 |
| **4C** | **三处修复循环改"修 + 写回"** | [app-1.js:2232-2250](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2232-L2250) activeSync / [4537-4555](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4537-L4555) loadAll / [5112-5134](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5112-L5134) handleIncrementalSync |
| **5A** | **setupTaskModalEventListeners 改用真实 ID** | [app-auth.js:2661-2668](file:///d:/TimeBank/android_project/app/srcrc/main/assets/www/js/app-auth.js#L2661-L2668) `#registerButton` → `#emailRegisterBtn` / `#loginButton` → `#emailLoginBtn` |
| **5B** | **setAuthLoading null-safe** | [app-auth.js:927-936](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L927-L936) ID 数组循环 + null 跳过 |
| **5C** | **解除死函数** | [app-auth.js:2672-2675](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2672-L2675) DOMContentLoaded 调用 `setupTaskModalEventListeners()` |
| **6A** | **updateAIInsightCardStatus 等 SDK** | [app-reports.js:8086-8123](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L8086-L8123) `await whenCloudBaseReady(3000)` + try/catch 包裹 getStatus |
| **6B** | **setInterval 间隔 3s → 30s** | [app-reports.js:8171](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L8171) |
| **7** | **11 处版本号同步** | APP_VERSION / CACHE_NAME / index.html title / version-subtitle / 关于页 / 用户日志 / build.gradle versionName+versionCode / AGENTS.md |

### 关键设计原则（v9.0.11 三大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **修而不降级** | Watch 出问题优先修（限频 + 探针），降级是最后兜底，绝不轻易"暂停" |
| **2** | **写云端是终极权威** | completionCount 不仅要在内存修，更要写回云端顶层字段——这恰好补完 v9.1.0 的"云端是唯一权威源"原则 |
| **3** | **失败必须用户感知 + 静默优化平衡** | 真实 Bug（fetchDelta 抛错）要显示给用户；启动期噪音（SDK 加载失败、refreshLoginState 早于 SDK）要静默等待 |

### 用户可见改善

- **控制台错误行数**：启动 5 分钟内从 **700+** 降到 **< 20**
- **completionCount 反复报警**：从"5 个 taskId 持续刷屏" → "首次自动修复后不再出现"
- **Watch 雪崩**：从"60s 周期循环触发" → "1h 最多 6 次，触发上限后自愈探针接管"
- **AI 服务噪音**：从"每 3 秒一报" → "静默等 SDK + 30 秒一次"
- **按钮响应**：邮箱登录按钮可正常点击（之前静默无响应）

### 影响范围

- 修改 3 个文件：app-1.js、app-auth.js、app-reports.js
- 修改 1 个文件：tbMutation 云函数（saveTask 字段）
- 11 处版本号同步到 v9.0.11（versionCode 41→42）
- 需部署：云函数 `tbMutation`（completionCount 字段新增）

---

## v9.2.0（使用偏好独立化 + 报告页 AI 伙伴合并 + 推送自动化）

> ⚠️ **v9.2.0 是 v9.1.0 "业务数据云端化" 主线之外的"使用偏好独立化"分支**。v9.1.0 解决了"业务数据多端漂移"问题；v9.2.0 解决"使用偏好多端打架"问题——把"使用偏好"和"业务数据"清晰拆开，前者按设备个性化、后者统一云端。

### 改造 A：报告页 AI 伙伴（时光）+ AI 洞察报告 合并卡片

> 用户原话："进入9.1.0版本更新（实施时版本号变更为 v9.2.0）。将报告页面的AI洞察报告和时光卡片合并，重新设计一张卡片。并纳入设置项'自定义报告卡片'中，并默认置于报告页最后一张卡片。"

#### 合并设计

| 区域 | 默认状态 | 行为 |
|------|---------|------|
| 卡片头部（🌟 头像 + 名字 + 今日问候） | 始终显示 | 点击 → 打开 `openCompanionChat()` 聊天浮层 |
| 右上角"▼ AI 洞察报告"按钮 | 默认收起 | 点击 → 展开/收起下半部分 AI 报告区 |
| AI 报告区 | 收起 | 展开后显示：周期选择 + 模型选择 + 生成报告按钮 + AI 认知记忆 |
| 红点 | 复用 v8.2.0 时光卡片 `.unread` 逻辑 | 首次/重新生成每日问候时显示 |

#### 关键代码变更

| # | 变更 | 位置 |
|---|------|------|
| 1 | **HTML 卡片合并** | [index.html:462-524](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L462) 删除原 `ai-insight-section` + `companion-card` 两个独立 div，合并为单张 `.ai-companion-card` (id="aiCompanionCard")，内部由 `.ai-companion-header`（点击进聊天）+ `.ai-companion-ai-panel`（可展开）组成 |
| 2 | **CSS 合并卡片样式** | [main.css:6332-6530](file:///d:/TimeBank/css/main.css#L6332) 新增 `.ai-companion-card` / `.ai-companion-header` / `.ai-companion-toggle` / `.ai-companion-ai-panel` 完整样式（含 dark mode + glass mode 适配） |
| 3 | **JS 引用统一改为 aiCompanionCard** | `app-reports.js` × 2 处 + `ai-service.js` × 1 处，将 `getElementById('companionCard')` → `'aiCompanionCard'` |
| 4 | **展开/收起交互** | [app-1.js:6438-6457](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6438) 新增 `toggleAICompanionPanel()` —— 切换 `.expanded` class + 更新按钮文案（"▼ AI 洞察报告" ↔ "▲ 收起报告"），首次展开时触发 `updateAIInsightCardStatus()` 刷新 AI 服务状态 |
| 5 | **纳入卡片管理** | [app-1.js:6347](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6347) `DEFAULT_CARD_ORDER` 末尾追加 `'aiCompanion'` —— 卡片管理弹窗 (`renderCardManagerList`) 自动通过 `reportTab.querySelectorAll('.report-section[data-card-id]')` 收集到新卡片 |
| 6 | **末位默认位置策略** | 旧用户 `tb_card_layout` 中没有 `'aiCompanion'` 时，自动把它 push 到末尾（不动用户已有顺序） |

#### 关键设计原则（三大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **UI 合并 ≠ 能力合并** | `COMPANION_SERVICE` / `AI_SERVICE` / `COGNITION_SERVICE` 三个云端服务 100% 保留，只合并 DOM 容器和入口 |
| **2** | **点击区域互不干扰** | 头部（点击进聊天） vs 切换按钮（点击展开/收起）通过 `event.stopPropagation()` 隔离；AI 报告区内的 select / button 全部 stopPropagation |
| **3** | **默认折叠，不打扰** | 卡片默认显示问候 + 小小的"▼ AI 洞察报告"入口，需要时再展开（不像 v8.2.0 ~ v9.0.10 永远全展开占空间） |

#### 用户可见改善

| 现象 | v9.1.0 之前 | v9.2.0 起 |
|------|--------|--------|
| 报告页卡片数量 | 6 张 | 5 张（更聚焦） |
| 「时光」和「AI 洞察报告」位置 | 被独立卡在中间，视觉割裂 | 合并为一张，AI 工具区默认收起 |
| 自定义报告卡片 | 4 张可选 + 2 张不可改 | 5 张均可拖动/隐藏 |
| 老用户升级后顺序 | 不会被打乱 | 新卡片自动追加到末位，已有顺序保留 |

#### 兼容性检查清单

- [x] 旧 `companionCard` id 全局重命名（3 处：app-reports.js × 2，ai-service.js × 1）
- [x] 旧 `ai-insight-section` class 在合并卡片上不再生效（CSS 已重置）
- [x] `updateAIInsightCardStatus` / `initAICognitionUI` 通过原 id 仍能找到目标元素（保留 id 命名）
- [x] 卡片管理弹窗自动识别新 `data-card-id="aiCompanion"`
- [x] 旧用户 localStorage 中 `tb_card_layout` 没有新 id 时自动追加末位
- [x] 玻璃通透模式 / dark mode 视觉一致
- [x] 聊天浮层（独立 modal）行为不变

---

### 改造 B：`collapsedCategories` 改为每端独立

> 和 `categoryOrder` 保持一致——"业务数据"统一、"使用偏好"按设备个性化。用户原话"分类折叠状态应当与分类栏顺序一致保持每端独立"。

#### 改造前后对比

| 维度 | v9.0.x 之前 | v9.2.0 起 |
|------|------------|----------|
| 存储位置 | 云端 `profile.collapsedCategories` + 内存 Proxy 自动同步 | `localStorage['collapsedCategories']` + 内存普通 Set |
| 同步机制 | `_createSyncSetProxy` Proxy 拦截 add/delete/clear → 自动 `_syncProfileFieldToCloud` | `saveCollapsedCategories()` → 写 localStorage |
| 跨端行为 | 收起/展开操作立即同步到所有端 | 仅本端生效，其他端不影响 |
| 数据迁移 | 无需迁移 | localStorage 优先 → 否则用入参作本端初始值（首次升级从云端读） |

#### 关键代码变更

| # | 变更 | 位置 |
|---|------|------|
| 1 | `setCollapsedCategories` 重写 | [app-1.js:5294-5327](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5294-L5327) —— localStorage 优先，否则用入参作初始值并持久化 |
| 2 | 新增 `saveCollapsedCategories` 助手 | [app-1.js:5330-5336](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5330-L5336) —— 写 localStorage |
| 3 | 变量声明改为普通 Set | [app-1.js:5346](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5346) —— `let collapsedCategories = new Set()` |
| 4 | `toggleCategory` 增 save 调用 | [app-2.js:1873](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L1873) —— `saveCollapsedCategories()` |
| 5 | `confirmCategoryRename` 改名时 save | [app-1.js:8061](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8061) —— 改名后写 localStorage |
| 6 | `maybeCleanupDemoDataOnFirstUse` 改 Set | [app-1.js:6257-6258](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6257) —— 不再 Proxy |
| 7 | `saveLocalCache` 移除字段 | [app-auth.js:1941](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L1941) —— blob 不再含 `collapsedCategories` |
| 8 | 报告页饼图 localStorage 写入移除 | [app-reports.js:5628](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L5628) —— 改用独立 key |
| 9 | `saveData` 注释更新 | [app-auth.js:1923](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L1923) —— 不再 Proxy 同步 |
| 10 | 导入/导出保留 + 注释说明 | [app-auth.js:1091, 2269](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L1091) —— 显式导出的本端状态，导入按本端 `setCollapsedCategories` 语义生效 |

#### 首次升级迁移逻辑

```js
function setCollapsedCategories(arr) {
    // 1. 规范化入参（兼容 _.set() 包装对象 / plain object）
    let initial = ...;
    
    // 2. 关键：localStorage 优先（本端偏好）
    const saved = localStorage.getItem('collapsedCategories');
    if (saved) {
        collapsedCategories = new Set(JSON.parse(saved));
        return;  // 已有本端偏好，忽略入参
    }
    
    // 3. 本地无偏好：使用入参作为本端初始值，并立即持久化
    collapsedCategories = new Set(initial);
    saveCollapsedCategories();
}
```

**迁移流程**：
- v9.0.x 用户升级：云端 `collapsedCategories: ['工作']`、localStorage 空白
- 第一次启动 → `setCollapsedCategories(['工作'])` 来自云端 → localStorage 空白 → 使用 `['工作']` → 写入 localStorage
- 之后所有 watch/applyUIPrefs 调用都被 localStorage 拦截 → 设备完全独立
- 从此收起/展开操作**只影响本端**

#### 与 `categoryOrder` 的一致性

| 维度 | `categoryOrder` (v7.2.0) | `collapsedCategories` (v9.2.0) |
|------|------------------------|-------------------------------|
| 存储 | `localStorage['categoryOrder']` | `localStorage['collapsedCategories']` |
| 函数命名 | `saveCategoryOrder()` 等 | `saveCollapsedCategories()` |
| 加载顺序 | localStorage 优先 → 否则用入参 | localStorage 优先 → 否则用入参 |
| 同步策略 | 仅本端 | 仅本端 |
| 多端可见效果 | 每端顺序独立 | 每端折叠状态独立 |

#### 兼容性 / 边界

- **导出/导入保留**：用户从 A 端导出备份 → B 端导入，B 端如果有 localStorage 则忽略，没有则用 A 端的值作为初始
- **`saveLocalCache` 中移除字段**：避免冗余存储，单一权威源
- **`maybeCleanupDemoDataOnFirstUse` 仍保留字段清理逻辑**：删除已不存在的分类
- **`_createSyncSetProxy` 函数保留**：当前未被任何字段使用，但作为基础设施保留以备未来

#### 行为可见的破坏性变更

- v9.0.x 之前：在 A 端收起"工作"，B 端也会自动收起
- v9.2.0 起：在 A 端收起"工作"，B 端**不会**自动收起——B 端保持原有状态
- 用户首次升级时：如果 v9.0.x 之前在云端有折叠状态，所有端会同步到该状态作为初始（一次性）；之后完全独立

---

### 改造 C：版本号位置从 11 减为 9（推送自动化）

> 开发者原话："当前指令文件写11处版本号要更新，但版本号的用处有哪些，是否可以减少更新数量"——本节给出回答并落地。

#### 改造前：版本号 11 处的分类

| 用途 | 涉及位置 | 数量 |
|------|---------|------|
| **A. PWA 显示** | `index.html` `<title>` / `.version-subtitle` / 关于页 / 用户日志 | 4 |
| **B. JS 运行时常量** | `app-1.js` `APP_VERSION` | 1 |
| **C. 启动日志装饰注释** | `app-1.js` 第 6 行 APP_VERSION 后的 `[v9.1.0] 详细说明` 注释 | 1 |
| **D. Service Worker 缓存** | `sw.js` 顶部注释 / `CACHE_NAME` | 2 |
| **E. 安卓包** | `build.gradle` `versionName` / `versionCode` | 2 |
| **F. 开发文档** | `AGENTS.md` "当前版本" | 1 |

**C 和 F 实际上是装饰性重复信息**（C 重复了 B；F 重复了 B），可直接消除。

#### 改造后：11 → 9

| # | 变更 | 关键位置 |
|---|------|---------|
| **1** | **删除 APP_VERSION 后的装饰性注释** | [app-1.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6) 改为 `// [v9.2.0] 详细变更说明见 AGENTS.md`（指向唯一权威） |
| **2** | **AGENTS.md 改用占位符 + 自动注入** | [AGENTS.md:69](file:///d:/TimeBank/AGENTS.md#L69) —— 优先匹配 `v9.2.0` 占位符；其次用正则匹配 `**当前版本**：\`vX.Y.Z\`` 模式（**只匹配文件首行的当前版本号**，不会误改 changelog 章节中引用了 `**当前版本**` 的表格） |
| **3** | **pre-push-check.ps1 增加自动注入逻辑** | [scripts/pre-push-check.ps1](file:///d:/TimeBank/scripts/pre-push-check.ps1) 启动时 `Get-Content` 读取 `js/app-1.js` 的 `APP_VERSION`，回写 `AGENTS.md` |
| **4** | **更新"推送"工作流清单** | [AGENTS.md:139-152](file:///d:/TimeBank/AGENTS.md#L139-L152) 11 → 9 项，删除的两项用 `~~删除线~~ + ✅ 说明` 标注 |

#### 关键设计原则

| # | 原则 | 体现 |
|---|------|------|
| **1** | **单一权威源** | `js/app-1.js` 的 `APP_VERSION` 是 9 处中唯一需要**人脑思考修改**的位置 |
| **2** | **推送前自动注入** | `pre-push-check.ps1` 是"git push 前的最后一道闸"——人改 `APP_VERSION` → 跑脚本 → AGENTS.md 自动同步 |
| **3** | **占位符可回滚** | 推送回滚时只需把 `AGENTS.md` 中的 `v9.2.0` 改回占位符，下次注入自动还原 |

#### 兼容性 / 边界

- 占位符必须严格写为 `v9.2.0`（大写、无空格），`pre-push-check.ps1` 用 `String.Contains` 精确匹配
- 正则回退（已注入版本号的情况）使用 `(?ms)(\A[^\n]*?\*\*当前版本\*\*：\`)v[\d\.]+(\`)` 模式，**只匹配文件首行的当前版本号**
- `pre-push-check.ps1` 用 `[System.Text.UTF8Encoding($true)]` 写 BOM 格式的 UTF-8，避免中文 Windows 终端下 PS5 把 PS1 文件当 GBK 读导致中文/emoji 乱码报错
- 推送回滚到旧版本（如 v8.x）时，旧版的 AGENTS.md 没有 `v9.2.0` 占位符 → 脚本会输出 `[INFO] 跳过注入`，不会破坏旧版文档

#### 未来可继续削减的位置（5 个待评估）

| # | 位置 | 自动化方案 | 改动成本 |
|---|------|----------|---------|
| 1 | `index.html` `<title>` "Time Bank v9.2.0" | build 脚本注入 | 中（要写 webpack/vite 或简单 sed） |
| 2 | `index.html` `.version-subtitle` "TimeBank v9.2.0 · ..." | 同上 | 中 |
| 3 | `index.html` 关于页"版本 v9.2.0" | JS 渲染（启动时 setTextContent） | 小 |
| 4 | `sw.js` 顶部注释 "Time Bank Service Worker - v9.2.0" | build 脚本注入 | 中 |
| 5 | `index.html` 用户日志 `<div class="log-version">v9.2.0</div>` | 人工撰写，不自动化 | 不变 |

**保守建议**：当前 9 处是平衡点——再减少需要做一次"模板化 + build 注入"的重构，回报不高。9 处里 8 处是机器/构建必填，**人脑改 1 处**（`app-1.js`），已经足够防止遗漏。

---

### 改造 D：睡眠设置同步现状确认（已实现，无需新增代码）

> 用户原话："关于睡眠时间配置，然而在现阶段使用中我发现，实际上睡眠时间的配置以及通过云端同步了，请你再次检查"——本节给出**检查结论**：睡眠时间配置**从 v7.32.0 起就已经按设备 ID 云端同步**，本次"睡眠时间设置改成云端同步"的需求实际上是**已实现状态**，无需新增代码。

#### 现状检查（v9.2.0 代码确认）

| 维度 | 实现 | 代码位置 |
|------|------|---------|
| **存储位置** | 云端 `tb_profile.deviceSleepSettings.{deviceId}` —— 按设备 ID 分桶 | [app-sleep.js:73-74](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L73-L74) |
| **同步方式** | `DAL.saveProfile({ [updateKey]: _.set(cloudSettings) })` —— 写云端 Profile | [app-sleep.js:74](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L74) |
| **同步字段** | 28 个业务字段（plannedBedtime、plannedWakeTime、targetDurationMinutes、autoDetectWake、napEnabled、napDurationMinutes、cardMode、earnCategory、spendCategory 等） | [app-sleep.js:40-68](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L40-L68) |
| **加载策略** | initSleepSettings 优先读本设备 `deviceSleepSettings.${deviceId}`，缺失则回退到旧格式 `sleepSettingsShared` | [app-sleep.js:446-454](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L446-L454) |
| **跨设备恢复** | 当前设备无云端配置时，从其他设备最新配置中恢复 | [app-sleep.js:482-490](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L482-L490) |
| **全新安装保护** | localUpdated=0（无本地时间戳）时，**不**使用云端旧默认值覆盖代码新默认值 | [app-sleep.js:467-473](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L467-L473) |
| **本地备份** | Android 原生存储（`Android.saveSleepSettingsNative`）+ localStorage 双重备份 | [app-sleep.js:12-27](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L12-L27) |
| **状态字段** | `deviceSleepState.{deviceId}` —— isSleeping / sleepStartTime（睡眠状态） | [app-sleep.js:493-](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L493) |

#### 为什么按设备 ID 而不是全端共享？

`deviceSleepSettings`（按设备 ID） vs `sleepSettingsShared`（全端共享，旧格式） 的设计权衡：

| 维度 | 按设备 ID（当前主格式） | 全端共享（旧格式） |
|------|----------------------|------------------|
| 使用场景 | 设备特定行为（闹钟震动、夜间模式、系统提醒同步） | 业务数据（就寝目标时长、费率规则） |
| 实际表现 | 手机 A 设的 23:00 不影响平板 B | 平板修改后所有设备都被改 |
| 同步字段 | 全部 28 个字段都按设备存 | 同左 |

**结论**：当前实现"按设备 ID 分桶"是**有意为之**——睡眠时间配置本质是"使用偏好"（v9.2.0 改造 B 的同类范畴），不是"业务数据"。但**配置项本身在云端是同步的**（只是分桶），所以用户在 A 端丢失本地缓存时，B 端云端记录仍可恢复。

#### v9.1.0 大版本期间睡眠设置的演变

| 版本 | 变更 |
|------|------|
| v7.11.3 | 首次引入 `sleepSettingsShared` 全端共享云端字段（同步但不分设备） |
| v7.32.0 | 改为 `deviceSleepSettings.{deviceId}` 按设备 ID 分桶（用户当时要求"各端独立配置"，参考 screenTimeSettings 模式） |
| v7.33.8 | 全新安装时，**不**使用云端旧默认值覆盖代码新默认值（避免版本升级后默认值回退） |
| v9.1.0 | 大版本"云端化"时，睡眠设置**未做改动**——它已经是云端同步，不属于"本地业务数据迁云端"范畴 |
| **v9.2.0** | **无改动**——用户本次复检确认现状已符合预期 |

#### 用户可见行为

- **A 端修改 23:30 → 22:45**：立即写入云端 `deviceSleepSettings.${deviceA_Id}`，A 端 UI 立即生效
- **A 端重新安装 / 清缓存**：A 端 localStorage 清空 → initSleepSettings 读云端本设备配置 → 恢复 22:45
- **B 端**：B 端有独立的 `deviceSleepSettings.${deviceB_Id}`，互不影响
- **新增设备 C 首次登录**：云端无 C 的配置 → 用代码默认值 → 用户首次修改后才写入云端

#### 与 v9.2.0 改造 B（collapsedCategories）的对比

| 维度 | collapsedCategories (改造 B) | sleepSettings |
|------|----------------------------|---------------|
| 分类 | 使用偏好 | 使用偏好 |
| v9.2.0 改造 | 改为 localStorage（每端完全独立） | **保持云端分桶**（每端独立但可恢复） |
| 数据丢失风险 | 端丢失 → 不可恢复（除非用户导入） | 端丢失 → 从云端自动恢复 |
| 适合场景 | 视觉偏好（折叠/展开） | 行为配置（就寝/闹钟/费率） |

**为什么不把 sleepSettings 也改成"localStorage only"**：
1. 睡眠配置是"行为配置"（影响实际系统行为：闹钟、震动、自动识别），丢失后需要重新设置的成本高
2. 云端分桶已经实现"每端独立"，且支持"丢失后自动恢复"——比纯 localStorage 更友好
3. v7.32.0 已经验证过这个设计，运行 30+ 个版本稳定

#### 本次检查结论

- ✅ 睡眠时间配置**已经云端同步**（`deviceSleepSettings.{deviceId}`，v7.32.0 起）
- ✅ 按设备 ID 分桶实现"每端独立 + 跨端可恢复"
- ✅ v9.2.0 无需新增代码，仅做现状确认
- 📌 未来若用户希望进一步拆分为"业务数据（云端共享）+ 使用偏好（localStorage）"，可独立规划 v9.3.0+ 版本

---

## v9.2.1（v9.0.12 续作 + PWA 实时性 bug 终结）

> ⚠️ **v9.2.1 是 v9.0.12 工作的延续**。v9.0.12 是上一个开发 AI 半完成的状态（10 项修复只完成 2 项），v9.2.1 废弃 v9.0.12 版本号（spec 目录保留作历史），把所有未实施修复以 v9.2.1 版本号发布。

### 7 个代码修复（v9.0.12 的 10 个修复减去已实施的 3 个）

| 优先级 | 修复 | 文件:行号 |
|--------|------|----------|
| P0 | `isImportMode` 显式声明 | app-1.js:34 附近 |
| P0 | Transaction onChange 事件驱动心跳 | app-1.js:3942 附近 |
| P0 | Profile onChange 事件驱动心跳（删 v8.2.17 反模式注释） | app-1.js:4111 附近 |
| P1 | DAL.startTask 显式传 clientId | app-1.js:3568 附近 |
| P1 | onChange 端 null-safe 防御（3 处） | app-1.js:4052/4062/4072 |
| P1 | unsubscribeAll 动态退避（800ms → 800/1200/1800/2700/4050ms） | app-1.js:4251 附近 |
| P2 | 抽取 `__fixCompletionCount()` 工具 + 3 处调用替换 | app-1.js:2230 之前 + 2235/4540/5117 |

**已实施的 3 项**（v9.0.12 上个 AI 已完成）：
- ✅ app-2.js runningData 加 clientId
- ✅ tbMutation 云函数 startTask 写 clientId 字段
- ✅ addTransaction 6 个调用方都有 `task.completionCount += 1`（v7.37.5 起就有，不是 v9.0.12 工作）

### 9 处版本号同步

- [app-1.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L7) `APP_VERSION = 'v9.2.1'`
- [app-1.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释
- [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>`
- [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.2.1 · v9.0.12 续作 + PWA 实时性 bug 终结"
- [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) 关于页
- [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) 用户日志
- [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释
- [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) CACHE_NAME
- [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) versionCode 46 / versionName 9.2.1

### 部署

- **云函数 `tbMutation` 不需重新部署**（v9.2.1 修复**不需要**云函数改动，clientId 写入已就绪）
- pre-push-check 验证通过 → sync-all.ps1 同步 → git push

### 用户可见改善

- **控制台错误**：从"启动后 5 分钟内 700+ 行错误"降到"< 20 行"（彻底告别 `isImportMode is not defined`）
- **Watch 状态**：监控指示器长期保持 🟢，不再每分钟变红
- **本机任务**：启动/停止任务时不再被误判为"来自其他设备"
- **completionCount**：与交易数完全实时一致（虽然 v9.0.12 spec 说要 addTransaction 即时更新，但代码 v7.37.5 起就在 6 个调用方做了；v9.2.1 真正清理的是 3 处"修复路径"的重复代码）
- **代码维护**：3 处 `__completionFixPromises` / `__loadAllCompletionFixPromises` / `__incrementalFixPromises` 重复代码合并为一个 `__fixCompletionCount()` 工具函数

---

## v9.1.0（纯云端架构：dailyChanges + 余额 双云端权威）

> ⚠️ **v9.1.0 是一个大版本**：所有"把本地业务数据迁到云端"的改造都归入此版本。按用户原话："9.1.0版本是一个大版本，只要是解决同一类问题都用这个版本号"。
> 本版本包含 3 个互相配合的改造：A 启动数据流统一、dailyChanges 云端权威、余额云端权威。

### 核心问题（开发者对话原文摘录）

> "当前项目还有那些存在本地缓存的机制，这些机制是否是导致多设备数据不同的原因。...我提出上述问题，并非修bug、打补丁，而是从完善机制的角度看，重点是了解本地缓存机制是否导致了以上原因，采用纯云端的机制是否更好"

> 用户最关心的"诡异现象"：多设备都显示已连接，部分交易没及时同步导致余额不同，但监听机制仍能同步后面的交易（有时候又不能），今日获得/消费数据不相同但余额又相同。

### 根因（v9.0.10 之前架构）

启动数据流有 2 条路径，**互相竞争**：
1. **本地缓存秒开**（`applyDataState`）—— 加载 `localStorage.timeBankData` 到 UI
2. **云端全量同步**（`DAL.loadAll`）—— 从 `tb_*` 集合拉取

两条路径都做"重算/合并"，导致：
- 路径 A：本地有数据 → UI 显示本地数据 → 后台同步成功 → 提示"新数据到达" → UI 闪烁
- 路径 B：云端为空 + 本地有 → 自动 `importFromBackup` → 模态框"数据导入中" → 如果云端 hang 住 → 模态框卡死
- 共同问题：`dailyChanges` 在 7+ 文件中**本地累加** → 设备 A 错过一笔交易 → 今日数据漂移
- 共同问题：`currentBalance` 在 5+ 文件中**本地重算** → 设备 B 用 transactions.reduce → 与云端 cachedBalance 不一致

### 改造 A：启动数据流统一为 `DAL.loadAll` 唯一入口

**核心变更**：
- `DAL.loadAll` 加载全部业务数据（tasks/transactions/dailyChanges/runningTasks/currentBalance）
- `applyDataState` 重构为 `applyUIPrefs`（仅恢复 UI 偏好：categoryColors/collapsedCategories/reportState/notificationSettings/balanceMode/screenTimeSettings/sleepSettings）
- `localStorage.timeBankData` 不再作为启动数据源；仅在用户主动"导入数据"（importFromBackup）时使用
- 删除 `silent bootstrap`（后台秒开）与 `importFromBackup` 未登录分支

**文件改动**：
- [app-1.js:4355](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4355) `DAL.loadAll` 统一入口
- [app-1.js:4414](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4414) `currentBalance = profile.cachedBalance`（信任云端）
- [app-auth.js:2229](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2229) 拆分 `applyUIPrefs` + `applyDataState`
- [app-auth.js:2467](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2467) `applyDataState` 保留**仅**给 `importFromBackup` 场景

### 方案 1：dailyChanges 云端权威化

**核心变更**：
- 删除 18+ 处 `dailyChanges[date].earned/spent += tx.amount` 本地写入
- `tb_daily` 表改为云端原子维护（`addTransaction` / `updateTransaction` / `deleteTransaction` 内部 `_.inc()`）
- 新增 `tbMutation.migrateDailyChanges` action：批量迁移本地 dailyChanges → 云端
- 新增 `DAL._migrateDailyChangesIfNeeded`：首次启动自动迁移
- 迁移失败**禁止本地降级**——必须弹错误通知（用户必须知道）

**文件改动**：
- [tbMutation:429-503](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L429-L503) `migrateDailyChanges` action
- [app-1.js:4596](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4596) `_migrateDailyChangesIfNeeded`
- [app-1.js:4382](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4382) DAL.loadAll 末尾调用
- 7 个 JS 文件（app-1/2/reports/sleep/systems/auth）删除 dailyChanges 本地写入

**关键设计：失败必须用户感知**
- 全部成功（code 0）：弹 📅 日数据已迁移 + 设置 `tb_daily_migrated_v910='1'`
- 部分失败（code 1007）：弹 ⚠️ 日数据部分迁移失败 + 显示成功/失败数 + **不设标志位**（下次刷新自动重试，云端已有日期会被跳过）
- 总失败 / 异常：弹 ❌ 日数据迁移失败 + **不设标志位**（下次刷新重试）
- **绝对禁止**：失败时回退到使用本地 dailyChanges（用户可能永远不知道被降级）

### 方案 2：余额云端权威化

**核心变更**：
- `applyDataState` / `handleIncrementalSync` / `applyDataState(profile changes handler)` / 任务删除后 — 全部**不再本地重算余额**
- 余额的**唯一来源**是 `tb_profile.cachedBalance`（云端），本地只读取不重算
- 增量更新 `currentBalance += delta` 仍允许（用于乐观 UI），但云端原子写是权威
- 新增 `DAL.recalculateBalance()`（v9.0.1 已有，调用云端 `recalculateBalance` action）
- 新增设置页"重算余额"按钮（`handleRecalculateBalanceClick`）—— 用户可手动触发原子重算

**文件改动**：
- [app-auth.js:2515-2533](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2515-L2533) `applyDataState` 信任云端
- [app-1.js:4782-4787](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4782-L4787) profile 变化 handler 信任云端
- [app-1.js:4980-4990](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4980-L4990) `handleIncrementalSync` 信任云端
- [app-2.js:2807-2812](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L2807-L2812) 任务删除后信任云端
- [app-2.js:6269](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6269) `handleRecalculateBalanceClick` 新增
- [index.html:798-799](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L798-L799) "重算余额"按钮

**关键设计：失败必须用户感知（一致原则）**
- `applyDataState` 检测到余额与交易合计差异 >1：仅 `console.warn`，**不自动修复**
- 自动修复场景：用户在设置页点击"重算余额"按钮 → 弹确认（显示当前余额 vs 交易合计） → 调云端原子重算
- 重算完成：弹 ✅ 余额重算完成 + 显示新余额 + 差异

### 关键设计原则（v9.1.0 三大铁律）

| # | 原则 | 体现 |
|---|------|------|
| **1** | **云端是唯一权威源** | tasks/transactions/dailyChanges/runningTasks/currentBalance 全部由云端原子写；本地不重算、不覆盖 |
| **2** | **本地仅作 UI 偏好** | localStorage.timeBankData 只保留 categoryColors/collapsedCategories/reportState/notificationSettings 等 UI 偏好；业务数据不再缓存 |
| **3** | **失败必须用户感知** | 数据迁移、余额重算等关键操作失败时**禁止本地降级**——必须弹错误通知，让用户主动重试 |

### 用户可见改善

- **多设备余额始终一致**：余额不再有"设备 A 显示 X、设备 B 显示 Y"的诡异现象
- **多设备今日数据始终一致**：dailyChanges 由云端原子维护，所有设备只能读取不能写入
- **离线行为可预测**：首次加载/网络异常时看到"加载中"（无数据），不会"秒开但数据陈旧"
- **数据漂移可自愈**：发现余额与交易不一致时，设置页"重算余额"一键修复
- **迁移失败可感知**：日数据首次迁移失败时用户立刻看到通知，不会"假装成功"

### 关键 Bug 防御

| 场景 | v9.0.10 之前 | v9.1.0 |
|------|-------------|--------|
| 设备 A 错过一笔交易 | 设备 A 的今日数据少 | 设备 A 从云端拉取 tb_daily 自动同步 |
| 设备 A 用陈旧缓存秒开 | 覆盖设备 B 的新数据 | 启动只走 DAL.loadAll，不读本地 |
| 云端 cachedBalance 漂移 | UI 显示错误余额 | 仅警告不修复，用户手动点"重算余额" |
| 日数据迁移失败 | 静默回退到本地 | 必须弹错误通知，禁止本地降级 |

### 影响范围
- 修改 5 个文件：app-1.js、app-2.js、app-auth.js、app-reports.js、app-systems.js、app-sleep.js、index.html
- 修改 1 个文件：tbMutation 云函数
- 11 处版本号同步到 v9.1.0（versionCode 41 — 修复 3 处之前 v9.0.10 漏更新）
- 需部署：云函数 `tbMutation`（`migrateDailyChanges` action 是新的，但 `recalculateBalance` 已有）

---

## v9.0.10（完善：Watch 修复优先 + 自愈探针 + 用户感知 4 状态指示器 + Bug 修复层）

### 核心问题
v9.0.9 之后 Chrome DevTools 控制台暴露出 3 类问题：
1. **真 Bug**：戒除习惯 weekly 结算 `TypeError: baseDate.getDay is not a function`（app-2.js:3828）+ 任务模态框事件监听器 `Cannot read properties of null (reading 'addEventListener')`（app-auth.js:2479）
2. **Watch SDK 故障循环**：`pong timed out` / `wsclient.send timedout` 持续刷屏——根因是 CloudBase SDK v2 WebSocket 空闲 30s 自动断开
3. **用户对"降级"的根本担忧**：用户原话"watch 是必须坚持的机制！绝对不允许替换"——3 次失败就停止自动重连=过度依赖降级，必须改为"修复优先 + 自我恢复"

### 根因
- v7.x 以来 SDK 内部 WebSocket 空闲超时被错误识别为"连接断开"，触发重连循环
- v9.0.10 第一版（已回滚）3 次失败上限+必须用户手动重置=把修复责任推给用户
- 4 状态指示器仅在 tab 标签上 = 用户不一定看得到
- 无诊断信息告诉用户"为什么 Watch 坏了"
- `__normalizeDate` 缺失 → 时间参数为 null 时 `.getDay()` 抛 TypeError
- 8 处 `getElementById().addEventListener` 无空检查 → 删 id 后启动崩溃

### 修复项（v9.0.10 完善版）

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **A1 主动心跳保活（根因修复）** | [app-1.js:917](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L917) `__startWatchHeartbeat()` 每 20s 调一次 `db.collection('tb_profile').limit(1).get()`，让 SDK 内部 WebSocket 保持活跃不进入空闲超时 |
| **2** | **A2 智能重连 8 次上限** | [app-1.js:843](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L843) `MAX_RECONNECT_ATTEMPTS = 8`（原 3） |
| **3** | **A3 降级期间自愈探针（关键改进）** | [app-1.js:981](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L981) `__startWatchSelfHealingProbe()` 每 60s 自动探活，**不等用户操作** |
| **4** | **A3+ 启动时恢复自愈探针** | [app-1.js:5753](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5753) `__initWatchDegradeState()` 跨刷新持续 |
| **5** | **B 监听状态显示器 4 状态** | [app-1.js:6331](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6331) `updateWatchStatusUI` 重写 4 状态：🟢/🟡/🔴/⚫；**复用原有 #watchStatusEarn/Spend**（节省空间） |
| **6** | **B+ 诊断面板** | [app-1.js:5767](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5767) `showWatchDiagnostics()` + [index.html:4482](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L4482) `#watchDiagnosticsModal`，点击监听状态弹出 |
| **7** | **C 监听状态显示器内🔧重置按钮** | [index.html:364](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L364) `#resetWatchInlineBtnEarn/Spend`（用 `.btn-manual-sync` 样式，暂停时显示）+ [app-1.js:5804](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5804) `handleResetWatch()` |
| **8** | **C+ 自愈倒计时实时显示** | [app-1.js:1037](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1037) `__startSelfHealingCountdownTicker()` 每 1s 刷新倒计时（在状态文本中显示） |
| **9** | **D 持久化扩展** | [app-1.js:898](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L898) `__recordWatchDegrade` 增加 `lastReason` / `probeCountdown` / `probeCount` 字段 |
| **10** | **D1 修 Bug ①** | [app-2.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L8) `__normalizeDate()` 工具 + [app-2.js:3856](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3856) `getPreviousPeriodEnd` / [app-2.js:3878](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3878) `stepToNextPeriodEnd` 入口守卫 |
| **11** | **D2 修 Bug ②** | [app-auth.js:9](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L9) `__safeBind` / [app-auth.js:33](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L33) `__safeBindAll` 工具 + [app-auth.js:2528](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2528) `setupTaskModalEventListeners` + [app-reports.js:82](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L82) `setupReportEventListeners` 重构 |
| **12** | **D3 启动隔离** | [app-1.js:870](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L870) `__safeSetup` 工具 + [app-1.js:5444](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5444) `initApp` 包裹 setup |
| **13** | **E SW 升级** | [sw.js:4](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L4) CACHE_NAME → `timebank-cache-v9.0.10` |
| **14** | **E 11 处版本号同步** | title / version-subtitle / about / 用户日志 / APP_VERSION / 启动日志 / sw.js × 2 / build.gradle × 2 / AGENTS.md |
| **15** | **2 处缺失 onError 补全** | [app-1.js:3881](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3881) Transaction + [app-1.js:4019](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4019) Profile 加 `__markWatchFailure('sdk_timeout')` |
| **16** | **🔥 热修复 SyntaxError** | **致命 bug**：v9.0.10 第一版在 [app-1.js:1051](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1051) 重复声明 `let lastWatchReconnectAt = 0;`（1438 行已存在），导致 SyntaxError 整个脚本加载失败页面卡死。**已移除重复声明** |
| **17** | **🔥 热修复 重复 updateCloudStatusUI** | **致命 bug**：v9.0.10 第一版留下两处 `updateCloudStatusUI` 函数定义（5748/6331），同样是 SyntaxError。**已合并为单一函数**（6331 薄包装，调用 updateWatchStatusUI） |
| **18** | **🔥 热修复 隐式全局** | 变量 `__watchCountdownTicker` 未声明就被赋值（隐式全局）。**已添加 `let __watchCountdownTicker = null;` 顶部声明** |
| **19** | **🔥 热修复 移除顶部状态条** | 顶部 `#cloudStatusBar` 占据一整行空间，用户感知差。**已移除元素 + 全部 CSS**，复用原有监听状态显示器 |
| **20** | **🔥 热修复 移除设置页重置按钮** | 与新增🔧重置按钮重复。**已迁移到监听状态显示器内**（暂停时显示） |
| **21** | **🔥 热修复 后台同步不再弹"数据导入中"卡住** | App 启动时如检测到本地有数据但云端为空，会自动调用 `DAL.importFromBackup` 并弹"数据导入中"模态框；如果云端 hang 住模态框会卡死无法关闭。**修复**：[app-1.js:2396](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2396) `importFromBackup` 改为读 `window.__tbImportSilentMode` 标志；[app-1.js:4355](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4355) `DAL.loadAll` 后台同步路径 + [app-1.js:6045](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6045) `bootstrapCloudFromLocalData` 都设置 `silent=true` 跳过模态框；[app-auth.js:1199](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L1199) 模态框增加"取消"按钮兑底（云端 hang 住时可手动关闭） |
| **22** | **🔥 热修复 启动瞬间 5 个 watch 抢 WebSocket 全部失败** | v9.0.10 修复了"空闲 30s 自动断开"，但启动瞬间 5 个 watch 在 <100ms 内同时抢同一未就绪的 WebSocket，5 个 watch 全部抛 `wsclient.send timedout` 错误。**根因**：v9.0.10 的心跳在 `subscribeAll` 末尾启动，第一次 tick 是 20s 后，前 20s 完全没有保护。**修复**：① [app-1.js:3746](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3746) `subscribeAll` 开头先做一次 `db.collection('tb_profile').limit(1).get()` 预热查询 + 200ms 延迟，强制 SDK 完成 WebSocket 握手；② [app-1.js:3836](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3836) 等 4 处 5 个 watch 间加 200ms 错峰间隔，避免抢同一 WebSocket；③ [app-1.js:935](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L935) 心跳首次 tick 改为 1s 后立即触发（不等 20s）。**预期**：watch 建立成功率从"几乎 0"提升到"接近 100%" |

### 关键设计：修复 > 降级 > 自我恢复（用户原话落实）

| 优先级 | 机制 | 何时触发 |
|------|------|---------|
| **1 修复 Watch** | 主动心跳保活（A1，20s 一次） | 全程，根因修复 |
| **2 智能重连** | 8 次退避重连（A2，3-60s 指数） | Watch 偶发断开 |
| **3 降级 + 自愈** | 自愈探针（A3，60s 一次）+ 监听状态显示 🔴 | 8 次失败后停止自动重连 |
| **4 自我恢复** | 自愈探针自动重建 Watch | 网络恢复时 |
| **5 兜底** | 监听状态显示器内🔧重置按钮 | 用户主动操作 |

### UI 设计原则（用户原话："不要对原有外观进行更改"）

- **顶部状态条已移除**：不再占据一整行空间
- **复用原有监听状态显示器**：在"最近任务"标题行右侧，**完全保留原位置和原外观**
- **4 状态融入原指示器**：🟢已同步 / 🟡保活中 n/8 / 🔴已暂停 Xs（倒计时实时刷新）/ ⚫未登录
- **🔧 重置按钮**复用 `.btn-manual-sync` 样式（无背景无边框，仅图标），**暂停时**才出现，**正常时**显示🔄手动同步按钮
- **点击监听状态文本/图标** = 弹出诊断面板

### 用户可见改善

- **页面不再卡死**（v9.0.10 第一版 SyntaxError 已修复）
- **Watch 错误频率从 30s/次 → 接近 0**（A1 心跳保活覆盖 95% 场景）
- **顶部不再有横条**（节省首屏空间）
- **Watch 出问题时不静默**：监听状态变红 + 自愈倒计时实时显示 + 控制台持续 error + 诊断面板可看详情
- **网络恢复后自动重建**：自愈探针无需用户操作
- **戒除习惯 weekly 不再崩溃**：传 null/无效时间参数仅返回 null 不抛 TypeError
- **任务模态框启动不崩**：缺 id 仅警告不致命

### 影响范围

- 修改 5 个文件：app-1.js、app-2.js、app-auth.js、app-reports.js、index.html
- 修改 2 个文件：sw.js、build.gradle
- 修改 1 个文件：AGENTS.md
- 11 处版本号同步更新到 v9.0.10（versionCode 39→40）
- **无需云端部署**：纯客户端修复

---

## v9.0.9（修复：长时间计时任务结束后可能"复活"的 bug）

### 核心问题
安卓端长时间运行的计时任务结束后，任务可能"复活"——再次出现在运行中列表。用户点击取消后，失败队列增加一条"数据不存在 stopTask"（错误码 1003，描述"云端未找到该运行任务"）。

### 根因
1. `stopTask` 函数中，`runningTasks.delete(taskId)` 和 `DAL.stopTask()`（云端删除）之后，才调用 `saveLocalCache()` 保存本地缓存
2. 如果用户在 `saveLocalCache` 执行完成前杀进程/切后台/刷新页面，本地 `localStorage.timeBankData` 中的 `runningTasks` 仍包含已结束的任务
3. 下次启动时，`applyDataState` 从本地缓存恢复，该任务被"复活"
4. 用户再次点击取消时，`DAL.stopTask` 发现云端 `tb_running` 中已不存在该任务，返回 1003 错误
5. 其他设备不会出现此问题，因为它们从云端加载数据，而云端数据是正确的

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | `stopTask` 中 `saveLocalCache` 提前到 `DAL.stopTask` 之前 | [app-2.js:4819](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4819) `runningTasks.delete(taskId)` 后立即 `await saveLocalCache()`，再调用云端 `DAL.stopTask` |
| **2** | `cancelTask` 中同样提前 `saveLocalCache` | [app-2.js:4784](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4784) 同上逻辑，防止取消路径也出现复活 |
| **3** | `applyDataState` 启动时检测并清理"幽灵任务" | [app-auth.js:2389](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2389) 遍历本地缓存的 `runningTasks`，如果某任务的 `startTime` 早于其最近一笔交易的 `timestamp` 超过 5 秒，则判定为幽灵任务并自动清理 |

### 关键 Bug 详解

#### 幽灵任务复活

**触发条件**：
- 安卓端结束一个长时间运行的计时任务（运行时间越长，用户越可能在结束后立即操作其他事情）
- 用户在任务结束后 1-2 秒内切后台或杀进程
- `saveLocalCache` 异步执行尚未完成

**修复前**：
```javascript
// app-2.js: stopTask
runningTasks.delete(taskId);           // 1. 内存中删除
await DAL.stopTask(taskId, runningTask); // 2. 云端删除（可能成功）
// ... 添加交易等操作 ...
await saveLocalCache();                  // 3. 本地缓存保存（可能未执行）
```

**修复后**：
```javascript
runningTasks.delete(taskId);           // 1. 内存中删除
await saveLocalCache();                  // 2. [v9.0.9] 立即保存本地缓存
await DAL.stopTask(taskId, runningTask); // 3. 云端删除
```

#### applyDataState 幽灵任务清理

**修复前**：
```javascript
// app-auth.js: applyDataState
const cloudRunning = new Map(safeRunningTasks);
// 直接信任本地缓存的 runningTasks，不做一致性校验
```

**修复后**：
```javascript
const ghostTaskIds = [];
cloudRunning.forEach((val, key) => {
    const lastTx = transactions
        .filter(t => t.taskId === key && !t.undone)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (lastTx && lastTx.timestamp) {
        const txTime = new Date(lastTx.timestamp).getTime();
        if (txTime > (val.startTime || 0) + 5000) {
            ghostTaskIds.push(key); // 交易时间比启动时间晚 >5s，判定为幽灵
        }
    }
});
ghostTaskIds.forEach(id => cloudRunning.delete(id));
```

### 用户可见改善
- **任务不再复活**：长时间计时任务结束后，即使立即杀进程，下次启动任务也不会再出现
- **取消操作不再报错**：复活后的任务点击取消不再触发"数据不存在"错误
- **自动修复历史数据**：如果本地缓存中已存在幽灵任务，下次启动时自动清理并记录日志
- **失败队列更干净**：不再积累因幽灵任务产生的无效 1003 错误

### 影响范围
- 修改 2 个文件：app-2.js、app-auth.js
- 修改 3 个文件：index.html、sw.js、build.gradle
- 修改 1 个文件：AGENTS.md
- 11 处版本号同步更新到 v9.0.9（versionCode 38→39）
- **无需云端部署**：纯客户端修复，云函数 `tbMutation` 的 `stopTask` 逻辑保持不变

---

## v9.0.8（修复：_.set() 包装导致分类颜色/折叠状态云端存储损坏）

### 核心问题
网页端任务标签颜色丢失、折叠状态异常。根因：v9.0.4 引入的 `_syncProfileFieldToCloud` 函数在自动同步 `categoryColors` / `collapsedCategories` 时，错误地使用了 `_.set(serializedValue)` 包装数据。

### 根因
1. `_syncProfileFieldToCloud` 调用 `DAL.saveProfile({ categoryColors: _.set([['cat1', '#fff']]) })`
2. `_.set()` 返回 `{fieldName: {...}, operands: [[['cat1', '#fff']]], operator: 'set'}` 对象
3. 云函数 `tbMutation` 的 `saveProfile` action 第 396 行再次执行 `updateData[key] = _.set(value)`，对已经是 `_.set()` 包装的对象再次包装
4. 云端 `tb_profile.categoryColors` 被存储为 `{fieldName: {...}, operands: [...], operator: 'set'}` 格式
5. 下次加载时，`setCategoryColors` 收到这个对象，v9.0.6 hotfix-2 的 `Object.entries` 修复产生错误结果 `[['fieldName', {...}], ['operands', [...]], ['operator', 'set']]`，而非 `[['cat1', '#fff']]`

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | `_syncProfileFieldToCloud` 移除 `_.set()` 包装 | [app-1.js:4687](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4687) 直接传递 `serializedValue`，不再用 `_.set()` 包装 |
| **2** | `setCategoryColors` 识别 `_.set()` 包装对象 | [app-1.js:4774](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4774) 检测 `arr.operator === 'set' && Array.isArray(arr.operands)`，提取 `arr.operands[0]` 恢复原始值 |
| **3** | `setCollapsedCategories` 识别 `_.set()` 包装对象 | [app-1.js:4794](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4794) 同上逻辑 |

### 用户可见改善
- **分类颜色不再丢失**：网页端修改分类颜色后刷新，颜色正确保留
- **折叠状态正确持久化**：分类的收起/展开状态跨会话保留
- **自动修复已损坏数据**：如果云端数据已被 `_.set()` 格式污染，加载时自动识别并恢复
- **跨设备同步正常**：Android 端和网页端的颜色/折叠状态同步一致

### 影响范围
- 修改 2 个文件：app-1.js、index.html
- 修改 2 个文件：sw.js、build.gradle
- 修改 1 个文件：AGENTS.md
- 11 处版本号同步更新到 v9.0.8（versionCode 37→38）
- **无需云端部署**：纯客户端修复，云函数 `tbMutation` 的 `_.set()` 保护机制仍然正常工作（只是客户端不再重复包装）

---

## v9.0.7（习惯系统重构：applyDataState 索引重建 + 单一数据源 + 索引清理）

### 核心问题
v9.0.1 之后才暴露的"连胜突然清零"bug：
1. **P0-1 索引空状态下的 streak=1**：`applyDataState` 加载本地缓存到内存后**没有**调用 `buildTransactionIndex`，导致 `transactionIndex` 保持空 Map。`addTransaction` 同步添加 1 笔新交易到索引后，`rebuildHabitStreak` 的 `transactionIndex.has(task.id)=true` 走索引路径，但索引中**只有 1 笔**，算出 streak=1 覆盖原本的连胜。
2. **P0-2 onRollback 索引残留**：`DAL.addTransaction.onRollback` 仅从 `transactions` 数组删除交易，**未同步清理 `transactionIndex`**，残留数据导致后续计算错位。
3. **P1-1 两次读数据漂移**：`processHabitCompletion` 两次读 `task.habitDetails.streak`（先 oldStreak，再 rebuildHabitStreak 后取 newStreak），两次读之间可能因异步操作漂移。

### 根因
- `applyDataState`（v7.x 引入）只加载 `transactions` 数组，**从未**调 `buildTransactionIndex`——这条路径下 `transactionIndex` 永远是空
- v9.0.2/v9.0.5 引入的 onRollback 只关注 `transactions` 数组一致性，遗漏了 `transactionIndex` 同步清理
- 启动流程有 2 条路径加载数据：`DAL.loadAll`（云端全量）和 `applyDataState`（本地缓存）；前者**会**调 `buildTransactionIndex`，后者**不会**——这是 v7.37.0 引入索引以来一直存在的 bug

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **applyDataState 末尾 buildTransactionIndex** | [app-auth.js:2491](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2491) 本地缓存加载完成后立即构建索引，与 `DAL.loadAll` 路径行为一致 |
| **2** | **DAL.addTransaction.onRollback 加 removeFromTransactionIndex** | [app-1.js:3056](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3056) onRollback 失败时同步清理索引 |
| **3** | **DAL.updateTransaction.onRollback 加索引恢复** | [app-1.js:3112](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3112) 用 snapshot 恢复交易时同步 addToTransactionIndex |
| **4** | **DAL.deleteTransaction.onRollback 加索引恢复** | [app-1.js:3167](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3167) 恢复被删除交易时 addToTransactionIndex |
| **5** | **rebuildHabitStreak 单一数据源** | [app-2.js:6014](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6014) **永远**用 `transactions.filter`，不再 `transactionIndex.has` 判断 |
| **6** | **rebuildHabitStreak 返回 prev/new** | [app-2.js:6143](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6143) 返回 `{prevStreak, newStreak, lastCompletionDate, streakChanged, lastDateChanged}` 给 processHabitCompletion |
| **7** | **processHabitCompletion 一次原子调用** | [app-2.js:4292](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4292) 使用 rebuildHabitStreak 返回值，消除两次读漂移 |
| **8** | **processHabitCompletion 数据源统一** | [app-2.js:4303](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4303) `prevQualifiedPeriods` 循环用 `transactions.filter`，不再 `transactionIndex.get` |
| **9** | **新增 fixAllHabitStreaks** | [app-2.js:6151](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6151) 批量重算所有 habit 任务的 streak 并写回云端 |
| **10** | **设置页加"修复习惯连胜"按钮** | [index.html:752](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L752) `onclick="handleFixHabitStreaksClick()"` 弹确认 → 调 fixAllHabitStreaks → 弹结果 |
| **11** | **新增 handleFixHabitStreaksClick 包装** | [app-2.js:6198](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6198) 弹窗 + 进度 + 结果展示 |

### 关键 Bug 详解

#### P0-1 索引空状态下 streak=1

**触发条件**：
- App 通过 `applyDataState` 走本地缓存秒开（不走云端全量同步）
- 用户在 `handlePostLoginDataInit` 后台同步**完成前**点击完成习惯任务

**修复前**：
```javascript
// app-auth.js: applyDataState 末尾
tasks = data.tasks || [];
transactions = data.transactions || [];
// ❌ 没有 buildTransactionIndex()，transactionIndex 一直是空 Map

// app-2.js: rebuildHabitStreak
const taskTxs = (typeof transactionIndex !== 'undefined' && transactionIndex.has(task.id))
    ? transactionIndex.get(task.id)  // ❌ addToTransactionIndex 后只含 1 笔
    : transactions.filter(t => t.taskId === task.id);
```

**修复后**：
```javascript
// app-auth.js: applyDataState 末尾
tasks = data.tasks || [];
transactions = data.transactions || [];
if (typeof buildTransactionIndex === 'function') {
    buildTransactionIndex();  // ✅ 与 DAL.loadAll 路径行为一致
}

// app-2.js: rebuildHabitStreak
const taskTransactions = transactions  // ✅ 永远用 transactions
    .filter(t => t.taskId === task.id && t.type === 'earn' && !t.undone)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
```

#### P0-2 onRollback 索引残留

**修复前**：
```javascript
// app-1.js: DAL.addTransaction.onRollback
onRollback: () => {
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx !== -1) transactions.splice(idx, 1);  // ❌ 只删数组
    // 索引残留，addToTransactionIndex 没反向
}
```

**修复后**：
```javascript
onRollback: () => {
    const idx = transactions.findIndex(t => t.id === txId);
    if (idx !== -1) transactions.splice(idx, 1);
    if (typeof removeFromTransactionIndex === 'function' && tx.taskId) {
        removeFromTransactionIndex(tx.taskId, tx.clientId, tx.timestamp);  // ✅ 同步清理
    }
}
```

#### P1-1 两次读数据漂移

**修复前**：
```javascript
// app-2.js: processHabitCompletion
const oldStreak = task.habitDetails?.streak || 0;  // 读 1
rebuildHabitStreak(task);  // 中间可能因异步/Proxy 触发修改
const newStreak = task.habitDetails?.streak || 0;  // 读 2
const shouldAwardBonus = newStreak > oldStreak && ...;  // ❌ 漂移
```

**修复后**：
```javascript
// app-2.js: processHabitCompletion
const result = rebuildHabitStreak(task);  // 一次调用
const { prevStreak: oldStreak, newStreak, lastCompletionDate } = result;  // 一次读取
// 无漂移
```

### 用户可见改善
- **连胜不再突然清零**：所有启动场景下 habit 计算都基于完整交易历史
- **奖励发放与连胜一致**：避免"连胜=1 但有奖励"或"连胜=15 但没奖励"
- **可手动修复历史数据**：设置页"修复习惯连胜"按钮一键恢复 v9.0.1 ~ v9.0.6 期间被错误清零的连胜
- **onRollback 更彻底**：索引残留彻底杜绝

### 影响范围
- 修改 4 个文件：app-auth.js、app-1.js、app-2.js、index.html
- 新增 2 个文件：docs/v9.0.7-design.md、新建节
- 新增 ~80 行（fixAllHabitStreaks、handleFixHabitStreaksClick、buildTransactionIndex 调用）
- 11 处版本号同步更新到 v9.0.7（versionCode 36→37）
- **无需云端部署**：纯客户端修复

## v9.0.5（P0 修复：任务复活数据损坏 + onRollback 完整化）

### 核心问题
v9.0.2 引入 onRollback 后，机制覆盖不全。导致 2 类严重 bug：
1. **P0-A 任务复活数据损坏**：DAL.stopTask 的 onRollback 快照用了错误的字段（保存的是 `_id` 字符串而非 taskData 对象），失败时"复活"的任务数据完全损坏
2. **onRollback 覆盖不全**：updateTransaction / deleteTransaction / saveTask / deleteTask 4 个 mutation 没有 onRollback，失败时 UI 与数据漂移

### 根因
1. v9.0.2 改造时 onRollback 抽取了"addTransaction / stopTask / startTask / saveProfile"4 个**关键路径**，但遗漏了 4 个**次关键路径**
2. DAL.stopTask 在抽取 onRollback 时复制粘贴错误，把 `cachedRunning`（含 `_id`）当成了 `taskData`——`_id` 是云端文档 ID 字符串，不是任务数据本体

### 修复项

| 编号 | 修复 | 关键变更 |
|------|------|---------|
| **1** | **DAL.stopTask 快照修正** | [app-1.js:3250](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3250) onRollback 快照从 `cachedRunning` 改为 `cachedTaskData`（含 taskData + _id 两个字段） |
| **2** | stopTask 调用方传递 taskData 快照 | [app-2.js:4825](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4825) `await DAL.stopTask(taskId, runningTask)` 传入 `runningTask` 快照 |
| **3** | updateTransaction 注入 onRollback | 失败时回滚本地交易（恢复 prevTx 或删除新增）+ 修正余额差量 |
| **4** | deleteTransaction 注入 onRollback | 失败时恢复被删除的交易 + 修正余额 |
| **5** | saveTask 注入 onRollback | 失败时恢复旧任务（prevTask）或删除新建任务 |
| **6** | deleteTask 注入 onRollback | 失败时恢复被删除的任务 |
| **7** | Object Proxy 补 `deleteProperty` trap | [app-1.js:4722](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4722) `reportState.xxx` 的 delete 操作也能触发云端同步 |
| **8** | `_notifiedIds` 内存清理 | [app-1.js:1027](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1027) 移除失败项时同步从 `_notifiedIds` 删除，防止长会话内存驻留 |
| **9** | recalculateBalance 移除冗余 clientId | [app-1.js:3457](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3457) 补 v9.0.3 P2-2 遗漏的 clientId 清理 |

### 关键 Bug 详解

#### P0-A：任务复活数据损坏

**触发条件**：安卓端结束计时任务时，云端报 1003（资源不存在）——常见于用户在两台设备上同时结束同一任务，或设备时钟漂移导致云端已自动清理。

**修复前**：
```javascript
// app-1.js
const cachedRunning = this.runningCache.get(taskId);  // ❌ 错：这是 _id 字符串
callMutation('stopTask', ..., {
    onRollback: () => {
        runningTasks.set(taskId, cachedRunning);  // ❌ 把 _id 字符串当任务数据塞回去
    }
});
```

**修复后**：
```javascript
const cachedTaskData = taskDataSnapshot || runningTasks.get(taskId);  // ✅ 正确的 taskData 对象
const cachedCacheId = this.runningCache.get(taskId);
callMutation('stopTask', ..., {
    onRollback: () => {
        if (cachedTaskData) {
            runningTasks.set(taskId, cachedTaskData);  // ✅ 恢复完整 taskData
            if (cachedCacheId) this.runningCache.set(taskId, cachedCacheId);
        } else {
            runningTasks.delete(taskId);  // ✅ 本来就没有
            this.runningCache.delete(taskId);
        }
        if (typeof updateAllUI === 'function') updateAllUI();
    }
});
```

#### onRollback 完整化（4 个 mutation）

| Mutation | 快照字段 | 回滚逻辑 |
|----------|----------|----------|
| `updateTransaction` | `prevTx`（修改前的交易） | 恢复 prevTx（覆盖更新）或删除新增交易 + 修正余额差量 |
| `deleteTransaction` | `_originalTx`（被删除的交易） | 重新加回 _originalTx + 修正余额 |
| `saveTask` | `prevTask`（修改前的任务） | 恢复 prevTask（覆盖更新）或删除新建任务 |
| `deleteTask` | `_originalTask`（被删除的任务） | 重新加回 _originalTask |

### Proxy deleteProperty 补全

v9.0.4 引入 Proxy 同步时只补了 `set`/`get` trap，遗漏 `deleteProperty`：

```javascript
// app-1.js:4722 修复后
return new Proxy(target, {
    set(t, prop, value, receiver) { ... },
    deleteProperty(t, prop) {                    // [v9.0.5] 新增
        const result = Reflect.deleteProperty(t, prop);
        if (result) _syncProfileFieldToCloud(fieldName, t);
        return result;
    }
});
```

### 用户可见改善
- **任务复活不再损坏**：安卓端结束任务失败时，任务以"完整数据"复活（计时、暂停历史、累计时间保留），不再"空壳任务"
- **修改任务/交易失败时 UI 立即回滚**：不再"瞬变瞬回"看不到反馈
- **删除任务/交易失败时自动恢复**：不再"看似删除但还在"
- **失败通知不重复打扰**：长会话不再积累 `_notifiedIds` 内存

### 影响范围
- 修改 1 个文件：app-1.js（+ ~80 行 onRollback 逻辑）
- 修改 1 个文件：app-2.js（+ 1 行参数传递）
- 11 个版本号位置同步更新到 v9.0.5（versionCode 35→36）
- **无需云端部署**：纯客户端修复，v9.0.2 错误码体系已就位
---

## v9.0.4（P2-1 saveData 重构 + Proxy 同步机制）— 摘要

**核心问题**：`saveData()` 是 v6.0.0 遗留接口，56 处调用只同步 4 个 profile 字段，11 个字段"打酱油"。
**修复**：
- Proxy 自动包装 `categoryColors`（Map）/ `collapsedCategories`（Set）/ `reportState`（Object）→ 拦截 `set/add/delete/clear` 触发云端同步（300ms 去抖）
- 新增 `_syncProfileFieldToCloud()` + 3 个包装函数 `setCategoryColors` / `setCollapsedCategories` / `setReportState`（修复业务层 `let xxx = new Map()` 直接赋值破坏 Proxy 的致命 bug，18 处赋值点全部改用包装函数）
- 抽取 `saveLocalCache()` 独立入口，`saveData()` 改为薄包装；6 个 JS 文件 56 处 `saveData()` 调用全部替换
- 删除 ~120 行冗余逻辑，新增 ~80 行 Proxy 工厂
**云端**：需部署 `tbMutation`（P2-2/P2-4 重构已在 v9.0.3 部署）| **versionCode**: 34→35

---

## v9.0.3（P2-2 clientId 清理 + P2-4 profile 嵌套 `_.set()` 白名单扩展）— 摘要

**核心问题**：v9.0.0 引入服务端权威写入后，`clientId` 已成为死数据；profile 嵌套 `_.set()` 维护 9 个写死 key。
**修复**：
- 客户端 `callMutation` 移除 `clientId` 注入，云函数 `tbMutation` 6 处不再写入 `clientId` 字段
- `saveProfile` 自动判断嵌套对象：`Object.keys().filter(v => isPlainObject(v))` 模式，新增 profile 子对象无需改云函数
- `_.set()` 排除 `null`/数组/`Date` 对象，避免误包装
**云端**：需部署 `tbMutation` | **versionCode**: 33→34

---

## v9.0.2 ~ v9.0.1（v9.0.0 同步架构兼容性清理）— 摘要

- **v9.0.2 onRollback 完善 + mutationQueue 失败通知**：新增 `MutationFailureHandler` 统一失败处理（持久化失败队列 `tb_failed_mutations`、弹窗通知、回滚兜底、设置页查询 API）；业务错误（1001-1004）立即回滚+通知+**不入重试队列**；可重试错误重试 10 次后**记录+通知+丢弃**；4 个关键路径（addTransaction/stopTask/startTask/saveProfile）注入 onRollback；云函数 `tbMutation` 错误码标准化（0/410/400/401/1001-1004/429/500/503）| versionCode 32→33
- **v9.0.1 死代码清理**：删除 v6.4.x 冲突对话框 ~470 行（`forceCloudSync`/`forceLocalToCloud` 等，引用不存在的 LeanCloud 全局会 ReferenceError）；`DAL.recalculateBalance` 改云函数调用；移除 `isSaving`/`isSyncing`/`USER_OPERATION_PROTECTION_MS` 死代码；`DAL.loadAll` 不再直删 DB（重复检测由云函数幂等保证）| versionCode 31→32
- 旧 v9.0.0 完整细节见 [`docs/version-history-archive.md`](./docs/version-history-archive.md)

---

## v9.0.0（服务端权威写入架构重构，在下一次重构前永不删除）

> ⚠️ **完整日志已归档**：本节仅保留概述。完整内容（架构变更、新增文件、移除的防御代码、简化的代码、tbMutation 支持的 13 个 action）见 [`docs/version-history-archive.md`](./docs/version-history-archive.md#v900服务端权威写入架构重构)

### 核心问题
v7.0.0 以来，同步机制经历了 170+ 处补丁修复（Watch 回声识别 49%、跨设备冲突 20%、余额不一致 19%、写入竞态 12%），形成"补丁螺旋"——每代补丁都在解决上代补丁引入的新问题。根因：客户端同时承担"写入者"和"同步决策者"，缺乏权威冲突仲裁。

### 根因
客户端直接写入 DB → Watch 收到自身回声 → 需要 pendingRegistry 识别 → 多设备并发写入 → 需要 clientId 感知合并 → 余额客户端增量更新可能漂移 → 需要强制重算。v7.28.0 曾尝试云函数写入但因同步等待 2-5 秒而回退。

### 架构变更（一句话）
所有数据变更通过云函数 `tbMutation` 统一执行（13 个 action：addTransaction / updateTransaction / deleteTransaction / saveTask / startTask / stopTask / saveProfile / ...），客户端不再直接写入数据库。详见 archive。

---

## v8.2.15（跨设备 running 状态冲突修复）

### 核心问题
Android 端完成任务后，Web 端 stale running 状态覆盖完成状态，导致交易丢失。

### 根因
5 个独立根因：缺少跨设备乐观锁，`clientId` 感知合并机制不完善。

### 6 项修复
| 修复项 | 关键逻辑 |
|--------|---------|
| `DAL.startTask` UPDATE→ADD 回退 | UPDATE 失败时清缓存，回退 ADD |
| `DAL.updateRunningTask` 存在性守卫 | 检测 not found 时清理缓存和任务 |
| `tb_running` 增加 `lastUpdatedAt` | 所有写入附带时间戳 |
| `DAL.loadAll` 跨设备合并 | clientId 感知：本地有则保留，本机无则接受云端 |
| `applyDataState` 跨设备保护 | clientId 感知合并 |
| Watch remove 清理缓存 | 远程删除时同步清缓存 |

### 合并规则
- 云端 clientId === 本机 → 信任云端
- 云端 clientId !== 本机且本地有 → **保留本地**
- 云端 clientId !== 本机且本地无 → 接受云端

---

## v8.2.14（利息计算交叉校验 + 历史修复功能）

### 改动 1：余额交叉校验
- 新增 `calculateEndingBalanceFromTransactions()` 辅助函数
- 若 `|cached - calculated| > 1` 秒，使用计算值并修正账本缓存

### 改动 2：历史修复功能
- 新增 `recalculateAllInterest()` 函数（设置页按钮触发）
- 流程：标记 undone → 清空账本 → 从 firstEnabledAt 重新结算

---

## v8.2.13（统一使用东八区时区）

- 前端 `getLocalDateString`：使用 `Intl.DateTimeFormat` 指定 `Asia/Shanghai`
- Android `getAppScreenTimeForDate`：使用 `TimeZone.getTimeZone("Asia/Shanghai")`

---

## v8.2.12（自动检测补录日期匹配修复）

- `hasAutoDetectTransactionForDate`：优先使用 `originalDate`，回退 timestamp
- `getTaskRecordedTimeForDateIncludeAuto`：同样优先 `originalDate`
- `parseTimeFromDescription`：新增支持 `(漏记30分钟, ×1.2惩罚)` 格式

---

## v8.2.11（屏幕时间手动记录 + 时区一致性修复）

- 新增 `addManualScreenTimeRecord()` 函数（设置页 UI）
- `autoDetectAppUsage`：统一使用 `getLocalDateString(new Date())`

---

## v8.2.10（负余额惩罚强制启用 + 金融设置云端同步修复）

- `shouldApplyNegativeBalancePenalty()`：移除开关，始终返回 true
- `DAL.saveProfile`：添加 `financeSettings`/`interestLedger` 的 `_.set()` 自动包装

---

## 早期版本索引（压缩摘要）

| 版本 | 核心内容 |
|------|---------|
| v9.0.5 | P0 修复：任务复活数据损坏 + onRollback 完整化（4 个 mutation 全部具备 onRollback）；Proxy `deleteProperty` trap 补全；`_notifiedIds` 内存清理 |
| v8.2.9 | 补录弹窗 try/finally 保护 |
| v8.2.8 | 大数据量秒开 + 后台增量同步 |
| v8.2.7 | saveTask 数据保护：clientId、失败重试队列、字段级合并 |
| v8.2.6 | 登录态误报修复、后台延迟修复 |
| v8.2.5 | 通透模式 UI 修复 |
| v8.2.4 | 任务完成后余额双倍计算修复 |
| v8.2.3 | 后台结束任务 UI 僵死修复 |
| v8.2.2 | Watch 连接僵死 + 手动同步失效修复 |
| v8.2.1 | 全量同步覆盖 pending 交易修复 |
| v8.2.0 | AI 统一认知架构 |
| v8.1.0 | AI 增强：Kimi 模型、CLI 部署 |
| v8.0.0 | AI 云端方案：DeepSeek + HTTP 访问服务 |
| v7.39.x | Habit System 3.0 重构 |
| v7.38.0 | pendingRegistry 机制 |
| v7.37.x | Watch 去重修复、clientId 修复 |
| v7.36.x | 性能优化、AlarmManager 修复 |

---