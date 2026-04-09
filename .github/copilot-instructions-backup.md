# Time Bank - AI 编程指南

> ⚠️ **强制规则**：每次更新请阅读本指令，在更新后，凡是涉及关键技术细节或重要改动时，必须将其添加到本文件的「第二部分：版本更新日志」中。我们的交流语言是中文。当用户提出給我一个“方案”时，若无特殊要求，意思是先不实施，等和用户一起商讨，得到用户确认后实施。
> ⚠️ **日志更新规则（新增）**：
> - **用户日志（HTML 中的版本更新日志）**：仅在用户明确下达“更新用户日志/撰写用户日志”指令时才修改。
> - **术语约定（新增）**：用户后续提到“撰写日志”，默认指 **用户日志（HTML 中的版本更新日志）**。
> - **技术日志（本文件第二部分）**：由 AI 按需更新，仅在存在关键技术细节或重要改动时记录。
> - **技术日志频率控制（新增）**：默认降频记录，仅对“重要且影响深远”的改动写入技术日志（如架构、数据一致性、跨端兼容、核心流程）。
> - **文字修改沟通规则（新增）**：凡涉及文案/文字内容修改，AI 必须在执行前说明将修改哪些文案（版本更新日志不使用此条），执行后说明实际修改了哪些文案。

---

## 📋 每次更新前复述用户需求

---

# 第一部分：项目概况与技术基础

> 本部分包含项目的整体架构、核心文件、关键配置等基础信息。**每次开始工作前必须阅读理解**。

---

## 1.1 项目概述

Time Bank 是一个 **混合开发 (Hybrid) 的安卓应用**，结合原生 Java 外壳和 WebView 前端界面。

**技术栈**：
- **前端**: 原生 JavaScript (Vanilla JS)，无框架，多文件拆分结构
- **样式**: CSS 变量，支持深色模式 (`prefers-color-scheme`)
- **云端**: 腾讯 CloudBase JS SDK v2
- **Android**: Java，minSdk 24，targetSdk 36，compileSdk 36
- **构建**: Gradle 8.x

---

## 1.2 核心文件结构

### 前端文件（`android_project/app/src/main/assets/www/`）

| 文件 | 用途 | 行数 |
|------|------|------|
| `index.html` | HTML 骨架 + 早期内联脚本（主题/迁移/SDK 加载） | ~3,810 行 |
| `css/main.css` | 全部 CSS 样式 | ~5,825 行 |
| `js/app-1.js` | 全局变量 + DAL 初始化 + 任务管理 UI + initApp | ~6,122 行 |
| `js/app-2.js` | 颜色工具 + 任务运行逻辑 + 习惯系统 | ~6,051 行 |
| `js/app-reports.js` | 数据处理基础 + 报告系统（流图/饼图/趋势/热图/表格）+ 工具函数 + 权限/卡片 | ~7,535 行 |
| `js/app-sleep.js` | 睡眠管理系统（设置/状态/倒计时/结算/闹钟） | ~3,124 行 |
| `js/app-systems.js` | 设备 ID + 屏幕时间 + 均衡模式 + 金融系统 + 自动检测补录 + 主题/外观 | ~5,206 行 |
| `js/app-auth.js` | 认证登录 + 数据导入导出 + saveData/initApp 事件绑定 | ~3,370 行 |
| `sw.js` | Service Worker (PWA 缓存) | ~100 行 |

**加载顺序**（index.html 中声明顺序，不可改变）：
```
app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

### Android 原生文件

| 文件 | 用途 | 行数 |
|------|------|------|
| `android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java` | Android 入口，WebView 初始化 | ~200 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java` | JS 桥接 (`window.Android`) | ~900 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/AlarmReceiver.java` | 闹钟广播接收器 | ~100 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/FloatingTimerService.java` | 悬浮窗计时器服务 | ~850 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/BootReceiver.java` | 开机广播接收器 | ~50 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/BalanceWidget*.java` | 时间余额小组件 (4 种样式) | ~200 行/个 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/ScreenTimeWidget*.java` | 屏幕时间小组件 (4 种样式) | ~200 行/个 |

### ⚠️ 三端文件同步规则（最高优先级）

**权威源**: `android_project/app/src/main/assets/www/` —— 所有前端修改**只在此目录进行，绝对禁止在根目录进行**

**同步时机**（重要变更）:
- ❌ **修改代码后不再自动同步** — 日常开发中仅修改 Android 项目，不同步其他端
- ✅ **仅在收到"推送"指令时同步** — 在 git push 之前执行三端同步

**同步命令**（仅在推送前执行）:
```powershell
# 步骤1: Android → 根目录
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force

# 步骤2: Android → iOS
Copy-Item "android_project/app/src/main/assets/www/index.html" "ios_project/TimeBank/www/index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "ios_project/TimeBank/www/sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "ios_project/TimeBank/www/css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "ios_project/TimeBank/www/js/" -Recurse -Force
```

### ⚠️ "推送"指令完整工作流

当用户发出"推送"指令时，AI 必须按以下顺序执行完整工作流：

1. **三端同步** — 执行上述同步命令，确保 Android/根目录/iOS 完全一致
2. **验证一致性** — 运行 Hash 验证：
   ```powershell
   Get-FileHash "index.html","android_project/app/src/main/assets/www/index.html","ios_project/TimeBank/www/index.html" | Format-Table Path, Hash
   ```
   三端 Hash 必须完全一致
3. **检查版本号** — 确认 7 个位置的版本号已更新（若用户指定了新版本号）：
   - `index.html` `<title>` 标签
   - `index.html`class="version-subtitle">
   - `index.html` 关于页版本
   - `js/app-1.js` `APP_VERSION` 常量
   - `js/app-1.js` 启动日志
   - `sw.js` 文件头部（2 处）
   - `index.html` 首页版本副标题 `.version-subtitle`
4. **检查日志** — 确认技术日志（本文件第二部分）和用户日志（HTML 版本更新日志）已撰写，若没有撰写，立即撰写。
5. **执行推送** — 仅当以上检查全部通过后，执行 `git add -A` → `git commit` → `git push`

**禁止事项**:
- ❌ 未经用户"推送"指令，不得擅自执行 `git push`
- ❌ 不得擅自升级版本号（版本号由用户指定）
- ❌ 不得跳过三端同步直接推送

### 各 JS 文件的功能领域（v7.26.1 起）

| 文件 | 搜索哪类功能 |
|------|------------|
| `js/app-1.js` | 全局变量声明、DAL、CloudBase、任务卡片渲染、initApp |
| `js/app-2.js` | 颜色工具、任务计时/完成/停止、习惯连胜 |
| `js/app-reports.js` | addTransaction、报告页、时间流图、饼图、热图、通知、权限管理 |
| `js/app-sleep.js` | 睡眠设置/状态/结算/倒计时/闹钟 |
| `js/app-systems.js` | initDeviceId、屏幕时间、金融系统、均衡模式、**自动检测补录**（autoDetectAppUsage / collectAutoDetectRawRecords / recordAutoDetectRawUsage）、主题/外观 |
| `js/app-auth.js` | handleEmailLogin、数据导入导出、saveData、loadData |

### index.html 结构概览（v7.26.1 起）
```
行 1-150        : <head>（meta、早期主题脚本、迁移脚本、SDK 加载、CSS 引用）
行 150-3,797    : <body>（所有 HTML 模板：首页卡片、弹窗、设置页等）
行 3,797-3,810  : <script src="./js/..."> 按序引用 6 个 JS 文件
```

---

## 1.3 腾讯云 CloudBase 配置

### 环境信息
- **环境 ID**: `cloud1-8gvjsmyd7860b4a3`
- **地域**: `ap-shanghai`
- **登录方式**: 邮箱登录
- **SDK 版本**: v2.24.10

### 数据库集合

| 集合名称 | 安全规则类型 | 用途 |
|---------|-------------|------|
| `tb_profile` | ✅ 预置规则（读写本人数据） | 用户资料（含设备配置） |
| `tb_task` | ✅ 预置规则（读写本人数据） | 任务列表 |
| `tb_transaction` | 🔧 自定义规则 | 交易记录（含睡眠结算） |
| `tb_running` | ✅ 预置规则（读写本人数据） | 运行中任务 |
| `tb_daily` | 🔧 自定义规则 | 每日统计 |

### 自定义规则代码（tb_transaction / tb_daily）
```json
{
  "read": "doc._openid == auth.uid || doc._openid == auth.openid",
  "write": "doc._openid == auth.uid || doc._openid == auth.openid",
  "delete": true
}
```

### 安全规则对查询的影响
```javascript
// 预置规则 "读取和修改本人数据" - 不需要 where 条件
db.collection('tb_profile').get()  // CloudBase 自动过滤

// 自定义规则 - 需要手动添加 where 条件
db.collection('tb_transaction').where({ _openid: currentUid }).get()
```

### 云函数（v7.28.0 新增）

| 云函数名 | 运行时 | 用途 |
|---------|--------|------|
| `timebankSync` | Node.js 18.15 | 增量查询 + 幂等写入 |

**两个 action**：
- `getDelta`: 增量拉取（`_updateTime > lastSyncAt`），返回 `Array` 或抛异常
- `writeTransaction`: 幂等写入（已存在→只允许 undone=true；不存在→插入；其他→跳过）

**部署方式**：`@cloudbase/node-sdk` 在 Node.js 18 中**不是内置模块**，必须：
```powershell
cd cloudbase-functions/timebankSync
npm install
# 然后打包含 node_modules 的 ZIP 上传控制台，或使用 tcb CLI 部署
```

**客户端调用**（`js/app-1.js` DAL 对象内）：
- `DAL.fetchDelta(lastSyncAt)` → 返回 `Array`（成功）或 `null`（云函数未部署，调用方降级全量）
- `DAL.writeTransactionSafe(tx)` → 返回 `{code,action,id}` 或 `null`（降级直接写入）

### 关键代码位置
| 功能 | 搜索关键词 |
|------|-----------|
| DAL 对象 | `const DAL =` |
| SDK 初始化 | `initCloudBase` |
| Watch 实时监听 | `subscribeAll` |
| 数据加载 | `DAL.loadAll` |
| 任务保存 | `DAL.saveTask` |
| 增量同步 | `fetchDelta` / `mergeTransactionDelta` |
| 写入门禁 | `cloudSyncWriteLock` / `activateCloudSyncWriteLock` |

⚠️ **重要**: `saveData()` 不保存任务到云端，只保存 Profile。修改任务数据后需单独调用 `DAL.saveTask(task)` 同步到云端。

### ⚠️ DAL.saveProfile 架构陷阱（dot-notation key 限制）

`DAL.saveProfile(data)` 内部使用 `Object.assign(this.profileData, data)`。当 `data` 的 key 是 dot-notation（如 `"deviceSpecificData.deviceId123"`）时：

```javascript
// ❌ 这种写法只更新云端数据库，不更新内存中的嵌套属性
DAL.saveProfile({ "deviceSpecificData.abc": { ... } });
// DAL.profileData.deviceSpecificData["abc"] 在内存中永远不会被更新！

// ✅ 若需要读取最新值，必须从 localStorage 直接读取
const local = getAutoDetectRawRecordsLocal(); // 读 localStorage，不读 profileData
```

**影响范围**：`saveDeviceSpecificData()` / `saveDeviceSpecificDataDebounced()` 都用 dot-notation 写入，导致当前会话内写入的 `autoDetectRawRecords` 在 `DAL.profileData.deviceSpecificData` 中永远不可见。实际影响：`collectAutoDetectRawRecords` 若优先读 profileData，将永远看不到当前会话刚采集的原始用量记录。

### ⚠️ 自动结算函数必须有云端守卫

所有会创建交易记录的自动结算函数，在函数最开头必须加以下防护，防止在云端数据未就绪时在旧/空数据上重复结算：

```javascript
if (!hasCompletedFirstCloudSync && isLoggedIn()) {
    console.warn('[functionName] 云端数据尚未加载完成，跳过本次结算');
    return;
}
```

**已涵盖的函数**：`settleDailyInterest`（通过 checkAndSettleInterest 间接保护）、`autoSettleScreenTime`、`checkAbstinenceHabits`、`checkMissedSleepPenalty`（已删除）。新增结算函数时必须确保此守卫存在。

---

## 1.4 核心数据结构

### 睡眠设置 (localStorage: sleepSettings)
```javascript
sleepSettings = {
    enabled: false,
    plannedBedtime: '22:30',
    plannedWakeTime: '06:45',
    targetDurationMinutes: 495,
    durationTolerance: 45,
    toleranceReward: 60,
    countdownSeconds: 60,
    showCard: true,
    autoDetectWake: true,
    earlyBedtimeRate: 0.2,
    lateBedtimeRate: 0.5,
    earlyWakeRate: 0.2,
    lateWakeRate: 0.5,
    durationDeviationRate: 0.5,
    earnCategory: null,   // [v7.9.3] 睡眠奖励分类
    spendCategory: null,  // [v7.9.3] 睡眠惩罚分类
};
```

### 屏幕时间设置 (localStorage: screenTimeSettings)
```javascript
screenTimeSettings = {
    enabled: false,
    dailyLimitMinutes: 120,
    showCard: true,
    whitelistApps: [],
    settledDates: { deviceId: [dates] },
    earnCategory: null,
    spendCategory: null,
    cardStyle: 'classic',
};
```

### 睡眠状态 (localStorage: sleepState)
```javascript
sleepState = {
    isSleeping: false,
    sleepStartTime: null,
    unlockCount: 0,
    cancelledDates: [],
    lastSleepRecord: null,
    lastUnlockTime: null,
};
```

---

## 1.5 版本发布规则

### ⚠️ 版本号与推送原则（强制）
1. **版本号由用户指定**：用户在对话开始时声明版本号（如"开启 v7.11.2版本更新"），AI 在获得下一个版本号之前必须使用该版本号
2. **禁止擅自推送**：AI 不得在没有用户明确指令的情况下执行 `git push`
3. **禁止擅自升级版本号**：即使对话跨越多次修改，版本号保持用户指定的值不变
4. **代码注释版本号**：新增/修改的代码注释应使用用户指定的版本号（如 `// [v7.11.2] 修复...`）
5. **推送后升级**：只有在用户要求推送后，下次对话才能使用新版本号

### 更新版本号
1. `index.html` `<title>` 标签（约第 12 行）
2. `index.html` 关于页版本（搜索 `版本 v` 定位）
3. `js/app-1.js` `APP_VERSION` 常量（约第 6 行）
4. `js/app-1.js` 启动日志 `console.log("App vX.X.X...")`（搜索 `App v` 定位）
5. `sw.js` 文件头部（2 处）
6. `index.html` 首页标题下方版本副标题 `.version-subtitle`（搜索 `version-subtitle` 定位，格式为 `TimeBank vX.X.X 本版主题`）

### 更新 sw.js
```javascript
// Time Bank Service Worker - vX.X.X
const CACHE_NAME = 'timebank-cache-vX.X.X';
```

### 版本日志规则
- ⚠️ **仅在用户明确要求时**才撰写版本日志
- 日志按版本号**降序排列**（最新版本在最上面）
- 所有版本日志位于 `<details>` 区域（标题为「版本更新日志」）
- 更新日志位于约第 1301 行（index.html 中 `<summary>版本更新日志</summary>`）

### 推送前检查清单
- [ ] 三端文件 Hash 一致（index.html / sw.js / 全部 JS 文件）
- [ ] 版本号已更新（7 位置）
- [ ] 用户日志已更新（如用户要求）
- [ ] 技术日志已更新（本文件第二部分）

---

## 1.6 开发注意事项

### 修改前端代码 (index.html)
- `index.html` 仅含 HTML 结构（~3,810 行），**业务逻辑在 `js/` 目录下各文件**
- 修改 JS 前先用 `grep_search` 确认函数在哪个文件，再用 `read_file` 读取上下文
- 使用 `replace_string_in_file` 时提供 **3-5 行上下文**，确保唯一匹配
- 修改后用 `get_errors` 检查语法错误

### 同步机制概览（v7.28.0 起）

```
启动 / 重新联网
  ├─ lastCloudSyncAt > 6h 或首次 → activateCloudSyncWriteLock（门禁）
  └─ loadAll() 全量拉取 → 成功后 releaseCloudSyncWriteLock + 更新 lastCloudSyncAt

Watch 重建 / 30s 主动同步触发 reconcileCloudAfterWatch()
  ├─ 距上次同步 < 30 分钟 → fetchDelta() 增量 → mergeTransactionDelta()
  │   └─ fetchDelta 返回 null（云函数未部署）→ 降级全量 loadAll()
  └─ 距上次同步 ≥ 30 分钟 → loadAll() 全量（兜底）

新增交易 DAL.addTransaction()
  ├─ writeTransactionSafe()（云函数幂等写）
  └─ 返回 null（云函数未部署）→ db.collection().add() 直接写入

写入门禁激活期间 saveData() 直接 return，不写云端
```

### 常用搜索关键词
| 功能模块 | 搜索关键词 |
|---------|-----------|
| 云端同步 | `DAL.` / `app` / `subscribeAll` |
| 增量同步 | `fetchDelta` / `mergeTransactionDelta` / `reconcileCloudAfterWatch` |
| 写入门禁 | `cloudSyncWriteLock` / `lastCloudSyncAt` |
| 任务管理 | `tasks` / `startTask` / `completeTask` / `stopTask` |
| 交易记录 | `transaction` / `addTransaction` |
| 睡眠管理 | `sleepSettings` / `sleepState` / `睡眠时间管理` |
| 屏幕时间 | `screenTimeSettings` / `autoSettle` |
| 均衡模式 | `balanceMode` / `getBalanceMultiplier` |
| 登录认证 | `handleEmailLogin` / `signInWithPassword` |
| 版本信息 | `APP_VERSION` / `更新日志` |

### 添加新的 JS 桥接方法
1. 在 `WebAppInterface.java` 添加:
   ```java
   @JavascriptInterface
   public void newMethod(String param) { ... }
   ```
2. 在对应的 `js/app-*.js` 文件中调用（v7.26.1 起业务逻辑已全部移至 `js/` 目录）:
   ```javascript
   if (window.Android?.newMethod) {
       window.Android.newMethod("value");
   }
   ```

### 常用原生方法 (Android)
| 方法 | 用途 |
|------|------|
| `Android.saveFileDirectly(filename, content)` | 保存文件到下载目录 |
| `Android.vibrate(ms)` | 震动 |
| `Android.getDeviceId()` | 获取设备 ID |
| `Android.saveLoginCredentials(email, password)` | 保存登录凭据 |
| `Android.getSavedLoginPassword()` | 读取保存的密码 |
| `Android.isAutoLoginEnabled()` | 检查自动登录状态 |
| `Android.startFloatingTimer(taskName, elapsedTime, isPaused, appPackage)` | 启动悬浮窗计时器 |
| `Android.stopFloatingTimer()` | 停止悬浮窗计时器 |
| `Android.setWakeAlarm(timestamp, alarmId)` | 设置起床闹钟 |
| `Android.setNapAlarm(timestamp, alarmId)` | 设置小睡闹钟 |
| `Android.cancelWakeAlarm()` | 取消起床闹钟 |

### 桌面小组件

应用支持 8 种桌面小组件，分为时间余额和屏幕时间两类，每类 4 种样式：

| 类型 | 样式 | Provider 类名 | 布局文件 |
|------|------|--------------|----------|
| 时间余额 | 渐变 | `BalanceWidgetProvider` | `widget_balance.xml` |
| 时间余额 | 毛玻璃 | `BalanceWidgetGlassProvider` | `widget_balance_glass.xml` |
| 时间余额 | 系统透明 | `BalanceWidgetSystemProvider` | `widget_balance_system.xml` |
| 时间余额 | 高透明渐变 | `BalanceWidgetTransparentProvider` | `widget_balance_transparent.xml` |
| 屏幕时间 | 经典渐变 | `ScreenTimeWidgetProvider` | `widget_screen_time_classic.xml` |
| 屏幕时间 | 毛玻璃 | `ScreenTimeWidgetGlassProvider` | `widget_screen_time_glass.xml` |
| 屏幕时间 | 系统透明 | `ScreenTimeWidgetSystemProvider` | `widget_screen_time_system.xml` |
| 屏幕时间 | 高透明渐变 | `ScreenTimeWidgetTransparentProvider` | `widget_screen_time_transparent.xml` |

**配置信息**: `res/xml/widget_*_info.xml`

- 备份数据修复时，`dailyChanges` 的日期键在该仓库常见为 `ddd MMM dd yyyy`（如 `Wed Feb 11 2026`），不要擅自改成 `yyyy-MM-dd`。
- 删除交易后需同步重算：`transactions`（过滤条件）+ `currentBalance`（仅未撤回交易净和）+ `dailyChanges`（与交易净和一致）。
- 任务删除后为避免报表“未知”分类，需保留 `deletedTaskCategoryMap`（taskId -> category/taskName/taskType/deletedAt），并在交易分类回退链中纳入该映射。
- 若用 PowerShell 导出 JSON，可能引入 UTF-8 BOM + CRLF + 对齐缩进，物理体积会显著放大；需要小体积导入包时用 `JSON.stringify` 生成紧凑 JSON。

---

## 1.7 常见问题排查

### Q: 修改后页面没变化？
1. 清除 WebView 缓存 (Android 设置 → 应用 → 清除数据)
2. 检查三端是否已同步：运行 Hash 验证命令，确认 Android/根目录/iOS 完全一致
3. Service Worker 可能缓存了旧文件

### Q: 云端数据不同步？
1. 检查登录状态: 搜索 `isLoggedIn()`
2. 查看 Watch 监听: 搜索 `subscribeAll`
3. 确认 `_openid` 字段正确
4. 检查写入门禁是否激活（`cloudSyncWriteLock === true`），激活时 saveData 会被拦截

### Q: 多端同步后数据回退？
根因是陈旧端（长时间不活跃）重连后写入了旧数据。v7.28.0 的写入门禁机制应能防止此问题。  
若仍出现，在 App 内控制台检查：
```javascript
console.log('写入门禁:', cloudSyncWriteLock);
console.log('上次同步:', new Date(lastCloudSyncAt).toLocaleString());
```

### Q: 云函数调用报错 / fetchDelta 返回 null？
1. 确认 `timebankSync` 云函数已在 CloudBase 控制台部署
2. 确认 ZIP 包含 `node_modules`（`@cloudbase/node-sdk` 不是 Node.js 18 内置模块）
3. 控制台测试返回 `{"code":401}` = 部署成功（缺登录态）；报模块缺失 = node_modules 未打包

### Q: 任务排序不持久化？
- `saveData()` 不保存任务到云端
- 需要调用 `DAL.saveTask(task)` 同步每个修改的任务

### Q: replace_string_in_file 失败？
1. 使用 `read_file` 读取精确内容
2. 检查缩进和空格是否完全匹配
3. 尝试更短的唯一字符串



---

# 第二部分：版本更新日志（技术日志）

> **目标读者**：技术专家/开发者  
> **目的**：记录关键技术细节，便于技术审计、问题回溯、架构演进理解  
> **风格**：精简、技术导向、代码示例为主  
> 
> ⚠️ **强制规则**：每次更新涉及关键技术细节或重要改动时，必须将其添加到此部分。定期清理已过时的日志，保持内容精炼且具有长期价值。

---

## 📋 两类版本日志的区别

| 维度 | AGENTS.md 技术日志 | HTML 用户日志 |
|------|-------------------|---------------|
| **目标读者** | 技术专家、开发者 | 终端用户 |
| **内容重点** | 架构变更、数据层修改、接口协议、问题根因 | 功能特性、用户体验改进、Bug修复 |
| **写作风格** | 精简、代码示例、行号标注 | 易读、表情符号、用户价值导向 |
| **详细程度** | 关键技术点即可 | 可适度详细，展示工作成果 |
| **内部迭代** | ❌ 不包含（如间距调整、语法修复） | ✅ 可包含（展示细致工作） |

---

## 📝 技术日志记录规范

### 格式要求
- **精简文字**：避免冗长描述，用代码示例替代文字说明
- **标注修改**：代码块注明「修改前 → 修改后」便于回溯
- **关键位置**：标注文件名和大致行号
- **问题链**：复杂问题记录根因链（问题A → 导致B → 表现为C）
- **增量记录**：通过记忆和代码中搜索带有当前版本号的注释综合撰写
- **排除内部修复**：本更新周期内引入又被修复的错误不写入

### ✅ 记录内容（技术导向）
- **优先级门槛**：仅记录会影响长期维护、数据正确性、跨端行为一致性或线上稳定性的改动
- **架构/数据层**：同步机制、存储结构、跨设备一致性、权限/安全规则
- **接口/协议变更**：影响多端或云端数据兼容性的字段/格式变更
- **核心流程重构**：结算逻辑、初始化流程、数据修复工具
- **高风险 Bug 修复**：会导致数据丢失、核心功能不可用的问题

### ❌ 不记录内容
- 纯 UI/样式/间距/文字调整
- 常规显示格式/解析细节微调（除非引发数据错误或跨端不一致）
- 简单数值调整（如数量、间隔、阈值）
- 本周期内引入又修复的内部错误
- 缓存版本号/Service Worker 名称更新

---

## 📝 用户日志指导（HTML 文件中）

**位置**：`index.html` 约第 1301 行，`<details><summary>版本更新日志</summary>` 区域内

**撰写原则**：
- 面向用户，使用通俗易懂的语言
- 使用表情符号增加可读性（🏦 💰 📊 等）
- 突出用户价值："你能获得什么"
- 可包含内部优化（展示团队的细致工作）
- 按版本降序排列，最新版本在最上

**模板**：
```html
<div class="version-history-item">
    <p><strong>版本 vX.X.X (YYYY-MM-DD)</strong> 🏦 <b>大功能名称</b></p>
    <ul>
        <li><strong>[Feat]</strong> 🏦 <b>功能名</b>：用户能感知到的功能描述</li>
        <li><strong>[Fix]</strong> 🛡️ <b>修复项</b>：修复了什么问题，带来什么改善</li>
    </ul>
</div>
```

---

## v7.36.0 (2026-04-09) - 移除自动结算报告机制

**删除内容**：
- `js/app-reports.js`: 删除 `getAutoSettlementReport`, `showAutoSettlementReportModal`, `showAutoNotificationsModal` 等6个函数（~340行）
- `js/app-1.js`: 删除 `autoSettlementNotify` 设置项及启动检查逻辑
- `index.html`: 删除铃铛按钮HTML及 `.btn-auto-notifications` CSS样式
- `css/main.css`: 删除 `.settlement-*` / `.notification-*` 相关样式（~150行）

**保留项**：
- ✅ 所有自动结算核心函数（`settleDailyInterest`, `autoSettleScreenTime`, `checkAbstinenceHabits`）
- ✅ 交易时间戳调整到23:59的逻辑
- ✅ `settledDates` 持久化与云端同步

---

## v7.28.0 (2026-03-29) - 陈旧端写入门禁 + 云函数增量同步

**核心问题**：长期不活跃端重连后将陈旧数据写入云端，覆盖其他设备的新数据

**关键改动**：
1. **写入门禁机制**：`activateCloudSyncWriteLock()` / `releaseCloudSyncWriteLock()`
   - 触发点：启动时lastCloudSyncAt超6h、长休眠恢复
   - 保护：门禁激活时 `saveData()` 直接return，不写云端
   
2. **云函数 timebankSync**：`cloudbase-functions/timebankSync/index.js`
   - `getDelta`: 增量查询（`_updateTime > lastSyncAt`）
   - `writeTransaction`: 幂等写入（已存在→只允许undone=true）
   
3. **DAL新增方法**：
   - `DAL.fetchDelta(lastSyncAt)`: 返回Array或null（云函数未部署时降级）
   - `DAL.writeTransactionSafe(tx)`: 先走云函数，失败降级直接写入

4. **reconcileCloudAfterWatch 增量优先**：
   - 距上次同步<30分钟 → fetchDelta() 增量
   - ≥30分钟 → loadAll() 全量兜底

---

## v7.26.1 (2026-03-28) - JS文件语义拆分

**背景**：`app-3.js` 原为19,235行单文件，AI编辑单次需消耗整个上下文窗口

**拆分方案**：
| 新文件 | 行数 | 功能域 |
|--------|------|-------|
| `js/app-reports.js` | 7,535 | addTransaction、报告系统、通知、权限 |
| `js/app-sleep.js` | 3,124 | 睡眠设置/状态/倒计时/结算/闹钟 |
| `js/app-systems.js` | 5,206 | 设备ID、屏幕时间、均衡模式、金融系统、自动检测 |
| `js/app-auth.js` | 3,370 | 认证登录、数据导入导出、saveData/loadData |

**加载顺序**（不可改变）：
```
app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

---

## v7.25.4 (2026-03-13) - 多端云同步机制全面增强

**核心问题**：旧同步机制完全依赖CloudBase Watch被动接收，断连后数据不同步

**关键改动**：
1. **主动同步机制**：每30秒检查Watch状态并执行补偿同步
   - `startActiveSync()`: 独立watchdog定时器（递归setTimeout，抗冻结）
   - `checkAndRebuildWatchers(true)`: 检测到断连立即重建
   
2. **数据差异检测**：每5分钟比对云端 `_updateTime` 与本地最大值
   - 若云端有新数据但本地未收到 → 触发补偿同步
   
3. **手动同步按钮**：`manualSync()` 强制重建Watch + 补偿同步

4. **网页端登录恢复增强**：等待时间12s→8s + 重试3次

---

## v7.19.0 (2026-02-21) - 睡眠闹钟可靠性增强

**关键改动**：
1. **系统时钟闹钟同步桥接**：
   - `WebAppInterface.syncSystemAlarm(triggerAtMillis, label)`
   - 入睡倒计时完成后自动同步到系统闹钟（可关闭）
   
2. **闹钟强提醒默认最大化**：
   - `AlarmReceiver` 统一走强提醒通道（PRIORITY_MAX + CATEGORY_ALARM）
   - 支持bypass DND，确保锁屏提醒强度

3. **三开关闹钟模型**：
   - 开启闹钟（持久化）
   - 本次不想闹钟（会话级）
   - 默认同步系统闹钟（持久化）

---

## v7.18.3 (2026-02-13) - 悬浮窗暂停/恢复同步修复

**问题**：悬浮窗点击暂停只影响Android Service，无法通知前端JavaScript

**修复方案**：
1. **广播通信**：
   - `FloatingTimerService.notifyWebView(action, taskName, elapsedTime)`
   - `MainActivity.floatingTimerReceiver` 接收广播并调用 `evaluateJavascript`
   - `window.__onFloatingTimerAction(action, taskName, elapsedTime)` 全局回调

2. **强同步机制**：
   - 前端pauseTask/resumeTask先操作悬浮窗，再查询同步状态
   - 若有悬浮窗时间，完全以其为准（elapsedTime = serviceTime）
   - 查询延迟50ms，确保悬浮窗已更新状态

---

## v7.16.0 (2026-02-10) - 统一睡眠模式（智能检测）

**核心改动**：
1. **睡眠模式合并**：移除午睡/夜间切换，统一为"开始睡眠"按钮
   - `detectSleepType(startTime, wakeTime)`: 智能判断夜间/小睡
     * 入睡时间20:00~06:00 → 夜间
     * 或睡眠时长≥240分钟 → 夜间
     * 其他 → 小睡

2. **新增 sleepData.sleepType 字段**：
   - 新事务统一使用sleepData，内含sleepType: 'night'|'nap'
   - 旧napData记录在DAL.loadAll加载时自动归一化

3. **结算确认弹窗**：
   - 结束睡眠 → 弹出确认弹窗（显示检测结果，可切换类型）
   - 夜间: calculateSleepReward() 完整奖惩
   - 小睡: 达标判定（≥napDurationMinutes → 固定奖励）

---

## v7.15.2 (2026-02-09) - 金融系统稳定性修复

**核心问题**：`settleDailyInterest()` 结算后未调用 `saveFinanceSettings()`，导致settledDates仅存内存，重启后重复结算同一天

**关键修复**：
1. **settledDates持久化**：在 `settleDailyInterest()` 保存段首行添加 `saveFinanceSettings()`

2. **金融系统全量云端统一同步**：
   - `applyFinanceDataFromCloud(doc)`: 同时处理financeSettings + interestLedger
   - settledDates: 取本地与云端并集 + 60天裁剪
   - Profile watch handler: 监听financeSettings + interestLedger变更

3. **recalculateInterestOnUndo重写**：
   - 正向累积法：过滤利息交易，按日期分组累加各日余额
   - 对受影响日期重算利息，与实际利息交易对比生成差额调整

4. **导入速度优化**：
   - `clearAllData()`: 自定义规则表改用where().remove()批量删除
   - 交易导入BATCH_SIZE从50提升到100

---

## v7.11.2 (2026-02-02) - 设置重启后丢失问题（三层问题修复）

**问题链**：
```
问题1: WebView localStorage不可靠
    ↓ 修复后发现
问题2: initApp()中updateNotificationSettingsUI()崩溃，阻断后续init函数
    ↓ 修复后发现  
问题3: 分类标签存储位置分离，initScreenTimeSettings未从profile.screenTimeCategories恢复
```

**关键修复**：
1. **Android原生存储**：
   - `WebAppInterface.saveScreenTimeSettingsNative(json)` / `getScreenTimeSettingsNative()`
   - 同理: saveSleepSettingsNative, getSleepSettingsNative

2. **防止initApp中断**：
   ```javascript
   try { updateNotificationSettingsUI(); } catch (e) { console.error(e); }
   try { initScreenTimeSettings(); } catch (e) { console.error(e); }
   try { initSleepSettings(); } catch (e) { console.error(e); }
   ```

3. **分类标签从云端恢复**：
   - `initScreenTimeSettings()` 中添加从 `DAL.profileData.screenTimeCategories` 恢复逻辑

---

## v7.9.4 (2026-01-26) - 自动重新登录功能

**关键改动**：
1. **CloudBase SDK持久化配置**：
   ```javascript
   app = sdk.init({ env: TCB_ENV_ID, region: 'ap-shanghai', persistence: 'local' });
   ```

2. **Android端凭据存储**：
   - `saveLoginCredentials(email, password)`: 保存邮箱和Base64编码的密码
   - `getSavedLoginPassword()`: 读取解码后的密码
   - `isAutoLoginEnabled()`: 检查是否启用自动登录

3. **自动重新登录逻辑**：
   - `tryAutoReLogin()`: 从SharedPreferences获取凭据并执行登录
   - 登录成功后加载云端数据

---

## v6.6.0 - 多表架构迁移

**核心改动**：从单一JSON迁移到5张独立表
- `tb_profile`: 用户资料
- `tb_task`: 任务列表
- `tb_transaction`: 交易记录
- `tb_running`: 运行中任务
- `tb_daily`: 每日统计

**DAL设计**：统一数据访问层，封装CloudBase CRUD操作

---

*最后更新: 2026-04-09 (v7.36.0)*

