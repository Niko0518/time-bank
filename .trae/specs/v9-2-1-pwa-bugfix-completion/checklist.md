# v9.2.1 Checklist

## Phase 1: SPEC 完整性

- [x] spec.md 存在且包含 Why / What Changes / Impact / ADDED Requirements / MODIFIED Requirements
- [x] tasks.md 存在且任务可勾选
- [x] checklist.md 存在（本文件）

## Phase 2: 代码修复（P0 必须）

- [x] **2.1.1** [app-1.js:33](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L33) 附近加 `let isImportMode = false;`（带 `[v9.2.1]` 注释）
- [x] **2.1.3** grep `let isImportMode` 匹配 1 处
- [x] **2.2.1** [app-1.js:3942](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3942) Transaction onChange 加 `watchLastEventTime.transaction = Date.now();`
- [x] **2.3.1** [app-1.js:4111](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4111) Profile onChange 删 v8.2.17 反模式注释 + 加 `watchLastEventTime.profile = Date.now();`
- [x] **2.3.2** 4 个 onChange（Task/Transaction/Running/Profile）都有事件驱动心跳

## Phase 3: 代码修复（P1 重要）

- [x] **3.1.1** [app-1.js:3568](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3568) callMutation data 加 `clientId: data.clientId || clientId`
- [x] **3.2.1** [app-1.js:4052](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4052) onChange add: `if (remoteClientId && remoteClientId === clientId)`
- [x] **3.2.2** [app-1.js:4062](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4062) onChange update: `if (remoteClientId && remoteClientId === clientId)`
- [x] **3.2.3** [app-1.js:4072](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4072) onChange remove: `if (remoteClientId && remoteClientId === clientId)`
- [x] **3.3.1** [app-1.js:4251](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4251) unsubscribeAll 800ms 固定 → 动态退避 [800, 1200, 1800, 2700, 4050]

## Phase 4: 代码修复（P2 次要）

- [x] **4.1.1** [app-1.js:2230](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2230) 之前定义 `__fixCompletionCount(saveTaskFn, options)` 工具函数
- [x] **4.1.2** [app-1.js:2235](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2235) activeSync 路径替换
- [x] **4.1.3** [app-1.js:4540](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4540) loadAll 路径替换
- [x] **4.1.4** [app-1.js:5117](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5117) incremental 路径替换
- [x] **4.1.5** grep `__completionFixPromises|__loadAllCompletionFixPromises|__incrementalFixPromises` 匹配 0 处

## Phase 5: 9 处版本号

- [x] **5.1** [app-1.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L7) APP_VERSION = 'v9.2.1'
- [x] **5.2** [app-1.js:8](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释追加 v9.2.1
- [x] **5.3** [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>` v9.2.1
- [x] **5.4** [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` "TimeBank v9.2.1 · v9.0.12 续作 + PWA 实时性 bug 终结"
- [x] **5.5** [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) 关于页 v9.2.1
- [x] **5.6** [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) 用户日志 v9.2.1 条目
- [x] **5.7** [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 v9.2.1
- [x] **5.8** [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) CACHE_NAME v9.2.1
- [x] **5.9** [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) versionCode 46, versionName 9.2.1

## Phase 6: AGENTS.md 文档

- [x] **6.1** [AGENTS.md:69](file:///d:/TimeBank/AGENTS.md#L69) 当前版本 v9.2.1
- [x] **6.2** v9.2.0 章节后新增 v9.2.1 章节
- [x] **6.3** 副标题信息

## Phase 7: v9.0.12 废弃标记

- [x] **7.1** [`.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/spec.md`](file:///d:/TimeBank/.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/spec.md) 顶部加废弃标记
- [x] **7.2** tasks.md / checklist.md 加相同废弃标记

## Phase 8: 验证

- [ ] **9.1** PWA 启动后不抛 `isImportMode is not defined`
- [ ] **9.2** Watchdog 不再 60s 雪崩（5 分钟连续操作监控保持 🟢）
- [ ] **9.3** Running 事件正确识别本机触发（控制台 `🛡️ 忽略 add 事件: 本机触发`）
- [ ] **9.4** 控制台错误数从 700+ 降到 < 20
- [ ] **9.5** unsubscribeAll 总等待时间 ≈ 10.55s（控制台日志确认）
- [ ] **9.6** 3 处 completionCount 修复走 `__fixCompletionCount`（日志后缀 `-loadAll` / `-incremental` 区分）

## Phase 9: 部署

- [ ] **10.1** 云函数 `tbMutation` 部署确认（v9.2.1 不需要云函数改动，但需确认之前是否已部署）
- [ ] **10.2** pre-push-check 验证通过
- [ ] **10.3** sync-all.ps1 同步 + git push

## 风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| unsubscribeAll 退避可能延迟首屏 | 低 | 总等待 10.55s 可接受（只在重建 watch 时触发） |
| `__fixCompletionCount` 工具函数依赖 `tasks` 和 `transactions` 全局 | 低 | 工具函数定义位置在两者声明之后 |
| 3 处调用 saveTaskFn 绑定不同上下文（`DAL.saveTask` vs `this.saveTask`） | 中 | 用 `.bind()` 绑定到正确上下文 |
| 9 处版本号易遗漏 | 中 | 按 checklist 逐项勾选 |
| onChange null-safe 误把"其他设备"事件跳过 | 低 | 旧数据无 clientId 字段时合理"其他设备"处理 |
