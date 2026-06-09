# v9.2.1 PWA Bugfix 续作（v9.0.12 工作延续）Spec

> ⚠️ **v9.2.1 = v9.0.12 工作的延续**。v9.0.12 是上一个开发 AI 半完成的状态（10 项修复只完成 2 项），v9.2.1 废弃 v9.0.12 版本号（spec 目录保留作历史），把所有未实施修复以 v9.2.1 版本号发布。
>
> 版本号关系：v9.2.0（已推送：使用偏好独立化 + 报告页 AI 伙伴合并）→ **v9.2.1**（v9.0.12 工作的延续）

## Why

v9.0.12 设计了 5 类 PWA 实时性 bug 修复（基于 `bug反馈.txt` 控制台日志分析），但实际只实施了 2/10：

- **2 项已实施**：app-2.js runningData 加 clientId、tbMutation 云函数写 clientId 字段
- **8 项未实施**：isImportMode 显式声明、Transaction/Profile onChange 心跳、startTask 传 clientId、onChange null-safe 防御、unsubscribeAll 动态退避、`__fixCompletionCount()` 工具抽取 + 3 处调用

这 8 项都是**根因级修复**（基于真实 bug 日志设计），不实施意味着生产环境**每天都会触发的连锁问题**仍未解决。

## What Changes

### 修复 1（P0-1）：`isImportMode` 显式声明

**位置**：[app-1.js:33](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L33) 附近（clientId 声明区）

**现状**：7 处 `isImportMode = ...` 是**隐式全局赋值**（2462、2530、2536、2570、2687、2755 行），1 处 `if (isImportMode) continue;` 是**未声明读取**（3967 行）。PWA 启动后未调过 `DAL.importFromBackup` 时全局变量不存在 → 读取抛 `ReferenceError`。

**修复**：
```js
// [v9.2.1] 显式声明：消除隐式全局，避免 PWA 启动后首次 Transaction onChange 抛 ReferenceError
let isImportMode = false;
```

### 修复 2（P0-2）：Transaction onChange 事件驱动心跳

**位置**：[app-1.js:3942](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3942) Transaction onChange 开头

**现状**：v9.0.11 已为 Task（3880 行）和 Running（4037 行）加了 `watchLastEventTime.X = Date.now()`，但**Transaction onChange 漏了**。watchdog 60s 误判 transaction 失联 → 触发 watch 重建循环。

**修复**：
```js
onChange: (snapshot) => {
    watchConnected.transaction = true;
    // [v9.2.1] 事件驱动心跳：业务事件本身就是"连接还活着"的最真实信号
    watchLastEventTime.transaction = Date.now();
    console.log('📡 [DAL] Transaction 变更:', snapshot.type);
    ...
}
```

### 修复 3（P0-3）：Profile onChange 事件驱动心跳

**位置**：[app-1.js:4111](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4111) Profile onChange 开头

**现状**：v8.2.17 注释 `// [v8.2.17] 移除心跳更新：心跳由连接驱动，不再由事件驱动`（4113 行）—— 这是 v8.2.17 的反模式设计，v9.0.11 没纠正过来。Profile 表更新事件会触发大量 UI 重建（categoryColors / collapsedCategories / sleepSettings / 等），是连接活着的强信号。

**修复**：
```js
onChange: (snapshot) => {
    watchConnected.profile = true;
    // [v9.2.1] 事件驱动心跳：与 Task/Running/Transaction 一致，v8.2.17 反模式已废除
    watchLastEventTime.profile = Date.now();
    console.log('📡 [DAL] Profile 变更');
    ...
}
```

### 修复 4（P1-1）：DAL.startTask 显式传 clientId

**位置**：[app-1.js:3568-3574](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3568) callMutation('startTask', ...) data

**现状**：app-2.js:4451 已把 `clientId: clientId` 加到 `runningData`，但 `callMutation('startTask', { ... data })` 把 `data` 整个嵌套到 `data` 字段里，**没把 clientId 提到顶层**。云函数 [tbMutation/index.js:281-283](file:///d:/TimeBank/cloudbase-functions/tbMutation/index.js#L281) 写 `clientId: data.clientId || runningData.clientId || null`——已经能读到 clientId（在 data 或 runningData 嵌套里），但依赖嵌套结构不健壮。

**修复**：
```js
callMutation('startTask', {
    _openid: currentUid,
    taskId,
    startTime: data.startTime,
    accumulatedTime: data.accumulatedTime || 0,
    isPaused: data.isPaused || false,
    // [v9.2.1] 显式提到顶层：让云函数无需深入 data 嵌套，与云函数 clientId 写入对齐
    clientId: data.clientId || clientId,
    data
}, {...});
```

### 修复 5（P1-2）：onChange 端 null-safe 防御

**位置**：[app-1.js:4052, 4062, 4072](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4052) 三处 `if (remoteClientId === clientId)`

**现状**：当云端 clientId 为 `undefined`（旧云函数部署 / 老数据）时，`undefined === 'client_xxx'` 为 `false` → 走"来自其他设备"分支 → 重复 add/remove running task。

**修复**：
```js
// [v9.2.1] null-safe：旧数据无 clientId 字段时跳过"本机"判断，避免误判
if (remoteClientId && remoteClientId === clientId) {
    console.log(`🛡️ [DAL] 忽略 ${change.dataType} 事件: 本机触发 (taskId=${taskId})`);
    continue;
}
```

### 修复 6（P1-3）：unsubscribeAll 动态退避

**位置**：[app-1.js:4251](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4251) `await new Promise((r) => setTimeout(r, 800));`

**现状**：800ms 固定等待服务器 ACK。在网络拥塞时，老 watch 的 unsubscribe 与新 watch 的 subscribe 消息在 WebSocket 层交错 → 服务器可能先收到新 subscribe 后才收到老 unsubscribe → 老 watchId 仍然订阅中 → 僵尸 watchId 持续推送（spec 引用日志：watchid 推 9 次）。

**修复**：
```js
// [v9.2.1] 动态退避：800ms × 1.5^n 退避，最多 5 次重试（8.55s 上限）
let __unsubBackoffMs = 800;
for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, __unsubBackoffMs));
    // 检查是否所有 close 都已经真正 ACK（watchers[key] 已置 null + 服务器不再推）
    if (allCloseAcked()) break;
    __unsubBackoffMs *= 1.5;
}
```

**简化方案**（推荐先实施，复杂 ACK 检测可后续加）：固定 5 次重试 × 800ms × 1.5^n：
```js
const __unsubDelays = [800, 1200, 1800, 2700, 4050]; // 总计 10.55s
for (const ms of __unsubDelays) {
    await new Promise((r) => setTimeout(r, ms));
}
```

### 修复 7（P2-1）：抽取 `__fixCompletionCount()` 工具

**位置**：
- 工具函数定义：[app-1.js:2230](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L2230) 附近（activeSync 之前）
- 3 处调用替换：2230-2251、4540-4556、5115-5135

**现状**：3 处重复代码，差异：
| 位置 | 路径 | saveTask | 条件 | 日志后缀 |
|------|------|----------|------|----------|
| 2230-2251 | activeSync | `DAL.saveTask` | 无 | 无 |
| 4540-4556 | loadAll | `this.saveTask` | 无 | `-loadAll` |
| 5115-5135 | incremental | `DAL.saveTask` | `stored > 0` | `-incremental` |

**修复**（工具函数）：
```js
// [v9.2.1] 抽取公共：消除 3 处重复（activeSync / loadAll / incremental）
// 参数：
//   saveTaskFn: 保存任务的函数（DAL.saveTask 或 this.saveTask）
//   options: { skipStoredZero, logSuffix }
function __fixCompletionCount(saveTaskFn, options = {}) {
    const { skipStoredZero = false, logSuffix = '' } = options;
    const promises = [];
    tasks.forEach(task => {
        const txCount = transactions.filter(t => t.taskId === task.id).length;
        const stored = task.completionCount || 0;
        if (txCount === stored) return;
        if (skipStoredZero && stored === 0) return;
        const label = logSuffix ? `[completionCount 修复${logSuffix}]` : '[completionCount 修复]';
        console.log(`${label} taskId=${task.id}, 交易数=${txCount}, 存储=${stored} → 修正为${txCount}`);
        task.completionCount = txCount;
        promises.push(
            saveTaskFn(task).catch(e => console.error(`${label} 写回云端失败: taskId=${task.id}`, e?.message || e))
        );
    });
    if (promises.length > 0) {
        Promise.all(promises).then(() =>
            console.log(`[completionCount 修复${logSuffix}] 写回 ${promises.length} 个任务到云端`)
        );
    }
    return promises;
}
```

**调用方替换**：
```js
// activeSync 路径（原 2235-2251）：
__fixCompletionCount(DAL.saveTask.bind(DAL));

// loadAll 路径（原 4540-4556）：
__fixCompletionCount(this.saveTask.bind(this), { logSuffix: '-loadAll' });

// incremental 路径（原 5117-5135）：
__fixCompletionCount(DAL.saveTask.bind(DAL), { skipStoredZero: true, logSuffix: '-incremental' });
```

### 版本号同步（9 处）

**位置**：
- [app-1.js:7](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L7) `const APP_VERSION = 'v9.2.0';` → `'v9.2.1'`
- [app-1.js:8-12](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8) 启动日志注释 → 追加 v9.2.1
- [index.html:12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>时间银行 - Time Bank v9.2.0</title>` → `v9.2.1`
- [index.html:242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle` → "TimeBank v9.2.1 · v9.0.12 续作 + PWA 实时性 bug 终结"
- [index.html:1420](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1420) 关于页版本号 → `v9.2.1`
- [index.html:1479](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1479) 用户日志新增 v9.2.1 条目
- [sw.js:1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 注释 → `v9.2.1`
- [sw.js:6](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L6) `CACHE_NAME = 'timebank-cache-v9.2.0'` → `v9.2.1`
- [build.gradle:15-16](file:///d:/TimeBank/android_project/app/build.gradle#L15) `versionCode 45` → `46`, `versionName "9.2.0"` → `"9.2.1"`

### AGENTS.md 文档

**位置**：[AGENTS.md:69](file:///d:/TimeBank/AGENTS.md#L69) 当前版本 + 新增 v9.2.1 章节

**新增 v9.2.1 章节**（在 v9.2.0 章节之后）：
- 说明 v9.2.1 = v9.0.12 工作的延续（版本号废弃 v9.0.12）
- 列出 7 个代码修复（v9.0.12 的 10 个修复减去已实施的 3 个）
- 说明 9 处版本号同步
- 部署说明（云函数 `tbMutation` 需重新部署）

### 废弃标记：v9.0.12 spec 目录

**位置**：`.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/`

**现状**：spec 目录存在，3 个文档完整。

**处理**：**保留**目录作历史参考，**不删**。在 `spec.md` 顶部加废弃标记（说明 v9.2.1 已发布，本目录作历史存档）。

## Impact

- **Affected specs**：
  - v9.0.12（废弃但保留目录）
  - v9.2.0（v9.2.1 在它之后）
  - v9.0.11（部分被 v9.2.1 覆盖）
  - v9.0.10（watch 自愈机制被强化）
  - v8.2.17（事件驱动心跳恢复）
- **Affected code**：
  - [app-1.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js)（7 处：声明 + 2 个 onChange + startTask + unsubscribeAll + 3 处工具调用）
  - [app-2.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js)（不需改，clientId 已加）
  - [index.html](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)（4 处：title / subtitle / 关于页 / 用户日志）
  - [sw.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js)（2 处：注释 / CACHE_NAME）
  - [build.gradle](file:///d:/TimeBank/android_project/app/build.gradle)（2 处：versionCode / versionName）
  - [AGENTS.md](file:///d:/TimeBank/AGENTS.md)（2 处：当前版本 + v9.2.1 章节）
  - `.trae/specs/v9-0-12-watch-onchange-heartbeat-and-clientid/spec.md`（顶部加废弃标记）

## ADDED Requirements

### Requirement: v9.2.1 PWA 实时性 bug 终结

The system SHALL fix the 5 categories of PWA real-time bugs that v9.0.11 and v9.0.12 attempts left unfinished, ensuring production users no longer experience:
1. `isImportMode is not defined` ReferenceError on first Transaction add after PWA start
2. Watchdog 60s false positive causing connection rebuild cycles (Transaction/Profile tables)
3. Local startTask being misidentified as "from other device" due to missing clientId field
4. Zombie watchIds persisting after unsubscribeAll due to insufficient wait
5. completionCount drift logic duplicated across 3 paths (maintainability debt)

#### Scenario: 1. PWA 启动后首次 add 交易
- **WHEN** 用户在全新 PWA 会话中开始并完成第一个任务（首次 addTransaction 触发 Transaction onChange）
- **THEN** 不抛 `isImportMode is not defined`，交易正常进入 `transactions` 数组，余额正确更新

#### Scenario: 2. Watchdog 不再 60s 雪崩
- **WHEN** 用户在 PWA 中 5 分钟内连续操作多个交易和任务（无 60s 间隔）
- **THEN** 监控状态指示器长期保持 🟢，不出现每分钟变红重建

#### Scenario: 3. 本机 startTask 正确识别
- **WHEN** 本机调用 `DAL.startTask` 触发 Running onChange add 事件
- **THEN** 控制台输出 `🛡️ [DAL] 忽略 add 事件: 本机触发 (taskId=xxx)`，runningTasks 不重复 add
- **AND** 旧数据（无 clientId 字段）兼容：输出 `📡 [DAL] 任务开始: xxx (来自其他设备)` 但不抛错

#### Scenario: 4. unsubscribeAll 动态退避
- **WHEN** 网络拥塞导致服务器 ACK 延迟 > 800ms
- **THEN** 客户端继续等待 1.2s → 1.8s → 2.7s → 4.05s（总 10.55s 上限）后才真正清空 watchers
- **AND** 老 watchId 推送次数从 9+ 降到 < 1

#### Scenario: 5. completionCount 修复逻辑统一
- **WHEN** 任意路径（activeSync / loadAll / incremental）触发 completionCount 修复
- **THEN** 通过 `__fixCompletionCount()` 统一入口，3 处调用无重复代码
- **AND** 日志后缀保持 `-loadAll` / `-incremental` 区分路径

## MODIFIED Requirements

### Requirement: PWA Watch 事件驱动心跳

v8.2.17 的"连接驱动"心跳理论（`// [v8.2.17] 移除心跳更新：心跳由连接驱动，不再由事件驱动`）在 Profile onChange 仍保留反模式注释。v9.2.1 删除该注释并恢复事件驱动心跳，与 Task/Running/Transaction 一致。

**修改位置**：[app-1.js:4113](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4113)

## REMOVED Requirements

无删除的需求。
