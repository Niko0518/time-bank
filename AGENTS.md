# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手，旨在帮助快速理解项目架构、开发规范和关键决策。
> 项目主要交流语言为中文。

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。 productive 活动赚取时间，consumptive 活动消耗时间。

**应用形态**：
- **前端**：PWA（渐进式 Web 应用），Vanilla JS/HTML/CSS，无现代前端框架
- **原生外壳**：Android Java + WebView，通过 `window.Android` JS Bridge 暴露系统级能力
- **云服务**：腾讯云 CloudBase（数据库 + 云函数 + 静态托管）
- **AI 能力**：云端大模型代理（DeepSeek / Kimi / Gemini / OpenAI），通过 CloudBase HTTP 访问服务调用

**当前版本**：`v8.2.2`

---

## 2. 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | Vanilla JavaScript (ES6) | 无框架，多文件拆分，全局作用域函数 |
| **样式** | CSS 变量 + 媒体查询 | 支持亮色/暗色模式、三种卡片视觉（渐变/扁平/玻璃态）、画作主题 |
| **PWA** | Service Worker | Network-first 缓存策略，离线可用 |
| **云端 SDK** | CloudBase JS SDK v2 | 预打包为 `cloudbase.v2.bundle.js`（esbuild） |
| **Android** | Java 11 | minSdk 24，targetSdk 36，compileSdk 36，Gradle 8.x |
| **云函数** | Node.js 18.15 | `@cloudbase/node-sdk@2.5.0` + `axios` |
| **构建工具** | Gradle / esbuild | Android 用 Gradle；SDK 打包用 esbuild |
| **脚本** | PowerShell | 同步、修复、推送前检查 |

---

## 3. 项目结构与代码组织

```
TimeBank/
├── android_project/          # Android 原生项目（权威前端源码）
│   ├── app/src/main/assets/www/   # 前端代码权威源（index.html, css/, js/）
│   ├── app/src/main/java/         # Java 源码（MainActivity, WebAppInterface, Services, Widgets）
│   └── gradle/                    # Gradle 配置
├── css/
│   └── main.css              # 单文件巨型样式表（~6,300 行）
├── js/
│   ├── app.js                # 模块入口（import app-1/2/3，实际仅 app-1/2 存在）
│   ├── app-1.js              # 全局变量、DAL/CloudBase 初始化、任务卡片渲染、initApp
│   ├── app-2.js              # 颜色工具、任务计时/完成/停止、习惯系统
│   ├── app-reports.js        # 交易处理、报告系统（图表/热图/趋势）、AI 伙伴 UI
│   ├── app-sleep.js          # 睡眠管理（设置/倒计时/结算/闹钟）
│   ├── app-systems.js        # 设备 ID、屏幕时间、金融系统、均衡模式、自动检测、主题
│   ├── app-auth.js           # 邮箱登录、数据导入导出、saveData/loadData
│   ├── ai-service.js         # AI 服务层（洞察报告、聊天、伙伴、认知同步）
│   ├── qps-limiter.js        # API 限流
│   └── sw-register.js        # Service Worker 注册
├── cloudbase-functions/
│   ├── timebankSync/         # 增量同步云函数
│   ├── timebankAI/           # AI 代理云函数
│   └── taskLock-deploy-guide.md  # 分布式锁部署文档
├── scripts/                  # PowerShell 自动化脚本
├── sdk-build/                # CloudBase SDK v2 浏览器打包
├── themes/                   # PNG 主题背景图（梵高/莫奈画作）
├── index.html                # 单页 HTML 骨架（~4,200 行）
├── sw.js                     # Service Worker
├── manifest.json             # PWA 清单
└── cloudbaserc.json          # CloudBase CLI 部署配置
```

### 3.1 前端代码加载顺序（不可更改）

`index.html` 尾部按以下顺序加载：

```
sw-register.js → qps-limiter.js → ai-service.js → app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

### 3.2 各 JS 文件职责

| 文件 | 搜索哪类功能 |
|------|-------------|
| `js/app-1.js` | 全局变量声明、DAL、CloudBase 初始化、Watch 监听、任务卡片渲染、`initApp` |
| `js/app-2.js` | 颜色工具、任务计时/完成/停止、习惯连胜系统、拖拽排序 |
| `js/app-reports.js` | `addTransaction`、报告页（时间流图/饼图/热图/趋势）、通知、权限管理、AI 洞察/伙伴 UI |
| `js/app-sleep.js` | 睡眠设置/状态/结算/倒计时/闹钟 |
| `js/app-systems.js` | `initDeviceId`、屏幕时间查询、金融系统（利息）、均衡模式、自动检测补录、主题/外观 |
| `js/app-auth.js` | `handleEmailLogin`、数据导入导出（JSON）、`saveData`、`loadData` |

### 3.3 Android 原生关键文件

| 文件 | 职责 |
|------|------|
| `MainActivity.java` | WebView 宿主、`WebViewAssetLoader` 映射虚拟域 `timebank.local`、文件选择器、下载处理 |
| `WebAppInterface.java` | JS Bridge (`window.Android`)，~1,900 行：震动、文件保存/导出、通知、悬浮窗、闹钟、屏幕时间、保活服务等 |
| `FloatingTimerService.java` | 悬浮窗计时器服务（叠加窗口、多计时器堆叠、拖拽、位置记忆） |
| `AlarmReceiver.java` | 闹钟广播接收器 |
| `BootReceiver.java` | 开机自启 |
| `KeepAliveService.java` | 前台保活服务 |
| `BalanceWidget*.java` ×4 | 时间余额小组件（4 种视觉风格） |
| `ScreenTimeWidget*.java` ×4 | 屏幕时间小组件（4 种视觉风格） |

---

## 4. 关键配置文件

| 文件 | 用途 |
|------|------|
| `manifest.json` | PWA 配置：`display: standalone`，主题色 `#667eea`，图标 192/512px |
| `cloudbaserc.json` | CloudBase CLI 配置：环境 ID `cloud1-8gvjsm7860b4a3`，函数 `timebankSync`/`timebankAI` |
| `sdk-build/package.json` | esbuild 打包 `@cloudbase/js-sdk` 为浏览器 bundle |
| `android_project/app/build.gradle` | App 模块：`minSdk 24`，`targetSdk 36`，`versionCode 26`，`versionName "8.0.0"` |
| `android_project/gradle/libs.versions.toml` | 版本目录（AppCompat 1.6.1, Material 1.10.0, WebKit 1.8.0） |
| `.github/copilot-instructions.md` | 项目最核心的 AI 编程指南（1,400+ 行），含架构、同步规则、版本规则、数据库 schema |

---

## 5. 构建与运行

### 5.1 Android 构建

```bash
cd android_project

# 清理并构建 Release APK
./gradlew clean assembleRelease

# 构建 Debug APK
./gradlew assembleDebug

# 安装到连接的设备
./gradlew installDebug
```

**输出路径**：
- Release APK: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug APK: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### 5.2 前端调试

- **Chrome DevTools**: 通过 `chrome://inspect` 远程调试 WebView
- **日志查看**: `adb logcat` 查看 Android 日志；前端 `console.log` 输出到 Chrome DevTools
- **本地预览**: 可直接用浏览器打开根目录 `index.html`（部分 Bridge 功能会降级）

### 5.3 CloudBase SDK 打包

```bash
cd sdk-build
npm install
npx esbuild entry.js --bundle --outfile=../cloudbase.v2.bundle.js --format=iife --global-name=cloudbase
```

### 5.4 云函数本地测试

```powershell
cd cloudbase-functions/timebankSync  # 或 timebankAI
npm install
# 需自行编写 test.js 进行本地测试
node test.js
```

---

## 6. 开发规范与工作流

### 6.1 ⚠️ 三端同步规则（最高优先级）

- **权威源**：`android_project/app/src/main/assets/www/` —— 所有前端修改**只在此目录进行**
- **根目录**（`index.html`, `sw.js`, `css/`, `js/`）是**派生副本**，日常开发中**禁止直接修改**
- **同步时机**：仅在收到「推送」指令时，执行 Android → 根目录的单向同步

**同步命令**：
```powershell
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force
```

### 6.2 「推送」完整工作流

当用户发出「推送」指令时，按以下顺序执行：

1. **双端同步** — 执行上述同步命令
2. **Hash 验证一致性** — 验证两端 `index.html` 文件 Hash 必须完全一致
3. **检查版本号** — 确认 7 个位置的版本号已更新（若用户指定了新版本号）
4. **检查日志** — 确认技术日志（`.github/copilot-instructions.md` 第二部分）和用户日志（HTML 版本更新日志）已撰写
5. **执行推送** — `git add -A` → `git commit` → `git push`

### 6.3 版本号修改禁令

- ❌ **绝对禁止** AI 擅自修改任何位置的版本号（`APP_VERSION`、`index.html`、`sw.js` 等）
- ✅ 必须等待用户明确说出「更新版本号为 vX.Y.Z」或类似指令
- ✅ 在需要修改版本号时，**必须先询问**：「请问本次更新的版本号是多少？」

### 6.4 日志规则

- **用户日志（HTML 中的版本更新日志）**：仅在用户明确下达「更新用户日志/撰写用户日志」指令时才修改
- **技术日志（`.github/copilot-instructions.md` 第二部分）**：由 AI 按需更新，仅对「重要且影响深远」的改动记录（如架构、数据一致性、跨端兼容、核心流程）

---

## 7. 代码风格指南

### 7.1 JavaScript

- **无框架、无模块打包**：纯 Vanilla JS，函数以全局作用域声明
- **事件绑定**：大量使用内联 `onclick` 处理器
- **异步**：混合使用 `async/await` 和 Promise
- **命名约定**：全局函数使用 camelCase；常量使用大写下划线（如 `APP_VERSION`）
- **注释**：中文注释为主；关键修复需标注版本号（如 `// [v8.2.2] 修复 Watch 连接僵死`）
- **DOM 操作**：直接操作原生 DOM，无虚拟 DOM；批量更新建议使用 `DocumentFragment`

### 7.2 CSS

- **单文件样式表**：所有样式集中在 `css/main.css`
- **设计令牌**：CSS 自定义属性（`--color-primary`, `--color-primary-rgb` 等）
- **主题切换**：
  - 暗色模式：`[data-theme="dark"]` + `color-scheme: dark`
  - 强调色：`data-accent` 属性驱动
  - 画作主题：背景图来自 `themes/*.png`
- **三大卡片视觉模式**：
  - Gradient（默认）：`.gradient-dir-a/b`
  - Flat：`body.flat-style`
  - Glass：`body.glass-mode`，`backdrop-filter: blur()`，约 1,500+ 行专用样式

### 7.3 Java

- 标准 Android Java 编码风格
- 最小化权限声明，动态申请敏感权限
- WebView 使用 `WebViewAssetLoader` 将本地 `file://` 映射为 `https://timebank.local`（CloudBase SDK 要求 HTTPS）

---

## 8. 测试策略

> 本项目**无自动化单元测试/集成测试套件**。测试依赖手工验证和脚本辅助。

### 8.1 手工验证清单

**关键流程必验**：
- 任务创建 → 开始计时 → 暂停/继续 → 完成 → 交易记录正确
- 习惯任务：跨周期连胜计算、断签后补录、设置变更后 streak 重算
- 睡眠管理：设置就寝/起床时间 → 倒计时 → 结算 → 闹钟触发
- 数据同步：登录 → 多设备 Watch 一致性 → 手动同步 → 离线后恢复
- AI 洞察：生成报告 → 切换模型 → 聊天对话 → 每日伙伴消息

**兼容性注意**：
- `minSdk 24` 限制，JS 代码避免使用 ES2020+ 新特性（如 `??=`、`Promise.allSettled` 需 polyfill 或避免）
- WebView 在不同 Android 版本行为有差异，需关注 `localStorage` 和 `fetch` 兼容性

### 8.2 调试脚本

| 脚本 | 用途 |
|------|------|
| `scripts/inspect_segment.ps1` | 分析 `app-2.js` 中指定代码段的括号匹配 |
| `trace_div_balance.ps1` | 扫描 `index.html` 前 545 行的 `<div>` 标签平衡 |
| `scripts/pre-push-check.ps1` | 推送前一致性、版本号、日志检查 |

### 8.3 已知高危区域（修改需谨慎）

- **睡眠时区计算**：v7.13.1 修复过严重 Bug
- **配额模式与自动检测补录**：计时消费任务的配额计算曾出现错误
- **数组排序稳定性**：多处依赖数组顺序，修改排序逻辑需全面回归
- **习惯连胜系统**：v7.39.x 经历大规模重构，涉及 `app-1.js` 和 `app-2.js` 多处联动
- **Watch 连接与同步**：v8.2.2 刚修复连接僵死问题，涉及 `unsubscribeAll()` 超时、`manualSync()` 超时等

---

## 9. 安全考虑

### 9.1 数据安全

- **CloudBase 安全规则**：
  - `tb_profile` / `tb_task` / `tb_running`：预置规则（自动过滤本人数据）
  - `tb_transaction` / `tb_daily`：**自定义规则**，查询时必须手动添加 `where({ _openid: currentUid })`
  - `tb_ai_*` 集合：需配置预置规则「读取和修改本人数据」
- **事务操作**：任何涉及余额变动的操作**必须使用** `db.runTransaction`
- **并发冲突**：多设备同时操作同一任务可能导致数据不一致；云函数 `timebankTaskLock` 提供 60 秒 TTL 分布式锁

### 9.2 API 密钥管理

- AI 提供商 API Key 存储在 **CloudBase 云函数环境变量**中，不暴露给客户端
- 前端通过 CloudBase HTTP 访问服务调用 AI 能力，URL 含随机数以提供基础隐蔽性
- **当前限制**：HTTP 访问服务为免鉴权状态，生产环境建议开启 `tcb service auth`

### 9.3 本地存储

- 用户数据主要持久化在 CloudBase 数据库；本地 `localStorage` 仅作缓存和离线降级
- `localStorage` 键名前缀统一为 `tb_`（如 `tb_category_task_limits`）
- 敏感操作（如数据导出）需用户确认

---

## 10. 部署流程

### 10.1 云函数部署

```powershell
# 前提：已安装 CloudBase CLI 并已登录（tcb login）
# 当前环境 CLI 版本：3.2.2

# 部署单个云函数（--force 自动覆盖，无需交互确认）
tcb fn deploy timebankAI --force
tcb fn deploy timebankSync --force

# 批量部署所有云函数
tcb fn deploy --all --force
```

**部署前必须**：在各云函数目录执行 `npm install`，确保 `node_modules` 被打包上传（`@cloudbase/node-sdk` 非 Node.js 18 内置模块）。

### 10.2 Android APK 发布

1. 更新 `android_project/app/build.gradle` 中的 `versionCode` 和 `versionName`
2. 执行 `./gradlew assembleRelease`
3. APK 输出至 `app/build/outputs/apk/release/app-release.apk`

### 10.3 前端 PWA 更新

1. 修改 `android_project/app/src/main/assets/www/` 下的源码
2. 用户收到「推送」指令后，同步到根目录
3. 更新 `sw.js` 中的 `CACHE_NAME` 版本号（如 `timebank-cache-v8.2.3`）以触发客户端缓存更新
4. `git push`

---

## 11. 数据库集合

| 集合 | 安全规则 | 用途 |
|------|---------|------|
| `tb_profile` | 预置规则 | 用户资料（含设备配置） |
| `tb_task` | 预置规则 | 任务列表 |
| `tb_transaction` | 自定义规则 | 交易记录（含睡眠结算） |
| `tb_running` | 预置规则 | 运行中任务 |
| `tb_daily` | 自定义规则 | 每日统计 |
| `tb_ai_user_brain` | 预置规则 | AI 用户画像与认知核心 |
| `tb_ai_data_mirror` | 预置规则 | 按月分片的数据镜像 |
| `tb_ai_incremental_log` | 预置规则 | 增量同步日志 |
| `tb_ai_feedback` | 预置规则 | AI 反馈消息 |
| `tb_ai_sync_schedule` | 预置规则 | 同步计划配置 |
| `tb_ai_external_import` | 预置规则 | 外部画像导入记录 |
| `tb_ai_memory` | 预置规则 | AI 伙伴记忆（每日关怀/观察/对话） |

---

## 12. 关键架构决策

1. **混合应用架构**：WebView 承载 UI，Java Bridge 暴露原生能力（闹钟、屏幕时间、悬浮窗、小组件）。不追求跨平台框架，最大化系统级功能集成。
2. **单源真相**：Android `assets/www/` 是前端唯一权威源码；根目录仅为 GitHub 镜像。
3. **CloudBase 中心化**：所有数据持久化、AI 计算、跨设备同步均依赖腾讯云 CloudBase。客户端直接写数据库，服务端仅处理增量查询和 AI 代理。
4. **HTTP 绕过超时**：AI 服务通过 CloudBase HTTP 访问服务调用（浏览器 60s 超时），绕过云函数 `callFunction` 的 15 秒超时限制。
5. **无构建系统的前端**：不引入 webpack/vite，保持纯静态文件结构，降低构建复杂度和 WebView 兼容性风险。
6. **事件溯源预备**：`app-1.js` 中预留 `EVENT_TYPES` 枚举和 `logEvent()` 桩函数，尚未启用。

---

## 13. 常用参考文档

| 文档路径 | 内容 |
|---------|------|
| `.github/copilot-instructions.md` | 最完整的项目规范、版本日志、数据库规则、API 说明 |
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数详细部署指南 |
| `cloudbase-functions/taskLock-deploy-guide.md` | 分布式锁云函数部署指南 |
| `external-ai-analysis-prompt.md` | 外部 AI 分析的数据格式与 Prompt 规范 |
| `v7.36.6_implementation_plan.md` | 历史实施计划（习惯系统重构） |
