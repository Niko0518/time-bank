# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。
> 项目主要交流语言为中文。
---

# 🚨 AI 编程助手必读
当前项目最重要的是实现同步和监听机制的完善。我希望应用能达到通信软件级别的同步和监听能力，任何一端发出的任何指令，都能瞬间被其他端同步，任何任务状态也都被实施同步。目前距离该目标相去甚远。

> ⚠️ **本项目存在「双源镜像」结构**：`D:\TimeBank\` 根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` 与 `android_project\app\src\main\assets\www\` 下的同名文件**是同一份代码的两份拷贝**。
>
> ⚠️ **但权威源只有一个**：`android_project\app\src\main\assets\www\`。根目录的副本**仅用于 PWA 网页端部署**，**不是**开发位置。
>
> ⚠️ **绝大多数 AI 助手会直接修改根目录文件——这是错的**。本节就是为了让这种错误"零发生"。

## ⛔ 为什么 AI 经常犯这个错 + 如何彻底避免

**根因**：多数 AI 助手的训练数据中，根目录就是"项目根"，打开项目第一反应是 `index.html`、`js/app-1.js`。本项目打破了这个直觉。

**强制约束**（每次编辑前自问）：
1. ☐ 我要编辑的文件路径，是否包含 `android_project/app/src/main/assets/www/`？
2. ☐ 如果**不包含**，我是否已经确认这是 Android Java / 资源 / 配置文件（这些可以在 `android_project/app/src/main/` 下，但**不在** `assets/www/`）？
3. ☐ 如果是 `index.html` / `js/*` / `css/*` / `sw.js` / `manifest.json` 这 5 类前端文件之一，是否在 `assets/www/` 下？

> 🛑 **如果三个自问中有任何一个答案不是明确的"是"，停下来重新定位文件路径**。

## ⛔ 例外（不在 `assets/www/` 下修改的文件）

下列文件**不在** `assets/www/` 下，AI 可以直接编辑**它们各自的位置**：

| 类别 | 路径前缀 | 示例 |
|------|---------|------|
| **Android Java 源码** | `android_project/app/src/main/java/com/jianglicheng/timebank/` | `MainActivity.java` / `WebAppInterface.java` / `FloatingTimerService.java` |
| **Android 资源** | `android_project/app/src/main/res/` | `layout/*.xml` / `values/strings.xml` |
| **Android 配置** | `android_project/app/src/main/AndroidManifest.xml` / `android_project/app/build.gradle` | 清单、Gradle |
| **云函数** | `D:\TimeBank\cloudbase-functions\` | `tbMutation/index.js` / `timebankSync/index.js` |
| **项目元文件** | `D:\TimeBank\` 根 | `AGENTS.md` / `cloudbaserc.json` / `.gitignore` |
| **调试脚本** | `D:\TimeBank\scripts\` / `D:\TimeBank\docs/` | `pre-push-check.ps1` / 设计文档 |

📌 根目录的同步副本（js/app-1.js / index.html）**未修改**——
   根据规范，根目录副本仅在您下达"推送"指令时统一同步。
   届时需要：
   1. 运行 scripts/sync-all.ps1（或下方手工 Copy-Item 命令）
   2. 验证 hash 一致
   3. 检查 9 处版本号位置
   4. 执行 git add / commit / push
```

---

## AI 必须遵守的硬性约束

### 角色称谓
- 开发者本人= 与你对话的人，是一个技术小白，但开发这个项目时间非常长，所以有一些经验，但在复杂问题上你需要解释清楚
- 用户= TimeBank 产品的使用者（产品反馈由开发者转述）
- 在反馈实际问题时，开发者本人也是产品使用者

### 最高优先级禁令
- ❌ 禁止擅自修改任何位置的版本号（`APP_VERSION`、`CACHE_NAME`、`build.gradle` 的 `versionName`/`versionCode`、HTML `<title>`/`.version-subtitle`、关于页、用户日志版本标题等）。改前必须问："请问本次更新的版本号是多少？"
- ❌ 禁止日常开发自动同步。仅在收到"推送"指令时同步 Android → 根目录
- ❌ 禁止未经"推送"指令执行 `git push`
- ❌ 前端代码默认在 `android_project/app/src/main/assets/www/` 修改，根目录的 `index.html`/`js/`/`css/` 不在日常开发中修改

### 用户指令语义
| 指令 | 触发条件 | AI 行为 |
|------|----------|---------|
| **推送** | 用户明确要求推送 | 执行双端同步 → 版本号检查 → `git add -A` → `git commit` → `git push`（详见下方「推送」工作流） |
| **安装** | 用户已通过 USB 连接安卓端与电脑，要求安装新版本至设备 | **首选**：AI 根据本次更新内容，自主撰写针对性测试命令或脚本（见下方「AI 自主测试命令」）。<br>**默认回退**：运行 `D:\TimeBank\log&data\sync.ps1` 快速构建并安装 Debug APK。未检测到 USB 设备时脚本返回码 2，AI 应放弃并提示用户连接。 |
| **调试** | 用户已通过 USB 连接安卓端与电脑（ADB 可用），要求调试 | 1. 先执行安装流程（`sync.ps1 -Logcat -Silent` 或 AI 自主命令）。<br>2. 若 USB 未连接（返回码 2），**立即放弃**，提示用户连接 USB 后重试。<br>3. 若连接成功，优先使用 Chrome `chrome://inspect` 远程调试 WebView；如需原生日志可附加 `adb logcat` 过滤 `chromium:D`、`WebAppInterface:D`、`TimeBank:D`。 |

### AI 自主测试命令（推荐）
> `sync.ps1` 是**通用快速脚本**，但不是唯一选项。AI 编程助手应根据**当前版本更新的具体内容**，自行设计更精准的安装/验证命令，以充分测试更新效果。

**决策原则**：
| 场景 | 推荐做法 |
|------|---------|
| 仅修改前端 JS/CSS/HTML | `sync.ps1`（增量构建，最快） |
| 修改 Android Java / Gradle / Manifest | `sync.ps1 -Clean`（完整重建） |
| 涉及 WebView ↔ Android 交互 | `sync.ps1 -Logcat`（安装后自动抓日志） |
| 需要特定 adb 验证（如权限、广播） | AI 自行编写专项 PowerShell 脚本，调用 `adb shell ...` |
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

### 日志
- 用户日志（HTML 版本更新日志）：仅用户明确指令才改
- 技术日志（已剥离至独立文档 [`docs/version-changelog.md`](./docs/version-changelog.md)）：仅记录"重要且影响深远"的改动

### 文件维护
- 为防止本文档过大，技术日志已剥离至独立文档 [`docs/version-changelog.md`](./docs/version-changelog.md)
- 较旧版本可归档至 `docs/version-history-archive.md`

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用，同时提供网页端。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。

**典型使用场景**：
| 平台 | 设备 | 使用方式 |
|------|------|---------|
| **Android** | 手机端 | 原生 APK，可使用悬浮窗计时器、小组件等原生功能 |
| **Android** | 平板端 | 原生 APK，支持分屏和大屏适配（尚未实现） |
| **网页端** | 浏览器 | PWA 应用，可安装到桌面 |

**技术栈**：
| 层级 | 技术 |
|------|------|
| **前端** | Vanilla JS (ES6)，无框架 |
| **样式** | CSS 变量，支持暗色模式、三种卡片视觉 |
| **Android** | Java 11，minSdk 24，targetSdk 36 |
| **云服务** | 腾讯云 CloudBase（JS SDK v2） |
| **云函数** | Node.js 18.15 |

**当前版本**：`v9.16.0`实时更新

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
4. **检查版本号**：确认以下 **11 个位置** 的版本号已更新（v9.12.0 起从 9 恢复为 10）：

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
> **📌 AI 每次修改版本号必须自检的命令**：
> ```powershell
> # 1) 权威源 6 处（必须命中 9.15.2）
> Get-ChildItem -Path "android_project\app\src\main\assets\www" -Recurse -Include index.html,app-1.js,sw.js,build.gradle | ForEach-Object { Select-String -Path $_.FullName -Pattern "v?9\.15\.[12]|versionCode|versionName|APP_VERSION|CACHE_NAME" }
> # 2) 根目录副本 3 处（推送后必须命中 9.15.2）
> Get-ChildItem -Path . -Include index.html,AGENTS.md -Depth 0 | ForEach-Object { Select-String -Path $_.FullName -Pattern "v?9\.15\.[12]|当前版本" }
> # 3) 验证根目录 3 处与权威源一致
> Get-FileHash "android_project\app\src\main\assets\www\index.html","index.html"
> ```
> **如果自检发现 9.15.1 残留，立即修复后再推送。**
>
> **🛑 历史代码注释（`// [v9.15.1] 增强` 等）不要改** —— 这些是历史变更说明，不是当前版本号。
> **🛑 历史版本日志条目（`版本 v9.15.1 (2026-06-24)`）不要改** —— 这是已发布版本的历史记录。

5. **检查日志**：确认技术日志（本文件第二部分）和用户日志（HTML 版本更新日志）已撰写
6. **执行推送**：仅当以上检查全部通过后，执行 `git add -A` → `git commit` → `git push`

> ⚠️ **禁止事项**：
> - ❌ 未经用户"推送"指令，不得擅自执行 `git push`
> - ❌ 不得擅自升级版本号（版本号由用户指定）
> - ❌ 不得跳过双端同步直接推送
> - ❌ **不得在 11 处版本号未全部同步前推送**（典型症状：首页副标题是 9.15.1 但其他位置是 9.15.2）


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
- **环境 ID**: `cloud1-8gvjsmyd7860b4a3`
- **SDK 版本**: v2.24.10（前端 JS SDK）
- **CLI 版本**: v3.5.6（见 4.3 节）
- **配置文件**: [cloudbaserc.json](file:///d:/TimeBank/cloudbaserc.json) —— 定义环境 ID、函数根目录 `cloudbase-functions`、4 个云函数的 runtime/timeout/handler

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

### 4.3 AI 原生开发工具链（CloudBase CLI v3 + MCP + Skills）

> ⚠️ **重要基础设施升级**：本项目已全面接入 CloudBase AI 原生开发工作流，支持在 Trae IDE 中通过自然语言直接操作云资源。AI 编程助手在涉及 CloudBase 操作时，优先尝试使用 MCP/Skills 自动完成；若工具未暴露，则回退到 `tcb` 命令行。

#### CloudBase CLI v3
- **版本**：3.5.6（已全局安装）
- **安装/升级**：`npm install -g @cloudbase/cli`
- **验证**：`tcb --version`
- **v3 重要变更**：`--envId` 兼容但推荐 `--env-id`；废弃 `tcb functions:*` 命名空间，推荐 `tcb fn ...`；新增 `tcb logs search` 统一日志、`tcb docs` 终端查文档、`tcb api` 直接调腾讯云 API

#### CloudBase MCP（Model Context Protocol）
- **作用**：让 Trae AI 助手直接调用 CloudBase API，无需手动敲命令
- **全局配置路径**：`C:\Users\15700\.trae\mcp.json`
- **配置内容**：
```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "INTEGRATION_IDE": "Trae"
      }
    }
  }
}
```
- **对 AI 编程助手的使用方式**：
  - 在 Trae 的 **Builder with MCP** 或 **Agent** 模式中，可直接用自然语言指令操作云资源
  - 示例指令：
    - "部署 timebankSync 云函数"
    - "查看 timebankAI 最近 10 分钟的报错日志"
    - "列出当前环境所有数据库集合"
    - "为 tb_task 创建 _openid + _updateTime 复合索引"

#### CloudBase Skills
- **安装命令**：`npx skills add tencentcloudbase/cloudbase-skills -y`
- **安装路径**：`.agents\skills\cloudbase`
- **Agents 数量**：71 个
- **覆盖范围**：Web 应用（React/Vue/Next/Nuxt）、微信小程序、uni-app、云函数、云托管（CloudRun）、云存储、NoSQL/MySQL 数据库、内置大模型（混元/DeepSeek/Kimi/GLM/MiniMax）、第三方 LLM 接入、AI Agent/智能体、运维巡检诊断、架构设计 Spec workflow（需求文档/技术方案/tasks.md）
- **使用方式**：Trae 重启后 Skills 自动加载。在对话中直接描述 CloudBase 相关需求即可触发 Skill 工具

---

## 5. 构建与运行

### Android 安装（`sync.ps1`）
权威脚本：`D:\TimeBank\log&data\sync.ps1`

**参数速查**：
| 参数 | 作用 | 典型场景 |
|------|------|---------|
| （无参） | 增量构建 + 安装 + 启动 | 日常前端改动，速度最快 |
| `-Clean` | 先 `clean` 再构建 | 修改了 Java/Gradle/Manifest |
| `-NoLaunch` | 安装后不自动启动 | 仅需替换 APK，手动验证 |
| `-Logcat` | 启动后自动抓日志 30 秒 | 调试 WebView ↔ Android 交互 |
| `-Silent` | AI/自动化模式：无交互按键，USB 未连时返回码 2 | AI 助手自动调用 |

**组合示例**：
```powershell
# AI 调试模式：完整重建 + 安装 + 自动抓日志（无交互）
& "D:\TimeBank\log&data\sync.ps1" -Clean -Logcat -Silent

# 快速迭代：增量构建 + 启动
& "D:\TimeBank\log&data\sync.ps1"
```

**脚本特性**：
- **智能放弃**：未检测到 ADB 设备时，返回码 `2`，AI 应立即放弃并提示用户连接 USB。
- **ADB 自动查找**：优先 PATH，其次回退到常见 Android SDK 安装路径。
- **版本号显示**：自动读取 `build.gradle` 中的 `versionName`/`versionCode`，安装前确认版本。
- **增量构建**：默认不 `clean`，复用 Gradle 缓存；仅 `-Clean` 时完整重建。
- **权限自动授予**：安装参数 `-g` 自动授予所有运行时权限，减少手动操作。

**输出路径**：
- Release: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### PWA 安装（网页端）
1. 在浏览器中打开网页端地址
2. 浏览器检测到 Service Worker 后会自动显示安装提示
3. 或手动点击浏览器菜单 → "安装" → "时间银行"
4. 安装后可从桌面/开始菜单启动，离线可用

### 调试
- **首选：Chrome DevTools**: 通过 Chrome 远程调试 WebView (`chrome://inspect`)
  - 荣耀/鸿蒙设备默认过滤 `Log.d`，`adb logcat` 原生级别日志收集受限；WebView console.log 不受影响。
- **原生日志**: `sync.ps1 -Logcat` 自动过滤 `chromium:D`、`WebAppInterface:D`、`TimeBank:D`。
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



# 第二部分：版本更新日志（已剥离到独立文档）

> 完整的版本更新日志（含 v9.0.0 ~ v9.4.0）已剥离到独立文档：[`docs/version-changelog.md`](./docs/version-changelog.md)。
>
> 本节仅保留"日志管理规则"的简述（来自原 AGENTS.md 行 89-95）。

### 日志管理规则

- **用户日志**（HTML 版本更新日志，位于 `index.html`）：仅用户明确指令才改
- **技术日志**（[`docs/version-changelog.md`](./docs/version-changelog.md)）：记录"重要且影响深远"的改动

### 历史归档

- 更早版本（v8.2 之前）见 [`docs/version-history-archive.md`](./docs/version-history-archive.md)
- 文档维护：为防止 AGENTS.md 过大，已将日志部分剥离到独立文档

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

| 脚本 | 用途 |
|------|------|
| `scripts/inspect_segment.ps1` | 分析代码段括号匹配 |
| `scripts/pre-push-check.ps1` | 推送前检查 |
| `scripts/analyze_interest*.ps1` | 利息数据分析 |
| `scripts/verify_balance.ps1` | 余额验证 |

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数部署 |
| `cloudbase-functions/taskLock-deploy-guide.md` | 分布式锁部署 |
| `external-ai-analysis-prompt.md` | 外部 AI 分析规范 |

## 紧急故障排查

**应用无法启动**：检查 `adb logcat` → 确认 `index.html` 语法 → 验证 JS 加载顺序

**数据不同步**：检查网络 → 确认环境 ID → 查看 Console → 验证云函数部署

**余额异常**：检查重复交易 → 验证 pendingRegistry → 查看 Watch 状态 → 检查跨设备冲突