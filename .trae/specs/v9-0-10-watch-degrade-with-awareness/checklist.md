# Checklist — v9.0.10 Watch 修复 + Bug 完善

> 实施完成后逐项验证。每项验证方式：读代码 + 模拟场景 + 控制台/UI 检查
> **v9.0.10 完善重点**：A3 自愈探针 + B 顶部固定状态条 + 8 次失败上限 + 诊断面板

## Group A: Watch 修复（核心）

### A1: 主动心跳保活机制

- [ ] `__startWatchHeartbeat()` 函数在 `app-1.js` 顶部定义
  - 验证：每 20s 调 `db.collection('tb_profile').limit(1).get()`
  - 成功时静默（不 console.log），更新 `__watchLastHeartbeatAt`
  - 失败时静默（不 throw）

- [ ] `__stopWatchHeartbeat()` 函数存在

- [ ] `DAL.subscribeAll` 末尾调 `__startWatchHeartbeat()`
  - 模拟：启动 App → 等待 30 秒 → `__watchLastHeartbeatAt` 更新

- [ ] `DAL.unsubscribeAll` 调 `__stopWatchHeartbeat()`

### A2: 智能重连策略（8 次失败上限——从 3 提升）

- [ ] `MAX_RECONNECT_ATTEMPTS = 8`（原 3）
  - 验证：读 `app-1.js` 顶部
  - 模拟：8 次重连失败后才停止

- [ ] 失败达上限时 `__watchDegradeStatus = 'paused'`（**不是 'down'**）
  - 验证：读 `app-1.js` scheduleWatchReconnect catch 块
  - 控制台输出 `❌ [Watch] 自动重连已停止（连续 8 次失败），启动自愈探针每 60s 探活`

- [ ] 重连成功后清零状态
  - `__watchDegradeStatus = 'ok'`

### A3: 降级期间自愈探针（关键改进！v9.0.10 完善）

- [ ] `__startSelfHealingProbe()` 函数存在
  - 验证：每 60s 调 `db.collection('tb_profile').limit(1).get()` 探活
  - 探活成功 → 立即重建 Watch + 状态恢复 🟢
  - 探活失败 → 倒计时减 1，**永不放弃**

- [ ] `__stopSelfHealingProbe()` 函数存在
  - 状态恢复 🟢 时调

- [ ] scheduleWatchReconnect 失败达上限后自动调 `__startSelfHealingProbe()`
  - 验证：读代码
  - 模拟：8 次失败 → 自动启动自愈探针（不等用户操作）

- [ ] 启动时如果 `localStorage` 状态是 `paused`，自动启动自愈探针
  - 模拟：手动写 `localStorage.tb_watchDegradeState = '{"status":"paused"}'` → 启动后自愈探针跑起来

### A4: 控制台保留 error（关键！用户原话）

- [ ] **5 处 onError 保持 `console.error` 不变**
  - 验证：读 `app-1.js` 5 处
  - 验证：**不存在** `__isWatchTimeoutError` 工具
  - 验证：**不存在** unhandledrejection 监听器
  - 模拟：断网 → 控制台仍可见 5 个 `❌ [DAL] xxx watch error: Error`

---

## Group B: 顶部固定 4 状态指示器（强化用户感知）

### B1: 状态变量扩展

- [ ] 6 个全局变量定义
  - `__watchDegradeStatus` / `__watchFirstFailAt` / `__watchFailCount` / `__watchLastHeartbeatAt`
  - **新增**：`__watchLastReason`（'network' / 'sdk_timeout' / 'unknown'）
  - **新增**：`__watchSelfHealingCountdown`（数字，倒计时）

- [ ] `__loadWatchDegradeState()` 读取新字段
  - 模拟：写 `localStorage.tb_watchDegradeState = '{"status":"paused","lastReason":"network","probeCountdown":30}'` → 启动后状态应为 🔴 + 倒计时 30s

- [ ] `__recordWatchDegrade()` 写新字段
  - JSON 格式：`{firstFailAt, lastFailAt, failCount, status, lastReason, probeCountdown}`

- [ ] initApp 早期调 `__loadWatchDegradeState()`

### B2: 顶部固定状态条 UI

- [ ] `index.html` 中 `#cloudStatusBar` 元素存在
  - 位置：`<body>` 第一个子元素
  - 默认 `class="cloud-status-bar status-ok"`
  - `onclick="showWatchDiagnostics()"`

- [ ] `updateCloudStatusUI()` 重写支持 4 状态
  - 4 状态文案：
    - 🟢 已连接
    - 🟡 心跳保活中 (2/8)
    - 🔴 Watch 已暂停（自愈中：Xs）
    - ⚫ 未登录

- [ ] 状态判定逻辑正确
  - 未登录 → ⚫
  - `__watchDegradeStatus === 'paused'` → 🔴「Watch 已暂停（自愈中：Xs）」
  - `__watchDegradeStatus === 'degraded'` 或 `__watchFailCount > 0` → 🟡「心跳保活中 (n/8)」
  - 其他 → 🟢 已连接

- [ ] CSS `.cloud-status-bar` 4 颜色样式
  - 顶部 fixed 位置

### B3: 诊断面板（点击状态条弹出）

- [ ] `index.html` 中 `#watchDiagnosticsModal` 元素存在
  - 默认 `hidden`
  - 字段：状态 / 降级时间 / 最后心跳时间 / 失败原因 / 重试次数 / 自愈倒计时
  - 按钮：「立即重试」/「关闭」

- [ ] `showWatchDiagnostics()` 函数存在
  - 填充字段 + 显示弹窗

- [ ] 「立即重试」按钮调用 `handleResetWatch()`

### B4: 触发点

- [ ] 5 处 onError 调 `__markWatchFailure(reason)` + `updateCloudStatusUI()`
  - 失败原因分类：网络断开 / SDK 超时 / 未知

- [ ] `scheduleWatchReconnect` 成功时调 `__markWatchSuccess()` + `updateCloudStatusUI()`

- [ ] 状态变红时控制台输出 `❌ [Watch] Watch 已暂停自动重连（自愈探针 60s 后探活）`

---

## Group C: 设置页"重置 Watch"按钮 + 自愈倒计时

- [ ] `index.html` 中 `resetWatchButton` 元素存在
  - 默认 `class="hidden"`
  - `onclick="handleResetWatch()"`

- [ ] 旁加 `selfHealingCountdown` 元素（显示「自愈中：Xs」）

- [ ] `handleResetWatch()` 函数存在
  - 弹 confirm
  - 重置所有状态 + 立即 unsubscribeAll + subscribeAll
  - 调 `__stopSelfHealingProbe()`
  - 成功 toast「✅ Watch 连接已重置」
  - 失败 toast「❌ 重置失败：xxx」+ 启动自愈探针

- [ ] `updateCloudStatusUI()` 联动显示/隐藏按钮
  - 状态变红时显示
  - 状态恢复时隐藏

- [ ] 倒计时实时更新
  - 自愈探针每 60s tick 时减 1
  - UI 同步显示

---

## Group D: Bug 修复层

### D1: 时间参数规整

- [ ] `__normalizeDate` 函数在 `app-2.js` 顶部定义
- [ ] `getPreviousPeriodEnd` 入口有 `__normalizeDate` 守卫
- [ ] `stepToNextPeriodEnd` 入口有 `__normalizeDate` 守卫

### D2: 安全事件绑定

- [ ] `__safeBind` / `__safeBindAll` 在 `app-auth.js` 顶部定义
- [ ] `setupTaskModalEventListeners` 改用 declarative 表
- [ ] `setupReportEventListeners` 改用 declarative 表

### D3: 启动隔离

- [ ] `__safeSetup` 函数在 `app-1.js` 顶部定义
- [ ] initApp 中所有 setupXxx 调用用 `__safeSetup` 包裹

---

## Group E: 持久化扫描 + SW 升级 + 版本号

- [ ] localStorage 时间字段扫描结论：均为 ISO 字符串

- [ ] `sw.js` CACHE_NAME → `timebank-v9-0-10`

- [ ] 11 处版本号同步（versionCode 39→40）
  - `index.html` 第 12 行 `<title>` ✅
  - `index.html` 第 201 行 `.version-subtitle` ✅
  - `index.html` 第 1346 行 关于页 ✅
  - `index.html` 第 1405 行 用户日志标题 ✅
  - `js/app-1.js` 第 2 行 `APP_VERSION` ✅
  - `js/app-1.js` 第 6 行 启动日志注释 ✅
  - `sw.js` 第 1 行 文件头注释 ✅
  - `sw.js` 第 3 行 CACHE_NAME ✅
  - `android_project/app/build.gradle` versionName → "9.0.10" ✅
  - `android_project/app/build.gradle` versionCode → 40 ✅
  - `AGENTS.md` 头部 → v9.0.10 ✅

- [ ] `AGENTS.md` v9.0.10 技术日志
  - 包含：核心问题、根因、修复项、用户可见改善、影响范围
  - 文件 ≤ 800 行
  - v9.0.5 之前版本归档

---

## 整体回归（最终验证——v9.0.10 强化）

### 用户感知核心场景（修复优先 + 降级感知）
- [ ] 启动 App → 顶部固定状态条显示 🟢「已连接」+ 心跳保活 20s 一次
- [ ] 长时间空闲（5 分钟）→ 状态条持续 🟢（A1 心跳保活生效，无 pong 错误）
- [ ] 网络抖动 5 秒 → 状态条短暂 🟡 后自动恢复 🟢
- [ ] 断网 1 分钟 → 8 次重连失败 → 状态条变 🔴「Watch 已暂停（自愈中：Xs）」+ 自愈探针启动
- [ ] 状态变红时控制台持续输出 error（用户要求保留）
- [ ] 状态变红时点击状态条 → 弹出诊断面板 → 显示失败原因/重试次数/自愈倒计时
- [ ] 断网 30 秒后恢复网络 → 自愈探针下次 tick 检测到 → **自动重建** + 状态恢复 🟢（**用户无需操作**）
- [ ] 长时间断网（5 分钟）→ 自愈探针每 60s 尝试 → 倒计时持续显示
- [ ] 手动点设置页"重置 Watch" → 弹确认 → 立即重建
- [ ] 状态变红时刷新 → 顶部状态条继续 🔴 + 自愈探针后台跑（持久化生效）
- [ ] 离线状态仍可完成/停止任务（不依赖 Watch）

### Bug 修复场景
- [ ] 删除 `isHabitToggle` → App 启动不崩
- [ ] 把 `app-2.js:3782` 改为 `null` → 戒除习惯 weekly 不崩

### 反向验证（确认不破坏既有功能）
- [ ] 5 处 onError 仍是 console.error 级别（**没被降噪**）
- [ ] 不存在 `__isWatchTimeoutError` 工具（**未被引入**）
- [ ] 不存在 unhandledrejection 监听器（**未被引入**）
- [ ] Watch 仍是数据同步核心机制（**未被替换**）
- [ ] 跨设备实时同步仍可用

---

## 拒绝完成条件

- ❌ 11 处版本号未全部同步
- ❌ 控制台 error 级别被降为 debug（违背用户原话）
- ❌ 删 id / 传 null Date 仍崩
- ❌ 顶部固定状态条未实现（违背"用户感知优先"原则）
- ❌ 降级期间无自愈探针（违背"修复优先"原则）
- ❌ 诊断面板未实现（违背"用户必须清楚看到"原则）
- ❌ MAX_RECONNECT_ATTEMPTS 仍是 3（违背"v9.0.10 完善"原则）
- ❌ 启动 setup 失败导致后续 setup 不执行
- ❌ 引入 `__isWatchTimeoutError` 或 unhandledrejection 监听器（**明确禁止**）
- ❌ 替换 Watch 为轮询（**明确禁止**）
- ❌ 状态条文案用"异常"而不是"已暂停"（违背 v9.0.10 语义修正）
