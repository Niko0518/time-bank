# Time Bank - AI 编程指南

> ⚠️ **强制规则**：每次更新涉及关键技术细节或重要改动时，必须将其添加到本文件的「第二部分：版本更新记录」中。

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

每次推送更新时，**必须**执行以下操作（只有当用户给出推送指令时，才更新版本号）：

### 更新版本号（5 个位置）
1. `<title>` 标签（约第 12 行）
2. 关于页 `<p>Time Bank vX.X.X</p>`（约第 4023 行）
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
- 只有**当前版本**保留在外面，历史版本移入 `<details>` 区域
- 更新日志位于约第 4745 行

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

# 第二部分：版本更新记录

> 本部分记录每次更新的关键改动和技术细节。**每次开始工作前必须阅读理解**，防止重复踩坑或破坏已有功能。
> 
> ⚠️ **强制规则**：每次更新涉及关键技术细节或重要改动时，必须将其添加到此部分。

---

## v7.10.1 (2026-01-31) - 新手引导定位与逻辑修复

### 问题背景
新手引导高亮与气泡在不同页面/滚动容器/任务编辑页中频繁偏移，尤其是：
1. 任务编辑弹窗内的元素（倍率/习惯设置等）
2. 弹窗内滚动后定位不更新
3. 滚动动画未完成就定位导致偏移
4. 任务选择逻辑可能选错类型（如选单次任务而非计时任务）
5. 菜单在引导期间被意外关闭
6. 消费任务的戒除设置区域不显示

### 解决方案
1. 重构 `maybeScrollIntoView()` 支持智能识别滚动容器（主页面 vs 弹窗内容）
2. 新增 `findScrollContainer()` 函数自动查找元素所在的滚动容器
3. 添加弹窗内滚动监听，滚动时自动重新定位引导高亮
4. 使用回调机制确保滚动完成后再定位
5. 增加 `ensure` 函数执行后的等待时间（60ms → 150ms）
6. 修复任务选择逻辑，不回退到不同类型的任务
7. 添加菜单锁定机制防止引导期间菜单被关闭
8. 引导结束时清理所有打开的弹窗和菜单
9. 引导菜单编辑步骤改为单步“进入编辑”，并新增菜单编辑兜底绑定，确保点击“编辑”可进入任务弹窗

### 关键改动
**文件**: `index.html`

#### 1. 新增 `findScrollContainer()` 函数
```javascript
function findScrollContainer(element) {
    // 先检查是否在弹窗内
    const modal = element.closest('.modal.show');
    if (modal) {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent && modalContent.scrollHeight > modalContent.clientHeight) {
            return modalContent;
        }
    }
    // 否则返回主滚动容器
    return document.getElementById('appScrollContainer');
}
```

#### 2. 重构 `maybeScrollIntoView()` 支持回调
- 智能识别滚动容器（弹窗内 vs 主页面）
- 使用 `scrollTo()` 替代 `scrollIntoView()` 以精确控制
- 监听滚动结束后调用回调，确保定位准确
- 安全超时防止滚动未触发时卡死

#### 3. 修复任务选择逻辑
- `findOnboardingTaskCardInContainer()`: 只返回指定类型的任务，不回退到任意卡片
- `findOnboardingHabitTaskCard()`: 优先习惯任务，回退到同类型非习惯任务

#### 4. 新增菜单锁定机制
```javascript
let onboardingMenuLocked = false;
// 在 openOnboardingTaskMenu() 中设置 onboardingMenuLocked = true
// 菜单关闭事件中检查此标志
```

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

*最后更新: 2026-01-26*

