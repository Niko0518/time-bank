# v9.2.3 冷启动不加载数据修复 Spec

## Why

已登录的安卓端在**冷启动**时（首次启动 / 清理后启动）经常出现"已登录、已同步"状态指示器正常亮起，但**任务/交易列表为空**的诡异症状。用户必须关闭并重新打开应用才能正常加载数据。

静态代码分析 + 调试记录见 [debug-android-first-launch-no-data.md](file:///d:/TimeBank/debug-android-first-launch-no-data.md)，已定位 **3 个相互叠加的根因**：

### 根因 A：`DAL.init()` 在冷启动瞬态错误下错误返回 false
[app-1.js:2435-2456](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2435) `checkProfileExists()` 在 `catch` 中吞掉所有错误并返回 `false`。冷启动时 CloudBase SDK 首次握手失败/超时 → `DAL.init()` 错误返回 false → 上游认为"无数据"。

### 根因 B：`handlePostLoginDataInit` 的 `if (hasData)` gate 跳过 `loadAll`
[app-1.js:6302-6359](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6302) 走"无数据"分支时只调 `subscribeAll()`（显示"已同步 ✅"），**没调 `loadAll()` 也没调 `updateAllUI()`**。结果：用户看到"已登录 + 已同步"，但内存里的 `tasks/transactions` 仍是空。

### 根因 C："已同步"状态在数据加载前就置位
[app-1.js:4248](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4248) `subscribeAll()` 一返回就 `setAuthStatus('已同步 ✅', 'status-online')`，与 `loadAll` 是否完成无关。

## What Changes

### 修复 1（P0）：`DAL.init()` 改为"非阻塞探测"（方案 2）

**位置**：[app-1.js:2385-2431](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2385)

**修复策略**：
- `checkProfileExists` 调用增加 2 次重试（指数退避 200ms / 600ms），3 次仍失败再返回 false
- 数据孤儿检测（`hasAnyData`）保持原有逻辑（用户有数据无 profile 时自动重建 profile）
- 任何错误都不再静默返回 false 而误判

### 修复 2（P0）：移除 `handlePostLoginDataInit` 的 `if (hasData)` gate（方案 3）

**位置**：[app-1.js:6302-6359](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6302)

**修复策略**：
- 不再用 `DAL.init()` 的返回值决定"是否进入数据加载分支"
- `DAL.init()` 仅作"是否需要创建空 profile"的判断
- 始终走完整数据加载链：`loadAll` → `subscribeAll` → `cleanupDemoDataOnLogin` → `updateAllUI` → `startActiveSync`

### 修复 3（防御）：`ensureEmptyProfileForNewUser` 增加重复创建保护

**位置**：[app-1.js:6290-6300](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6290)

**修复策略**：
- 创建前先 `DAL.loadProfile()` 检查是否真的没有 profile
- 若已有 profile（瞬态错误导致的误判），跳过创建并返回 false
- 防止在冷启动瞬态错误场景下覆盖用户真实 profile

### 版本号同步（9 处）

与 v9.2.2 相同的 9 处版本号更新，版本号从 `v9.2.2` → `v9.2.3`。

## Impact

- **Affected specs**：v9.2.2（v9.2.3 在它之后）
- **Affected code**：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（3 处：DAL.init 重试 + handlePostLoginDataInit 重构 + ensureEmptyProfileForNewUser 防御）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（4 处：title / subtitle / 关于页 / 用户日志）
  - [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js)（2 处：注释 / CACHE_NAME）
  - [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle)（2 处：versionCode / versionName）

## ADDED Requirements

### Requirement: v9.2.3 冷启动不加载数据修复

The system SHALL fix the cold-start data loading failure on Android, ensuring:

1. 已登录用户的首次启动立即显示完整数据
2. `DAL.init()` 在瞬态网络错误下也能正确探测 profile
3. "已登录" + "已同步" 状态必须基于实际数据加载完成

#### Scenario: 1. 安卓端冷启动正常加载数据
- **WHEN** 已登录的安卓端冷启动
- **THEN** 启动后任务/交易列表立即显示
- **AND** 不再出现"已登录+已同步"但无数据
- **AND** 不再需要"关闭重开"作为临时解决方案

#### Scenario: 2. `DAL.init()` 在瞬态错误下重试
- **WHEN** `checkProfileExists` 首次查询失败（冷启动 SDK 未就绪）
- **THEN** 自动重试 2 次（200ms / 600ms 退避）
- **AND** 3 次仍失败时降级到 `hasAnyData` 兜底
- **AND** 不再因单次瞬态错误就误判"无数据"

#### Scenario: 3. `handlePostLoginDataInit` 始终走完整加载链
- **WHEN** `DAL.init()` 返回 false（无论真无数据还是瞬态错误）
- **THEN** 仍然调用 `DAL.loadAll()` 拉取云端数据
- **AND** 仍然调用 `updateAllUI()` 刷新 UI
- **AND** 不再因 `hasData=false` 跳过整个加载链

## MODIFIED Requirements

### Requirement: DAL.init() 探测逻辑

v7.9.x 的 `DAL.init()` 在 `checkProfileExists` 失败时静默返回 `false`。v9.2.3 扩展：增加 2 次重试 + 兜底 `hasAnyData` 检测。

**修改位置**：[app-1.js:2385-2431](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2385)

### Requirement: handlePostLoginDataInit 数据加载链

v9.1.0 的 `handlePostLoginDataInit` 用 `if (hasData)` 作为 gate 决定是否进入数据加载分支。v9.2.3 移除该 gate，`DAL.init()` 仅作"是否需要创建空 profile"的判断。

**修改位置**：[app-1.js:6302-6359](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6302)

## REMOVED Requirements

无删除的需求。

## v9.2.3 第二批改动：监听状态显示器优化

### Why

v9.0.10 时代引入的监听状态显示器存在以下体验问题：

1. **根因 C 未根治**：[app-1.js:4262](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4262) `subscribeAll()` 一返回就 `setAuthStatus('已同步 ✅')`——与 `loadAll` 是否完成无关
2. **自愈探针成功不拉数据**：网络恢复后状态条立刻变 🟢，但本地数据仍是断网前旧版本
3. **重连退避期无反馈**：用户看到 "保活中 3/8" 不知道何时会重试
4. **诊断面板倒计时静止**：用户看到的是 "0s" 或 "60s" 的死数字
5. **登出后状态残留**：旧 `paused` 状态在 localStorage 中跨登录保留
6. **UI 重排无防抖**：15+ 触发点同时调用 `updateWatchStatusUI`，高频抖动

### What Changes

#### 修复 4（P0）：拆分"已连接/已同步"两态
- 新增 `__dataLoaded` 全局标志（`false` 默认，`DAL.loadAll` 末尾置 `true`，`unsubscribeAll` 重置 `false`）
- `subscribeAll` 完成时按 `__dataLoaded` 决定显示"已同步 ✅"还是"已连接"
- `updateWatchStatusUI` 在 🟢 分支增加判断：`__dataLoaded=true` 显示"已同步"，否则显示"已连接"（`watch-connecting` 黄色）

#### 修复 5（P1）：自愈探针成功后补偿同步
- `__startWatchSelfHealingProbe` 在 `__markWatchSuccess()` 之后增加 `reconcileCloudAfterWatch('self-healing')`
- 失败时仅 warn，不影响状态恢复

#### 修复 6（P2）：重连倒计时可视化
- 新增 `__watchNextReconnectAt` 全局字段（`scheduleWatchReconnect` 写入，触发后清零）
- `updateWatchStatusUI` 在 `degraded` 分支显示 "保活中 n/8 · Xs 后重试"
- `__markWatchSuccess` 成功时也清零 `__watchNextReconnectAt` 并 `clearTimeout(pending)`

#### 修复 7（P2）：诊断面板自动刷新
- 新增 `__startWatchDiagnosticsAutoRefresh()`，1s 一次更新 `#diagCountdown` 等字段
- 面板关闭（移除 `.show` class）时自动清理定时器
- 打开 `showWatchDiagnostics` 时启动

#### 修复 8（P2）：登出重置降级状态
- `handleLogout` 增加重置 `__watchDegradeStatus='ok'` + 清零所有降级字段 + 持久化
- 避免登出后再登录时残留 `paused` 状态误启动自愈探针

#### 修复 9（P3）：CSS 状态点过渡
- `main.css` `.watch-status-dot` 增加 `transition: background-color 0.5s, box-shadow 0.5s, transform 0.3s`
- 避免状态硬切

#### 修复 10（P3）：UI 更新防抖
- `updateWatchStatusUI` 改为防抖包装（100ms）
- 真实 DOM 更新在 `__updateWatchStatusUIInternal` 中
- 高频调用合并为单次重排

### Impact

- **Affected code**：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（7 处：新增全局变量、subscribeAll/unsubscribeAll/loadAll 标志位、__markWatchSuccess 重置、scheduleWatchReconnect 倒计时、__startWatchSelfHealingProbe 补偿同步、showWatchDiagnostics 刷新、updateWatchStatusUI 防抖）
  - [app-auth.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js)（1 处：handleLogout 重置降级状态）
  - [main.css](file:///d:/TimeBank/android_project/app/src/main/assets/www/css/main.css)（1 处：状态点过渡）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（1 处：v9.2.3 用户日志）

### ADDED Requirements

#### Scenario: 监听状态 5 态准确显示
- **WHEN** 用户启动 App / 切换网络 / 断网恢复
- **THEN** 状态条依次显示"未连接 → 连接中 → 已连接 → 已同步"（或退化为"保活中/已暂停/未登录"）
- **AND** "已同步" 状态必须基于 `__dataLoaded=true` 才显示
- **AND** 不再出现"已同步"但列表为空

#### Scenario: 自愈探针恢复后数据完整
- **WHEN** 断网 5+ 分钟后自愈探针成功
- **THEN** 状态恢复 🟢
- **AND** 自动调用 `reconcileCloudAfterWatch` 拉取断网期间云端 delta
- **AND** 本地数据与云端最终一致

#### Scenario: 指数退避期间倒计时可见
- **WHEN** `__watchDegradeStatus === 'degraded'`
- **THEN** 状态条显示"保活中 n/8 · Xs 后重试"
- **AND** X 随时间递减，到 0 时清零

#### Scenario: 诊断面板打开期间倒计时实时刷新
- **WHEN** 用户点击状态条打开诊断弹窗
- **THEN** 自愈倒计时每秒自动更新
- **AND** 关闭弹窗后定时器自动清理

#### Scenario: 登出后降级状态清零
- **WHEN** 用户执行 `handleLogout`
- **THEN** `__watchDegradeStatus` 重置为 `'ok'`
- **AND** 持久化到 localStorage
- **AND** 再次登录时不会立即启动自愈探针

### MODIFIED Requirements

#### Requirement: updateWatchStatusUI 性能
v9.0.10 的 `updateWatchStatusUI` 是同步 DOM 更新。v9.2.3 改为 100ms 防抖包装，合并高频调用。

**修改位置**：[app-1.js:6553](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6553)
