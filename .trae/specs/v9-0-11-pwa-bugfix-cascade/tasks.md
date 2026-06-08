# Tasks — v9.0.11 PWA bug 反馈修复 + Watch 雪崩治理

> 版本：v9.0.11（versionCode 42）
> 实施位置：**双端**（`android_project/app/src/main/assets/www/` 为权威源，同步到根目录 `js/` + `index.html` + `sw.js`）
> 云函数：需部署 `tbMutation`（saveTask 字段）
> 推送：等用户指令后再 `git push`

---

## Group A：Watch 同步机制（最优先）

### A1. `unsubscribeAll` 真正等 ws 关闭
- [x] A1.1 修改 `js/app-1.js` 中 `unsubscribeAll`（[app-1.js:4100-4158](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4100-L4158)）
  - 收集所有 `w.close()` / `w.unsubscribe()` 的 Promise
  - `await Promise.all(...)` + `await sleep(800ms)` 再继续
  - 状态重置保持原顺序

### A2. watchdog 限频 + 自愈探针
- [x] A2.1 修改 `startWatchHeartbeatWatchdog`（[app-1.js:1100-1153](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1100-L1153)）
  - 新增 `__watchdogActionTimestamps` 数组
  - 1 小时内最多 6 次（`MAX_WATCHDOG_ACTIONS_PER_HOUR = 6`）
  - 超限进入 `__watchDegradeStatus = 'paused'` + 启动 `__watchdogProbeTimer`（60s 一次）
  - 重建后补偿同步延后到 8s（给心跳更新留窗口）
  - `__watchdogActionsInFlight` 计数器防止并发

### A3. `onChange` 轻量刷新心跳
- [x] A3.1 在 5 处 watch onChange 第一行加 `watchLastEventTime[key] = Date.now();`
  - Task: [app-1.js:3782](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3782)
  - Transaction: [app-1.js:3846](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3846)
  - Running: [app-1.js:4015 附近](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4015)
  - Profile: [app-1.js:4075 附近](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4075)
  - Daily: [app-1.js:4120 附近](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4120)

---

## Group B：SDK 加载时序

### B1. 引入 `whenCloudBaseReady` Promise
- [x] B1.1 在 `js/app-1.js` 顶部（`initCloudBase` 之前）加：
  ```js
  let __cloudBaseReady = null;
  let __cloudBaseReadyResolve = null;
  let __cloudBaseReadyReject = null;

  function whenCloudBaseReady(timeoutMs = 5000) { ... }
  ```
- [x] B1.2 在 `initCloudBase` 成功/失败路径触发 resolve/reject

### B2. 降噪 + 扩时长
- [x] B2.1 `initCloudBase` 失败加 `__initCloudBaseLogged` 标记，仅首次打日志
- [x] B2.2 `waitForCloudBase` 默认 `maxRetries = 150`（30s），首次失败仍显示
- [x] B2.3 `refreshLoginState`（[app-1.js:622-715](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L622-L715)）改用 `whenCloudBaseReady(5000)`，超时静默

---

## Group C：核心 Bug `currentUid is not defined`

### C1. `DAL.fetchDelta` 补变量
- [x] C1.1 修改 [app-1.js:4165-4204](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4165-L4204)
  - 顶部加 `const currentUid = await this.getCurrentUid();`
  - 加 `if (!currentUid) return null;` 守卫

---

## Group D：completionCount 端到端写回

### D1. 客户端 `DAL.saveTask` 写 completionCount
- [x] D1.1 修改 [app-1.js:3039-3057](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3039-L3057)
  - `taskData` 增加 `completionCount: task.completionCount || 0`

### D2. 云函数 `tbMutation.saveTask` 写 completionCount
- [x] D2.1 修改 [tbMutation/index.js:200-215](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L200-L215)
  - `taskData` 增加 `completionCount: data.completionCount || 0`

### D3. 三处"修复"循环改"修 + 写回"
- [x] D3.1 [app-1.js:2152-2160](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2152-L2160) activeSync 内
- [x] D3.2 [app-1.js:4417-4425](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4417-L4425) loadAll 内
- [x] D3.3 [app-1.js:4982-4987](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4982-L4987) handleIncrementalSync 内
- 统一改为：检测到不一致 → 修内存 → 推入 `DAL.saveTask(task)` Promise 数组

---

## Group E：按钮 ID 错误 + 死函数激活

### E1. `setupTaskModalEventListeners` 改用真实 ID
- [x] E1.1 修改 [app-auth.js:2650-2670](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2650-L2670)
  - `#registerButton` → `#emailRegisterBtn`
  - `#loginButton` → `#emailLoginBtn`
  - 改为切换 `#verificationCodeGroup` 显示

### E2. `setAuthLoading` null-safe
- [x] E2.1 修改 [app-auth.js:927-931](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L927-L931)
  - 用 ID 数组循环 `getElementById`，null 跳过
  - ID 改为 `emailRegisterBtn` / `emailLoginBtn` / `startSyncButton`

### E3. 解除死函数
- [x] E3.1 在 `app-auth.js` 末尾（DOMContentLoaded 监听器）调一次 `setupTaskModalEventListeners()`

---

## Group F：AI service 降频 + 等 SDK

### F1. `updateAIInsightCardStatus` 先等 SDK
- [x] F1.1 修改 [app-reports.js:8086-8144](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L8086-L8144)
  - 函数顶部加 `if (!cloudbaseInitialized) await whenCloudBaseReady(3000).catch(() => null);`
  - 加 `try/catch` 包裹 `AI_SERVICE.getStatus()`

### F2. setInterval 降频
- [x] F2.1 [app-reports.js:8171](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L8171) 间隔 3000 → 30000

---

## Group G：版本号同步

### G1. APP_VERSION
- [x] G1.1 [app-1.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6) `v9.1.0` → `v9.0.11`（双端）
- [x] G1.2 [sw.js:5](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L5) `timebank-cache-v9.1.0` → `timebank-cache-v9.0.11`（双端）

### G2. index.html
- [x] G2.1 [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) title `v9.1.0` → `v9.0.11`
- [x] G2.2 [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` `v9.1.0` → `v9.0.11`
- [x] G2.3 [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) "版本 v9.1.0" → "v9.0.11"
- [x] G2.4 [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) `log-version v9.1.0` → `v9.0.11` + 新增 v9.0.11 用户日志条目

### G3. build.gradle
- [x] G3.1 [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15-L16) `versionCode 41` → `42`；`versionName "9.1.0"` → `"9.0.11"`

### G4. AGENTS.md
- [x] G4.1 [AGENTS.md:70](file:///d:/TimeBank/AGENTS.md#L70) 当前版本 `v9.1.0` → `v9.0.11`
- [x] G4.2 AGENTS.md 头部"版本更新日志"区，v9.1.0 之前插入 v9.0.11 完整版块

---

## 验证（推送前必做）

- [ ] 启动 PWA，控制台观察 5 分钟：
  - 无 `[DAL.fetchDelta] 增量同步失败: currentUid is not defined`
  - 无 `initCloudBase` 反复刷屏（首次失败一次后静默）
  - 无 `🐕 [Watchdog] 心跳超时` 雪崩（1h 最多 6 次）
  - 无 `[completionCount 修复]` 循环（首次自动写回后不再出现）
  - 无 `[AI_SERVICE] 获取状态异常`（setInterval 已降频 + 先等 SDK）
- [ ] 创建一个任务、记录 1 笔交易，刷新页面，确认 completionCount 正确
- [ ] 邮箱登录按钮点击，验证码输入框正常显示
- [ ] 断网 → 恢复，watch 自愈探针 60s 后接管
- [ ] 部署 `tbMutation` 云函数（新版本生效）
