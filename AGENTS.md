# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。
> 项目主要交流语言为中文。

---

## 📖 项目概览

**TimeBank** 是一款基于「时间货币」模型的个人时间管理与任务追踪应用，同时提供 Android 原生端（APK）和 PWA 网页端。

| 维度 | 内容 |
|------|------|
| **当前版本** | `v9.36.1`（实时更新，见「🎯 当前版本目标与进度」） |
| **数据规模** | 主用户交易记录 4000+ 条（持续增长，性能调优必须考虑） |
| **技术栈** | Vanilla JS（ES6，无框架）+ CSS 变量 + Java 11（minSdk 24 / targetSdk 36）+ CloudBase（JS SDK v2 + Node 18.15 云函数） |
| **平台** | Android APK（悬浮窗 / 小组件）+ PWA 网页端（可安装到桌面） |

---

## 🎯 当前版本：v9.36.1 目标与进度

> 本章节记录当前开发版本的目标与进度，版本收尾（推送）后更新为下一版本。

### 版本主题
**开发流程精简**——新增 `bump-version.ps1` 一键版本号升级 / 双端同步 / 校验脚本；技术日志改为精简格式（10-30 行要点）；AGENTS.md 工作流精简以节省 token。

> ✅ v9.36.1 已推送（2026-08-20）。下一版本目标待定。

### 关键约束提醒
- 性能红线：交易记录 4000+ 条，任何动效不得对 `backdrop-filter` 卡片做 transform 缩放（已验证会导致卡顿）
- 版本号与双端同步：统一由 [第 3 节](#3--版本号与双端同步一键脚本) 的 `bump-version.ps1` 处理

---

## 📑 规则章节索引

> ⚠️ **AI 必读**：编写/修改代码前先看完相关章节，避免"训练数据本能 vs 项目实际"冲突。

### 🚨 最高优先级：双源镜像 + 权威源

本项目存在 **「双源镜像」** 结构：

| 位置 | 角色 |
|------|------|
| `android_project/app/src/main/assets/www/` | **权威源**（日常开发位置，AI 必须在此修改） |
| `D:\TimeBank\` 根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` | **PWA 副本**（仅推送时由脚本同步） |

**判断"该改哪里"**：

| 文件类型 | 应该改的位置 |
|---------|-------------|
| `index.html` / `js/*.js` / `css/main.css` / `sw.js` / `manifest.json` | **`assets/www/` 下的同名文件**（不是根目录） |
| `*.java`（Android 源码） | `android_project/app/src/main/java/com/jianglicheng/timebank/` |
| `*.xml`（Android 资源 / Manifest） | `android_project/app/src/main/res/` 或 `app/src/main/AndroidManifest.xml` |
| `*.gradle` | `android_project/app/build.gradle` 或 `android_project/build.gradle` |
| 云函数 | `cloudbase-functions/<fnName>/index.js` |
| `AGENTS.md` / `cloudbaserc.json` / `.gitignore` | 项目根 |

### 📚 章节地图

| 章节 | 内容 | 何时阅读 |
|------|------|---------|
| **硬性约束** | 角色称谓 / 禁令 / 指令语义 / 日志规范 | 每次会话开始 |
| [1. 项目概述](#1-项目概述) | 定位 / 数据规模 / 技术栈 | 上下文不熟时 |
| [2. 项目结构与代码组织](#2-项目结构与代码组织) | 文件 / JS 加载顺序 / Android 源码 | 查找文件时 |
| [3. ⚠️ 版本号与双端同步](#3--版本号与双端同步一键脚本) | bump-version.ps1 用法 | 收到"推送"指令时 |
| [4. CloudBase 配置](#4-腾讯云-cloudbase-配置) | 环境 / 数据库 / 云函数 / CLI | 部署云函数时 |
| [5. 构建与运行](#5-构建与运行) | AI 自动安装 / 调试 | 收到"安装/调试"指令时 |
| [6. 已知高危区域](#6-已知高危区域) | 历史修复 / 修改需谨慎 | 修改相关代码前 |
| [7. 代码风格](#7-代码风格指南) | JS / CSS / Android 风格 | 编写新代码前 |
| [8. 安全考虑](#8-安全考虑) | 事务 / 锁 / API Key | 设计云函数时 |

### ⚡ 一句话总结

> **修前端 → 改 `assets/www/`；推送 → 写日志 + 跑 `bump-version.ps1 <新版本>` + git push；云函数 → 优先 MCP/CLI；版本号 → 用户不指定就不动。**

---

## AI 必须遵守的硬性约束

### 角色称谓
- 开发者本人 = 与你对话的人，技术小白但有长期经验，复杂技术问题需解释清楚
- 用户 = TimeBank 产品使用者（反馈由开发者转述）；反馈实际问题时开发者本人也是使用者

### 禁令（全局生效）
- ❌ 禁止擅自修改任何位置的版本号（`APP_VERSION`、`CACHE_NAME`、`build.gradle` 的 `versionName`/`versionCode`、HTML `<title>`/`.version-subtitle`、关于页、用户日志版本标题等）。改前必须问："请问本次更新的版本号是多少？"
- ❌ 禁止日常开发自动同步。仅在收到"推送"指令时运行 `bump-version.ps1`
- ❌ 禁止未经"推送"指令执行 `git push`
- ❌ **绝对禁止先卸载再安装 APK**（含 `adb uninstall`）——卸载会清空 localStorage、失败队列、未同步交易等关键数据。出现 `INSTALL_FAILED_VERSION_DOWNGRADE` 时先告知用户并询问处理方式
- ❌ 前端代码默认只在 `android_project/app/src/main/assets/www/` 修改

### 安装规范
1. **安装验证**：`adb install -r` 在该设备上会"假成功"（Success 但 APK 未替换），必须用 `adb push + pm install -r -t -d` 并用 `dumpsys package | findstr lastUpdateTime` 验证；视觉调整遇反复反馈先**全部归零**确认基准。

### 用户指令语义
| 指令 | 触发条件 | AI 行为 |
|------|----------|---------|
| **推送** | 用户明确要求推送 | 写两份日志 → 运行 `bump-version.ps1 <新版本>`（版本号与双端同步由脚本完成）→ `git add -A` → `git commit` → `git push` |
| **安装** | USB 已连接，要求安装新版本 | 用 `RunCommand` 直接执行构建安装命令（见「AI 安装流程」）；未检测到设备时提示用户连接 |
| **调试** | USB 已连接（ADB 可用） | 先执行安装流程；USB 未连接立即放弃并提示；连接成功优先用 Chrome `chrome://inspect` 远程调试 WebView，原生日志用 `adb logcat` 过滤 `chromium:D`、`WebAppInterface:D`、`TimeBank:D` |

### AI 安装流程（自动执行）
> 每次修改代码后，AI 必须用 `RunCommand` 直接执行构建安装，无需用户手动操作。

**标准安装命令**：
```powershell
# 1. 检测 USB 设备
& "D:\SDK\platform-tools\adb.exe" devices
# 2. 增量构建 Debug APK
android_project\gradlew.bat -p android_project assembleDebug
# 3. 安装到设备
& "D:\SDK\platform-tools\adb.exe" install -r -g "android_project\app\build\outputs\apk\debug\app-debug.apk"
# 4. 启动应用
& "D:\SDK\platform-tools\adb.exe" shell am start -n com.jianglicheng.timebank/.MainActivity
```

**完整重建命令**（修改了 Java/Gradle/Manifest 文件时）：
```powershell
android_project\gradlew.bat -p android_project clean
android_project\gradlew.bat -p android_project assembleDebug
# 再执行安装并启动（第 3-4 步）
```

**决策原则**：
| 场景 | 推荐做法 |
|------|---------|
| 仅修改前端 JS/CSS/HTML | 标准安装命令（增量构建） |
| 修改 Android Java / Gradle / Manifest | 完整重建命令（先 clean 再 build） |
| 涉及 WebView ↔ Android 交互 | 安装后用 `adb logcat` 抓日志 |
| 需要特定 adb 验证（权限、广播等） | AI 自行编写专项 `adb shell ...` 命令 |
| 用户未连接 USB | 放弃自动调试，告知「请连接 USB 并开启调试后重试」 |

### 用户的"方案" ≠ 实施
用户说"给我一个方案 / 做个方案"时默认先不实施：给 1-3 个候选 + 优缺点 + 推荐，等用户确认。

### 模糊指令处理
- 先判断指令是否清晰、有歧义；模糊时主动询问细节；不假装听懂，不用"理论上""应该可以"回复。

### 改完代码必须说明（产品语言）
- 哪些文件被改 + 用户能看到什么变化。

### 工作开始前必做
1. 复述用户需求（用自己的话）
2. 若开发者未给出版本号，询问是否涉及版本号修改
3. 列出将修改的文件清单
4. 说明风险/副作用（如有）

### 工作完成后必做
1. **逐文件 Read 复核**：每个被修改的文件 Read 关键行，确认实际写入与预期一致（不依赖工具"成功回报"）
2. **版本号 / 双端同步**：交由 `bump-version.ps1` 完成，查看其输出确认 ✅
3. **遗留自查**：`git status --short` + `git diff --stat` 确认改动清单与预期一致

### AI 工具对照表

| 任务 | 工具 | 备注 |
|------|------|------|
| 读文件 | `Read` | 必传绝对路径 |
| 修改文件（精确替换） | `Edit` / `SearchReplace` | 唯一匹配时用绝对路径 |
| 创建新文件 | `Write` | 不要用于修改已存在文件 |
| 删除文件 | `DeleteFile` | 一次可多个 |
| 按文件名搜索 | `Glob` | 例如 `**/gradlew.bat` |
| 按内容搜索 | `Grep` | 支持正则 |
| 执行 PowerShell / Bash | `RunCommand` | 默认 powershell |
| 复杂任务自动委派 | `Task` | 多步骤搜索/分析 |

**禁止事项**：
- ❌ 用 `Write` 覆盖已存在文件 → 一律用 `Edit`/`SearchReplace`
- ❌ 用 `cat`/`grep`/`find` 等 shell 命令 → 用 `Read`/`Grep`/`Glob`
- ❌ 多文件并行 `SearchReplace` 后批量信任结果 → 逐文件修改 + 立即 Read 复核

### 日志（推送前强制流程）

> 每次收到"推送"指令，AI 自动生成两份日志草稿，开发者可润色。

#### 两份日志的分工

| 维度 | 用户日志（HTML） | 技术日志（docs/version-changelog.md） |
|------|----------------|--------------------------------------|
| 受众 | 终端用户 | 开发者 + 后续 AI 助手 |
| 内容风格 | 用户价值导向，避免技术术语 | 技术导向，含根因 / 方案 / 收益 |
| 长度 | 每版本 3-8 行 | **每版本 10-30 行要点（精简格式）** |
| 位置 | `index.html` 关于页 `<details>` 块顶部 | `docs/version-changelog.md` 顶部追加 |

#### 技术日志入选门槛（命中任一条则写）
1. 数据完整性风险（数据丢失 / 余额错误 / 双倍计入 / 孤儿数据）
2. 跨设备/跨平台行为变更（Watch / 云同步 / Android↔PWA 一致性）
3. 架构/配置重构（新架构 / 新配置体系 / 新加载机制）
4. 性能显著影响（冷启动 / 帧率 / 内存变化 ≥ 30%）
5. 历史 Bug 修复（用户反馈过且根因涉及 2 处以上代码）

> 纯 UI 调整、变量重命名、注释更新、性能微优化 → 不写技术日志，但仍需用户日志（如有用户感知）。

#### 日志生成顺序
1. 修改代码完成后，`git status --short` 列改动清单
2. 判断是否命中技术日志门槛
3. 撰写用户日志（`index.html` 关于页 `<details>` 顶部新增 `version-history-item`，含新版本号）——**须在运行 `bump-version.ps1` 之前完成**（脚本会同步 index.html）
4. 撰写技术日志（`docs/version-changelog.md` 顶部，精简格式）
5. 运行 `bump-version.ps1 <新版本>` → 版本号更新 + 双端同步 + 校验
6. 询问开发者是否调整日志草稿

#### 日志保留策略
- **用户日志**（`index.html`）：保留最近 **22 个版本**，更早版本见技术日志
- **技术日志**（`docs/version-changelog.md`）：保留**全部版本**，不分页不归档
- **用户反馈**（`log&data/bug反馈.txt`）：手动维护，不进 git（被 `.gitignore` 忽略）

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用，同时提供网页端。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。

**典型使用场景**：
| 平台 | 设备 | 使用方式 |
|------|------|---------|
| **Android** | 手机端 | 原生 APK，可使用悬浮窗计时器、小组件等原生功能 |
| **Android** | 平板端 | 原生 APK，支持分屏和大屏适配 |
| **网页端** | 浏览器 | PWA 应用，可安装到桌面 |

> ⚠️ **重要背景**：当前主要用户的交易记录已累计 **4000+ 条**，且持续增长中。任何 O(N) 或 O(N×M) 的数据遍历/全量加载/批量操作都需要审视性能影响。

> 🧪 **实验项目**：`native_app/` 是纯原生（Jetpack Compose + Room）移植的测试雏形，包名 `com.jianglicheng.timebank2`。**不可用于生产**，不参与双端同步、不参与版本号管理、不写入用户日志。

---

## 2. 项目结构与代码组织

### 2.1 前端文件（权威源：`android_project/app/src/main/assets/www/`）

> 🚨 **【铁律 1 详解】**所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行，**禁止**在根目录修改。
>
> 📌 **完整路径前缀**：`D:\TimeBank\android_project\app\src\main\assets\www\`
>
> 📌 **记忆方法**：双源镜像结构——根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` 是 PWA 同步副本，**不是**开发位置。看到这 5 类文件，第一反应是"在 `assets/www/` 下"。

| 文件 | 用途 | 行数 |
|------|------|------|
| `index.html` | HTML 骨架 | ~4,200 |
| `css/main.css` | CSS 样式 | ~6,300 |
| `js/app-1.js` | 全局变量、DAL、任务卡片、initApp | ~6,200 |
| `js/app-2.js` | 颜色工具、计时/完成/停止、习惯系统 | ~6,100 |
| `js/app-reports.js` | 交易处理、报告系统、AI伙伴UI | ~8,200 |
| `js/app-sleep.js` | 睡眠管理 | ~3,200 |
| `js/app-systems.js` | 设备ID、屏幕时间、金融系统、自动检测 | ~5,300 |
| `js/app-auth.js` | 登录、数据导入导出 | ~3,400 |
| `js/ai-service.js` | AI 服务层 | ~2,500 |

### 2.2 JS 文件加载顺序（不可更改）

```
sw-register.js → qps-limiter.js → ai-service.js → app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

### 2.3 各 JS 文件功能领域

| 文件 | 搜索哪类功能 |
|------|-------------|
| `js/app-1.js` | DAL、CloudBase、Watch监听、initApp |
| `js/app-2.js` | 任务计时/完成/停止、习惯连胜 |
| `js/app-reports.js` | addTransaction、报告页、热图、AI洞察 |
| `js/app-systems.js` | 屏幕时间、金融系统、自动检测补录 |
| `js/app-auth.js` | handleEmailLogin、saveData、loadData |
| `js/ai-service.js` | AI报告、AI伙伴、AI认知同步 |

### 2.4 Android 原生文件

| 文件 | 职责 |
|------|------|
| `MainActivity.java` | WebView 宿主，`WebViewAssetLoader` 映射 `timebank.local` |
| `WebAppInterface.java` | JS Bridge `window.Android`，~1,900 行 |
| `FloatingTimerService.java` | 悬浮窗计时器服务 |

---

## 3. ⚠️ 版本号与双端同步（一键脚本）

> 核心：所有版本号更新、双端同步、校验统一由 `bump-version.ps1` 完成。AI 不再手动逐处改版本号、逐条跑 Copy-Item、逐对 diff。

**用法**（收到"推送"指令时）：
```powershell
powershell -ExecutionPolicy Bypass -File bump-version.ps1 9.36.1
```

**脚本自动完成**：
1. 读取当前版本（`js/app-1.js` 的 `APP_VERSION`）
2. 替换全部纯版本号位置：
   - `index.html`（权威源）：`<title>` / `.version-subtitle` 副标题 / 关于页"版本"
   - `js/app-1.js`：`APP_VERSION`
   - `sw.js`：文件头注释 + `CACHE_NAME`
   - `build.gradle`：`versionName` / `versionCode`（自动 +1）
   - `AGENTS.md`：当前版本
3. 双端同步：5 条 `Copy-Item`（权威源 → 根目录 PWA 副本）串行执行，失败即停
4. 校验：`diff` 强校验（index.html / sw.js / app-1.js / app-2.js / main.css）+ 版本位置残留扫描 + 全库旧版本号快照
5. 输出汇总

**注意事项**：
- 版本号由**用户指定**，AI 不得擅自升级
- **历史代码注释**（`// [v9.15.1] 增强` 等）与**历史版本日志条目**（`版本 v9.15.1 (2026-06-24)`）不会被脚本改动（精确匹配），也不应手动改
- 用户日志新条目须在运行脚本**之前**写入 `index.html` 关于页 `<details>` 顶部
- 未收到"推送"指令前，不运行脚本、不执行 `git push`
- 脚本不做 git 操作、不构建安装；git 提交推送由 AI 完成

---

## 4. 腾讯云 CloudBase 配置

### 4.1 自动部署与手动降级规则

**默认策略（三层优先级）**：

| 优先级 | 方式 | 触发条件 | 示例指令 |
|--------|------|----------|----------|
| **1（首选）** | **MCP/Skills 自动完成** | Trae 已加载 CloudBase MCP 且 AI 会话暴露工具 | "部署 timebankSync 云函数" |
| **2（备用）** | **`tcb` CLI 命令行** | MCP 不可用或用户明确要求终端操作 | `tcb fn deploy timebankSync --force` |
| **3（兜底）** | **手动部署** | CLI 授权失败或用户偏好控制台 | CloudBase Web 控制台手动粘贴 |

**CLI 自动部署命令**：
```powershell
tcb fn deploy <fnName> --force
tcb fn deploy --all --force
```

**降级条件**
- MCP 工具调用失败（如未暴露、超时）→ 自动降级到 CLI
- CLI 授权过程可能需要一段时间，用户需登录网站确认授权码，请等待至少 1 分钟；1 分钟后无反应则询问用户是否手动部署

**手动降级流程**：
1. AI 输出/修改云函数在 `D:\TimeBank\cloudbase-functions` 供用户完整复制
2. AI 给出手动部署步骤（CloudBase Web 控制台 `https://tcb.cloud.tencent.com/dev`）
3. 用户在控制台手动粘贴代码，AI 等待确认部署完成

### 4.2 环境信息
- **环境 ID**：由 `assets/config/config.production.json`（前端）+ `android_project/app/src/main/assets/config/config.production.json`（Android 层）管理，**不要直接修改硬编码值**。当前生产环境 ID：`cloud1-8g9jsmyd7860b4a3`
- **SDK 版本**：92.24.10（前端 JS SDK）
- **CLI 版本**：93.5.6（见 4.3 节）
- **配置文件**：[cloudbaserc.json](file:///d:/TimeBank/cloudbaserc.json) —— 定义函数根目录 `cloudbase-functions`、4 个云函数的 runtime/timeout/handler

### 数据库集合

| 集合 | 安全规则 | 用途 |
|------|---------|------|
| `tb_profile` | 预置规则 | 用户资料 |
| `tb_task` | 预置规则 | 任务列表 |
| `tb_transaction` | **自定义规则** | 交易记录 |
| `tb_running` | 预置规则 | 运行中任务 |
| `tb_daily` | **自定义规则** | 每日统计 |
| `tb_ai_*` | 预置规则 | AI 相关数据 |

> ⚠️ `tb_transaction` / `tb_daily` 查询时必须添加 `where({ _openid: currentUid })`

### 云函数

| 云函数名 | 用途 | 超时 | 文件路径 |
|---------|------|------|---------|
| `tbMutation` | 统一数据变更（13个action） | 30s | `cloudbase-functions/tbMutation/index.js` |
| `timebankSync` | 增量查询 | 30s | `cloudbase-functions/timebankSync/index.js` |
| `timebankAI` | AI洞察/对话/伙伴/认知 | 60s | `cloudbase-functions/timebankAI/index.js` |
| `timebankTaskLock` | 分布式任务锁（60s TTL） | 10s | `cloudbase-functions/timebankTaskLock/index.js` |

> ⚠️ **99.0.0 重要修复**：Web SDK `callFunction` 不会自动注入 `context.OPENID`，所有云函数统一使用 `context.OPENID || event._openid || event.data?._openid` 获取用户身份。

### 部署命令
```powershell
tcb fn deploy tbMutation --force
tcb fn deploy timebankSync --force
tcb fn deploy timebankAI --force
tcb fn deploy timebankTaskLock --force
tcb fn deploy --all --force
```

### 4.3 AI 原生开发工具链
项目已配置 CloudBase MCP（路径 `C:\Users\15700\.trae\mcp.json`，Trae 自动加载）；**AI 在 Trae Agent 模式下可直接用自然语言操作云资源**，例如"部署 timebankSync 云函数"、"列出 tb_task 索引"。

兜底链：MCP 未加载 → `tcb fn deploy <fnName> --force`（CLI 93.5.6 已全局安装）→ 手动部署（CloudBase Web 控制台）。

---

## 5. 构建与运行

### Android 安装（AI 自动执行）

> **AI 自动安装**：开发者无需手动执行任何脚本或命令，AI 在每次修改代码后自动使用 `RunCommand` 执行构建安装流程。

#### 给开发者的话
```
1. 把手机用 USB 线连接到电脑（确保手机已开启 USB 调试）
2. 告诉 AI "安装" 或等待 AI 自动执行
3. 等待完成，应用自动启动
```

#### 给 AI 助手的话
**必须**使用 `RunCommand` 直接执行构建安装命令，**不要**让开发者手动执行任何操作。

**标准安装流程**：
```powershell
# 1. 检测 USB 设备
& "D:\SDK\platform-tools\adb.exe" devices
# 2. 增量构建 Debug APK
android_project\gradlew.bat -p android_project assembleDebug
# 3. 安装到设备
& "D:\SDK\platform-tools\adb.exe" install -r -g "android_project\app\build\outputs\apk\debug\app-debug.apk"
# 4. 启动应用
& "D:\SDK\platform-tools\adb.exe" shell am start -n com.jianglicheng.timebank/.MainActivity
```

**完整重建流程**（修改了 Java/Gradle/Manifest 文件时）：
```powershell
android_project\gradlew.bat -p android_project clean
android_project\gradlew.bat -p android_project assembleDebug
# 再执行安装并启动（第 3-4 步）
```

**注意事项**：
- ❌ 不要输出命令让开发者手动执行；✅ 使用 `RunCommand` 自动执行
- ✅ 如果 USB 未连接，提示用户连接后重试

**输出路径**：
- Release: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### 调试
- **首选：Chrome DevTools**：通过 Chrome 远程调试 WebView（`chrome://inspect`）
  - 荣耀/鸿蒙设备默认过滤 `Log.d`，`adb logcat` 原生级别日志收集受限；WebView console.log 不受影响
- **AI 调试时**：`adb logcat -v time -s chromium:D WebAppInterface:D TimeBank:D` 抓日志
- **Console 日志**：前端 console.log 会输出到 Chrome DevTools

---

## 6. 已知高危区域（修改需谨慎）

| 区域 | 风险等级 | 相关版本 |
|------|---------|---------|
| **睡眠时区计算** | 高 | 97.13.1 修复过 |
| **配额+自动检测补录** | 高 | 计时消费配额曾出错 |
| **习惯连胜系统** | 高 | 97.39.x 重构 |
| **Watch 连接与同步** | 高 | 98.2.2 修复 |
| **金融系统利息计算** | 高 | 98.2.14 修复 |
| **跨设备 running 同步** | 高 | 98.2.15 修复 |

### 待优化：Watch 监听回推性能问题（历史遗留，待日后解决）
> 📌 **状态**：已诊断、未修复，用户明确要求留待日后解决。与 v9.29.x 动效升级无关。

**症状**：持续类任务暂停/继续后，按钮形态切换约 1 秒延迟；操作偶发卡顿。

**根因（已定位）**：`subscribeAll` 内 5 个集合的 Watch `onChange` 回推处理器（task/transaction/running/profile/daily，见 app-1.js）**无条件调用 `updateAllUI()`** 做全量重渲染；本机触发回推末尾仍跑一遍全量重渲染，纯属冗余 CPU 开销。各定时器（心跳 20s / 数据差异 5 分钟 / 自愈同步）均轻量，非瓶颈；问题在回推后的冗余全量重渲染（CPU 而非网络）。

**修复方向（待实施）**：
1. **回推去重（首选，低风险）**：各 `onChange` 处理器记录"是否处理了非本机触发的实质变更"，若全部为本机触发则**跳过 `updateAllUI()`**
2. **重渲染瘦身**：`updateAllUI()` 按需拆分；`renderTaskCards` 内每卡遍历 4000+ 条交易的计数（`transactions.filter`）改为缓存
3. **暂停/继续即时反馈**：核实本地乐观更新（`pauseTask`/`resumeTask` 内的 `updateRecentTasks`/`updateCategoryTasks`）是否被某机制延迟或覆盖

**相关代码**：`subscribeAll`（5 处 onChange）、`updateAllUI`、`renderTaskCards`（transactions.filter）、`pauseTask`/`resumeTask`。

---

## 7. 代码风格指南

### JavaScript
- **无框架**：纯 Vanilla JS，全局作用域函数
- **内联事件**：大量使用 `onclick` 处理器
- **注释**：中文为主，关键修复标注版本号（如 `// [v9.36.0] 修复...`）

### CSS
- 单文件：`css/main.css`（~6,300 行）
- 设计令牌：CSS 自定义属性（`--color-primary` 等）
- 三大卡片视觉：Gradient / Flat / Glass

### Android
- WebView 使用 `WebViewAssetLoader` 映射 `https://timebank.local`
- 动态权限申请

---

## 8. 安全考虑

- **事务操作**：所有数据变更通过云函数 `tbMutation` 统一执行，余额使用 `_.inc()` 原子更新
- **并发冲突**：云函数串行化写入天然互斥；`timebankTaskLock` 提供 60 秒 TTL 分布式锁（任务级）
- **API Key**：存储在 CloudBase 云函数环境变量，不暴露客户端
- **HTTP 服务**：当前免鉴权，生产环境建议开启鉴权

---

# 附录：快速参考

## 常用搜索关键词

| 需求 | 关键词 |
|------|--------|
| 任务逻辑 | `renderTasks`, `startTask`, `stopTask` |
| 交易操作 | `addTransaction`, `writeTransaction` |
| 睡眠代码 | `sleepSettings`, `calculateSleepDuration` |
| 主题切换 | `themePreference`, `applyTheme` |
| 屏幕时间 | `screenTime`, `collectScreenTime` |
| 自动检测 | `autoDetectAppUsage`, `recordAutoDetectRawUsage` |
| 金融系统 | `financialSystem`, `balance` |
| 习惯系统 | `rebuildHabitStreak`, `computeHabitStreakFromTransactions` |
| Watch 监听 | `subscribeAll`, `unsubscribeAll`, `manualSync` |
| DAL 对象 | `const DAL =` |
| pendingRegistry | `addPending`, `removePending`, `isPending` |
| callMutation | `callMutation`, `flushMutationQueue`, `mutationQueue` |

## 调试脚本

> Android 构建/安装/调试默认由 AI 使用 `RunCommand` 直接执行 Gradle Wrapper（`./android_project/gradlew.bat`）+ `adb` 原生命令组合，详见第 5 节。
>
> 用户也可直接运行项目根目录下的 `install-to-device.ps1`，详见脚本内说明。

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数部署 |
| `external-ai-analysis-prompt.md` | 外部 AI 分析规范 |

## 紧急故障排查

**应用无法启动**：检查 `adb logcat` → 确认 `index.html` 语法 → 验证 JS 加载顺序

**数据不同步**：检查网络 → 确认环境 ID → 查看 Console → 验证云函数部署

**余额异常**：检查重复交易 → 验证 pendingRegistry → 查看 Watch 状态 → 检查跨设备冲突
