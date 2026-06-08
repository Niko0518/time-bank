# v9.0.11 PWA 端 bug 反馈修复 + Watch 雪崩治理

## Why

PWA 端在 CloudBase SDK 启动后几分钟内出现 5 类连锁报错。问题的根因不是某个独立 bug，而是一组**机制层面的脆弱性叠加**——本版本一次性把它们拆解、修复。

### 1. `currentUid is not defined`（P0 真 Bug）
`DAL.fetchDelta`（[app-1.js:4179](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4179)）引用了自由变量 `currentUid`，但函数顶部没有声明（同文件其他方法如 `saveTask` 都有声明）。第一次增量同步必抛 `ReferenceError`，但 `waitForCloudBase` 静默吞掉异常 → 错误退化为"控制台 warn"。

### 2. CloudBase SDK 加载失败连环报错（噪音 + 死循环源）
- 本地 `cloudbase.v2.bundle.js` 加载 `ERR_CONNECTION_RESET`
- CDN 兜底也失败
- `initCloudBase` 在 [app-1.js:274-340](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L274-L340) 每 200ms 重试 20 次（4s 内打 60+ 行错误）
- 每次重建 watcher → 又触发 `initCloudBase` 失败 → `refreshLoginState called before SDK init`（4 次）

### 3. Watch 心跳超时 → 雪崩（控制台刷屏 700+ 行）
- `onError` 把 `watchLastEventTime = 0`，v8.2.17 后 `onChange` 不再刷新心跳
- 60s 后 watchdog（[app-1.js:1100-1153](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1100-L1153)）判定心跳超时
- 触发 `checkAndRebuildWatchers(true)` 重建 + 2s 后 `reconcileCloudAfterWatch` 拉增量
- 增量同步因 #1 失败 → 又触发 `scheduleWatchReconnect` 重建 → 死循环
- 5 次循环内产生 700+ 行日志、5+ 次 `completionCount 修复`、5+ 次 `DAL.fetchDelta` 失败

### 4. `completionCount` 反复 +1 修复（数据漂移）
- 三处"修复"循环（[app-1.js:2152-2160](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2152-L2160)、[4417-4425](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4417-L4425)、[4982-4987](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4982-L4987)）只改内存
- `DAL.saveTask`（[app-1.js:3039-3057](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3039-L3057)）和云函数 `tbMutation.saveTask`（[tbMutation/index.js:200-215](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L200-L215)）的 `taskData` 都不写 `completionCount` 字段
- → 每次重新 `DAL.loadAll` 又读到 stored=N-1，循环报警

### 5. `#registerButton` / `#loginButton` DOM 缺失（启动崩溃 + 死函数）
- `setupTaskModalEventListeners`（[app-auth.js:2650-2670](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2650-L2670)）绑定了 `#registerButton` 和 `#loginButton`
- index.html 实际是 `#startSyncButton` / `#emailLoginBtn` / `#emailRegisterBtn`
- 该函数是**死代码**——全文没人调
- `setAuthLoading`（[app-auth.js:927-931](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L927-L931)）还用了裸 `getElementById`，按钮不存在时会抛 `Cannot set properties of null`

### 6. AI Service 每 3 秒抛"CloudBase 尚未初始化"
- `app-reports.js:8171` 用 `setInterval(updateAIInsightCardStatus, 3000)` 不断调 `getStatus`
- `getStatus` 内部 `getApp()` 在 SDK 未初始化时抛错
- 修复 #2 后这也会自动消停，但需主动降频避免无意义请求

## What Changes

### Fix 1（核心）：补 `currentUid` 自由变量
**修一个变量声明**：在 `fetchDelta` 函数体顶部加 `const currentUid = await this.getCurrentUid(); if (!currentUid) return null;`

### Fix 2：Watch 同步机制
- 2A. `unsubscribeAll` 真正等 ws 关闭（800ms 等待 + close 异步）
- 2B. watchdog 限频 1h 6 次 + 自愈探针（避免雪崩）
- 2C. `onChange` 轻量刷新心跳（v8.2.17 设计的语义修正）
- 2D. watchdog 触发后 2s → 8s（给重建 + 心跳更新留窗口）

### Fix 3：SDK 加载时序
- 3A. 引入 `whenCloudBaseReady()` Promise，所有"未就绪"路径静默 await
- 3B. `refreshLoginState` 改用 `whenCloudBaseReady(5000)`，超时静默返回 null
- 3C. `initCloudBase` 失败只首次打日志（避免重复 5 行）
- 3D. `waitForCloudBase` 扩到 30s（150 × 200ms）

### Fix 4：completionCount 端到端写回（双端修复）
- 4A. 客户端 `DAL.saveTask` 在 `taskData` 加 `completionCount` 字段
- 4B. 云函数 `tbMutation.saveTask` 在 `taskData` 加 `completionCount` 字段
- 4C. 三处"修复"循环改为"修 + 写回云端"（用 `DAL.saveTask`）
- 4D. `mergeTransactionDelta`（已有，line 4834）保持 `merged.completionCount` 逻辑

### Fix 5：按钮 ID 错误
- 5A. `setupTaskModalEventListeners` 改用真实存在的 `emailRegisterBtn` / `emailLoginBtn`
- 5B. `setAuthLoading` 用 null-safe getElementById + 真实按钮 ID 列表
- 5C. 在 DOMContentLoaded 中调一次 `setupTaskModalEventListeners`（解除死函数）

### Fix 6：AI service 降频 + 等 SDK
- 6A. `updateAIInsightCardStatus` 先 `await whenCloudBaseReady(3000)`
- 6B. `setInterval` 间隔 3s → 30s

## Impact

- Affected code（**双端**：`android_project/.../www/` + 根目录 `js/` + `index.html` + `sw.js`）：
  - `js/app-1.js`
  - `js/app-auth.js`
  - `js/app-reports.js`
  - `index.html`
  - `sw.js`
- Affected cloud function：
  - `cloudbase-functions/tbMutation/index.js`（saveTask 字段）
- 版本号同步（11 处）：
  - `APP_VERSION`（app-1.js）
  - `CACHE_NAME`（sw.js）
  - `index.html` title / version-subtitle / 关于页 / 用户日志
  - `build.gradle` versionName / versionCode
  - `AGENTS.md` 当前版本 + 版本日志
- 不影响 v9.1.0 的云端权威架构（#4 completionCount 写回恰好补完 v9.1.0 的"云端是唯一权威源"原则——存什么就该传什么）

## 用户可见改善

| 现象 | 修复前 | 修复后 |
|------|--------|--------|
| 启动后几分钟控制台错误行数 | 700+ | < 20 |
| 5 个 taskId 反复报 completionCount 不一致 | 持续刷屏 | 首次自动修复后不再出现 |
| AI 服务 3 秒一报"CloudBase 尚未初始化" | 持续到登录 | 静默等 SDK 就绪 |
| Watch 60s 雪崩 | 持续死循环 | 1h 最多重建 6 次，触发上限后自愈探针接管 |
| PWA 端"邮箱登录"按钮点击 | 静默（绑定错 ID） | 正常切换"验证码"输入框 |
| `setAuthLoading` 启动期崩溃 | 可能 | null-safe |
