# 修复跨设备同步 running 状态冲突 Spec (v8.2.15)

## Why
当 Android 端完成任务并记录交易后，Web 端可能因 Watch 连接断开/延迟、`DAL.loadAll()` 盲目信任云端或 `DAL.updateRunningTask` 静默失败，导致 Web 端的 stale running 状态重新写入 `tb_running`，覆盖 Android 端的完成状态，最终造成交易数据丢失。

## What Changes
- **DAL.startTask**: UPDATE 失败时增加 ADD 回退（fallback），防止 CloudBase 中无文档但本地 runningTasks 已设置的半一致状态
- **DAL.updateRunningTask**: 增加文档存在性检查，文档已被其他设备删除时不静默失败，转而清理本地状态
- **DAL.loadAll**: 增加跨设备保护逻辑 - 基于云端文档的 `clientId` 字段，对不属于本设备的 running 记录执行"保留本地"策略
- **Watch remove 事件处理**: 确保远程删除事件触发时，本地的 `runningCache` 也被清理
- **tb_running 文档**: 增加 `lastUpdatedAt` 时间戳字段，作为跨设备冲突解决的判断依据
- **版本号**: 更新至 `v8.2.15`（7 个位置）

## Impact
- Affected specs: 无现有 spec
- Affected code: `js/app-1.js` (DAL.startTask, DAL.updateRunningTask, DAL.loadAll, tb_running Watch handler, DAL.subscribeAll, WATCH_GRACE_PERIOD, APP_VERSION), `index.html` (title, version-subtitle, 关于页), `sw.js` (注释, CACHE_NAME), `android_project/app/build.gradle` (versionName)

## ADDED Requirements

### Requirement: DAL.startTask 失败回退为 ADD
DAL.startTask 在 runningCache 中存在 docId 时先尝试 UPDATE，若失败（文档已被其他设备删除）则自动回退为 ADD 操作，确保 CloudBase 与本地状态一致。

#### Scenario: 跨设备文档已被删除时回退为 ADD
- **GIVEN** Android 端完成了任务，`tb_running` 中文档 `doc_123` 已被删除
- **AND** Web 端的 `runningCache` 仍缓存 taskId → `doc_123`
- **WHEN** Web 端再次开始该任务，`DAL.startTask` 检测到 `existingDocId = doc_123`
- **AND** UPDATE 操作因文档不存在而失败
- **THEN** DAL.startTask 自动回退为 ADD，新建文档
- **AND** runningCache 更新为新文档 ID

### Requirement: DAL.updateRunningTask 文档存在性守卫
DAL.updateRunningTask 在执行 UPDATE 前验证目标文档仍然存在，若已被其他设备删除则清理本地 runningCache 和 runningTasks。

#### Scenario: 远程设备已删除文档
- **GIVEN** Android 端完成了任务，`tb_running` 中文档已被删除
- **AND** Web 端的 runningCache 仍持有已删除的 docId
- **WHEN** Web 端调用 DAL.updateRunningTask（如浮窗定时器更新、暂停/恢复操作）
- **THEN** UPDATE 返回文档不存在错误
- **AND** DAL.updateRunningTask 清理本地 runningCache 和 runningTasks
- **AND** 记录日志便于排查

### Requirement: tb_running 文档增加 lastUpdatedAt 时间戳
所有 tb_running 文档写入/更新时附带 `lastUpdatedAt` 字段，作为跨设备冲突解决的比较依据。

#### Scenario: 写入时携带时间戳
- **WHEN** DAL.startTask 或 DAL.updateRunningTask 写入 tb_running
- **THEN** 文档包含 `lastUpdatedAt: Date.now()` 字段

### Requirement: DAL.loadAll 跨设备 running 保护
DAL.loadAll 在应用云端 runningTasks 时，增加跨设备保护：对于 `clientId` 不属于本设备的 running 记录，检查本设备是否有该任务的本地运行状态，若有则保留本地版本而非直接覆盖。

#### Scenario: Watch 重建后保留本地任务状态
- **GIVEN** Web 端正有 3 个任务在运行中
- **AND** Watch 连接断连并重建
- **WHEN** DAL.loadAll 从云端读取 runningTasks
- **AND** 云端某条记录的 `clientId !== thisClientId`
- **AND** 本地 runningTasks 中也有同 taskId 的记录
- **THEN** DAL.loadAll 保留本地 runningTasks 记录（而非直接使用云端版本）
- **BUT** 对于云端有而本地没有的记录，且 `clientId !== thisClientId`，接受云端状态

### Requirement: Watch remove 事件同步清理 runningCache
当 tb_running Watch 收到其他设备的 remove 事件时，必须同步清理本地的 runningCache，防止后续操作错误引用已删除的文档 ID。

#### Scenario: 远程删除后清理缓存
- **GIVEN** Web 端的 runningCache 中 taskId → `doc_123`
- **WHEN** Watch 收到 taskId 对应文档的 remove 事件
- **AND** `remoteClientId !== clientId`（来自其他设备）
- **THEN** runningCache.delete(taskId) 与 runningTasks.delete(taskId) **同时执行**

### Requirement: 版本号更新至 v8.2.15
所有 7 个位置的版本号 MUST 更新为 `8.2.15`。

#### Scenario: 版本号一致性
- **THEN** `js/app-1.js` 中 `APP_VERSION` = `"8.2.15"`
- **AND** `index.html` `<title>` 标签包含 `8.2.15`
- **AND** `index.html` `.version-subtitle` 显示 `v8.2.15`
- **AND** `index.html` 关于页版本号 = `v8.2.15`
- **AND** `sw.js` 文件头部注释版本号 = `v8.2.15`
- **AND** `sw.js` `CACHE_NAME` = `timebank-cache-v8.2.15`
- **AND** `android_project/app/build.gradle` `versionName` = `"8.2.15"`

## MODIFIED Requirements

### Requirement: stopTask 流程增加跨设备确认
stopTask 在完成交易写入后，增加一次额外的 CloudBase tb_running 状态检查，确认本机删除操作已在云端生效。若检测到云端仍有其他设备的 running 记录（说明其他设备可能在此期间重新开始了任务），则不覆盖其他设备的运行状态。

#### Scenario: 完成操作后云端确认
- **GIVEN** Android 端调用 stopTask 完成任务
- **AND** DAL.stopTask 已删除 tb_running 中的文档
- **AND** addTransaction 已写入交易记录
- **WHEN** saveData 完成后
- **THEN** 可选的二次检查：查询 tb_running 确认 taskId 不存在
- **AND** 若发现 taskId 重新出现在 tb_running（由其他设备新创建），保留该记录

## REMOVED Requirements
无
