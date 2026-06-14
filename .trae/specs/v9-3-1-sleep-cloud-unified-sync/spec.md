# 睡眠状态云端统一同步 Spec (v9.3.1)

## Why
当前睡眠状态按设备ID分设备独立存储（`deviceSleepState[deviceId]`），用户场景"手机睡眠被闹钟叫醒后忘结束，走到平板结束"无法实现：平板/网页看不到手机的睡眠状态，也无法从其他设备结束。同时旧版 `sleepSettingsShared` / `sleepStateShared` 共享字段也仅在初始化时按本机读取，无法做到实时统一。

需要重构为**单一云端状态对象**，所有设备读写同一份；任何设备都能看到睡眠状态并结束，**云端为唯一权威**，不做离线容忍/本地缓存。

## What Changes
- **`profile.sleepState` 替换 `deviceSleepState` Map**：从"每设备一份"改为"全端共享一份"
- **云函数新增 `startSleep` / `endSleep` 两个 action**：原子写入云端 sleepState，分别处理"抢占式启动"与"幂等结束"
- **客户端 `startUnifiedSleep` / `endUnifiedSleep` 改造**：调用云函数而非直接 `saveProfile`
- **Profile Watcher 新增"远端停铃"分支**：收到 `isSleeping: true→false` 变化时，本机若设过闹钟则立即取消
- **UI 新增"远端睡眠中"状态**：本机未睡眠但云端在睡眠时显示"由 [设备名] 启动" + "结束睡眠"按钮
- **移除离线容忍/本地缓存机制**：本地 `sleepState` 不再作为权威来源；断网时**直接报错**而不是依赖本地缓存
- **版本号**: 更新至 `v9.3.1`

## Impact
- Affected specs: 无现有 spec
- Affected code:
  - `cloudbase-functions/tbMutation/index.js`（新增 `startSleep` / `endSleep` case）
  - `js/app-sleep.js`（`saveSleepState` / `startUnifiedSleep` / `endUnifiedSleep` / `initSleepSettings` / `applySleepStateFromCloud` / `updateSleepCard` / `cancelSleep`）
  - `js/app-1.js`（Profile Watcher onChange 新增"远端停铃"分支）
  - `index.html` / `sw.js` / `android_project/app/build.gradle`（版本号 7 处）
  - 删除 `deviceSleepState` 相关读取路径（迁移期保留字段一段时间，详见 MODIFIED Requirements）

## Design Principles
1. **云端是唯一权威**：本机 `sleepState` 仅作为 UI 缓存，不再用于冲突解决或离线回放
2. **不做离线容忍**：网络异常时，`startSleep` / `endSleep` 直接失败，提示用户检查网络
3. **不做本地缓存机制**：Android 原生存储与 localStorage 中的 `sleepState` 不再被读为权威值（启动时仅做 UI 快速呈现，最终以云端/Watch 为准）
4. **CAS 防护多设备并发**：云函数用 `isSleeping` 前置检查保证唯一性
5. **唯一闹钟主是隐式语义**：谁点了"开始"且 CAS 成功，谁就是闹钟主（云端不背这口锅）

## ADDED Requirements

### Requirement: 云端 sleepState 单一对象模型
`profile.sleepState` 是一个**单一对象**（非 Map），所有设备共享读写。

#### Scenario: 字段结构
- **THEN** `profile.sleepState` 包含以下字段：
  - `isSleeping: boolean`
  - `sleepStartTime: number | null`（ms timestamp）
  - `sleepType: 'night' | 'nap'`
  - `startedByDeviceId: string | null`
  - `startedByDeviceName: string | null`
  - `cancelled: boolean`（true = 取消不结算，false = 正常结束需结算）
  - `lastUpdated: number`（ms timestamp，CAS 用）

### Requirement: 云函数 startSleep 抢占式启动
云函数 `startSleep` MUST 在 `sleepState.isSleeping === false` 时才允许写入，否则返回 1002 冲突。

#### Scenario: 抢占成功
- **GIVEN** 云端 `sleepState.isSleeping === false`
- **WHEN** 设备 A 调用 `startSleep` 携带 `sleepStartTime` / `deviceId` / `deviceName`
- **THEN** 云函数原子写入 `isSleeping=true, startedByDeviceId=A, lastUpdated=now`
- **AND** 返回 `code: 0`

#### Scenario: 抢占失败
- **GIVEN** 云端 `sleepState.isSleeping === true`
- **WHEN** 设备 B 调用 `startSleep`
- **THEN** 返回 `code: 1002`
- **AND** 消息体包含 `startedByDeviceName`（告知 B 是谁先开的）

### Requirement: 云函数 endSleep 幂等结束
云函数 `endSleep` MUST 幂等：当前无睡眠时返回 410；有睡眠时原子清空 `isSleeping` 与 `startedBy*` 字段。

#### Scenario: 正常结束
- **GIVEN** 云端 `sleepState.isSleeping === true`
- **WHEN** 任意设备调用 `endSleep` 携带 `cancelled: false`
- **THEN** 云函数原子写入 `isSleeping=false, cancelled=false, lastUpdated=now`
- **AND** 返回 `code: 0`

#### Scenario: 取消睡眠
- **GIVEN** 云端 `sleepState.isSleeping === true`
- **WHEN** 设备调用 `endSleep` 携带 `cancelled: true`
- **THEN** 写入 `isSleeping=false, cancelled=true, lastUpdated=now`
- **AND** 后续 Watch 接收方据此判断**不做结算**

#### Scenario: 幂等
- **GIVEN** 云端 `sleepState.isSleeping === false`
- **WHEN** 设备调用 `endSleep`
- **THEN** 返回 `code: 410`（幂等成功，不变更数据）

### Requirement: 客户端 startUnifiedSleep 调用云函数
`startUnifiedSleep` MUST 在倒计时确认后调用 `startSleep` 云函数，失败时**撤销本地闹钟**。

#### Scenario: 启动成功
- **WHEN** 用户在设备 A 完成倒计时确认
- **AND** `DAL.callMutation('startSleep', ...)` 返回 `code: 0`
- **THEN** A 设本地闹钟（`Android.scheduleAlarmWithId`）
- **AND** 写入 A 本地 `sleepState.isSleeping = true`
- **AND** UI 切换为"睡眠中"

#### Scenario: 抢占失败
- **WHEN** `startSleep` 返回 `code: 1002`
- **THEN** A 立即 `cancelAlarmWithId(ALARM_ID_SLEEP)` 与 `cancelAlarmWithId(ALARM_ID_NAP)`
- **AND** A 本地 `sleepState.isSleeping = false`
- **AND** UI 提示"睡眠已被 [设备名] 先开启"

#### Scenario: 网络异常
- **WHEN** `startSleep` 调用抛出异常（断网）
- **THEN** A 撤销本地闹钟
- **AND** UI 提示"网络异常，无法开始睡眠"
- **AND** 不写本地睡眠状态

### Requirement: 客户端 endUnifiedSleep 调用云函数
`endUnifiedSleep` MUST 先调 `endSleep` 云函数，再在本地执行结算。

#### Scenario: 本机结束
- **GIVEN** A 本地 `sleepState.isSleeping === true`
- **WHEN** A 调用 `endUnifiedSleep`
- **THEN** A 调 `DAL.callMutation('endSleep', { cancelled: false })`
- **AND** A 取消本地闹钟
- **AND** A 执行 `doSleepSettlement` 写交易/历史

#### Scenario: 远端结束（本机未在睡眠但云端在）
- **GIVEN** A 本地 `sleepState.isSleeping === false` 但云端 `isSleeping === true`
- **WHEN** A 调用 `endUnifiedSleep`（用户在 A 上主动结束别人的睡眠）
- **THEN** A 调 `DAL.callMutation('endSleep', { cancelled: false })`
- **AND** A 写交易/历史（结算用云端 `sleepStartTime`）
- **AND** A UI 提示"已为 [startedByDeviceName] 结束睡眠"

### Requirement: Profile Watcher 远端停铃
Profile Watcher MUST 在收到 `sleepState.isSleeping: true→false` 变化时，若本机之前设过闹钟则立即取消。

#### Scenario: 远端结束触发本机停铃
- **GIVEN** A 本地 `sleepState.isSleeping === true` 且已设本地闹钟
- **WHEN** B 在远端结束睡眠，云端 `isSleeping` 变 false
- **AND** A 的 Watcher 收到 update
- **THEN** A 调 `cancelAlarmWithId(ALARM_ID_SLEEP)` 与 `cancelAlarmWithId(ALARM_ID_NAP)`
- **AND** A 调 `Android.stopSleepMonitor()`
- **AND** A 本地 `sleepState.isSleeping = false`（仅 UI 缓存，不写云端）
- **AND** A 显示"睡眠已被其他设备结束"通知

#### Scenario: cancelled 时不期待结算
- **GIVEN** 上一步远端结束触发停铃
- **WHEN** 云端 `sleepState.cancelled === true`
- **THEN** A UI 提示"已被取消"，不做任何结算动作（结算由操作设备完成）

### Requirement: UI 区分"远端睡眠中"状态
`updateSleepCard` MUST 在本机 `sleepState.isSleeping === false` 但云端 `sleepState.isSleeping === true` 时，显示"由 [设备名] 启动"。

#### Scenario: 卡片显示
- **THEN** statusEl.textContent = `睡眠中（${startedByDeviceName}）`
- **AND** 主按钮文案 = "结束睡眠"
- **AND** 主按钮点击触发 `endUnifiedSleep`（远端结束分支）

### Requirement: 版本号更新至 v9.3.1
所有 7 个位置的版本号 MUST 更新为 `v9.3.1`。

#### Scenario: 版本号一致性
- **THEN** `js/app-1.js` 中 `APP_VERSION` = `"v9.3.1"`
- **AND** `index.html` `<title>` 标签包含 `v9.3.1`
- **AND** `index.html` `.version-subtitle` 显示 `v9.3.1`
- **AND** `index.html` 关于页版本号 = `v9.3.1`
- **AND** `sw.js` 文件头部注释版本号 = `v9.3.1`
- **AND** `sw.js` `CACHE_NAME` = `timebank-cache-v9.3.1`
- **AND** `android_project/app/build.gradle` `versionName` = `"9.3.1"`

## MODIFIED Requirements

### Requirement: saveSleepState 改为写云端统一字段
`saveSleepState` MUST 改为写 `profile.sleepState`（单一对象）而非 `deviceSleepState.${deviceId}`。

#### Scenario: 字段写入
- **THEN** 写云端时使用 `DAL.saveProfile({ sleepState: _.set(criticalState) })`
- **AND** 不再写 `deviceSleepState.${currentDeviceId}`

### Requirement: applySleepStateFromCloud 接受统一对象
`applySleepStateFromCloud` MUST 接收**云端 `sleepState` 单一对象**（非 Map 项），并按 `lastUpdated` 比较决定是否覆盖本地 UI 缓存。

#### Scenario: Watch 触发更新
- **GIVEN** A 的 Watcher 收到 `sleepState` update
- **THEN** 调用 `applySleepStateFromCloud(doc.sleepState)`
- **AND** 若 `lastUpdated > 本地 lastUpdated`，更新本地 UI 缓存
- **AND** 不再读 `deviceSleepState[deviceId]`

### Requirement: initSleepSettings 启动时不依赖本地 sleepState 权威
`initSleepSettings` MUST 不再把本地 `sleepState` 当作权威来源；本地值仅在 Watch 尚未就绪时做 UI 占位，最终以云端/Watch 为准。

#### Scenario: 初始化流程
- **THEN** 本地 sleepState 仅作为 UI 占位（init 期间使用）
- **AND** Watcher 就绪后由 onChange 统一覆盖
- **AND** 不再做"本地有则保持本地"决策（云端永远为准）

### Requirement: cancelSleep 走云函数
`cancelSleep` MUST 通过 `endSleep({ cancelled: true })` 云函数清空云端状态（而非只写本地）。

#### Scenario: 取消流程
- **WHEN** 用户点"取消睡眠"
- **THEN** 调 `DAL.callMutation('endSleep', { cancelled: true })`
- **AND** 取消本地闹钟
- **AND** 云端写 `cancelled: true`（供其他设备 Watch 判断不结算）

## REMOVED Requirements

### Requirement: 离线容忍与本地缓存机制
**Reason**: 用户明确要求"不设计离线容忍机制等本地缓存机制，永远以云端为准"。本地 `sleepState` 与 Android 原生存储不再作为权威来源；断网时直接报错。

**Migration**:
- 删除 `saveSleepState` 中"先写本地再异步同步云端"的链式逻辑，改为"云端先返回成功后再写本地 UI 缓存"
- 删除 `loadSleepState` 中"Android 原生 → localStorage → 云端"的三级降级逻辑；只保留 UI 占位
- 启动时若云端未就绪，本地 `sleepState` 初始为 `{ isSleeping: false }`，由 Watcher 首次回调覆盖

### Requirement: deviceSleepState 字段
**Reason**: 字段结构从"按设备 Map"改为"全端单一对象"。

**Migration**:
- 启动时若 `profileData.deviceSleepState` 存在而 `profileData.sleepState` 不存在，做一次性迁移：
  - 取 `deviceSleepState` 中 `isSleeping=true` 且 `lastUpdated` 最大的那条
  - 写入 `profile.sleepState = { ..., startedByDeviceName: '历史会话（已迁移）' }`
  - 删除 `profileData.deviceSleepState` 字段
- 迁移完成后调用一次 `DAL.saveProfile` 把新结构写回云端
