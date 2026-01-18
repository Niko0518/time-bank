# Time Bank - AI 编程指南

> ✅ **v7.0.0 里程碑**: CloudBase 云端迁移已完成，实时同步功能正常运行。本文档用于指导日常维护工作。

## ⚠️ 版本发布规则（必读）

每次推送更新时，**必须**执行以下操作，只有当用户给出推送指令时，才更新版本号：

1. **更新版本号**（5 个位置）：
   - `<title>` 标签（约第 12 行）
   - 关于页 `<p>Time Bank vX.X.X</p>`（约第 3747 行）
   - `APP_VERSION` 常量（约第 6039 行）
   - 启动日志 `console.log("App vX.X.X...")`（约第 8933 行）
   - `sw.js` 文件头部（2 处）
   具体版本号由用户制定，若未指定，开发时自动在注释中暂时填写新版本号，若用户给出推送指令时时未指定版本号，则使用开发时使用注释中最新的一个版本号

2. **更新 sw.js**：
   ```javascript
   // Time Bank Service Worker - vX.X.X
   const CACHE_NAME = 'timebank-cache-vX.X.X';
   ```

3. **版本日志**：
   - ⚠️ **仅在用户明确要求时**才撰写版本日志
   - 日志按版本号**降序排列**（最新版本在最上面）
   - ⚠️ **版本归档规则**：只有**当前版本**保留在外面，历史版本移入 `<details>` 区域
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
| `android_project/app/src/main/assets/www/index.html` | **前端全部代码** (HTML+CSS+JS) | ~22,000 行 |
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
- 文件巨大（~22,000 行），**必须先用 grep_search 定位**，再用 read_file 读取上下文
- 使用 `replace_string_in_file` 时提供 **3-5 行上下文**，确保唯一匹配
- 修改后用 `get_errors` 检查语法错误

**常用搜索关键词**:
| 功能模块 | 搜索关键词 |
|---------|-----------|
| 云端同步 | `DAL.` / `cloudApp` / `subscribeAll` |
| 任务管理 | `taskList` / `addTask` / `completeTask` |
| 交易记录 | `transaction` / `addTransaction` |
| UI 渲染 | `render` / `updateUI` / `showPage` |
| 版本信息 | `APP_VERSION` / `更新日志` |

**index.html 结构概览**:
```
行 1-1000      : HTML 结构 + CSS 样式
行 1000-4000   : 更多 HTML (各页面模板)
行 4000-5000   : 更新日志区域
行 5000-8000   : JavaScript 工具函数
行 8000-12000  : DAL (数据访问层) + CloudBase 逻辑
行 12000-22000 : 业务逻辑 + UI 交互
```

### 2. 版本发布流程

发布新版本时，需更新 **5 个位置**:

```javascript
// 1. 页面标题 (约第 12 行)
<title>时间银行 - Time Bank vX.X.X</title>

// 2. 关于页显示 (约第 3747 行)
<p>Time Bank vX.X.X</p>

// 3. APP_VERSION 常量 (约第 5986 行)
const APP_VERSION = 'vX.X.X';

// 4. 启动日志 (约第 8852 行)
console.log("App vX.X.X Starting (CloudBase)...");

// 5. 更新日志 (约第 4266 行) - 添加新条目
```

**更新日志格式**:
```html
<div class="version-history-item">
    <p><strong>版本 vX.X.X (YYYY-MM-DD)</strong></p>
    <ul>
        <li><strong>[Fix/Feat/UI]</strong> 🎨 <b>功能名</b>：描述</li>
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
| `tb_profile` | 用户资料 |
| `tb_task` | 任务列表 |
| `tb_transaction` | 交易记录 |
| `tb_running` | 运行中任务 |
| `tb_daily` | 每日统计 |

**关键代码位置**:
- `DAL` 对象: 搜索 `const DAL =`
- Watch 实时监听: 搜索 `subscribeAll`
- 数据加载: 搜索 `DAL.loadAll`

### 4. 原生功能 (Java)

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
- `Android.saveFileDirectly(filename, content)` - 保存文件到下载目录
- `Android.showToast(message)` - 显示 Toast
- `Android.vibrate(ms)` - 震动

### 5. Git 提交规范

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

### Q: replace_string_in_file 失败？
1. 使用 `read_file` 读取精确内容
2. 检查缩进和空格是否完全匹配
3. 尝试更短的唯一字符串

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
