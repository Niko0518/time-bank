# Checklist — v9.0.11

> 完成后请将每条 `[ ]` 勾选为 `[x]`

## Group A：Watch 同步机制
- [x] A1.1 `unsubscribeAll` 真正等 ws 关闭（800ms）
- [x] A2.1 watchdog 限频 1h 6 次 + 自愈探针
- [x] A2.2 重建后补偿同步延后 8s
- [x] A3.1 Task onChange 刷新心跳
- [x] A3.2 Transaction onChange 刷新心跳
- [x] A3.3 Running onChange 刷新心跳
- [x] A3.4 Profile onChange 刷新心跳
- [x] A3.5 Daily onChange 刷新心跳

## Group B：SDK 加载时序
- [x] B1.1 引入 `whenCloudBaseReady` Promise
- [x] B1.2 `initCloudBase` 触发 resolve/reject
- [x] B2.1 `initCloudBase` 失败仅首次日志
- [x] B2.2 `waitForCloudBase` 150 × 200ms = 30s
- [x] B2.3 `refreshLoginState` 改用 `whenCloudBaseReady(5000)`

## Group C：核心 Bug
- [x] C1.1 `DAL.fetchDelta` 补 `const currentUid = ...`

## Group D：completionCount 写回
- [x] D1.1 客户端 `DAL.saveTask` 加 `completionCount` 字段
- [x] D2.1 云函数 `tbMutation.saveTask` 加 `completionCount` 字段
- [x] D3.1 activeSync 修复循环加 `DAL.saveTask` 写回
- [x] D3.2 loadAll 修复循环加 `DAL.saveTask` 写回
- [x] D3.3 handleIncrementalSync 修复循环加 `DAL.saveTask` 写回

## Group E：按钮 ID
- [x] E1.1 `setupTaskModalEventListeners` 改用真实 ID
- [x] E2.1 `setAuthLoading` null-safe
- [x] E3.1 DOMContentLoaded 调用 `setupTaskModalEventListeners`

## Group F：AI service
- [x] F1.1 `updateAIInsightCardStatus` 先等 SDK + try/catch
- [x] F2.1 setInterval 间隔 3000 → 30000

## Group G：版本号同步
- [x] G1.1 APP_VERSION v9.1.0 → v9.0.11（双端）
- [x] G1.2 CACHE_NAME（双端）
- [x] G2.1 index.html title
- [x] G2.2 index.html version-subtitle
- [x] G2.3 index.html 关于页版本
- [x] G2.4 index.html 用户日志新增 v9.0.11 条目
- [x] G3.1 build.gradle versionName + versionCode
- [x] G4.1 AGENTS.md 当前版本
- [x] G4.2 AGENTS.md 版本日志新增 v9.0.11 版块

## 验证
- [ ] 启动 PWA，5 分钟内无雪崩
- [ ] 任务创建 + 交易记录后刷新，completionCount 正确
- [ ] 邮箱登录按钮响应正常
- [ ] 断网 → 恢复，watch 自愈探针生效
- [ ] 部署 `tbMutation` 云函数
