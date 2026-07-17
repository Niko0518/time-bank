# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。
> 项目主要交流语言为中文。

---

## 📖 项目概览

**TimeBank** 是一款基于「时间货币」模型的个人时间管理与任务追踪应用，同时提供 Android 原生端（APK）和 PWA 网页端。

| 维度 | 内容 |
|------|------|
| **当前版本** | `v9.20.4`（实时更新，见本文件 L135） |
| **数据规模** | 主用户交易记录 4000+ 条（持续增长，性能调优必须考虑） |
| **技术栈** | Vanilla JS（ES6，无框架）+ CSS 变量 + Java 11（minSdk 24 / targetSdk 36）+ CloudBase（JS SDK v2 + Node 18.15 云函数） |
| **平台** | Android APK（悬浮窗 / 小组件）+ PWA 网页端（可安装到桌面） |

## 📑 规则章节索引

> ⚠️ **AI 必读**：阅读时按下方顺序展开；编写/修改代码前先看完相关章节，避免"训练数据本能 vs 项目实际"冲突。

### 🚨 最高优先级：双源镜像 + 权威源

本项目存在 **「双源镜像」** 结构：

| 位置 | 角色 |
|------|------|
| `android_project/app/src/main/assets/www/` | **权威源**（日常开发位置，AI 必须在此修改） |
| `D:\TimeBank\` 根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` | **PWA 副本**（仅"推送"指令时同步） |

**为什么这条规则最容易被违反**：多数 AI 助手的训练数据中，根目录就是"项目根"，第一反应是修改 `index.html`。本项目打破了这个直觉。

**判断"该改哪里"的快速规则**：

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
| **[AI 必须遵守的硬性约束](#ai-必须遵守的硬性约束)** | 角色称谓 / 禁令 / 用户指令语义 / 模糊指令处理 / 改完代码说明 | 每次会话开始 |
| **[1. 项目概述](#1-项目概述)** | 项目定位 / 数据规模 / 技术栈 | 上下文不熟时 |
| **[2. 项目结构与代码组织](#2-项目结构与代码组织)** | 前端文件 / JS 加载顺序 / Android 源码 | 查找具体文件位置时 |
| **[3. ⚠️ 双端同步规则](#3--双端同步规则最高优先级)** | 推送工作流 / 12 处版本号清单 | 收到"推送"指令时 |
| **[4. 腾讯云 CloudBase 配置](#4-腾讯云-cloudbase-配置)** | 环境信息 / 数据库 / 云函数 / CLI/MCP | 涉及云函数部署时 |
| **[5. 构建与运行](#5-构建与运行)** | AI 自动安装 / 调试 | 收到"安装/调试"指令时 |
| **[6. 已知高危区域](#6-已知高危区域)** | 历史修复记录 / 修改需谨慎的区域 | 修改相关代码前 |
| **[7. 代码风格指南](#7-代码风格指南)** | JS / CSS / Android 风格 | 编写新代码前 |
| **[8. 安全考虑](#8-安全考虑)** | 事务原子性 / 分布式锁 / API Key | 设计云函数 / 安全审计时 |
| **[附录：快速参考](#附录快速参考)** | 搜索关键词 / 调试脚本 / 紧急故障排查 | 排错时 |

### ⚡ 一句话总结

> **修前端 → 改 `assets/www/`；推送前 → 人工跑 5 条 `Copy-Item` + `Get-FileHash`；云函数 → 优先 MCP/CLI；版本号 → 用户不指定就不动。**

---

## AI 必须遵守的硬性约束

### 角色称谓
- 开发者本人= 与你对话的人，是一个技术小白，但开发这个项目时间非常长，所以有一些经验，但在复杂技术问题上你需要解释清楚
- 用户= TimeBank 产品的使用者（产品反馈由开发者转述）
- 在反馈实际问题时，开发者本人也是产品使用者

### 禁令（全局生效）
- ❌ 禁止擅自修改任何位置的版本号（`APP_VERSION`、`CACHE_NAME`、`build.gradle` 的 `versionName`/`versionCode`、HTML `<title>`/`.version-subtitle`、关于页、用户日志版本标题等）。改前必须问："请问本次更新的版本号是多少？"
- ❌ 禁止日常开发自动同步。仅在收到"推送"指令时同步 Android → 根目录
- ❌ 禁止未经"推送"指令执行 `git push`
- ❌ 前端代码默认在 `android_project/app/src/main/assets/www/` 修改，根目录的 `index.html`/`js/`/`css/` 不在日常开发中修改

> 💡 "推送"专属的禁止事项（禁止跳步、版本号未全部同步等）见 [第 3 节 ⚠️](#3--双端同步规则最高优先级) 末尾。

### 用户指令语义
| 指令 | 触发条件 | AI 行为 |
|------|----------|---------|
| **推送** | 用户明确要求推送 | 执行双端同步 → 版本号检查 → `git add -A` → `git commit` → `git push`（详见下方「推送」工作流） |
| **安装** | 用户已通过 USB 连接安卓端与电脑，要求安装新版本至设备 | AI 用 `RunCommand` 直接执行构建安装命令（见下方「AI 安装流程」）。<br>未检测到 USB 设备时 adb install 报错，AI 应放弃并提示用户连接。 |
| **调试** | 用户已通过 USB 连接安卓端与电脑（ADB 可用），要求调试 | 1. 先执行安装流程（见下方「AI 安装流程」）。<br>2. 若 USB 未连接，**立即放弃**，提示用户连接 USB 后重试。<br>3. 若连接成功，优先使用 Chrome `chrome://inspect` 远程调试 WebView；如需原生日志可附加 `adb logcat` 过滤 `chromium:D`、`WebAppInterface:D`、`TimeBank:D`。 |

### AI 安装流程（自动执行）

> **[v9.18.0-fix] AI 直接执行**。每次修改代码后，AI 必须用 `RunCommand` 工具直接执行构建安装命令，无需用户手动操作脚本。
>
> 例外：项目根目录下的 `install-to-device.ps1` / `build-installable-apk.ps1` 是为用户在多设备分发场景下手动运行的，不属于日常开发调试流程。

**标准安装命令**（AI 必须用 `RunCommand` 执行）：
```powershell
# 1. 检测 USB 设备
& "D:\SDK\platform-tools\adb.exe" devices

# 2. 增量构建 Debug APK
cd D:\TimeBank
android_project\gradlew.bat -p android_project assembleDebug

# 3. 安装到设备
& "D:\SDK\platform-tools\adb.exe" install -r -g "android_project\app\build\outputs\apk\debug\app-debug.apk"

# 4. 启动应用
& "D:\SDK\platform-tools\adb.exe" shell am start -n com.jianglicheng.timebank/.MainActivity
```

**完整重建命令**（当修改了 Java/Gradle 文件时使用）：
```powershell
# 1. 清理旧构建
android_project\gradlew.bat -p android_project clean

# 2. 重新构建
android_project\gradlew.bat -p android_project assembleDebug

# 3-4. 安装并启动（同上）
```

**决策原则**：
| 场景 | 推荐做法 |
|------|---------|
| 仅修改前端 JS/CSS/HTML | 标准安装命令（增量构建，最快） |
| 修改 Android Java / Gradle / Manifest | 完整重建命令（先 clean 再 build） |
| 涉及 WebView ↔ Android 交互 | 安装后用 `adb logcat` 抓日志 |
| 需要特定 adb 验证（如权限、广播） | AI 自行编写专项命令，调用 `adb shell ...` |
| 用户未连接 USB | **放弃自动调试**，明确告知用户：「请连接 USB 并开启调试后重试」 |

**示例**：若本次更新修改了悬浮窗服务（`FloatingTimerService.java`），AI 可在安装后自行执行 `adb shell dumpsys activity services | findstr FloatingTimer` 验证服务注册状态，而非仅运行通用脚本。

### 用户的"方案"≠ 实施
用户说"给我一个方案"、"做个方案"、"有什么方案"时，默认先不实施：给 1-3 个候选 + 优缺点 + 推荐一个或者组合 + 等用户确认。

### 模糊指令处理
- 先判断用户指令是否清晰，是否具有歧义
- 指令模糊时主动询问细节
- 不假装听懂，不用"理论上"、"应该可以"回复

### 改完代码必须说明（产品语言）
- 哪些文件被改
- 用户能看到什么变化

### 工作开始前必做
1. 复述用户需求（用自己的话）
2. 若开发者未给出版本号，询问是否涉及版本号修改
3. 列出将修改的文件清单
4. 说明风险/副作用（如有）
5. 涉及版本号、双端同步、自检时直接用 `SearchReplace` / `Grep` / `Copy-Item` / `Get-FileHash` 工具即可

### AI 工具对照表

| 任务 | 工具 | 备注 |
|------|------|------|
| 读文件 | `Read` | 必传绝对路径 |
| 修改文件（精确替换） | `SearchReplace` | 唯一文件匹配时用绝对路径 |
| 创建新文件 | `Write` | 不要用于修改已存在文件 |
| 删除文件 | `DeleteFile` | 一次可多个 |
| 按文件名搜索 | `Glob` | 例如 `**/gradlew.bat` |
| 按内容搜索 | `Grep` | 支持正则，输出模式可选 |
| 执行 PowerShell / Bash | `RunCommand` | 默认 powershell5 |
| 复杂任务自动委派 | `Task` | 适合多步骤搜索/分析 |

**禁止事项**：
- ❌ 用 `Write` 覆盖已存在文件 → 一律改用 `SearchReplace`
- ❌ 用 `cat`/`grep`/`find` 等 shell 命令 → 改用专用工具 `Read`/`Grep`/`Glob`

### 日志（推送前强制流程）

> 🔄 **v9.18.0 起强制规范**：每次收到"推送"指令时，AI 必须**自动生成两份日志草稿**（技术 + 用户），开发者可在推送前润色。
>
> 📌 **HTML 注释中的撰写指南**（`index.html` L1379-1410）是用户日志模板的唯一权威来源——AI 撰写用户日志时必须严格遵循其格式（`<div class="version-history-item">` 模板、`[Feat]/[Fix]/[UX]/[UI]/[Perf]/[Core]` 标签、降序排列、emoji 等）。

#### 两份日志的分工

| 维度 | 用户日志（HTML） | 技术日志（docs/version-changelog.md） |
|------|----------------|--------------------------------------|
| 受众 | 终端用户（产品使用者） | 开发者本人 + 后续 AI 助手 |
| 内容风格 | 用户价值导向，避免技术术语 | 技术导向，含根因 / 方案 / 衍生收益 |
| 长度 | 每版本 3-8 行 | 每版本 30-200 行 |
| 触发时机 | **AI 每次推送自动生成草稿** | **AI 每次推送自动生成草稿**（覆盖"重要且影响深远"门槛） |
| 位置 | `index.html` 的 `<details><summary>版本更新日志</summary>` 块内顶部 | `docs/version-changelog.md` 顶部追加 `## vX.Y.Z (YYYY-MM-DD)` |

#### 技术日志入选门槛（"重要且影响深远"标准）

AI 必须判断本次改动是否属于以下 5 类之一，**至少命中 1 条则写技术日志**：

1. **数据完整性风险**：可能导致数据丢失、余额计算错误、双倍计入、孤儿数据
2. **跨设备/跨平台行为变更**：影响 Watch 监听、云端同步、Android↔PWA 一致性的修复
3. **架构/配置重构**：引入新架构、新配置体系、新加载机制（如 v9.17.9 的 ConfigManager）
4. **性能显著影响**：冷启动时间、滚动帧率、内存占用变化 ≥ 30%
5. **历史 Bug 修复**：用户曾反馈过、且根因在 2 处以上代码的复杂修复

**不属于上述 5 类的纯 UI 调整、变量重命名、注释更新、性能微优化 → 不写技术日志**，但仍需写用户日志（如果有用户感知）。

#### AI 推送流程中的日志生成顺序

1. **修改代码完成后**（推送前）：用 `git diff --stat` 或 `RunCommand` 执行 `git status --short` 列出本次改动文件清单
2. **判断是否属于 5 类之一** → 决定技术日志是否需要写
3. **撰写技术日志草稿**（追加到 `docs/version-changelog.md` 顶部）→ 询问开发者"是否需要调整技术细节？"
4. **撰写用户日志草稿**（追加到 `index.html` 的 `<details>` 块顶部）→ 询问开发者"用户可读性是否符合预期？"
5. **同步双端**（5 条 Copy-Item + Get-FileHash）→ 推送前最终自检

#### 日志保留策略

- **用户日志**（`index.html`）：保留最近 **22 个版本**（保持页面加载性能 + 可读性），更早版本可通过 `docs/version-changelog.md` 查询
- **技术日志**（`docs/version-changelog.md`）：保留**全部版本**（不分页、不归档），作为开发历史档案
- **用户反馈**（`log&data/bug反馈.txt`）：手动维护，不进 git（被 `.gitignore` 忽略）

### 文件维护
- 为防止本文档过大，技术日志已剥离至独立文档 [`docs/version-changelog.md`](./docs/version-changelog.md)
- 所有历史版本日志合并存放在 `docs/version-changelog.md` 单个文件，不做归档拆分

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用，同时提供网页端。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。

**典型使用场景**：
| 平台 | 设备 | 使用方式 |
|------|------|---------|
| **Android** | 手机端 | 原生 APK，可使用悬浮窗计时器、小组件等原生功能 |
| **Android** | 平板端 | 原生 APK，支持分屏和大屏适配|
| **网页端** | 浏览器 | PWA 应用，可安装到桌面 |

**技术栈**：
| 层级 | 技术 |
|------|------|
| **前端** | Vanilla JS (ES6)，无框架 |
| **样式** | CSS 变量，支持暗色模式、三种卡片视觉 |
| **Android** | Java 11，minSdk 24，targetSdk 36 |
| **云服务** | 腾讯云 CloudBase（JS SDK v2） |
| **云函数** | Node.js 18.15 |

> ⚠️ **重要背景**：当前主要用户的交易记录已累计 **4000+ 条**，且持续增长中。这是所有涉及数据遍历、全量加载、批量操作的优化与调整必须考虑的前提条件。4000+ 条意味着任何 O(N) 或 O(N×M) 的操作都需要审视性能影响。

---

## 2. 项目结构与代码组织

### 2.1 前端文件（权威源：`android_project/app/src/main/assets/www/`）

> 🚨 **【铁律 1 详解】**所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行，**禁止**在根目录修改。
>
> 📌 **完整路径前缀**：`D:\TimeBank\android_project\app\src\main\assets\www\`
>
> 📌 **记忆方法**：本项目是"双源镜像"结构——根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` 是 PWA 网页端的同步副本，**不是**开发位置。任何时候看到这 5 类文件，第一反应应该是"在 `assets/www/` 下"，**不是**"在根目录下"。

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

## 3. ⚠️ 双端同步规则（最高优先级）

> 📌 **路径说明**：本节中提到的 `index.html` / `js/app-1.js` / `sw.js` 等，默认指 `android_project/app/src/main/assets/www/` 下的文件（即**权威源**），不是根目录的副本。

**权威源**: `android_project/app/src/main/assets/www/`

**默认修改位置**: 所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行

**同步时机**: 仅在收到"推送"指令时，同步到根目录

**同步命令**（仅推送前执行）:
```powershell
Copy-Item "android_project/app/src/main/assets/www/index.html" "index.html" -Force
Copy-Item "android_project/app/src/main/assets/www/sw.js" "sw.js" -Force
Copy-Item "android_project/app/src/main/assets/www/manifest.json" "manifest.json" -Force
Copy-Item "android_project/app/src/main/assets/www/css/*" "css/" -Recurse -Force
Copy-Item "android_project/app/src/main/assets/www/js/*" "js/" -Recurse -Force
```

### 「推送」工作流
1. **代码修改**：在 `android_project/app/src/main/assets/www/` 目录下进行（推送之前的整个开发周期都是这一步）
2. **双端同步**：执行上述同步命令（Android → 根目录）
3. **Hash 验证**：运行 `Get-FileHash` 确认两端完全一致
4. **检查版本号**：确认以下 **11 个位置** 的版本号已更新：

> ## 🚨🚨🚨 防遗忘强制清单（AI 必读）�🚨🚨
>
> **11 处版本号位置（全部必须同步修改，缺一不可）**：
>
> **📂 权威源（6 处，必须改）**：
> 1. **`android_project/app/src/main/assets/www/index.html` L243：`.version-subtitle`（首页副标题）** 🚨🚨 **最高优先级！用户打开应用第一眼看到！** — 这是历史反复遗漏的位置，AI 必须**最先**修改，且必须用 SearchReplace 工具精确替换（不能用批量正则）。副标题需写一句简短的特性词组（如"启动协调 · 冷启动修复"）。
> 2. `android_project/app/src/main/assets/www/index.html` L12：`<title>` 标签
> 3. `android_project/app/src/main/assets/www/index.html` L1380：关于页"版本 vX.Y.Z"
> 4. `android_project/app/src/main/assets/www/index.html` L1440 附近：用户日志最新条目标题"版本 vX.Y.Z (日期)"
> 5. `android_project/app/src/main/assets/www/js/app-1.js` L15：`APP_VERSION` 常量
> 6. `android_project/app/src/main/assets/www/sw.js` L1 + L14：注释 + `CACHE_NAME`
>
> **📂 Android 工程文件（2 处）**：
> 7. `android_project/app/build.gradle`：`versionName "X.Y.Z"`
> 8. `android_project/app/build.gradle`：`versionCode`（每次 +1）
>
> **📂 根目录同步副本（3 处，必须用 Copy-Item 同步）**：
> 9. `index.html` L12：`<title>`（与权威源 L12 一致）
> 10. `index.html` L243：`.version-subtitle`（与权威源 L243 一致）
> 11. `index.html` L1380：关于页（与权威源 L1380 一致）
>
> **📂 AGENTS.md（1 处）**：
> - `AGENTS.md` L135：`**当前版本**：`vX.Y.Z`实时更新`
>
> **📌 AI 每次修改版本号必须自检的步骤**：
> 1. 用 `Read` 工具逐个打开上述 11 处位置，确认版本号字符串一致（注意：`build.gradle` 还有独立的 `versionCode`，每次 +1）
> 2. 用 `RunCommand` 执行 `Get-FileHash "android_project\app\src\main\assets\www\index.html","index.html"` 验证双端 hash 一致（同步后）
> 3. 如发现旧版本残留，用 `SearchReplace` 立即修复再继续
>
> **🛑 历史代码注释（`// [v9.15.1] 增强` 等）不要改** —— 这些是历史变更说明，不是当前版本号。
> **🛑 历史版本日志条目（`版本 v9.15.1 (2026-06-24)`）不要改** —— 这是已发布版本的历史记录。

5. **撰写日志**（强制）：AI 必须自动生成两份草稿——技术日志（`docs/version-changelog.md`）和用户日志（`index.html` 的 `<details>` 块），详见上方「日志（推送前强制流程）」章节
6. **执行推送**：仅当以上检查全部通过后，执行 `git add -A` → `git commit` → `git push`

> ⚠️ **禁止事项**：
> - ❌ 未经用户"推送"指令，不得擅自执行 `git push`
> - ❌ 不得擅自升级版本号（版本号由用户指定）
> - ❌ 不得跳过双端同步直接推送
> - ❌ **不得在 11 处版本号未全部同步前推送**（典型症状：首页副标题是 9.15.1 但其他位置是 9.15.2）
> - ❌ **不得跳过日志撰写直接推送**（v9.18.0 起强制规范）


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
- CLI 授权过程可能需要一段时间，用户要登陆网站并确认授权码，请等待至少1分钟，如果1分钟后无反应则询问用户是否手动部署

**手动降级流程**：
1. AI 输出/修改云函数在 `D:\TimeBank\cloudbase-functions` 供用户完整复制
2. AI 给出**手动部署步骤**（CloudBase Web 控制台 `https://tcb.cloud.tencent.com/dev`）
3. 用户在控制台手动粘贴代码
4. AI 等待用户确认部署完成

### 4.2 环境信息
- **环境 ID**: 由 `assets/config/config.production.json`（前端）+ `android_project/app/src/main/assets/config/config.production.json`（Android 层）管理，**不要直接修改此处的硬编码值**。当前生产环境 ID：`cloud1-8gvjsmyd7860b4a3`
- **SDK 版本**: v2.24.10（前端 JS SDK）
- **CLI 版本**: v3.5.6（见 4.3 节）
- **配置文件**: [cloudbaserc.json](file:///d:/TimeBank/cloudbaserc.json) —— 定义函数根目录 `cloudbase-functions`、4 个云函数的 runtime/timeout/handler

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

> ⚠️ **v9.0.0 重要修复**：Web SDK `callFunction` 不会自动注入 `context.OPENID`，所有云函数统一使用 `context.OPENID \|\| event._openid \|\| event.data?._openid` 获取用户身份。

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

兜底链：MCP 未加载 → `tcb fn deploy <fnName> --force`（CLI v3.5.6 已全局安装）→ 手动部署（CloudBase Web 控制台）。

Skills 已安装在 `.agents\skills/cloudbase/`（71 个），覆盖 React/小程序/云函数/AI Agent 等场景。Trae 重启后自动加载。

---

## 5. 构建与运行

### Android 安装（AI 自动执行）

> 🔥 **[v9.18.0-fix] AI 自动安装**。开发者无需手动执行任何脚本或命令。AI 在每次修改代码后，自动使用 `RunCommand` 工具执行构建安装流程。

#### 给开发者的话

```
1. 把手机用 USB 线连接到电脑（确保手机已开启 USB 调试）
2. 告诉 AI "安装" 或等待 AI 自动执行
3. 等待完成，应用自动启动
```

#### 给 AI 助手的话

**必须**使用 `RunCommand` 工具直接执行构建安装命令，**不要**让开发者手动执行任何操作。

**标准安装流程**（按顺序执行）：

```powershell
# 1. 检测 USB 设备
& "D:\SDK\platform-tools\adb.exe" devices

# 2. 增量构建 Debug APK
cd D:\TimeBank
android_project\gradlew.bat -p android_project assembleDebug

# 3. 安装到设备
& "D:\SDK\platform-tools\adb.exe" install -r -g "android_project\app\build\outputs\apk\debug\app-debug.apk"

# 4. 启动应用
& "D:\SDK\platform-tools\adb.exe" shell am start -n com.jianglicheng.timebank/.MainActivity
```

**完整重建流程**（修改了 Java/Gradle/Manifest 文件时使用）：

```powershell
# 1. 清理旧构建
cd D:\TimeBank
android_project\gradlew.bat -p android_project clean

# 2. 重新构建
android_project\gradlew.bat -p android_project assembleDebug

# 3-4. 安装并启动（同上）
```

**注意事项**：
- ❌ 不要输出命令让开发者手动执行
- ✅ 使用 `RunCommand` 工具自动执行
- ✅ 如果 USB 未连接，提示用户连接后重试

#### 输出路径
- Release: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### 调试
- **首选：Chrome DevTools**: 通过 Chrome 远程调试 WebView (`chrome://inspect`)
  - 荣耀/鸿蒙设备默认过滤 `Log.d`，`adb logcat` 原生级别日志收集受限；WebView console.log 不受影响。
- **AI 调试时**: 用 `RunCommand` 执行 `adb logcat -v time -s chromium:D WebAppInterface:D TimeBank:D` 抓日志
- **Console 日志**: 前端 console.log 会输出到 Chrome DevTools

---

## 6. 已知高危区域（修改需谨慎）

| 区域 | 风险等级 | 相关版本 |
|------|---------|---------|
| **睡眠时区计算** | 高 | v7.13.1 修复过 |
| **配额+自动检测补录** | 高 | 计时消费配额曾出错 |
| **习惯连胜系统** | 高 | v7.39.x 重构 |
| **Watch 连接与同步** | 高 | v8.2.2 修复 |
| **金融系统利息计算** | 高 | v8.2.14 修复 |
| **跨设备 running 同步** | 高 | v8.2.15 修复 |

---

## 7. 代码风格指南

### JavaScript
- **无框架**：纯 Vanilla JS，全局作用域函数
- **内联事件**：大量使用 `onclick` 处理器
- **注释**：中文为主，关键修复标注版本号（如 `// [v8.2.2] 修复...`）

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

> 本项目的 Android 构建/安装/调试默认由 AI 使用 `RunCommand` 工具直接执行 Gradle Wrapper (`./android_project/gradlew.bat`) + `adb` 原生命令组合，详见第 5 节。
>
> 用户也可直接运行项目根目录下的 `install-to-device.ps1` / `build-installable-apk.ps1`，详见脚本内说明。

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数部署 |
| `external-ai-analysis-prompt.md` | 外部 AI 分析规范 |

## 紧急故障排查

**应用无法启动**：检查 `adb logcat` → 确认 `index.html` 语法 → 验证 JS 加载顺序

**数据不同步**：检查网络 → 确认环境 ID → 查看 Console → 验证云函数部署

**余额异常**：检查重复交易 → 验证 pendingRegistry → 查看 Watch 状态 → 检查跨设备冲突