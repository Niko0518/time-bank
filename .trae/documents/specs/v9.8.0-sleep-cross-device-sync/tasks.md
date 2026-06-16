# v9.8.0 Tasks：睡眠系统云端统一（与任务系统一致）

> **创建时间**：2026-06-15
> **依赖**：[requirements.md](./requirements.md) · [design.md](./design.md)
> **状态**：📝 Draft（v2，简化方案）
> **任务数**：8 个（v1 的 11 个已合并：T5/T6/T7/T8 合并为 T4+T5）

---

## 任务总览

| # | 任务 | 涉及文件 | 关联需求 |
|---|------|----------|----------|
| T1 | 修改 sleepSettings 4 个默认值 | app-reports.js | US-5 |
| T2 | saveSleepSettings 双写（per-device + shared） | app-sleep.js | US-1 |
| T3 | saveSleepState 改写 sleepStateShared + clientId | app-sleep.js | US-2 |
| T4 | applySleepStateFromCloud 加 clientId 防回环 + 自动结算 | app-sleep.js | US-2, US-3, US-4 |
| T5 | initSleepSettings 读 shared 优先 + 升级迁移 | app-sleep.js | US-1, US-2, US-4, US-5 |
| T6 | Profile watch 读 shared 优先 | app-1.js | US-1, US-2 |
| T7 | 9 处版本号更新至 v9.8.0 | 9 个文件 | 项目规范 |
| T8 | 用户日志 + 技术日志 | index.html + docs/version-changelog.md | 项目规范 |

**T11（PowerShell 验证）** 已在 v9.7.4 plan 写过脚本模板，本次直接复用，最后执行。

---

## T1. 修改 sleepSettings 默认值

**目标**：全新安装用户体验新默认值

**文件**：[app-reports.js L7583-L7616](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L7583-L7616)

**改动**（4 个常量）：
- `plannedBedtime: '23:30'` → `'23:00'`
- `plannedWakeTime: '08:15'` → `'08:00'`
- `targetDurationMinutes: 525` → `495`（8h15m）
- `lateBedtimeRate: 0.5` → `1`
- 其余不变

**关联**：US-5
**风险**：低（仅影响全新安装用户）
**验证**：清除 localStorage + Android 原生，刷新页面，确认 23:00 / 8:00 / 8h15m

---

## T2. saveSleepSettings 双写

**目标**：A 端修改设置 → 同时写 `deviceSleepSettings[A]` + `sleepSettingsShared`

**文件**：[app-sleep.js L1-L82](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L1-L82) `saveSleepSettings()`

**改动**（详见 [design.md §4.2](file:///d:/TimeBank/.trae/documents/specs/v9.8.0-sleep-cross-device-sync/design.md#L155-L183)）：
- `DAL.saveProfile({ [updateKey]: _.set(cloudSettings) })`
- → `DAL.saveProfile({ [updateKey]: _.set(cloudSettings), sleepSettingsShared: _.set(cloudSettings) })`
- 注释加 `[v9.8.0]`

**关联**：US-1
**风险**：低（云端写入量翻倍，但 22 字段 × 2 仍 < 4KB，无 quota 问题）
**验证**：
- A 端改 22:30 → CloudBase 文档中 `deviceSleepSettings[A]` 和 `sleepSettingsShared` 同时被写
- B 端 watch 触发后 B 端 sleepSettings 变 22:30

---

## T3. saveSleepState 改写 sleepStateShared + clientId

**目标**：与任务系统一致，写 per-user 共享字段

**文件**：[app-sleep.js L82-L122](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L82-L122) `saveSleepState()`

**改动**（详见 [design.md §4.3](file:///d:/TimeBank/.trae/documents/specs/v9.8.0-sleep-cross-device-sync/design.md#L185-L219)）：
- `DAL.saveProfile({ [updateKey]: _.set(criticalState) })` （per-device）
- → `DAL.saveProfile({ sleepStateShared: _.set({ isSleeping, sleepStartTime, lastUpdated, clientId }) })` （per-user 共享）
- **关键**：写入 `clientId: clientId`（app-1.js L49 全局变量）

**关联**：US-2
**风险**：中（写入位置变化，老用户的 deviceSleepState 字段不再被更新）
**验证**：
- A 端 23:00 入睡 → CloudBase 文档中 `sleepStateShared.isSleeping = true`
- B 端 watch 触发后 B 端 sleepState.isSleeping = true
- B 端点击"起床" → A 端 watch 触发后 A 端 doSleepSettlement 执行

---

## T4. applySleepStateFromCloud 加 clientId 防回环 + 自动结算

**目标**：watch 触发时防本机回环 + 检测"被其他端结束"自动结算

**文件**：[app-sleep.js L336-L357](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L336-L357) `applySleepStateFromCloud()`

**改动**（详见 [design.md §4.4](file:///d:/TimeBank/.trae/documents/specs/v9.8.0-sleep-cross-device-sync/design.md#L221-L266)）：
- 函数顶部加 `clientId` 比对防回环（参考 tb_running L4107-L4119）
- 函数中部加 `wasSleeping` 捕获
- 应用状态后检测"wasSleeping && cloudState.isSleeping === false" → 触发 `doSleepSettlement`
- `detectSleepType` 和 `doSleepSettlement` 都需存在（已存在），用 `typeof` 守卫

**关联**：US-2, US-3, US-4
**风险**：中（结算逻辑需与"手动结束"路径一致，doSleepSettlement 内部已有 isAutoSettling 锁 + date 去重）
**验证**：
- A 端睡眠中 → B 端起床 → A 端 watch 触发 → A 端 doSleepSettlement 执行 + 入账
- A 端无网络 → 联网 → initSleepSettings 中 applySleepStateFromCloud 走同款逻辑（'init-shared'）→ 自动补结算

---

## T5. initSleepSettings 读 shared 优先 + 升级迁移

**目标**：init 时读 shared 优先；老用户一次性迁移

**文件**：[app-sleep.js L373-L576](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L373-L576) `initSleepSettings()`

**改动**（详见 [design.md §4.5](file:///d:/TimeBank/.trae/documents/specs/v9.8.0-sleep-cross-device-sync/design.md#L268-L341)）：
- 升级迁移 1：`deviceSleepState` → `sleepStateShared`（取 lastUpdated 最大者）
- 升级迁移 2：`deviceSleepSettings` → `sleepSettingsShared`（取 lastUpdated 最大者）
- 读 shared 优先，回退到 per-device
- 写入本地 sleepSettings / sleepState + Android 原生 + localStorage

**关联**：US-1, US-2, US-4, US-5
**风险**：中（迁移逻辑需测试 3 种场景：全新 / per-device 升级 / shared 升级）
**验证**：
- 全新：localStorage 空 + Android 原生空 + 云端空 → 代码默认值（v9.8.0 新默认）
- 升级 per-device：云端有 `deviceSleepSettings[A]` + `deviceSleepState[A]` 无 shared → 一次性迁移到 shared
- 升级 shared：云端已有 shared → 直接采用

---

## T6. Profile watch 读 shared 优先

**目标**：watch 触发时优先读 sleepSettingsShared / sleepStateShared

**文件**：[app-1.js L4183-L4220](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4183-L4220) Profile watch onChange

**改动**（详见 [design.md §4.6](file:///d:/TimeBank/.trae/documents/specs/v9.8.0-sleep-cross-device-sync/design.md#L343-L395)）：
- 删 v9.7.4 旧的两段读 `mySleepSettings` / `mySleepState`
- 加 v9.8.0 新逻辑：先读 shared（force=true），回退到 per-device

**关联**：US-1, US-2
**风险**：中（force=true 覆盖可能影响全新安装保护——需测试）
**验证**：
- A 端改 22:00 → B 端 watch 触发 → B 端 sleepSettings 立即变 22:00
- A 端 23:00 入睡 → B 端 watch 触发 → B 端 sleepState.isSleeping = true

---

## T7. 9 处版本号更新至 v9.8.0

**目标**：按 AGENTS.md 第 3 节同步 9 处版本号

**位置**（权威源 `assets/www/` + Android 配置）：
1. [index.html L12](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L12) `<title>`
2. [index.html L242](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L242) `.version-subtitle`
3. [index.html L1412](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1412) 关于页版本号
4. [index.html 用户日志 v9.8.0 标题](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html)
5. [app-1.js L15](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L15) `APP_VERSION`
6. [sw.js L1](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L1) 头注释
7. [sw.js L13](file:///d:/TimeBank/android_project/app/src/main/assets/www/sw.js#L13) `CACHE_NAME`
8. [app/build.gradle L15](file:///d:/TimeBank/android_project/app/build.gradle#L15) `versionName` "9.8.0"
9. [app/build.gradle L16](file:///d:/TimeBank/android_project/app/build.gradle#L16) `versionCode` 60

**versionCode 计算**：v9.7.4 = 59 → v9.8.0 = 60

**关联**：项目规范
**风险**：低（机械替换）
**验证**：PowerShell 9 项 grep 全部 OK

---

## T8. 用户日志 + 技术日志

**修改文件**：
- [index.html L1470](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L1470) 附近：新增 v9.8.0 用户日志条目
- [docs/version-changelog.md](file:///d:/TimeBank/docs/version-changelog.md) "最新版本"标识 + `## v9.8.0` 章节

**用户日志要点**（面向产品使用者）：
- 睡眠计划设置现在跨设备统一：在任一端修改，其他端自动同步
- 睡眠状态现在跨设备统一：任一端入睡/起床，所有端实时同步
- 默认睡眠计划调整：23:00 入睡 / 8:00 起床 / 8h15m 目标 / 晚睡 1:1

**技术日志要点**（面向开发者）：
- 架构变更：sleepSettings / sleepState 改为共享字段（与任务系统一致）
- 新增 sleepStateShared.clientId 防本机回环
- 升级迁移逻辑：deviceSleepState/Settings → shared（一次性）
- 风险与回滚：last-write-wins

**关联**：项目规范
**风险**：低
**验证**：日志内容可读、技术准确

---

## T11（验证，复用 v9.7.4 模板）

执行 PowerShell 验证：
1. 4 项默认值核查
2. 9 处版本号核查
3. 新增代码核查：
   - `sleepStateShared.clientId` 在 `saveSleepState` 出现
   - `applySleepStateFromCloud` 中有 `clientId` 比对
   - `applySleepStateFromCloud` 中有 `doSleepSettlement` 调用
   - `initSleepSettings` 中有 `deviceSleepState` → `sleepStateShared` 迁移
   - `initSleepSettings` 中有 `deviceSleepSettings` → `sleepSettingsShared` 迁移
   - `Profile watch` 中有 `doc.sleepSettingsShared` 优先分支
4. 删除的"远程结束"相关代码无残留（endRemoteSleep / handleOtherDevicesSleeping / renderOtherDeviceSleepBanner / confirmEndRemoteSleep / lastEndedBy）

**关联**：流程
**风险**：低

---

## 任务依赖关系

```
T1 (默认值)
 ↓
T2 (settings 双写) ─→ T6 (watch 读 shared 优先)
 ↓                        ↓
T3 (state 写 shared) ─→ T4 (applySleepStateFromCloud)
 ↓                        ↓
T5 (init 读 shared + 迁移) ←┘
 ↓
T7 (版本号) ─→ T8 (日志) ─→ T11 (验证)
```

---

## 执行计划

| 阶段 | 任务 | 工作量 |
|------|------|--------|
| 阶段 1：默认值 | T1 | 5 分钟 |
| 阶段 2：设置跨设备 | T2 + T6（部分） | 15 分钟 |
| 阶段 3：状态跨设备 | T3 + T4 | 20 分钟 |
| 阶段 4：init 迁移 | T5 | 15 分钟 |
| 阶段 5：版本+日志 | T7 + T8 | 15 分钟 |
| 阶段 6：验证 | T11 | 5 分钟 |

**总工作量**：约 75 分钟（vs v1 方案的 ~115 分钟，减少 35%）

---

## 不在本次任务内

- 零 UI 改动（无 T5/T6/T7 横幅相关任务）
- 睡眠历史跨设备合并
- Android Java 层改动
- 跨设备的小睡/夜间智能判定
- 同步机制本身优化

---

> 📌 **下一步**：等待用户确认本 tasks.md 后，按 T1→T11 顺序执行
