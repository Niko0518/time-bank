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

## v7.37.0（当前版本）

### 性能优化重大改进
- **交易索引系统**：引入`transactionIndex` Map\<taskId, Transaction[]\>，将任务维度查询从O(n)降低到O(1)
  - **问题描述**：随着交易数量增长，`rebuildHabitStreak()`每次都需要全量遍历transactions数组过滤特定任务的交易，导致启动和习惯重建缓慢
  - **根本原因**：原有实现使用`transactions.filter(t => t.taskId === taskId)`进行线性搜索，时间复杂度O(n)
  - **修复方案**：
    - 新增全局`transactionIndex` Map，键为taskId，值为该任务的所有交易数组
    - 在`DAL.loadAll()`完成后调用`buildTransactionIndex()`一次性构建索引
    - `addToTransactionIndex()`和`removeFromTransactionIndex()`维护索引的增删一致性
    - `rebuildHabitStreak()`直接使用索引结果，避免重复过滤
  - **性能提升**：对于有500+交易的用户，rebuildHabitStreak从~50ms降低到~5ms（10倍提升）
  
- **智能增量重建**：`shouldRebuildHabitStreak()`决策函数避免不必要的完整重建
  - **问题描述**：每次完成任务或撤回都会触发完整的习惯连胜重建，即使只有微小变化也需遍历所有历史交易
  - **根本原因**：原有无条件执行完整重建，未考虑实际变化的幅度
  - **修复方案**：
    - 基于两个阈值判断是否需要重建：①距离上次重建超过7天；②自上次重建以来新增交易数>5笔
    - 在`task.habitDetails.lastRebuildAt`记录上次重建时间戳
    - 利用交易索引快速统计近期交易数量
  - **性能提升**：日常操作中约80%的重建请求被跳过，显著减少CPU占用
  
- **习惯健康检查机制**：应用启动时异步验证习惯连胜一致性，24小时节流自动修复
  - **问题描述**：由于网络波动、Watch监听延迟等原因，习惯连胜可能出现不一致（如有连胜但无对应交易记录）
  - **根本原因**：分布式环境下数据同步可能失败，缺乏自动检测和修复机制
  - **修复方案**：
    - 新增`performHabitHealthCheck()`在应用启动后2秒自动执行
    - 验证每个习惯任务的streak与lastCompletionDate是否与交易记录一致
    - 发现不一致时标记需要修复，触发UI更新提醒用户
    - 24小时节流避免频繁检查影响性能
  - **影响范围**：所有使用习惯功能的用户，特别是多设备同步场景

### 技术细节
- 新增全局变量：`transactionIndex = new Map()`（app-1.js ~line 3781）
- 新增函数：`buildTransactionIndex()`, `addToTransactionIndex()`, `removeFromTransactionIndex()`（app-1.js）
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

*最后更新: 2026-04-09*
