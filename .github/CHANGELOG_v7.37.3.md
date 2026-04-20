# v7.37.3 更新日志

## 发布日期
2026-04-20

## 问题修复

### 1. 修复同步状态显示"未连接"的问题（核心 Bug）

**问题描述**：
- 状态栏一直显示"未连接"或"同步中 X/5"
- Watch 实际上已经连接成功，但 UI 判断逻辑有误

**根本原因**：
- `watchers` 对象只有 4 个 key（profile, task, transaction, running）
- 但 `watchRegistered` 和 `watchConnected` 有 5 个 key（多了 daily）
- UI 判断逻辑使用 `Object.keys(watchConnected).length` 得到 5，但最多只有 4 个能连接成功
- 导致 `connectedCount < totalWatchers` 永远为 true，状态永远显示"未连接"

**修复内容**：
- 在 `watchers` 对象中添加 `daily: null`，与另外两个状态对象保持一致
- 调整 Watch 的 `onChange` 和 `onError` 回调中的状态设置逻辑
- 移除 `onChange` 中对 `watchRegistered` 的多余设置

### 2. 解决交易丢失问题

**问题描述**：
- 网络不稳定时，交易可能在写入过程中丢失
- 刷新或重新进入应用后数据有几率恢复

**修复内容**：
- `addTransaction` 添加本地 pending 状态，交易立即显示在列表中
- Watch 收到云端确认后更新状态为 synced
- 写入失败时保持 pending 状态，不丢失本地数据

### 3. 增强失败重试机制

**问题描述**：
- 网络恢复后，失败队列中的交易不会自动重试
- 只在应用重新加载时才重试

**修复内容**：
- 新增独立定时器，每 60 秒检查一次失败队列
- 在 `startActiveSync()` 中启动，确保长时间运行的 App 也能自动重试

### 4. 修复手动同步功能

**问题描述**：
- Watch 显示未连接时，手动同步点击后仍然显示未连接
- 等待时间过短（3秒），WebSocket 握手未完成

**修复内容**：
- 等待时间从 3 秒增加到 10 秒
- Watch 未完全连接时，强制执行全量加载而不是依赖 Watch 增量同步

## 代码修改

| 文件 | 修改点 |
|------|--------|
| app-1.js | watchers 对象添加 daily |
| app-1.js | Watch onChange/onError 状态设置逻辑调整 |
| app-1.js | addTransaction 添加本地 pending 状态 |
| app-1.js | 新增失败重试独立定时器 |
| app-1.js | 手动同步等待时间增加、强制全量加载 |

## 测试建议

1. 重新打开应用，观察状态栏是否显示"已同步"
2. 测试断网后完成交易，网络恢复后交易是否自动同步
3. 测试手动同步功能是否正常工作
