# Time Bank - AI 编程指南

> ⚠️ **强制规则**：每次更新请阅读本指令，在更新后，凡是涉及关键技术细节或重要改动时，必须将其添加到本文件的「第二部分：版本更新日志」中。我们的交流语言是中文

---

## 📋 每次更新前复述用户需求

---

# 第一部分：项目概况与技术基础

> 本部分包含项目的整体架构、核心文件、关键配置等基础信息。**每次开始工作前必须阅读理解**。

---

## 1.1 项目概述

Time Bank 是一个 **混合开发 (Hybrid) 的安卓应用**，结合原生 Java 外壳和 WebView 前端界面。

**技术栈**：
- **前端**: 原生 JavaScript (Vanilla JS)，无框架，单文件 ~30,000 行
- **样式**: CSS 变量，支持深色模式 (`prefers-color-scheme`)
- **云端**: 腾讯 CloudBase JS SDK v2.24.10
- **Android**: Java，minSdk 26，targetSdk 34
- **构建**: Gradle 8.x

---

## 1.2 核心文件结构

| 文件 | 用途 | 行数 |
|------|------|------|
| `android_project/app/src/main/assets/www/index.html` | **前端全部代码** (HTML+CSS+JS) | ~30,000 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java` | Android 入口，WebView 初始化 | ~200 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java` | JS 桥接 (`window.Android`) | ~900 行 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/AlarmReceiver.java` | 闹钟广播接收器 | ~100 行 |
| `sw.js` | Service Worker (PWA 缓存) | ~50 行 |

### 文件同步规则
- **主文件**: `android_project/app/src/main/assets/www/index.html`
- **根目录副本**: `index.html` (用于 GitHub Pages 预览)
- ⚠️ **每次修改后必须同步**: 
  ```powershell
  Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
  ```

### index.html 结构概览
```
行 1-1000        : HTML 结构 + CSS 样式
行 1000-4000     : 更多 HTML (各页面模板)
行 4000-4100     : 首页卡片 (余额、屏幕时间、睡眠)
行 4500-5200     : 睡眠设置面板 HTML
行 4730-6000     : 更新日志区域
行 6000-8000     : JavaScript 工具函数
行 8000-10000    : DAL (数据访问层) + CloudBase 逻辑
行 10000-11000   : 任务卡片拖拽排序
行 11000-16000   : 任务管理 + 交易记录
行 16000-19000   : 报告页面 + 时间流图
行 19000-21000   : 睡眠时间管理系统
行 21000-23000   : 屏幕时间管理
行 23000-27000   : 认证登录相关
行 27000-30000   : 其他业务逻辑
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

### 关键代码位置
| 功能 | 搜索关键词 |
|------|-----------|
| DAL 对象 | `const DAL =` |
| SDK 初始化 | `initCloudBase` |
| Watch 实时监听 | `subscribeAll` |
| 数据加载 | `DAL.loadAll` |
| 任务保存 | `DAL.saveTask` |

⚠️ **重要**: `saveData()` 在多表模式下**不保存任务到云端**，只保存 Profile。修改任务数据后需单独调用 `DAL.saveTask(task)` 同步到云端。

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
1. **版本号由用户指定**：用户在对话开始时声明版本号（如"本次更新版本为 v7.11.2"），AI 在整个对话中必须使用该版本号
2. **禁止擅自推送**：AI 不得在没有用户明确指令的情况下执行 `git push`
3. **禁止擅自升级版本号**：即使对话跨越多次修改，版本号保持用户指定的值不变
4. **代码注释版本号**：新增/修改的代码注释应使用用户指定的版本号（如 `// [v7.11.2] 修复...`）
5. **推送后升级**：只有在用户要求推送后，下次对话才能使用新版本号

### 更新版本号（5 个位置）
1. `<title>` 标签（约第 12 行）
2. 关于页 `<p>版本 vX.X.X</p>`（约第 5701 行）
3. `APP_VERSION` 常量（约第 6606 行）
4. 启动日志 `console.log("App vX.X.X...")`（约第 9787 行）
5. `sw.js` 文件头部（2 处）

### 更新 sw.js
```javascript
// Time Bank Service Worker - vX.X.X
const CACHE_NAME = 'timebank-cache-vX.X.X';
```

### 版本日志规则
- ⚠️ **仅在用户明确要求时**才撰写版本日志
- 日志按版本号**降序排列**（最新版本在最上面）
- 所有版本日志位于 `<details>` 区域（标题为「版本更新日志」）
- 更新日志位于约第 5718 行

### 文件同步
```powershell
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
```

---

## 1.6 开发注意事项

### 修改前端代码 (index.html)
- 文件巨大（~30,000 行），**必须先用 grep_search 定位**，再用 read_file 读取上下文
- 使用 `replace_string_in_file` 时提供 **3-5 行上下文**，确保唯一匹配
- 修改后用 `get_errors` 检查语法错误

### 常用搜索关键词
| 功能模块 | 搜索关键词 |
|---------|-----------|
| 云端同步 | `DAL.` / `cloudApp` / `subscribeAll` |
| 任务管理 | `taskList` / `addTask` / `completeTask` |
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
2. 在 `index.html` 调用:
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

---

## 1.7 常见问题排查

### Q: 修改后页面没变化？
1. 清除 WebView 缓存 (Android 设置 → 应用 → 清除数据)
2. 检查是否同步了根目录的 `index.html`
3. Service Worker 可能缓存了旧文件

### Q: 云端数据不同步？
1. 检查登录状态: 搜索 `cloudAuthState`
2. 查看 Watch 监听: 搜索 `subscribeAll`
3. 确认 `_openid` 字段正确

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
> ⚠️ **强制规则**：每次更新涉及关键技术细节或重要改动时，必须将其添加到此部分。

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
- **架构/数据层**：同步机制、存储结构、跨设备一致性、权限/安全规则
- **接口/协议变更**：影响多端或云端数据兼容性的字段/格式变更
- **核心流程重构**：结算逻辑、初始化流程、数据修复工具
- **高风险 Bug 修复**：会导致数据丢失、核心功能不可用的问题

### ❌ 不记录内容
- 纯 UI/样式/间距/文字调整
- 简单数值调整（如数量、间隔、阈值）
- 本周期内引入又修复的内部错误
- 缓存版本号/Service Worker 名称更新

---

## 📝 用户日志指导（HTML 文件中）

**位置**：`index.html` 约第 6424 行，`<details><summary>版本更新日志</summary>` 区域内

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
## v7.15.3 (2026-02-09) - 均衡模式同步与自动检测补录修复

### 关键改动

#### 1) 均衡模式 watch 实时同步修复 [v7.15.3]
**文件**: `index.html` (~L11802)

**问题链**:
```text
Profile watch handler 监听到 doc 变更后 → 更新了 profileData
→ 但从未调用 loadBalanceModeFromCloud(doc)
→ balanceMode 变量保持初始值 {enabled: false}
→ updateAllUI() → updateBalanceModeUI() 读到旧值 → 开关显示为关闭
```

**修复**: Profile watch handler 中新增 `loadBalanceModeFromCloud(doc)` 调用

#### 2) 自动检测补录昨日数据二次检查 [v7.15.3]
**文件**: `index.html` (~L32040)

**问题**:
```text
首次检查昨天时（如早晨开机），UsageStats 数据可能不完整
→ actual ≈ recorded，差值 < 5分钟阈值
→ 标记为 processedDates[taskKey] = {type:'ok'}
→ 永远不会再检查这个日期 → 漏补录
```

**修复**:
```text
- 已有自动检测交易的日期 → 始终跳过（防止重复创建交易）
- 昨天的数据 → 跳过 processedDates 缓存，允许二次检查
- 更早日期 → 保持原有缓存逻辑
```

#### 3) 休眠恢复后重新执行自动结算 [v7.15.3]
**文件**: `index.html` (~L36899)

**问题**: `autoDetectAppUsage()` 仅在 `initApp()` 冷启动时调用一次，前台恢复时不触发
**修复**: `visibilitychange` 检测到长休眠（>1分钟）后延迟 5 秒执行 `autoSettleScreenTime()` + `checkAndSettleInterest()`

#### 4) 日期范围安全上限 [v7.15.3]
**文件**: `index.html` (~L32138)

**问题**: `lastCheckedDate` 过旧时追溯天数无上限
**修复**: 即使 `lastCheckedDate` 很旧，`startDate` 限制不超过 `AUTO_DETECT_MAX_DAYS`(7) 天前

#### 5) 设置页清理与 UI 调整 [v7.15.3]
```text
- 删除设置页累计净收益（HTML + showNetInterestInfo() + updateFinanceSettingsUI 中 netInterest 更新）
- 弹窗利率设置 .finance-rate-box text-align: center → left
- 设置页利率加减号 padding: 4px 10px → 2px 8px, font-size: 0.9rem → 0.85rem
```

---
## v7.15.2 (2026-02-09) - 金融系统稳定性修复与导入提速

### 关键改动

#### 1) settledDates 持久化修复（根因修复）[v7.15.2]
**文件**: `index.html` (~L31188)

**问题链**:
```text
settleDailyInterest() 结算后未调用 saveFinanceSettings()
→ settledDates 仅存内存，重启丢失
→ 每次启动重复结算同一天 → 利息交易翻倍 → 余额严重偏移
（此为 v7.15.0 数据损坏事件的根因）
```

**修复**: 在 `settleDailyInterest()` 保存段首行添加 `saveFinanceSettings()`

#### 2) 金融系统全量云端统一同步 [v7.15.2]
**文件**: `index.html` (~L31046, ~L11816, ~L12099, ~L30981)

**修改内容**:
```text
- applyFinanceSettingsFromCloud → applyFinanceDataFromCloud（重命名+扩展）
  * 同时处理 financeSettings + interestLedger
  * settledDates: 取本地与云端并集 + 60天裁剪
  * interestLedger: 按日期合并（已结算优先、时间戳新者优先）
  * 云端加载时仅存本地不回写，避免 watch 循环
- saveInterestLedger() 新增 skipCloudSync 参数，默认同步到云端 profile
- Profile watch handler: 监听 financeSettings + interestLedger 变更
- DAL.loadAll(): 初始加载时调用 applyFinanceDataFromCloud(profile)
```

#### 3) recalculateInterestOnUndo 重写 [v7.15.2]
**文件**: `index.html` (~L16129)

**问题**:
```text
旧版用 currentBalance 反推各日余额 → 两个 Bug:
1. currentBalance 此时仍含被撤回交易金额（基数错误）
2. 包含利息交易参与余额计算（循环依赖）
```

**修复**: 完全重写为正向累积法：
```text
1. 过滤掉利息/利息调整交易和被撤回交易
2. 按日期分组，累积计算各日结束余额
3. 对受影响日期重算利息，与实际利息交易对比
4. 生成差额调整交易
```

#### 4) settleDailyInterest 余额回退修复 [v7.15.2]
**文件**: `index.html` (~L31131)

**问题**: 无 interestLedger 记录时回退到 `currentBalance`（今天值，非昨天值）
**修复**: 从交易记录正向累加到昨日（排除利息交易避免循环，再加上已有利息交易）

#### 5) recalculateFinanceStatsFromTransactions 重写 [v7.15.2]
**文件**: `index.html` (~L30998)

**问题**: 仅统计今日利息交易 → 累计统计永远只有当天数据
**修复**: 遍历全部 transactions，累计所有 interest/interest-adjust，interestDays 用 Set 去重

#### 6) 结算安全防护 [v7.15.2]
**文件**: `index.html` (~L31241)

**修改**: `checkAndSettleInterest()` 新增 `hasCompletedFirstCloudSync` 检查，已登录但云端未就绪时跳过结算

#### 7) 导入速度优化 [v7.15.2]
**文件**: `index.html` (~L10656, ~L10511)

**修改**:
```text
- clearAllData(): 自定义规则表改用 where().remove() 批量删除（~2次API替代500+次）
  * 预置规则表并发从20提升到50
  * 内置降级方案：批量删除失败自动回退逐条删除
- importFromBackup: 交易导入 BATCH_SIZE 从 50 提升到 100
- 预计导入时间从 ~3分钟降到 30-60秒
```

#### 8) 代码清理 [v7.15.2]
```text
- 删除废弃 showFinanceDetailModal()（~120行），已被 CombinedModal 替代
- 删除 financeStats 未使用字段 maxBalance/minBalance
- 新增 interest-adjust 交易显示解析分支
- settledDates 60天自动裁剪（init + 云端合并时执行）
```

---
## v7.15.0 (2026-02-07) - 时间金融系统

### 关键改动

#### 1) 时间金融系统 [v7.15.0]
**文件**: `index.html` (~L29470, ~L6110)

**修改内容**:
```text
- 新增金融系统设置：存款利率/贷款利率调节（并排紧凑布局）
- 每日自动结算利息（默认 04:00），交易时间设为昨日 23:59
- settledDates 已结算标记，防止重复结算
- 开启系统时自动标记历史日期为已结算，防止历史结算
- 利息统计仅从今日起算，不追溯历史
```

#### 2) 新余额卡片设计 [v7.15.0]
**文件**: `index.html` (~L268, ~L5310)

**修改内容**:
```text
- 金融系统开启时使用新卡片（双方案切换）
- Header 始终显示余额，展开显示今日统计/预计利息
- 支持滑动手势展开/收起
- 与屏幕时间/睡眠卡片协调的堆叠效果
- 新增"首页显示新卡片"独立开关
```

#### 3) 利息交易解析 [v7.15.0]
**文件**: `index.html` (~L20296)

**修改内容**:
```text
- 新增利息交易特殊解析逻辑
- 标题：💰 存款利息 / 💸 贷款利息（纯净无后缀）
- 详情：-42小时58分 × 1% 格式
- 归入系统分类，统一视觉处理
```

#### 4) 余额详情弹窗 [v7.15.0]
**文件**: `index.html` (~L8225, ~L16098)

**修改内容**:
```text
- 7日余额趋势图（迷你柱状图）
- 利息统计（累计存款/贷款/净收益）
- 昨日详情（余额/利息）
- 本周汇总（获得/消费/净值）
```

#### 5) 撤回利息重算 [v7.15.0]
**文件**: `index.html` (~L16090, ~L18668)

**修改内容**:
```text
- 7日内撤回任务自动重算受影响日期的利息
- >7日撤回跳过重算
- 生成利息调整交易记录
- 余额自动校正
```

#### 6) 数据修复工具增强 [v7.15.0]
**文件**: `index.html` (~L30820)

**修改内容**:
```text
- 新增资产负债审计：计算 Sum(Transactions) 与 currentBalance 的偏差
- 修复重复利息：删除同一日期多条利息记录，保留最新
- 余额校正：自动创建校正交易，确保账目平衡
- 审计报告：显示偏差金额和修复详情
```

---
## v7.14.1 (2026-02-07) - Tab 指示器动画与通透模式优化

### 关键改动

#### 1) Tab 指示器滑动动画 [v7.14.1]
**文件**: `index.html` (~L7600, ~L800)

**修改内容**:
```text
- 底部导航新增 .tab-indicator 元素
- 使用 transform: translateX() 实现平滑滑动
- Tab 切换时指示条跟随移动（300ms 缓动）
- 通透模式下指示条为白色带光晕效果
```

#### 2) Tab 按钮图标动画 [v7.14.1]
**文件**: `index.html` (~L1640)

**修改内容**:
```text
- 活跃 Tab 图标放大 1.15 倍
- 200ms ease 过渡效果
- 仅使用 transform: scale()，不影响性能
```

#### 3) 桌面小组件权限管理 [v7.14.1]
**文件**: `WebAppInterface.java`, `index.html`

**修改内容**:
```text
- 新增 canAddWidget() 方法检测系统支持情况
- 权限管理新增「桌面小组件」项
- 不支持一键添加时显示引导弹窗
- 小组件选择器移除底部按钮，点击遮罩关闭
```

#### 4) 通透模式可读性修复 [v7.14.1]
**文件**: `index.html`

**修复内容**:
```text
- #permissionGrantedSection summary 文字颜色优化
- .about-section 著作权信息颜色统一
- .demo-task-tag 示例任务标签样式
- .demo-task-icon 示例任务图标样式
- .setting-name .info-button 设置项说明按钮
- .text-positive/.text-negative/.text-neutral 颜色增强
- .empty-message 空状态提示文字
```

---
## v7.14.0 (2026-02-05) - 悬浮窗智能点击修复

### 关键改动

#### 1) 悬浮窗智能点击暂停功能修复（关键修复）
**问题**: 某些 Android 12+ / 16 设备上"在关联应用内 → 暂停计时 + 返回 Time Bank"功能中的暂停功能失效

**根因分析**:
- `getRunningAppProcesses()` 在 Android 10+ 上受限，返回信息不完整
- `process.importance` 判断过于严格，某些设备上前台应用可能是 `IMPORTANCE_FOREGROUND_SERVICE`
- 缺少调试日志，无法定位问题

**修复方案**:
```text
- 新增 UsageStatsManager 作为备选检测方案（Android 5.0+）
- 放宽进程重要性判断：接受 FOREGROUND 或 FOREGROUND_SERVICE
- 新增 getTopAppPackageViaUsageStats() 方法通过使用统计查询前台应用
- 新增详细调试日志（DEBUG_LOG 开关，TAG="FloatingTimer"）
- isAppInForeground() 同步增强，使用相同的双重验证机制
```

**Logcat 调试**:
```
# 筛选关键词
package:com.jianglicheng.timebank tag:FloatingTimer

# 调试步骤
1. 开启悬浮窗计时器并关联应用
2. 打开关联应用，点击悬浮窗

#### 2) 屏幕时间小组件 UI 优化
**文件**: `ScreenTimeWidgetProvider.java`, `widget_screen_time_classic.xml`, `widget_screen_time_classic_info.xml`

**修改内容**:
```text
- 尺寸调整：2×2 → 2×1（与时间余额小组件一致）
- 布局重构：水平排列，左侧标题+百分比，右侧使用量/限额
- 圆角统一：20dp（与时间余额小组件一致）
- 背景样式：纯色 → 渐变色（与首页屏幕时间卡片一致）
  * ≤33%: 绿色渐变 (#27ae60 → #1abc9c)
  * 34%-66%: 蓝色渐变 (#3498db → #9b59b6)
  * 67%-100%: 橙色渐变 (#f39c12 → #e74c3c)
  * >100%: 红色渐变 (#e74c3c → #8e44ad)
- 移除进度条（2×1 尺寸限制）
- 新增渐变背景 drawable：widget_screen_time_green/blue/orange/red.xml
```

**删除文件**:
- `widget_screen_time_classic_bg.xml`（被新的渐变背景替换）

#### 3) 时间余额小组件渐变色方案 [v7.14.0]
**文件**: `BalanceWidgetProvider.java`, `widget_balance_*.xml`

**功能**: 根据余额区间自动切换渐变背景颜色（与屏幕时间小组件配色一致）

**区间配色**:
```text
>24小时:  蓝色渐变 (#3498db → #9b59b6)   - 余额充足
0~24h:    绿色渐变 (#27ae60 → #1abc9c)   - 理想区间 ⭐
-24~0h:   橙色渐变 (#f39c12 → #e74c3c)   - 余额偏少
<-24h:    红色渐变 (#e74c3c → #8e44ad)   - 余额不足
```

**修改内容**:
- BalanceWidgetProvider: 简化区间逻辑为 4 档（绿/蓝/橙/红）
- 文字颜色: 统一白色（在渐变背景上更清晰）

**背景文件**:
- widget_balance_green.xml (#27ae60 → #1abc9c)
- widget_balance_blue.xml (#3498db → #9b59b6)
- widget_balance_orange.xml (#f39c12 → #e74c3c)
- widget_balance_red.xml (#e74c3c → #8e44ad)

**删除文件**:
- widget_balance_purple.xml / yellow.xml（区间合并后不再使用）
- widget_balance_bg.xml（旧背景）
- 极简和详情小组件相关文件
```

#### 4) 小组件通透模式三种方案 [v7.14.0]
**文件**: `BalanceWidgetGlass/System/TransparentProvider.java`, `ScreenTimeWidgetGlass/System/TransparentProvider.java`

**三种方案对比**:
```text
方案一：毛玻璃文字渐变
- 背景: 自然半透明灰色 (#40f5f5f5) + 白色边框（不泛白）
- 标签: **深灰色** (#333333, alpha=0.95)
- 数字: **动态渐变 Bitmap**（随数据变色）

方案二：系统透明
- 背景: 较浅透明 (#60ffffff)
- 标签: **深灰色** (#333333)
- 数字: **动态渐变 Bitmap**（新增渐变效果）

方案三：高透明渐变
- 背景: 25% 透明度渐变色 + 白色边框
- 标签: **深灰色** (#333333)
- 数字: **动态渐变 Bitmap**（新增渐变效果）

**渐变实现**: 所有通透模式小组件使用 Canvas.drawText() + LinearGradient 绘制渐变文字

方案二：系统透明
- 背景: 较浅透明 (#60ffffff)
- 文字: 深灰色 (#2c3e50)
- 特点: 依赖系统 launcher 模糊处理，效果因手机而异

方案三：高透明渐变
- 背景: 25% 透明度渐变色 + 白色边框
- 文字: 深灰色 (#2c3e50)
- 特点: 随余额/屏幕时间比例变色，兼顾通透感和功能性
```

**新增 Provider** (6个):
- 时间余额: BalanceWidgetGlassProvider / SystemProvider / TransparentProvider
- 屏幕时间: ScreenTimeWidgetGlassProvider / SystemProvider / TransparentProvider

**新增布局** (6个):
- widget_balance_glass.xml / system.xml / transparent.xml
- widget_screen_time_glass.xml / system.xml / transparent.xml

**新增背景** (6个):
- widget_glass_bg.xml / widget_system_bg.xml
- widget_transparent_green.xml / blue.xml / orange.xml / red.xml

**新增配置** (6个):
- widget_balance_glass_info.xml / system_info.xml / transparent_info.xml
- widget_screen_time_glass_info.xml / system_info.xml / transparent_info.xml

**修改文件**:
- AndroidManifest.xml: 注册 6 个新的小组件
- strings.xml: 添加 6 个描述字符串
- WebAppInterface.updateWidgets(): 同步更新所有 8 种小组件
```

#### 4) 桌面小组件添加引导 [v7.14.0]
**文件**: `index.html`, `WebAppInterface.java`

**功能**: 在设置页外观设置中新增「桌面小组件」入口，点击弹出小组件选择器

**弹窗内容**:
```text
- 2×2 网格展示 8 种小组件预览图
- 左列：屏幕时间系列（渐变、毛玻璃、系统透明、高透明渐变）
- 右列：时间余额系列（渐变、毛玻璃、系统透明、高透明渐变）
- 每个预览图模拟真实样式和配色
- 点击小组件显示添加引导提示
```

**技术实现**:
```text
- Android 8.0+ (API 26+) 支持 requestPinAppWidget() 方法
- 调用后会弹出系统级对话框，用户点击确认即可添加
- 低版本或不支持的设备，显示手动添加引导
- 前端调用：Android.addWidgetToHomeScreen(widgetType)
- 原生处理：根据类型获取对应 Provider，调用系统 API
```

**新增代码**:
- openWidgetSelector() / closeWidgetSelector()
- addWidgetToHomeScreen() - 调用原生方法
- showWidgetGuide() - 显示添加方法引导
- WebAppInterface.addWidgetToHomeScreen() - 原生实现
```

---
## v7.13.0 (2026-02-04) - 悬浮窗计时器交互增强

### 关键改动

#### 1) 悬浮窗点击行为智能判断
**文件**: `FloatingTimerService.java`, `WebAppInterface.java`, `index.html`
```text
- TimerInfo 新增 appPackage 字段存储关联应用包名
- 新增 isAppInForeground()：判断 Time Bank 是否在前台
- 新增 handleFloatingTimerClick()：智能判断点击行为
  * 如果 Time Bank 在前台：恢复计时（如果暂停）+ 跳转关联应用
  * 如果 Time Bank 在后台：打开 Time Bank 主界面（原有逻辑）
- WebAppInterface.startFloatingTimer() 新增 appPackage 参数
- 前端启动悬浮窗时传入 task.appPackage
```

#### 2) 悬浮窗计时器说明按钮
**文件**: `index.html`
```text
- 设置页「悬浮窗计时器」开关标题旁新增说明按钮（?）
- 任务编辑页「悬浮窗计时器」开关标题旁新增说明按钮（?）
- 新增悬浮窗计时器说明弹窗，包含功能介绍和使用提示
- 新增弹窗通透模式样式支持
- 新增 showFloatingTimerInfoModal() / hideFloatingTimerInfoModal() 函数
```

#### 3) 「全部任务」边上按钮颜色修复
**文件**: `index.html`
```text
- view-switch-btn 颜色从 --text-color-light 改为 --section-title-color
- section-title-group 内的 info-button 颜色改为 --section-title-color
- 确保按钮颜色与标题颜色一致，便于统一管理
```

#### 4) 设置页「关于」改为可折叠
**文件**: `index.html`
```text
- 将关于部分改为 details/summary 可折叠结构
- summary 样式与「版本更新日志」统一（移除自定义样式）
- 重新排版著作权信息：
  * 使用 flex 布局左右对齐显示（标签: 值）
  * 软件名称右侧显示，限制最大宽度避免换行
  * 使用 CSS 变量适配深色/浅色主题
  * 版权所有简化为"姜力成"，邮箱单独一行
  * 底部版权信息改为单行紧凑显示
- 优化移动端显示效果，减少不必要的换行
```

#### 5) Android 状态栏高度适配
**文件**: `WebAppInterface.java`, `index.html`
```text
- WebAppInterface 新增 getStatusBarHeight() 方法
- index.html 新增 --status-bar-height CSS 变量
- index.html 新增 setAndroidStatusBarHeight() JS 函数
- .header padding 增加 var(--status-bar-height) 变量
```

#### 6) 桌面端任务卡片拖拽重新设计
**文件**: `index.html`
```text
- 移除 HTML5 drag API 实现（兼容性问题）
- 新增桌面端专用拖拽方案：
  * 鼠标左键按下 → 移动超过10px开始拖动 → 鼠标释放完成交换
  * 支持鼠标和触控板操作
  * 拖动时卡片跟随鼠标移动
  * 其他卡片平滑过渡到新位置
  * 释放后保存排序并同步云端
- 新增函数：handleDesktopTaskDragStart/Move/End, updateDesktopCardPositions
```

#### 7) 网页端休眠恢复后数据同步修复（关键修复）
**文件**: `index.html`
```text
问题：网页端长时间休眠后，watch连接断开，无法及时获取安卓端更新
      导致"任务持续计时"、"缺失新记录"、"监听失效"

修复措施：
- triggerSync() 新增 runningTasks 冲突检测 (checkRunningTasksConflict)
  * 检测本地有但云端没有的任务（其他设备已关闭）
  * 检测云端有但本地没有的任务（其他设备新启动）
  * 向用户显示冲突提示
  
- checkAndRebuildWatchers() 增强：
  * 新增 forceRebuild 参数
  * 休眠恢复后强制重建所有 watch 连接
  * 重建成功后重置 isRecoveringFromHibernate 标志
  
- visibilitychange/focus 事件处理：
  * 长时间休眠后强制重建 watch（带500ms延迟确保数据已加载）
  * 短时间休眠只检查失效连接
  
- WebAppInterface.java 新增：
  * getStatusBarHeight() 方法（配合顶部状态栏适配）
```

#### 8) 睡眠条形图显示错误修复（下午入睡显示异常）
**文件**: `index.html` (~L27154)
```text
问题：下午入睡（13:22）但计划时间是晚上（22:30），条形图显示异常
      - 入睡时间百分比计算超过100%，显示在最右侧外
      - 条形图宽度极窄（只有一点点阴影）
      - 奖励显示错误（-0.2）

原因：timeToPercent() 函数把下午1点当成"次日下午1点"计算，
      导致相对小时数超出坐标轴范围

修复：
- timeToPercent() 新增 isWakeTime 参数
- 对于入睡时间：如果在轴范围之后（如13:22，轴从21:30开始），
  说明是前一天的下午，减去24小时
- 对于起床时间：如果在轴范围之前（如01:05），加上24小时
- 正确计算相对位置百分比
```

#### 9) 睡眠时区问题修复（关键修复）
**文件**: `index.html`
```text
问题：用户实际入睡时间21:22，但记录显示为13:22（差8小时）
      疑似Android WebView中Date.now()时区处理不一致

根本原因分析：
- Date.now()应返回UTC时间戳（标准行为）
- 但某些Android WebView可能返回本地时间戳
- 导致北京时间21:22被记录为UTC 13:22（北京时间）

修复措施（保持UTC标准，确保一致性）：
1. 新增getCurrentUTCTimestamp()函数
   - 使用Date.UTC()显式生成UTC时间戳
   - 避免依赖WebView的Date.now()实现

2. startSleepRecording()中使用getCurrentUTCTimestamp()
   替代Date.now()记录入睡时间

3. 手动睡眠补录中显式添加秒(:00)
   - new Date(`${date}T${time}:00`)确保本地时间正确解析

评估：保持UTC时间戳方案（不改为北京时间生成）
- 符合国际标准
- 跨时区兼容性好
- 数据存储统一
```

#### 10) 睡眠报告弹窗修复与优化（v7.13.0）
**文件**: `index.html` (~L26320)
```text
问题：
1. 昨天、前天等日期的条形图点击无反应
2. 需要增加星期显示
3. 计划时间显示格式需要精简

修复方案（最小化修改）：
1. showSleepReportModal() 添加防御性检查：
   if (!record || !record.sleepStartTime || !record.wakeTime) return;
   - 解决 getSleepRecordForDate 返回 null 时崩溃问题

2. 日期格式（避免双层括号）：
   - 今日周一（不是"今日（周一）"）
   - 昨日周日
   - 2月3日周一

3. 计划时间格式精简：
   原：计划入睡 22:30 · 计划起床 06:30 · 目标 8小时
   新：计划时间 22:30~06:30 · 8小时0分
```

#### 11) 睡眠时区严重 Bug 修复（v7.13.1）【关键修复】
**文件**: `index.html` (~L26599)
```text
问题（严重）：
- 用户北京时间 00:05 入睡，被错误记录为 08:05
- 导致睡眠时间显示和计算完全错误

根因分析：
- getCurrentUTCTimestamp() 实现错误
- 使用 new Date() 获取本地时间组件
- 用 Date.UTC() 把本地小时当成 UTC 小时构造时间戳
- 结果：北京时间 00:05 → 错误地生成 UTC 00:05 时间戳

修复：
- 直接返回 Date.now()，它本身就是 UTC 时间戳
- 删除错误的 Date.UTC() 构造逻辑

教训：
- Date.UTC(year, month, day, hours...) 会把参数当成 UTC 时间
- 如果用本地时间组件调用 Date.UTC()，会产生时区偏移错误
- Date.now() 或 new Date().getTime() 本身就是 UTC 时间戳
```

---
## v7.11.4 (2026-02-03) - 无关键改动

### 关键改动
（仅 UI 间距与缓存版本更新，不记录为关键改动）

## v7.11.3 (2026-02-03) - 睡眠同步机制

### 关键改动

#### 1) 睡眠设置/状态改为云端共享 + 实时监听
**文件**: `index.html` (~L24880, ~L10880)
```text
deviceSleepSettings/deviceSleepState → sleepSettingsShared/sleepStateShared
Profile watch 增加 applySleepSettingsFromCloud/applySleepStateFromCloud
```

#### 2) 睡眠设置共享为唯一真相（强制应用云端）
**文件**: `index.html` (~L25080, ~L10890)
```text
applySleepSettingsFromCloud 增加 force；shared/watch 强制覆盖本地
```

## v7.11.2 (2026-02-02) - 设置重启后丢失问题（三层问题修复）

### 问题链（重要经验）
```
问题1: WebView localStorage 不可靠
    ↓ 修复后发现
问题2: initApp() 中 updateNotificationSettingsUI() 崩溃，阻断后续 init 函数
    ↓ 修复后发现  
问题3: 分类标签存储位置分离，initScreenTimeSettings 未从 profile.screenTimeCategories 恢复
```

### 调试经验
1. **WebView console.log 被系统过滤** → 需用原生方法打日志才能看到真相
2. **错误会传播阻断** → 一个早期错误会中断后续所有初始化，必须用 try-catch 隔离
3. **架构复杂性** → 同一功能的数据可能分散在多个位置存储

### 关键修复

#### 1. Android 原生存储（解决 localStorage 不可靠）
**文件**: `WebAppInterface.java`
```java
// 新增方法
@JavascriptInterface
public void saveScreenTimeSettingsNative(String json) {
    prefs.edit().putString("screenTimeSettings", json).apply();
}
@JavascriptInterface
public String getScreenTimeSettingsNative() {
    return prefs.getString("screenTimeSettings", null);
}
// 同理: saveSleepSettingsNative, getSleepSettingsNative, saveSleepStateNative, getSleepStateNative
// 调试用: nativeLog(String tag, String message)
```

#### 2. 防止 initApp 中断（try-catch 隔离）
**文件**: `index.html` (~L11638)
```javascript
// 修改前
updateNotificationSettingsUI();
initScreenTimeSettings();
initSleepSettings();

// 修改后
try { updateNotificationSettingsUI(); } catch (e) { console.error(e); }
try { initScreenTimeSettings(); } catch (e) { console.error(e); }
try { initSleepSettings(); } catch (e) { console.error(e); }
```

#### 3. 分类标签从云端恢复
**文件**: `index.html`

**存储架构**（导致问题的根因）:
```
deviceScreenTimeSettings[deviceId]  → enabled, dailyLimit 等（设备专属）
profile.screenTimeCategories        → earnCategory, spendCategory（跨设备共享）
```

**修复**: 在 `initScreenTimeSettings()` 中添加 (~L27305):
```javascript
// [v7.11.2] 从云端恢复分类标签
if (isLoggedIn() && DAL.profileData?.screenTimeCategories) {
    const categories = DAL.profileData.screenTimeCategories;
    if (categories.earnCategory !== undefined) {
        screenTimeSettings.earnCategory = categories.earnCategory;
    }
    if (categories.spendCategory !== undefined) {
        screenTimeSettings.spendCategory = categories.spendCategory;
    }
}
```

**修复**: 在 `updateScreenTimeCategories()` 中添加原生存储 (~L27791):
```javascript
// 修改分类后同步到原生存储
if (window.Android?.saveScreenTimeSettingsNative) {
    window.Android.saveScreenTimeSettingsNative(JSON.stringify(screenTimeSettings));
}
```

#### 4. 设备迁移恢复
```javascript
function getLatestDeviceSettings(deviceSettingsMap) {
    // 遍历所有设备配置，返回 lastUpdated 最新的
    // 用于重装后 deviceId 改变时恢复设置
}
```

---
## v7.11.1 (2026-02-02) - 跨设备同步与恢复

### 关键改动
**文件**: `index.html`

- 均衡模式：改为云端唯一真相，忽略本地缓存
- 自动检测补录：改为多设备原始记录（`autoDetectRawRecords`）+ 汇总生成最终补录/修正交易
- 自动检测处理日期：云端全局记录（`autoDetectProcessedDates`），避免重复结算
- 网页端长时间休眠恢复：登录态待恢复时跳过本地缓存并等待云端，防止旧数据覆盖
- 网页端恢复超时兜底：强制刷新登录状态并重拉云端数据

## v7.11.0 (2026-02-01) - 无关键改动

### 关键改动
（引导定位与交互优化为 UI/体验层调整，不记录为关键改动）

## v7.10.1 (2026-01-31) - 无关键改动

### 关键改动
（新手引导定位与交互优化为 UI/体验层调整，不记录为关键改动）

#### 5. 修复消费任务戒除设置显示
- `ensureOnboardingHabitEnabled()` 现在会调用 `updateTaskTypeUI()` 确保戒除设置区域正确显示

#### 6. 引导结束清理
- `finishTaskOnboarding()` 关闭所有打开的弹窗和菜单，重置状态

#### 7. 引导菜单编辑流程修复
**文件**: `index.html`
- 恢复任务引导步骤结构（补回 `pick-earn-task`），移除“点击菜单”步骤，仅保留“进入编辑”。
- 新增 `openOnboardingMenuEdit(taskId)`：打开菜单并为“编辑”项绑定兜底点击，确保进入编辑弹窗。
- 消费类任务引导切换时关闭上一任务编辑弹窗，避免阻断后续引导。

#### 8. 引导编辑弹窗滚动重置
**文件**: `index.html`
- `openOnboardingEditTask()` 在引导期间打开编辑弹窗后重置滚动到顶部，避免停留在底部导致定位失败。

#### 9. 消费引导定位修复
**文件**: `index.html`
- “进入戒除配置”步骤目标改为 `#habitToggleContainer` 并滚动定位，避免错误指向任务类型。

#### 10. 消费引导保存按钮定位
**文件**: `index.html`
- “保存为我的任务”步骤改用 `getVisibleElement('#submitBtn')` 并滚动定位，避免按钮不可见导致卡住。

#### 11. 消费戒除步骤等待时间
**文件**: `index.html`
- 为消费戒除相关步骤增加 `waitTime`，确保习惯戒除 UI 切换完成后再定位引导。

### 技术要点
- **滚动容器识别**: 弹窗内元素使用 `.modal-content` 滚动，主页面使用 `#appScrollContainer`
- **滚动回调**: 监听 `scroll` 事件结束（80ms 无滚动）后触发回调
- **双重 rAF**: 使用两次 `requestAnimationFrame` 确保浏览器完成布局计算
- **菜单锁定**: `onboardingMenuLocked` 标志防止点击/滚动关闭菜单

---

## v7.10.0 (2026-01-31) - 首次启动示例导入弹窗

### 关键改动
**文件**: `index.html`
- 首次启动时弹出示例数据引导弹窗，展示两条示例任务并引导导入。
- 新增 `tb_first_launch_demo_shown`/`tb_onboarding_pending` 标记，避免重复弹窗并为后续导览留钩子。
- 新增创建任务新手引导（FAB → 任务类型 → 类型选项）与导览定位优化，包含 `tb_task_onboarding_pending`/`tb_task_onboarding_done` 状态。
- 任务类型选择后新增细分引导（按次/计时/达标/消费），覆盖习惯系统、悬浮窗与戒除习惯说明；导览定位适配 `visualViewport` 并支持滚动时重定位。
- 创建任务引导改为“优秀任务示例”的编辑式引导（从 FAB 直达示例编辑页），展示习惯系统、悬浮窗、戒除挑战与关联应用等高级能力。
- 创建任务引导改为在任务列表选择合适任务，通过“菜单→编辑”进入编辑页继续引导，覆盖倍率、悬浮窗、习惯与戒除配置，并对下方步骤进行按需滚动定位。
- 创建任务引导优先选取开启习惯的任务，并在菜单保持展开时聚焦“编辑”按钮；仅在元素不在视口时才自动滚动。

---

## v7.9.13 (2026-01-31) - 均衡模式限制移除与每日详情说明优化

### 关键改动
**文件**: `index.html`
- 移除均衡模式 180 天锁定限制，允许随时开启/关闭，并删除相关提示与倒计时文案。
- 每日详情标题的“？”说明按钮样式与其他区域保持一致（通透模式下统一样式）。
- 每日详情说明弹窗改为列表式排版，结构与其他说明弹窗一致。

---

## v7.9.12 (2026-01-31) - 版本号与缓存更新

### 关键改动
**文件**: `index.html`, `sw.js`
- 版本号升级到 `v7.9.12`。
- Service Worker 缓存名更新为 `timebank-cache-v7.9.12`。

---

## v7.9.11 (2026-01-31) - 通透模式可读性修复

### 问题背景
睡眠报告与每日详情说明按钮在通透模式下对比度不足，导致文字与按钮可读性差。

### 解决方案
1. 提升睡眠报告弹窗的文字对比与明细区域背景，确保通透模式下清晰可读。
2. 强化每日详情弹窗“？”说明按钮在通透模式下的边框与背景对比度。

### 关键改动

#### 1. 睡眠报告通透模式样式增强
**文件**: `index.html`
- 为 `#sleepReportModal` 的 `text-muted` 文本提升亮度与阴影。
- 为 `.sleep-report-details` 增加半透明背景、边框与内边距，增强可读性。

#### 2. 每日详情说明按钮通透模式可读性
**文件**: `index.html`
- 为 `#dayDetailModal .info-button` 设置更高对比的边框、文字与背景色。

#### 3. 版本号与缓存更新
**文件**: `index.html`, `sw.js`
- 版本号升级到 `v7.9.11` 并更新 Service Worker 缓存名。

#### 4. 网页端登录恢复防护
**文件**: `index.html`
- 启动时以 `DAL.getCurrentUid()` 判定登录，避免仅凭缓存导致误判未登录。
- 网页端登录状态待恢复时，延迟加载本地缓存，并轮询等待 UID 就绪后再加载云端数据。
- `loadData()` 在检测到登录态或待恢复登录态时跳过本地缓存，避免旧数据覆盖云端。

---

## v7.9.10 (2026-01-30) - 补录连胜跨设备同步修复

### 问题背景
补录触发 `rebuildHabitStreak()` 后，连胜与补发奖励仅更新本地任务/交易，云端未同步，导致其他设备上连胜异常中断。

### 解决方案
1. 重建连胜后同步任务与交易到云端，确保跨设备一致。
2. 新增交易更新能力，用于补录重建时修正 `isStreakAdvancement` 与奖励金额。

### 关键改动

#### 1. 连胜重建后云同步
**文件**: `index.html`
- `rebuildHabitStreak()` 记录变更前快照，计算变更的交易列表。
- 新增 `syncHabitRebuildToCloud()`：同步更新后的任务与交易到 CloudBase。

#### 2. 云端交易更新接口
**文件**: `index.html`
- 新增 `DAL.updateTransaction(tx, prevTx)`：更新交易字段，并根据变更调整日汇总与缓存余额。

#### 3. 手动补录显示格式统一
**文件**: `index.html`
- `parseTransactionDescription()`：手动补录记录按正常完成格式解析，仅保留📅图标。
- 补录含习惯奖励且均衡模式时，基础奖励不再被误判为 0 秒。
- 手动补录标题强制纯净，仅展示任务名；时间/倍率/均衡信息全部进入详情行。
- 兼容全角括号与“均衡模式”后缀，避免标题残留与计时详情丢失。
- 手动补录计时类在描述解析失败时回退重建“时长 × 任务倍率 (+均衡倍率)”。
- 兼容“补录：”全角冒号与 isBackdate 标记，确保手动补录解析必走统一格式。

#### 4. 每日详情图例说明按钮
**文件**: `index.html`
- 新增 `showDayDetailLegend()` 并在每日详情标题右侧添加说明按钮，解释图标含义与彩色倍率/奖励标识。

#### 5. 睡眠记录展示统一与自动结算描述补齐
**文件**: `index.html`
- 自动睡眠结算交易补齐 `description` 字段（`😴 夜间睡眠: <time>`）。
- 无 description 的睡眠记录在解析时统一标题为“夜间睡眠时间”，并使用😴图标。

#### 6. 说明弹窗颜色示例修复
**文件**: `index.html`
- `.multiplier-good/.multiplier-bad/.bonus-target/.bonus-habit` 颜色样式改为全局类，确保说明弹窗正确着色。

#### 7. 版本号更新与缓存更新
**文件**: `index.html`, `sw.js`
- 版本号升级到 `v7.9.10` 并更新 Service Worker 缓存名。

---

## v7.9.9 (2026-01-29) - 未登录体验与示例数据清理

### 问题背景
未登录状态下任务无法稳定创建/删除；新用户试用阶段缺乏可见的完整示例数据；登录后示例数据与用户自建数据混杂。

### 解决方案
1. 新用户未登录时自动加载示例数据，完整展示“最近任务/全部任务”。
2. 登录成功后无提示清理示例数据（仅删除 demo_ 任务与交易），保留用户自建数据。
3. 登录后若云端无数据，自动使用本地数据作为初始同步源；无本地数据则创建空 Profile。

### 关键改动

#### 1. 登录判定更严格
**文件**: `index.html`
- `isLoggedIn()` 现在要求存在有效 `uid`，避免“伪登录”状态阻断本地保存。

#### 2. 示例数据逻辑重构
**文件**: `index.html`
- `checkAndBootstrap()`：保持空白状态，仅显示“示例数据导入”CTA。
- 新增 `cleanupDemoDataLocal()` / `cleanupDemoDataOnLogin()`：静默清理 demo 数据并重算余额。
- `maybeCleanupDemoDataOnFirstUse()` 改为无提示（避免弹窗干扰）。
- `initDemoData()`：清空折叠状态并重算余额，确保示例任务可见且余额可变更；示例余额目标调为 2 小时 30 分。
- `initDemoData()`：余额补差改为循环修正，确保大偏差也能收敛到目标值。

#### 5. 未登录示例模式的“全部任务/余额不更新”修复
**文件**: `index.html`
- 补充全局 `profileData` 默认值，避免未登录场景下 `updateCategoryTasks()` 读取未声明变量而中断后续 UI 更新（导致“全部任务为空、余额不变”）。

#### 6. Android 三键导航栏避让
**文件**: `index.html`, `MainActivity.java`, `WebAppInterface.java`
- 新增 `--android-nav-bottom` 变量并将底部栏/滚动容器 padding 与系统导航栏高度相加。
- 通过 `WindowInsets` 监听导航栏高度变化并回传 JS 调整。
- 提供 `getNavigationBarHeight()` 兜底接口。

#### 3. 登录后数据初始化流程统一
**文件**: `index.html`
- 新增 `handlePostLoginDataInit()`：统一处理登录后数据加载、示例清理与本地→云端引导同步。

#### 4. 云端首次同步未完成时仍允许本地保存
**文件**: `index.html`
- `saveData()` 在 `hasCompletedFirstCloudSync=false` 时保留本地缓存，避免离线状态任务操作丢失。

---

## v7.9.4 (2026-01-26) - 自动重新登录功能

### 问题背景
用户手机每天晚上自动关机、清晨自动开机后，登录状态会丢失，需要手动重新输入邮箱和密码登录。

### 解决方案
实现自动重新登录功能：登录成功后保存凭据，设备重启后自动使用保存的凭据重新登录。

### 关键改动

#### 1. CloudBase SDK 持久化配置
**文件**: `index.html` (initCloudBase 函数，约 L8644)
```javascript
app = sdk.init({
    env: TCB_ENV_ID,
    region: 'ap-shanghai',
    persistence: 'local'   // [v7.9.4] 持久化到 localStorage
});
```

#### 2. Android 端凭据存储
**文件**: `WebAppInterface.java` (新增方法)
- `saveLoginCredentials(email, password)` - 保存邮箱和 Base64 编码的密码
- `getSavedLoginPassword()` - 读取解码后的密码
- `isAutoLoginEnabled()` - 检查是否启用自动登录
- `clearLoginCredentials()` - 清除保存的密码
- `setAutoLoginEnabled(enabled)` - 设置自动登录开关

#### 3. 自动重新登录逻辑
**文件**: `index.html` (新增 tryAutoReLogin 函数，约 L8700)
```javascript
async function tryAutoReLogin() {
    // 从 Android SharedPreferences 或 localStorage 获取保存的凭据
    // 如果有凭据且启用自动登录，执行登录
    // 登录成功后加载云端数据
}
```

#### 4. 登录成功后保存凭据
**文件**: `index.html` (handleEmailLogin 函数，约 L27260)
- 默认启用"记住登录"（复选框隐藏但功能保留）
- 保存凭据到 Android SharedPreferences 和 localStorage

#### 5. 登出时清理凭据
**文件**: `index.html` (handleLogout 函数，约 L27640)
- 调用 `Android.clearLoginCredentials()` 清除密码
- 清除 localStorage 中的所有登录相关数据

### 安全说明
- 密码存储在 SharedPreferences 中使用 MODE_PRIVATE（仅本应用可访问）
- 密码使用 Base64 编码存储（防止明文，但不是强加密）
- 登出时自动清除所有凭据

---

## v7.9.3 (2026-01-26) - 系统分类管理与云端同步增强

### 1. 睡眠分类标签功能

**新增数据结构**:
```javascript
sleepSettings.earnCategory = null;  // 睡眠奖励分类
sleepSettings.spendCategory = null; // 睡眠惩罚分类

// Profile 中新增（所有设备共享）
profile.sleepTimeCategories = {
    earnCategory: string | null,
    spendCategory: string | null,
    lastUpdated: ISO string
}
```

**新增函数**:
- `showSleepCategorySelectModal(type)` - 显示分类选择弹窗
- `selectSleepCategory(item)` - 选择分类
- `updateSleepCategories()` - 更新分类设置并云端同步
- `initSleepCategoryDisplay()` - 初始化分类显示

### 2. 分类强制应用（核心改动）

**修改函数**: `getTransactionCategory(t)` (约 L16976)

**原逻辑**: 优先使用记录中的 `category` 字段
**新逻辑**: 始终使用当前设置的分类，忽略记录中的值

```javascript
function getTransactionCategory(t) {
    if (t.isSystem) {
        // 屏幕时间：始终使用当前设置
        if (t.systemType === 'screen-time' || t.taskName === '屏幕时间管理') {
            if (t.type === 'earn' && screenTimeSettings.earnCategory) {
                return screenTimeSettings.earnCategory;
            }
            // ...
        }
        // 睡眠：始终使用当前设置
        if (t.sleepData || t.napData || t.taskName === '😴 睡眠时间管理') {
            // ...
        }
    }
}
```

**优势**: 无需修改云端数据，设置更改后立即生效。

### 3. Watch 自动重连机制

**新增变量**:
```javascript
const watchConnected = { task: false, transaction: false, running: false, profile: false, daily: false };
const watchReconnectAttempts = { ... };
const watchReconnectTimers = {};
```

**新增函数**:
- `scheduleWatchReconnect(reason)` - 调度重连（指数退避）
- `checkAndRebuildWatchers()` - 检查并重建失效的 watchers

**心跳检测**: 每30秒检查 watch 连接状态

### 4. 午睡闹钟修复

**Java 修改**: `AlarmReceiver.java`
- 使用 `RingtoneManager` 播放系统闹钟铃声
- 支持震动

**JS 修改**: `startNap()` 函数调用 `Android.setNapAlarm(wakeTimeMs, ALARM_ID_NAP)`

### 5. 登录状态检测

**新增标记**:
```javascript
localStorage.setItem('timebankExpectedLoggedIn', 'true');
```

**检测函数**: `checkLoginStateOnResume()` - 检测意外登出并提示用户

### 6. 数字输入框优化

隐藏 number 输入框的箭头（电脑端 spinner）：
```css
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
    -webkit-appearance: none;
}
input[type="number"] { -moz-appearance: textfield; }
```

---

## 历史版本要点

### v7.8.3 - 登录邮箱保存
- 登录成功后保存邮箱到 Android SharedPreferences
- 登录状态丢失时自动填充邮箱

### v7.4.0+ - 睡眠时间管理系统
- 完整的睡眠奖惩计算逻辑
- 睡眠记录存储在 tb_transaction（sleepData 字段）

### v7.3.0+ - 均衡模式
- 根据余额调整赚取效率
- `getBalanceMultiplier()` 函数

### v6.6.0 - 多表架构迁移
- 从单一 JSON 迁移到 5 张独立表
- DAL (Data Access Layer) 设计

### v5.10.0+ - 卡片堆叠系统
- 各卡片独立展开状态
- 上下滑动手势处理

---

## 常用调试命令

```powershell
# 同步文件
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force

# Git 提交
git add -A; git commit -m "feat: 描述"; git push

# 搜索代码
grep_search "关键词"
```

---

## Android Studio Logcat 日志筛选

```
# WebView/JavaScript 日志
package:com.jianglicheng.timebank tag:chromium

# 错误日志
package:com.jianglicheng.timebank level:error
```

---

*最后更新: 2026-02-07 (v7.15.0 时间金融系统)*

