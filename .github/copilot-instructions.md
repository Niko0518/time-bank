# Time Bank - AI 编程指南

> ✅ **v7.5.0 当前版本**: CloudBase 云端同步正常，睡眠时间管理系统已上线。本文档用于指导日常维护工作。

## ⚠️ 版本发布规则（必读）

每次推送更新时，**必须**执行以下操作，只有当用户给出推送指令时，才更新版本号：

1. **更新版本号**（5 个位置）：
   - `<title>` 标签（约第 12 行）
   - 关于页 `<p>Time Bank vX.X.X</p>`（约第 4023 行）
   - `APP_VERSION` 常量（约第 6606 行）
   - 启动日志 `console.log("App vX.X.X...")`（约第 9787 行）
   - `sw.js` 文件头部（2 处）
   具体版本号由用户制定，若未指定，开发时自动在注释中暂时填写新版本号，若用户给出推送指令时未指定版本号，则使用开发时注释中最新的一个版本号

2. **更新 sw.js**：
   ```javascript
   // Time Bank Service Worker - vX.X.X
   const CACHE_NAME = 'timebank-cache-vX.X.X';
   ```

3. **版本日志**：
   - ⚠️ **仅在用户明确要求时**才撰写版本日志
   - 日志按版本号**降序排列**（最新版本在最上面）
   - ⚠️ **版本归档规则**：只有**当前版本**保留在外面，历史版本移入 `<details>` 区域
   - 更新日志位于约第 4745 行
   - 格式参见下方"更新日志格式"

4. **文件同步**：
   ```powershell
   Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
   ```

---

## 项目概述

Time Bank 是一个 **混合开发 (Hybrid) 的安卓应用**，结合原生 Java 外壳和 WebView 前端界面。

### 核心文件（必读）
| 文件 | 用途 | 行数 |
|------|------|------|
| `android_project/app/src/main/assets/www/index.html` | **前端全部代码** (HTML+CSS+JS) | ~26,000 行 |
| `android_project/app/src/main/java/.../MainActivity.java` | Android 入口，WebView 初始化 | ~200 行 |
| `android_project/app/src/main/java/.../WebAppInterface.java` | JS 桥接 (`window.Android`) | ~400 行 |

### 文件同步规则
- **主文件**: `android_project/app/src/main/assets/www/index.html`
- **根目录副本**: `index.html` (用于 GitHub Pages 预览)
- ⚠️ **每次修改后必须同步**: 
  ```powershell
  Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
  ```

---

## 日常维护指南

### 1. 修改前端代码 (index.html)

**⚠️ 关键注意事项**:
- 文件巨大（~26,000 行），**必须先用 grep_search 定位**，再用 read_file 读取上下文
- 使用 `replace_string_in_file` 时提供 **3-5 行上下文**，确保唯一匹配
- 修改后用 `get_errors` 检查语法错误

**常用搜索关键词**:
| 功能模块 | 搜索关键词 |
|---------|-----------|
| 云端同步 | `DAL.` / `cloudApp` / `subscribeAll` |
| 任务管理 | `taskList` / `addTask` / `completeTask` |
| 交易记录 | `transaction` / `addTransaction` |
| 睡眠管理 | `sleepSettings` / `sleepState` / `睡眠时间管理` |
| 屏幕时间 | `screenTimeSettings` / `autoSettle` |
| 均衡模式 | `balanceMode` / `getBalanceMultiplier` |
| 卡片堆叠 | `cardStack` / `handleCardStackTouchStart` |
| UI 渲染 | `render` / `updateUI` / `showPage` |
| 版本信息 | `APP_VERSION` / `更新日志` |

**index.html 结构概览**:
```
行 1-1000        : HTML 结构 + CSS 样式
行 1000-4000     : 更多 HTML (各页面模板)
行 4000-4100     : 首页卡片 (余额、屏幕时间、睡眠)
行 4500-4700     : 睡眠设置面板 HTML
行 4730-6000     : 更新日志区域
行 6000-8000     : JavaScript 工具函数
行 8000-10000    : DAL (数据访问层) + CloudBase 逻辑
行 10000-11000   : 任务卡片拖拽排序
行 11000-16000   : 任务管理 + 交易记录
行 16000-19000   : 报告页面 + 时间流图
行 19000-20000   : 睡眠时间管理系统 ⭐
行 20000-22000   : 屏幕时间管理
行 22000-26000   : 其他业务逻辑
```

### 2. 版本发布流程

发布新版本时，需更新 **5 个位置**:

```javascript
// 1. 页面标题 (约第 12 行)
<title>时间银行 - Time Bank vX.X.X</title>

// 2. 关于页显示 (约第 4023 行)
<p>Time Bank vX.X.X</p>

// 3. APP_VERSION 常量 (约第 6606 行)
const APP_VERSION = 'vX.X.X';

// 4. 启动日志 (约第 9787 行)
console.log("App vX.X.X Starting (CloudBase)...");

// 5. 更新日志 (约第 4745 行) - 添加新条目
```

**更新日志格式**:
```html
<div class="version-history-item">
    <p><strong>版本 vX.X.X (YYYY-MM-DD)</strong> 🏷️ <b>版本标题</b></p>
    <ul>
        <li><strong>[Feat/Fix/UI]</strong> 🎨 <b>功能名</b>：描述</li>
    </ul>
</div>
```

### 3. 云端同步相关

**CloudBase 配置** (已完成，仅供参考):
- 环境 ID: `cloud1-8gvjsmyd7860b4a3`
- 地域: `ap-shanghai`
- 登录方式: 邮箱登录

**数据库集合**:
| 集合 | 用途 |
|------|------|
| `tb_profile` | 用户资料（含设备配置） |
| `tb_task` | 任务列表 |
| `tb_transaction` | 交易记录（含睡眠结算） |
| `tb_running` | 运行中任务 |
| `tb_daily` | 每日统计 |

**关键代码位置**:
- `DAL` 对象: 搜索 `const DAL =`
- Watch 实时监听: 搜索 `subscribeAll`
- 数据加载: 搜索 `DAL.loadAll`
- 任务保存: 搜索 `DAL.saveTask`

**⚠️ 重要**: `saveData()` 在多表模式下**不保存任务到云端**，只保存 Profile。
修改任务数据后需单独调用 `DAL.saveTask(task)` 同步到云端。

### 4. 睡眠时间管理系统 (v7.4.0+) ⭐

**核心数据结构**:
```javascript
// 睡眠设置 (localStorage: sleepSettings)
sleepSettings = {
    enabled: false,
    plannedBedtime: '22:30',       // 计划入睡时间
    plannedWakeTime: '06:45',      // 计划起床时间
    targetDurationMinutes: 495,    // 目标睡眠时长
    durationTolerance: 45,         // 时长容差
    toleranceReward: 60,           // 容差内奖励
    countdownSeconds: 60,          // 入睡倒计时
    showCard: true,                // 显示首页卡片
    autoDetectWake: true,          // 自动检测起床
    // 奖惩倍率
    earlyBedtimeRate: 0.2,         // 早睡奖励
    lateBedtimeRate: 0.5,          // 晚睡惩罚
    earlyWakeRate: 0.2,            // 早起奖励
    lateWakeRate: 0.5,             // 晚起惩罚
    durationDeviationRate: 0.5,    // 时长偏离惩罚
};

// 睡眠状态 (localStorage: sleepState)
sleepState = {
    isSleeping: false,
    sleepStartTime: null,
    unlockCount: 0,
    cancelledDates: [],
    lastSleepRecord: null,
    lastUnlockTime: null,
};
```

**关键函数**:
| 函数 | 用途 |
|------|------|
| `initSleepSettings()` | 初始化睡眠设置 |
| `startSleepMode()` | 进入睡眠模式（显示倒计时） |
| `startSleepRecording()` | 开始记录睡眠 |
| `endSleep()` | 结束睡眠（计算奖惩） |
| `calculateSleepReward()` | 计算睡眠奖惩 |
| `updateSleepCard()` | 更新首页卡片显示 |
| `updateSleepSummary()` | 更新昨日简报 |
| `showSleepReportModal()` | 显示详细报告弹窗 |
| `getSleepRecordForDate()` | 获取指定日期睡眠记录 |
| `getYesterdaySleepRecord()` | 获取昨日睡眠记录 |

**睡眠交易记录格式**:
```javascript
addTransaction({
    type: 'earn' | 'spend',
    amount: Math.abs(reward) * 60,  // 转换为秒
    description: '入睡~起床 总时长',  // 如: 22:30~06:45 8小时15分钟
    taskName: '睡眠结算',
    category: '系统',
    sleepData: {
        startTime: timestamp,
        wakeTime: timestamp,
        durationMinutes: number,
    }
});
```

### 5. 屏幕时间管理系统

**核心数据结构**:
```javascript
// 屏幕时间设置 (localStorage: screenTimeSettings)
screenTimeSettings = {
    enabled: false,
    dailyLimitMinutes: 120,
    showCard: true,
    whitelistApps: [],
    settledDates: { deviceId: [dates] },  // 按设备记录
    earnCategory: null,   // 节省时间分类
    spendCategory: null,  // 超出时间分类
    cardStyle: 'classic', // 'classic' | 'glass'
};
```

**关键函数**:
| 函数 | 用途 |
|------|------|
| `initScreenTimeSettings()` | 初始化屏幕时间设置 |
| `autoSettleScreenTime()` | 自动结算历史日期 |
| `updateScreenTimeCard()` | 更新首页卡片 |
| `autoDetectAppUsage()` | 自动检测应用使用补录 |

### 6. 卡片堆叠系统 (v5.10.0+)

**状态管理**:
- `cardExpandedStates` (localStorage): 各卡片独立展开状态
- 屏幕时间卡片和睡眠卡片可独立展开/收起

**手势处理**:
- `handleCardStackTouchStart/Move/End`: 上下滑动展开/收起
- `handleBalanceCardTap`: 余额卡片触摸点击
- `handleScreenTimeCardClick`: 屏幕时间卡片点击
- `handleSleepCardClick`: 睡眠卡片点击

### 7. 均衡模式 (v7.3.0+)

**核心逻辑**:
```javascript
// 根据余额调整赚取效率
function getBalanceMultiplier() {
    if (!balanceMode.enabled) return 1.0;
    const balanceHours = currentBalance / 3600;
    if (balanceHours > 48) return 0.8;
    if (balanceHours >= 24) return 0.9;
    if (balanceHours >= 0) return 1.0;
    if (balanceHours >= -24) return 1.1;
    return 1.2;
}
```

### 8. 原生功能 (Java)

**添加新的 JS 桥接方法**:
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

**常用原生方法**:
| 方法 | 用途 |
|------|------|
| `Android.saveFileDirectly(filename, content)` | 保存文件到下载目录 |
| `Android.showToast(message)` | 显示 Toast |
| `Android.vibrate(ms)` | 震动 |
| `Android.getDeviceId()` | 获取设备 ID |
| `Android.startSleepMonitor()` | 启动睡眠监控服务 |
| `Android.stopSleepMonitor()` | 停止睡眠监控服务 |

### 9. Git 提交规范

```bash
# 功能添加
git commit -m "feat: 添加XX功能"

# Bug 修复
git commit -m "fix: 修复XX问题"

# UI 调整
git commit -m "ui: 优化XX界面"

# 版本发布
git commit -m "vX.X.X: 版本描述"
```

---

## 常见问题排查

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

## Android Studio Logcat 日志筛选指南

在 Android Studio 中查看 WebView JavaScript 日志：

### 1. 打开 Logcat 面板
- 底部工具栏点击 **Logcat** 标签（或 `View → Tool Windows → Logcat`）

### 2. 筛选 WebView/JavaScript 日志
在 Logcat 顶部的筛选框输入以下内容：

```
package:com.example.timebank tag:chromium
```

或者使用更宽泛的筛选：
```
package:com.example.timebank console
```

### 3. 常用筛选关键词
| 场景 | 筛选表达式 |
|------|-----------|
| 所有 JS 日志 | `tag:chromium` |
| 睡眠功能调试 | `tag:chromium message:Sleep` |
| 应用启动日志 | `tag:chromium message:Starting` |
| 错误日志 | `tag:chromium level:error` |

### 4. 技巧
- **保存筛选器**: 点击筛选框右侧的 ⭐ 保存常用筛选
- **清除日志**: 点击 🗑️ 图标清除历史日志
- **暂停日志**: 点击 ⏸️ 暂停滚动，方便查看

---

## 技术栈参考

- **前端**: 原生 JavaScript (Vanilla JS)，无框架
- **样式**: CSS 变量，支持深色模式 (`prefers-color-scheme`)
- **云端**: 腾讯 CloudBase JS SDK v2.24.10
- **Android**: Java，minSdk 26，targetSdk 34
- **构建**: Gradle 8.x

---

## 联系与资源

- **GitHub**: 代码仓库包含完整历史
- **CloudBase 控制台**: https://console.cloud.tencent.com/tcb
- **安全域名**: `timebank.local` (WebViewAssetLoader 虚拟域名)
