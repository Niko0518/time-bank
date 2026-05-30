# TimeBank (时间银行) - AI Agent 项目指南

> 本文件面向 AI 编程助手。**每次对话前自动导入，请保持简洁（≤800 行）**。
> 项目主要交流语言为中文。

---

## 📋 文件维护规则

> ⚠️ **定期清理要求**（每次版本更新后执行）

1. **版本日志保留策略**：仅保留最近 **5 个完整版本**（含根因/修复/影响）
2. **历史版本归档**：更早版本压缩为一行摘要，移至"附录：历史版本索引"
3. **行数警戒线**：文件总行数超过 **800 行** 时，必须执行清理

---

## 🚨 AI 行为约束（最高优先级）

### 版本号修改禁令
- ❌ **绝对禁止**擅自修改任何位置的版本号
- ✅ **必须等待**用户明确说出"更新版本号为 vX.Y.Z"
- ✅ 修改前**必须先询问**："请问本次更新的版本号是多少？"

### 双端同步规则
- ❌ **禁止**日常开发中自动同步
- ✅ **仅在**收到"推送"指令时同步：Android → 根目录

### 工作开始前必做
1. **复述用户需求**：用自己的话简要复述用户想要实现的功能或修复的问题
2. **确认版本号**：询问本次是否涉及版本号修改
3. **确认同步需求**：确认是否需要三端同步（通常不需要，除非用户说"推送"）
4. **列出修改清单**：明确列出将要修改的文件和位置

### 日志更新规则
- **用户日志**：仅用户明确下达指令时才修改/更新/添加
- **技术日志（本文件第二部分）**：仅对"重要且影响深远"的改动记录

---

## 1. 项目概述

**TimeBank（时间银行）** 是一款基于「时间货币」模型的个人时间管理与任务追踪混合式 Android 应用。

**核心理念**：将时间视为可赚取（earn）和消耗（spend）的货币。

**典型使用场景**：
| 平台 | 设备 | 使用方式 |
|------|------|---------|
| **Android** | 手机端 | 原生 APK，可使用悬浮窗计时器、小组件等原生功能 |
| **Android** | 平板端 | 原生 APK，支持分屏和大屏适配 |
| **网页端** | 浏览器 | PWA 应用，可安装到桌面，支持离线使用 |

**技术栈**：
| 层级 | 技术 |
|------|------|
| **前端** | Vanilla JS (ES6)，无框架 |
| **样式** | CSS 变量，支持暗色模式、三种卡片视觉 |
| **Android** | Java 11，minSdk 24，targetSdk 36 |
| **云服务** | 腾讯云 CloudBase（JS SDK v2） |
| **云函数** | Node.js 18.15 |

**当前版本**：`v8.2.18`

---

## 2. 项目结构与代码组织

### 2.1 前端文件（权威源：`android_project/app/src/main/assets/www/`）

> ⚠️ **默认修改位置**：所有前端代码修改**只在** `android_project/app/src/main/assets/www/` 目录下进行，**禁止**在根目录修改。

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
1. **代码修改**：在 `android_project/app/src/main/assets/www/` 目录下进行
2. **双端同步**：执行上述同步命令（Android → 根目录）
3. **Hash 验证**：运行 `Get-FileHash` 确认两端完全一致
4. **检查版本号**：确认以下 11 个位置的版本号已更新：
   - `index.html`：`<title>` 标签（第 12 行）
   - `index.html`：`.version-subtitle`（首页副标题，第 201 行）⚠️ 易遗漏
   - `index.html`：关于页版本号（第 1346 行）
   - `index.html`：用户日志版本标题（第 1405 行）
   - `js/app-1.js`：`APP_VERSION` 常量（第 2 行）
   - `js/app-1.js`：启动日志注释（第 6 行）
   - `sw.js`：文件头部注释（第 1 行）
   - `sw.js`：`CACHE_NAME`（第 3 行）
   - `android_project/app/build.gradle`：`versionName`
   - `android_project/app/build.gradle`：`versionCode`
   - `AGENTS.md`：当前版本号
5. **检查日志**：确认技术日志（本文件第二部分）和用户日志（HTML 版本更新日志）已撰写
6. **执行推送**：仅当以上检查全部通过后，执行 `git add -A` → `git commit` → `git push`

> ⚠️ **禁止事项**：
> - ❌ 未经用户"推送"指令，不得擅自执行 `git push`
> - ❌ 不得擅自升级版本号（版本号由用户指定）
> - ❌ 不得跳过三端同步直接推送


---

## 4. 腾讯云 CloudBase 配置

### 环境信息
- **环境 ID**: `cloud1-8gvjsmyd7860b4a3`
- **SDK 版本**: v2.24.10

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

| 云函数名 | 用途 | 超时 |
|---------|------|------|
| `timebankSync` | 增量查询 + 幂等写入 | 30s |
| `timebankAI` | AI洞察/对话/伙伴/认知 | 60s |

### 部署命令
```powershell
tcb fn deploy timebankAI --force
tcb fn deploy timebankSync --force
tcb fn deploy --all --force
```

---

## 5. 构建与运行

### Android 安装
用户通过运行脚本安装到安卓端：
- **Android 项目内**：`android_project/sync.bat`
- **外部路径**：`D:\TimeBank\log&data\待修复数据\sync.bat`

**输出路径**：
- Release: `android_project/app/build/outputs/apk/release/app-release.apk`
- Debug: `android_project/app/build/outputs/apk/debug/app-debug.apk`

### PWA 安装（网页端）
1. 在浏览器中打开网页端地址
2. 浏览器检测到 Service Worker 后会自动显示安装提示
3. 或手动点击浏览器菜单 → "安装" → "时间银行"
4. 安装后可从桌面/开始菜单启动，离线可用

### 调试
- **Chrome DevTools**: 通过 Chrome 远程调试 WebView (`chrome://inspect`)
- **Android 日志**: 使用 `adb logcat` 查看 Android 日志
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

- **事务操作**：涉及余额变动**必须使用** `db.runTransaction`
- **并发冲突**：云函数 `timebankTaskLock` 提供 60 秒 TTL 分布式锁
- **API Key**：存储在 CloudBase 云函数环境变量，不暴露客户端
- **HTTP 服务**：当前免鉴权，生产环境建议开启鉴权

---

# 第二部分：版本更新日志

> 仅保留最近 5 个完整版本。更早版本见"附录：历史版本索引"。

---

## v8.2.15（跨设备 running 状态冲突修复）

### 核心问题
Android 端完成任务后，Web 端 stale running 状态覆盖完成状态，导致交易丢失。

### 根因
5 个独立根因：缺少跨设备乐观锁，`clientId` 感知合并机制不完善。

### 6 项修复
| 修复项 | 关键逻辑 |
|--------|---------|
| `DAL.startTask` UPDATE→ADD 回退 | UPDATE 失败时清缓存，回退 ADD |
| `DAL.updateRunningTask` 存在性守卫 | 检测 not found 时清理缓存和任务 |
| `tb_running` 增加 `lastUpdatedAt` | 所有写入附带时间戳 |
| `DAL.loadAll` 跨设备合并 | clientId 感知：本地有则保留，本机无则接受云端 |
| `applyDataState` 跨设备保护 | clientId 感知合并 |
| Watch remove 清理缓存 | 远程删除时同步清缓存 |

### 合并规则
- 云端 clientId === 本机 → 信任云端
- 云端 clientId !== 本机且本地有 → **保留本地**
- 云端 clientId !== 本机且本地无 → 接受云端

---

## v8.2.14（利息计算交叉校验 + 历史修复功能）

### 改动 1：余额交叉校验
- 新增 `calculateEndingBalanceFromTransactions()` 辅助函数
- 若 `|cached - calculated| > 1` 秒，使用计算值并修正账本缓存

### 改动 2：历史修复功能
- 新增 `recalculateAllInterest()` 函数（设置页按钮触发）
- 流程：标记 undone → 清空账本 → 从 firstEnabledAt 重新结算

---

## v8.2.13（统一使用东八区时区）

- 前端 `getLocalDateString`：使用 `Intl.DateTimeFormat` 指定 `Asia/Shanghai`
- Android `getAppScreenTimeForDate`：使用 `TimeZone.getTimeZone("Asia/Shanghai")`

---

## v8.2.12（自动检测补录日期匹配修复）

- `hasAutoDetectTransactionForDate`：优先使用 `originalDate`，回退 timestamp
- `getTaskRecordedTimeForDateIncludeAuto`：同样优先 `originalDate`
- `parseTimeFromDescription`：新增支持 `(漏记30分钟, ×1.2惩罚)` 格式

---

## v8.2.11（屏幕时间手动记录 + 时区一致性修复）

- 新增 `addManualScreenTimeRecord()` 函数（设置页 UI）
- `autoDetectAppUsage`：统一使用 `getLocalDateString(new Date())`

---

## v8.2.10（负余额惩罚强制启用 + 金融设置云端同步修复）

- `shouldApplyNegativeBalancePenalty()`：移除开关，始终返回 true
- `DAL.saveProfile`：添加 `financeSettings`/`interestLedger` 的 `_.set()` 自动包装

---

## 早期版本索引（压缩摘要）

| 版本 | 核心内容 |
|------|---------|
| v8.2.9 | 补录弹窗 try/finally 保护 |
| v8.2.8 | 大数据量秒开 + 后台增量同步 |
| v8.2.7 | saveTask 数据保护：clientId、失败重试队列、字段级合并 |
| v8.2.6 | 登录态误报修复、后台延迟修复 |
| v8.2.5 | 通透模式 UI 修复 |
| v8.2.4 | 任务完成后余额双倍计算修复 |
| v8.2.3 | 后台结束任务 UI 僵死修复 |
| v8.2.2 | Watch 连接僵死 + 手动同步失效修复 |
| v8.2.1 | 全量同步覆盖 pending 交易修复 |
| v8.2.0 | AI 统一认知架构 |
| v8.1.0 | AI 增强：Kimi 模型、CLI 部署 |
| v8.0.0 | AI 云端方案：DeepSeek + HTTP 访问服务 |
| v7.39.x | Habit System 3.0 重构 |
| v7.38.0 | pendingRegistry 机制 |
| v7.37.x | Watch 去重修复、clientId 修复 |
| v7.36.x | 性能优化、AlarmManager 修复 |

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
