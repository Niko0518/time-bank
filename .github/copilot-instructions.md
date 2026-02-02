# Time Bank - AI 编程指南

> ⚠️ **强制规则**：
> 1. 每次更新涉及关键技术细节时，必须添加到「第二部分：版本更新记录」
> 2. **禁止擅自推送**：只有用户明确发出推送指令时，才能执行 git push 并更新版本号
> 3. 代码注释中的版本号必须与用户声明的当前版本一致，不得自行递增

---

# 第一部分：项目概况与技术基础

## 1.1 项目概述

Time Bank 是一个 **混合开发 (Hybrid) 的安卓应用**，结合原生 Java 外壳和 WebView 前端界面。

**技术栈**：
- **前端**: 原生 JavaScript (Vanilla JS)，无框架，单文件 ~30,000 行
- **样式**: CSS 变量，支持深色模式 (`prefers-color-scheme`)
- **云端**: 腾讯 CloudBase JS SDK v2.24.10
- **Android**: Java，minSdk 26，targetSdk 34

---

## 1.2 核心文件结构

| 文件 | 用途 |
|------|------|
| `android_project/app/src/main/assets/www/index.html` | **前端全部代码** (HTML+CSS+JS) |
| `android_project/app/src/main/java/.../WebAppInterface.java` | JS 桥接 (`window.Android`) |
| `sw.js` | Service Worker (PWA 缓存) |

### 文件同步规则
```powershell
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
```

---

## 1.3 版本发布规则

### ⚠️ 禁止擅自推送
- 只有用户明确要求推送时，才能执行 `git push`
- 用户声明版本号后，所有代码注释必须使用该版本号
- 不得在用户未要求时自行递增版本号

### 更新版本号（5 个位置）
1. `<title>` 标签（约第 12 行）
2. 关于页 `<p>Time Bank vX.X.X</p>`（约第 4023 行）
3. `APP_VERSION` 常量（约第 6606 行）
4. 启动日志 `console.log("App vX.X.X...")`（约第 9787 行）
5. `sw.js` 文件头部（2 处）

---

## 1.4 核心数据结构

### 设置存储架构（重要！）
```
┌─────────────────────────────────────────────────────────────┐
│  屏幕时间/睡眠设置的三层存储架构                               │
├─────────────────────────────────────────────────────────────┤
│  1. Android SharedPreferences (最可靠，优先读取)              │
│     - saveScreenTimeSettingsNative / getScreenTimeSettingsNative │
│     - saveSleepSettingsNative / getSleepSettingsNative       │
│                                                              │
│  2. localStorage (备份，网页端兼容)                           │
│     - screenTimeSettings / sleepSettings                     │
│                                                              │
│  3. CloudBase 云端 (跨设备同步)                               │
│     - deviceScreenTimeSettings[deviceId] ← 设备专属配置       │
│     - deviceSleepSettings[deviceId]      ← 设备专属配置       │
│     - screenTimeCategories               ← 跨设备共享分类     │
│     - sleepTimeCategories                ← 跨设备共享分类     │
└─────────────────────────────────────────────────────────────┘
```

### 分类标签存储位置分离
- `earnCategory`/`spendCategory` 存储在 `profile.xxxCategories`（跨设备共享）
- **不在** `deviceXxxSettings[deviceId]` 中
- 加载时需要从两个位置分别读取并合并

---

## 1.5 常用原生方法 (Android)

| 方法 | 用途 |
|------|------|
| `Android.saveScreenTimeSettingsNative(json)` | 保存屏幕时间设置到原生存储 |
| `Android.getScreenTimeSettingsNative()` | 从原生存储读取屏幕时间设置 |
| `Android.saveSleepSettingsNative(json)` | 保存睡眠设置到原生存储 |
| `Android.getSleepSettingsNative()` | 从原生存储读取睡眠设置 |
| `Android.nativeLog(tag, message)` | 原生日志输出（绕过 WebView 过滤） |

---

## 1.6 调试技巧

### WebView 日志被过滤问题
WebView 的 `console.log` 可能被系统过滤，使用原生日志：
```javascript
if (window.Android?.nativeLog) {
    window.Android.nativeLog('TAG', 'message');
}
```

### Logcat 筛选
```
package:com.jianglicheng.timebank tag:chromium
package:com.jianglicheng.timebank level:error
```

---

# 第二部分：版本更新记录

> **记录原则**：只记录关键技术细节，用代码说明前后变化，便于回溯。

---

## v7.11.2 (2026-02-02) - 设置重启丢失问题完整修复

### 问题：三层嵌套 Bug

这个问题由**三个独立问题叠加**导致：

#### Bug 1: WebView localStorage 不可靠
```javascript
// 问题：localStorage 在 WebView 中持久化不稳定
localStorage.setItem('screenTimeSettings', json); // 重启后可能丢失

// 修复：添加 Android 原生存储
// WebAppInterface.java
@JavascriptInterface
public void saveScreenTimeSettingsNative(String json) {
    prefs.edit().putString("screenTimeSettings", json).apply();
}
```

#### Bug 2: initApp 中断导致设置函数未执行
```javascript
// 问题：updateNotificationSettingsUI() 抛出异常，中断整个 initApp
function updateNotificationSettingsUI() {
    document.getElementById('xxx').checked = true; // DOM 为 null 时崩溃
}

// 修复：添加 null 检查 + try-catch
function updateNotificationSettingsUI() {
    const el = document.getElementById('xxx');
    if (el) el.checked = true;
}

try { initScreenTimeSettings(); } catch (e) { console.error(e); }
try { initSleepSettings(); } catch (e) { console.error(e); }
```

#### Bug 3: 分类标签存储位置分离
```javascript
// 问题：分类标签存储在不同位置，加载时遗漏
// saveScreenTimeSettings() 故意排除了分类：
const cloudSettings = { enabled, dailyLimitMinutes, ... }; // 无 earnCategory

// 修复：initScreenTimeSettings() 中额外从云端恢复分类
if (isLoggedIn() && DAL.profileData?.screenTimeCategories) {
    screenTimeSettings.earnCategory = DAL.profileData.screenTimeCategories.earnCategory;
    screenTimeSettings.spendCategory = DAL.profileData.screenTimeCategories.spendCategory;
}

// 修复：updateScreenTimeCategories() 中同步保存到原生存储
if (window.Android?.saveScreenTimeSettingsNative) {
    window.Android.saveScreenTimeSettingsNative(JSON.stringify(screenTimeSettings));
}
```

### 关键改动文件

**WebAppInterface.java** - 新增原生存储方法：
- `saveScreenTimeSettingsNative()` / `getScreenTimeSettingsNative()`
- `saveSleepSettingsNative()` / `getSleepSettingsNative()`
- `saveSleepStateNative()` / `getSleepStateNative()`
- `nativeLog(tag, message)` - 原生日志

**index.html** - 修改函数：
- `initScreenTimeSettings()` - 优先原生存储 + 恢复云端分类
- `initSleepSettings()` - 同上
- `saveScreenTimeSettings()` - 同时保存到原生存储
- `saveSleepSettings()` - 同上
- `updateScreenTimeCategories()` - 同步原生存储
- `updateNotificationSettingsUI()` - 添加 null 检查

### 调试经验

| 尝试 | 解决了 | 遗漏了 |
|-----|-------|-------|
| 添加原生存储 | localStorage 不可靠 | 代码根本没执行 |
| 添加 console.log | 无 | 日志被 WebView 过滤 |
| 添加 nativeLog | 看到真正错误 | 发现是更早的函数崩溃 |
| 修复 null 检查 | 主开关正常 | 分类标签存储位置不同 |
| 恢复云端分类 | ✅ 完全解决 | - |

---

## v7.11.1 - 关联应用与睡眠倒计时修复

### 关联应用保存回退
```javascript
// 问题：手动修改输入框后，保存时被旧的 selectedPackage 覆盖
// 修复：手动输入时清除 selectedPackage
function filterAppList() {
    // ... 用户输入时
    selectedPackage = null; // 清除旧选择
}
```

### 睡眠倒计时跳过
```javascript
// 问题：countdownSeconds 异常值导致跳过倒计时
// 修复：初始化时规范化
if (!Number.isFinite(sleepSettings.countdownSeconds) || sleepSettings.countdownSeconds < 1) {
    sleepSettings.countdownSeconds = 60;
}
```

---

## v7.9.4 - 自动重新登录

### CloudBase 持久化
```javascript
app = sdk.init({
    env: TCB_ENV_ID,
    persistence: 'local'  // 持久化到 localStorage
});
```

### Android 凭据存储
```java
// WebAppInterface.java
public void saveLoginCredentials(String email, String password) {
    prefs.edit()
        .putString("login_email", email)
        .putString("login_password", Base64.encodeToString(password.getBytes(), Base64.DEFAULT))
        .apply();
}
```

---

## 历史版本要点

| 版本 | 关键改动 |
|------|---------|
| v7.8.3 | 登录邮箱保存到 SharedPreferences |
| v7.4.0+ | 睡眠时间管理系统 |
| v7.3.0+ | 均衡模式 `getBalanceMultiplier()` |
| v6.6.0 | 多表架构迁移 (DAL) |

---

*最后更新: 2026-02-02*

