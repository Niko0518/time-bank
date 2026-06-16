# v9.8.0 Requirements：睡眠系统云端统一（与任务系统一致）

> **创建时间**：2026-06-15
> **版本号**：v9.8.0（用户指定）
> **作者**：AI 编程助手
> **状态**：📝 Draft（v2，简化方案）
> **变更**：v1 过度设计（per-device + 远程结束）已被推翻，本版与任务系统对齐

---

## 1. 问题陈述

### 1.1 用户洞察（关键）
用户原话：
> 我认为睡眠时间系统在本质上就应该与普通的达标任务无异，任意一端可开始、可结束，云端统一。

**验证**：经过代码审计，**任务系统确实是 per-user 统一**（[app-1.js L4086-L4139](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4086-L4139)）：
- `tb_running` 表按 `_openid` 共享，不是 per-device
- A 端 `startTask` → B 端 watch 触发后**直接显示**"任务进行中"
- B 端 `stopTask` → A 端 watch 触发后**直接结束**
- 用 `clientId` 字段防本机回环
- 没有任何"远程结束""其他设备正在运行"这种 UI

**结论**：v7.32.0 把睡眠改为 per-device 是设计偏差。v9.8.0 将睡眠**对齐到任务系统的 per-user 统一模式**。

### 1.2 现状 vs 期望

| 维度 | 现状（v9.7.4） | 期望（v9.8.0） |
|------|---------------|----------------|
| 睡眠计划设置 | 按 `deviceSleepSettings.${deviceId}` 分存 | 走 `sleepSettingsShared`（per-user 统一） |
| 睡眠状态 | 按 `deviceSleepState.${deviceId}` 分存 | 走 `sleepStateShared`（per-user 统一） |
| A 端入睡 | 只有 A 端感知 | A、B、C 所有端 sleepState 立即更新 |
| B 端"起床" | 仅结束 B 端自己的 sleepState | 写 `sleepStateShared.isSleeping=false` → A 端 watch 触发 → 触发 doSleepSettlement |
| 离网补结算 | 复杂（需要 lastEndedBy 标记） | 简单（下次 initSleepSettings 时 applySleepStateFromCloud 自动处理） |
| 远程结束 UI | 无 | **不需要**（任一端都能直接 endSleep） |

---

## 2. 范围（Scope）

### 2.1 In Scope
- 修改 `sleepSettings` 4 个默认值常量
- 改造 `saveSleepSettings()`：双写 `deviceSleepSettings.${currentDeviceId}`（向后兼容）+ `sleepSettingsShared`（v9.8.0 权威）
- 改造 `saveSleepState()`：**改写** `sleepStateShared`（不再写 `deviceSleepState.${deviceId}`）
- 改造 `initSleepSettings()`：读 shared 优先 + 升级迁移
- 改造 Profile watch：
  - 读 `sleepSettingsShared`（force=true）
  - 读 `sleepStateShared`（带 clientId 比对防本机回环）
  - 旧 per-device 字段保留作回退
- 新增 clientId 字段写入与防回环
- 升级迁移：扫描 `deviceSleepState[*]`，取 lastUpdated 最大者写入 `sleepStateShared`；同理迁移 settings
- 9 处版本号 + 用户日志 + 技术日志

### 2.2 Out of Scope
- **零 UI 改动**：复用现有睡眠卡片（与任务系统一致）
- 睡眠历史跨设备合并（本期不做）
- Android Java 层改动（Web 端 API 足够）
- 跨设备的小睡/夜间智能判定
- 同步机制本身优化（沿用 Web SDK Watch）

### 2.3 数据字段变更

| 字段 | 现状 | v9.8.0 |
|------|------|--------|
| `sleepSettingsShared` | 闲置 | **写入**（权威） |
| `deviceSleepSettings.${deviceId}` | 写入 | 继续写入（向后兼容） |
| `sleepStateShared` | 闲置 | **写入**（权威） |
| `deviceSleepState.${deviceId}` | 写入 | **不再写入**（仅作升级回退） |
| `sleepStateShared.clientId` | 无 | **新增**（防本机回环） |

---

## 3. 用户故事 & EARS 验收标准

### US-1：设置跨设备统一
> 作为多设备用户，我在 A 端修改"计划入睡 23:00"，B 端应在 1 分钟内看到 23:00。

#### EARS
```
When 任一端保存 sleepSettings（22 个字段任一变化），
the system shall 同步写入 tb_profile.deviceSleepSettings.${currentDeviceId} 和 tb_profile.sleepSettingsShared 两处，
so that 老版本 v9.7.x 仍能读取 per-device 字段，v9.8.0+ 能从 shared 字段读取最新值。

When Profile watch 检测到 sleepSettingsShared 更新，
the system shall 强制覆盖本端 sleepSettings（force=true），并触发 UI 刷新（updateSleepCard / updateSleepSettingsSummary），
so that 任一端修改会立即反映到所有端。
```

### US-2：状态跨设备统一（与任务系统一致）
> 作为多设备用户，我在 A 端 23:00 入睡，B 端首页睡眠卡片应直接显示"睡眠中"——B 端就是睡眠状态本身，不存在"远程"概念。

#### EARS
```
When 任一端调用 saveSleepState()，
the system shall 写入 tb_profile.sleepStateShared = { isSleeping, sleepStartTime, lastUpdated, clientId: this.clientId }，
and 不再写入 deviceSleepState.${deviceId}，
so that 所有设备 watch 触发时能从 sleepStateShared 读到最新状态。

When Profile watch 检测到 sleepStateShared 更新，
the system shall 比对 cloudState.clientId 与本机 clientId：
  - 相同 → 跳过处理（本机回环）
  - 不同 → 调用 applySleepStateFromCloud(cloudState, 'watch')，
so that 与任务系统 tb_running 的 clientId 防回环模式完全一致。
```

### US-3：任一端可结束睡眠
> 作为多设备用户，我在 B 端点击"起床"，A 端应自动结算睡眠奖励。

#### EARS
```
When 任一端调用 endSleep()（不论 B 端自己是否在睡眠中），
the system shall 写 sleepStateShared.isSleeping = false + sleepStartTime = null + lastUpdated = now + clientId = this.clientId，
so that 其他设备的 watch 触发后能感知到"睡眠已结束"。

When Profile watch 触发后 applySleepStateFromCloud 检测到 isSleeping 从 true 变 false，
the system shall 触发 doSleepSettlement(sleepStartTime, now, durationMinutes, detectedType) 结算逻辑，
so that 不论哪一端结束，所有端都能正确结算并入账。
```

### US-4：A 端离线时被 B 端结束
> 作为多设备用户，A 端无网络时我在 B 端结束睡眠，A 端联网后自动补结算。

#### EARS
```
When A 端启动时 initSleepSettings 读取 sleepStateShared，
the system shall applySleepStateFromCloud 自动应用：若 isSleeping=false 且 cloudUpdated > localUpdated 且之前 isSleeping=true，
the system shall 触发 doSleepSettlement 补结算，
so that A 端离网期间被 B 端结束的睡眠不会丢失奖励。
```

### US-5：默认值修改
> 作为新装用户，首次启用睡眠时默认看到新计划时间。

#### EARS
```
When 用户全新安装（localStorage / Android 原生 / 云端 shared 字段都为空），
the system shall 加载代码默认值：plannedBedtime='23:00'、plannedWakeTime='08:00'、targetDurationMinutes=495（8h15m）、lateBedtimeRate=1，
so that 新用户体验新默认值。
```

---

## 4. 业务规则

| 规则 | 说明 |
|------|------|
| **设置双写** | 既写 per-device（向后兼容）也写 shared（v9.8.0 权威） |
| **读 shared 优先** | initSleepSettings 读 shared 优先，per-device 仅作回退 |
| **状态单写 shared** | saveSleepState 只写 shared（不再 per-device），与 task 一致 |
| **clientId 防回环** | 写入时带 clientId，watch 比对相同则跳过 |
| **last-write-wins** | 毫秒级时间戳仲裁，接受最后写入 |
| **升级迁移** | 老用户：deviceSleepState 取 lastUpdated 最大者迁移到 sleepStateShared（一次性） |
| **空数据容错** | cloudState 字段缺失时（如 null），保持原值不破坏 |
| **多端同时入睡** | 罕见但可能：A 端入睡 + B 端同时起床 → 接受 last-write-wins，由 B 端结算 |

---

## 5. 非目标（Non-Goals）

- 零 UI 改动（与任务系统对齐：不显示"其他设备"概念）
- 不实现 sleepHistory 跨设备合并
- 不修改 Android Java 层
- 不实现"远程开始睡眠"（仍由本端主动开始，与任务"开始"概念一致）
- 不引入新云函数
- 不修改 watch 机制本身

---

## 6. 风险 & 缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| 升级用户 per-device 状态被覆盖 | 中 | 升级时一次性迁移：deviceSleepState[*] 中 lastUpdated 最大者 → sleepStateShared |
| 多端同时入睡 last-write-wins 冲突 | 低 | 接受 last-write-wins（毫秒级 ISO 时间戳） |
| clientId 字段缺失导致回环判断失误 | 低 | null-safe：旧数据无 clientId 时跳过"本机"判断，直接应用（参考 tb_running L4107-L4119） |
| 离网补结算重复触发 | 低 | doSleepSettlement 内部有 isAutoSettling 锁 + date 去重 |
| 共享字段被老版本覆盖 | 低 | 老版本不写 sleepStateShared，v9.8.0+ 端读 shared 不会"被拉回旧值" |

---

## 7. 验收 checklist

- [ ] `app-reports.js` L7585-7596 默认值已更新
- [ ] 全新安装用户首启看到 23:00 / 8:00 / 8h15m / 晚睡倍率 1
- [ ] A 端改任意睡眠设置 → B 端 watch 触发后强制覆盖
- [ ] A 端 23:00 入睡 → B 端首页睡眠卡片直接显示"睡眠中"（零 UI 改动）
- [ ] B 端点击"起床" → A 端 watch 触发后自动结算（doSleepSettlement）
- [ ] A 端无网络时 B 端起床 → A 端联网启动后 initSleepSettings 自动补结算
- [ ] 升级用户既有 per-device 状态被一次性迁移到 sleepStateShared
- [ ] 多端同时操作无冲突（clientId 防回环 + last-write-wins）
- [ ] 9 处版本号已更新至 v9.8.0
- [ ] 用户日志 + 技术日志已撰写

---

> 📌 **下一阶段**：等待用户确认后进入 [design.md](./design.md)
