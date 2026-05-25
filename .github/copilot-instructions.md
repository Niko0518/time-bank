# Time Bank - AI 编程指南

> ⚠️ **强制规则**：每次更新请阅读本指令，在更新后，凡是涉及关键技术细节或重要改动时，必须将其添加到本文件的「第二部分：版本更新日志」中。我们的交流语言是中文。当用户提出給我一个"方案"时，若无特殊要求，意思是先不实施，等和用户一起商讨，得到用户确认后实施。
> ⚠️ **日志更新规则（新增）**：
> - **用户日志（HTML 中的版本更新日志）**：仅在用户明确下达"更新用户日志/撰写用户日志"指令时才修改。
> - **术语约定（新增）**：用户后续提到"撰写日志"，默认指 **用户日志（HTML 中的版本更新日志）**。
> - **技术日志（本文件第二部分）**：由 AI 按需更新，仅在存在关键技术细节或重要改动时记录。
> - **技术日志频率控制（新增）**：默认降频记录，仅对"重要且影响深远"的改动写入技术日志（如架构、数据一致性、跨端兼容、核心流程）。
> - **文字修改沟通规则（新增）**：凡涉及文案/文字内容修改，AI 必须在执行前说明将修改哪些文案（版本更新日志不使用此条），执行后说明实际修改了哪些文案。
> 
> ## 🚨 AI 行为约束（最高优先级）
> 
> **版本号修改禁令**：
> - ❌ **绝对禁止**擅自修改任何位置的版本号（包括 `APP_VERSION`、`index.html`、`sw.js` 等）
> - ✅ **必须等待**用户明确说出"更新版本号为 vX.Y.Z"或类似指令
> - ✅ 在需要修改版本号时，**必须先询问**："请问本次更新的版本号是多少？"
> 
> **双端同步规则强化**：
> - ❌ **禁止**在日常开发中自动执行同步
> - ✅ **仅在**收到"推送"指令时，才按以下顺序执行：
>   1. Android → 根目录（单向同步）
>   2. Hash 验证一致性
>   3. 检查版本号（若用户提供则更新）
>   4. 检查日志是否已撰写
>   5. 执行 git push
> 
> **工作开始前必做**：
> 1. 复述用户需求
> 2. 确认是否涉及版本号修改（若是，立即询问）
> 3. 确认是否需要三端同步（通常不需要，除非用户说"推送"）
> 4. 列出将要修改的文件清单

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
| `js/app-reports.js` | 数据处理基础 + 报告系统（流图/饼图/趋势/热图/表格）+ 工具函数 + 权限/卡片 + AI伙伴UI | ~8,200 行 |
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


```

### ⚠️ "推送"指令完整工作流

当用户发出"推送"指令时，AI 必须按以下顺序执行完整工作流：

1. **双端同步** — 执行上述同步命令，确保 Android/根目录完全一致
2. **验证一致性** — 运行 Hash 验证：
   ```powershell
   Get-FileHash "index.html","android_project/app/src/main/assets/www/index.html" | Format-Table Path, Hash
   ```
   两端 Hash 必须完全一致
3. **检查版本号** — 确认 7 个位置的版本号已更新（若用户指定了新版本号）：
   - `index.html` `<title>` 标签
   - `index.html` class="version-subtitle">
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

### 云函数

| 云函数名 | 运行时 | 用途 | 超时 |
|---------|--------|------|------|
| `timebankSync` | Node.js 18.15 | 增量查询 + 幂等写入 | 30s |
| `timebankAI` | Node.js 18.15 | AI 洞察报告 + 对话（DeepSeek/Gemini 等） | 60s |

**`timebankSync` 两个 action**：
- `getDelta`: 增量拉取（`_updateTime > lastSyncAt`），返回 `Array` 或抛异常
- `writeTransaction`: 幂等写入（已存在→只允许 undone=true；不存在→插入；其他→跳过）

**`timebankAI` 两个 action**：
- `generateInsight`: 生成 AI 洞察报告（耗时较长，需配合 HTTP 访问服务）
- `getStatus`: 扫描已配置 Key 的 AI 提供商，返回可用模型列表

**部署配置**：`cloudbaserc.json`（项目根目录）
```json
{
  "envId": "cloud1-8gvjsmyd7860b4a3",
  "functionRoot": "cloudbase-functions",
  "functions": [
    {
      "name": "timebankSync",
      "runtime": "Nodejs18.15",
      "handler": "index.main",
      "timeout": 30,
      "installDependency": true
    },
    {
      "name": "timebankAI",
      "runtime": "Nodejs18.15",
      "handler": "index.main",
      "timeout": 60,
      "installDependency": true
    }
  ]
}
```

**CLI 自动部署（推荐）**：
```powershell
# 前提：已安装 CloudBase CLI 并已登录（tcb login）
# 查看已安装版本
where tcb
tcb --version   # 当前环境：3.2.2

# 部署单个云函数（--force 自动覆盖，无需交互确认）
tcb fn deploy timebankAI --force
tcb fn deploy timebankSync --force

# 批量部署所有云函数
tcb fn deploy --all --force
```

> ⚠️ **注意**：`@cloudbase/node-sdk` 在 Node.js 18 中**不是内置模块**，首次部署前必须进入各云函数目录执行 `npm install`，确保 `node_modules` 被打包上传。

**客户端调用**（`js/app-1.js` DAL 对象内）：
- `DAL.fetchDelta(lastSyncAt)` → 返回 `Array`（成功）或 `null`（云函数未部署，调用方降级全量）
- `DAL.writeTransactionSafe(tx)` → 返回 `{code,action,id}` 或 `null`（降级直接写入）

### 关键代码位置
| 功能 | 搜索关键词 |
|------|-----------|
| DAL 对象 | `const DAL =` |
| SDK 初始化 | `initCloudBase` |
| Watch 实时监听 | `subscribeAll` |

---

## 1.4 构建与测试

### Android 构建命令

```bash
# 清理并构建 Release APK
cd android_project
./gradlew clean assembleRelease

# 构建 Debug APK
./gradlew assembleDebug

# 安装到连接的设备
./gradlew installDebug

# 查看依赖树
./gradlew app:dependencies
```

### 输出路径
- **Release APK**: `android_project/app/build/outputs/apk/release/app-release.apk`
- **Debug APK**: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### 前端调试
- **Chrome DevTools**: 通过 Chrome 远程调试 WebView (`chrome://inspect`)
- **日志查看**: 使用 `adb logcat` 查看 Android 日志
- **Console 日志**: 前端 console.log 会输出到 Chrome DevTools

### 云函数本地测试
```powershell
# 进入云函数目录
cd cloudbase-functions/timebankSync

# 安装依赖
npm install

# 本地测试（需自行编写测试脚本）
node test.js
```

---

## 1.5 常见陷阱与注意事项

### 数据一致性风险
- **事务操作**: 任何涉及余额变动的操作必须使用事务（`db.runTransaction`）
- **并发冲突**: 多设备同时操作同一任务可能导致数据不一致，使用云函数锁机制（`timebankTaskLock`）
- **时区问题**: 所有时间戳统一使用 UTC，显示时转换为本地时间

### 性能优化要点
- **避免频繁 DOM 操作**: 批量更新 DOM，使用 DocumentFragment
- **图片懒加载**: 大图使用 IntersectionObserver 实现懒加载
- **防抖节流**: 搜索输入、滚动事件等高频触发场景必须防抖/节流

### 兼容性注意
- **Android API 级别**: minSdk 24，不支持 ES2020+ 新特性，需 Babel 转译
- **WebView 兼容性**: 注意不同Android版本的WebView行为差异

### 已知问题区域
- **睡眠时区计算**: v7.13.1 修复过严重 Bug，相关代码需谨慎修改
- **配额模式计算**: 开启自动检测补录和配额模式的计时消费任务曾出现配额计算错误
- **数组排序稳定性**: 多处依赖数组顺序，修改排序逻辑时需全面回归测试

---

## 1.6 文档索引

现有详细文档位于 `.trae/documents/` 目录：

| 文档 | 内容概要 |
|------|---------|
| [TimeBank 项目了解.md](../.trae/documents/TimeBank%20项目了解.md) | 完整的项目分析、架构设计、功能详解 |
| [数据存储与同步机制分析报告.md](../.trae/documents/数据存储与同步机制分析报告.md) | 数据模型、同步策略、云函数设计 |

**原则**: 优先链接已有文档，不在本文件中重复详细内容。

---

# 第二部分：版本更新日志

> 本部分记录关键技术决策、架构变更、数据层修改等重要改动。**仅在存在重要且影响深远的改动时更新**。

## v8.2.15（跨设备同步 running 状态冲突修复）

### 问题描述

当 Android 端完成任务并记录交易后，Web 端可能因 Watch 连接断连重建、`DAL.loadAll()` 盲目信任云端或 `DAL.updateRunningTask` 静默失败，导致 Web 端的 stale running 状态重新写入 `tb_running`，覆盖 Android 端的完成状态，最终造成交易数据丢失。

### 根因分析

共排查出 5 个独立根因，均围绕"现有保护机制仅限本设备范围，缺少跨设备乐观锁"这一核心缺陷：

1. **`DAL.startTask` 无 UPDATE→ADD 回退**：当 Android 删除 tb_running 文档后，Web 端的 `runningCache` 仍缓存旧 docId，执行 UPDATE 静默失败但本地 `runningTasks` 已设置，导致 CloudBase 与本地不一致
2. **`DAL.updateRunningTask` 无文档存在性守卫**：浮窗定时器、暂停/恢复操作写入已被删除的文档时静默失败，本地状态残留
3. **Watch 重建后 `DAL.loadAll()` 无条件覆盖 `runningTasks`**：`isInSaveProtection` 仅检查本机时间戳，跨设备场景无效
4. **`applyDataState` 默认分支盲目信任云端**：非保护期/非近期活跃时 `runningTasks = cloudRunning` 直接覆盖
5. **`tb_running` 缺少 `lastUpdatedAt` 时间戳**：无跨设备冲突解决判断依据

### 修复方案

共实施 6 项修复，核心策略为**跨设备 `clientId` 感知合并**：

| # | 修复项 | 文件 | 关键逻辑 |
|---|--------|------|----------|
| 1 | `DAL.startTask` UPDATE→ADD 回退 | `app-1.js` | UPDATE 失败时清 `runningCache`，回退到 ADD 新建文档 |
| 2 | `DAL.updateRunningTask` 文档存在性守卫 | `app-1.js` | 检测 `not found` 错误时清理 `runningCache` 和 `runningTasks` |
| 3 | `tb_running` 增加 `lastUpdatedAt` | `app-1.js` | 所有写入/更新附带 `lastUpdatedAt: Date.now()` |
| 4 | `DAL.loadAll` 跨设备合并策略 | `app-1.js` | `clientId` 不匹配时本机有则保留本机，本机无则接受云端 |
| 5 | `applyDataState` 跨设备保护 | `app-auth.js` | 默认分支改为 `clientId` 感知合并，保护本机运行态 |
| 6 | Watch remove 同步清理 `runningCache` | `app-1.js` | 远程删除时同步清 `runningCache`，防后续操作引用已删除文档 |

### 合并规则统一

所有 `clientId` 感知合并点遵循相同规则：
- 云端记录 `clientId === 本机` → 信任云端（本机回声）
- 云端记录 `clientId !== 本机` 且本地有同 taskId → **保留本地**（跨设备冲突）
- 云端记录 `clientId !== 本机` 且本地无 → 接受云端（他机新开）
- 本地有但云端无 → 保留本地（本机独有）

### 数据层影响

- `tb_running` 文档新增 `lastUpdatedAt` 字段（向前兼容，旧文档无此字段按 `0` 处理）
- 不涉及数据迁移，无需修改数据库安全规则
- 多设备同步后，各设备本地 `runningTasks` 不再被盲目覆盖

---

## v8.2.14（利息计算交叉校验 + 历史修复功能）

### 改动 1：`settleDailyInterest` 增加余额交叉校验机制

**问题描述**：`settleDailyInterest` 无条件信任 `interestLedger[yesterdayStr].endingBalance` 缓存值。一旦该缓存值因多设备竞态、数据加载不完整等原因出错，错误会通过云端同步扩散到所有设备，且后续所有利息结算都会基于错误的基数。

**根因分析**：
- `interestLedger` 中的 `endingBalance` 在首次结算时计算并缓存
- 缓存值通过 `saveInterestLedger()` → `DAL.saveProfile()` 同步到云端 `tb_profile`
- `applyFinanceDataFromCloud()` 会将云端缓存覆盖本地值
- 多设备场景下，任一设备在数据不完整时结算，错误即传播全局
- 代码虽有"兜底"逻辑（无缓存时从交易累加），但只要缓存存在就优先使用

**修复方案**：
- 引入 `calculateEndingBalanceFromTransactions(cutoffDateStr)` 辅助函数，统一封装从交易累加计算余额的逻辑
- 当 `interestLedger` 中有缓存时，**同时**实时从交易重新计算余额
- 若 `|cached - calculated| > 1` 秒，发出 `console.warn`，使用计算值，并**修正账本缓存**
- 日志增加 `balanceSource` 标记（`ledger` 或 `recalculated`），便于调试追踪

**修改文件**：
- `js/app-systems.js`：`settleDailyInterest` 函数

### 改动 2：新增 `recalculateAllInterest()` 历史修复功能

**问题描述**：用户发现从 2026-03-09 起的利息交易 `baseBalance` 与实际日终余额严重不符。例如 2026-05-18 实际日终余额为 +7,260 秒（应得存款利息），但 `baseBalance` 为 -8,005 秒（错误扣除了贷款利息）。

**影响评估**：
- 经精确复利模拟，旧系统累计多扣约 9,178 秒（约 2.55 小时）
- 错误从 3 月 9 日持续至 5 月 20 日，涉及约 70 天的利息交易

**修复方案**：
- 新增 `recalculateAllInterest()` 函数，通过设置页按钮触发
- 流程：
  1. 标记所有 `systemType === 'interest'` 交易为 `undone`
  2. 清空 `interestLedger` 和 `financeSettings.settledDates`
  3. 重新计算 `currentBalance`（不含利息）
  4. 从 `financeSettings.firstEnabledAt` 至今逐日调用 `settleDailyInterest(d)`
  5. 保存数据并更新 UI
- 函数内置确认弹窗，提示预计余额变动（+2.55 小时）

**修改文件**：
- `js/app-systems.js`：新增 `recalculateAllInterest` 函数
- `index.html`：金融系统设置区新增"重新计算历史利息"按钮

### 数据层影响

- `tb_transaction`：旧利息交易被标记 `undone`，新增正确利息交易
- `tb_profile.interestLedger`：清空后重建
- `tb_profile.financeSettings.settledDates`：清空后重建
- 多设备同步后，所有设备继承修正后的数据

---

## v8.2.13（统一使用东八区时区）

### 改动 1：前端 `getLocalDateString` 函数使用显式东八区

**问题描述**：`getLocalDateString` 函数使用 `d.getFullYear()`、`d.getMonth()`、`d.getDate()` 等本地时区方法，导致日期归类与预期不符。例如，UTC 时间 `2026-05-17T18:38:29Z`（北京时间 5月18日 02:38）会被归类为 5月17日，而不是正确的 5月18日。

**根因分析**：
- 交易时间戳存储为 UTC 时间
- `getLocalDateString` 使用本地时区方法转换为日期字符串
- 在东八区环境下，UTC 时间 18:00 之后会被归类为次日
- 这与技术日志 8.2.11 描述的修复（显式东八区）不符，实际代码并未实施

**修复方案**：
- 使用 `Intl.DateTimeFormat` 显式指定 `timeZone: 'Asia/Shanghai'`
- 通过 `formatToParts` 方法提取年、月、日
- 确保无论设备时区如何，都使用东八区进行日期格式化

**修改文件**：
- `js/app-reports.js`：`getLocalDateString` 函数

### 改动 2：Android `getAppScreenTimeForDate` 方法使用显式东八区

**问题描述**：Android 端的 `getAppScreenTimeForDate` 方法使用 `Calendar.getInstance()`，这是设备本地时区。如果设备时区不是东八区，查询的日期范围会与前端传递的日期不一致。

**根因分析**：
- 前端传递的 `dateStr` 是东八区日期（如 `"2026-05-17"`）
- Android 使用本地时区解析该日期
- 如果设备在其他时区，查询的时间范围会偏移

**修复方案**：
- 使用 `TimeZone.getTimeZone("Asia/Shanghai")` 创建 Calendar 实例
- 确保查询的时间范围是东八区的 00:00 到 23:59
- 与前端日期处理保持一致

**修改文件**：
- `android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java`：`getAppScreenTimeForDate` 方法

### 历史数据兼容性

- 交易时间戳继续使用 UTC 存储，不改变
- 日期归类逻辑改变，但历史交易的 `originalDate` 字段保持不变
- 自动补录的 `originalDate` 已经是东八区日期字符串，不受影响

---

## v8.2.12（自动检测补录日期匹配修复 + 描述解析增强）

### 改动 1：自动检测补录日期匹配修复

**问题描述**：`hasAutoDetectTransactionForDate` 和 `getTaskRecordedTimeForDateIncludeAuto` 函数使用 `t.timestamp` 而非 `t.autoDetectData.originalDate` 进行日期匹配，可能导致时区偏移问题，造成重复补录或漏补录。

**根因分析**：
- 自动补录交易的 `timestamp` 是晚上 23:00（结算时间），而 `originalDate` 才是实际的补录日期
- 如果用户设备时区与预期不一致，`timestamp` 的日期部分可能与 `originalDate` 产生 ±1 天偏差
- `hasAutoDetectTransactionForDate` 使用 `getLocalDateString(new Date(t.timestamp))` 判断是否已存在补录交易，可能导致误判
- `getTaskRecordedTimeForDateIncludeAuto` 同样使用 `timestamp` 进行日期匹配，影响已记录时长计算

**修复方案**：
- `hasAutoDetectTransactionForDate`：优先使用 `t.autoDetectData?.originalDate`，回退到 `timestamp`
- `getTaskRecordedTimeForDateIncludeAuto`：同样优先使用 `originalDate` 进行日期匹配
- 确保日期匹配使用原始补录日期，而非结算时间戳

**修改文件**：
- `js/app-systems.js`：`hasAutoDetectTransactionForDate` 和 `getTaskRecordedTimeForDateIncludeAuto` 函数

### 改动 2：描述解析增强

**问题描述**：`parseTimeFromDescription` 函数无法解析自动补录交易的描述格式 `(漏记30分钟, ×1.2惩罚)`，导致解析失败返回 `null`，必须依赖回退函数。

**修复方案**：
- `parseTimeFromDescription` 新增支持自动补录描述格式 `(漏记30分钟, ×1.2惩罚)` 和 `(多记15分钟, ×1.2惩罚)`
- 通过正则 `/\((?:漏记|多记)(\d+)分钟/` 提取分钟数

**修改文件**：
- `js/app-systems.js`：`parseTimeFromDescription` 函数

---

## v8.2.11（屏幕时间手动记录 + 自动检测补录时区一致性修复）

### 改动 1：屏幕时间手动记录（防重复覆盖机制）

**背景**：用户需要补录历史日期的屏幕使用时间，且手动记录应优先于自动记录，避免同一日期产生重复交易。

**修改内容**：
- `index.html`：在屏幕时间管理设置项中新增「手动记录」UI（日期选择器 + 分钟输入 + 记录按钮）
- `app-systems.js`：新增 `addManualScreenTimeRecord()` 函数，核心逻辑：
  1. 校验日期为过去日期（禁止今天及未来）
  2. 扫描 `transactions` 中所有 `systemType === 'screen-time'` 且 `screenTimeData.originalDate === dateStr` 的记录，回滚余额和 `dailyChanges` 后删除
  3. 从所有设备的 `screenTimeSettings.settledDates` 中移除该日期，允许后续自动结算重新处理
  4. 从本地 `screenTimeHistory` 中过滤掉该日期记录
  5. 按现有屏幕时间结算逻辑重新计算差额、均衡模式、分类，创建新交易并标记 `isManualScreenTime: true`
  6. 将日期加入当前设备的 `settledDates`，防止自动结算重复创建

**防重复设计**：
- 手动记录前主动删除该日期所有已有屏幕时间交易（跨设备）
- 删除后重新加入 `settledDates`，使自动结算的 `hasScreenTimeRecordForDate` 和 `deviceSettledDates` 双重检查都能通过
- 交易描述前缀为 `📱 屏幕时间(手动)`，便于区分

### 改动 2：自动检测补录时区一致性修复

**问题描述**：清除缓存后重新对最近7天进行自动检测补录时，`autoDetectAppUsage` 中生成的日期字符串与交易记录使用的 `getLocalDateString` 可能因时区偏移产生不一致，导致补录日期与实际交易日期错位。

**根因分析**：
- `autoDetectAppUsage` 原使用 `new Date(dateStr)` 构造日期对象，再与 `getLocalDateString(new Date())` 比较
- `getLocalDateString` 使用 `toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })` 显式指定东八区
- 若用户设备时区非东八区，`new Date(dateStr)` 会按本地时区解析，与 `getLocalDateString` 的显式东八区输出可能产生 ±1 天的偏差

**修复方案**：
- `autoDetectAppUsage` 中统一使用 `getLocalDateString(new Date())` 获取当前日期基准，确保与交易记录使用同一时区函数
- 所有日期比较和 `dateStr` 生成都基于 `getLocalDateString` 的输出，消除时区不一致风险

**修改文件**：
- `js/app-systems.js`：`autoDetectAppUsage` 日期获取逻辑
- `index.html`：屏幕时间管理设置项新增手动记录 UI
- `js/app-systems.js`：新增 `addManualScreenTimeRecord()` 函数

---

## v8.2.10（负余额惩罚强制启用 + 金融设置云端同步修复）

### 改动 1：负余额 1.2 倍惩罚强制启用

**背景**：v7.25.0-fix2 引入金融系统后，允许用户关闭负余额 1.2 倍惩罚。现决定该惩罚始终启用，不可关闭。

**修改内容**：
- `shouldApplyNegativeBalancePenalty()`：移除对 `financeSettings.negativeBalancePenaltyEnabled` 的判断，负余额时始终返回 `true`
- 从 `financeSettings` 默认值中移除 `negativeBalancePenaltyEnabled` 字段
- 删除 `index.html` 中的惩罚开关 UI
- 删除 `toggleFinanceNegativePenalty()` 函数
- 删除 `updateFinanceSystemUI()` 中的惩罚开关更新逻辑

### 改动 2：金融设置云端同步修复（关键数据一致性修复）

**问题描述**：利率设置等金融系统配置在软件重装后丢失，即使用户重新登录也无法恢复。

**根因分析**（三个问题叠加）：

1. **云端保存语法错误**：`saveFinanceSettings()` 使用 `DAL.saveProfile({ financeSettings: _.set(settings) })`，但 `DAL.saveProfile` 未将 `financeSettings` 识别为需要 `_.set()` 处理的嵌套对象，导致保存失败
2. **内存更新逻辑错误**：`DAL.saveProfile` 中对普通 key 的内存更新直接赋值 `this.profileData[key] = value`，但 `value` 可能是 `_.set()` 命令对象（`{ "$set": actualValue }`），导致内存中的 `profileData` 保存的是命令对象而非实际值
3. **字段合并不完善**：`applyFinanceDataFromCloud` 和 `initFinanceSystem` 使用简单展开运算符 `{ ...a, ...b }`，`undefined` 值会覆盖有效默认值

**修复方案**：
- `DAL.saveProfile`：添加对 `financeSettings` 和 `interestLedger` 的 `_.set()` 自动包装
- `DAL.saveProfile`：统一提取 `actualValue` 后再更新内存中的 `profileData`
- `applyFinanceDataFromCloud` / `initFinanceSystem`：显式检查每个字段是否为 `undefined`，避免默认值被覆盖
- `saveFinanceSettings` / `saveInterestLedger`：直接传递普通对象，由 `DAL.saveProfile` 统一处理 `_.set()`

**修改文件**：
- `js/app-systems.js`：`initFinanceSystem`, `applyFinanceDataFromCloud`, `saveFinanceSettings`, `saveInterestLedger`, `toggleFinanceSystem`
- `js/app-1.js`：`DAL.saveProfile`
- `index.html`：删除惩罚开关 UI

---

## v8.2.4（修复任务完成/结束/兑换后余额瞬间双倍计算）

### 问题描述
任何类型的任务点击完成/兑换/结束后，时间余额瞬间会被双倍计算，一段时间后或刷新/重新进入应用，余额恢复正常。

### 根因分析
`addTransaction()`（`app-reports.js`）内部已实现 `currentBalance` 的增量更新（`+= amt` / `-= amt`）。但以下四个调用方在调用 `addTransaction()` 之前或之后，又手动修改了一次余额：

1. `processNormalCompletion`（`app-2.js`）：手动 `currentBalance += adjustedTime;`，然后 `addTransaction` 又加一次
2. `processHabitCompletion`（`app-2.js`）：`addTransaction` 先加，然后手动 `currentBalance += adjustedReward;` 又加一次
3. `redeemTask`（`app-2.js`）：手动 `currentBalance -= finalCost;`，然后 `addTransaction` 又减一次
4. `stopTask`（`redeem` 分支，`app-2.js`）：手动 `currentBalance -= finalCost;`，然后 `addTransaction` 又减一次

同时，`updateDailyChanges()` 在上述路径中也被重复调用（`addTransaction` 内已调用），导致 `dailyChanges` 同样被双倍累加。

### 为什么刷新后恢复正常
`applyDataState()`（本地加载）和 `DAL.loadAll()`（云端加载）都强制从 `transactions` 数组重新计算余额，而非信任缓存的 `currentBalance`。由于交易数组中只有一笔记录，重新计算后余额自然正确。但 `dailyChanges` 无此重算保护，长期离线使用会累积偏差。

### 历史修复遗漏
v7.39.6 曾修复 `processHabitCompletion` 中**习惯奖励 bonus** 的双重累加，但未修复**基础奖励** `adjustedReward` 的双重累加。`processNormalCompletion` 和 `redeemTask` 中的双重累加问题一直存在。

### 修复方案
移除四个调用方中手动修改 `currentBalance` 和手动调用 `updateDailyChanges` 的冗余代码，统一由 `addTransaction` 负责余额和每日统计的增量更新。

### 修改文件
- `js/app-2.js`：
  - `processNormalCompletion`：删除 `currentBalance += adjustedTime;` 和 `updateDailyChanges('earned', adjustedTime, referenceDate);`
  - `processHabitCompletion`：删除 `currentBalance += adjustedReward;` 和 `updateDailyChanges('earned', adjustedReward, referenceDate);`
  - `redeemTask`：删除 `currentBalance -= finalCost;` 和 `updateDailyChanges('spent', finalCost);`
  - `stopTask`（`redeem` 分支）：删除 `currentBalance -= finalCost;`

### 验证建议
- 完成一个普通 earn 任务，检查余额是否只增加一次
- 完成一个习惯任务，检查基础奖励和习惯奖励是否均只增加一次
- 兑换一个 spend 任务，检查余额是否只减少一次
- 启动计时 redeem 任务并结束，检查余额是否只减少一次
- 完成后刷新页面，确认余额与刷新前一致

---

## v7.39.0

### Habit System 3.0：习惯系统重构

- **问题描述**：`rebuildHabitStreak`在遇到未达标周期时只`break`保持旧streak，无法从断点恢复；跨设备使用导致Watch远程交易不触发streak重算，设备间streak出现永久分歧；`hasMissedHabitDayInCurrentPeriod`依赖`isStreakAdvancement`标记导致补录/补发奖励逻辑混乱；习惯设置变更后未触发streak重算。

- **核心原则**：
  - 连胜 = 交易历史中连续达标的周期数（完全推导，不保留中间状态）
  - 奖励 = 基于当前streak里程碑（只对新增里程碑发放，不追溯）
  - 所有操作（正常完成/补录/撤回/远程）触发同等的streak重算
  - 设置变更后触发streak重算，保留streak值（按新标准重新计算）

- **rebuildHabitStreak修复**：
  - 未达标周期 → `streak = 0` + `lastCompletionDateStr = null` + `continue`（而非break）
  - 找到下一达标周期 → `streak = 1` 重新开始
  - `isBroken` 由 streak 直接推导：`streak > 0` → `false`，`streak === 0` → `true`

- **isStreakAdvancement移除**：补录和正常记录在连胜方面等效，只要周期达标就计入streak。

- **Watch远程触发**：Transaction watch的add/update/remove三分支均增加`rebuildHabitStreak`调用，确保跨设备streak一致性。

- **设置变更处理**：习惯的`period`或`targetCountInPeriod`变更后，自动触发`rebuildHabitStreak`按新标准重算。

- **健康检查增强**：`checkSingleHabitConsistency`增加`computeHabitStreakFromTransactions`纯计算函数，对比存储值与推导值，覆盖更多不一致场景。

- **修改范围**：
  - `js/app-2.js`：rebuildHabitStreak重写、hasHabitValidCompletionOnDate修复、getHabitPeriodInfo修复、processHabitCompletion简化、saveTask设置变更处理
  - `js/app-1.js`：Watch handler三分支增加habit rebuild、checkSingleHabitConsistency增强、computeHabitStreakFromTransactions新增

- **验证建议**：
  - 断签后补录，观察streak从断点恢复
  - 多设备场景，观察streak是否一致
  - 变更习惯设置后，检查streak是否按新标准重算

---

## v8.2.9（补录弹窗关闭修复：saveBackdate/submitManualSleep try/finally 保护）

### 问题描述
点击"确认补录"后，补录逻辑执行成功（交易已添加、余额已变更），但弹窗不关闭：
1. `saveBackdate`（任务补录）：循环中的 `addTransaction`、`rebuildHabitStreak`、`triggerHabitRewardCheck` 等代码抛出异常时，async 函数立即 reject，末尾的 `try/finally` 不会执行
2. `submitManualSleep`（睡眠手动补录）：完全没有异常保护，`await saveData()` 失败后 `closeManualSleepModal()` 不会执行

### 根因分析
- `saveBackdate` 的 `try/finally` 只包裹了 `saveData()`，但循环处理逻辑（含 habit 连胜重建、奖励检测）未被保护
- `submitManualSleep` 中 `closeManualSleepModal()` 在 `await saveData()` 之后同步调用，无 `try/catch/finally`
- `addTransaction` 已成功（本地数组已更新），用户看到"补录成功"的结果，但弹窗保持打开

### 修改方案
1. **`saveBackdate`**：将 `try/finally` 上移到包裹整个处理逻辑（循环 + `saveData`），`finally` 中始终调用 `hideBackdateModal()`
2. **`submitManualSleep`**：新增 `try/catch/finally` 包裹 `saveData()`，`finally` 中统一执行 `updateAllUI()`、`updateSleepCard()`、`closeManualSleepModal()`

### 测试要点
- 任务补录成功：确认弹窗关闭、通知显示
- 任务补录触发每日上限：确认弹窗关闭、错误提示已显示
- 睡眠手动补录成功：确认弹窗关闭
- 弱网/断网环境下补录：确认弹窗关闭、数据已本地保存

---

## v8.2.8（大数据量启动加速：本地缓存秒开 + 后台增量同步）

### 问题描述
大数据量用户（数千~数万条交易记录）首次启动时需要等待 5~15 秒的阻塞式全量云端加载：
1. `DAL.loadAll()` 串行分页加载交易（1000条/页，最多20页=20000条上限）
2. `applyDataState` 中 O(n×m) 双重遍历修复 completionCount
3. 用户在此期间无法操作，体验极差

### 根因分析
- `initApp` 登录分支阻塞调用 `handlePostLoginDataInit('initApp')`，内部调用 `DAL.loadAll()` 全量加载
- `loadAllTransactions()` 串行网络请求，大数据量下耗时线性增长
- 本地缓存（`timeBankData`）已存在有效数据，但启动时未优先使用

### 修改方案
1. **initApp 秒开**：登录分支先 `applyDataState(getLocalData())` 恢复本地缓存，立即设 `hasCompletedFirstCloudSync = true` 允许用户操作，后台非阻塞调用 `handlePostLoginDataInit('initApp', true)`
2. **增量同步路径**（`handleIncrementalSync`）：`DAL.subscribeAll()` 建立 Watch → `fetchDelta()` 拉取差异交易 → `mergeTransactionDelta()` 合并 → `mergeTasksSmart()` 字段级合并任务 → 恢复 Profile/RunningTasks/Daily → 重算余额和索引
3. **任务智能合并**（`mergeTasksSmart`）：复用 Watch update 逻辑，本机回声直接替换（保留 lastUsed），他机修改字段级合并
4. **缓存容量保护**（`saveLocalCacheWithFallback`）：`localStorage.setItem` 失败时捕获 `QuotaExceededError`，降级为仅保留最近 90 天交易

### 测试要点
- 大数据量用户冷启动：确认 <1 秒秒开，后台 2~6 秒完成增量同步
- 无本地缓存/首次安装：确认降级为阻塞式全量加载
- 后台同步期间用户操作：确认 `saveData` 多重守卫（写入门禁/globalWriteLock/pendingRegistry）继续生效
- localStorage 配额超限：确认降级保存成功

---

## v8.2.7（saveTask 数据保护：clientId、失败重试队列、Watch 回声识别、字段级合并）

### 问题描述
`saveTask`（任务编辑/保存）与 `addTransaction`（交易记录）存在根本性的保护差距：
1. **无 pendingRegistry**：Task Watch `update` 直接 `tasks[idx] = task` 全对象覆盖，无法区分"本机回声"与"他机修改"。
2. **无失败重试**：`DAL.saveTask` 失败仅 `throw err`，调用方 `.catch(err => console.error(...))`，无 `tb_failedLocalWrites` 队列。
3. **无 clientId**：无法识别写入来源，多端编辑时本地未同步编辑会被云端版本直接全对象覆盖。
4. **弱网无降级**：用户以为保存成功（弹窗关闭、UI刷新），实际云端未更新。

### 根因分析
- Transaction 是**只增不改**的（`add` 操作），天然幂等；Task 是**更新现有文档**（`update` 操作），非幂等。
- Transaction 的 `pendingRegistry` 用于防止余额重复计算；Task 需要防止的是**字段级覆盖冲突**。
- 不能直接照搬 Transaction 的 `Map<txId, tx>` 模式，必须区分 Task 与 Transaction 的本质差异。

### 修改方案
1. **DAL.saveTask**：增加 `clientId` 和 `editTimestamp` 字段写入云端；失败时推入 `tb_failedTaskWrites` 独立队列（与交易队列隔离）。
2. **Watch update 分支**：
   - 本机回声（`task.clientId === clientId`）：直接替换，保留 `lastUsed` 的 `Math.max` 保护。
   - 他机修改：字段级合并，基础字段（name/category/color 等）直接覆盖，数值型（completionCount）云端优先，运行态（runningTasks）保留本地状态。
3. **失败重试机制**：新增 `_pushFailedTaskWrite()` 和 `_retryFailedTaskWrites()`，队列去重（同一任务仅保留最新版），最多重试 10 次。
4. **弱网提示**：`app-2.js` `saveTask` 失败时显示 Toast，告知用户"已保存到本地，网络恢复后自动重试"。

### 测试要点
- 弱网/飞行模式下编辑任务，确认 Toast 提示、队列写入、网络恢复后自动重试。
- 双设备同时编辑同一任务不同字段，确认字段级合并正确（如 A 改名称，B 改颜色，合并后两者都生效）。
- 本机编辑后立即 Watch 收到回声，确认不触发字段级合并、不覆盖本地运行态。
- 验证 `tb_failedTaskWrites` 与 `tb_failedLocalWrites` 互不干扰。

---

## v8.2.6（修复登录态误报、后台结束延迟与手动同步失效）

### 问题描述
1. 监听状态显示器频繁误报"未登录"，尤其在多端余额不同或应用从后台恢复时。用户确认已登录，但状态显示"未登录"，且手动同步按钮点击后"没有任何作用"。
2. 应用从后台（十几分钟后）恢复并结束计时任务，需要等待数秒才能计入余额并显示通知。v8.2.3 的异步补偿同步修复后问题依旧。
3. 一旦显示"未登录"，手动同步按钮形同虚设，只能关闭应用重新打开。

### 根因分析

**根因 A：登录态误报的三层叠加缺陷**

1. `isLoggedIn()` 完全依赖内存变量 `cachedLoginState`，不尝试任何兜底恢复。当 CloudBase SDK 在 token 刷新竞争或多端并发时短暂返回 null，`cachedLoginState` 被 `refreshLoginState()` 清空，此后所有依赖 `isLoggedIn()` 的路径全部断路。
2. `_doManualSync()`、`checkAndRebuildWatchers()`、`subscribeAll()` 等 4 个同步链路入口均硬编码 `if (!isLoggedIn()) return;`，形成"级联断路器"。
3. `checkLoginStateOnResume()` 检测到"意外登出"时过于激进，直接 `updateAuthUI(null)` 并跳转设置页，未先尝试静默自动登录恢复。

**根因 B：后台恢复时的并行重建竞争**

1. `visibilitychange` 恢复时的 `.then(() => { checkAndRebuildWatchers(true); })` **未 await** 重建完成，`isRecoveringFromHibernate` 在重建期间长期保持 `true`。
2. 用户点击结束任务时，`stopTask()` 末尾检测到 Watch 断连，触发**第二个** `checkAndRebuildWatchers(true)`。由于 `isRecoveringFromHibernate` 仍为 `true`，第二个重建也走强制重建路径。
3. **两个强制重建并行执行**：均调用 `DAL.unsubscribeAll()` → `DAL.subscribeAll()` → `DAL.loadAll()`，CloudBase SDK 请求队列堆积，拖慢 `stopTask()` 中 `await saveData()` 的 `DAL.saveProfile()` 响应，导致 UI 刷新和通知延迟数秒。

### 修复方案

**修复 1：`isLoggedIn()` 增加 SDK 兜底恢复**
- 缓存为 null 时，尝试同步调用 `auth.hasLoginState()` 轻量恢复 `cachedLoginState`（不触发网络请求）。

**修复 2：`refreshLoginState()` 保留已有缓存**
- SDK 返回 null 或异常时，如果 `cachedLoginState` 之前已有值，保留旧缓存而不是清空，防止临时波动导致误报。

**修复 3：同步链路入口主动刷新**
- `_doManualSync()` 和 `checkAndRebuildWatchers()` 在 `!isLoggedIn()` 时，先 `await refreshLoginState()` 尝试恢复，成功则继续流程，失败才提示用户。

**修复 4：`checkLoginStateOnResume()` 静默恢复优先**
- 检测到"意外登出"时，先调用 `tryAutoLogin()` 静默恢复。只有恢复失败后才显示通知并跳转设置页。

**修复 5：后台恢复串行化重建**
- `visibilitychange` 和 `window.focus` 恢复时的 `.then()` 改为 `async` 并 `await checkAndRebuildWatchers(true)`，确保 `isRecoveringFromHibernate` 在 then 链完成后才被 `finally` 清除。

**修复 6：`stopTask()` 跳过恢复期冗余重建**
- 当 `isRecoveringFromHibernate` 为 `true` 时，跳过 `stopTask()` 末尾的后台补偿同步（恢复流程已包含重建）。

**修复 7：UI 状态区分**
- `updateWatchStatusUI()` 在 `!isLoggedIn()` 时，若 SDK 仍有态仅缓存丢失，显示"恢复中..."而非"未登录"，减少用户恐慌。

### 修改文件
- `js/app-1.js`：`isLoggedIn()`、`refreshLoginState()`、`_doManualSync()`、`checkAndRebuildWatchers()`、`updateWatchStatusUI()`、`checkLoginStateOnResume()`
- `js/app-auth.js`：`visibilitychange` / `window.focus` 恢复事件处理器
- `js/app-2.js`：`stopTask()` 末尾补偿同步条件

---

## v8.2.5（通透模式 UI 修复与分类标签玻璃态适配）

### 问题描述
1. 通透模式下，监听状态旁的 🔄 手动同步按钮被 glass-mode 通用按钮规则错误覆盖了背景和边框。
2. 通透模式下，计时任务开始后的暂停/取消/结束三按钮出现位置偏移，结束按钮贴近右侧边框。
3. 分类标签在通透模式下仍使用 JS 内联的彩色渐变背景，与 glass 卡片整体风格不协调；v8.2.3 日志中记录的「统一白色毛玻璃」方案已被废弃。
4. Gradient/Flat 模式下，创建任务按钮（FAB）与任务按钮颜色完全相同，缺乏视觉区分。

### 修复与优化

**手动同步按钮**
- 将 `.btn-manual-sync` 加入 `body.glass-mode` 通用按钮排除列表，恢复其原有的无背景无边框纯图标样式。

**计时任务按钮布局**
- `.task-card.glass .task-actions`：将显式 `width: 100%` 改为 `width: auto; align-self: stretch`，依赖 flex stretch 行为规避百分比计算误差。
- `.task-card.glass .task-btn`：添加 `min-width: 0`，确保 flex shrink 不受 `auto` 限制，三按钮严格均分空间。

**分类标签玻璃态适配**
- 废弃 v8.2.3 日志中「统一白色毛玻璃」方案。
- JS 渲染时为 `.task-category` 注入 `--cat-rgb` CSS 变量（如 `124, 77, 255`）。
- CSS 新增 `.task-card.glass .task-category`：使用 `rgba(var(--cat-rgb), 0.45)` 半透明背景 + `rgba(var(--cat-rgb), 0.7)` 同色系发光边框 + `backdrop-filter: blur(4px)`，保留分类颜色区分的同时融入玻璃态风格。

**创建任务按钮（FAB）**
- 通透模式：删除三个画作主题的背景图，统一使用 `rgba(var(--color-primary-rgb), 0.6)` 主题色半透明毛玻璃。
- Gradient/Flat 模式：`.fab` 基础样式叠加 `radial-gradient(circle at 35% 35%, rgba(255,255,255,0.22) 0%, transparent 50%)` 高光层，形成凸起立体感，与纯色任务按钮区分。

### 修改文件
- `css/main.css`：排除 `.btn-manual-sync`、修复 `.task-actions` 布局、新增分类标签 glass 样式、删除 FAB 背景图并统一 glass 样式、添加 FAB 高光渐变
- `js/app-2.js`：`.task-category` 渲染注入 `--cat-rgb`
- `.github/copilot-instructions.md`：删除 v8.2.3 废弃的通透模式日志

## v8.0.0（AI 云端方案 - 已完成）

### 目标
在 TimeBank 应用中引入 AI 洞察报告功能，通过云端大模型生成个性化时间分析报告。

### 最终技术方案：CloudBase 云函数 + DeepSeek API + HTTP 访问服务

**架构演进**：
- 初始方案：端侧 MediaPipe / MNN-LLM（Qwen2.5-3B）→ **废弃**（APK 体积过大、推理速度慢、兼容性问题）
- 过渡方案：CloudBase 云函数 + Gemini API → **废弃**（中国大陆网络超时 20s+）
- **最终方案**：前端 JS → CloudBase HTTP 访问服务 (`timebankAI`) → DeepSeek API (`deepseek-v4-flash` / `deepseek-v4-pro`)

### 已完成工作汇总

**基础设施**：
1. ✅ 云函数 `timebankAI` 部署到 CloudBase（Node.js 18.15，超时 60s）
2. ✅ CloudBase HTTP 访问服务创建（绕过云函数 15s 超时限制）
3. ✅ 环境变量配置：`AI_PROVIDER=deepseek`，`DEEPSEEK_API_KEY`
4. ✅ `build.gradle` 移除 MediaPipe / MNN-LLM 依赖，`TimeBankLLM.java` / `WebAppInterface.java` 简化为云端模式

**前端 AI 服务层**（`js/ai-service.js`）：
5. ✅ `getStatus()` 仍走 `callFunction`（快速，~200ms）
6. ✅ `generateInsightReport()` / `chat()` 通过 HTTP `fetch` 调用（浏览器 60s 超时）
7. ✅ 模型偏好管理：`getModelPreference()` / `setModelPreference()`，localStorage 持久化
8. ✅ **按模型缓存**：`reportCache` 改为按模型键值存储，切换模型不再命中旧缓存
9. ✅ 多周期数据收集：本周 / 本月 / 最近 30 天

**数据收集与聚合层**：
10. ✅ **等长环比周期**：`_getPrevPeriodRange()` 基于当前周期长度动态计算，避免 2 天 vs 7 天的不可比问题
11. ✅ **全量习惯数据**：不再截断 5 个，传入所有习惯的完成率、状态评级（excellent/good/fair/poor/critical）、近 7 天活跃度
12. ✅ **睡眠 14 天每日明细**：替代单一平均值，提供入睡/起床时间、时长、质量评分的每日明细
13. ✅ **四维原始数据聚合**：`_aggregateRawData()` 生成 dailyBreakdown / taskBreakdown / timeDistribution / categoryBreakdown

**Prompt 与报告质量**：
14. ✅ **极简 Prompt 策略**：删除固定分析框架和字数限制，改为「数据字典 + 结构化原始数据 + 自由分析指令」，让 AI 自主判断分析角度
15. ✅ 实测 `flash` 22s 可生成完整报告（~2000 字），`pro` ~28s

**Bug 修复**：
16. ✅ 登录态修复：`cloudbase.auth()` → 全局 `auth` / `app` 实例
17. ✅ 弹窗显示修复：`active` → `show` CSS 类名
18. ✅ 数据偏差修复：历史累计 → 周期过滤；`sleepRecords` → `getSleepHistory()`
19. ✅ 云函数参数传递修复：`buildRequest` 正确接收 `modelOptions`（含 `model` / `thinking`）

### 文件清单

| 文件 | 用途 | 状态 |
|------|------|------|
| `cloudbase-functions/timebankAI/index.js` | 云函数主代码 | ✅ 已部署 |
| `cloudbase-functions/timebankAI/package.json` | 云函数依赖 | ✅ 已完成 |
| `TimeBankLLM.java` | Android AI 管理器（云端模式） | ✅ 已简化 |
| `WebAppInterface.java` | JS 桥接 | ✅ 已简化 |
| `js/ai-service.js` | 前端 AI 服务层 | ✅ 已完成 |
| `js/app-reports.js` | 报告页 AI 功能 | ✅ 已更新 |
| `build.gradle` | 构建配置 | ✅ 已移除 MediaPipe |

### 环境变量配置（CloudBase 控制台）

- `AI_PROVIDER` = `deepseek`
- `DEEPSEEK_API_KEY` = `sk-00c675e1ffa649fc816fbf3dab5cf5c9`

### 性能基准

| 模型 | 平均耗时 | max_tokens | 报告长度 |
|------|---------|-----------|---------|
| `deepseek-v4-flash` | ~22s | 1500 | ~2000 字 |
| `deepseek-v4-pro` | ~28s | 1500 | ~2500 字 |

- `flash` axios 超时：25s；`pro` axios 超时：45s
- HTTP 端点浏览器超时：60s（由 `fetch` 控制）

### 已知限制（v8.1.0 规划解决）

1. **HTTP 端点免鉴权**：当前 HTTP 访问服务为免鉴权状态（URL 含随机数提供隐蔽性）。生产环境建议开启 `tcb service auth` 登录鉴权。
2. **长周期 prompt 长度**："本月" / "30 天"模式下 `dailyBreakdown` 最多 14 条（已截断），更长周期需设计周/月聚合摘要模式。
3. **单一 AI 提供商**：仅支持 DeepSeek，v8.1.0 计划引入更多模型。

---

## v8.1.0（AI 增强 - 进行中）

### 目标
在 v8.0.0 基础上扩展 AI 能力，支持更多模型、更灵活的数据输入方式，以及自然语言交互。

### 已完成

#### 1. 引入 Kimi（Moonshot）AI 模型

- **新增提供商**：`AI_CONFIG` 中新增 `kimi` 配置
  - API 端点：`https://api.moonshot.cn/v1/chat/completions`（OpenAI 兼容格式）
  - 模型：`kimi-k2.6`（K2.6 系列，256k 上下文）、`kimi-k2.5`（多模态，256k）、`moonshot-v1-8k/32k/128k`（V1 系列）
  - Timeout：30s，max_tokens：1500
  - 环境变量：`KIMI_API_KEY`
  - **参数兼容性**：K2.6/K2.5 系列 `temperature` 固定不可手动设置（思考模式 1.0 / 非思考模式 0.6），`buildRequest` 中自动判断模型前缀 `kimi-k2` 并跳过 `temperature`；V1 系列正常设置 `temperature: 0.7`

- **多提供商扫描**：`getStatus` 重写为遍历所有已配置 key 的提供商，返回合并模型列表
  - 模型对象增加 `provider` 字段（如 `deepseek`、`kimi`）
  - 前端选择器根据返回的 `models` 动态渲染，无需硬编码

- **模型推断机制**：`generateInsight` / `chat` 中，若前端只传 `model` 未传 `provider`，云函数遍历 `AI_CONFIG` 自动推断正确的提供商
  - 解决了切换模型时提供商不匹配的问题

- **前端模型偏好升级**：`getModelPreference` 返回格式增加 `provider` 字段
  - 兼容旧格式（无 provider 字段时自动推断补充）
  - 默认偏好：`{ model: 'deepseek-v4-flash', provider: 'deepseek', thinking: false }`

- **Bug 修复**：`chat` action 原代码使用 `||` 链获取 API key（`process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY`），导致提供商与 key 不匹配。已修复为按 `provider` 分支精确获取。

- **修改范围**：
  - `cloudbase-functions/timebankAI/index.js`：新增 `kimi` 配置、重写 `getStatus`、增加模型推断、修复 `chat` 的 key 获取
  - `js/ai-service.js`：模型偏好增加 `provider`、请求携带 `provider` 参数
  - `js/app-reports.js`：选择器 option 增加 `data-provider`、`onAIModelChange` 保存 provider

- **部署步骤**：
  1. 在 CloudBase 控制台 → 云函数 `timebankAI` → 环境变量中添加 `KIMI_API_KEY`
  2. 重新部署 `timebankAI` 云函数（上传更新后的 `index.js`）

#### 2. CLI 自动部署云函数（取代手动 ZIP 上传）

- **问题**：此前更新云函数需手动打 ZIP 包上传控制台，流程繁琐易出错
- **方案**：利用 `cloudbaserc.json` + `tcb fn deploy --force` 实现一键自动部署
- **配置**：项目根目录 `cloudbaserc.json` 已配置 `envId`、`functionRoot` 和两个云函数的 `runtime`/`timeout`/`handler`
- **命令**：
  ```powershell
  # 单个部署（--force 自动覆盖，无需交互确认）
  tcb fn deploy timebankAI --force
  tcb fn deploy timebankSync --force
  # 批量部署
  tcb fn deploy --all --force
  ```
- **前提**：已安装 CloudBase CLI（当前环境 3.2.2）且已执行 `tcb login`
- **注意**：`@cloudbase/node-sdk` 非 Node.js 18 内置模块，部署前需在各云函数目录执行 `npm install`

#### 3. AI 报告数据与 Prompt 重构

**周期体系重构**：
- 用户可选 3/7/30 日报告周期
- 3/7 日报告实际导入 6/14 天数据（含等长环比），30 日导入 30 天
- `_getDataWindowRange()` 实现：3日→6天、7日→14天、30日→30天
- `dailyBreakdown` / `sleep` 按数据窗口全量导入

**习惯完成率精确计算**：
- 重写 `calculateHabitCompletionRate()`：基于 `transactionIndex` 遍历最近30天交易，按 `daily`/`weekly` 分别统计实际达标周期数
- `continuous_target` 类型验证 `amount >= targetTime` 或 `isStreakAdvancement === true`
- 修复了原先用 `streak ÷ 30` 估算导致完成率严重失真的问题

**全量任务信息传入**：
- `collectUserData()` 新增 `data.tasks`，包含所有非隐藏任务的类型、分类、倍率、目标时间、习惯模式、自动检测开关、系统任务标记等
- `_aggregateRawData()` 新增 `taskCategoryMap` 参数：当交易缺失 `category`（手动补录/自动检测补录均未保存 category）时，自动从任务配置补全
- 修复了大量任务被错误归为「未分类」的问题

**Prompt 重写（纯信息型）**：
- `buildInsightPrompt()` 彻底删除所有分析要求类指令（如「请给出建议」「分析原因」）
- 仅保留：应用介绍、当前模式说明、数据格式说明
- 新增「重要概念说明」：补录、自动检测补录、屏幕时间管理、戒除模式、均衡模式、未分类的解释
- 新增「时段分布注意」：明确提醒 AI 屏幕时间管理和自动检测补录在夜间（约23:00）统一结算，实际使用发生在全天，夜间 spend 高不代表用户仅在夜间消耗时间
- 新增「任务配置（全量）」段落，列出所有任务的类型、分类、倍率及特殊标记

**模型选择器过滤**：
- `updateAIInsightCardStatus()` 中过滤 `provider === 'deepseek'`，Kimi 选项对用户不可见
- 代码完全保留（多提供商扫描、模型推断、Kimi 配置均保留），仅前端 UI 过滤
- 原因：用户使用的是 Kimi Code Key，不能用于 `api.moonshot.cn`（需从 platform.kimi.com 获取有效 Key）

- **修改范围**：
  - `js/ai-service.js`：周期体系、完成率计算、taskCategoryMap、全量 tasks 传入
  - `js/app-reports.js`：模型选择器过滤、周期选择器
  - `cloudbase-functions/timebankAI/index.js`：Prompt 重写、概念说明、时段提醒

#### 4. 报告格式与时段分布修复

**报告格式恢复**：
- 问题：此前禁止所有 Markdown 语法导致报告变成大段纯文本，阅读困难
- 修复：Prompt 允许 `###` 标题、`- ` 列表、`**` 粗体；仅禁止 `|` 表格（前端无法渲染）
- 前端 `renderMarkdown()` 恢复 `<h3>` / `<ul>/<li>` 渲染，保留表格去 `|` 处理

**时段分布数据修正**（核心修复）：
- 问题：屏幕时间管理和自动检测补录的交易 timestamp 固定为 23:00，AI 持续误判为「夜间超量使用」
- 根因：此前仅在 Prompt 中文字提醒，但 AI 仍被数据中的 evening/night 高 spend 误导
- 数据层修复：`_aggregateRawData()` 的 `timeDistribution` 计算中识别系统结算交易（`systemType === 'screen-time'` / `autoDetectData` / `description` 含「自动补录」或「屏幕时间」），将其从时段统计中排除，单独累加到 `settledEarn` / `settledSpend`
- Prompt 修复：「重要概念说明」重写，明确强调 timestamp 是「系统结算时间」不是「用户实际使用时间」；「时间段分布」数据前明确标注「已排除系统结算」并单独列出结算金额
- 效果：时段分布只反映真实时段行为，系统结算金额单独呈现且不参与时段分析

- **修改范围**：
  - `js/ai-service.js`：`timeDistribution` 排除系统结算交易
  - `js/app-reports.js`：恢复 Markdown 标题/列表渲染
  - `cloudbase-functions/timebankAI/index.js`：Prompt 概念说明重写、时段分布数据调整、输出格式恢复

---

## v8.1.0（AI 伙伴 - 已完成）

### 目标
让 AI 从「数据分析者」进化为「具有长期记忆、每天关注用户行为变化、随时随地提供情绪支持和善意提醒的关注者」。

### AI 伙伴「时光」

**核心体验**：
- 报告页新增「时光」AI 伙伴卡片，每天显示个性化关怀消息
- 语气温暖、真诚、不评判，像一位关心朋友的老友
- 会庆祝进步（习惯连胜、早睡），会温柔提醒问题（熬夜、习惯中断），从不指责
- 点击卡片展开聊天浮层，随时和 AI 伙伴对话

**数据层**：
- 新增 CloudBase 集合 `tb_ai_memory`（预置规则，自动过滤 `_openid`）
- 存储三种类型记忆：`daily_note`（每日关怀）、`observation`（持续观察）、`conversation`（对话记录）
- `COMPANION_SERVICE` 提供 `fetchMemory()` / `saveMemory()` / `getDailyMessage()` / `chat()` 接口
- localStorage 缓存当日消息，避免重复请求

**云函数**：
- 新增 `dailyCompanion` action：接收当日数据 + 历史记忆 → 生成关怀消息
- 升级 `chat` action：支持传入 `memory` 上下文（observations + 最近对话），实现多轮对话记忆
- `buildCompanionPrompt()`：定义 AI 角色为「时光」，强调温暖、鼓励、不评判的语气

**前端 UI**：
- `COMPANION_SERVICE` 嵌入 `ai-service.js`
- 聊天浮层 UI 嵌入 `app-reports.js`
- 卡片样式：暖黄色渐变、圆角、未读红点脉冲动画
- 聊天浮层：底部滑出式半屏弹窗，AI 气泡（暖黄渐变）+ 用户气泡（主题色渐变）
- 深色模式适配

**触发机制**：
- `initApp()` 完成后延迟 2 秒自动调用 `initCompanionCard()`
- 若今天已有缓存消息直接显示，否则异步生成

### 文件清单

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `js/ai-service.js` | 新增 `COMPANION_SERVICE`（记忆管理 + 每日消息 + 对话） | ✅ |
| `js/app-reports.js` | 新增聊天浮层 UI 函数 | ✅ |
| `index.html` | 新增「时光」卡片（位于 AI 洞察报告卡片下方） | ✅ |
| `css/main.css` | 新增卡片 + 聊天浮层样式（含深色模式） | ✅ |
| `cloudbase-functions/timebankAI/index.js` | 新增 `dailyCompanion` action，升级 `chat` 支持记忆 | ✅ 已部署 |

### 规划中（已降级或推迟）

以下条目从 v8.1.0 规划中移除或推迟：
- **周/月聚合摘要模式**：数据量控制策略暂不需要，当前 dailyBreakdown 已按数据窗口控制
- **自然语言引导生成报告**：AI 伙伴聊天已实现类似能力，用户可直接和「时光」对话
- **HTTP 端点鉴权加固**：当前免鉴权状态运行良好，鉴权升级非紧急

### 参考文档

- 详细部署指南：`cloudbase-functions/timebankAI/deploy-guide.md`
- CLI 自动部署：`tcb fn deploy timebankAI --force`
- CloudBase 数据库：`tb_ai_memory` 集合需配置预置规则「读取和修改本人数据」

---

## v8.2.0（分类栏独立任务显示数量）

### 目标
为每个分类栏增加独立控制该分类下任务卡片数量的功能，替代全局一刀切的限制。

### 实现要点

**数据层**：
- 新增 `categoryTaskLimits` 对象（键：分类名，值：2/4/6/8）
- 持久化键 `tb_category_task_limits`，localStorage JSON 存储
- 未设置的分分类回退到全局 `CATEGORY_TASK_LIMIT`

**UI 层**：
- 分类栏 header 增加第四个操作按钮（`category-limit-btn`）
- 按钮显示当前限制值（2/4/6/8），点击循环切换
- 使用现有 `category-edit-btn` 样式，保持视觉一致性

**行为设计**：
- 切换顺序：2 → 4 → 6 → 8 → 2
- 当切换回与全局设置相同的值时，`delete categoryTaskLimits[category]`，恢复跟随全局
- 切换后清除该分类的 `expandedTaskCategories` 状态并刷新 UI

**修改范围**：
- `js/app-1.js`：声明 `categoryTaskLimits`、修改 `updateCategoryTasks` 渲染逻辑（`catLimit` 替代 `CATEGORY_TASK_LIMIT`）、拖动前展开判断适配
- `js/app-2.js`：新增 `toggleCategoryTaskLimit(category, event)`

---

## v8.2.1（修复全量同步覆盖 pending 交易）

### 问题描述
用户在「同步中：x/5」状态期间完成任务，出现交易记录"先显示后消失"、余额回退，一段时间后恢复。

### 根因
Watch 断连触发 `checkAndRebuildWatchers(true)` → `DAL.loadAll()` 全量同步，`transactions = finalTransactions` 直接覆盖本地数组。若云端写入还在传播中，`finalTransactions` 不包含本机刚写入的交易。Watch 回声到达时 `isPending → continue`，不会重新加入，导致该交易在内存中"消失"。

### 修复方案（双重防护）

**防护1：DAL.loadAll() 保留 pending 交易**
- 在 `transactions = finalTransactions` 之前，遍历 `pendingRegistry`
- 若 `finalTransactions` 缺少 pending 中的交易，补回并重新排序
- 确保全量同步后 pending 交易不丢失

**防护2：Watch handler 补回缺失交易**
- `isPending(txId)` 分支中，在 `continue` 前检查 `transactions` 是否仍包含该交易
- 若已被 `loadAll` 覆盖，执行 `transactions.unshift(tx)` + 增量更新余额/dailyChanges
- 覆盖极端竞态下的遗漏场景

### 修改文件
- `js/app-1.js`：DAL.loadAll() 增加 pending 交易保留逻辑、Watch add 分支增加缺失补回逻辑

### 验证建议
- 断网等待「同步中」状态出现后完成任务，观察交易和余额是否稳定


## v8.2.3（修复后台结束任务后 UI 僵死）

### 问题描述
开启计时任务后跳转到其他应用，十几分钟后通过悬浮窗返回并点击结束任务，任务卡片计时器暂停但不立即显示"已完成"，余额和交易也未即时更新。监听状态显示"同步中/连接中"，需等待数秒至十余秒显示"已连接"后，UI 才恢复正常。

### 根因分析
`stopTask()` 函数末尾（v7.33.10 引入）包含一段**同步阻塞式**补偿同步逻辑：
1. 用户从后台返回时，WebSocket 已因长时间冻结而断连，`watchConnected` 部分为 `false`
2. 点击"结束"后，`stopTask()` 本地已完成 `runningTasks.delete()` 和交易入账，但随后 `await checkAndRebuildWatchers(true)` + `await reconcileCloudAfterWatch('stopTask')` 阻塞了主线程
3. `checkAndRebuildWatchers(true)` 会执行 `unsubscribeAll() → subscribeAll() → DAL.loadAll()`，在弱网或 WebSocket 损坏时耗时数秒以上
4. `updateAllUI()` 被放在补偿同步**之后**调用，导致用户看到"计时器停了但任务未结束、余额未变"的僵死状态

### 修复方案（方案 A）
- **将 `updateAllUI()` 提前至补偿同步之前**：`saveData()` 完成后立即刷新 UI，让用户即时看到任务结束和余额变更
- **补偿同步改为后台异步执行**：`checkAndRebuildWatchers(true)` 和 `reconcileCloudAfterWatch()` 不再 `await`，改为 `.then()` 链式异步执行
- 后台同步完成后再次调用 `updateAllUI()`，确保远程如有变更也能及时反映

### 修改文件
- `js/app-2.js`：`stopTask()` 末尾调整 `updateAllUI()` 位置，补偿同步改为异步链式调用

### 验证建议
- 开启计时任务，切到后台 10 分钟以上，通过悬浮窗返回并结束任务，观察是否立即显示完成状态和余额变动
- 检查监听状态是否仍在后台自行恢复，且不阻塞交互

---

## v8.2.2（修复 Watch 连接僵死与手动同步无效）

### 问题描述
安卓端和网页端即便都在前台活动且网络正常，仍偶发出现监听状态显示"未连接"。一旦出现该状态，除关闭进程重新打开外任何操作均无效，🔄 手动同步按钮形同虚设。

### 根因分析（5 个互相关联的 bug）

**根因 1：unsubscribeAll() 中 close() 永久挂死（致命）**
- CloudBase Watch 的 `.close()` 在底层 WebSocket 损坏时可能返回永不 resolve/reject 的 Promise
- `subscribeAll()` 开头调用 `unsubscribeAll()`，导致 `checkAndRebuildWatchers()` → `manualSync()` 全链条死锁
- 这是"手动同步形同虚设"的直接原因

**根因 2：subscribeAll() 与 isLoggedIn() 登录态检查不一致 + 静默失败（严重）**
- `isLoggedIn()` 检查 `cachedLoginState`，`subscribeAll()` 检查 `auth.hasLoginState()`
- 多端操作时 token 刷新竞争导致二者分裂：`isLoggedIn()` 为 true，但 `hasLoginState()` 为 null
- `subscribeAll()` 遇到 `!loginState` 直接 `return`，不抛异常，调用方无法感知失败

**根因 3：isRecoveringFromHibernate 在挂起/异常路径下未重置（严重）**
- `checkAndRebuildWatchers(true)` 仅在 try 成功末尾重置 `isRecoveringFromHibernate = false`
- 若 `subscribeAll()` 因根因1挂死，该标志永不重置，后续所有重建永远走强制路径

**根因 4：manualSync() 无整体超时（隐患）**
- `manualSync()` 是长达数十行的 async 函数，无任何超时保护
- 一旦链条中任何环节死锁，函数永不返回，`finally` 永不执行，按钮永久显示 `⏳`

**根因 5：watchReconnectTimers.pending 可能残留（隐患）**
- 极端情况下（如后台恢复时 JS 引擎丢弃定时器回调），`pending` 非空但定时器已失效
- 后续所有 `scheduleWatchReconnect()` 因"已有 pending 任务"而被永久忽略

### 修复方案

**修复1：unsubscribeAll() 添加 3 秒超时保护**
- `await Promise.race([close(), timeout(3000)])`
- 超时后强制放弃，继续后续重建流程

**修复2：subscribeAll() 统一登录态检查 + 主动刷新**
- 入口先用 `isLoggedIn()` 统一判断
- 若 `hasLoginState()` 返回 null 但 `isLoggedIn()` 为 true，调用 `refreshLoginState()` 主动修复分裂状态

**修复3：checkAndRebuildWatchers(true) 用 finally 重置休眠标志**
- `isRecoveringFromHibernate = false` 移至 `finally`，确保无论成败都会重置

**修复4：manualSync() 添加 25 秒整体超时**
- 外壳函数 `manualSync()` 使用 `Promise.race([_doManualSync(), timeout(25000)])`
- 超时后 `finally` 一定会恢复按钮状态

**修复5：startActiveSync() 防御性清理卡死调度器**
- 30 秒轮询中检测：若 `registeredCount === 0` 且 `pending` 存在超过 30 秒，强制 `clearTimeout` 并清零计数器

### 修改文件
- `js/app-1.js`：`unsubscribeAll()` 超时保护、`subscribeAll()` 登录态刷新、`checkAndRebuildWatchers()` finally 重置、`manualSync()` 整体超时拆分、`startActiveSync()` 防御性清理

### 验证建议
- 模拟 close() 挂死：DevTools 中替换 `watchers[x].close` 为永不 resolve 的 Promise，点击 🔄 观察 3 秒后是否恢复
- 多端并发：安卓端和网页端同时在前台，一端快速完成多个任务，观察另一端是否能自动/手动恢复连接

---

## v8.2.0（AI 统一认知 - 已完成）

### 目标
让 AI 获得一次全量数据视图，分析并形成长期记忆。此后只推送增量更新，由用户指定时间点自动同步，AI 在合适时机发出关怀或严格管教。

### 核心架构：AI 数据副本 + 结构化画像

**"一体性"保证**：
- `tb_ai_user_brain` 是 AI 对用户的唯一权威认知源
- 全量初始化和增量同步都更新同一个 brain
- 增量分析时 AI 同时看到当前画像 + 完整历史数据 + 增量数据
- 画像版本追踪（cognitionVersion），保留最近 5 个版本历史

### 双通道全量初始化

**通道A：应用内部初始化**（`initMemoryInternal` action）
- 前端 `collectFullData()` 打包所有历史数据（交易、任务、习惯历史、每日汇总）
- 云函数存储按月分片的数据镜像到 `tb_ai_data_mirror`
- 调用 DeepSeek v4-pro 分析全量数据，生成结构化画像 JSON
- 额外调用 v4-flash 生成自然语言摘要
- 写入 `tb_ai_user_brain`（cognitionVersion=1）

**通道B：外部导入**（`importExternalProfile` action）
- 前端导出 JSON 数据文件，用户用 GPT-4/Claude 分析
- 上传外部画像，支持三种合并策略：override（覆盖）、merge（智能合并）、parallel（并行保留）
- 导入记录存入 `tb_ai_external_import`，保留原始输出和合并过程

### 定时增量同步

**用户配置**：
- 设置每天同步时间点（如 08:00、19:00），多选
- 默认角色：auto（自动判断）/ companion / instructor / analyst
- 每日反馈上限：3/5/10/20 条
- 免打扰时段：23:00-07:00

**同步流程**（`syncIncremental` action）：
1. 前端 `collectIncrementalData()` 收集自上次同步以来的新数据
2. 云函数读取 brain.profile + data_mirror + 增量数据
3. 调用 DeepSeek v4-flash 分析（3-5 秒响应）
4. 解析 AI 返回：profileUpdates + newInsights + feedbackMessages
5. 更新 brain（画像更新 + cognitionVersion+1）
6. 生成反馈消息存入 `tb_ai_feedback`
7. 记录同步日志到 `tb_ai_incremental_log`

**前端定时检查**：每 60 秒轮询一次，到达设定时间点后自动触发同步

### 反馈消息展示

- **Toast 弹出**：高优先级消息（priority >= 4）立即以顶部滑入 Toast 展示
- **未读红点**：时光卡片上显示未读数量 badge
- **应用内展示**：用户打开应用时检查未读消息，自动展示高优先级消息

### 新增数据库集合

| 集合 | 用途 |
|------|------|
| `tb_ai_user_brain` | AI 认知核心：用户画像、认知版本、增量洞察、版本历史 |
| `tb_ai_data_mirror` | 数据镜像库：按月分片的交易记录和每日汇总 |
| `tb_ai_incremental_log` | 增量同步日志：每次同步的原始数据、处理状态、分析结果 |
| `tb_ai_feedback` | 反馈消息库：AI 生成的所有消息，支持已读/过期/优先级 |
| `tb_ai_sync_schedule` | 同步计划配置：时间点、角色、上限、免打扰 |
| `tb_ai_external_import` | 外部导入记录：保留外部 AI 的原始输出和合并过程 |

### 新增云函数 Action

| Action | 用途 |
|--------|------|
| `initMemoryInternal` | 全量初始化（通道A） |
| `importExternalProfile` | 外部画像导入（通道B） |
| `syncIncremental` | 增量同步 + 反馈生成 |
| `getSyncSchedule` | 获取同步配置 |
| `setSyncSchedule` | 保存同步配置 |
| `getAIFeedback` | 获取反馈消息列表 |
| `markFeedbackRead` | 标记消息已读 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `cloudbase-functions/timebankAI/index.js` | 新增 7 个 action + 全量/增量 Prompt 构建 + 画像解析/合并/更新工具函数 |
| `js/ai-service.js` | 新增 `COGNITION_SERVICE`（数据收集、全量初始化、增量同步、配置管理、反馈查询）+ `showAIToast()` + `updateCompanionBadge()`；`collectFullData` 数据净化修复（排除 autoDetectData、限制 2000 条交易、净化 taskCompletions） |
| `js/app-reports.js` | 新增 AI 认知 UI 交互函数（初始化、同步、导出、导入、配置弹窗、UI 更新）；`updateAICognitionUI` 适配报告页卡片结构 |
| `js/app-1.js` | 启动时初始化 AI 认知 UI + 定时同步检查（每 60 秒） |
| `index.html` | **AI 认知记忆与 AI 洞察报告合并**：移除设置页独立 AI 认知区域，在报告页 AI 洞察报告卡片内集成 AI 记忆功能区（导出/初始化/同步/导入/配置）+ 版本号更新 |
| `css/main.css` | 新增 AI 认知合并样式（ai-cognition-divider, ai-cognition-bar, ai-cognition-actions） |
| `sw.js` | 版本号更新 |

### UI 合并说明

**合并前**：AI 洞察报告卡片 + AI 伙伴卡片在报告页；AI 认知记忆独立区域在设置页。
**合并后**：AI 认知记忆功能区嵌入 AI 洞察报告卡片底部，形成统一的 AI 功能入口。

合并后的卡片结构：
```
┌─ 🤖 AI 洞察报告 ─────────────────────┐
│  [周期] [模型]                        │
│  [✨ 生成 AI 报告]                    │
│  ──── 🧠 AI记忆 ────                 │
│  未初始化: [📤 导出] [🚀 初始化]     │
│  已激活:  [🔄 同步] [📤 导出] [📥 导入] [⚙️]
└──────────────────────────────────────┘
```

- 外部导入作为推荐方案（导出 → 外部 AI 分析 → 导入）
- 应用内初始化作为备选方案
- 配置（定时同步时间、角色、上限）通过 ⚙️ 按钮弹出浮层设置

### 部署

```powershell
tcb fn deploy timebankAI --force
```

---

### 规划中

2. **更精确的分周期数据导入和报告**
   - **周/月聚合摘要模式**：当周期超过 14 天时，`dailyBreakdown` 改为按周聚合（周起始日、总时长、平均时长、 busiest day）
   - **分类趋势分析**：在 `categoryBreakdown` 基础上增加环比变化（vs 上周期），标记增长/下降 Top 3 分类
   - **任务效率维度扩展**：`taskBreakdown` 增加 `avgDurationPerSession`、`completionConsistency`（完成时间方差）
   - **时段分布热力图数据**：`timeDistribution` 从 4 个时段扩展为 24 小时粒度，支持 AI 分析用户的高效时段
   - **数据量控制策略**：定义 `COMPACT_MODE_THRESHOLD = 14`（天），超过则启用聚合摘要，平衡数据完整性和生成耗时

3. **用户使用自然语言引导生成报告**
   - **前端交互**：在 AI 洞察卡片增加自然语言输入框（如 "为什么我最近阅读时间少了？" / "帮我分析一下睡眠问题"）
   - **问题类型识别**：云函数增加 `classifyQuestion` 步骤，将用户问题归类为：
     - `overview` → 生成完整报告（现有行为）
     - `habit_focus` → 精简数据，只传入习惯和任务数据
     - `sleep_focus` → 精简数据，只传入睡眠和每日明细
     - `time_distribution` → 精简数据，只传入时段分布和分类占比
     - `trend_analysis` → 扩展数据，传入更长周期的聚合数据
   - **动态 Prompt 裁剪**：根据问题类型，在 `buildInsightPrompt` 中选择性包含/排除数据维度，降低 token 消耗和生成耗时
   - **上下文对话**：`chat` action 支持多轮对话，用户可基于已生成的报告继续追问

### 技术准备（交接说明）

- **HTTP 端点鉴权加固**：当前 `callViaHTTP` 未传任何鉴权头。开启 CloudBase HTTP 鉴权后，需在前端获取 `access_token` 并加入 `Authorization` header。
- **Prompt 版本管理**：当前 prompt 为单文件内联，建议后续将系统提示词抽离为独立模板文件，支持 A/B 测试。
- **数据聚合性能**：`_aggregateRawData` 目前为 O(n) 遍历，如交易量大（>5000 条）可考虑预计算索引。

### 参考文档

- 详细部署指南：`cloudbase-functions/timebankAI/deploy-guide.md`
- HTTP 访问服务配置：`cloudbase-functions/timebankAI/taskLock-deploy-guide.md`
- 历史方案：MediaPipe 本地方案已废弃，Gemini 方案已废弃

---

## v7.39.1（历史版本）

### Habit System 3.0：习惯系统重构

- **问题描述**：`rebuildHabitStreak`在遇到未达标周期时只`break`保持旧streak，无法从断点恢复；跨设备使用导致Watch远程交易不触发streak重算，设备间streak出现永久分歧；`hasMissedHabitDayInCurrentPeriod`依赖`isStreakAdvancement`标记导致补录/补发奖励逻辑混乱；习惯设置变更后未触发streak重算。

- **核心原则**：
  - 连胜 = 交易历史中连续达标的周期数（完全推导，不保留中间状态）
  - 奖励 = 基于当前streak里程碑（只对新增里程碑发放，不追溯）
  - 所有操作（正常完成/补录/撤回/远程）触发同等的streak重算
  - 设置变更后触发streak重算，保留streak值（按新标准重新计算）

- **rebuildHabitStreak修复**：
  - 未达标周期 → `streak = 0` + `lastCompletionDateStr = null` + `continue`（而非break）
  - 找到下一达标周期 → `streak = 1` 重新开始
  - `isBroken` 由 streak 直接推导：`streak > 0` → `false`，`streak === 0` → `true`

- **isStreakAdvancement移除**：补录和正常记录在连胜方面等效，只要周期达标就计入streak。

- **Watch远程触发**：Transaction watch的add/update/remove三分支均增加`rebuildHabitStreak`调用，确保跨设备streak一致性。

- **设置变更处理**：习惯的`period`或`targetCountInPeriod`变更后，自动触发`rebuildHabitStreak`按新标准重算。

- **健康检查增强**：`checkSingleHabitConsistency`增加`computeHabitStreakFromTransactions`纯计算函数，对比存储值与推导值，覆盖更多不一致场景。

- **修改范围**：
  - `js/app-2.js`：rebuildHabitStreak重写、hasHabitValidCompletionOnDate修复、getHabitPeriodInfo修复、processHabitCompletion简化、saveTask设置变更处理
  - `js/app-1.js`：Watch handler三分支增加habit rebuild、checkSingleHabitConsistency增强、computeHabitStreakFromTransactions新增

- **验证建议**：
  - 断签后补录，观察streak从断点恢复
  - 多设备场景，观察streak是否一致
  - 变更习惯设置后，检查streak是否按新标准重算

---




## v7.39.5（历史版本）

### 删除习惯已中断状态（isBroken/isBrokenSince）

- **问题描述**：v7.39.1 引入的 `isBroken` 状态（断签后1天内显示`习惯已中断`红字）与 streak 机制重复。断签后看到红字恐慌，实际上 streak=0 已经充分表达了断签状态，不需要额外 UI 状态。

- **设计变更**：删除 `isBroken` 和 `isBrokenSince` 字段，`streak === 0` 直接表达断签，UI 通过 streak 值判断显示。

- **删除代码**：
  - `checkHabitStreak()` 函数（app-2.js）：整段移除，该函数唯一功能就是维护 `isBroken`
  - `rebuildHabitStreak` 中 isBroken/isBrokenSince 写入
  - 节制习惯 `isBroken = false` 写入
  - `loadData` 中 `isBroken` 默认值设置（app-auth.js）
  - `saveTask` 新建/编辑任务时 `isBroken` 初始化/保留
  - `updateCategoryTasks` UI 中`习惯已中断`红字显示

- **保留代码**：`refreshHabitStatuses()` 保留函数名但函数体清空（避免全局调用链断裂）

- **修改范围**：
  - `js/app-2.js`：删除 checkHabitStreak、移除 isBroken 相关写入、删除 UI 显示
  - `js/app-1.js`：`refreshHabitStatuses` 简化
  - `js/app-auth.js`：移除 `isBroken` 默认值设置

- **验证建议**：创建一个习惯，故意断签几天，观察卡片显示是否为`今日待完成`（橙色）而非`习惯已中断`（红色）

---

## v7.39.6

### 修复习惯奖励发放：processHabitCompletion 余额双重累加 + updateTransaction 同步 balanceAdjust

- **问题描述**：`processHabitCompletion` 在 `addTransaction(base)` 已入账后，又对 `bonusAdjusted` 执行 `currentBalance += bonusAdjusted` 和 `updateDailyChanges`，导致本地余额比云端记录多出习惯奖励量；`DAL.updateTransaction` 云端更新不携带 `balanceAdjust` 字段，导致云端记录与本地不一致。

- **修复方案**：
  - `processHabitCompletion`：移除 `currentBalance += bonusAdjusted` 和 `updateDailyChanges('earned', bonusAdjusted)`，`addTransaction` 已处理 base 入账，bonus 只需追加到 `transaction.amount` 字段
  - `DAL.updateTransaction`：在 `updateData` 中增加 `balanceAdjust: tx.balanceAdjust || null`，确保云端同步完整

- **修改文件**：
  - `js/app-1.js`（~line 2924）：`updateTransaction` 增加 `balanceAdjust` 字段
  - `js/app-2.js`（~line 4321）：移除 `currentBalance += bonusAdjusted` 和 `updateDailyChanges` 调用

- **验证建议**：
  - 完成一个习惯任务后，检查云端交易记录的 `amount` 是否等于 `baseReward + habitBonusReward`（而非多出 bonus）
  - 检查 `currentBalance` 是否正确（不重复累加 bonus）
## v7.38.0

- **问题描述**：`recentLocalTransactions`依赖30秒时间窗口判断本机写入，网络波动或GC暂停时窗口边界会产生误判；`duplicateCheck`使用1秒窗口+四要素匹配逻辑过于保守且代码复杂；`shouldRecomputeFromLedger`触发全量重算性能差。

- **核心设计**：`pendingRegistry`是`Map<txId, tx>`，替代`recentLocalTransactions`（Map txId→时间戳+30秒过期）。关键区别：**确定性**（精确记录每笔本机写入，直到Watch echo确认才删除）vs **概率性**（依赖时间窗口推断）。

- **Watch echo确认模式**：云端写入后不标记`synced`，等待Watch add事件触发`isPending(txId)`→`removePending(txId)`→继续处理。这是原子化确认链：写入→回声→确认，任何一步失败都有明确状态。

- **持久化**：`pendingRegistry`通过`tb_pendingRegistry`键存入localStorage（含pending条目的entries数组JSON序列化）。`loadPendingRegistry()`在`handlePostLoginDataInit()`入口调用。应用重启或页面刷新后，pending状态不会丢失。

- **并发保护**：新增`_failedWriteRetryRunning`布尔标志，`startFailedWriteRetry()`内检查→设置→执行→finally清除，防止60秒定时器在重试执行时间过长时重叠触发。

- **修改范围**：
  - `js/app-1.js`（android_project & root）：pendingRegistry helpers、`startFailedWriteRetry/stopFailedWriteRetry`并发保护、`addTransaction`移除本地pre-adding改用`addPending`、`_retryFailedWrites`加`clientId`、Watch Transaction handler全量重写（移除`duplicateCheck`/`shouldRecomputeFromLedger`，add/update/remove各自增量更新余额）
  - `js/app-auth.js`（android_project & root）：`handlePostLoginDataInit`入口加`loadPendingRegistry()`调用

- **回退参考**：`git reset --soft 5fda2b6bb5b1ecc3707d207901d3daf8244d7161`

- **验证建议**：完成一个任务后立即检查控制台"[Watch] 确认本机写入回声"日志，确认pendingRegistry条目被正确移除；撤销一笔交易，确认回声也被正确移除。

---

## v7.37.6

### 修复 Watch 去重条件写反 + timestamp 类型不一致

- **问题描述**：用户点击"完成/结束"时，明显看到两条交易出现，但关闭重进后只剩一条。云端只有一条记录。

- **根本原因**（两个bug叠加）：

  1. **Bug1（核心）**：`duplicateCheck`中`t.id !== txId`写反——应检测本地是否已有**同ID**记录，而非不同ID。当前逻辑导致Watch收到云端返回的同一笔交易时无法去重，再次unshift到数组。

  2. **Bug2（辅助）**：`txTimestamp = tx.timestamp`保留了ISO字符串格式，与本地数字timestamp做减法得到NaN，导致`<= 500`时间窗口判断永远失效。

- **修复方案**：
  1. 统一timestamp为数字：`typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp).getTime()`
  2. 修正去重条件：`t.id !== txId` → `t.id === txId`

- **技术细节**：
  - 修改文件：`js/app-1.js`（Watch handler ~line 3375-3390）
  - 影响范围：所有Watch收到的交易增量处理

- **验证建议**：
  - 在单设备上点击"完成"，观察任务历史和卡片，确认只产生一条交易
  - 检查Chrome DevTools Console中是否有"🛡️ [Watch] 检测到可能的重复交易"警告

---

## v7.37.5（历史版本）

### 修复 transaction 缺少 clientId 导致 Watch 去重失效
- **问题描述**：点击一次"完成/结束"按钮，产生两条完全相同的交易。撤销任意一条时，两条都被删除。且该问题仅在单安卓设备运行时出现，用户确保没有点击两次。
- **根本原因**：
  1. `processNormalCompletion()`和`processHabitCompletion()`在创建`transaction`对象时**未包含`clientId`字段**
  2. Watch回调中的去重机制依赖`clientId`比较，但`tx.clientId`为undefined，导致去重逻辑失效
  3. 云端无法区分是本机写入还是Watch回调写入，因而产生了重复记录
- **影响范围**：
  - 所有任务完成路径（processNormalCompletion、processHabitCompletion、连续消费/兑换、补录）
  - 仅单设备场景也会触发，因为Watch回调会处理本机刚写入的交易
- **修复方案**：
  1. 在所有创建`transaction`对象的代码路径中添加`clientId: clientId`
  2. 云端写入时同时保存`clientId`字段：`clientId: tx.clientId || clientId`
  3. 这样Watch回调时可以通过对比`clientId`判断是否为本地写入

### 技术细节
- 修改文件：
  - `js/app-2.js`（6处addTransaction调用）
  - `js/app-1.js`（云端写入时保存clientId）
- 修改位置：
  - `processNormalCompletion()` ~line 4054：添加 `clientId: clientId`
  - `processHabitCompletion()` ~line 4319：添加 `clientId: clientId`
  - 连续消费/兑换路径 ~line 4914/4971/5079：添加 `clientId: clientId`
  - 补录路径 ~line 5769：添加 `clientId: clientId`
  - 云端写入 ~line 2628：添加 `clientId: tx.clientId || clientId`

### 验证建议
- 测试单设备完成一个任务，检查是否只产生一条交易记录
- 测试撤销交易，检查是否只撤销单条（不再出现撤销一条删两条的问题）

---

## v7.37.2（历史版本）

### 修复 rebuildHabitStreak() 对 continuous_target 类型未验证达标
- **问题描述**：用户将"腿部拉伸"习惯的`targetCountInPeriod`从2改为1后，连胜计算仍然错误，习惯奖励无法发放
- **根本原因**：`rebuildHabitStreak()`函数在统计周期内完成次数时，对于`continuous_target`类型走进了"非计时类按次数"分支，**没有验证每笔交易是否真正达标**（`amount >= targetTime`）
- **影响**：
  - 未达标的交易也被计入周期完成次数
  - 可能导致错误的advancement标记
  - 用户修改`targetCountInPeriod`后，旧数据无法正确重建
- **修复方案**：
  - 在else分支中，对`continuous_target`类型添加达标验证：`tx.amount >= task.targetTime || tx.isStreakAdvancement === true`
  - 只统计真正达标的交易，避免未达标交易干扰计数

### 技术细节
- 修改函数：`rebuildHabitStreak()`（app-2.js ~line 5980-5989）
- 修改内容：
  ```javascript
  } else {
      // [v7.37.2] 检查是否达标（对于 continuous_target 类型必须验证 amount >= targetTime）
      let isValidCompletion = true;
      if (task.type === 'continuous_target') {
          isValidCompletion = (tx.amount >= task.targetTime) || (tx.isStreakAdvancement === true);
      }
      if (isValidCompletion) {
          periodData.count++;
      }
  }
  ```
- 文件位置：[`android_project/app/src/main/assets/www/js/app-2.js`](android_project/app/src/main/assets/www/js/app-2.js)

---

## v7.37.1（历史版本）

### 习惯系统核心逻辑修复
- **修复达标任务（continuous_target）习惯连胜计算错误**：解决了用户反馈的"每天达标但任务卡片只显示已连续1天且不发放习惯奖励"的问题
  - **问题描述**：设置了习惯的达标任务（如腿部拉伸），即使用户连续多天完成且每次时长都达到目标时间，任务卡片仍显示streak=1，且不发放习惯奖励
  - **根本原因分析**：
    1. `getHabitPeriodInfo()`函数在统计周期内完成次数时，对所有交易类型一视同仁，未区分达标任务需要`amount >= targetTime`才算有效完成
    2. `hasHabitValidCompletionOnDate()`函数使用`.some()`方法只要找到一笔达标交易就返回true，无法处理`targetCountInPeriod > 1`的场景
    3. v7.20.3-fix引入的`hasMissedHabitDayInCurrentPeriod()`逻辑过于严格：一旦检测到周期内有断签日，就阻止所有advancement标记，导致用户即使重新开始也无法恢复连胜
  
  - **修复方案**：
    1. **修正达标判定逻辑**：在`getHabitPeriodInfo()`中为`continuous_target`类型添加专门分支，过滤出`amount >= targetTime`或已标记为`isStreakAdvancement`的交易进行计数
    2. **支持多目标判定**：重写`hasHabitValidCompletionOnDate()`，改用`.filter().length`方式统计当天达标交易数量，并与`targetCountInPeriod`比较
    3. **移除不合理的阻断逻辑**：重构`processHabitCompletion()`的条件分支，删除"周期内有断签就完全阻止advancement"的逻辑，改为允许用户在断签后重新开始连胜（streak重置为1）
  
  - **设计理念对齐**：修复后的逻辑严格遵循用户的原始设计哲学：
    ```
    达标判定(amount >= targetTime) → 周期统计达标次数 → 习惯判定(达标次数 >= targetCountInPeriod) → 连胜计算
    ```
  
  - **影响范围**：所有使用达标任务（continuous_target）并开启习惯功能的用户，特别是设置了`targetCountInPeriod > 1`的多目标任务场景
  - **风险评估**：低。仅改变了判定逻辑，不影响已有数据结构；修复向后兼容，不会破坏现有数据

### 技术细节
- 修改函数：
  1. `getHabitPeriodInfo(task, transactions)`（app-2.js ~line 4120-4160）：新增`else if (task.type === 'continuous_target')`分支
  2. `hasHabitValidCompletionOnDate(taskId, dateStr)`（app-2.js ~line 4187-4217）：从`.some()`改为`.filter().length`实现
  3. `processHabitCompletion(task, completionDate)`（app-2.js ~line 4260-4315）：简化条件分支，移除`if (cycleAlreadyBroken)`阻断逻辑
- 文件位置：[`android_project/app/src/main/assets/www/js/app-2.js`](android_project/app/src/main/assets/www/js/app-2.js)
- 问题溯源：有问题的`hasMissedHabitDayInCurrentPeriod()`逻辑起源于v7.20.3-fix版本
- 测试建议：用户应测试完成一个continuous_target习惯任务，验证streak能正确递增且在断签后可从1重新开始

---

## v7.37.0（历史版本）

### 性能优化重大改进
- **交易索引系统**：引入`transactionIndex` Map\<taskId, Transaction[]\>，将任务维度查询从O(n)降低到O(1)
  - **问题描述**：随着交易数量增长，`rebuildHabitStreak()`每次都需要全量遍历transactions数组过滤特定任务的交易，导致启动和习惯重建缓慢
  - **修复方案**：
    - 在`DAL.loadAll()`完成后调用`buildTransactionIndex()`一次性构建索引
    - `rebuildHabitStreak()`直接使用索引结果，避免重复过滤
  
- **智能增量重建**：`shouldRebuildHabitStreak()`决策函数避免不必要的完整重建
  - **问题描述**：每次完成任务或撤回都会触发完整的习惯连胜重建，即使只有微小变化也需遍历所有历史交易
  - **根本原因**：原有无条件执行完整重建，未考虑实际变化的幅度
  - **修复方案**：
    - 在`task.habitDetails.lastRebuildAt`记录上次重建时间戳
    - 利用交易索引快速统计近期交易数量
  - **性能提升**：日常操作中约80%的重建请求被跳过，显著减少CPU占用
- **习惯健康检查机制**：应用启动时异步验证习惯连胜一致性，24小时节流自动修复
  - **问题描述**：由于网络波动、Watch监听延迟等原因，习惯连胜可能出现不一致（如有连胜但无对应交易记录）
  - **根本原因**：分布式环境下数据同步可能失败，缺乏自动检测和修复机制
  - **修复方案**：
    - 验证每个习惯任务的streak与lastCompletionDate是否与交易记录一致
    - 发现不一致时标记需要修复，触发UI更新提醒用户
    - 24小时节流避免频繁检查影响性能

### 技术细节
- 新增全局变量：`transactionIndex = new Map()`（app-1.js ~line 3781）
- 新增函数：`shouldRebuildHabitStreak()`, `performHabitHealthCheck()`, `checkSingleHabitConsistency()`, `startHabitHealthCheck()`, `stopHabitHealthCheck()`（app-1.js）
- 修改函数：`rebuildHabitStreak()`使用索引替代全量过滤（app-2.js ~line 5900）
- 集成点：`DAL.loadAll()`调用buildTransactionIndex()，`addTransaction/deleteTransaction`维护索引
- 文件位置：[`android_project/app/src/main/assets/www/js/app-1.js`](android_project/app/src/main/assets/www/js/app-1.js)、[`android_project/app/src/main/assets/www/js/app-2.js`](android_project/app/src/main/assets/www/js/app-2.js)
- 风险评估：低。索引作为缓存层，即使失效也可通过重建恢复，不影响数据完整性

---

## v7.36.6（历史版本）

### 习惯判定逻辑修复
- **修复`continuous_target`类型任务的习惯有效完成判定**：`hasHabitValidCompletionOnDate()`函数现在正确考虑`targetCountInPeriod > 1`的场景
  - **问题描述**：当用户设置"每天需要完成N次才算完成习惯"（N>1）时，原有的判定逻辑只检查当天是否有任意一笔达标交易，忽略了需要达到目标次数的要求
  - **根本原因**：原实现使用`transactionList.some()`只要找到一笔`amount >= targetTime`的交易就返回true，没有统计当天的达标次数
  - **修复方案**：
    - 重构为先用`filter()`筛选当天所有earn交易
    - 对`continuous_target`类型，再过滤出达标的交易（`amount >= targetTime || isStreakAdvancement`）
    - 检查达标交易数量是否>= `targetCountInPeriod`
    - 添加诊断日志，当达标但未满足次数要求时输出提示信息
  - **影响范围**：所有使用`continuous_target`类型任务且设置了`targetCountInPeriod > 1`的用户
  - **风险评估**：低。仅改变了判定逻辑，不影响已有数据结构

### 技术细节
- 修改函数：`hasHabitValidCompletionOnDate()`（app-2.js 第4179行）
- 文件位置：[`android_project/app/src/main/assets/www/js/app-2.js`](android_project/app/src/main/assets/www/js/app-2.js)
- 新增日志：`[HabitCheck] {taskName} on {date}: X/Y completions (need Y)`

---

## v7.36.5（历史版本）

### 性能优化重大改进
- **移除阻塞式云端存在性检查**：`DAL.addTransaction()`不再在写入前执行网络请求验证交易是否存在，消除用户点击"结束任务"后的数秒等待
  - **问题描述**：用户反馈连续任务完成后需要等待几秒才能看到UI更新，严重影响使用体验
  - **根本原因**：`DAL.addTransaction`在第2310-2325行执行`await db.collection(...).where(...).get()`进行云端存在性检查，这是一个阻塞式网络I/O操作
  - **修复方案**：
    - 完全移除云端预检查逻辑，依赖现有的三层防重复机制：
      1. 唯一交易ID生成（时间戳+随机字符串）
      2. Watch监听的clientId+timestamp+taskId+amount四要素去重
      3. `recentLocalTransactions`本地写入追踪（防止Watch add事件重复累加）
    - 保留失败队列持久化机制（`tb_failedLocalWrites`），网络抖动时不丢失数据
  - **性能提升**：从原来的~2-3秒网络往返降低到<10ms本地操作
  
- **余额计算从O(n)全量重算改为O(1)增量更新**：`addTransaction()`直接更新余额和每日统计，避免遍历所有交易
  - **问题描述**：随着交易数量增长（数百条以上），每次添加交易都触发`recomputeBalanceAndDailyChanges()`全量遍历，造成明显卡顿
  - **根本原因**：该函数遍历整个`transactions`数组重新计算余额和每日统计，时间复杂度O(n)
  - **修复方案**：
    - 在`addTransaction()`中直接根据新交易的type和amount增量更新`currentBalance`
    - 调用`updateDailyChanges()`更新对应日期的earned/spent统计
    - 与Watch监听的增量更新策略保持一致，消除两种计算方式的不一致风险
  - **性能提升**：从O(n)降低到O(1)，即使有数千条交易也能瞬间完成

### 技术细节
- 删除代码：`DAL.addTransaction`中的云端存在性检查块（约15行）
- 修改函数：`addTransaction`（app-reports.js）采用增量更新
- 文件位置：[`android_project/app/src/main/assets/www/js/app-1.js`](android_project/app/src/main/assets/www/js/app-1.js)、[`android_project/app/src/main/assets/www/js/app-reports.js`](android_project/app/src/main/assets/www/js/app-reports.js)
- 风险评估：低。保留了完整的防重复机制，仅移除冗余的预检查步骤

---

## v7.37.0（历史版本）

### 监听机制重大增强
- **手动同步用户体验优化**：重构`manualSync()`函数，实现分阶段进度反馈和智能等待机制
  - **问题描述**：用户点击🔄按钮后无明确进度提示，固定等待1.5秒不合理，失败时无具体错误分类
  - **修复方案**：
    - 三阶段Toast提示："正在重建连接" → "等待连接就绪 (X/5)" → "正在同步数据"
    - 智能等待：每秒检查Watch激活状态，最多3秒，提前退出
    - 按钮视觉反馈：沙漏图标 + 半透明禁用状态
    - 详细错误分类：网络错误 vs 认证错误，给出针对性建议
  - **影响范围**：所有使用手动同步功能的用户
  
- **重连计数器安全机制**：新增`MAX_RECONNECT_ATTEMPTS`上限保护和定期健康检查
  - **问题描述**：网络波动可能导致重连计数器无限增长，出现"同步中 4/5"卡死数小时的极端情况
  - **修复方案**：
    - 计数器上限：`MAX_RECONNECT_ATTEMPTS = 20`，达到后延迟稳定在60秒
    - 超限自动重置：检测到计数器超限时强制清零并告警
    - 定期健康检查：每5分钟检查连接状态，正常则重置计数器
    - 详细诊断日志：显示具体哪个watcher断开（未注册/未激活）
  - **影响范围**：所有依赖Watch实时监听的场景，特别是弱网环境用户
  
- **防重复机制审计日志**：添加`window.duplicateAuditLog`用于诊断疑似重复交易
  - **设计原则**：不改变现有去重逻辑（1秒窗口 + 四要素匹配），仅增加追踪能力
  - **使用方法**：Console输入`console.table(window.duplicateAuditLog)`查看最近10条
  - **内存占用**：约2KB，自动清理

### 技术细节
- 新增常量：`MAX_RECONNECT_ATTEMPTS = 20`、`HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000`
- 新增函数：`startHealthCheck()`、`stopHealthCheck()`
- 修改函数：`scheduleWatchReconnect()`、`manualSync()`、`stopActiveSync()`
- 文件位置：[`android_project/app/src/main/assets/www/js/app-1.js`](android_project/app/src/main/assets/www/js/app-1.js)

---

## v7.36.3（历史版本）

### Bug修复
- **取消任务后仍收到达标提醒**：修复了`continuous_target`类型任务取消后，Android端AlarmManager设置的定时闹钟仍然会在原定时间触发通知的问题
  - **问题描述**：用户开启达标任务后短时间内取消，但仍会在原定的targetTime时刻收到"任务完成"的系统通知
  - **根本原因**：`startTask`函数中调用`Android.scheduleAlarm()`设置了Android原生定时闹钟，但`cancelTask`只删除了前端runningTasks条目，未取消Android端的AlarmManager闹钟
  - **修复方案**：在`cancelTask`函数中添加`Android.cancelAlarm()`调用，确保取消任务时同步清除Android端的定时闹钟
  - **影响范围**：所有使用达标任务（continuous_target）的用户
  
- **小睡记录在每日详情中缺少图标**：修复了小睡记录在每日详情弹窗中只显示"小睡"文字而没有💤图标的问题
  - **问题描述**：夜间睡眠显示😴图标正常，但小睡记录只显示"小睡"二字，缺少对应的💤图标
  - **根本原因**：`parseTransactionDescription`已正确设置`icon = '💤'`，但`showDayDetails`函数的图标检测条件中未包含'💤'
  - **修复方案**：在`showDayDetails`的图标前缀拼接逻辑中，将检测条件扩展为包含`|| parsed.icon === '💤'`
  - **影响范围**：所有使用小睡功能的用户

---

## v7.36.2（历史版本）

### 新功能
- **应用保活服务**：新增常驻前台服务，确保应用在后台时不被系统杀死
  - **实现方式**：创建独立的`KeepAliveService`，使用最低优先级通知（IMPORTANCE_MIN）
  - **用户控制**：在通知设置页面提供开关，可随时启用/禁用
  - **JS桥接**：通过`Android.toggleKeepAliveService()`和`Android.isKeepAliveServiceEnabled()`控制
  - **默认行为**：应用启动时自动启用，存储在`app_settings` SharedPreferences中
  - **影响范围**：所有Android设备，特别适用于需要后台数据同步的场景

---

## v7.36.1（历史版本）

### Bug修复
- **达标任务习惯连胜计算错误**：修复了达标任务（`continuous_target`）在设置习惯后，周期内完成次数统计不准确的问题
  - **问题描述**：如果设置了"每天要完成两次才算完成习惯"，第一次达标完成，第二次未达标但未发放习惯奖励，任务卡片却显示已连续x天
  - **根本原因**：`getHabitPeriodInfo`和`rebuildHabitStreak`函数在统计周期内完成次数时，没有检查每笔交易是否真正达标（amount >= targetTime），而是简单统计所有earn类型交易数量
  - **修复方案**：
    - `getHabitPeriodInfo`：对`continuous_target`类型任务，只统计`amount >= task.targetTime`或已标记为`isStreakAdvancement`的交易
    - `rebuildHabitStreak`：新增`isTargetTask`判断，遍历时仅对真正达标的交易进行计数
  - **影响范围**：所有使用达标任务+习惯功能的用户，特别是设置了多目标（targetCountInPeriod > 1）的场景

---

## v7.36.0（历史版本）

### 架构改进
- **云函数锁机制增强**: 引入 `timebankTaskLock` 云函数，解决跨设备任务操作互斥问题
  - 基于 Redis Cache 实现 60 秒自动过期锁
  - 支持锁续期、主动释放、状态查询
  - 客户端集成于 `js/app-1.js` DAL 对象

### 数据一致性保障
- **幂等写入机制**: `timebankSync` 云函数的 `writeTransaction` action 实现严格幂等性
  - 已存在记录：仅允许 `undone=true` 更新
  - 不存在记录：插入新记录
  - 其他情况：静默跳过，避免重复写入

### 同步策略优化
- **增量同步**: 基于 `_updateTime` 字段的增量查询，减少网络传输
- **降级策略**: 云函数未部署时自动降级为全量同步，保证向后兼容

---

## 协作规范

### Git 提交规范

**提交消息格式**:
```
<type>: <subject>

<body>

<footer>
```

**Type 类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整（不影响功能）
- `refactor`: 重构（既不是新功能也不是修复）
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

**示例**:
```
feat: 添加任务锁机制防止跨设备冲突

- 新增 timebankTaskLock 云函数
- 客户端集成锁申请/释放逻辑
- 添加锁超时自动释放机制

Closes #123
```

### 代码审查清单

**提交前自检**:
- [ ] 是否遵循三端同步规则？
- [ ] 版本号是否在 7 个位置正确更新？
- [ ] 技术日志是否已记录关键改动？
- [ ] 用户日志是否已撰写（如适用）？
- [ ] 是否有潜在的时区问题？
- [ ] 事务操作是否正确处理回滚？
- [ ] 是否添加了必要的错误处理？
- [ ] Console 调试日志是否已清理（生产代码不应保留）？

### 高风险操作确认

以下操作**必须**在执行前获得用户明确确认：

- **数据迁移**: 修改数据结构、字段重命名、数据类型变更
- **API 变更**: 修改云函数接口、数据库集合结构
- **删除操作**: 删除文件、数据库记录、云函数
- **版本发布**: 执行 `git push`、打包 Release APK
- **配置修改**: 修改 `cloudbaserc.json`、`build.gradle`、`AndroidManifest.xml`

---

## 快速参考

### 常用搜索关键词

| 需求 | 搜索关键词 |
|------|-----------|
| 查找任务相关逻辑 | `renderTasks`, `startTask`, `stopTask` |
| 查找交易记录操作 | `addTransaction`, `writeTransaction` |
| 查找睡眠相关代码 | `sleepSettings`, `calculateSleepDuration` |
| 查找主题切换 | `themePreference`, `applyTheme` |
| 查找设备 ID | `initDeviceId`, `deviceId` |
| 查找屏幕时间 | `screenTime`, `collectScreenTime` |
| 查找自动检测补录 | `autoDetectAppUsage`, `recordAutoDetectRawUsage` |
| 查找金融系统 | `financialSystem`, `balance` |
| 查找报告生成 | `generateReport`, `trendChart`, `heatmap` |
| 查找认证登录 | `handleEmailLogin`, `loginWithWechat` |

### 紧急故障排查

**应用无法启动**:
1. 检查 `adb logcat` 查看崩溃日志
2. 确认 `index.html` 语法正确
3. 验证 JS 文件加载顺序无误

**数据不同步**:
1. 检查网络连接
2. 确认 CloudBase 环境 ID 正确
3. 查看浏览器 Console 的错误信息
4. 验证云函数是否正常部署

**UI 显示异常**:
1. 清除浏览器缓存（Ctrl+Shift+R）
2. 检查 CSS 变量是否正确定义
3. 确认主题切换逻辑正常

---

## v7.39.1（历史版本）
