# v9.2.1 Tasks

## 1. SPEC 文档

- [x] 1.1 创建 v9-2-1 spec.md（包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements）
- [x] 1.2 创建 tasks.md（本文件）
- [x] 1.3 创建 checklist.md

## 2. P0 修复（必须）

### 2.1 isImportMode 显式声明

- [x] 2.1.1 [app-1.js:33](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L33) 附近 `let clientId = ...` 之后加 `let isImportMode = false;`（带 `[v9.2.1]` 注释）
- [x] 2.1.2 保留 7 处隐式赋值（已存在的不需改）—— 显式声明后，赋值会更新这个 `let` 变量，不再创建全局
- [x] 2.1.3 验证：grep `let isImportMode|var isImportMode|const isImportMode` 应匹配到 1 处声明

### 2.2 Transaction onChange 事件驱动心跳

- [x] 2.2.1 [app-1.js:3942-3944](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3942) Transaction onChange 开头加 `watchLastEventTime.transaction = Date.now();`（带 `[v9.2.1]` 注释）
- [x] 2.2.2 验证：与 [Task (3880)](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3880) 和 [Running (4037)](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4037) 模式一致

### 2.3 Profile onChange 事件驱动心跳

- [x] 2.3.1 [app-1.js:4111-4114](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4111) Profile onChange 开头
  - 删除 `// [v8.2.17] 移除心跳更新：心跳由连接驱动，不再由事件驱动` 注释
  - 加 `watchLastEventTime.profile = Date.now();`（带 `[v9.2.1]` 注释）
- [x] 2.3.2 验证：4 个 onChange（Task/Transaction/Running/Profile）都有事件驱动心跳

## 3. P1 修复（重要）

### 3.1 DAL.startTask 显式传 clientId

- [x] 3.1.1 [app-1.js:3568-3574](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3568) callMutation data 显式加 `clientId: data.clientId || clientId` 字段（提到顶层，不依赖嵌套）
- [x] 3.1.2 验证：与 tbMutation [index.js:281-283](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L281) 的 `data.clientId` 读取对齐

### 3.2 onChange 端 null-safe 防御

- [x] 3.2.1 [app-1.js:4052](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4052) `if (remoteClientId === clientId)` → `if (remoteClientId && remoteClientId === clientId)`
- [x] 3.2.2 [app-1.js:4062](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4062) `if (remoteClientId === clientId)` → `if (remoteClientId && remoteClientId === clientId)`
- [x] 3.2.3 [app-1.js:4072](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4072) `if (remoteClientId === clientId)` → `if (remoteClientId && remoteClientId === clientId)`
- [x] 3.2.4 验证：3 处全部 null-safe；line 4089 `(来自 ${remoteClientId === clientId ? '本机' : '其他设备'})` 保留（null 时显示"其他设备"是合理的）

### 3.3 unsubscribeAll 动态退避

- [x] 3.3.1 [app-1.js:4251](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4251) `await new Promise((r) => setTimeout(r, 800));` → 动态退避循环
  ```js
  // [v9.2.1] 动态退避：800ms × 1.5^n，最多 5 次（10.55s 上限），防止网络层 unsubscribe/subscribe 交错
  const __unsubDelays = [800, 1200, 1800, 2700, 4050];
  for (const __unsubMs of __unsubDelays) {
      await new Promise((r) => setTimeout(r, __unsubMs));
  }
  ```
- [x] 3.3.2 验证：unsubscribeAll 总等待时间从 800ms 增加到 10.55s（必要时可缩短次数）

## 4. P2 修复（次要）

### 4.1 抽取 `__fixCompletionCount()` 工具

- [x] 4.1.1 在 [app-1.js:2230](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2230) 之前（activeSync 之前）定义 `__fixCompletionCount(saveTaskFn, options)` 工具函数
- [x] 4.1.2 [app-1.js:2235-2251](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2235) 替换为 `__fixCompletionCount(DAL.saveTask.bind(DAL));`
- [x] 4.1.3 [app-1.js:4540-4556](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4540) 替换为 `__fixCompletionCount(this.saveTask.bind(this), { logSuffix: '-loadAll' });`
- [x] 4.1.4 [app-1.js:5117-5135](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5117) 替换为 `__fixCompletionCount(DAL.saveTask.bind(DAL), { skipStoredZero: true, logSuffix: '-incremental' });`
- [x] 4.1.5 验证：grep `__completionFixPromises|__loadAllCompletionFixPromises|__incrementalFixPromises` 应 0 匹配（3 个变量名消失）

## 5. 9 处版本号同步

- [x] 5.1 [app-1.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L7) `const APP_VERSION = 'v9.2.0';` → `'v9.2.1'`
- [x] 5.2 [app-1.js:8-12](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释追加 `// [v9.2.1] v9.0.12 续作：isImportMode 声明 + Tx/Profile 心跳 + startTask clientId + null-safe + 动态退避 + completionCount 工具`
- [x] 5.3 [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>时间银行 - Time Bank v9.2.0</title>` → `v9.2.1`
- [x] 5.4 [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` 内容 → "TimeBank v9.2.1 · v9.0.12 续作 + PWA 实时性 bug 终结"
- [x] 5.5 [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) 关于页版本号 → `v9.2.1`
- [x] 5.6 [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) 用户日志新增 v9.2.1 条目（产品语言描述）
- [x] 5.7 [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 `// Time Bank Service Worker - v9.2.0` → `v9.2.1`
- [x] 5.8 [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) `const CACHE_NAME = 'timebank-cache-v9.2.0';` → `v9.2.1`
- [x] 5.9 [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) `versionCode 45` → `46`, `versionName "9.2.0"` → `"9.2.1"`

## 6. AGENTS.md 文档

- [x] 6.1 [AGENTS.md:69](file:///d:/TimeBank/AGENTS.md#L69) 当前版本 `v9.2.0` → `v9.2.1`
- [x] 6.2 在 v9.2.0 章节后新增 `## v9.2.1（v9.0.12 续作 + PWA 实时性 bug 终结）` 章节
  - 说明 v9.2.1 是 v9.0.12 工作的延续，废弃 v9.0.12 版本号
  - 列出 7 个代码修复（v9.0.12 的 10 个修复减去已实施的 3 个）
  - 说明 9 处版本号同步
  - 部署说明（云函数 `tbMutation` 需重新部署）
- [x] 6.3 副标题信息

## 7. v9.0.12 spec 废弃标记

- [x] 7.1 [`.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/spec.md`](file:///d:/TimeBank/.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/spec.md) 顶部加废弃标记
  ```md
  > ⚠️ **DEPRECATED**：本版本号 v9.0.12 已废弃，实际工作以 v9.2.1 版本号发布（[spec](../v9-2-1-pwa-bugfix-completion/spec.md)）。本目录作历史存档保留。
  ```
- [x] 7.2 tasks.md / checklist.md 也加相同废弃标记

## 8. 技术日志

- [x] 8.1 撰写 AGENTS.md v9.2.1 章节内容（产品语言 + 技术细节）
- [x] 8.2 撰写 index.html v9.2.1 用户日志条目（产品语言）
- [x] 8.3 副标题撰写："v9.0.12 续作 + PWA 实时性 bug 终结"

## 9. 验证

- [ ] 9.1 启动 PWA → 启动并停止一个即时任务 → 验证不抛 `isImportMode is not defined`
- [ ] 9.2 等待 5 分钟连续操作 → 验证 Watchdog 不再 60s 雪崩（监控指示器保持 🟢）
- [ ] 9.3 验证 Running 事件被正确识别为"本机触发"（控制台 `🛡️ 忽略 add 事件: 本机触发`）
- [ ] 9.4 验证控制台错误数从 700+ 降到 < 20
- [ ] 9.5 验证 unsubscribeAll 等待时间从 800ms 增加到 10.55s（看控制台日志）
- [ ] 9.6 验证 3 处 completionCount 修复都走 `__fixCompletionCount` 工具（日志后缀区分）

## 10. 部署

- [ ] 10.1 部署云函数 `tbMutation`（v9.2.1 修复**不需要**云函数改动，clientId 写入已就绪；但需确认之前是否已部署）
- [ ] 10.2 pre-push-check 验证通过
- [ ] 10.3 sync-all.ps1 同步根目录 www/ → git push

# Task Dependencies

- [Task 2-3] 不依赖其他任务（独立修复）
- [Task 4] 不依赖其他任务（独立重构）
- [Task 5] 依赖 [Task 2-3]、[Task 4]（版本号应反映所有修复）
- [Task 6] 依赖 [Task 2-3]、[Task 4]、[Task 5]（文档应在所有代码修复后撰写）
- [Task 7] 不依赖其他任务（仅加废弃标记）
- [Task 9] 依赖 [Task 2-3]、[Task 4]（验证需要先修复）
- [Task 10] 依赖所有前置任务
