> ⚠️ **DEPRECATED**：本版本号 v9.0.12 已废弃，实际工作以 v9.2.1 版本号发布（[spec](../v9-2-1-pwa-bugfix-completion/spec.md)）。本目录作历史存档保留。
>
> 上一个开发 AI 的"v9.0.12 实施完成"报告**不真实**：10 项修复只完成了 2 项（app-2.js runningData 加 clientId、tbMutation 写 clientId），其余 8 项在 v9.2.1 中完成。

# v9.0.12 Watch onChange 心跳补全 + 客户端 ID 端到端 + 幽灵变量治理

## Why

v9.0.11 修复了 5 类连锁问题，但通过对 `bug反馈.txt` 控制台日志的深入分析，发现还有 3 类真 Bug 未被修复或修复不彻底：

### 1. `isImportMode is not defined`（P0 真 Bug，v9.0.11 漏修）
- 位置：[app-1.js:3966](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3966) Transaction onChange
- 现象：所有 `Transaction.add` / `Daily.add` 事件触发时抛 `ReferenceError: isImportMode is not defined`
- 根因：`isImportMode` 在文件中**仅作为隐式全局**被使用，从未用 `let`/`var`/`const` 声明
  - 在 [app-1.js:2461, 2529, 2535, 2569, 2686, 2754](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2461) **赋值**（隐式创建全局）
  - 在 [app-1.js:3966](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3966) **读取**（未声明抛 ReferenceError）
  - 在 [app-auth.js:1328-1329](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L1328) 用了 `typeof` 守卫
- 非严格模式下：赋未声明变量**静默**创建全局，**读取**未声明变量**必抛** ReferenceError
- PWA 启动后未调过 `DAL.importFromBackup` 时，全局变量不存在 → onChange 第一次读即抛错
- 影响：所有 Transaction/Daily 新增数据未进 `transactions` 数组、余额未更新、习惯连胜不重算 → **数据漂移**

### 2. Watch 60s 雪崩（v9.0.11 修复不彻底）
- v9.0.11 声称"5 处 onChange 恢复心跳刷新"，但实际**只修复 3 处**
- 经核对 [app-1.js:3879, 4036, 4182](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3879) 才有 `watchLastEventTime.X = Date.now()`
- **缺失 2 处**：
  - **Transaction onChange** [app-1.js:3941-4006](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3941) — 漏加
  - **Profile onChange** [app-1.js:4110-4151](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4110) — 显式注释"v8.2.17 移除心跳更新"，与 v9.0.11 的设计自相矛盾
- 触发链：stopTask 路径上，Transaction 变更但无心跳刷新 → 60s 后 watchdog 误判 transaction/profile 失联 → 触发 `checkAndRebuildWatchers(true)` → 整个连接重建 → 形成循环

### 3. Running 事件来源识别失败（`remoteClientId: undefined`）
- 日志证据：13-14 行
  ```
  📡 [DAL] Running add: 1761905981691 remoteClientId: undefined localClientId: client_xxx
  📡 [DAL] 任务开始: 1761905981691 (来自其他设备)
  ```
- 明明是本机 `startTask` 触发，被错判为"来自其他设备"→ 重复处理任务事件
- 根因链（3 处缺一不可）：
  1. **客户端** [app-2.js:4450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4450) `runningData` 不含 `clientId`
  2. **客户端** [app-1.js:3567-3574](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3567) `DAL.startTask` 调用 `callMutation` 时**未传** `clientId`
  3. **云函数** [tbMutation/index.js:275-283](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L275) 写入 `tb_running` 的 doc 缺 `clientId` 字段
- 客户端 watch handler [app-1.js:4041](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4041) `const remoteClientId = doc.clientId || doc.data?.clientId;` 永远取到 undefined
- `undefined === 'client_xxx'` 为 false → 走"其他设备"分支 → 重复 add

### 4. 僵尸 WatchId（v9.0.11 800ms 等待不足）
- 日志证据：watchId `watchid_1780905989682_0.977077193056116` 在服务端持续推消息 9 次
- 客户端 watchers[key]=null 后，SDK 内部 WebSocket 复用时，老 watch 的 unsubscribe 与新 watch 的 subscribe 消息在网络层交错
- 服务器可能先收到新 subscribe 后才收到老 unsubscribe，导致老 watchId 仍然订阅中
- 800ms 固定等待不足以应对网络拥塞

### 5. completionCount 落后 1 笔（v9.0.11 部分修复）
- 日志证据：`[completionCount 修复] taskId=1761905981691, 交易数=275, 存储=274 → 修正为275`
- v9.0.11 已实现"修 + 写回云端"，但 `DAL.addTransaction` 成功后**没有立即更新本地 `task.completionCount`**
- 必须等 watchdog 触发的 activeSync（最长 60s）才被修复

## What Changes

### Fix 1（P0）：声明 `isImportMode`
- 在 `app-1.js` 顶部（`clientId` 声明区附近）加 `let isImportMode = false;`
- 7 处隐式赋值保持不变（已存在的不需改），但有了显式声明后读取不再抛错

### Fix 2（P0）：Transaction/Profile onChange 补心跳刷新
- [app-1.js:3941-3942](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3941) Transaction onChange：开头加 `watchLastEventTime.transaction = Date.now();`
- [app-1.js:4110-4112](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4110) Profile onChange：删掉 `// [v8.2.17] 移除心跳更新` 注释，改加 `watchLastEventTime.profile = Date.now();`

### Fix 3（P1）：Running 事件源识别端到端修复
- **客户端** [app-2.js:4450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L4450)：`runningData` 构造时加 `clientId: clientId`
- **客户端** [app-1.js:3567-3588](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3567) `DAL.startTask`：在 callMutation data 中加 `clientId: data.clientId || clientId`
- **云函数** [tbMutation/index.js:275-283](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L275)：startTask 写入 doc 加 `clientId: data.clientId || data.data?.clientId || null`
- **客户端** [app-1.js:4051, 4061, 4071](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4051) onChange 比较：改为 `if (remoteClientId && remoteClientId === clientId)`（null-safe 防御）

### Fix 4（P1）：unsubscribeAll 动态退避等待
- [app-1.js:4224-4269](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4224) `unsubscribeAll`：800ms 固定等待 → 动态退避（800ms → 1.5s → 3s，最多 5 次重试）
- 防止 unsubscribe 与新 subscribe 在网络层交错导致僵尸 watchId

### Fix 5（P2）：addTransaction 即时更新本地 completionCount
- [app-1.js:3349-3406](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3349) `addTransaction` 提交成功后，遍历 `tasks` 找到匹配 `tx.taskId` 的，更新 `task.completionCount += 1`，调度 `saveTask` 写回
- 抽取公共 `__fixCompletionCount()` 工具（消除 3 处重复）

## Impact

- Affected code：
  - `app-1.js`（5 处：isImportMode 声明、Transaction onChange、Profile onChange、DAL.startTask、unsubscribeAll）
  - `app-2.js`（1 处：startTask runningData）
  - `tbMutation/index.js`（1 处：startTask 写 clientId）
- 11 处版本号同步到 v9.0.12
- 需部署云函数 `tbMutation`

## 用户可见改善

| 现象 | 修复前 | 修复后 |
|------|--------|--------|
| Transaction add 事件 ReferenceError | 必抛 → 数据未进数组 → 余额不更新 | 静默通过 → 正常处理 |
| Watch 60s 雪崩（5 个 watcher 反复重建） | 1 分钟一次 → 5+ 次/小时 | 业务事件持续刷新心跳 → 几乎不触发 |
| 本机 startTask 被错认为"来自其他设备" | runningTasks 重复 add | 正确识别本机 → 跳过 |
| 僵尸 watchId 持续 9+ 次推送 | 出现 | 几乎不出现 |
| completionCount 落后 1 笔 | 60s 后才修复 | 立即修复 |

## 不影响

- v9.1.0 的纯云端架构（云端是唯一权威源不变）
- v9.0.11 的 watchdog 限频 + 自愈探针机制
- v8.2.x 历史的 Watch 错误处理
