# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。
> 项目主要交流语言为中文。

---

## 📖 项目概览

**TimeBank** 是一款基于「时间货币」模型的个人时间管理与任务追踪应用，同时提供 Android 原生端（APK）和 PWA 网页端。

| 维度 | 内容 |
|------|------|
| **当前版本** | 已发布 `v9.38.4` / 开发中 `v9.38.4`（本行由 `bump-version.ps1` 在推送时更新，进度见「🎯 当前版本目标与进度」） |
| **数据规模** | 主用户交易记录 4000+ 条（持续增长，性能调优必须考虑） |
| **技术栈** | Vanilla JS（ES6，无框架）+ CSS 变量 + Java 11（minSdk 24 / targetSdk 36）+ CloudBase（JS SDK v2 + Node 18.15 云函数） |
| **平台** | Android APK（悬浮窗 / 小组件）+ PWA 网页端（可安装到桌面） |

---

## 🎯 当前版本：v9.38.2 目标与进度

> 本章节记录当前开发版本的目标与进度，版本收尾（推送）后更新为下一版本。

### 版本主题
**屎山治理**：v9.38.1 把语义字段（`occurredAt / timeSource / timePrecision / businessDate ...`）由"读时推导"改为**随数据持久化**（历史 6,436 条已迁移）并删除推导/解包/自愈等失效兜底层；**v9.38.2 清理 12 处早已跑完的"一次性迁移"死代码**（睡眠状态迁移、夜间计划污染修复、旧主题迁移、卡片顺序迁移、迷你卡开关迁移、AI 旧设置迁移等）+ 死变量/死函数。

**保留未删**（有意）：v9.1.0 `dailyChanges` 首次云端迁移（有云端写入副作用，留作新装/空云端兜底）、`aiCompanion` 幽灵卡片过滤、`getLatestDeviceSettings()`（仍在用）。

### 用户测试关注点（v9.38.1，未来几天重点验证）

> 本版改动的是**数据读取方式**（推导 → 直读字段），覆盖面极广，请逐项确认"与以前一模一样"。

| # | 关注点 | 怎么验 | 异常表现（出现即回报） |
|:-:|---|---|---|
| 1 | **记录列表的时间显示** | 翻最近几天 + 翻到 2026-01~07 的老记录 | 时间变成空白、`—:—` 变多/变少、老睡眠记录时间不对 |
| 2 | **时间流图** | 打开时间流图，看几条老睡眠记录是否**画出来了**（本版把 144 条老睡眠从"时刻未知"升级为真实入睡时刻） | 流图缺块 / 位置明显偏移 |
| 3 | **补录弹窗 + 新填时刻** | 补录一次（默认"只记得是这一天"）→ 再补录一次并选"我记得具体时刻" | 弹窗报错提示不显示、时刻没存进记录 |
| 4 | **导出（全部 / 三个月）** | 两种都导一次，看 `occurredAt / timeSource / businessDate` 是否都在 | 字段缺失、`diffSeconds` 非 0 |
| 5 | **余额与流水一致** | 导出看 `checksum.diffSeconds` 应为 **0**；余额显示与明细对得上 | 出现 1800 秒量级的偏差（= 重复计账复发） |
| 6 | **跨设备睡眠同步** | 手机开始睡眠 → 平板上能看到并结束 | 平板读不到（= profile 解包删除后又被写脏） |
| 7 | **AI 分析 / 时间机器人** | 让 AI 出一次分析 | 时间相关的结论明显不合理 |

**已知非问题**：这台设备启动日志里有 `Failed to register a ServiceWorker`（HTTPS 证书导致，与本次改动无关，离线缓存因此不生效，不影响功能）。

**✅ 已处理**：平板（YLP-W00）已于 21:55:15 重装修复版，与手机同一构建，双端均为 9.38.1。

### 之后的版本怎么继续（路线图）

| 版本 | 内容 | 说明 |
|---|---|---|
| **v9.38.2** ✅ **已完成** | 清理 12 处"一次性迁移"死代码（v9.8.0 sleep×2 / v9.18.2 / v9.19.x / v9.24.0 / v9.31.0 / v9.36.5 / v7.20.0 主题×2 / ai-service 旧设置）+ 死变量 `CATEGORY_TASK_LIMIT` + 死函数 `getLatestDeviceState()` | 已完成并安装平板；刻意保留 v9.1.0 dailyChanges 云端迁移（有云端副作用） |
| **v9.39** | ① 拆分 `app-1.js`（14k 行 → 按域拆 5~6 个文件）② 处理根目录 PWA 副本（改自动生成或删除）③ 商业版分叉 `timebank-commercial/` 封存或删除 | 大改动，需配套验证手段 |
| **v9.40+** | 727 条 `console.log` 收敛为开关式日志；AI 侧按语义字段做服务端统计（届时再建 `(_openid, businessDate)` 索引） | 优化项 |

**给后续会话的铁律**：
1. 语义字段已持久化 —— **新记录缺字段 = 写入端漏了注入**，去查 `addTransaction()`，不要再往读取端加兜底。
2. 删任何函数前，全仓搜调用点（`showFieldError` 与本次 `__unwrappedDoc` 都是这么栽的）。
3. 同类逻辑只能有一份（余额单点更新、时间语义单点评判已是范例）。
4. 每版收尾：两份日志 + `bump-version.ps1` + 双端 diff 校验 + 真机冷启动验错。

> ✅ v9.38.1 **已推送**：手机 BVL-AN00（21:51:58）+ 平板 YLP-W00（21:55:15）；git `b96bc9b` + `59c98ae` 已推送到 `origin/main`。
> ✅ v9.38.2 **已安装并推送**：平板 YLP-W00（21:21:29 → 修复后 21:30:14）+ 手机 BVL-AN00（21:59:06），两端冷启动均 0 报错；versionCode 143；git 已推送 `origin/main`。

### v9.38.2 修复：删除类实时事件同步失效（"开始灵、结束不灵"）

**根因**：SDK 事件构造 `doc: t.Doc && t.Doc !== "{}" ? JSON.parse(t.Doc) : void 0` —— 云端**删除**事件下发 `Doc="{}"` → `change.doc === undefined`；而 Running / Task / Transaction / Daily 四个 watch 回调先取 `doc.taskId` / `doc.date` → 抛 `TypeError` → 整个 snapshot 处理中断。

**症状**：跨设备「结束任务 / 删除任务 / 撤回记录」同步不到，只能等 `ACTIVE_SYNC_FORCE_PULL_INTERVAL_MS`（watch 健康时 5 分钟）兜底补偿；而 add/update 事件 doc 完整 → 开始任务秒级同步。**这解释了"开始很灵、结束要等"**。

**铁律（写进以后每次改 watch 时）**：处理 `change` 时**永远不要假设 `change.doc` 存在**；删除事件要用 `change.docId` + 本地 `xxxCache`（业务ID → docId）反查。四处已统一加固：`const doc = change.doc || {}`。

### v9.38.2 补充验证点（与上表 7 项合并看）

本版**不改变任何可见行为**，只需确认没有"清多了"：
- 主题色正常（设置里换一次主题色）
- 报告页卡片顺序、卡片管理器正常（删了旧顺序迁移）
- 迷你卡片开关四档切换正常
- 睡眠设置页能正常打开、跨设备睡眠仍同步（删了两项睡眠迁移）

### 本版本已完成的改动

| 文件 | 改动 |
|------|------|
| `assets/www/data-dictionary.md` | **新增**：导出数据说明书（唯一维护点，导出时读取） |
| `assets/www/js/app-auth.js` | `exportData()` 升级为导出格式 v2（meta / 语义回填 / 范围过滤）；`importData()` 拒绝范围片段；`repairAndMigrateData()` 加新格式分支 |
| `assets/www/js/app-reports.js` | **P1**：`addTransaction()` 注入语义字段（`createdAt`/`entryMode`/`timeSource`/`timePrecision`/`occurredAt`/`businessDate`/任务与分类快照/`taskType`/`sourceDeviceLabel`/`quantitySeconds`/`durationSource`）并在余额更新后写 `balanceAfter` |
| `assets/www/js/app-reports.js` | **P2**：`getDisplayTime()`（7 处界面展示改为 `occurredAt` 优先）；`getReliableOccurredMs()` / `resolveFlowAnchor()`（时间流图按可信发生时刻定位，**时刻不可信则不画**）；**修复历史缺陷**：补回被删除的 `showFieldError()`（13 处调用曾因此抛 `ReferenceError`、校验提示静默失效） |
| `assets/www/js/ai-brain.js` | **P2**：AI 助手「今日记录清单」改为展示真实发生时刻（当日筛选仍用 `timestamp`） |
| `assets/www/js/app-2.js` | **P1**：补录显式声明"今天/历史日期"两种可信度；按次消费写入 `quantitySeconds` |
| `assets/www/js/app-systems.js` | **P1**：自动补录/修正显式声明"时刻未知"（`occurredAt=null` / `timePrecision='date'`） |
| `assets/www/js/app-1.js` | **P1**：`TX_PROJECTION` 与 `__normalizeTxDoc` 支持语义字段（顶层与 `data` 快照**双向兜底**） |
| `cloudbase-functions/tbMutation/index.js` | **P1**：`SEMANTIC_TX_FIELDS` + `_pickSemanticFields()`，交易增改时把语义字段同步写顶层（**可查询**）；已部署并线上验证 |
| `assets/www/index.html` | **P2**：补录弹窗新增「发生时刻（可选）」输入框（**仅按次类显示**，计时类弹窗保持原样）；新增「导出范围选择」弹窗；「📤 导出数据」改为打开该弹窗 |
| `assets/www/js/app-2.js` | **P2**：补录时刻落库规则（留空＝不编造时刻，填写＝`user`/`minute`）；**修复历史缺陷**：补回被删除的 `showFieldError()`（13 处调用曾因此抛 `ReferenceError`、校验提示静默失效） |
| `assets/www/js/app-auth.js` | **P2**：`showExportModal` / `selectExportRange` / `confirmExport`（范围逻辑早已就绪，本次只补界面入口） |
| `assets/www/css/main.css` | **P2**：`.export-range-grid`（3 列网格按钮 + 深色主题） |
| `assets/www/sw.js` | `ASSETS` 加入 `./data-dictionary.md` |
| `bump-version.ps1` | 双端同步 5→6 条；diff 校验清单加入说明书、`app-auth.js` 及 **app-reports / app-systems / ai-brain / ai-service**（共 9 项） |
| `assets/www/js/app-systems.js` | **P2-fix**：修复利息结算、屏幕时间结算、屏幕时间补结算 **3 处余额重复计账**（与 v9.17.8 同模式的历史遗漏） |
| `assets/www/js/ai-service.js` | **P2**：AI 时段分布与 prompt「交易记录」时间列改用**可信发生时刻**（时刻未知显示 `--:--` 并提示模型忽略，不再把入账占位值 12:00 当真实时段）；修复 2 处 `timestamp` 混型（ISO 字符串与毫秒混存）排序得 `NaN` 的隐患 |

### 关键约束提醒
- 「入睡时刻」= 点击入睡并放下手机的时刻，**不是**真实睡着时刻；`timestamp`（入账时刻）**禁止**改语义，详见 [第 2.5 节](#25-导出数据格式-v2-与说明书v9380-起)
- 性能红线：交易记录 4000+ 条，任何动效不得对 `backdrop-filter` 卡片做 transform 缩放（已验证会导致卡顿）
- 版本号与双端同步：统一由 [第 3 节](#3--版本号与双端同步一键脚本) 的 `bump-version.ps1` 处理

### 后续计划（未实施）
- 若日后需要按语义字段做服务端统计，再建 `(_openid, businessDate)` / `(_openid, occurredAt)` 索引（当前无查询路径，暂不建；索引由云 API RunCommands 统一维护，见 `tbMutation` 内 `INDEX_DEFS` 注释）
- P2 剩余可选项：zip 分片导出 + `aggregates` 聚合区（需新增原生二进制保存接口）
- `timebank-commercial/` 独立商业版副本未同步本轮改动（维护方式待确认）

---

## 📑 规则章节索引

> ⚠️ **AI 必读**：编写/修改代码前先看完相关章节，避免"训练数据本能 vs 项目实际"冲突。

### 🚨 最高优先级：双源镜像 + 权威源

本项目存在 **「双源镜像」** 结构：

| 位置 | 角色 |
|------|------|
| `android_project/app/src/main/assets/www/` | **权威源**（日常开发位置，AI 必须在此修改） |
| `D:\TimeBank\` 根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` / `data-dictionary.md` | **PWA 副本**（仅推送时由脚本同步） |

**判断"该改哪里"**：

| 文件类型 | 应该改的位置 |
|---------|-------------|
| `index.html` / `js/*.js` / `css/main.css` / `sw.js` / `manifest.json` / `data-dictionary.md` | **`assets/www/` 下的同名文件**（不是根目录） |
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
| [2.5 导出格式 v2 与说明书](#25-导出数据格式-v2-与说明书v9380-起) | 导出字段语义 / 说明书维护点 / 范围导出 | **改导出·导入，或做数据分析时** |
| [3. ⚠️ 版本号与双端同步](#3--版本号与双端同步一键脚本) | bump-version.ps1 用法 | 收到"推送"指令时 |
| [4. CloudBase 配置](#4-腾讯云-cloudbase-配置) | 环境 / 数据库 / 云函数 / CLI | 部署云函数时 |
| [5. 构建与运行](#5-构建与运行) | AI 自动安装 / 调试 | 收到"安装/调试"指令时 |
| [6. 已知高危区域](#6-已知高危区域) | 历史修复 / 修改需谨慎 | 修改相关代码前 |
| [7. 代码风格](#7-代码风格指南) | JS / CSS / Android 风格 | 编写新代码前 |
| [8. 安全考虑](#8-安全考虑) | 事务 / 锁 / API Key | 设计云函数时 |

### ⚡ 一句话总结

> **修前端 → 改 `assets/www/`；改导出说明书 → 只改 `assets/www/data-dictionary.md`；推送 → 写日志 + 跑 `bump-version.ps1 <新版本>` + git push；云函数 → 优先 MCP/CLI；版本号 → 用户不指定就不动。**

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
| **安装** | USB 已连接 | 完成实质性改动后，检测到设备即用 `RunCommand` **直接构建安装，无需询问**（见「AI 安装流程」）；未检测到设备时提示用户连接 |
| **调试** | USB 已连接（ADB 可用） | 先执行安装流程；USB 未连接立即放弃并提示；连接成功优先用 Chrome `chrome://inspect` 远程调试 WebView，原生日志用 `adb logcat` 过滤 `chromium:D`、`WebAppInterface:D`、`TimeBank:D` |

### AI 安装流程（自动执行）
> 每次修改代码后，AI 必须用 `RunCommand` 直接执行构建安装，无需用户手动操作。
> 💡 **安装习惯（v9.36.1 起）**：AI 完成实质性改动后，若检测到设备已连接，**直接构建安装，无需询问**；未检测到设备则提示连接，不反复询问。
> 💡 **安装后必须拉起应用（用户明确要求）**：任何一次安装（含仅重装、仅改一行 CSS）完成后，命令末尾都要带上 `am force-stop` + `am start`，让 App 自动启动到可操作状态，**不得只 install 不启动**。

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

### 预览图生成规约
- 预览图能力是平台**内置 skill `dynamic-ui`**（配套 `PureShowWidget` 渲染工具），其实现细节由该 skill 自行维护，本文件不重复、只需引用：需要预览图时**加载 `dynamic-ui` skill**，按其说明渲染即可。
- 预览图仅在对话流渲染，**不写文件、不进 git、不参与版本号与双端同步**。
- **强制调用预览图的场景**：
  1. **UI/UX 设计 / 界面调整时**：布局、配色、动画、交互改动，或多个方案候选对比，先出预览图供确认再实施（含"给我方案 / 做方案"类请求的可视化部分）。
  2. **安装指令但设备未连接时**：完成改动却因 USB 未连接无法安装，除提示「请连接 USB 并开启调试后重试」外，**必须生成预览图**展示本次改动效果（见「AI 安装流程」）。
  3. 其他一图胜千言的场景（数据对比、流程、机制）可复用同一能力。

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
| 生成预览图 / 示意图 | `dynamic-ui` skill（`PureShowWidget`） | 渲染进对话流、不进 git，见「预览图生成规约」 |
| 复杂任务自动委派 | `Task` | 多步骤搜索/分析 |

**禁止事项**：
- ❌ 用 `Write` 覆盖已存在文件 → 一律用 `Edit`/`SearchReplace`
- ❌ 用 `cat`/`grep`/`find` 等 shell 命令 → 用 `Read`/`Grep`/`Glob`
- ❌ 多文件并行 `SearchReplace` 后批量信任结果 → 逐文件修改 + 立即 Read 复核

### PowerShell 红线（防 Bash 语法污染，从源头省 token）

> ⚠️ 本项目 shell 环境是 **Windows PowerShell**，不是 Bash。AI 训练数据偏向 Bash 语法，写 `RunCommand` 命令前**先对照本清单**，避免反复报错再修。

| 红线 | Bash 本能写法 | PowerShell 正确写法 |
|------|--------------|-------------------|
| 反引号 `` ` `` 是**转义符**，不是命令替换 | `` `v `` 想表达字面反引号 | 字面反引号用双反引号 `` `` ``，或直接单引号 `'...'` |
| 不支持 heredoc | `git commit -m "$(cat <<'EOF' ... EOF)"` | 单行消息 `git commit -m "..."`；多行用 here-string `@" ... "@`（`"@` 必须行首） |
| 不支持 `&&` / `||` 短路 | `a && b` | 用 `;` 分隔；需条件判断用 `if ($LASTEXITCODE -eq 0) {...}` |
| 双引号字符串里 `$` 会被展开 | `"$x"` | 字面 `$` 用 `` `$ `` 或单引号 |
| 中文文件编码 | `Get-Content` / 重定向默认 GBK / UTF-16 | 脚本内用 .NET API（见 `bump-version.ps1` 的 `Read-TextPreserve`），或显式 `-Encoding UTF8` |

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
> 📌 **记忆方法**：双源镜像结构——根目录的 `index.html` / `js/` / `css/` / `sw.js` / `manifest.json` / `data-dictionary.md` 是 PWA 同步副本，**不是**开发位置。看到这 6 类文件，第一反应是"在 `assets/www/` 下"。

| 文件 | 用途 | 行数 |
|------|------|------|
| `index.html` | HTML 骨架 | ~4,200 |
| `css/main.css` | CSS 样式 | ~6,300 |
| `js/app-1.js` | 全局变量、DAL、任务卡片、initApp | ~6,200 |
| `js/app-2.js` | 颜色工具、计时/完成/停止、习惯系统 | ~6,100 |
| `js/app-reports.js` | 交易处理、报告系统、AI伙伴UI | ~8,200 |
| `js/app-sleep.js` | 睡眠管理 | ~3,200 |
| `js/app-systems.js` | 设备ID、屏幕时间、金融系统、自动检测 | ~5,300 |
| `js/app-auth.js` | 登录、数据导入导出（导出格式 v2 的实现位置） | ~3,500 |
| `js/ai-service.js` | AI 服务层 | ~2,500 |
| `data-dictionary.md` | **导出数据说明书**（导出时读取并嵌入 `meta.readme`，见 2.5 节） | 202 |

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

### 2.5 导出数据格式 v2 与说明书（v9.38.0 起）

**核心机制**：导出文件自带「说明书 + 字段字典 + 可信度标记」，使外部分析方（其他 AI / 工具）**无需阅读源码**即可正确理解数据。

| 组成 | 位置 | 说明 |
|------|------|------|
| **说明书（人机可读）** | `assets/www/data-dictionary.md` | **唯一维护点**；导出时 `fetch` 读取 → 嵌入 `meta.readme`（**不再单独输出 `.md` 文件**）。改这一个文件即生效，**无同步步骤** |
| **字段字典（机器可读）** | `app-auth.js` 的 `TB_EXPORT_FIELDS` | 需与说明书第 2 节保持一致 |
| **特殊数据类型登记** | `app-auth.js` 的 `TB_SPECIAL_DATA_TYPES` | 新增特殊记录类型时：此处追加 + 说明书第 6 节登记 |
| **兜底文本** | `app-auth.js` 的 `TB_DICT_FALLBACK` | 说明书读取失败时使用（`meta.readmeSource = 'fallback'`），保证导出永不中断 |

**导出格式 v2 的关键字段与硬规则**（做数据分析时必须遵守）：

| 字段 | 含义 | 硬规则 |
|------|------|--------|
| `timestamp` | **入账时刻**（历史补录 = 所选日期的 12:00 占位值） | 云同步增量游标 + 每日汇总归日依据 + 本地排序/索引 → **禁止改语义**。界面展示**不要**直接用它，用 `getDisplayTime(t)` |
| `occurredAt` | **事件发生时刻** | 为 `null` 时**禁止回退使用 `timestamp`**（那是所选日期的 `12:00` 占位值）。界面展示统一走 `getDisplayTime(t)`（`app-reports.js`，`occurredAt` 优先、缺失回退 `timestamp`） |
| `createdAt` | 记录写入时刻 | 与 `timestamp` 相差越大越可能是事后补录 |
| `businessDate` | 只到日的归属日期 | 时刻未知的补录仍有值；睡眠的"夜晚归属"需另行换算 |
| `entryMode` / `timeSource` / `timePrecision` | 录入方式 / 时刻来源 / 时刻精度 | 四档可信度见说明书第 4 节 |
| `quantitySeconds` | 不含倍率的原始量 | `amount` 含额度定价与倍率，**不可当作时长** |

**范围导出（参数预留）**：`exportData(options)` 支持 `{ from, to }`，纯日期按**本地整日边界**解析（起 00:00:00.000 / 止 23:59:59.999）；范围文件写入 `meta.scope.mode = 'range'`、文件名标记为 `timebank_analysis_*`，且**导入时会被拒绝**（防止误把片段当备份恢复导致历史被覆盖）。目前**无界面入口**，不传参即为全量导出。

**余额与流水的一致性**：`meta.checksum` 给出 `earnSeconds` / `spendSeconds` / `netSeconds` / `derivedBalance` / `currentBalance` / `diffSeconds`。

**余额重复计账缺陷（v9.38.0 已修复）**：历史版本共有 **5 处**写入路径在 `addTransaction` 已更新余额后又手动重复累加——① 补录（`saveBackdate`，earn/spend 两处）② 计时消费扣费（`app-2.js`）③ 利息结算 ④ 屏幕时间结算 ⑤ 屏幕时间补结算（后三处在 `app-systems.js`）→ 本地余额比流水净额偏高（实测偏差 = 各路径金额之和，如 360+360+1080=1800）。**v9.38.0 起余额统一由 `addTransaction` 单点更新**；保留的**合法**手动余额变更：习惯奖励合并补偿（`app-2.js` ×2，addTransaction 只入了基础奖励、奖励后合并进同一条交易）、撤回回滚（×2）、利息去重（×2）、暂存清理退款。修复前写入的历史 `balanceAfter` 仍带当时偏差；**云端 `tb_profile.cachedBalance` / `tb_daily` 始终正确**。分析流水请以 `transactions` 为准。

**语义字段的存储位置（双层）**：10 个语义字段（`occurredAt` / `createdAt` / `entryMode` / `timeSource` / `timePrecision` / `businessDate` / `durationSource` / `taskType` / `quantitySeconds` / `balanceAfter`）**同时存在于两处**：

| 位置 | 作用 | 谁写 |
|------|------|------|
| `data.<字段>`（快照） | 随整笔交易一起保存，导出与读回都以此为准 | 前端 `addTransaction` |
| `<字段>`（顶层） | 供数据库**查询/分页/建索引**（嵌套字段无法建索引） | 云函数 `tbMutation` 的 `_pickSemanticFields()` |

读取规则：`__normalizeTxDoc`（`app-1.js`）以 `data` 快照为准、顶层字段兜底（v9.38.1 起为**单向**，不再反向补齐）。**改动任一侧时须同步另一侧**（清单：`app-reports.js`、`app-2.js`、`app-systems.js`、`tbMutation/index.js`、`app-1.js` 的投影与归一）。

**v9.38.1 起：语义字段已随数据持久化**（历史 6,436 条一次性迁移完成，本地 + 云端）。
- 导出 / 界面展示 / 时间流图 **直接读字段**，不再调用 `resolveTransactionTime()` 推导（推导函数仅保留给写入端 `addTransaction` 注入新记录）；
- `enrichTransactionForExport()`、`__unwrapProfileData()` / `__healProfileWrappers()`、`__normalizeTxDoc` 反向补齐、云函数 `ensureIndexes()` 等失效兜底层**均已删除**；
- 新增记录若缺字段 = 写入端漏了注入（不再是"历史数据"问题），请查 `addTransaction`。

**展示与图表的时间口径**：界面展示记录时刻统一走 `formatRecordTime(t)` / `formatRecordTimeHM(t)`（`app-reports.js`）—— 有可信时刻显示 `HH:MM`，**时刻不可信则显示 `—:—`**（不再显示 12:00 / 23:00 等入账占位值），共 6 处：任务/系统任务历史、按日筛选、报告页每日详情、AI 今日清单（饼图 tooltip 只显示日期，用 `getDisplayTime`）；**时间流图**另有专用规则 `resolveFlowAnchor(t, task)` —— **时刻不可信的记录不上时间轴**（`timePrecision='date'`，或历史数据中"补录 + 12:00 占位 + 创建滞后 > 30 分钟"），老数据在画图时用与导出侧一致的规则现场推导（实测 6,434/6,434 判定一致）。排序 / 每日归日 / 交易索引 / 去重 / 云同步**仍一律用 `timestamp`**。

**时间语义的唯一判定实现（v9.38.0 起）**：`app-reports.js` 的 **`resolveTransactionTime(t, task)`** 是**全库唯一**回答「一条记录的时刻可不可信、发生时刻是多少」的地方，返回 `{ occurredAt, entryMode, timeSource, timePrecision, anchorIsStart, createdAt }`。消费方（**必须调用它，禁止复制规则**）：① `enrichTransactionForExport`（导出，`app-auth.js`）② `formatRecordTime` / `formatRecordTimeHM`（界面展示）③ `getReliableOccurredMs` / `resolveFlowAnchor`（时间流图）。**改判定规则（阈值、文案识别、新增解析）只改这一处**，导出/界面/流图自动同步。

**老格式睡眠记录的「升级」例外**：2026-01 ~ 07 的睡眠记录无 `sleepData`、时刻只写在 `description` 里（如 `😴 夜间睡眠: 02:05~10:17`）。`parseLegacySleepRange()` 负责解析（跨零点时入睡归前一天）。**若存量精度为 `date`（旧版本把这类记录判为"时刻未知"），则允许覆盖升级为 `auto / user / exact`** —— 因为 `date` 是旧版本的判定结果，不是用户填写的时间。**绝不覆盖**用户填写的 `live` / `user` / `minute` / `exact`。

**睡眠记录的归属日统一为「醒来日」**：`resolveTransactionTime` 额外返回 `dateBasisMs`（归属日依据），睡眠记录取**醒来时刻**（`sleepData.wakeTime`，或老格式解析出的区间终点），其余记录取 `occurredAt ?? timestamp`。`addTransaction` 与 `enrichTransactionForExport` 的 `businessDate` 都改为用 `dateBasisMs` 计算 → 因此**「这一夜」恒等于 `businessDate − 1 天`**，不再需要"入睡 < 12:00 归前一天"的条件换算。**改归属日口径只改 `dateBasisMs` 一处。**

**两个时间字段的职责分工**：

| | `timestamp` | `occurredAt` |
|---|---|---|
| 语义 | **入账时刻**（账本时间） | **事件发生时刻** |
| 赋值 | App 自动，4 套规则：实时=`now`；补录历史=**所选日期 12:00 占位**；日终系统类=当天 23:00 / 昨日 23:59:59；导入=原样 | 按录入方式：实时=`timestamp`；补录填了时刻=该时刻；时刻未知=`null` |
| 参与一致性链路 | ✅ 云同步增量游标 / 每日归日 / 排序（`getTs`、`_ts`）/ 去重键 `(clientId, timestamp)` | ❌ **完全不参与**（纯附加信息，只被读取） |
| 主要消费方 | 系统内部为主 | 展示（`getDisplayTime`）、时间流图（`resolveFlowAnchor`）、导出分析 |
| 可为空 | 否 | 是（`null` = 时刻未知） |
| 引入版本 | 一直存在 | **v9.38.0 新增** |

> 设计原则：新增字段必须**零风险** → 不去动 `timestamp` 的取值规则，四条一致性链路一个字都不用改，新旧数据自然共存。

**改动导出相关内容时的自查清单**：
1. `data-dictionary.md` 的字段表与 `TB_EXPORT_FIELDS` 是否一致；
2. 新增特殊记录类型是否在说明书第 6 节与 `TB_SPECIAL_DATA_TYPES` **两处**登记；
3. 是否影响了 `timestamp` 的写入语义（**不应影响**）；
4. `bump-version.ps1` 的同步/校验清单是否需同步更新；
5. **新增任何"显示记录时间"的界面代码，必须用 `formatRecordTime` / `formatRecordTimeHM`（或 `getDisplayTime`），禁止直接 `new Date(t.timestamp)`** —— 否则会静默把占位值（12:00 / 23:00）当真实时刻显示。

> 📌 导出格式的设计依据、实施记录与设备实测验收数据见本地未入库文档：`log&data/AI友好数据格式改造方案_2026-09-26.md`。

---

## 3. ⚠️ 版本号与双端同步（一键脚本）

> 核心：所有版本号更新、双端同步、校验统一由 `bump-version.ps1` 完成。AI 不再手动逐处改版本号、逐条跑 Copy-Item、逐对 diff。

**用法**（收到"推送"指令时）：
```powershell
powershell -ExecutionPolicy Bypass -File bump-version.ps1 9.38.0
```

**脚本自动完成**：
1. 读取当前版本（`js/app-1.js` 的 `APP_VERSION`）
2. 替换全部纯版本号位置：
   - `index.html`（权威源）：`<title>` / `.version-subtitle` 副标题 / 关于页"版本"
   - `js/app-1.js`：`APP_VERSION`
   - `sw.js`：文件头注释 + `CACHE_NAME`
   - `build.gradle`：`versionName` / `versionCode`（自动 +1）
   - `AGENTS.md`：当前版本
3. 双端同步：6 条 `Copy-Item`（权威源 → 根目录 PWA 副本，含 `data-dictionary.md`）串行执行，失败即停
4. 校验：`diff` 强校验（index.html / sw.js / data-dictionary.md / app-1.js / app-2.js / app-auth.js / main.css）+ 版本位置残留扫描 + 全库旧版本号快照
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
- **环境 ID**：由 `assets/config/config.production.json`（前端）+ `android_project/app/src/main/assets/config/config.production.json`（Android 层）管理，**不要直接修改硬编码值**。当前生产环境 ID：`cloud1-8gvjsmyd7860b4a3`
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

### 4.3 AI 原生开发工具链（MCP 支持）

**MCP 配置文件**：`C:\Users\15700\.trae\mcp.json`（Trae/Qoder 自动加载）

**可用能力**：通过 CloudBase MCP，AI 可以直接用自然语言操作云资源：
- 🚀 **云函数管理**："部署 timebankSync 云函数"、"列出所有云函数"
- 🗄️ **数据库操作**："查询 tb_transaction 最新 10 条记录"、"创建 tb_test 集合索引"
- 🌍 **环境管理**："列出 CloudBase 环境"、"切换环境到 cloud1-xxx"
- 📦 **云存储操作**："上传文件到云存储"、"列出云存储空间"

**兜底部署链**：
1. **首选**：MCP 自然语言指令（如 "部署 tbMutation 云函数"）
2. **降级**：CLI 命令行 `tcb fn deploy <fnName> --force`
3. **兜底**：手动部署（CloudBase Web 控制台）

> 💡 **提示**：当 MCP 工具调用失败时，AI 会自动输出 CLI 命令供你执行。

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
| **交易时间字段语义（timestamp / occurredAt）** | 高 | v9.38.0 引入，改任一处前必读 [2.5 节](#25-导出数据格式-v2-与说明书v9380-起)：`timestamp` 同时是云同步增量游标与每日汇总归日依据，**改语义会破坏增量同步** |
| **导出/导入兼容** | 中 | v9.38.0 引入导出格式 v2；改 `exportData` / `importData` / `repairAndMigrateData` 后必须回归旧备份导入 |

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
| 导出 / 说明书 | `exportData`, `enrichTransactionForExport`, `loadDataDictionary`, `TB_EXPORT_FIELDS`, `data-dictionary` |

## 调试脚本

> Android 构建/安装/调试默认由 AI 使用 `RunCommand` 直接执行 Gradle Wrapper（`./android_project/gradlew.bat`）+ `adb` 原生命令组合，详见第 5 节。
>
> 用户也可直接运行项目根目录下的 `install-to-device.ps1`，详见脚本内说明。

## 关键文件

| 文件 | 用途 |
|------|------|
| `cloudbase-functions/timebankAI/deploy-guide.md` | AI 云函数部署 |
| `android_project/app/src/main/assets/www/data-dictionary.md` | **导出数据说明书**（随导出文件一并提供给外部 AI；唯一维护点，见 2.5 节） |

## 紧急故障排查

**应用无法启动**：检查 `adb logcat` → 确认 `index.html` 语法 → 验证 JS 加载顺序

**数据不同步**：检查网络 → 确认环境 ID → 查看 Console → 验证云函数部署

**余额异常**：检查重复交易 → 验证 pendingRegistry → 查看 Watch 状态 → 检查跨设备冲突
