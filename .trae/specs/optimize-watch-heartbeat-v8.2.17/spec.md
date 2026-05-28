# 优化 Watch 心跳与重连机制 Spec (v8.2.17)

## Why

Watch 心跳监控机制存在逻辑缺陷：`watchLastEventTime` 仅在收到云端数据变更事件时更新，导致"用户正常使用但云端无新数据变更"的情况下，60 秒后 watchdog 误判为"连接断连"，触发不必要的重建 + 补偿同步。虽然现有数据保护机制（pendingRegistry、时间戳获胜、智能合并）确保不会丢失用户操作，但造成以下问题：

1. **性能浪费**：无意义的 `unsubscribeAll` → `subscribeAll` → `loadAll` → `reconcileCloudAfterWatch` 链路循环执行
2. **API 配额消耗**：每次重建消耗 QPS 配额，增加 CloudBase 压力
3. **不必要的 UI 刷新**：重建链路最终调用 `updateAllUI()`，可能导致界面闪烁
4. **竞态风险**：`checkAndRebuildWatchers(true)` 缺少 `isSaving` 保护，在用户正在保存时触发全量同步

## What Changes

- **心跳机制重构**：从"事件检查"改为"连接活跃度检查"，watcher 注册成功且未收到错误即认为连接活跃
- **Watchdog 逻辑优化**：仅在 Watch 发生 error 事件时才判定断连，而非"无事件超时"
- **checkAndRebuildWatchers 增加 isSaving 保护**：用户正在保存时跳过重建
- **增加用户操作保护窗口**：用户关键操作后 30 秒内不触发自动同步重建
- **版本号**：更新至 `8.2.17`（需用户确认后更新 7 个位置）

## Impact

- Affected specs: 无现有 spec
- Affected code: `js/app-1.js` (watchdog 逻辑、心跳机制、checkAndRebuildWatchers、isSaving 保护、用户操作保护窗口)
- 不涉及数据库结构变更
- 不影响跨设备同步逻辑

## ADDED Requirements

### Requirement: 用户操作保护窗口

The system SHALL 维护一个 `lastUserOperationAt` 时间戳，在用户执行关键操作（完成任务、启动/停止任务、保存设置等）时更新。同步重建机制在执行前必须检查该时间戳，若距离上次用户操作不足 30 秒则跳过。

#### Scenario: 用户完成任务后不触发同步重建
- **WHEN** 用户点击"完成任务"
- **AND** `lastUserOperationAt` 更新为当前时间
- **AND** 20 秒后 watchdog 触发心跳超时检查
- **THEN** `checkAndRebuildWatchers` 检测到保护期内，跳过重建
- **AND** 记录日志：`[Sync] 用户操作保护期内(剩余10s)，跳过重建`

### Requirement: checkAndRebuildWatchers 增加 isSaving 保护

The system SHALL 在 `checkAndRebuildWatchers` 函数入口处检查 `isSaving` 状态。若用户正在保存数据，则跳过重建并记录日志。

#### Scenario: 用户正在保存时跳过重建
- **GIVEN** 用户正在执行 `saveData()`，`isSaving = true`
- **WHEN** watchdog 触发 `checkAndRebuildWatchers(true)`
- **THEN** 函数检测到 `isSaving = true`，立即返回
- **AND** 记录日志：`[checkAndRebuildWatchers] 用户正在保存，跳过重建`

### Requirement: 心跳机制从事件驱动改为连接驱动

The system SHALL 改变心跳检测逻辑：不再以"收到数据变更事件"作为心跳依据，而是以"watcher 注册成功且未收到 error 事件"作为连接活跃的标志。

具体实现：
1. 在 `subscribeAll` 中，watcher 注册成功后立即将 `watchLastEventTime[key]` 设为当前时间
2. 在 `onChange` 回调中，仅更新 `watchConnected[key] = true`，**不再更新** `watchLastEventTime`
3. 在 `onError` 回调中，将 `watchLastEventTime[key]` 设为 `0`（标记断连）
4. Watchdog 检查时，`watchLastEventTime[key] > 0` 即认为连接活跃

#### Scenario: 正常连接无数据变更
- **GIVEN** 所有 watcher 注册成功
- **AND** 云端无新数据变更
- **WHEN** watchdog 每 15 秒检查心跳
- **THEN** `watchLastEventTime[key]` 保持为注册时间，不被清零
- **AND** watchdog 不判定为超时
- **AND** 不触发重建

#### Scenario: Watch 错误导致心跳清零
- **GIVEN** 所有 watcher 注册成功
- **WHEN** 某个 watcher 收到 error 事件
- **THEN** `watchLastEventTime[该key]` 设为 `0`
- **AND** `watchConnected[该key]` 设为 `false`
- **AND** watchdog 下次检查时检测到 `watchLastEventTime = 0`，不判定超时（因为尚未建立活跃心跳）
- **AND** `scheduleWatchReconnect` 被 error 回调直接触发

## MODIFIED Requirements

### Requirement: Watchdog 超时检查逻辑

Watchdog 的心跳超时检查逻辑修改为：仅检查 `watchLastEventTime[key]` 是否大于 0 且超过超时阈值。`watchLastEventTime[key] = 0` 表示尚未建立活跃连接或已发生错误，不纳入超时检查。

当前逻辑（修改前）：
```javascript
if (lastTime > 0 && now - lastTime > WATCH_HEARTBEAT_TIMEOUT_MS) {
    staleWatchers.push(key);
}
```

修改后逻辑保持不变，但 `watchLastEventTime` 的赋值策略改变（由事件驱动改为连接驱动），使得该检查真正反映"连接是否异常"而非"是否有数据变更"。

### Requirement: scheduleWatchReconnect 入口保护

The system SHALL 在 `scheduleWatchReconnect` 函数中增加 `isSaving` 和 `lastUserOperationAt` 双重保护检查。若用户正在保存或在操作保护窗口内，不增加重连计数器、不弹出提示。

#### Scenario: 保护期内不触发重连调度
- **GIVEN** `isSaving = true`
- **WHEN** `scheduleWatchReconnect` 被调用
- **THEN** 函数直接返回，不设置 `watchReconnectTimers.pending`
- **AND** 不增加重连计数器
- **AND** 记录日志：`[Watch] 用户正在保存，跳过重连调度`

## REMOVED Requirements

无。保留现有的 pendingRegistry 保护、时间戳获胜策略、智能合并等机制。本次修改仅优化触发时机，不改变数据合并逻辑。
