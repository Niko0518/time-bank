## 一、TimeBank 应用简介

TimeBank（时间银行）是一款**时间管理应用**，核心机制是将用户的时间投入/消耗量化为"时间货币"（单位：秒）。

- **Earn（收入）**：完成产出性活动获得时间奖励（如阅读、运动、学习、冥想）。对应 `type: "earn"`，余额增加。
- **Spend（支出）**：进行消耗性活动消费时间（如刷视频、玩游戏、喝奶茶）。对应 `type: "spend"`，余额减少。
- **Balance（余额）**：`currentBalance = Σearn - Σspend`。余额可视作用户的"时间储蓄"。

### 任务类型体系

| 任务类型 | 行为 | 典型场景 |
|---------|------|---------|
| `reward` | 按次完成 → earn 固定时长 | 喝水、晨跑、背单词 |
| `continuous` | 计时完成 → earn 实际时长 × 倍率 | 阅读、学习、写作 |
| `continuous_target` | 计时，达到目标时长 → earn + 达标奖励 | 冥想30分钟、专注60分钟 |
| `instant_redeem` | 按次完成 → spend 固定时长 | 喝奶茶、外卖、赖床 |
| `continuous_redeem` | 计时消费 → spend 实际时长 × 倍率 | 玩游戏、刷短视频 |

### 习惯系统

- **正向习惯**（`habitDetails.type: "positive"`）：养成类，周期内达标获得奖励，连胜（streak）有额外奖励。
- **戒除习惯**（`habitDetails.type: "abstinence"`）：一段时间内不做某事即为达标。
- **周期**：`daily` / `weekly`。`targetCountInPeriod` 为周期目标（次数或分钟数）。
- **连胜规则**：连续达标周期数。断签则 streak 归零。
- **连胜奖励**：`rewards` 数组定义 `{ type: "fixed"|"incremental", start: 连胜数, value: 秒数, limit?: 上限 }`。

### ⚠️ 重要：系统交易与自动结算机制

应用中大量交易由**系统自动生成**，其时间戳**不代表用户行为发生的真实时刻**，而是系统**结算时刻**。这是理解数据的关键。

#### 屏幕时间系统（`systemType: "screen-time"`）

- 前端通过 Android 无障碍服务实时监测用户打开了哪些 App、使用了多久。
- **监测是实时的，但结算是批量的**——通常在一个固定时段（如每日 23:00 前后）统一结算当日所有屏幕使用记录。
- 这意味着：如果用户在白天使用了短视频 App 30 分钟，交易记录的时间戳可能是 `23:05`，**不要据此推断用户在深夜 23:00 还在刷视频**。
- 结算时，超出额度的时间会被记录为 `spend` 类型的系统交易。

#### 睡眠系统

- 用户设定计划就寝/起床时间，应用通过加速度传感器或手动打卡检测睡眠。
- 睡眠记录同样可能在醒来后的某个时刻统一结算。
- 早睡奖励、早起奖励、睡眠时长奖励等都以系统交易形式入账。

#### 利息系统（`systemType: "interest"`）

- 正余额按日计息（earn），负余额按日付息（spend）。
- 利息交易通常在某固定时刻统一结算。

#### 其他系统交易

- 午睡奖励、戒除习惯达标奖励等也可能以系统交易形式入账。

**核心原则**：`systemType` 非空的交易，其 `timestamp` 是结算时间，不是行为时间。只有用户手动点击完成的任务（`systemType: null`），其时间戳才接近行为发生的真实时刻。

---

## 二、输入数据格式说明

你将收到一个 JSON 文件，结构如下：

```json
{
  "meta": {
    "exportAt": 1715312800000,
    "totalDays": 120,
    "transactionCount": 856,
    "version": "v8.2.0"
  },
  "transactions": [...],
  "tasks": [...],
  "habitHistory": [...],
  "dailySummaries": [...]
}
```

### 2.1 transactions（交易记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| `timestamp` | number (ms) | 交易时间戳 |
| `type` | `"earn"` / `"spend"` | 收入或支出 |
| `taskName` | string | 任务名称 |
| `category` | string | 分类（如"学习""健康""娱乐"） |
| `amount` | number (秒) | 金额，**始终为正** |
| `systemType` | string / 不存在 | 系统类型标记（ `"screen-time"` 、 `"interest"` 等） |

**关键规则**：
- `amount` 始终为正数，方向由 `type` 决定。`earn` 增加余额，`spend` 减少余额。
- `systemType` 非空的交易由应用自动生成，时间戳为结算时间，不是行为时间。
- `systemType` 为空的交易是用户手动完成，时间戳接近真实行为时间。

### 2.2 tasks（任务配置）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 任务名 |
| `type` | string | 见上文任务类型 |
| `category` | string | 分类 |
| `targetTime` | number (秒) | 目标时长（仅 continuous_target） |
| `multiplier` | number | 倍率（计时类） |
| `isHabit` | boolean | 是否为习惯 |
| `habitType` | `"daily"` / `"weekly"` / 不存在 | 习惯周期 |
| `habitPeriod` | `"daily"` / `"weekly"` / 不存在 | 同 habitType |
| `autoDetect` | boolean | 是否启用自动检测 |
| `isSystem` | boolean | 是否为系统任务 |

### 2.3 habitHistory（习惯完成历史，近30天）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | `"YYYY-MM-DD"` | 日期 |
| `habitId` | string | 习惯名 |
| `completed` | boolean | 当日是否达标 |
| `amount` | number (秒) | 当日完成量 |

### 2.4 dailySummaries（每日汇总，近30天）

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | `"YYYY-MM-DD"` | 日期 |
| `totalEarn` | number (秒) | 当日总收入 |
| `totalSpend` | number (秒) | 当日总支出 |
| `taskCompletions` | string[] | 当日完成的任务名列表 |

---

## 三、输出格式要求

请基于以上数据和机制，生成一份结构化用户画像。输出必须是**严格的 JSON 格式**，可被标准 JSON 解析器解析。

```json
{
  "habits": {
    "strong": [],
    "weak": [],
    "trending": {}
  },
  "patterns": {
    "peakHours": [],
    "lowHours": [],
    "weekendDifference": "",
    "consistency": ""
  },
  "preferences": {
    "praiseStyle": "",
    "disciplineStyle": "",
    "sensitiveTopics": [],
    "motivationTriggers": []
  },
  "history": {
    "bestStreak": null,
    "worstPeriod": null
  },
  "insights": []
}
```

### 字段说明

| 字段路径 | 类型 | 说明 |
|---------|------|------|
| `habits.strong` | `string[]` | 用户坚持得好的习惯名列表 |
| `habits.weak` | `string[]` | 用户薄弱的习惯名列表 |
| `habits.trending` | `object` | 习惯趋势映射 `"习惯名": "上升"` / `"下降"` / `"稳定"` |
| `patterns.peakHours` | `string[]` | 高效时段（如 `"09:00-11:00"`） |
| `patterns.lowHours` | `string[]` | 低效时段 |
| `patterns.weekendDifference` | `string` | 周末与工作日行为差异描述 |
| `patterns.consistency` | `string` | 整体行为一致性描述 |
| `preferences.praiseStyle` | `string` | 用户偏好的表扬方式 |
| `preferences.disciplineStyle` | `string` | 用户能接受的纪律/批评方式 |
| `preferences.sensitiveTopics` | `string[]` | 敏感话题（避免触碰） |
| `preferences.motivationTriggers` | `string[]` | 激励触发点 |
| `history.bestStreak` | `object\|null` | 最佳连胜记录 `{ habit, days, period }` |
| `history.worstPeriod` | `object\|null` | 最差时期及原因 `{ period, reason }` |
| `insights` | `string[]` | 对用户的独特观察，至少 3 条 |

**注意**：
- `insights` 中的每一条都应当基于数据事实，不要臆测。
- 如果某字段数据不足，填 `null` 或空数组/空字符串。

---