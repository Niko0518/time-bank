> ⚠️ **DEPRECATED**：本版本号 v9.0.12 已废弃，实际工作以 v9.2.1 版本号发布（[spec](../v9-2-1-pwa-bugfix-completion/spec.md)）。本目录作历史存档保留。
>
> 上一个开发 AI 的"v9.0.12 实施完成"报告**不真实**：10 项修复只完成了 2 项（app-2.js runningData 加 clientId、tbMutation 写 clientId），其余 8 项在 v9.2.1 中完成。

# v9.0.12 Tasks

## 1. SPEC 文档
- [x] 1.1 创建 v9-0-12 spec.md
- [ ] 1.2 创建 tasks.md
- [ ] 1.3 创建 checklist.md

## 2. P0 修复

### 2.1 `isImportMode` 显式声明
- [ ] 2.1.1 在 `app-1.js` 顶部 `clientId` 声明区附近加 `let isImportMode = false;`
- [ ] 2.1.2 保留原有 7 处隐式赋值（已存在的不需改）

### 2.2 Transaction/Profile onChange 补心跳刷新
- [ ] 2.2.1 [app-1.js:3941-3942](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3941) Transaction onChange 开头加 `watchLastEventTime.transaction = Date.now();`
- [ ] 2.2.2 [app-1.js:4110-4112](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4110) Profile onChange 删旧注释 + 加 `watchLastEventTime.profile = Date.now();`

## 3. P1 修复

### 3.1 Running 事件源识别端到端
- [ ] 3.1.1 [app-2.js:4450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4450) runningData 加 `clientId: clientId`
- [ ] 3.1.2 [app-1.js:3567-3588](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3567) DAL.startTask callMutation data 加 `clientId`
- [ ] 3.1.3 [tbMutation/index.js:275-283](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L275) startTask 写入 doc 加 `clientId` 字段
- [ ] 3.1.4 [app-1.js:4051, 4061, 4071](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4051) onChange 改为 null-safe `if (remoteClientId && remoteClientId === clientId)`

### 3.2 unsubscribeAll 动态退避
- [ ] 3.2.1 [app-1.js:4224-4269](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4224) 800ms 固定 → 800ms × 1.5^n 退避，最多 5 次重试

## 4. P2 修复

### 4.1 addTransaction 即时更新本地 completionCount
- [ ] 4.1.1 抽取 `__fixCompletionCount()` 工具
- [ ] 4.1.2 [app-1.js:3349-3406](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3349) addTransaction 提交成功后调用

## 5. 11 处版本号同步

- [ ] 5.1 `app-1.js` 第 2 行 `APP_VERSION` → `v9.0.12`
- [ ] 5.2 `app-1.js` 第 6 行启动日志注释
- [ ] 5.3 `index.html` 第 12 行 `<title>`
- [ ] 5.4 `index.html` 第 201 行 `.version-subtitle`（同时撰写副标题）
- [ ] 5.5 `index.html` 关于页版本号
- [ ] 5.6 `index.html` 用户日志版本标题
- [ ] 5.7 `sw.js` 第 1 行注释
- [ ] 5.8 `sw.js` 第 3 行 `CACHE_NAME`
- [ ] 5.9 `build.gradle` `versionName`
- [ ] 5.10 `build.gradle` `versionCode` (42→43)
- [ ] 5.11 `AGENTS.md` 当前版本号 + 版本日志

## 6. 技术日志
- [ ] 6.1 撰写 AGENTS.md 第二部分 v9.0.12 条目
- [ ] 6.2 撰写 index.html 用户日志 v9.0.12 条目

## 7. 验证
- [ ] 7.1 启动 PWA → 启动并停止一个即时任务 → 验证不抛 `isImportMode is not defined`
- [ ] 7.2 等待 5 分钟 → 验证 Watchdog 不再 60s 雪崩
- [ ] 7.3 验证 Running 事件被正确识别为"本机触发"
- [ ] 7.4 验证控制台错误数从 700+ 降到 < 20

## 8. 部署
- [ ] 8.1 部署云函数 `tbMutation`（需 startTask 写 clientId 字段）
