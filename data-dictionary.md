# TimeBank 导出数据说明书

> **本文件是导出数据说明书（Data Dictionary）的唯一源文件。**
> 导出数据时会被完整嵌入 `meta.readme`（导出文件内不再附加独立的 `.md` 文件）。
> 要修改说明书内容，**只改本文件**，导出时自动生效，无需同步到别处。
>
> `readmeVersion`: 1.0 · `exportFormatVersion`: 2.0

---

## 0. 给分析者（AI）的阅读顺序

1. 先读 **第 3 节（时间字段）** —— 不理解三个时间的区别，后续所有分析都会错；
2. 再读 **第 4 节（可信度体系）** —— 决定"哪些记录能用、怎么用"；
3. 再读 **第 6 节（特殊数据类型登记表）** —— 识别系统自动产生的记录；
4. 最后读 **第 7 节（已知陷阱）** —— 这些是历史上真实踩过的坑；
5. 需要精确判定时，直接使用第 4 节末尾的**判定伪代码**。

---

## 1. 数据是什么

- TimeBank 是一款「时间货币」应用：用时间作为通货，任务是**赚取（earn）**或**消耗（spend）**时间。
- **所有时间货币单位统一为【秒】**（1 小时 = 3600 秒）。
- 导出为**全量个人记录**，非抽样；`transactions` 按 `timestamp` 倒序排列。
- 顶层字段：`meta`（本说明书与字段字典）、`version`（应用版本号，**与数据结构无关**）、`tasks`、`transactions`、`currentBalance`、`dailyChanges` 及各设置项。

---

## 2. 字段字典（机器可读版见 `meta.fields`）

### 2.1 交易（`transactions[]`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 交易唯一 ID。**历史上有两种写法**：UUID（早期）与「epoch 毫秒 + 随机串」（后期） |
| `timestamp` | string | **入账时刻**（ISO 8601 UTC）。见第 3 节，**不要直接当作事件发生时刻** |
| `occurredAt` | string \| null | **事件发生时刻**。为 `null` 表示该时刻未知 |
| `createdAt` | string | **记录写入系统的时刻**。与 `timestamp` 相差越大，越可能是事后补录 |
| `businessDate` | string | 只到日的归属日期（`YYYY-MM-DD`，本地时区）= `occurredAt`（时刻未知时用 `timestamp`）的日历日期；时刻未知时仍有值。**睡眠记录例外：统一按「醒来日」**（= 醒来时刻所在的那天）→ 因此「这一夜」恒等于 `businessDate − 1 天`（见第 6 节 sleep_night） |
| `entryMode` | string | 录入方式：`live`（实时）/ `backfill`（补录）/ `auto`（系统生成）/ `import` |
| `timeSource` | string | 时刻来源：`live` / `user` / `estimated` / `auto` |
| `timePrecision` | string | 时刻精度：`exact` / `minute` / `date` / `derived` |
| `type` | string | `earn`（赚取）/ `spend`（消耗）。**`amount` 恒为正数**，方向由本字段决定 |
| `amount` | number | 结算后的金额（秒）。**含额度定价与倍率，不可当作时长使用** |
| `quantitySeconds` | number \| null | **不含任何倍率**的原始量（秒）；无原始量时为 `null` |
| `durationSource` | string \| null | 原始量来源：`timer`（系统计时）/ `user`（用户填写或配置）/ `auto`（系统推算，如自动补录） |
| `balanceAfter` | number \| null | 该笔入账后的**本地**余额（秒）。**仅 2026-09-26 起的新记录写入**；可能带临时偏差，见第 7 节第 9 条 |
| `taskId` | string \| null | 任务 ID；系统类记录使用常量（如 `system_interest`、`system-screen-time`）。**历史上有约 4.7% 的记录为 `null`** |
| `taskName` / `taskNameAtTime` | string | 当时的任务名快照。**任务可被改名**，按名称聚合会漏算，请按 `taskId` 聚合 |
| `category` / `categoryAtTime` | string \| null | 当时的分类快照 |
| `taskType` | string | `user`（用户任务）/ `system`（系统记录） |
| `isSystem` | boolean | 是否为系统自动产生 |
| `rawSeconds` | number \| null | 连续类任务的原始计时秒数 |
| `description` | string | 人类可读文案，**前缀可用于快速分类**（见第 6 节） |
| `sleepData` | object | 仅睡眠记录存在，见 2.2 |
| `sourceDeviceLabel` | string \| null | 产生记录的设备名（历史数据中以「 · 设备名」后缀混在任务名里） |

### 2.2 睡眠记录（`transactions[].sleepData`）

| 字段 | 说明 |
|------|------|
| `startTime` / `wakeTime` | 入睡 / 醒来时刻（epoch 毫秒） |
| `durationMinutes` | 时长（**分钟**，注意与秒混用） |
| `sleepType` | `night`（夜间睡眠）/ `nap`（日间小睡） |
| `manualEntry` | 是否由用户手工录入 |
| `plannedBedtime` / `plannedWakeTime` / `targetDurationMinutes` | 计划值快照（**仅夜间睡眠路径写入**，小睡与部分历史记录没有） |

> **小睡的判定规则**（不在数据里，仅系统逻辑）：入睡小时 ∈ [20:00, 06:00) **或** 总时长 ≥ 240 分钟 → 夜间睡眠；否则为小睡。

---

## 3. 时间字段：三个时间，别搞混 ★核心

| 字段 | 含义 | 用途 |
|------|------|------|
| `timestamp` | **入账时刻** | 云同步增量、排序、每日汇总（`dailyChanges`）归日 |
| `occurredAt` | **事件发生时刻** | **分析主字段**；可能为 `null` |
| `createdAt` | **写入系统的时刻** | 判断录入滞后（`createdAt − timestamp`） |

### 硬规则

1. **排序与余额链一律按 `timestamp`**；**分析一律按 `occurredAt`**。
   同一条记录在两个视图里的位置可能不同，这是设计如此，不是数据错误。
2. **`occurredAt === null` 时，禁止回退使用 `timestamp` 作为发生时刻。**
   此时该记录的时刻是系统占位值（历史上为所选日期的 `12:00:00.000`），**没有任何时间信息**。
3. `timestamp` 与 `occurredAt` 相同，**不代表**二者语义相同；只表示这条记录是实时写的。

---

## 4. 记录可信度体系（四档）

| `timeSource` | `timePrecision` | 来源 | 误差性质 | 允许的分析 |
|---|---|---|---|---|
| `live` | `exact` | 实时记录（用户点击瞬间由系统打点） | 无记忆误差 | **任何分析** |
| `user` | `minute` | 补录时用户填写的时刻 | 有回忆误差（±10~30 分钟） | **时间点分析可用**（如睡前间隔） |
| `estimated` | `date` | 补录时用户只记得日期 | 时刻完全未知 | **仅日级分析**（当天是否发生）；**禁止时间点分析** |
| `auto` | `exact` | 系统结算但时刻来自用户动作（如睡眠：入睡时刻 = 点击入睡） | 无记忆误差 | 可按 `exact` 使用 |
| `user` | `exact` | **老格式睡眠记录**（2026-01 ~ 07）：入睡/醒来时刻原本只写在 `description` 文本里（如 `😴 夜间睡眠: 02:05~10:17`），导出时由 App 解析成结构化时刻 | 用户当时记录的值，无记忆误差 | 可按 `exact` 使用 |
| `auto` | `date` | 系统整日累计（利息、屏幕时间、自动补录/修正） | 时刻未知 | **仅日级分析**，参考 `meta.specialData` |

> `derived` 为保留值（未来系统推算类记录使用），当前数据中不出现。

### 可直接执行的判定伪代码

```
对每条交易 t：
  if (t.occurredAt)            → 用 occurredAt 作为发生时刻（按 timePrecision 决定精度）
  else if (t.businessDate)     → 只做「按天」的分析，不得用于时刻、间隔、时长分布
  else                         → 该记录不可用于时间分析，直接排除
```

> **反面教材（真实发生过的错误）**：曾把 `occurredAt` 为空的日间补录记录，按 `timestamp` 的 `12:00` 当作真实发生时刻参与"睡前间隔"分析，导致结论量级翻倍。

---

## 5. 补录数据专章

### 5.1 什么是补录

用户在事情发生之后才录入的记录。补录时用户**只选择日期**（不选时刻）；系统为避免时区问题，把该日期的时间部分写为 `12:00:00.000`。

### 5.2 补录记录的字段表现

| 情形 | `entryMode` | `occurredAt` | `timeSource` | `timePrecision` |
|------|:---:|---|---|---|
| 补录「今天」的事 | `backfill` | = `timestamp`（此刻，真实） | `live` | `minute` |
| 补录历史日期，用户填写了真实时刻 | `backfill` | 用户填写的时刻 | `user` | `minute` |
| 补录历史日期，未填时刻 | `backfill` | `null` | `estimated` | `date` |

### 5.3 识别补录

- **新数据**（2026-09-26 起）：直接读 `entryMode`。
- **历史数据**：由导出时的回填规则推断 —— 描述以 `补录:` 开头 + `timestamp` 为 `12:00:00.000` + `createdAt` 滞后 > 30 分钟 ⇒ `timeSource = 'estimated'`。

### 5.4 已知缺陷

1. 历史补录**无法区分**「用户想填 12:00」与「用户未填时刻」——两者都会得到 `timeSource='estimated'`。因此若某条记录「确实发生在中午且用户手动填了 12:00」，它会被保守地判为不可信。
2. 补录的 `timestamp` 是占位值，**不是**入账时刻与发生时刻的混合；它在同步/排序中有效，但在语义上无意义。
3. 部分历史补录记录的时间戳由「当时创建时间」充当（今天补录），这类记录的 `timeSource='live'`，间隔分析可用。

---

## 6. 特殊数据类型登记表（可扩展）

> **新增特殊数据类型时**：在此表追加一行，并在导出数据的 `meta.specialData` 数组中加入对应条目。

| kind | 识别方式 | 含义 | 处理建议 |
|------|----------|------|----------|
| `sleep_night` | `sleepData.sleepType === 'night'` | 夜间睡眠结算 | `entryMode='auto'`（系统结算），`timeSource` 反映时刻来源：`manualEntry=true` → `user`，否则 `live`。**「入睡时刻」= 用户点击入睡、放下手机的时刻，不是真正睡着时刻**。`occurredAt` = 入睡时刻；**夜晚归属**：若入睡时刻的本地小时 < 12，则该夜归属到**前一天**（例：9/25 00:44 入睡 → 该夜为 9/24 的夜）。**老格式（无 `sleepData`）**：入睡时刻从 `description` 解析（如 `😴 夜间睡眠: 23:26~06:15`），`occurredAt` = 解析出的入睡时刻、`timeSource='user'`、`timePrecision='exact'`。**归属日统一为「醒来日」**（如 `23:26~06:15` 记在**醒来那天**）；若要按"这一夜"聚合，用 `businessDate − 1 天` |
| `sleep_nap` | `sleepData.sleepType === 'nap'` | 日间小睡 | 与夜间睡眠独立结算；不含 `plannedBedtime` 等字段 |
| `interest` | `isSystem && systemType === 'interest'` | 余额利息（按日利率结算，整日累计） | 非用户行为，行为分析应排除；`occurredAt=null`、`timePrecision='date'`（`timestamp` 为昨日 23:59 占位值） |
| `screen_time` | `isSystem && systemType === 'screen-time'` | 屏幕时间消耗（整日累计） | 系统扣减项；`occurredAt=null`、`timePrecision='date'`（`timestamp` 为当日 23:00 占位值） |
| `auto_makeup` | `autoDetectType === 'makeup'` 或描述以 `自动补录:` 开头 | 系统检测到漏记后自动补录（金额为多日累计差额，非单次事件） | `entryMode='auto'`、`occurredAt=null`、`timePrecision='date'` —— **时刻未知，禁止时间点分析**；`timestamp` 为当日 23:00 占位值 |
| `auto_correction` | `autoDetectType === 'correction'` 或描述以 `自动修正:` 开头 | 系统检测到多记后自动修正 | 同上 |
| `habit_reward` | `isStreakAdvancement === true` 或描述含 `完成习惯:` | 习惯连胜奖励 | 金额可能由奖励规则生成，不可当时长 |
| `balance_adjust` | 存在 `balanceAdjust` 字段 | 余额调整/历史惩罚 | 不属于行为记录 |
| `backfill_estimated` | `timePrecision === 'date'` | 时刻未知的补录 | **禁止时间点分析** |

### 描述文案前缀 → 类型速查

| 前缀 | 含义 |
|------|------|
| `完成任务: ` / `完成习惯: ` | 正常完成（earn） |
| `兑换项目: ` | 按次消费（spend） |
| `连续消费: ` | 计时消费（spend） |
| `补录: ` | 事后补录 |
| `自动补录: ` / `自动修正: ` | 系统自动处理 |
| `😴 夜间睡眠: ` / `💤 日间小睡: ` | 睡眠记录 |
| `📱 屏幕时间: ` | 屏幕时间 |
| `📝 手动记录` | 手工录入的睡眠记录 |

---

## 7. 已知陷阱（历史上真实踩过的坑）

1. **不要把日间补录记录当作"前一夜的事件"**：`timePrecision='date'` 的记录**没有时刻信息**，任何"它发生在睡前/不在睡前"的判断都是编造。
2. **不要把 `amount` 当作时长**：同一任务的 `amount` 受额度定价（额度内 50% / 超出 200%）与倍率（如 1.5 / 0.8）影响，实测同一任务可出现 1080 ~ 10800 秒。需要时长请用 `quantitySeconds`。
3. **`occurredAt` 为 `null` 时不要回退到 `timestamp`**：那是 `12:00` 占位值。
4. **按任务名聚合会漏算**：任务可被改名（同一 `taskId` 历史上可能叫 A、B、C），且设备名会以「 · 手机」形式混入名称。请按 `taskId` 聚合。
5. **约 4.7% 的交易 `taskId` 为 `null`**：这些记录没有任务上下文，需要按 `description` 或 `isSystem` 分类。
6. **睡眠记录存在多种格式**：早期记录的入睡/醒来时刻写在 `description` 文本里（如 `😴 夜间睡眠: 02:05~10:17 8小时12分钟`），无 `sleepData`；后期才有结构化字段。**导出时 App 已把这类记录解析为结构化时刻**（`occurredAt` = 入睡时刻、`timeSource='user'`、`timePrecision='exact'`），因此通常无需自行解析；但若 `occurredAt` 为 `null` 且描述形如 `📝 手动记录 | 睡眠结算` 或 `💤 日间小睡: 25分钟`，说明**文本里根本没有时刻**（前者未保存时刻、后者只记时长），此时才需按 `date` 精度处理。
7. **不要用 `dailyChanges` 替代交易明细**：它是缓存汇总，覆盖规则与明细可能不一致；**以 `transactions` 为准**。
8. **单位混用**：`amount` / `quantitySeconds` / `rawSeconds` 是【秒】；`durationMinutes` / `dailyLimitMinutes` 等是【分钟】。
9. **余额与流水可能存在差额**：App 存在"不走交易、直接改余额"的路径（余额调整、退款、云端缓存余额覆盖），因此 `meta.checksum.diffSeconds` 可能非 0，**不代表数据丢失**。注：**v9.38.0 之前的版本在补录 / 利息 / 屏幕时间等写入路径存在"余额重复计账"缺陷（本地余额比流水净额偏高），v9.38.0 起已修复**；但修复前写入的历史记录 `balanceAfter` 仍带有当时的偏差，且本地余额以云端 `cachedBalance` 为权威。**做流水分析请以 `transactions` 为准**。

---

## 8. 推荐分析口径

| 分析目的 | 建议口径 |
|----------|----------|
| 时间点分析（时刻分布、间隔、睡前行为） | 仅使用 `timePrecision ∈ {exact, minute}` 的记录 |
| 日级分析（某天是否发生、周频次） | 可使用到 `timePrecision = 'date'` |
| 剂量/时长分析 | 使用 `quantitySeconds`，且优先 `durationSource = 'timer'` 的子集 |
| 行为分析 | 排除 `taskType = 'system'` 与 `meta.specialData` 中登记的系统类型 |
| 余额校验 | 按 `type` 汇总 `amount` 得流水净额，与 `meta.checksum.netSeconds` 对照；与 `currentBalance` 的差额见 `meta.checksum.diffSeconds`（**非 0 属正常，不代表数据丢失**，见第 7 节第 9 条） |

### 如何扩展本说明书

1. 新增字段：在第 2 节表格追加一行，并在 `meta.fields` 中加入对应条目；
2. 新增特殊数据类型：在第 6 节登记表追加一行，并在 `meta.specialData` 中加入条目；
3. 新增陷阱：在第 7 节追加一条；
4. 修改 `readmeVersion`（本文件顶部），导出文件会自动携带新版本号。

---

*本说明书由 TimeBank 随导出数据一同生成。修改请编辑源文件 `data-dictionary.md`。*
