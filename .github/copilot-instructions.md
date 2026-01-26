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

