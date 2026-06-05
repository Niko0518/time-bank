# v9.0.10 Watch 修复 + Bug 完善 + 用户感知

## Why

v9.0.9 之后暴露 3 类问题：

### 问题 1：真 Bug
- **Bug ①** 戒除习惯 weekly 结算崩溃 `TypeError: baseDate.getDay is not a function`（`app-2.js:3828`）
- **Bug ②** 任务模态框事件监听器 null 崩溃（`app-auth.js:2479` → initApp 调用链）

### 问题 2：Watch SDK 故障循环（控制台大量报错）
- `pong timed out` / `wsclient.send timedout` 持续刷屏
- `reconcileCloudAfterWatch` 每 30 秒触发 `subscribeAll` → 5 个 watch 立刻失败 → 退避重连 → 又失败
- **根因**：CloudBase SDK v2 WebSocket **空闲心跳超时**（无流量 30s 自动断开），我们误把"SDK 健康机制"当"连接断开"处理

### 问题 3：用户对"降级"的根本担忧（关键设计约束——v9.0.10 完善）
用户原话 3 条：
1. "**watch是必须坚持的机制！绝对不允许替换**"——Watch 是核心，必须修好
2. "**watch出现问题一定要让用户在使用时感知和在控制台中报错**"——必须可见
3. "**如果watch出现问题不得不采用降级方案，必须让用户在监听状态显示器中清楚看到**"——降级是最后手段，且必须显眼

**v9.0.10 之前的设计问题**：
- 3 次失败就停止自动重连 = **过度依赖降级**（违反"修复优先"原则）
- "降级"语义模糊：是"暂停重连"还是"放弃 Watch"？
- 降级后无自我恢复：必须用户手动点按钮 = 把修复责任推给用户
- 4 状态指示器仅在 tab 标签上 = 用户不一定看得到
- 没有任何诊断信息告诉用户"为什么 Watch 坏了"

**v9.0.10 完善后的设计原则**：
- **优先级 1：彻底修复 Watch 根因**（A1 主动心跳保活，覆盖 95% 场景）
- **优先级 2：智能重连 + 更长退避**（A2，从 3 次 → 8 次，且增加自愈探针）
- **优先级 3：降级仅作为最后兜底**（仅在 8 次失败 + 网络确认断开时），**且降级期间仍有自愈机制**（每 60s 自动探活）
- **降级状态必须**：
  - 4 状态指示器在 App 顶部固定位置（不依赖 tab 切换）
  - 启动时强制显示（如果上次降级）
  - 控制台持续输出（不降噪）
  - 自我探活恢复（不等用户操作）

## What Changes

### A. Watch 修复（核心，绝不替换）
- **A1 主动心跳保活机制**（根因修复）：每 20s 调一次 `db.collection('tb_profile').limit(1).get()`，让 SDK 内部 WebSocket 保持活跃不进入空闲超时
- **A2 智能重连 + 8 次上限**：连续失败 8 次后才停止自动重连（不是 3 次），状态指示器变红+显示自愈倒计时
- **A3 降级期间自愈探针**：即使"降级"状态，每 60s 自动尝试一次探活，**不等用户手动操作**
- **A4 控制台保留 error 级别**（用户要求看到错误），但错误频率因 A1 大幅降低（从 30s/次 → 接近 0）

### B. 云端状态 4 级指示器（用户感知核心——强化版）
- **位置**：App 顶部固定状态条（`#cloudStatusBar`，**不依赖 tab**），始终可见
- **4 状态**：
  - 🟢 **已连接**：Watch + 心跳正常
  - 🟡 **心跳保活中**：Watch 偶发断开，自动恢复中（带重试次数显示）
  - 🔴 **Watch 已暂停**（语义修正：从"异常"改为"已暂停"）：8 次连续失败后停止自动重连，**但有自愈探针在后台跑**（用户原话"清楚看到"——明确告诉用户是"暂停"不是"废弃"）
  - ⚫ **未登录**
- **点击状态条 → 弹出诊断面板**（B+ 新增）：显示"何时降级 / 失败原因 / 上次心跳时间 / 自愈倒计时"

### C. 设置页"重置 Watch"按钮（保持，作为用户主动操作入口）
- 默认 hidden
- 状态变红时显示
- 点击后：清零计数器 + 立即 `subscribeAll` + 启动心跳保活
- **新增**：按钮旁显示"自愈倒计时：Xs"倒计时

### D. 状态持久化（保持）
- 写 `localStorage.tb_watchDegradeState`：`{firstFailAt, lastFailAt, failCount, status, lastReason, probeCountdown}`
- 跨刷新保留，刷新后用户仍能看到"上次 Watch 异常"
- **新增 `lastReason` 字段**：记录最后一次失败原因（便于诊断）

### E. Bug 修复层
- **E1 修 Bug ①**：`__normalizeDate` 工具 + `getPreviousPeriodEnd` / `stepToNextPeriodEnd` 入口守卫
- **E2 修 Bug ②**：`__safeBind` / `__safeBindAll` 工具 + 重构 `setupTaskModalEventListeners` / `setupReportEventListeners`
- **E3 启动隔离**：`__safeSetup` 包裹 initApp 中的所有 setupXxx 调用

### F. 持久化扫描 + SW 升级 + 版本号
- 扫 `localStorage` 时间字段安全性
- `sw.js` CACHE_NAME → `timebank-v9-0-10`
- 11 处版本号同步

## Impact

- Affected specs: 无
- Affected code:
  - `js/app-2.js`（E1：__normalizeDate + 2 处守卫）
  - `js/app-auth.js`（E2：safeBind 工具 + setupTaskModal 重构；C：handleResetWatch）
  - `js/app-reports.js`（E2：setupReport 重构）
  - `js/app-1.js`（E3：safeSetup；A1-A4：主动心跳保活 + 智能重连 8 次 + 降级自愈探针；B：4 状态 UI + 诊断面板；D：持久化 + lastReason）
  - `index.html`（B：顶部 #cloudStatusBar + 诊断面板弹窗；C：设置页"重置 Watch"按钮 + 自愈倒计时）
  - `sw.js`（F：CACHE_NAME）
  - `AGENTS.md`（F：技术日志）
- 不涉及云函数/数据库变更
- **不需要云端部署**（纯客户端）

## ⚠️ 关键设计原则（用户原话落实 + v9.0.10 完善）

| 用户原话 | v9.0.10 完善后设计落实 |
|---|---|
| "watch是必须坚持的机制！绝对不允许替换" | **A1-A4 修复 Watch 根因**，绝不替换为轮询或废弃 |
| "watch出现问题一定要让用户在使用时感知" | **B 顶部固定状态条**（不是 tab 标签），用户始终可见 |
| "在控制台中报错" | **A4 保留 console.error**，不降噪到 debug 级别 |
| "如果watch出现问题不得不采用降级方案，必须让用户在监听状态显示器中清楚看到" | **B 4 状态指示器**（固定位置） + 状态变红时显式标注"已暂停" + **A3 自愈探针**（降级不持续 60s+ 就自动恢复） + **点击状态条看诊断面板** |
| "为什么要降级而不是修复？"（新） | **A1 主动心跳保活**覆盖 95% 场景（根因修复），**A2 重试次数从 3 → 8** 给更多修复机会，**A3 降级自愈探针**避免永久降级 |

### "降级"语义重定义（v9.0.10 重要变更）

| 旧语义 | 新语义 |
|---|---|
| "降级"= 停止自动重连，等用户操作 | "降级"= 暂停自动重连 + 后台自愈探针每 60s 探活 |
| 🔴 "Watch 异常" | 🔴 "Watch 已暂停（自愈中：Xs）" |
| 必须用户手动重置 | **60s 内自动恢复**（如果网络恢复） |
| 状态变红就停 | 状态变红**但**有自愈倒计时 |

### 降级边界（极少触发，v9.0.10 强化）

**触发条件**（必须**同时**满足）：
1. 连续失败 8 次（从 3 提升）
2. 心跳保活也失败（A1 已用）
3. 网络层确认断开（fetch 探活也失败）
4. 持续时间 > 60 秒

**降级时**（不静默）：
- ✅ 状态指示器固定位置显示 🔴「Watch 已暂停（自愈中：Xs）」
- ✅ 诊断面板显示失败原因 + 重试次数
- ✅ 控制台 `console.error` 输出（**保留**）
- ✅ 设置页"重置 Watch"按钮可见
- ✅ **自愈探针每 60s 自动跑一次**（不等用户）

**绝对不静默**——任何"功能在故障但用户无感知"的状态都不允许。

## ADDED Requirements

### Requirement: 主动心跳保活机制（A1，根因修复）
系统 SHALL 在 Watch 建立成功后启动定时心跳保活：
- 间隔 20 秒调一次 `db.collection('tb_profile').limit(1).get()`（极轻量）
- 仅在 `watchConnected` 全为 true 时启动
- 重连成功后清零间隔为 5 分钟（避免频繁请求），失败时恢复 20s

#### Scenario: 长时间空闲无数据变更
- **WHEN** 用户 5 分钟无操作，云端无新数据
- **THEN** WebSocket 心跳保持活跃，**不触发** `pong timed out`，**不进入**故障循环

### Requirement: 智能重连策略（A2，8 次上限）
系统 SHALL 在 `scheduleWatchReconnect` 中实现：
- 退避策略保留（3-60s 指数退避）
- **连续失败 8 次后停止自动重连**（从 3 提升）
- 停止时更新 `__watchDegradeStatus = 'paused'` + 触发 `updateCloudStatusUI()` + 设置页显示重置按钮

#### Scenario: 持续网络断开
- **WHEN** 持续断网 1-2 分钟
- **THEN** 8 次重连失败后停止自动重连，状态指示器变红 + 启动自愈探针

### Requirement: 降级期间自愈探针（A3，关键改进）
系统 SHALL 在降级状态（`paused`）下：
- 每 60s 自动尝试一次 `db.collection('tb_profile').limit(1).get()` 探活
- 探活成功 → 立即 `subscribeAll` 重建 + 状态恢复 🟢
- 探活失败 → 倒计时减 1，**永不放弃**
- 倒计时显示在状态指示器旁（"自愈中：60s"）

#### Scenario: 降级期间网络恢复
- **WHEN** 用户降级 30 秒后恢复网络
- **THEN** 自愈探针在下次 60s 周期内检测到网络恢复 → 自动重建 Watch → 状态恢复 🟢（**用户无需任何操作**）

#### Scenario: 长时间断网
- **WHEN** 用户持续断网 5 分钟
- **THEN** 自愈探针每 60s 尝试，期间状态指示器一直显示倒计时（用户看到系统在努力自愈）

### Requirement: 顶部固定 4 状态指示器（B，强化）
系统 SHALL 在 App 顶部固定位置（不依赖 tab）显示云端状态条：
- 元素 id：`#cloudStatusBar`
- 位置：`index.html` `<body>` 第一个子元素
- 4 状态：
  - 🟢 **已连接**
  - 🟡 **心跳保活中**（带重试次数："🟡 心跳保活中 (2/8)"）
  - 🔴 **Watch 已暂停（自愈中：Xs）**（带自愈倒计时）
  - ⚫ **未登录**

#### Scenario: 用户主动查看状态
- **WHEN** 用户启动 App 或停留在任何 tab
- **THEN** 顶部固定状态条始终可见，**不依赖 tab 切换**

#### Scenario: 状态变红时
- **WHEN** Watch 进入暂停状态
- **THEN** 状态条变红 + 显式标注"已暂停"（不是"异常"）+ 显示自愈倒计时

### Requirement: 诊断面板（B+ 新增）
系统 SHALL 在用户点击状态条时弹出诊断面板：
- 显示字段：
  - 状态、降级时间、最后心跳时间
  - 失败原因（`lastReason`：网络断开 / SDK 超时 / 未知）
  - 当前重试次数 / 上限
  - 自愈倒计时
- 按钮："立即重试" / "查看控制台日志"

#### Scenario: 用户点击状态条
- **WHEN** 用户点击顶部状态条（任意状态）
- **THEN** 弹出诊断面板，用户可看到所有内部状态细节

### Requirement: 设置页"重置 Watch"按钮 + 自愈倒计时（C）
系统 SHALL 在 `index.html` 设置页增加按钮：
- id: `resetWatchButton`
- 默认 `hidden`
- 状态变红时显示
- **按钮旁**显示自愈倒计时（"自愈中：60s"）
- `onclick="handleResetWatch()"`

#### Scenario: 用户主动恢复
- **WHEN** 状态变红，用户点击"重置 Watch"
- **THEN** 弹确认 → 重置 + 立即重建 + 状态恢复

### Requirement: Watch 状态持久化（D）
系统 SHALL 写 `localStorage.tb_watchDegradeState`：
- `{firstFailAt, lastFailAt, failCount, status, lastReason, probeCountdown}`
- 跨刷新保留
- 状态指示器基于此 + 实时数据综合判定

#### Scenario: 跨刷新恢复
- **WHEN** 用户在状态变红时刷新页面
- **THEN** 状态条继续显示 🔴「Watch 已暂停（自愈中：Xs）」+ 重置按钮可见

### Requirement: 时间参数规整（E1）
系统 SHALL 在 `app-2.js` 顶部新增 `__normalizeDate(input, contextLabel)`：
- Date / 正数 number / 有效 ISO 字符串 → 返回 Date
- 无效输入 → 警告 + null
- null/undefined → 静默 null

`getPreviousPeriodEnd` / `stepToNextPeriodEnd` 入口守卫。

### Requirement: 安全事件绑定（E2）
系统 SHALL 在 `app-auth.js` 顶部新增 `__safeBind` / `__safeBindAll`：
- 元素存在 → 正常绑定
- 缺失 + critical=true → console.error
- 缺失 + critical=false → console.warn
- 永不 throw

### Requirement: 启动初始化隔离（E3）
系统 SHALL 在 `js/app-1.js` 顶部新增 `__safeSetup(label, fn)`：
- try/catch 包裹
- 失败 console.error + 不 throw

`initApp` 中所有 setupXxx 调用都用 `__safeSetup` 包裹。

## MODIFIED Requirements

### Requirement: 戒除习惯 weekly 周期结算
**MODIFIED**：入口 `__normalizeDate` 守卫，无效输入返回 null，**不抛 `TypeError`**。

### Requirement: 任务模态框事件绑定
**MODIFIED**：用 `__safeBind` declarative 表，**任一缺失不影响其他**。

### Requirement: Watch 重试上限
**MODIFIED**：从 3 次提升到 **8 次**。给修复更多机会，不轻易降级。

### Requirement: 降级状态语义
**MODIFIED**：从 "down"（用户感觉是"坏了"）改为 **"paused"**（用户感觉是"暂停了，会自己恢复"），状态条文案从 "Watch 异常" 改为 **"Watch 已暂停（自愈中：Xs）"**。

### Requirement: 降级期间自愈
**MODIFIED**：降级不是终点，**每 60s 自动探活**（A3），不等用户操作。

## REMOVED Requirements

### Requirement: 全局 unhandledrejection 降噪
**Reason**: 用户明确要求"控制台必须报错"。降噪违背用户原则。
**Migration**: 不再 preventDefault SDK 噪音。错误正常显示在控制台。

### Requirement: 3 次失败即停止重连
**Reason**: v9.0.10 完善后发现 3 次太激进，违反"修复优先"原则。
**Migration**: 提升为 8 次，且降级期间有自愈探针。
