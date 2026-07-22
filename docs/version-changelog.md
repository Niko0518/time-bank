# TimeBank 版本更新日志（完整技术记录）

> 本文档记录所有版本更新，包括用户可见功能、技术修复、架构调整与内部优化。
>
> 用户-facing 的精简版本请见 `index.html` 关于页。

## v9.24.1 (2026-07-22)

### [Fix] 计时器徽章双倍计数修复

**根因**：徽章计算公式 `elapsedTime + (isPaused ? 0 : Date.now() - startTime)` 依赖 `elapsedTime` 与 `startTime` 的不变量：写入 `elapsedTime` 时必须同步对齐 `startTime`，否则会把"已计入"时段重复计算。当 v9.3.x 引入"原生 Service 为权威源"架构后，多个写入路径违反了这一契约。

**触发场景**：
1. 悬浮窗事件回包触发强同步（`__onFloatingTimerAction` L5591）
2. WebView 冷启动从原生 Service 恢复（`recoverRunningTasksFromNativeService` L5397）
3. resumeTask 接收悬浮窗同步时间（`resumeTask` L5310）
4. pauseTask 接收悬浮窗同步时间（`pauseTask` L5236）

**修复方案**：
- 新增公共函数 `applyElapsedFromSource(r, sourceElapsedMs, opts)`，强制保证 running 态下 `startTime` 对齐
- 4 处写入点统一改为调用该函数
- pauseTask / startTask 加注释固化契约

**衍生收益**：
- 防止未来新增"外部权威源"时再次踩坑
- 统一契约后，徽章与悬浮窗、交易记录三者永远一致
- 不影响性能（徽章公式本身未改，每秒刷新的 `updateRunningTimers` 无新增调用）

## v9.23.0 (2026-07-21)

### [Core] 睡眠系统纯云端化改造

#### 背景

此前睡眠历史采用「三重存储」架构：
1. 本地 `localStorage.sleepHistory`（权威，UI 优先读取）
2. 云端 Profile.`deviceSleepHistory.${deviceId}`（冗余备份，per-device）
3. `tb_transaction`（已有独立 Watch，但 `sleepData` 只存基础字段）

问题：
- 跨设备同步依赖 Profile Watch（推送整个 Profile 文档，约 50KB+），延迟高
- 睡眠历史不在 `tb_transaction` 中，换机/清除数据会丢失历史
- `deviceSleepHistory` 导致 Profile 文档持续膨胀

#### 核心方案

**信任 Transaction Watch**：将 `tb_transaction` 作为睡眠历史的唯一权威源，复用现有交易监听链路。

#### 改动详情

**前端（app-sleep.js / app-1.js / app-reports.js）**

1. **`app-sleep.js` 数据模型扩展**
   - `doSleepSettlement` / `completeNapSleep` / `submitManualSleep` 的 `sleepData` 新增 `details` 字段（完整奖惩对象）、`plannedBedtime`、`plannedWakeTime`、`targetDurationMinutes`
   - 小睡 `sleepData.details` 包含 `totalReward` 和 `napTargetMinutes`

2. **`app-sleep.js` 读取链路重构**
   - `getSleepHistory()`：从 `transactions` 数组实时过滤，加 `_sleepHistoryCache` 缓存
   - `getSleepRecordForDate()`：直接从 `transactions` 查找，移除本地 `sleepHistory` 回退
   - `loadSleepHistory()`：透传 `getSleepHistory()`
   - 返回格式兼容 `ai-service.js`（新增 `duration` 秒字段和 `quality` 字段）

3. **`app-sleep.js` 写入链路清理**
   - `saveSleepHistory()`：删除本地 `localStorage` 写入和云端 `deviceSleepHistory` 写入，仅保留 `lastSleepRecord` 更新
   - `doSleepSettlement` / `completeNapSleep` / `submitManualSleep`：移除 `saveSleepHistory()` 调用

4. **`app-1.js` 监听链路增强**
   - `watchers.transaction.onChange`：检测 `sleepData` 变更，触发 `clearSleepHistoryCache()` + `updateSleepCard()`
   - `mergeTransactionDelta()`：transactions 变更后清除睡眠缓存
   - `importFromBackup()`：备份恢复后清除睡眠缓存
   - `DAL.loadAll()`：智能合并完成后清除睡眠缓存

5. **`app-reports.js` 写入链路增强**
   - `addTransaction()`：若写入的是睡眠交易，清除睡眠历史缓存

#### 兼容性

- **旧数据兼容**：旧版本 `tb_transaction` 的 `sleepData` 无 `details`，`getSleepRecordForDate` 返回 `details: null`，UI 降级展示基础信息
- **旧本地数据**：停止写入但不主动删除，自然过期
- **旧云端数据**：`deviceSleepHistory` 停止写入，Profile 中保留但不再读取

#### 架构收益

| 维度 | 改造前 | 改造后 |
|------|--------|--------|
| 同步级别 | Profile Watch（全量） | Transaction Watch（增量） |
| 同步延迟 | 受 Profile 大小影响 | 秒级（与任务同级） |
| Profile 大小 | 含 `deviceSleepHistory`（几百 KB） | 不含，持续缩小 |
| 数据一致性 | 本地历史 ≠ 交易历史 | 完全一致 |
| 换机数据 | 丢失本地 `sleepHistory` | 通过交易记录完整恢复 |

## v9.22.S (2026-07-21)

### [Core] 9.22.x 重启 · 安全投影方案

#### 背景

9.22.0 曾是一次雄心勃勃的冷启动优化（13s → ~2s），但因「任务数据精简时删除内嵌 data 对象」造成 32 个任务（22 个 reward / 4 个 instant_redeem / 6 个 continuous_target）丢失 `fixedTime/consumeTime/targetTime/bonusReward`，产生 NaN → amount=0 → 导出 null 的灾难。9.21.1 整体回退后用户决定重启 9.22.x 计划。

本次重启采用「安全投影」方案（区别于 9.22.0 的「精简投影」）：

| 维度 | 9.22.0（灾难版） | 9.22.S（本次重启） |
|------|------------------|---------------------|
| TASK_PROJECTION 含 `data:true` | ❌ 否 | ✅ 是 |
| TX_PROJECTION 含 `data:true` | ❌ 否 | ✅ 是 |
| 删除 `task.data` 逻辑 | ❌ 存在（直接诱因） | ✅ 无 |
| 客户端 NaN 兜底 | ❌ 无 | ✅ 有（4 处） |
| 字段缺失守护 | ❌ 无 | ✅ 有（仅打点不改写） |
| 云函数 | ❌ 改了 timebankSync | ✅ 不动 |

#### 改动详情

**前端（仅 app-1.js / app-2.js）**

1. **`app-1.js` 7 项冷启动优化（重贴，9.22.0 同款）**
   - `DAL.init → loadAll` 后 subscribeAll 改为后台化（relogin + handlePostLoginDataInit 两处）
   - `loadAllTasks` 加 `TASK_PROJECTION`（24 字段全展开，**含 data:true**）
   - `loadAllTransactions` 翻页键 `timestamp` → `_id`，加 `TX_PROJECTION`（**含 data:true**）
   - `subscribeAll` 预热等待 200 → 50ms
   - `subscribeAll` watch 错峰 200 → 50ms
   - `loadAll` 完成写 `window.__loadAllJustFinishedAt`
   - `reconcile` 入口加 5 秒退避（基于 `__loadAllJustFinishedAt`）

2. **`app-1.js` 兜底字段补齐**
   - `loadAllTasks` `doc.data` 缺失时兜底对象新增 `fixedTime/consumeTime/targetTime/bonusReward/habitType` 顶层读取
   - `loadAllTransactions` `doc.data` 缺失时兜底对象新增 `balanceAdjust/clientId/isBackdate/pauseHistory/_needsCloudUpdate` 顶层读取

3. **`app-1.js` 字段缺失守护（新增）**
   - `auditTaskFields(taskList)` 函数扫描 4 类任务的必备字段
   - `loadAll` 完成后调用，结果仅在 Console.warn + 累加 localStorage 计数（`tb_v922s_field_audit_count` / `tb_v922s_field_audit_last`）
   - **不自动修复用户数据**（9.22.0 灾难教训）

4. **`app-2.js` NaN 兜底（4 处）**
   - `completeTask` 入口：`task.fixedTime` 非数字 → 0
   - `processHabitCompletion` 入口：`baseReward` 非数字 → 0
   - `processHabitCompletion` 合并奖励处：`transaction.amount` 非数字 → 0
   - 新增 `computeHabitBaseRewardFromStreak`：占位函数（始终返回 0，调用即警告）

**云函数**：零改动（tbMutation v9.14.1 / timebankSync v9.12.2 / timebankAI / timebankTaskLock 全部保持）

#### 数据完整性影响

- **预期收益**：冷启动首屏可见时间 13s → ~2s（实测待用户验证）
- **数据兼容性**：完全保留 9.21.0 的字段语义，无任何破坏性变更
- **副作用**：投影因 `data:true` 比 9.22.0 包体积略大，但仍显著小于"投影全部 _updateTime 元数据"的 9.21.0 状态

#### 与 9.22.0 的核心差异

- 「**安全投影**」：投影必须包含 `data:true`，9.22.0 灾难路径在结构上被消除
- 「**字段缺失守护**」：只观测不干预，避免 9.22.0 "自动改写用户数据"的二次灾难
- 「**NaN 兜底**」：即使有字段异常，金额计算仍能给出 0 而非 NaN（避免 amount:null）

#### 回退路径

`git revert HEAD` 即可回到 9.21.1；云函数无需重新部署（本次完全不动）

#### 跟踪文档

- `docs/9.22.x-plan.md`（本次新建）：设计原则、灾难防线、禁忌清单
- `docs/restoring-v9.22.0-optimizations.md`（保留）：原 9.22.0 重启指令文档，标注"已被 9.22.S 替代"

---

## v9.21.1 (2026-07-21)

### [Core] 全面回退 9.22.x · 含云函数

#### 背景

9.22.0 / 9.22.1 / 9.22.4 期间引入了 3 个连续修复/优化，但每一个都暴露了上一轮的问题：
- 9.22.0：subscribeAll 后台化 + 投影 + 翻页键 _id（前端优化）
- 9.22.1：紧急 hotfix tbMutation 变量未定义 bug（云端）
- 9.22.4：客户端 NaN 兜底（前端）

用户决定整体回退到 9.21.0，并显式说明 **9.22.0 的方法要保留在指令文件中**，方便未来按步骤重启。

#### 改动

| 层 | 文件 | 状态 |
|----|------|------|
| 前端 | `app-1.js` 等 | ✅ 已回退到 9.21.0（`e70c04b`）|
| 前端 | 11 处版本号 | ✅ 全部同步到 `v9.21.1` |
| 云端 | `tbMutation` | ✅ 部署到 v9.14.1 旧版（`4c2ce14`）|
| 云端 | `timebankSync` | ✅ 部署到 v9.12.2 旧版（`e2d7b37`）|
| 文档 | `docs/restoring-v9.22.0-optimizations.md` | ✅ **新增**：记录未来重启步骤 |

#### 9.22.0 优化方法（已停止实施，但保留能力）

详见 `docs/restoring-v9.22.0-optimizations.md`。

#### 已知未修复（9.21.0 起就存在）

1. `cleanupDemoDataOnLogin` 内部 `currentBalance = transactions.reduce(...)` 与注释"禁止本地重算"自相矛盾。
2. 习惯完成后 `task.completionCount` 不递增到云端（只在内存中），因为 `processHabitCompletion` 没有显式调 `DAL.saveTask`——只在 `rebuildHabitStreak` 内 streak 变化时才上传。

这两点本次都不修，避免引入新的回归风险。

#### 回退路径

如果未来发现问题：
- 前端：单 `git revert HEAD` 即可回到 9.22.4-fix2
- 云端：`tcb fn deploy tbMutation --force` + `tcb fn deploy timebankSync --force` 重部署

---

## [已废弃] v9.22.0-v9.22.4 历史

> 9.22.x 系列已于 2026-07-21 整体回退到 9.21.0。以下是历史记录，便于追溯。

## v9.20.1 (2026-07-15)

### [UI] 迷你卡片统一与通透模式适配

#### 背景

v9.18.x 引入 region + 迷你卡片布局后，手机端和宽屏端存在不同的间距与按钮尺寸规则；迷你卡片此前沿用标准卡片的经典背景覆盖，切换全局通透模式后无法获得一致的毛玻璃视觉。同时，首次启用通透模式时的油画主题建议弹窗会错误启动 `glass-tuning` 新手引导。

#### 改动

- 最近任务迷你卡片的 region 间距和 region 内部间距统一为 8px，不再通过屏幕宽度区分。
- 保持最近任务网格的 144px 固定 region 高度，迷你卡片高度由内部网格剩余空间自动分配。
- 迷你卡片任务名、分类标签和操作按钮采用统一的可读性尺寸，宽屏不再额外放大按钮内边距。
- 普通迷你卡片和全部任务标准卡片移除外部阴影，保留背景、圆角和内嵌边框。
- 为 `.task-card-mini.glass` 增加浅色/深色通透背景、顶部高光、毛玻璃模糊和分类标签适配，并通过更高优先级覆盖经典模式背景规则。
- 首次切换通透模式时，“立即切换”只执行油画主题切换，不再调用 `switchTab('settings')` 或 `startSimpleOnboarding('glass-tuning')`，避免用户被错误带入新手引导页面。

#### 影响范围

- Android WebView 权威前端：`css/main.css`、`js/app-reports.js`。
- PWA 副本在推送流程中从 Android 权威源同步，保证两端样式和主题切换行为一致。
- 不涉及数据结构、交易计算、推荐算法或云函数；版本号统一为 v9.20.1，Android versionCode 从 98 升至 99。

#### 验证

- JavaScript 和 CSS 编辑器诊断均通过。
- APK 已成功构建、安装并启动。
- 主题建议弹窗回调已复核，不再包含设置页跳转或通透引导调用。

## v9.20.0 (2026-07-14)

### [Core] 推荐任务算法重构：w1/w2/w5/w3 四维调整

#### 背景

v9.15.0 引入推荐任务算法时，五维度评分（w1 时段匹配、w2 习惯紧迫度、w3 最近使用衰减、w4 类别平衡乘子、w5 提醒命中）以"广撒网"为设计原则：所有任务、所有习惯都参与排序。但实际使用中发现：

1. **w1 时段匹配**：用统一 σ=1.5 的高斯核匹配所有任务，无法区分"长期稳定在某时段"和"随机分布"的任务；冷启动任务拿到中性分 0.5 也会参与排序。
2. **w2 习惯紧迫度**：阶梯式权重（streak=0 给 0.7，streak≥1 给 1.0），导致新建的小习惯和连胜 30 天的老习惯拿到相近的紧迫度分数。
3. **w4 类别平衡**：在 earn/spend 独立排序时是常数乘子（earn 列表中要么全是 1.5 要么全是 1.0），对相对顺序无任何区分度。
4. **w5 提醒命中**：单点提醒 ±30min 内为 1、区间/跨夜提醒命中为 1，否则为 0，0/1 跳变导致列表抖动，且无法表达"距离提醒越近越该推荐"的直觉。
5. **w3 最近使用衰减**：仅按时间衰减控制推荐顺序，无法阻止"今日已完成目标的习惯"或"今日已过度重复的非习惯任务"继续占坑。

#### 改动

**w2：习惯紧迫度改为"重要性 × 紧急性"双因子模型**
- 入选项：`streak≥1` 或 `hour≥20`，否则 w2 = 0
- 重要性 = `_streakImportance(d) = ln(1+d/3) / ln(103/3) × 2.0`，封顶 2.0
  - d=1 → 0.09；d=7 → 0.67；d=30 → 1.34；d=100 → 2.0
- 紧急性 = `_dailyUrgency(hour, minute)`，仅 daily 习惯生效
  - 22 点前 3h 不变（1.0）；之后 5 段线性爬升到 2.0；超时后缓慢上升封顶 2.0
- 合成：`w2 = min(2.5, importance × urgency)`
- 效果：新建小习惯不再过度提醒；长期连胜在 22 点附近拿到 2.5 封顶值

**w1：时段匹配改为"稳定性 × 集中性"双因子模型**
- 稳定性 = `_stability(task, transactions, hist24)`
  - 三维：`abundance × consistency × dayRatio`
  - abundance：`total/(total+10)` 饱和曲线
  - consistency：基于 24 小时分布的方差系数 CV（CV 越小越集中）
  - dayRatio：严格 30 天窗口内的活跃天数占比；<30% 时打折
- 集中性 = `_concentration(hour, minute, hist48)`
  - 48 桶（30 分钟精度）环形均线，atan2 角度平均
  - logistic 衰减：`1 / (1 + (devMin/60)^1.5)`
  - 0min → 1.0；60min → 0.50；120min → 0.21；240min → 0.04
- 稳定性 < 0.2 → w1 = 0.5 中性（不参与匹配）
- 持续类任务按开始时间（`tx.amount` 即持续秒数，反推开始时间戳）
- 合成：`w1 = stability × concentration`
- 效果：只有"长期稳定在该时段"的任务才有时段匹配优势；冷启动任务不再因中性分参与匹配

**w5：提醒命中从离散开关改为平滑距离权重**
- 移除 `_isWithinReminderWindow(now, r)` 离散判断函数
- 新增 `_reminderScore(now, r)` 平滑距离权重函数
  - 支持 `08:00`（单点）、`08:00-12:00`（区间）、`22:00-06:00`（跨夜区间）三种格式
  - 距离定义：
    - 单点：`abs(now - target)`
    - 区间：若在区间内 → 0；否则 → 到最近端点的距离
    - 跨夜区间：若在窗口内 → 0；否则 → 到最近端点的距离
  - 衰减函数：`1 / (1 + (distanceMin / 60)^1.5)`
    - 0min → 1.00；30min → 0.78；60min → 0.50；120min → 0.21；240min → 0.04
- w5 范围保持 [0, 1]，与 w1、w3 同数量级，避免过度主导

**w3：新增今日饱和预过滤，仅作用于推荐模式**
- 在 `_scoreAndRank` 中先对候选任务做预过滤，运行中任务始终保留
- `_isTaskSaturatedToday(task, transactions, todayStr)`：
  - 习惯任务：当前周期已达标（`getHabitPeriodInfo` 的 `currentCount >= targetCount`）
  - 非习惯任务：今日次数 > 30天单日最大次数 + 1，但 30 天内首次记录除外
- `updateRecentTasks`（最近任务模式）不调用此过滤，避免影响"最近"行为

**w4：类别平衡删除**
- earn/spend 独立排序时 w4 是常数乘子，对相对顺序无区分度
- 合成公式从 `base * w4 + w5` 改为 `base + w5`

#### 衍生收益

- **对称设计**：w1（稳定性 × 集中性）与 w2（重要性 × 紧急性）形成对偶，公式风格统一
- **冷启动友好**：数据稀疏的任务不再因中性分参与排序，避免误导用户
- **30 天严格窗口**：避免长尾历史数据稀释当前时段规律（用户核心诉求）
- **持续类任务时段合理化**：连续任务按开始时间匹配，而非完成时间
- **推荐列表更安静**：w5 平滑化 + w3 饱和过滤减少无意义的跳动和重复任务

#### 影响范围

- `_computeAlgoScore` 函数（[app-1.js#L8676](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L8676)）
- 新增辅助函数：`_stability`、`_countActiveDays`、`_build48BucketHist`、`_concentration`、`_streakImportance`、`_dailyUrgency`、`_reminderScore`、`_isTaskSaturatedToday`、`_getTaskTodayCount`、`_getMaxDailyCountInWindow`、`_isFirstRecordInWindow`
- 算法分范围：`[0, ~3.5]` → 与 α=0.7 混合后 finalScore 范围合理
- 跨端一致：所有平台跑同一份 JS，无需云端改动

## v9.19.1 (2026-07-14)

### [Fix] 最近任务行数 · 迷你/标准卡模式行为一致

#### 背景

v9.18.2 引入迷你卡片 + region 截取架构后，`updateRecentTasks`（最近任务主入口）与
`renderRecommendedTasks`（推荐任务主入口）共 4 处 `renderTaskList` 调用未透传
`miniForNotRunning` 选项；而 `_truncateTasksByRegions` 仅按"运行中=标准卡、其他=迷你卡"
硬编码分类。

#### 现象

- **关闭迷你卡片开关 + 行数设置 1**：期望显示 1 行，但实际显示 3 行（被错误 trim 后的 3 张标准卡纵向堆叠）
- **开启迷你卡片开关 + 行数设置 1**：正常显示 1 行（3 张迷你卡凑成 1 个 region，恰好对齐预期）
- 切 tab / 切换推荐模式时表现差异：2 个次级入口（`_renderRecentTasksByType` /
  `_renderRecommendedByType`）传了选项，行为正常；4 个主入口未传，行为异常

#### 根因

`_truncateTasksByRegions` 是按 region 容量截取任务列表的纯数据层函数，但它的分类规则
写死了"非运行任务 = 进 miniBuffer 凑 3 张"，与渲染层的 `renderTaskCards` 分类逻辑脱节：

- `renderTaskCards`：按 `miniForNotRunning` 决定非运行任务渲染成标准卡还是迷你卡
- `_truncateTasksByRegions`：不读 `miniForNotRunning`，永远把非运行任务当迷你卡处理

结果：迷你关闭时，JS 数据层按"3 张 = 1 region"截取，渲染层按"1 张 = 1 region"出 3 张标准卡，
视觉行数 = 任务数 ≠ 用户期望行数。

#### 方案 F：调用方传递模式标志

1. `_truncateTasksByRegions` 签名扩展为 `(tasks, regionLimit, miniForNotRunning)`
2. 截取策略根据 `miniForNotRunning` 分支：
   - `false`（标准卡模式）：每张任务 = 1 region，前 N 张全部输出
   - `true`（迷你卡模式）：维持原 strict 行为，3 张 = 1 region，不足 3 整组丢弃
3. 运行中任务无论模式如何都走"1 region"分支（运行中始终渲染为标准卡）
4. 4 个未传选项的主入口补传 `{ miniForNotRunning: MINI_CARD_ENABLED }`

#### 衍生收益

- 渲染链路统一：`renderTaskList` 的 options 现在被完整透传到截取层，未来加新选项只需传一次
- Bug 自动消失：刷新、切 tab、模式切换的所有路径行为一致
- 后续扩展点：若再增加第三种卡片类型（如"宽屏大卡"），只需扩展 `_truncateTasksByRegions`
  的分支判断，无需修改调用方

#### 验证场景

| ROWS | cols | mini 关闭 | mini 开启 |
|------|------|----------|----------|
| 1 | 3 | 1 行 3 张标准卡 ✓ | 1 行 3 张迷你卡 ✓ |
| 1 | 1 | 1 行 1 张标准卡 ✓ | 1 行（miniBuffer 不足 3 丢弃 → 空 → 显示空态） ⚠️ |
| 4 | 3 | 4 行 12 张标准卡 ✓ | 4 行（每行 1 个 mini-region × 3 张 = 12 张） ✓ |
| 1 | 3 + 1 运行 | 1 行（1 标准卡运行 + 0 其他） ✓ | 2 行（1 std-region + 1 mini-region 不满 3 丢弃 → 仅 1 std-region） ⚠️ |

> 注：ROWS=1 + cols=1 + mini 开启的场景下，miniBuffer 不足 3 张被 strict 丢弃，会显示空态。
> 这是 v9.18.2 的已有行为，本次未改。如未来需要"不满 3 也显示"应改为非 strict 模式。

---

## v9.18.3 (2026-07-13)

### [Core] 配置管理器统一默认源 · 配置验证机制

#### 背景

v9.17.9 引入 `CloudConfigManager` + `config-manager.js` 后，业务代码硬编码已全部消除。
但配置管理器内部仍存在多处重复硬编码兜底值（`DEFAULT_CONFIG_JSON` 字符串 + 5 处 `get*()` 方法内联兜底），
导致：
- 同一套配置值（envId / endpoint URL / function name）在 5+ 处重复
- 修改默认值需同步 5 个位置，容易遗漏
- 配置文件缺失时无法验证有效性，可能导致运行时错误

#### 根因

配置管理器采用"内联字符串兜底"模式：Android 端用 Java 字符串拼接的 `DEFAULT_CONFIG_JSON`，
Web 端用 JS 对象字面量 `DEFAULT_CONFIG`，两套默认值又分别与各 `get*()` 方法的内联兜底值重复。
"多重兜底"既不优雅也易错。

#### 方案

**1. 统一默认配置源**
- 新增 `assets/config/default-config.json`（Android）+ `assets/www/config/default-config.json`（Web）
- 两份文件 JSON 数据完全一致（仅注释说明文件路径不同）
- 删除 `CloudConfigManager.java` 中 `DEFAULT_CONFIG_JSON` 字符串常量
- 删除 `config-manager.js` 中 `DEFAULT_CONFIG` 对象字面量
- 删除所有 `get*()` 方法的内联兜底字符串，改为从默认配置文件读取或返回 null

**2. 配置验证机制**
- Android：`CloudConfigManager.validateConfig()` 校验 `cloudbase.envId` 非空 + `endpoints.sync` 是合法 URL
- Web：`config-manager.js` 的 `validateConfig()` 镜像相同校验
- 验证失败 → 跳过该层配置叠加，回退到上一层（默认 → 环境 → 运行时）

**3. 加载容错与重试**
- Android `loadJsonFromAssets()`：3 次重试 + 指数退避（100ms / 200ms）
- Web `fetchJsonWithRetry()`：3 次重试 + 指数退避（100ms / 200ms）
- 文件缺失 → 极兜底返回空 object，不抛 NPE

**4. 调用方空值保护**
- `CloudSyncScheduler.Worker.doWork()`：检查 `syncEndpoint == null` 时返回 `Result.retry()`，避免 `new URL(null)` 抛 NPE

#### 收益
- 配置维护点从 1 个内联字符串 + 5 个内联兜底 → **1 个 JSON 文件**
- 配置修改同步成本降低约 70%
- 新增配置项无需同时修改两端代码（仅添加 JSON + getter 实现）

#### 风险/兼容性
- `getEndpoint/getFunctionName` 返回值由"兜底字符串"变为"可能为 null"
- 已分析所有调用方：唯一硬消费方 `CloudSyncScheduler.java:241` 新增 null 防护
- 业务代码调用方（`app-1.js:362`、`app-1.js:1327`、`ai-service.js:18`）原本就有 `|| 'cloud1-...'` 兜底，继续兼容
- 同步初始化期间 `configManager.get()` 返回 undefined（`config=空`），但业务层有兜底；SDK 初始化是异步，load() 完成后值正确

## v9.18.2 (2026-07-13)

### 🎴 迷你卡片区域对齐：修复全迷你场景下卡片被压扁

#### 背景

v9.18.0 引入迷你卡片（mini card）后，"最近任务"区域的渲染使用了 `grid + region 容器`结构：
- 每张标准卡包成 `.std-region`
- 每 3 张迷你卡包成 `.mini-region`

CSS 最初设计为：
```
grid-auto-rows: minmax(min-content, 1fr);  /* 行高跟随内容 */
```

这导致两种场景高度不一致：
- **混合场景**（1 std-region + N mini-region）：行高被 std-region 内容（约 144px）撑高 → 迷你卡 ≈ 40px × 3 张
- **全迷你场景**（仅 mini-region）：行高回落到 CSS 默认 → 迷你卡 ≈ 24px × 3 张，明显"被压扁"

#### 根因

`minmax(min-content, 1fr)` 让 grid 行高依赖**子项最大自然高度**：
- 存在 std-region 时：std-region 的内容（标准卡 padding + 标题/时间/参数三行 + ::before 边框）≈ 144px，行被拉高
- 全 mini-region 时：mini-region 内 `grid-template-rows: 1fr 1fr 1fr` 在外部 1fr 约束下塌缩为内容自然高（约 24px × 3 + 2 × 12 gap = 96-120px）

#### 方案

将 grid 行高从"内容自适应"改为"CSS 硬编码 144px"，让两种场景共用同一行高：

1. **grid 行高统一**：`grid-auto-rows: minmax(min-content, 1fr)` → `grid-auto-rows: 144px`
   - 144 = 3×40（迷你卡内容）+ 2×12（mini-region 内 gap）+ 20（留白），与原 std-region 自然高吻合
2. **std-region 高度跟随**：`.std-region` 由 `display: block` 改为 `display: flex; flex-direction: column`；内部 `.task-card` 增加 `flex: 1; min-height: 0` 让标准卡填满 grid 行
3. **移除 JS 高度同步**：删除 `_normalizeRegionSize` 函数及其在 `renderTaskList` 末尾的 `requestAnimationFrame` 调用。CSS 已保证高度统一，JS 同步函数成为冗余且会引入测量抖动（曾出现 fallback 110px 与 CSS 120px 不一致的问题）

#### 衍生收益

- 全迷你场景与混合场景高度一致 → 用户视觉一致
- 移除 JS 测量依赖 → 渲染更稳定（字体未加载完成时不再触发 0px 写入）
- 移除 `requestAnimationFrame` 调度 → 首屏渲染帧数减少

#### 改动文件清单

| 文件 | 改动 |
|------|------|
| `android_project/app/src/main/assets/www/css/main.css` | `grid-auto-rows` 改为 `144px`；`.std-region` 改为 flex；`.std-region > .task-card` 增加 flex:1 |
| `android_project/app/src/main/assets/www/js/app-1.js` | 删除 `_normalizeRegionSize` 函数及其调用 |

## v9.18.1 (2026-07-12)

### 📊 分类任务行数控制与响应式填满

#### 背景

v9.18.0 已将"最近任务"的显示数量开关改为"行数"控制（每行卡片数随屏幕宽度自适应），但"全部任务"分类栏仍保留旧版的固定数量逻辑。此外，v9.18.0 的窗口 resize 监听仅刷新最近任务，未刷新分类任务列表，导致旋转屏幕或调整窗口宽度后，分类栏的折叠/展开数量不会跟随新的列数重新计算，可能出现行数控制不准确或最后一行未填满的情况。

#### 目标

1. 统一交互语义：分类栏任务显示开关也转为"行数"控制，与最近任务保持一致。
2. 保证响应式正确：任意屏幕宽度变化后，分类任务列表自动重新计算实际列数并按设定行数填满。
3. 兼容旧设置：启动时自动将旧版分类独立数量值（2/4/6/8）迁移为行数（1/2/3/4）。

#### 方案

- **行数语义统一**：`categoryTaskLimits` 从存储"任务数量"改为存储"行数"；渲染时由 `updateCategoryTasks` 读取 grid 真实列数，计算 `catLimit = rowSetting × realCols`。
- **resize 刷新补充**：在 `window.addEventListener('resize')` 回调中同步调用 `updateCategoryTasks()`，与 `updateRecentTasks()` 一起防抖刷新。
- **旧值迁移**：启动时遍历 `tb_category_task_limits`，旧值 ≤4 直接映射为行数，旧值 >4 除以估算列数并四舍五入到 1-4。

#### 改动文件清单

| 文件 | 改动 |
|------|------|
| `android_project/app/src/main/assets/www/js/app-1.js` | resize 监听增加 `updateCategoryTasks()`；保留 `categoryTaskLimits` 行数语义与迁移逻辑 |
| `android_project/app/src/main/assets/www/js/app-2.js` | `setRecentTaskRows` 同步刷新分类任务；`toggleCategoryTaskLimit` 改为 1/2/3/4 行数循环 |
| `android_project/app/src/main/assets/www/index.html` | 设置项说明更新；新增 v9.18.1 用户日志 |

## v9.17.9 (2026-07-06)

### 🏗️ 架构重构：云端配置统一管理 + 多环境支持

#### 背景

过去 CloudBase 环境 ID / 云函数端点 / AI 端点等关键配置硬编码在 4 个不同文件中：

| 文件 | 硬编码内容 |
|------|-----------|
| `android_project/app/src/main/assets/www/js/app-1.js` L359 | `const TCB_ENV_ID = 'cloud1-8gvjsmyd7860b4a3';` |
| `android_project/app/src/main/assets/www/js/app-1.js` L1318-1320 | `cloudbase.init({env: TCB_ENV_ID, ...})`（硬重置分支） |
| `android_project/app/src/main/assets/www/js/ai-service.js` L15 | `HTTP_ENDPOINT: 'https://...timebankAI'` |
| `android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java` L70 | `CLOUDBASE_FUNCTION_URL = 'https://...timebankSync'` |

每次迁移环境或换域名需要同步修改 4 处源码并重新打包 + 重新部署云函数；环境隔离测试需要临时代码注释；用户日志和文档中关于环境的引用容易遗漏。

#### 目标

1. 集中化配置管理：所有云端配置统一存储，消除硬编码
2. 多环境支持：production / development / testing 三套独立配置，零代码改动切换
3. 加载失败兜底：任何一层配置加载异常都使用内置默认配置，应用不中断
4. 原生层 ↔ WebView 配置同步：消除双端配置可能不一致的隐患

#### 方案

引入**三层优先级配置架构**（高 → 低）：

```
运行时配置（window._nativeConfig）
  ↓ merge
环境配置文件（config/config.{env}.json）
  ↓ merge
默认配置（代码内置 DEFAULT_CONFIG）
```

- **JS 层**（`android_project/app/src/main/assets/www/js/config-manager.js`）：
  - 单例 `window.configManager`
  - API：`get('a.b.c')` 路径访问、`getEnv()` 当前环境、`isProduction()`、`isFeatureEnabled(name)`
  - 加载异步、不阻塞启动；通过 `ready(maxWaitMs)` 可选等待
- **Android 层**（`android_project/app/src/main/java/com/jianglicheng/timebank/CloudConfigManager.java`）：
  - 单例 + 线程安全双重检查锁
  - 环境来源：AndroidManifest `cloud_env` meta-data → 默认 production
  - 配置源：`assets/config/config.{env}.json` → 默认字符串
  - API：`getEndpoint('sync'|'ai')`、`getCloudBaseEnvId()`、`getConfigJson()`、`isFeatureEnabled(name)`
- **配置注入**（`MainActivity.java`）：
  - `WebViewClient.onPageStarted` 阶段注入 `window._ENV` + `window._nativeConfig`
  - 时序：HTML 解析前 JS 全局已可用 → config-manager.js 在 fetch 配置文件前就能拿到 env
- **环境切换机制**：
  - JS：`?env=development` URL 参数 或 `localStorage.tb_env=development`
  - Android：改 `AndroidManifest.xml` 的 `cloud_env` meta-data 后重新打包

#### 改动文件清单

**新建文件（7 个）**：

| 文件 | 作用 |
|------|------|
| `android_project/app/src/main/assets/www/js/config-manager.js` | JS 层配置管理器 |
| `android_project/app/src/main/assets/www/config/config.production.json` | JS 端生产环境配置 |
| `android_project/app/src/main/assets/www/config/config.development.json` | JS 端开发环境配置 |
| `android_project/app/src/main/assets/www/config/config.testing.json` | JS 端测试环境配置 |
| `android_project/app/src/main/java/com/jianglicheng/timebank/CloudConfigManager.java` | Android 层配置管理器 |
| `android_project/app/src/main/assets/config/config.production.json` | Android 端生产环境配置 |
| `android_project/app/src/main/assets/config/config.development.json` | Android 端开发环境配置 |

**修改文件（6 个）**：

| 文件 | 改动 |
|------|------|
| `android_project/app/src/main/assets/www/index.html` | 引入 `config-manager.js`；新增 v9.17.9 用户日志 |
| `android_project/app/src/main/assets/www/js/app-1.js` | `TCB_ENV_ID` 改为从 ConfigManager 读取（保留兜底） |
| `android_project/app/src/main/assets/www/js/ai-service.js` | `HTTP_ENDPOINT` 改为从 ConfigManager 读取（保留兜底） |
| `android_project/app/src/main/java/com/jianglicheng/timebank/CloudSyncScheduler.java` | 删除 `CLOUDBASE_FUNCTION_URL` 常量；改用 `CloudConfigManager.getEndpoint('sync')` |
| `android_project/app/src/main/java/com/jianglicheng/timebank/MainActivity.java` | 新增 `WebViewClient.onPageStarted` 注入 `_ENV` + `_nativeConfig` |
| `android_project/app/src/main/AndroidManifest.xml` | 新增 `cloud_env=production` meta-data |

**版本号同步**（v9.17.8 → v9.17.9，build 87 → 88）：

- `index.html` ×3（title / 副标题 / 关于页）
- `js/app-1.js` ×1（`APP_VERSION`）
- `sw.js` ×2（顶部注释 / `CACHE_NAME`）
- `build.gradle` ×2（`versionCode` / `versionName`）
- AGENTS.md L135（项目元信息）

#### 验证

- ✅ JS 语法：`node --check` 三个文件全部通过
- ✅ JSON 格式：5 个配置文件全部合法
- ✅ 功能测试（Node mock）：三层优先级全部正确
  - 默认配置加载正常（production）
  - `?env=development` + Android 注入 → cloudbase.envId 以注入值为准
  - 配置文件 404 → 自动回退默认配置
- ✅ Android Java：遵循项目 `CloudSyncScheduler.java` 等现有 Android API 调用模式（javac 因本地无 Android SDK classpath 失败属预期内）

#### 兜底策略（任意层失败都不会阻塞主流程）

| 失败场景 | 行为 |
|---------|------|
| JS fetch 配置文件 404 | 使用 `DEFAULT_CONFIG`，Console 输出 WARN |
| JS JSON 解析异常 | 使用 `DEFAULT_CONFIG`，Console 输出 WARN |
| Android `assets/config/config.{env}.json` 不存在 | 使用 `DEFAULT_CONFIG_JSON` 字符串，Logcat 输出 WARN |
| Android `cloud_env` meta-data 缺失 | 默认 production，Logcat 输出 DEBUG |
| Android Gson 解析异常 | 使用最小可用配置，Logcat 输出 ERROR |
| MainActivity 注入异常 | try-catch 包裹，Logcat 输出 ERROR 但不影响 WebView 加载 |

#### 回退预案

1. **立即回退**（推荐）：`git revert <本次 commit hash>`，然后执行第 3 节"双端同步规则"的 5 条 `Copy-Item` 命令 + `Get-FileHash` 验证 + 重新打包安装
2. **紧急回退**（保留 v9.17.9 commit 但禁用新代码）：
   - JS 端：将 `<script src="./js/config-manager.js"></script>` 注释掉即可
   - Android 端：将 `AndroidManifest.xml` 的 `cloud_env` meta-data 删除即可（不影响配置加载，配置从 `cloud_env=production` 回退到默认 production）
3. **配置回滚**（保留新架构但回退配置值）：
   - 编辑 `assets/www/config/config.production.json` 和 `assets/config/config.production.json`，将 envId / endpoints 改回旧值
   - 清空 `assets/www/config/config.development.json` 和 `assets/www/config/config.testing.json`（让所有用户走 production 兜底）

#### 衍生收益

1. **未来切换 CloudBase 环境**：仅改 2 个 JSON 文件 + 重新打包，无需修改任何 Java/JS 源码
2. **新云函数上线**：在 `endpoints` 节点新增一个字段，无需修改 Worker 调用代码
3. **配置变更审计**：JSON 文件可通过 Git diff 清晰看到所有环境变更历史
4. **iOS 端适配**：未来 iOS PWA 复用同一套 `config-manager.js`，零工作量

#### 风险与已知限制

- ⚠️ 配置变更需要重新打包 APK（JS 文件可热更新但 Android assets 不行）→ 这是 Android 平台限制，非本次重构引入
- ⚠️ 多环境切换后 `tb_profile` 等云端数据库不通用（CloudBase 环境是隔离的）→ 这是 CloudBase 平台特性
- ⚠️ `cloud_env` meta-data 调试期间切到 `development` 后再切回 `production` 需重新打包 → 建议配合 `?env=xxx` URL 参数在 JS 端做临时切换

---

## v9.17.8 (2026-07-06)

### 🐛 修复：自动检测补录 / 屏幕时间自动结算的余额暂时性双倍计入

#### 现象

当 `autoDetectAppUsage` 触发一笔 `createAutoMakeup` / `createAutoCorrection` 补录交易，或者屏幕时间自动结算（`autoSettleScreenTime`）创建补录交易时，本机的 `currentBalance` 会**双倍计入**——例如漏记 30 分钟（spend，含惩罚实际扣 36 秒×N），本机会扣两倍金额。云端 `tb_profile.cachedBalance` 因走 `callMutation → tbMutation` 原子更新，没被污染，所以下次云端同步拉回权威余额时本机显示自动恢复——表现就是"暂时性双倍计入"。

#### 根因

`addTransaction()` 自 [v7.36.5] 起内置了"按 `transaction.type` 增量更新 `currentBalance`"的乐观 UI 逻辑（[app-reports.js#L32-38](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L32-L38)）：

```javascript
// [v7.36.5-perf] 增量更新余额
const amt = transaction.amount || 0;
if (transaction.type === 'earn') {
    currentBalance += amt;
} else {
    currentBalance -= amt;
}
```

但以下三个调用方在调用 `addTransaction()` **之前**仍手动更新了 `currentBalance`：

| 调用方 | 位置 | 旧行为 |
|--------|------|--------|
| `createAutoMakeup`（自动补录，漏记录） | [app-systems.js#L3670-3675](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L3670-L3675) | 手动 `currentBalance -=/+ afterBalanceSeconds` → 再 `addTransaction()` 又按 type 改一次 |
| `createAutoCorrection`（自动修正，多记录） | [app-systems.js#L3794-3798](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L3794-L3798) | 手动 `currentBalance +=/- afterBalanceSeconds`（反向）→ 再 `addTransaction()` 又按 reverse-type 改一次 |
| 屏幕时间自动结算 | [app-systems.js#L2822-2824](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2822-L2824) | `currentBalance += balanceChange` → 再 `addTransaction()` 又按 type 改一次 |

两次方向一致的余额更新叠加 = **2 倍计入**。

#### 排查路径

1. `autoDetectAppUsage` → `aggregateAutoDetectForTaskDates` → `createAutoMakeup` / `createAutoCorrection`
2. 三处都看到 `currentBalance` 显式赋值 → 紧跟着 `addTransaction()`
3. `addTransaction()` 内 33-38 行死写 `currentBalance += amt/-amt` → **没有幂等检测**（既不检查 `t.id === transaction.id` 也不复用 txId）
4. `DAL.addTransaction()`（[app-1.js#L3659](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3659)）只调 `callMutation`，不再动余额——所以云端 `cachedBalance` 正确
5. `mergeTransactionDelta`（[app-1.js#L5358](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L5358)）已 v9.1.0 不重算余额——所以 Watch 重放补录交易不会触发双倍
6. `applyDataState`（[app-auth.js#L2557-2558](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L2557-L2558)）信任云端 `data.currentBalance` → 下次同步拉回时自动覆盖本地双倍余额 → **表现就是"暂时性"**

#### 修复

**方案 A：删除三处调用方的手动余额更新**，让 `addTransaction()` 统一负责。

| 文件 | 行 | 改动 |
|------|----|------|
| `app-systems.js` | 3670-3675 | 删除 `createAutoMakeup` 的 `if (isSpend) currentBalance -= ...` 整段 |
| `app-systems.js` | 3794-3798 | 删除 `createAutoCorrection` 的反向余额更新整段 |
| `app-systems.js` | 2822-2824 | 删除 `currentBalance += balanceChange`（保留 `totalChange += balanceChange` 用于启动报告汇总） |

#### 衍生收益

- `addTransaction()` 失败时 `onRollback`（[app-1.js#L3689-3711](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L3689-L3711)）的余额补偿路径天然对齐——以前手动余额更新在失败时不会被回滚（→失败也会双倍），现在彻底消除此隐患
- 屏幕时间自动结算的 `totalChange` 累加未受影响，启动报告金额展示不变

#### 影响范围

- 仅影响"自动检测补录/修正"和"屏幕时间自动结算"两类系统任务的余额展示时机
- 用户手动 `startTask` / `stopTask` 等常规路径行为完全不变
- 云端数据完全不变（云函数原子 `_.inc()` 没被本地双倍污染）

#### 相关历史背景

- v7.36.5：引入 `addTransaction()` 内置的"增量更新余额"乐观 UI（替换原"全量重算"路径）
- v9.1.0：删除 `updateDailyChanges` / `recalculateDailyStats` 等本地重算函数，余额云端权威化（`applyDataState` 信任云端 `cachedBalance`）
- v9.7.4：删除设置页"重算余额"按钮，余额唯一来源是云端 `tb_profile.cachedBalance`

## v9.17.7 (2026-07-03)

### 🐛 新设备登录后睡眠/小睡参数不显示云端配置

#### 现象

用户反馈在 A 设备修改了夜间睡眠计划和小睡参数后，在 B 设备首次登录会看到默认数字（如 `plannedBedtime=23:00`、`napReward=15`），不是 A 设备已配置的版本。即使云端 `deviceSleepSettings[deviceId]` 或 `sleepSettingsShared` 字段有正确数据，新设备仍显示默认值。

#### 根因

**问题 1：`initSleepSettings` 的全新安装保护分支设计过时**

[app-sleep.js#L575-588](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L575-L588) 的保护逻辑（[v7.33.8] 引入）在 v9.8.0 之前合理——v9.8.0 之前云端 `deviceSleepSettings[deviceId]` 是「这台设备本来的配置」，全新设备不应该继承。但 v9.8.0 之后 `sleepSettingsShared` 已成为 per-user 跨设备权威，新设备理应继承而不该看默认值。该分支写得太保守：

```javascript
} else if (localUpdated === 0 && cloudUpdated > 0) {
    if (cloudFormat === 'deviceSpecific') {
        // ⚠️ 保持代码默认值（等待升级迁移）
    } else {
        // 升级用户，采用云端 sleepSettingsShared
    }
}
```

v9.8.0+ 用户每次保存都双写 `deviceSleepSettings.${deviceId}` 和 `sleepSettingsShared`，新设备登录时 `deviceSleepSettings` 格式分支仍会触发「保持默认值」。

**问题 2：Watch 监听回退路径 `force=false` 兜底失效**

[app-1.js#L4511-4513](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4511-L4513) 的 `deviceSleepSettings` 回退分支传 `force=false`，新设备场景下 `localUpdated=0` 会被 v7.33.8 保护（[app-sleep.js#L362-367](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L362-L367)）再次跳过，导致 Watch 兜底也失效。

**问题 3：`saveSleepSettings` 写入缺漏 `napMinDurationMinutes`**

[app-sleep.js#L44-72](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L44-L72) 的 `cloudSettings` 没有包含 `napMinDurationMinutes`（小睡判定阈值，默认 240 分钟）。该字段从未上云，跨设备同步后被默认 240 覆盖，触发小睡/夜间睡眠判定异常。

#### 修复

1. **[app-sleep.js#L572-595](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L572-L595)**：`initSleepSettings` 的 per-device 格式分支改为「直接采用云端值 + 立即触发 `deviceSleepSettings → sleepSettingsShared` 迁移」，与 shared 分支同等对待。
2. **[app-1.js#L4511-4516](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4511-L4516)**：Watch 路径 `deviceSleepSettings` 回退 `force=false → force=true`。
3. **[app-sleep.js#L62](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L62)**：`saveSleepSettings` 的 `cloudSettings` 补全 `napMinDurationMinutes` 字段。

#### 验证

- A 设备改几个非默认参数（如 `plannedBedtime`、`targetDurationMinutes`、`napReward`）
- B 设备首次登录（清空 localStorage）
- B 设备应立即显示 A 设备的配置，不显示默认值
- Console 应出现 `[initSleepSettings] 全新安装 + per-device 格式，采用云端 deviceSleepSettings 并触发 shared 迁移`

#### 影响范围

仅 `app-sleep.js`（initSleepSettings / saveSleepSettings）和 `app-1.js`（Watch 监听回调），不影响数据层和计费逻辑。

---

## v9.17.6 (2026-07-03)

### ✨ 简化设置页：失败队列迁移 + 删除全局开关 + 保活权限集中

#### 改动总览

| 区域 | 类型 | 说明 |
|------|------|------|
| `index.html` 设置页"数据同步"分组 | 删除 | 「📋 失败队列」按钮 + badge 自动刷新 script |
| `index.html` 监听状态详情页 | 新增 | 「📋 失败队列」按钮（位于"🔄 重启应用"旁） |
| `index.html` 设置页"通知设置"分组 | 删除 | 整段「悬浮窗计时器」开关 + 问号说明按钮 + 整段「应用保活服务」开关 |
| `index.html` 设置页"权限管理"分组 | 新增 | 「应用保活」权限项（`data-permission-key="keep-alive"`） |
| `index.html` 首页右上角 | 删除 | earn + spend 两个 tab 的 `<button class="btn-restart-app">🔄</button>` |
| `js/app-1.js` `notificationSettings` | 删除 | `floatingTimer: true` 字段 |
| `js/app-2.js` 启动悬浮窗 | 简化 | 删除 `notificationSettings.floatingTimer !== false` 判定 |
| `js/app-reports.js` 设置页逻辑 | 删除 | `toggleFloatingTimer()` 函数 + `toggleKeepAliveService()` 函数 + `updateNotificationSettingsUI` 中相关分支 |
| `js/app-reports.js` 权限管理 | 新增 | `toggleKeepAlivePermission()` 函数 + `updatePermissionStatusUI` 中保活服务状态分支 |
| `js/app-auth.js` | 不变 | 失败队列 UI 函数（`showFailedMutations` / `retryFailedMutation` / `discardFailedMutation` / `clearAllFailedMutations`）全部保留，仅入口位置变化 |

#### 设计决策

1. **失败队列入口迁移**：保留所有 `MutationFailureHandler` / `showFailedMutations` 等核心函数（仍在 `app-auth.js`），仅迁移入口。理由：失败队列 99% 场景由用户从"红色失败状态"自然点入，详情页是必经路径；设置页是低频路径，入口价值低。

2. **悬浮窗全局开关彻底删除**：用户决定"彻底删除全局变量"——`notificationSettings.floatingTimer` 字段直接移除，`!== false` 判定全部清理。`floatingTimerPermissionPrompted` 字段保留（控制首次权限提示弹窗，仍需要）。任务级别 `task.enableFloatingTimer` 完全保留。

3. **保活服务作为"权限项"而非"通知设置项"**：放在权限管理而非通知设置的理由是——保活服务的本质是"是否在系统层常驻"（与开机自启/电池优化是同一类），用户更容易理解为权限而非通知偏好。

4. **重启按钮从首页移除但保留在详情页**：首页右上角只保留"状态信号"（颜色 + 文字），不再有"动作按钮"。需要重启时必须先意识到"状态不对 → 进入详情 → 看到重启按钮"，减少误触。

#### 风险评估

- **失败队列**：核心函数和存储完全保留，仅 UI 入口变化 → 零风险
- **悬浮窗全局开关**：原有"全局关闭"用户（少数）会变成"所有任务都开"——这是用户明确选择的"彻底删除全局变量"权衡
- **保活服务**：`Android.toggleKeepAliveService` 桥接完全保留，只是 UI 入口位置变化 → 零风险
- **重启按钮**：详情页（`watchDiagnosticsModal`）中"🔄 重启应用"按钮完全保留 → 零风险
- **首页布局**：CSS 上原 `gap: 6px` flex 容器，删除按钮后 sync-status 自动靠左；显式添加 `justify-content: flex-end` 确保靠右

## v9.17.3 (2026-07-02)

### 🐛 补录弹窗不自动关闭 + 任务卡片状态更新延迟

#### 现象
1. 点击补录按钮 → 提交补录表单后，补录弹窗**偶尔不会自动关闭**，必须手动点关闭按钮
2. 任务卡片更新状态（完成次数、最近使用排序、习惯连胜）**有较明显延迟**，用户感觉"补录了但卡片没反应"

#### 根因

**问题 1：try/finally 包裹范围不足**

[saveBackdate 函数](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6494-L6805) 内的 `try/finally`（v8.2.9 引入）注释声称"整个处理逻辑"都被包裹以保证弹窗一定关闭，但**实际只包裹了 `await saveLocalCache()`**。以下同步逻辑都不在保护内：

- 6557-6745 行的 `for` 循环（含 `addTransaction` 调用）
- 6737 行的 `DAL.saveTask(task)` 调用
- 6751-6762 行的 `rebuildHabitStreak(task)` 及连胜重建

一旦循环或上述同步逻辑因 task 为空、habitDetails 类型异常等原因**同步抛错**，`hideBackdateModal()` 不会被执行 → 弹窗卡住不关。

**问题 2：补录流程中 task 字段分散在多个时序写入云端 + Watch update 直接覆盖**

对照 [app-1.js:4225-4264](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4225-L4264) 的 task watch update 事件处理：

```js
} else if (change.dataType === 'update') {
    const task = doc.data;
    if (task) {
        ...
        if (idx >= 0) {
            const existing = tasks[idx];
            if (task.lastUsed !== undefined) {
                task.lastUsed = Math.max(existing.lastUsed || 0, task.lastUsed || 0);
            }
            tasks[idx] = task;  // ← 用云端 task 直接覆盖本地 task
        }
    }
}
```

云端 watch update 事件会**直接用云端 task 覆盖本地 task**，而旧实现中补录流程分散在**两个时序**：
1. 第一次 `DAL.saveTask(task)`（行 6737-6739）— 此时 `completionCount` 已 +1，但 `habitDetails` 还没被 `rebuildHabitStreak` 更新
2. `rebuildHabitStreak(task)`（行 6748）→ 内部 `syncHabitRebuildToCloud`（行 6789-6807）是 `async (() => {...})()` 自调用，**第二次** `DAL.saveTask` 在 finally 之后才异步触发

Watch 在第 1 步与第 2 步之间收到 update 事件时，会用**没有最新连胜信息的 task 覆盖本地 task** → 任务卡片连胜/状态闪烁或回退 → 用户感受到"延迟"。

另外，`saveBackdate` 循环中只更新了 `task.completionCount`（行 6711），**没有更新 `task.lastUsed`**。对比 `stopTask` 等正常完成路径都会更新 `lastUsed = Date.now()`，导致 `updateRecentTasks` 的 `sortByLastUsed` 排序位置不变，**任务卡片视觉上像是"没动"**。

#### 修复

##### 修复 1：扩大 try 范围到整个处理逻辑

将 `try {` 上移到循环开始前（[app-2.js:6556-6559](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6556-L6559)），外层 catch 手动调用 `hideBackdateModal()`。这样无论循环、`addTransaction`、`rebuildHabitStreak`、DAL.saveTask 在何处抛异常，**弹窗一定会关闭**。

##### 修复 2：补录循环中补上 `lastUsed`

[app-2.js:6707-6720](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6707-L6720) 补录 earn / spend 后都更新 `task.lastUsed = Date.now()`，对齐 `stopTask` 路径的语义，让「最近任务」按 `lastUsed` 排序位置立即刷新。

##### 修复 3：合并两次 DAL.saveTask 为一次

[app-2.js:6787-6789](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6787-L6789) 把 `DAL.saveTask(task)` 从循环末尾（行 6737-6739）挪到 `finally` 之后、通知之前——所有本地字段（`completionCount`、`lastUsed`、`habitDetails.streak`）都更新完毕后才**一次性**写入云端。Watch 只会回传**一次** update 事件，且携带最新所有字段。

##### 修复 4：task watch update 增加字段保护

[app-1.js:4225-4264](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L4225-L4264) 在用云端 task 覆盖本地 task 之前，对关键字段做"取较大值 / 保留较新"保护：

- `lastUsed`：取较大值（原已有）
- `completionCount`：取较大值（本次新增）
- `habitDetails.streak`：取较大值（本次新增）
- `habitDetails.lastCompletionDate`：保留较新的时间戳（本次新增）
- 若云端快照缺某字段（如 habitDetails），回退到本地值（本次新增）

这样即使云端 watch 事件携带的是旧快照，**本地刚刚 rebuildHabitStreak 的结果也不会被覆盖**。

#### 变更文件

| 文件 | 变更 |
|------|------|
| `android_project/app/src/main/assets/www/js/app-2.js` | `saveBackdate` 函数：扩大 try/finally 范围；循环中补 `lastUsed`；合并 `DAL.saveTask` 到 finally 之后 |
| `android_project/app/src/main/assets/www/js/app-1.js` | task watch update 事件：`completionCount` / `habitDetails.streak` / `habitDetails.lastCompletionDate` 字段保护 |

#### 兼容性
- **触发频率**：所有补录提交都会走新逻辑（高频场景）
- **回归范围**：
  - 老数据无 `taskMultiplierAtCreate` 字段 → 仍走 `??` 兜底，行为不变
  - `lastUsed` / `completionCount` 取较大值保护 → 单设备使用场景无影响（本地和云端一致）
  - 多设备场景：避免本地新值被云端旧值覆盖，体验改善
- **不涉及云函数 / 数据库 schema 变更**

#### 验证方法
- 补录弹窗提交后应**立即关闭**（包括触发 dailyLimit 等错误路径）
- 任务卡片「最近使用」排序在补录后**应立即**跳到顶部
- 习惯任务补录后，**连胜数字**应一致（无闪烁/回退）
- 多设备场景：另一台设备打开后也应看到一致的 task 状态

---

## v9.17.1 (2026-06-28)

### 🐛 任务卡片背景图：+x 标签 absolute 定位被覆盖

#### 现象
当一个任务卡片同时满足以下两个条件时，「+x」折叠/展开标签显示异常：

1. 该任务卡片被设置了背景图（即 `.task-card.has-bg`）
2. 该卡片处于分类显示中的"最后一张可见卡片"位置，且分类总任务数 > 显示上限（即存在 `+x` 折叠）

未设置背景图的同类卡片「+x」标签正常固定在卡片右下角；设置背景图后，标签脱离右下角、出现在底部居中位置，且失去了圆角"胶囊"视觉。

#### 根因
v9.14.0 引入任务卡片自定义背景图时，添加了如下通用规则（`css/main.css` L1799）：

```css
.task-card.has-bg > *:not(.task-card-bg) { position: relative; z-index: 3; }
```

这条规则的目的是把所有"非背景层"的子元素（标题、状态、按钮等）抬高到背景层之上。但选择器范围太宽，把 `.task-expand-tag` 也包括进去了——而 `.task-expand-tag` 在 `css/main.css` L5392 定义：

```css
.task-expand-tag {
    position: absolute;
    right: 0;
    bottom: 0;
    /* ... */
}
```

选择器 `.task-card.has-bg > *` 的优先级（0,2,1）高于 `.task-expand-tag`（0,1,0），所以 `position: absolute` 被覆盖为 `position: relative`，导致 `right: 0; bottom: 0;` 失效，标签从"右下角锚定"变成"普通文档流元素"。

#### 修复
在 `css/main.css` 第 1800 行后追加一条更精确的恢复规则：

```css
/* [v9.17.1-fix] 恢复 .task-expand-tag 绝对定位：上方通用规则会把它覆盖为 relative，导致 +x 标签脱离右下角 */
.task-card.has-bg .task-expand-tag { position: absolute; }
```

新规则选择器（0,2,1）与原冲突规则优先级相同，但因为在 CSS 中后定义所以胜出（CSS 后定义优先）。这样 `.task-expand-tag` 的 `position: absolute` 重新生效，`right: 0; bottom: 0;` 锚定回卡片右下角，与无背景卡片视觉一致。

#### 为什么不用 `:not(.task-expand-tag)` 排除
理论上可以改成：

```css
.task-card.has-bg > *:not(.task-card-bg):not(.task-expand-tag) { position: relative; z-index: 3; }
```

但这种"白名单"风格的选择器脆弱——以后新加一个本身需要 `position: absolute` 的子元素，又会被这条规则覆盖。本次的"恢复规则"显式表达意图（让 `.task-expand-tag` 在 `.has-bg` 下保持 absolute），对未来扩展更友好。

#### 回归覆盖范围
| 元素 | `.has-bg` 下行为 | 影响 |
|------|------------------|------|
| `.task-row`（标题/状态/参数/操作行） | `position: relative; z-index: 3` | 正常（位于背景层之上） |
| `.task-card-menu`（菜单） | `z-index: 4` | 正常（菜单在更上层） |
| `.task-expand-tag`（+x 标签） | `position: absolute; z-index: 10` | **本次修复**（恢复右下角定位） |
| `.task-card-bg`（背景层） | 不被通用规则影响 | 正常 |

#### 变更文件
| 文件 | 变更 |
|------|------|
| `android_project/app/src/main/assets/www/css/main.css` | L1800 后追加 `.task-card.has-bg .task-expand-tag { position: absolute; }` |

## v9.17.0 (2026-06-28)

### 🎨 任务卡片 AI 生图（MiniMax image-01，3:2 比例）

#### 背景
v9.14.0 已经埋好了任务卡片背景图的 CSS 框架（`.task-card.has-bg` + `.task-card-bg-blur` + `.task-card-bg-clear` + `.task-card-bg-overlay`）和数据字段（`task.backgroundImage`），但只支持用户从 Android 原生相册选图。本次升级：
- **新增 AI 生图路径**（MiniMax `image-01` 模型，前端直连，复用已配置的 `API_KEYS.minimax`）
- **PWA/Web 端上传补全**（之前只能在 Android 端选图，浏览器端点击会提示"请在 Android 端使用"）
- **区块改名**："自定义卡片背景" → "任务卡片背景"

#### 新增/修改清单

| 改动 | 位置 | 说明 |
|------|------|------|
| **新增 `generateTaskBackgroundImage(taskName, category, options)`** | [ai-service.js:213-307](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/ai-service.js#L213-L307) | MiniMax `https://api.minimaxi.com/v1/image_generation` 端点，模型 `image-01`，3:2 比例，返回 base64。兼容外部 `abortSignal`（防误触弹窗的"取消"按钮用） |
| **新增 `generateTaskBackgroundImage()` UI 入口** | [app-2.js:3227-3290](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3227-L3290) | 用户点「✨ AI 生成」触发。流程：参数校验 → 防误触弹窗 → 调 AI → 上传云存储 → 注入预览。失败不阻塞已有 `backgroundImage` |
| **新增防误触弹窗** `showTaskBgGenModal` / `hideTaskBgGenModal` / `cancelTaskBgGen` | [app-2.js:3292-3324](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3292-L3324) | 动态创建 DOM、半透明遮罩、spinner 动画、显式"取消生图"按钮（用 AbortController 终止 fetch）。无 X 关闭按钮，避免误关 |
| **新增 `onTaskBgFileSelected()`** | [app-2.js:3326-3381](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3326-L3381) | PWA/Web 端 file input 选中后回调。FileReader 读 base64 → canvas 压缩到 512px → 与 Android 走相同的 `uploadTaskBackgroundImage()` 流程 |
| **新增 `compressImageToDataUrl()`** | [app-2.js:3383-3413](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3383-L3413) | 纯 canvas 压缩，长边 512px，jpeg 0.85 质量 |
| **改 `pickTaskBackgroundImage()`** | [app-2.js:3097-3108](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3097-L3108) | 检测 `!window.Android` 时改为触发隐藏的 `#taskBgFileInput`，而非弹 alert |
| **改 `index.html` 任务卡片背景区** | [index.html:2137-2170](file:///d:/TimeBank/android_project/app/src/main/assets/www/index.html#L2137-L2170) | 区块改名、按钮组从 2 个改为 3 个（📷 上传 / ✨ AI 生成 / 🗑️ 删除）、新增隐藏 file input |
| **新增 `.task-bg-gen-modal*` 样式** | [main.css:1800-1854](file:///d:/TimeBank/android_project/app/src/main/assets/www/css/main.css#L1800-L1854) | 防误触弹窗视觉（z-index 100000，确保浮在所有 modal 之上；亮/暗主题适配） |

#### 关键技术细节

1. **prompt 设计**（避免版权与可识别风险）
   ```
   时间管理应用的任务卡片背景图，主题灵感：{taskName}，分类：{category}。
   要求：抽象水彩/印象派艺术风格，色调温暖柔和，主体居中偏虚，
         无任何文字，无人物特写，无可识别人物，背景简洁干净，3:2 横向比例。
   ```
   - 强制"无文字 / 无人特写"避免误生成敏感内容
   - 风格统一为抽象艺术，保持应用整体视觉调性

2. **MiniMax 响应结构兼容**
   公开 API 文档返回结构在不同版本中略有差异，代码兼容以下 4 种：
   - `data.data.image_base64[0]`
   - `data.data.image`
   - `data.image_base64[0]`
   - `data.image`
   取第一个非空且长度 > 100 字符（base64 实际数据特征）的字段。

3. **AbortController 跨层传递**
   - `AI_ASSISTANT_SERVICE.generateTaskBackgroundImage` 内部创建 `AbortController`
   - 兼容外部 `options.abortSignal`：若外部已 abort，立即 abort；否则监听外部 abort 事件 → 触发内部 abort
   - 90 秒超时保护（MiniMax 平均 5-15 秒，兜底 90 秒够用）
   - `fetch` 的 `signal` + `setTimeout` 双保险

4. **存储降级链**
   - 已登录：AI 生图 → base64 → `uploadTaskBackgroundImage()` → 云存储 URL → 存 `task.backgroundImage`
   - 未登录：AI 生图 → base64 → 直接存 `task.backgroundImage`（本地 base64 形式）
   - 云端上传失败：fallback 到本地 base64，toast 提示用户

5. **PWA 端 file input 与 Android 原生相册的复用**
   - 两者都通过 `onTaskBgFileSelected()` / `__onTaskBackgroundImagePicked` 最终调用同一个 `uploadTaskBackgroundImage()`
   - 复用 v9.14.0 的 `tbMutation` 云函数 `uploadTaskBackgroundImage` action，**云函数零改动**

#### 性能与边界

- **首次生图**：约 5-15 秒（MiniMax 冷启动 + 模型推理 + base64 编码）
- **重复生图**：约 3-8 秒（无冷启动）
- **云存储上传**：约 1-3 秒（取决于图片大小，压缩后约 50-200KB）
- **失败重试**：用户可重新点「✨ AI 生成」按钮，无需刷新页面
- **并发控制**：通过 `__taskBgGenAbortController` 单例，防止用户连续点击触发多次

#### 风险与回退

- **API key 暴露**：`API_KEYS.minimax` 已是前端明文（v9.16.0 起），与 Kimi 同等待遇
- **生成失败**：toast 提示，**不影响**用户当前已设置的 `backgroundImage`
- **PWA 端 canvas 污染**：若图片跨域，canvas.toDataURL 会抛 SecurityError——`compressImageToDataUrl` 已 try-catch 兜底，失败时使用原 dataUrl

### 🩹 v9.17.0-fix：AI 生图 prompt 优化（LLM 提取 + 生图两步）

#### 问题
初版实现只用任务名 + 分类作为 prompt，用户反馈"图片和任务几乎没有任何关系"。根因：
- **任务名往往很短很泛**（"阅读"、"冥想"、"运动"），单凭这些词生图模型只能生成泛泛的"书架+书桌"等套图
- **任务有更丰富的信息未利用**：备注（用户写具体内容的关键字段）、颜色（主题色）、类型（earn/spend）
- **生图模型对语义理解有限**：直接给它"阅读"它不知道是读《三体》还是经济学

#### 修复
**两步走**：先用 LLM (MiniMax M3 文字) 把任务信息"翻译"成 80-150 字中文视觉描述，再用视觉描述喂给生图模型 (MiniMax image-01)。

**信息源**：
| 字段 | 来源 | 作用 |
|------|------|------|
| `name` | 任务名 input | 必填，主题来源 |
| `note` | 备注 textarea | **关键**：用户写的具体内容（"读《三体》第三章"） |
| `category` | 分类 input | 主题分类 |
| `colorHex` | `currentEditingTask.color` 或 `getCategoryColorSafe(category)` | 主题色（HEX） |
| `type` | `currentEditingTask.type` | 任务类型（reward / instant_redeem / continuous / continuous_target / continuous_redeem） |

**LLM prompt 关键设计**：
- 角色：你是一个资深视觉设计师
- 要求 80-150 字中文描述
- 4 个维度：具体视觉意象、色调、光线、情绪基调
- 强调："如果有备注，请重点体现备注里的具体内容"
- 输出限制：只输出描述本身，不要任何 Markdown 符号

**生图 prompt 结构**：
```
[LLM 生成的 80-150 字视觉描述]

【风格与构图要求】
- 抽象水彩/印象派艺术风格
- 3:2 横向比例
- ...
```

#### 改动清单
| 改动 | 位置 | 说明 |
|------|------|------|
| **新增 `analyzeTaskForVisual(taskInfo)`** | [ai-service.js:213-260](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/ai-service.js#L213-L260) | 调 MiniMax M3 文字，输出 80-150 字中文视觉描述 |
| **重构 `generateTaskBackgroundImage(taskInfo, options)`** | [ai-service.js:262-378](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/ai-service.js#L262-L378) | 接收 `taskInfo: {name, note, category, colorHex, type}` 对象，**先调 LLM → 再生图**。新增 `options.onProgress` 回调。LLM 失败时 fallback 到简单 prompt |
| **改 UI 函数 `generateTaskBackgroundImage()`** | [app-2.js:3239-3326](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3239-L3326) | 从 `currentEditingTask` 提取 note/color/type，调用新签名 |
| **改防误触弹窗** | [app-2.js:3328-3363](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3328-L3363) | 新增"阶段文字"显示（"正在分析任务信息..." → "正在生成背景图..."） |
| **新增 `updateTaskBgGenStage()`** | [app-2.js:3360-3363](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L3360-L3363) | 由 `onProgress` 回调触发 |
| **改 CSS 弹窗样式** | [main.css:1847-1858](file:///d:/TimeBank/android_project/app/src/main/assets/www/css/main.css#L1847-L1858) | `.task-bg-gen-stage`（蓝色加粗主文字）+ `.task-bg-gen-tips`（灰色小字提示） |

#### 性能影响
- **总耗时**：7-20 秒（LLM 2-5 秒 + 生图 5-15 秒）—— 比初版多 2-5 秒
- **相关性**：用户报告"和任务无关"的问题应解决（待用户实测）
- **降级**：LLM 失败时 fallback 到简单 prompt，至少保证能出图

#### 风险
- **LLM 拒绝/幻觉**：罕见，但若 LLM 输出的视觉描述质量差，生图也会差。可在控制台日志里看 `visualDescription` 字段调试
- **总超时**：LLM 30s + 生图 90s ≈ 120s 上限。任一阶段失败立即抛错

### 🩹 v9.17.0-fix 续：任务卡片背景图性能分层（解决 CSS blur 渲染开销）

#### 问题
v9.14.0 引入的 `.task-card-bg-blur` 使用 `filter: blur(18px)`，在 200+ 任务卡片同时渲染时：
- **中低端 Android 机滚动掉帧**（GPU 不够，blur 滤镜每帧重算合成）
- **WebView 内存压力**（每张 blur 层都是独立合成层）

#### 修复：设备性能分层 + 渲染层数差异化

**性能检测**（`app-1.js:23-60`）：
```js
window.__perfTier = (navigator.hardwareConcurrency <= 4 && 
                     navigator.deviceMemory <= 4 && 
                     isMobile) ? 'low' : 'mid' / 'high'
```

| 分层 | 触发条件 | 渲染策略 | 视觉效果 |
|------|---------|---------|---------|
| **high** | 桌面/高端机 | 3 层 + `blur(18px)` | 完整（v9.14.0 现状） |
| **mid**  | 移动 + (低核心 **或** 低内存) | 3 层 + `blur(10px)` | 氛围感保留，弱化 |
| **low**  | 移动 + 低核心 + 低内存 | **2 层（跳过 blur）** | 中心清晰 + mask 渐隐边缘 |

#### 关键设计

1. **低端机不渲染 blur 层**（最大优化）
   - JS 端 `renderTaskCards` 根据 `window.__perfTier` 决定是否输出 `.task-card-bg-blur` div
   - 低端机 DOM 直接少 1 层，省去 GPU 合成开销
   - 视觉效果：中心清晰 + mask 渐隐边缘（CSS mask 不用 filter，纯 GPU 渐变）

2. **中端机弱化 blur 半径**（10px vs 18px）
   - CSS 媒体查询 `body[data-perf="mid"] .task-card-bg-blur`
   - 渲染量减少约 70%（blur 半径线性相关）

3. **GPU 提升**（中高端机）
   - `.task-card-bg-blur` 加 `will-change: transform, opacity`
   - 提示浏览器提前提升为合成层，避免运行时切换

4. **低端机 mask 加强**
   - `body[data-perf="low"] .task-card-bg-clear` mask 渐变更柔（避免边缘生硬）
   - 无 blur 时用 4 段 mask（100% → 85% → 40% → 0%）替代原 3 段（100% → 100% → 0%）

#### 改动清单
| 改动 | 位置 | 说明 |
|------|------|------|
| **新增性能检测 IIFE** | [app-1.js:22-60](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L22-L60) | 早于 DOMContentLoaded 执行，结果存 `window.__perfTier` + `body[data-perf]` |
| **改 `renderTaskCards`** | [app-2.js:1681-1690](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L1681-L1690) | 根据 `_perfTier` 决定是否输出 blur 层（low 跳过） |
| **改 CSS** | [main.css:1741-1783](file:///d:/TimeBank/android_project/app/src/main/assets/www/css/main.css#L1741-L1783) | `will-change` + low/mid 媒体查询 + 增强 mask |

#### 预期收益
- **低端机滚动 60fps**：少 1 层 GPU 合成 + 弱化 mask
- **中端机滚动 60fps**：blur 半径减半，GPU 压力降 70%
- **高端机无感**：保持 v9.14.0 完整视觉

#### 风险
- **navigator.deviceMemory** 部分浏览器（特别是旧版 Android WebView）不支持，会回退到 4GB 默认 → 误判为 low
- **降级不可逆**：用户当前会话固定一个 tier，刷新页面才能重新检测
- **视觉效果差异**：low 模式没有"中心向四周模糊渐变"效果，改为"中心清晰 + 边缘渐隐"（仍美观但风格不同）

## v9.15.3 (2026-06-27)

### 🛡️ 冷启动鉴权根治——`if(state)` 分支的 token 健康度探测 + 自动重登录

#### 根因（v9.15.2 修复的真正漏洞）

v9.15.2 修了一个 bug：**[app-1.js:438-449](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L438-L449)** 的 `waitForCloudBase` 回调中，`if (state)` 分支**永远不调 `tryAutoReLogin()`**——它假设"既然 `auth.getLoginState()` 返回 truthy，token 就是有效的"。

**但这个假设是错的**。CloudBase SDK 的 `auth.getLoginState()` 用 SDK 内部缓存判断登录态，**不主动探测 token 实际有效性**。设备关机后冷启动时：
- SDK 内存里的 `access_token` 已过期（refresh_token 也可能过期）
- `auth.getLoginState()` 仍返回 `{ user: {uid: 'xxx'} }`
- 但实际数据库请求的 token 是过期的 → 401
- `auth.hasLoginState()` 也返回 true

→ `if (state)` 分支走"已登录"路径 → **永不调 `tryAutoReLogin()`** → token 永远刷不了 → 弹"数据加载失败: credentials not found"

v9.15.2 的 15s 启动协调超时是另一回事——它解决的是"两条路径并发撞 token"的时序问题，**但没有解决"token 真正失效"的根本问题**。所以 `bug反馈.txt` 显示 v9.15.2 升级后，**设备关机后第一次启动几乎必定出现**这个错误。

#### 修复策略

| 修复点 | 位置 | 作用 |
|--------|------|------|
| **Fix 1**：已登录路径加 token 健康度探测 + 自动重登录 | [app-1.js:443-468](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L443-L468) | `if (state)` 分支在 resolve 协调 promise 前，先调 `ensureDatabaseAuthReady(3, 300)` 轻量探测（3 次 × 300ms × 2 轮 ≈ 1.8s 总探测）。**若探测失败**，自动调 `tryAutoReLogin()` 通过 `signInWithPassword` 刷新 token |
| **Fix 2**：initApp catch 块兜底增强 | [app-1.js:6507-6520](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6507-L6520) | 抓到 `unauthenticated` 错误时，先调 `tryAutoReLogin()` 刷新 token，再重试 `handlePostLoginDataInit`——双保险 |

#### 性能与边界

- **token 健康时**：探测成功，零额外网络开销（只是 1 次 `tb_profile.limit(1).get()`）
- **token 失效 + 有自动登录凭据**：`tryAutoReLogin` 成功 → 新 token 注入 → initApp 继续（多 ~2s 启动时间）
- **token 失效 + 无自动登录凭据**：`tryAutoReLogin` 立即返回 false（无网络调用），原错误处理流程继续

#### 实测验证

- 冷启动 + 4490+ 笔交易账户 → 数据加载顺利（`__dataLoaded=true`），**无 `unauthenticated` 错误**
- `[Auth] 数据库鉴权探测成功` —— 探测通过，token 健康
- 没有增加 4490 笔交易加载的总时间（在健康路径下探测只跑 1 次就过）

## v9.15.2 (2026-06-26)

<h4>冷启动鉴权修复——启动协调 promise</h4>

### 🛡️ 根因：两条数据加载路径在冷启动时撞 token
- **问题**：v9.14.1 / v9.15.1 的"探测 + 重试"治标不治本。真正的根因是启动时存在两条并行的数据加载路径：
  - 路径 A：`app-auth.js` `DOMContentLoaded` 处理器 → `initApp()` → `DAL.loadAll()`（[app-auth.js:3053-3055](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-auth.js#L3053-L3055)）
  - 路径 B：`app-1.js` `waitForCloudBase` 回调 → `tryAutoReLogin()` → `signInWithPassword` → `DAL.loadAll()`（[app-1.js:434-453](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L434-L453)）
  - 冷启动时，路径 A 用 localStorage 里缓存的旧 session 拿到 UID，紧接着发 `db.collection().get()`；与此同时路径 B 调 `signInWithPassword` 让 SDK 内部刷新 access token。**新 token 注入的瞬间，路径 A 携带的旧 token 被服务端拒绝** → `unauthenticated / credentials not found`。
- **证据**：v9.15.2 注释（[app-1.js:1022-1026](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1022-L1026)）已经声明了 `__startupReloginDone` / `__startupReloginResolve` / `__startupReloginPromise` 三个协调变量，注释也准确描述了"避免 signInWithPassword 导致 credentials not found"，但**全文 0 引用**——v9.15.2 当初只打了桩，没有接线。

### ⚙️ 修复：把协调 promise 真正接上
- **修改 1**（[app-1.js:442-457](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L442-L457)，`waitForCloudBase` 回调）：
  - 在 `tryAutoReLogin()` 完成后（无论成功失败），调用 `__startupReloginResolve('relogin-done')` 通知 `initApp`。
  - 配套把 `__startupReloginDone = true`，并把 `__startupReloginResolve` 置 null（避免重复 resolve）。
- **修改 2**（[app-1.js:533-548](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L533-L548)，`tryAutoReLogin` 成功路径）：
  - `signInWithPassword` 返回后先做一次 4 次/300ms 的 `ensureDatabaseAuthReady()` 探测——确保新 token 在数据库请求链路里真正就绪再放行 `initApp`。探测失败也不阻塞。
  - 然后再 resolve `__startupReloginPromise` 并置 `__startupReloginDone = true`。
- **修改 3**（[app-1.js:580-586](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L580-L586)，`tryAutoReLogin` 失败路径）：
  - 失败也必须 resolve（幂等），否则 `initApp` 永远等不到 → 用户看到白屏。清除错误凭据后再 resolve。
- **修改 4**（[app-1.js:6434-6450](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L6434-L6450)，`initApp` 数据加载前置门）：
  - `await Promise.race([__startupReloginPromise, 15s 超时])`——强制 `initApp` 等待 relogin 完成后才进入数据加载。
  - 15s 上限是冷启动最坏情况（离线 + 慢网络 + relogin 挂起）的兜底，绝不卡死用户。
  - 等待完成后，才继续走原有的 `ensureDatabaseAuthReady()` + `handlePostLoginDataInit('initApp')` 流程。

### 🔍 不影响以下场景
- **未登录用户**：没有自动登录凭据的设备上 `tryAutoReLogin` 立即失败 → 立即 resolve → `initApp` 几乎无延迟继续。
- **登录状态已恢复的设备**：路径 B 走 `if (state)` 分支，不会触发 `tryAutoReLogin`；`__startupReloginPromise` 在路径 A `await` 时已经是 resolved 状态（因为 v9.15.2 之前的代码从未 resolve 过它，导致它永远 pending——这个 bug 也顺手修了）。
- **v9.14.1 / v9.15.1 探测逻辑**：保留，作为双保险（极端情况 token 注入晚于协调 resolve）。

### 📌 业务影响
- 彻底消除"冷启动时第一次打开应用必报 unauthenticated 错误"现象。
- 多端一致：安卓 / PWA 共用同一份 `app-1.js`，行为一致。
- 不影响后续开发：`__startupReloginPromise` 是一次性协调（启动后即 resolved），不参与运行时逻辑。

### 📌 任务倍率变更后历史补录的"反推时长"修复
- **问题**：`parseTransactionDescription` 内部的 `buildBackdateDetail` 函数（[app-reports.js:935-981](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L935-L981)）和"完成习惯/任务"分支的兜底逻辑（[app-reports.js:1371-1392](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L1371-L1392)）都用 **当前** `task.multiplier` 反推"实际时长 = baseSeconds / taskMult"。
  - 当用户对连续计时类任务（`continuous` / `continuous_target` / `continuous_redeem`）进行手动补录后修改了任务倍率，历史页列表详情会被静默改写：
    - 例：补录"晨跑 1小时 ×2"→ `transaction.amount = 7200s`、description 文本含"1小时 ×2"
    - 改任务倍率为 3 → 显示从"1小时 ×2"变成"40分 ×3"
    - 金额、余额、日历聚合都正确（用 `transaction.amount`），只有列表详情行被"篡改"
- **修复**（方案 A：新增 `taskMultiplierAtCreate` 字段）：
  - **修改 1**（[app-2.js:6346-6365](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L6346-L6365)，`saveBackdate` 交易创建）：
    - 在 `addTransaction({...})` 内增加 `taskMultiplierAtCreate: task.multiplier` 字段。对 `reward` / `instant_redeem` 等无倍率任务，字段值为 `undefined`（无副作用）。
  - **修改 2**（[app-reports.js:949-967](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L949-L967)，`buildBackdateDetail`）：
    - `const taskMult = task.multiplier || 1;` → `const taskMult = trans.taskMultiplierAtCreate ?? task.multiplier ?? 1;`
    - 优先用补录时记录的倍率，缺失时回退到当前倍率（保留旧行为）。
  - **修改 3**（[app-reports.js:1375-1392](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L1375-L1392)，"完成习惯/任务"兜底分支）：
    - 同样的优先级调整。
- **数据迁移**：无。`??` 兜底确保旧交易行为完全不变，新交易从现在起永远正确。
- **影响范围**：仅影响手动补录 + 连续计时类任务 + 倍率修改过的 3 条件同时满足的边角场景。普通完成、自动补录、习惯奖励等路径均无影响（它们的展示逻辑不走 `buildBackdateDetail`）。
- **业务效果**：用户的"历史不被改写"——补录当时是多少就是多少。

### 📱 屏幕时间超限 1.2 倍惩罚（v9.15.2 终版）
- **背景**：旧版屏幕时间超限时线性扣费（如超 6 小时扣 6 小时），力度偏弱；任务系统已有"负余额 1.2 倍惩罚"先例，逻辑上需要让屏幕时间超限也有同等负反馈。
- **设计决策**（按用户批示）：
  - **触发条件默认**：硬编码常量 `1.2`，不开放用户配置。
  - **可叠加**：与其他倍率独立叠加。当前屏幕时间消费路径上的倍率只有本惩罚本身；但设计原则是"如果以后引入其他倍率（如负余额惩罚）会叠加"。
  - **与均衡倍率互不影响**：均衡倍率（[app-systems.js:2804](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2804)）只在 `isReward===true` 路径生效；超限惩罚只在 `isReward===false` 路径生效。**永远不会作用于同一笔交易**。
- **修改 1**（[app-systems.js:2808-2820](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2808-L2820)，`autoSettleScreenTime` 启动时自动结算）：
  - 在 `balanceAdjust` 块之后添加 `overLimitPenalty` 块。
  - `!isReward` 时按 `Math.floor(absAmount * 1.2)` 计算新金额，记录 `{ multiplier: 1.2, originalAmount: diffSeconds }`。
- **修改 2**（[app-systems.js:2862-2864](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2862-L2864)）：将 `overLimitPenalty` 写入 `screenTimeData` 便于历史回看。
- **修改 3**（[app-systems.js:4109-4116](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4109-L4116) + [app-systems.js:4128-4133](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4128-L4133) + [app-systems.js:4154-4156](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4154-L4156)，`addManualScreenTimeRecord` 手动记录）：
  - 与自动结算路径完全一致的 3 处修改。
- **修改 4**（[app-reports.js:1035-1058](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L1035-L1058)，屏幕时间描述解析）：
  - 兼容"屏幕时间"和"屏幕时间(手动)"两种前缀。
  - 新增 `penaltyMatch = /[×x]([\d.]+)\s*\(超限惩罚\)/`，命中后追加 `coloredMultiplier(penaltyMatch[1], 'spend')`（红色标注）。
  - 调整索引：原 `match[1]` → `match[2]`，依此类推（因为新增了"(手动)"分组）。
- **业务效果**：
  - 用户用 7 小时 / 限额 2 小时：扣 6 小时 × 1.2 = 7 小时 12 分（原 6 小时）。
  - 描述显示"📱 屏幕时间: 7小时/2小时 (超出5小时) ×1.2 (超限惩罚)"，历史页详情用红色标注倍率。
  - 与"奖励路径"互不影响：未超限时只走均衡倍率，超限时只走超限惩罚。

### 🗑️ 删除"提前结算今日"历史遗留功能（v9.15.2 终版）
- **背景**：v5.2.0 引入的"提前结算今日"功能允许用户在当日手动锁定结果，但带来"今日后续使用不再计入"的副作用，与"实时结算"理念冲突。UI 入口早已移除，但函数本体、`updateLastSettleTimeDisplay`、`screenTimeSettings.lastSettleDate/Time` 死字段一直存在。
- **删除清单**：
  - **删除 1**（[app-systems.js:3983-4087](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L3983-L4087)）：`settleScreenTimeToday` 函数（104 行）+ `settleScreenTime` 旧名兼容别名（4 行）。函数本身没有外部调用方（grep 验证 0 引用），纯死代码。
  - **删除 2**（[app-systems.js:4644-4658](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4644-L4658)）：`updateLastSettleTimeDisplay` 函数（15 行）。它操作的 `#lastSettleTime` HTML 元素早已不存在（grep 验证），纯死代码。
  - **删除 3**（[app-systems.js:191](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L191)）：`updateLastSettleTimeDisplay()` 调用点（从 `initScreenTimeSettings` 内移除）。
  - **删除 4**（[app-sleep.js:3536-3537](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-sleep.js#L3536-L3537)）：`screenTimeSettings` 初始值中的 `lastSettleDate` / `lastSettleTime` 死字段。旧 localStorage 数据仍可能保留这两个字段，但无人再读写，会随下次保存自动清除。
- **业务影响**：
  - 屏幕时间结算只剩两条入口：启动时自动结算过去 7 天（`autoSettleScreenTime`）+ 手动记录指定日期（`addManualScreenTimeRecord`）。
  - "今日已提前结算"死文案从代码中彻底消失，避免未来误以为存在此功能。
  - 代码体积减少约 130 行（[app-systems.js](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js)），可读性提升。

### 🐛 v9.15.2 启动协调 bug 修复（实测：从 16.7s 降到 2.5s 可操作）
- **发现过程**：首次安装测试时抓取 logcat，发现 `app-1.js` 第 1049 行 `WATCH_DEGRADE_STATE_KEY` 被 v9.15.2 启动协调 patch 重复声明（`const` 不可重声明），导致整个 app-1.js 模块加载失败，app-auth.js 链式引用 `checkAndBootstrap` / `setupSwipeNavigation` 也全部报错。修复 syntax error 后，应用可以启动但数据加载延迟 15 秒。
- **第二个 bug**：v9.15.2 启动协调 `__startupReloginPromise` 在"已登录"路径下不会被 resolve（因为 `tryAutoReLogin` 只在 `!state` 分支调用），导致 `initApp` 必须等到 15s 超时才能继续加载数据。
- **修复 1**（[app-1.js:1048](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L1048)）：删除 v9.15.2 启动协调 patch 误加的重复 `const WATCH_DEGRADE_STATE_KEY`。
- **修复 2**（[app-1.js:438-447](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-1.js#L438-L447)）：在 `waitForCloudBase` 回调的 `if (state)` 分支也 resolve `__startupReloginPromise` 并置 `__startupReloginDone = true`，确保任何登录态下 `initApp` 都能立即继续。
- **实测数据**（4490 交易 / 57 任务账户）：
  | 阶段 | 修复前 | 修复后 |
  |------|--------|--------|
  | Login state restored | T+0.5s | T+0.5s |
  | initApp 启动 | T+0.5s | T+0.5s |
  | **__dataLoaded=true（数据就绪）** | **T+16.7s（被 15s 启动协调超时阻塞）** | **T+2.4s** |
  | 所有表实时监听已启动 | T+20.3s | T+19.9s |

### 📍 设备名称从描述末尾迁到任务标题末尾（v9.15.2 终版）
- **背景**：自动检测补录（`createAutoMakeup`）和自动修正（`createAutoCorrection`）原本把设备名追加在 description 末尾（如 `漏记30分 ×1.2惩罚 · 本机`），用户看历史时不易注意到。多端场景下不同设备的补录难以一眼区分。
- **修改 1**（[app-systems.js:3668-3693](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L3668-L3693) + [app-systems.js:3784-3796](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L3784-L3796)，`createAutoMakeup` / `createAutoCorrection`）：
  - 新增 `deviceSuffix`：`创建设备名` 的当前设备名（通过 `getDeviceNameById(creatingDeviceId)` 查找）。
  - `taskName` 改为 `${task.name}${deviceSuffix}`（如 `"晨跑 · 本机"`）。
  - `description` 中的标题部分同步改为 `${task.name}${deviceSuffix}`，确保从 description 解析出的 title 也带设备名。
  - 多端补录（`deviceRecords.length > 1`）时，标题额外显示 `(N端汇总)` 标记，提示这是聚合了多台设备的数据。
- **修改 2**（[app-reports.js:702-725](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L702-L725)，`buildAutoDetectDeviceDetail`）：
  - 旧逻辑：所有情况都返回 ` · ${deviceName}` 拼到描述末尾。
  - 新逻辑：单设备情况（`sourceDevices.length <= 1`）返回 `''`（设备名已在标题里），多设备情况（`sourceDevices.length > 1`）返回 ` · 来源: 设备1 X分 + 设备2 Y分`——`来源:` 前缀让用户一眼明白这是来源设备分布。
- **修改 3**（[app-reports.js:728-755](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-reports.js#L728-L755)）：**老数据兼容**——`getAutoDetectDeviceSuffix` / `appendDeviceSuffixIfMissing` 工具函数。
  - **问题**：v9.15.2 初版只改了 `createAutoMakeup` 创建的新交易。4490 条历史交易的 `description` 文本和 `taskName` 都没有"· 设备名"，在历史页打开时显示为"晨跑"（没有"· 本机"）。
  - **修复**：解析器从 `transaction.autoDetectData.deviceName` 或 `sourceDevices[0].deviceName` 重建后缀。`appendDeviceSuffixIfMissing` 包装函数检测到 title 已包含 " · "（新数据）时跳过，避免重复。
- **业务效果**：
  - 新交易：标题显示"晨跑 · 本机"，多端显示"晨跑 · 本机 (3端汇总)"，detail 显示"漏记30分 ×1.2惩罚"（单端）或"漏记30分 ×1.2惩罚 · 来源: 设备1 30分 + 设备2 15分"（多端）。
  - 旧交易：解析器自动从 `autoDetectData` 重建设备名后缀，**4490 条历史记录在升级后立即显示设备名**，无需任何数据迁移。

### 📱 屏幕时间多端区分（v9.15.2 终版）
- **背景**：每台设备都产生独立的屏幕时间交易（同一日期 2-3 条记录），但历史页只显示"节省奖励"或"超出惩罚"，无法区分是哪台设备的。
- **方案选择**：使用新字段 `taskNameDisplay`（保留旧 `taskName` 字段为"屏幕时间管理"以兼容饼图系统任务检测）。
- **修改 1**（[app-systems.js:2838-2845](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2838-L2845) + [app-systems.js:2858](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L2858) + [app-systems.js:4152-4158](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4152-L4158) + [app-systems.js:4655-4664](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-systems.js#L4655-L4664)）：
  - 3 个屏幕时间交易创建路径（`autoSettleScreenTime`、`addManualScreenTimeRecord`、补结算路径）都加 `taskNameDisplay` 字段。
  - 格式：`${systemTask.name} · ${deviceName}`（如 `"屏幕时间管理 · 本机"`）。
  - 第 3 个补结算路径同时补全了缺失的 `deviceId` 字段。
- **修改 2**（[app-2.js:990-1010](file:///d:/TimeBank/android_project/app/src/main/assets/www/js/app-2.js#L990-L1010)，`showSystemTaskHistory`）：
  - 从 `taskNameDisplay` 提取设备名后缀（如 `· 本机`），追加到 title 末尾。
  - 显示效果：`节省奖励 · 本机` / `超出惩罚 · iPhone` / `屏幕时间节省奖励 · 平板` 等。
  - **老数据兼容**（v9.15.2 第二次修订）：从 `transaction.screenTimeData.deviceId` 查设备名。`screenTimeData.deviceId` 自 v7.2.1 起就有，旧交易可重建。优先级：`taskNameDisplay`（新数据）→ `getDeviceNameById(screenTimeData.deviceId)`（老数据）→ 空（极老数据，< v7.2.1）。
- **历史数据兼容**：升级 v9.15.2 后的瞬间，4490 条交易里的所有屏幕时间记录都自动显示设备名后缀，无需任何数据迁移。
- **饼图保持不变**：仍按 `t.taskName = '屏幕时间管理'` 聚合所有设备的屏幕时间数据（总览视图），只在历史页区分设备。

---

## v9.15.1 (2026-06-24)

<h4>首次启动 unauthenticated 错误自愈 + 推荐/最近任务切换状态持久化</h4>

### 🛡️ 数据库鉴权就绪探测强化
- **问题**：v9.14.1 引入的 `ensureDatabaseAuthReady()` 探测 3 次/500ms 退避（约 1.5s 总窗口），在部分设备冷启动时仍不够——access token 注入到数据库请求链路的延迟偶尔 > 1.5s，导致 `initApp` 中 `handlePostLoginDataInit('initApp')` 抛出 `unauthenticated / credentials not found`，触发"数据加载失败"弹窗。
- **修改**（`js/app-1.js:821-852`）：
  - 单轮重试 3 → 8 次（最大 4s 等待窗口），覆盖绝大多数冷启动 token 注入场景。
  - 失败后再追加一轮 8 次探测（第 2 轮前额外等待 800ms），双层兜底（极端网络慢场景下覆盖到 8.8s 总探测窗口）。
- **修改**（`js/app-1.js:6396-6458`，initApp catch 块）：
  - `isUnauthenticatedError(e)` 检测到 unauthenticated 错误时，**不再立即弹错误**——而是等待 1.5s 后自动重试一次 `ensureDatabaseAuthReady` + `handlePostLoginDataInit('initApp-retry')`。
  - 重试成功时静默通过（仅 console.log），重试失败才弹错误弹窗。
  - 非 unauthenticated 错误（如网络断开、数据库故障）保持原行为，立即弹错误。
- **影响**：基本消除"冷启动时第一次打开应用必报 unauthenticated 错误"现象；多端（安卓 / 网页）一致。

### 💾 推荐/最近任务切换状态持久化
- **问题**：v9.15.0 引入的 `recommendMode = { earn: 'recent'|'recommend', spend: ... }` 是纯内存变量（`let` 初始化为 recent/recent），用户切换 ⇄ 按钮后只在当前会话有效，重启后回到"最近任务"模式。**应该持久化**。
- **修改**（`js/app-1.js:8270-8312`，recommendMode 初始化）：
  - 改为 lazy init，从 `localStorage.tb_recommendation_mode` 读取（同时校验 `earn` / `spend` 字段合法性，回退到 `recent`）。
  - 新增 `_persistRecommendMode()` 工具函数：切换时立即写入 localStorage。
  - 新增 `_syncRecommendModeToCloud()` 工具函数：500ms 去抖后通过 `DAL.saveProfile({ recommendMode: { earn, spend } })` 写云端 profile。
- **修改**（`js/app-1.js:8544-8558`，toggleRecommendMode）：
  - 切换时调用 `_persistRecommendMode()` + `_syncRecommendModeToCloud()`，localStorage 立即生效，云端去抖同步。
- **修改**（`js/app-1.js:4951-4969`，DAL.loadAll）：
  - 从云端 `profile.recommendMode` 读取时覆盖内存变量 + 写回 localStorage（云端优先策略，与 v9.15.0 `recommendStrength` 一致）。
  - 加载完成后调用 `_updateRecommendToggleUI('earn'/'spend')` 同步按钮视觉状态（防止云端加载晚于 initRecommendUI 时按钮仍显示默认态）。
  - 加载完成后若当前是 recommend 模式，调用 `recomputeRecommendations()` 预热推荐缓存。
- **修改**（`js/app-1.js:2745-2751`，DAL.importFromBackup）：导入备份 JSON 时包含 `recommendMode` 字段。
- **修改**（`js/app-auth.js:1165-1169`，导出备份）：导出 JSON 时包含 `recommendMode` 字段。
- **跨端行为**：
  - 同一账号 A 端选"推荐任务"，B 端登录后云端 `profile.recommendMode` 同步覆盖本地，自动呈现"推荐任务"。
  - 未登录或首次启动：从 localStorage 读取上次切换状态；登录后由云端覆盖（云端为权威）。
  - 数据迁移：v9.15.0 老用户升级后，localStorage 中 `tb_recommendation_mode` 不存在，默认 recent；用户首次切换后立即上云。

## v9.15.0 (2026-06-23)

<h4>推荐任务（Recommended Tasks）—— 智能首页任务排序</h4>
- 🆕 **新功能：推荐任务区域** —— earnTab / spendTab 顶部的"最近任务"右上角新增切换按钮（无背景无边框，复用 `view-switch-btn` 样式，参考每日详情页/时间流图的 `⇄` 切换按钮），点击在"最近任务"与"推荐任务"两种视图间切换。section-title 文字随之变化（"最近任务" ↔ "推荐任务"），切换按钮在"推荐任务"模式下显示 `.recommend-active` 激活态。
- 🧠 **五维度加权打分算法**（w1-w5 全部启用）：
  - **w1 时段匹配**：每个任务预聚合过去 30 天的 24 小时完成次数桶（Map<taskId, number[24]>，在 `recomputeRecommendations` 内按小时跨边界时增量重建），用高斯核（σ=1.5）对当前小时 ±1h 加权求和，归一化到 [0,1]；新任务无历史时退化为 0.5 中性分。
  - **w2 习惯紧迫度**：`isHabit && 今日未完成` → 1.0（streak≥1）/ 0.7（streak=0）；daily 习惯在 22:00 后仍未完成 → ×1.2 即将断档加权。
  - **w3 最近使用衰减**：`exp(-Δt_min / 360)`，τ=6h=360min。
  - **w4 类别平衡（乘子）**：`currentBalance < 0` → earn 任务 ×1.5；`> 0` → spend 任务 ×1.2；`= 0` → ×1。
  - **w5 提醒命中（离散加分）**：当前本地时间在 `reminderDetails.time` 区间内（支持 `08:00-12:00` 区间和 `22:00-06:00` 跨夜区间，单点时间 ±30 分钟窗口）→ +1。
  - **总分**：`finalScore = w1 + w2 + w3` 作为基础（0-3.2 区间），乘以 w4 乘子，加 w5 离散加分。
- ⚙️ **强度滑杆混合公式**：设 `α = intensity/100`，`finalScore = α·algo + (1-α)·lastUsedRank`，其中 `lastUsedRank = 1 - rank/N`（按 lastUsed 倒序排，rank 越靠前分数越高）。`α=0` 退化为纯 lastUsed 排序（与最近任务一致），`α=100` 完全使用算法。默认强度 70。
- 🛡️ **A4 严格不降级**：算法输出为空（候选池无任务 / 历史数据缺失等）时显示 `recommend-empty-card` 空状态卡，含 `💡 暂无推荐任务` 与 `点击切换为最近任务` 提示；整卡可点击，触发 `toggleRecommendMode` 切回"最近任务"模式。**不**自动降级到最近任务（按用户明确要求）。
- 🔄 **重算时机**（用户体验最优）：`initApp` 末尾预热 + `switchTab` 切到 earn/spend 时 + `visibilitychange → visible` 时 + `updateRecentTasks` 调用时（缓存命中直接返回）+ 数据写入（`addTransaction` / 任务 CRUD）后 + 60 分钟兜底定时器。时段直方图仅在小时跨边界时重建（O(transactions) ≈ 4000+），分数计算每次 O(tasks) ≈ 50 项 < 1ms。
- 🌐 **跨端同步**：算法纯客户端（无需云端），所有平台跑同一份 JS 算同一份结果；推荐强度存到 `tb_profile.recommendStrength` 字段，走 `DAL.saveProfile` 链路，登录后多设备自动同步；本地 `localStorage.tb_recommendation_strength` 作为离线缓存；数据导入/导出 JSON 包含此字段。
- 🎚️ **设置页新增"推荐功能"区**：包含 0-100 强度滑杆（实时写 localStorage + 云端）+ 文字说明。位置：通知设置区上方。
- 🪟 **运行中任务硬置顶**：与最近任务行为一致，运行中任务按 startTime 升序排在最前面。
- ⚠️ **冷启动行为**：新用户/数据孤儿用户也能获得推荐（w1 退化 0.5 + w2/w3/w4 仍生效），不显示"暂无推荐"。

## v9.14.2 (2026-06-23)

<h4>分类排序重构（云端统一 + 本设备独立开关） + 利息功能清理</h4>
- ☁️ **分类排序迁移到云端统一字段**：原 `deviceSpecificData[*].categoryOrder`（设备级，云端仅做同步）改为 `profile.categoryOrderCloud`（云端统一字段），所有设备共享同一份顺序。`showCategorySortModal` / `renderCategoryTasks` / 重命名分类时都改写 `categoryOrderCloud`（通过 `DAL.saveProfile`）。
- 🖥️ **新增"本设备独立排序"开关**：开关状态为 `profile.categoryOrderLocalOnly`，开启时使用本地 `localStorage.categoryOrderLocal`，关闭时使用云端。开启时把当前云端顺序复制到本地作为初值；关闭时直接用云端覆盖本地（用户明确要求）。开关状态本身在云端持久化（`categoryOrderLocalOnly` 字段），每设备独立选择但不会因共享 profile 而被同账号其它设备意外覆盖——它只是"本地独立模式"的标记。
- 🗑️ **移除 `recalculateAllInterest`（前端 + 云函数 action 范围）**：原 v8.2.14 引入的"一键重算历史利息"功能整段删除——前端函数 + 金融系统设置页"执行修复"按钮 + "全部任务说明"中的长按文字均清理；云函数 `tbMutation` 中并无对应的 `recalculateAllInterest` action（该功能一直纯前端），无需云函数侧动作。`recalculateFinanceStatsFromTransactions`（仅刷新利息统计显示）保留。
- 🎨 **排序抽屉 UI 重新设计**：底部抽屉增加序号徽标（1/2/3…）、分类前色点缩小、模式提示条按本地/云端切换色（绿/橙）、底部新增独立排序开关容器；玻璃模式同步适配。
- 🧹 **清理 `localStorage.categoryOrder` 旧键**：前端不再读写；旧值保留在 storage 中以便回退兼容。`saveDeviceSpecificData` 不再写 `categoryOrder` 字段到云端。
- ⚠️ **首次升级行为**：升级到 v9.14.2 后，`categoryOrderCloud` 默认空，分类将按当前 JS 内部规则（创建/合并顺序）展示，用户需在抽屉中拖动一次才会持久化到云端；旧设备级 `deviceSpecificData[*].categoryOrder` 字段保留在云端但不再被前端消费。

## v9.14.1 (2026-06-21)

<h4>启动鉴权与睡眠状态同步稳定性</h4>
- 🛡️ **修复冷启动偶发 `unauthenticated / credentials not found`**：`initApp` 在调用 `handlePostLoginDataInit` 前先执行 `ensureDatabaseAuthReady()`，通过轻量 `tb_profile.limit(1)` 探测数据库鉴权 token 是否真正就绪，未就绪则最多重试 3 次；`DAL.loadAll()` 对鉴权类错误增加一次 500ms 重试，避免首次启动或 token 恢复延迟时直接白屏报错。
- ☁️ **补齐原生兜底同步链路的睡眠状态应用**：`__onNativeCloudDelta` 之前对 `delta.profiles` 仅记录日志，未实际应用 `sleepStateShared` / `sleepSettingsShared`，导致 Watch 断开或后台恢复时睡眠/小睡状态无法同步。现改为对 profile 差集应用睡眠设置/状态、金融设置、均衡模式等字段，并通过 `source='native'` 参数避免 clientId 回环误判。
- 🔓 **放宽原生 pending delta 注入过滤**：`MainActivity.onResume` 原过滤条件要求 `transactions`/`running` 非空，导致仅 profile 变化（如睡眠状态）的差集被丢弃。改为只要 `maxUpdateTime > 0` 即注入 WebView，确保 profile-only 的变更也能被 JS 消费。
- 📌 **业务影响**：解决多端睡眠/小睡状态不一致；降低首次安装或清除数据后启动失败的概率。

## v9.14.0 (2026-06-20)

<h4>任务卡片自定义背景图</h4>
- 🖼️ **原生相册选择**：`WebAppInterface` 新增 `pickTaskBackgroundImage(callbackId)`，`MainActivity` 通过 `ACTION_PICK` 启动系统相册；选中后在新线程中压缩、旋转校正、缩放至最大 512px、JPEG 80% 质量，转 base64 通过 `__onTaskBackgroundImagePicked` 回调 JS。
- ☁️ **CloudBase 云存储上传**：JS 端将 base64 转为 `Uint8Array`，调用 `app.uploadFile()` 上传至 `task-bg/${uid}/${taskId}_${timestamp}.jpg`，任务对象保存公开 CDN URL，支持多端同步。
- ✨ **中心清晰四周模糊的视觉处理**：CSS 采用双层背景叠加——底层整张图放大+高斯模糊，上层同图通过 `mask-image: radial-gradient(...)` 只在中心椭圆区域显示清晰原图，再叠加主题色半透明遮罩，保证文字可读；暗色/亮色模式、经典/通透卡片样式均有对应遮罩。
- 🧩 **全链路数据兼容**：`tbMutation/saveTask`、DAL `saveTask`/`loadAllTasks`/`importFromBackup`、`trustThisDeviceAsAuthoritative` 均增加 `backgroundImage` 字段；导入导出、跨设备字段级合并均保留背景图 URL。
- ⚠️ **风险点**：CloudBase 存储 `task-bg/**` 需配置公开读取规则，否则 CDN URL 无法加载；未登录用户选择图片后仅本地保存 base64，不跨端同步。

## v9.13.0 (2026-06-20)

<h4>宽屏响应式布局 + 报告页体验优化</h4>
- 📐 **任务卡片流体网格**：根据容器宽度自动 1/2/3/4 列切换，列数变化时使用 FLIP 动画平滑过渡；普通手机竖屏保持单列不变。
- 💳 **首页卡片宽屏横向等宽排列**：屏幕宽度足够时，余额、金融、屏幕时间、睡眠等卡片取消堆叠、横向等宽展开，充分利用横向空间。
- 🔄 **横屏转竖屏自动恢复堆叠**：宽度从宽屏阈值减小后，首页卡片自动收起为堆叠状态，不再保持展开。
- 🧱 **报告/设置页 masonry 多栏**：使用 JS masonry 按显示顺序从左到右紧密排列，保持 `.report-section` / `.settings-section` 原卡片组合，避免标题与选项分离；修复 masonry 选择器导致报告页与设置页同时显示的 bug。
- 📊 **详细数据页显示优化**：非天然双向分类/任务（屏幕/睡眠除外）统一显示抵消后的净额，避免自动检测返还或历史奖励被显示为“增加时间”。
- 📏 **详细数据表格自适应**：移除固定像素宽度与 80px 任务名截断，名称列自动占据剩余宽度，时间/平均/次数等数值列按内容收缩，所有单元格不换行、数字不省略。
- 🖱️ **报告卡片标签切换保持滚动位置**：切换周期/视图/分类/任务/排序/显示更多时，保存并恢复 `#appScrollContainer` 滚动位置，避免页面回滚到顶部。

## v9.12.2 (2026-06-19)

<h4>自动检测补录多设备去重 + 设备名展示</h4>
- 🤖 **确定性 ID 防跨设备竞态重复**：`createAutoMakeup` / `createAutoCorrection` 生成的交易 ID 固定为 `auto_makeup_${taskId}_${dateStr}` 与 `auto_correction_${taskId}_${dateStr}`，复用 `tbMutation` 已有的 `txId` 幂等检查，彻底消除两台设备同时启动时产生重复自动交易的可能。
- 📱 **详情页展示设备来源**：在 `autoDetectData` 中记录 `deviceName`（生成本交易的设备）与 `sourceDevices`（各设备实际 UsageStats 分钟数），`parseTransactionDescription` 在详情行追加设备名；多设备场景显示为 "设备A 20分 + 设备B 10分"。
- 🛠️ **按 deviceId 解析设备名**：新增 `getDeviceNameById()`，优先读取本机 `tb_device_name`，其次从云端 `profile.deviceSpecificData[deviceId].deviceName` 回退。
- 📌 单设备用户仅看到设备名后缀，交互无变化。

<h4>原生层同步兜底通道修复 + 彻底废弃 MQTT/个推</h4>
- 🔧 **修复 Worker 4 处不匹配**：`CloudSyncWorker` 调用 `timebankSync` 云函数时存在 action 名称不匹配（`getNativeDelta` vs `getDelta`）、HTTP 调用未传 `_openid` 鉴权失败、返回数据结构不匹配（期望对象实际数组）、云函数只查单集合 4 处断裂，导致 Worker 无限重试、原生层兜底同步形同虚设。本次修复后原生层兜底通道真正可用。
- 📡 **新增 `getNativeDelta` action**：`timebankSync` 云函数新增 `getNativeDelta` action，并行查询 5 个集合（`tb_transaction`/`tb_running`/`tb_task`/`tb_profile`/`tb_daily`）的增量数据，返回结构化 delta 对象 `{transactions, running, tasks, profiles, dailies, maxUpdateTime}`，用 `_.gte` 避免同毫秒记录丢失。
- 🔐 **新增 `saveUserOpenId` 桥方法**：`WebAppInterface` 新增 `saveUserOpenId`/`clearUserOpenId` 桥方法，JS 端登录成功后调用 `saveUserOpenId(uid)` 保存到 `TimeBankAuth` SharedPreferences，`CloudSyncWorker` 读取后放入请求体供云函数鉴权。
- 🗑️ **彻底废弃 MQTT/个推架构**：删除 `cloudbaserc.json` 中 `tbConnectToken` 和 `tbPushRelay` 两个云函数定义（含 9 个环境变量、敏感凭证），删除 `docs/version-changelog.md` 中 v9.7.1 版本回退日志段落。MQTT 长连接和个推 PUSH 架构自 v9.7.1 回退后已废弃，本次彻底清除所有残留配置。
- 📌 **业务影响**：db.watch 失效时（如 WebView 后台、WebSocket 断连），原生层 WorkManager 每 15min 拉取 5 集合增量差集，前台时通过广播注入 WebView 合并，不再完全失效。

## v9.12.0 (2026-06-15)

<h4>自愈探针历史可观测 + 显示器"自愈中"状态</h4>
- 📊 **累计自愈启动次数**：顶部状态条进入 paused 状态时，会显示"自愈中 · Xs 后重试 · 历史 N 次"——直接告诉你系统已经启动过几次自愈了。N 是跨刷新累计的（从 localStorage 恢复），重启应用也不会丢。
- 💚 **新状态色：自愈中（绿色）**：之前 paused 状态统一显示红色"已暂停"，但 paused 本身就是"系统在自救"的入口——红色容易让人误以为系统坏了。现在探针在跑时显示 💚"自愈中"，只有探针真的没在跑才显示 🔴"已暂停"，区分"系统在做事"和"系统卡死"。
- 🔍 **诊断面板新增 2 行**：点击状态条打开诊断面板，底部新增"累计自愈启动"和"上次自愈启动"两个字段，上次启动时间精确到秒（如"2026-06-15 17:43:21"），便于排查"自愈功能是否真的在工作"。
<p class="log-note">📌 本版本专注"自愈机制的可观测性"，不修复任何功能 bug，逻辑零侵入。</p>

## v9.8.1 (2026-06-15)

<h4>自愈探针完整性修复</h4>
- 🛠️ **自愈探针 B 路径补齐**：之前在 1 小时内频繁重建监听时，系统会自动进入"暂停"状态并启动自愈探针，但探针实际上没有真正运行——状态条会变红，但点击监听状态打开诊断面板，会看到"自愈探针"始终是 0、"自愈倒计时"始终是"未运行"。修复后：连续 8 次失败 / watchdog 限频暂停 / 启动恢复三种触发路径行为完全一致，断网恢复更可靠。
- 📊 **诊断面板更准确**：现在通过 watchdog 暂停进入的设备，诊断面板会实时显示探针累计次数和倒计时，便于排查频繁断网问题。
<p class="log-note">📌 本版本为 1 处隐藏 bug 的修复，专注同步机制的完整性。无新 UI、无新功能。</p>

## v9.8.0 (2026-06-15)

<h4>睡眠系统云端统一</h4>
- ☁️ **睡眠计划设置跨设备统一**：在任一端修改入睡时间、起床时间、目标时长等 22 个设置项，其他端会自动同步（之前每台设备独立设置）。
- 🌙 **睡眠状态跨设备实时同步**：A 端入睡，B 端首页睡眠卡片会立即显示"睡眠中"；B 端点击"起床"，A 端会自动结算奖励——与任务系统一致的体验。
- 📱 **离网补结算**：A 端无网络时，B 端帮结束睡眠，A 端联网启动后会自动结算入账，不会丢奖励。
- ⚙️ **默认睡眠计划调整**：计划入睡时间改为 23:00，计划起床时间改为 8:00，目标睡眠时长改为 8 小时 15 分，晚睡倍率改为 1:1。
- 🛠️ **v9.7.4 首页堆叠间距回归修复**：在"三卡片全部可见 + 屏幕时间收起 + 睡眠展开"组合下，屏幕时间卡片被错误下移 24px（容器 st-expanded 被睡眠展开误触）。修复后：屏幕时间 ↔ 余额的间距只由屏幕时间卡片决定，睡眠 ↔ 屏幕时间的间距由睡眠卡片自身决定，物理层解耦两层关系。v9.7.4 原本修复的"屏幕时间关闭后容器残留 12px"旧 bug 也同步保留修复。
- [FIX-LOCAL] 睡眠开关持久化修复：v9.8.0 改造时遗漏了一处 `localUpdated` 变量声明，启动时 `initSleepSettings()` 会抛 ReferenceError 中断，导致睡眠开关 enabled=true 状态在重启后 UI 仍显示关闭。已补齐变量声明 + 用 try/catch 包住云端同步块降级处理，重启后开关状态正确还原。
<p class="log-note">📌 本版本专注"睡眠 = 任务"的体验统一：与达标任务一致，任一端可开始、可结束、跨设备同步。无新 UI，无新按钮。</p>

## v9.7.4 (2026-06-15)

<h4>首页卡片间距修复 + 设置页清理</h4>
- 🛠️ **首页堆叠间距修复**：在"无屏幕时间 + 睡眠时间可见"组合下，睡眠卡片收起时与上方余额卡片之间多出 12px 间隙。根因是堆叠容器的 `st-expanded` 类残留屏幕时间卡片的历史状态。修复后容器的 `st-expanded` 由"实际可见卡片"的展开状态决定，睡眠卡片收起时与余额卡片紧贴重叠（堆叠语义），展开时正常 12px 间距。
- 🧹 **设置页清理冗余入口**：移除"修复习惯连胜"和"重算余额"两个调试入口及相关代码。习惯连胜已无回归问题（v9.0.7 ~ v9.0.10 多轮修复后稳定），余额由云端 `tb_profile.cachedBalance` 权威化（v9.1.0 起）不再需要手动触发重算。如未来真出现异常，请通过数据导出 + 控制台诊断。
<p class="log-note">📌 本版本专注 UI 修复与界面精简，无新功能。</p>

## v9.7.3 (2026-06-14)

<h4>同步机制优化 — activeSync 防并发 + 增量窗口延长 + 数据安全</h4>
- 🔄 **activeSync 从 setInterval 改为递归 setTimeout**：之前 10 秒固定间隔，如果某次同步耗时超过 10 秒会堆积并发 tick。现在改用递归 `setTimeout` + 执行中标记，上次同步完成后才调度下一次，彻底消除并发风险。
- ⏱️ **activeSync 间隔 30 秒**：基于 4000+ 条交易记录的背景，每 tick 的 `__fixCompletionCount` 遍历所有任务 × 所有交易（约 12 万次过滤/秒）。30 秒间隔将此类开销降低 2/3，且 Watch 正常时 activeSync 仅确认"无新数据"，30 秒不影响跨设备同步质量。
- ⏱️ **增量同步窗口从 30 分钟延长至 120 分钟**：Watch 不稳定的用户（如 Android 后台冻结频繁重建）之前会频繁触发全量 `loadAll()`，现在窗口期长了 4 倍，减少不必要的全量加载。
- 🔄 **增量失败自动重试一次**：增量查询偶发网络抖动时不再直接降级全量同步，而是重试一次，重试成功则继续走增量。
- 💾 **离线变更队列（mutationQueue）每次出队即落盘**：修复了 `flushMutationQueue` 中途崩溃导致已移出的 mutation 丢失的隐患，每出队一条立即保存到 `localStorage`。
<p class="log-note">📌 本版本不动架构、不碰 Watch 核心机制，只修 4 个有确切证据的问题。4000+ 交易用户和数据量大时同步更稳定可靠。</p>

## v9.7.2 (2026-06-14)

<h4>滚动性能优化 — 消除安卓端滑动卡顿</h4>
- ⚡ **移除永久性 GPU 合成层**：之前所有任务卡片都带 `will-change: transform`，每个卡片独占一个 GPU 合成层。大量卡片时 GPU 内存耗尽导致掉帧。现在只在拖动/移位动画时才创建 GPU 层。
- ⚡ **滚动监听器改为 passive**：饼图/趋势图 tooltip 的 scroll 监听器改为 `{ passive: true }`，浏览器不再等待 JS 执行完毕才滚动，滑动更跟手。
- ⚡ **早期返回守卫**：tooltip 未显示时跳过 `classList.remove`+`getElementById` 等 DOM 操作，每帧零开销。
- 📌 4000+ 条交易记录的用户：交易数据存储在 JS 数组中，不直接渲染成 DOM，不影响主页面滚动性能。
<p class="log-note">📌 本版本专门针对安卓端滑动卡顿问题排查修复。修复后滚动更流畅，尤其是任务卡片多时效果明显。</p>

## v9.3.3 (2026-06-12)

<h4>原生层云端同步保活 — 从根上消除后台同步丢失</h4>
- 🛡️ **架构改造（关键）**：云端同步从 JS 端 `setInterval/setTimeout` 迁移到 Android 原生层 **WorkManager 周期任务**（15min 周期 + 前台即时任务）。
- 🔧 **WebView 后台冻结不再致命**：`CloudSyncScheduler` + `CloudSyncWorker` 在 WebView 进程被 Doze 冻结时仍能被系统调度执行，不再依赖 `JS setInterval`。
- 📡 **WebSocket 静默死亡兜底**：JS 端心跳（`__startWatchHeartbeat`）失败时上报原生层，原生层立即调度一次 Worker reconcile。后台期间差集暂存到 `SharedPreferences`，前台时一次性注入 WebView。
- 🔄 **visibilitychange 改为 always-reconcile**：任何长度的后台返回都假设 WebSocket 已断，移除 60s 阈值，立即拉取原生层差集 + 重建 Watch。
- 📊 **监控状态显示器增加原生层维度**：监听状态徽章旁新增 🟢/🟡/🔴 同步状态点，反映 WorkManager 周期任务当前状态。
- 🪪 **新建 TimeBankApplication**：维护 `isForeground` 标志位，被 `MainActivity.onResume/onPause` 翻转，供 Worker 决定"注入 WebView"还是"仅暂存"。
- 🔌 **4 个新桥方法**：`consumeNativeCloudDelta` / `getPendingCloudDelta` / `isNativeSyncActive` / `markJsHeartbeatFailed`，全部 `@JavascriptInterface` 安全暴露给 JS。
- 📊 **状态显示器重设计（收尾）**：从"圆点 + 文本 + 原生层徽章 + 重启按钮"4 元素简化为"状态点 + 紧凑文本"2 元素。综合 JS WebSocket + 原生层 WorkManager 数据源为单一状态（ok/lag/fail/inactive/init 5 级），显示"X秒前"时间维度，每 5s 自动递减。点击 → 展开诊断（重启按钮移至诊断面板内）。
- 🪣 **QPS 限流拆桶**：用户场景保留 450 QPS，新增 batch 桶 800 QPS 专供 `flushMutationQueue` / `importTransaction` 批量操作。两者独立降级：用户场景出错不会拖慢批量重连。
<p class="log-note">📌 业务影响：**长后台后"168/8"失败队列堆积**根因被消除（后台差集不再依赖 JS WebSocket）。WorkManager 周期任务每 15min 在 Java 侧拉取差集，前台时一次性合并，不再产生"失败队列 168"的视觉冲击。频繁点击"重启"按钮的 workaround 不再被需要。新状态显示器一眼看穿"数据新鲜度 + 失败积压"，无需展开诊断。</p>

## v9.3.2 (2026-06-11)

<h4>任务复活修复 + 跨设备 10 秒同步</h4>
- 🛡️ **Bug 1 修复（关键）**：v9.3.1 的"找不到 runningTask → 从原生 Service 拉回"恢复逻辑在特定时序下会复活已被停止的任务。本版本改为以**云端为唯一权威源**，云端无记录则丢弃事件 + ack，不再走原生 Service 兜底恢复。
- ⏸️ **stopTask 静默期**：`stopTask` / `cancelTask` 入口记录 5 秒静默期，期间对悬浮窗 pause/resume 事件一律 ack + 丢弃。完美覆盖 1~3 秒的 scheduleRetry 重试窗口期。
- 📊 **maxElapsed 双重防护**：静默期外，恢复逻辑检查"原生 elapsed ≤ maxElapsed"则视为"陈旧已暂停的 timer"，丢弃 + ack，防止原生 Service 残留状态复活任务。
- ☁️ **云端权威**：找不到 runningTask 时优先查云端（`DAL.loadRunningTasks`），云端有则恢复、云端无则丢弃；仅在云端查询失败（离线）时才回退到原生 Service。
- 📋 **返回值语义明确化**：`__onFloatingTimerAction` 新增 `"ok"` 返回值表示"主动丢弃事件"（静默期内/云端无记录/原生陈旧），Java 侧 `scheduleRetry` 收到 `"ok"` 立即停止重试。
- 🌐 **Bug 2 修复：跨设备 10 秒同步**：用户反映"另一台设备 30+ 秒才同步到任务变更"。本版本新增 `DAL.fetchRunningDelta` + `mergeRunningDelta`，配合 activeSync 周期 30s → 10s，**跨设备开始/取消任务在 10 秒内同步**，不再依赖 watch 推送的健壮性。
- 📑 **复合索引**：云函数 `tbMutation` 首次调用时自动创建 `idx_openid_updateTime` 复合索引，确保 `_updateTime` 范围查询性能。
<p class="log-note">📌 业务影响：**"结束任务 1 秒后任务复活"**与**"跨设备同步延迟 30 秒"**两个核心 bug 一次性修复。所有 v9.0.5+ 历史上"任务复活/不消失"的症状均由 Bug 1 根因导致；v8.x ~ v9.3.1 跨设备同步依赖 watch 推送，watch 断开期间完全失同步，现在 activeSync 10 秒兜底。</p>

## v9.3.1 (2026-06-10)

<h4>悬浮窗架构重构：原生 Service 成为定时器唯一事实来源</h4>
- 🏗️ **根本性架构改造**：悬浮窗定时器状态以原生 `FloatingTimerService` 为唯一事实来源（Single Source of Truth），WebView 仅作镜像。修复长时间运行后"任务消失 / 计时被吞"问题。
- 💾 **磁盘持久化**：Service 每 5 秒刷盘一次，被系统杀死后重启可完整恢复所有 timer 状态。进程死亡不再丢数据。
- 🔄 **拉模型取代 Push**：新增 `getAllActiveFloatingTimers`、`getTimerElapsedByName`、`getAllPendingFloatingTimerEvents` 三个 JS 拉取接口，取代不可靠的广播+SharedPreferences push。
- ✅ **事件 ACK 机制**：JS 处理完事件后通过 `ackFloatingTimerEvent` 回传确认，原生层才清理该事件，TTL 从 60 秒延长到 30 分钟。
- 🔁 **重试队列**：`scheduleRetry` 替代固定 500ms 延迟，最多重试 15 次（3 秒），配合 JS 端"waiting/applied"返回值。
- 🛡️ **同名 timer 保护**：`startTask` 启动前先查原生是否有同名 timer 残留，若有则复用已计时的时长，**绝不 reset**。修复"30 分钟被静默丢弃"的核心 bug。
- 🧠 **多源状态恢复**：`__onFloatingTimerAction` 找不到 `runningTask` 时主动从原生 Service → 云端 两级拉回，不再静默 return。
- 🎯 **多进程游戏识别**：`isInAssociatedApp` 兼容 `com.netease.idv:core` 类子进程名，修复《第五人格》等多进程游戏点击悬浮窗走错分支的问题。
- ⏱️ **权威时长**：`stopTask` / `cancelTask` 优先采用原生 Service 时长，避免 JS 时钟漂移 / WebView 暂停期间时长不准。
<p class="log-note">📌 业务影响：游戏类任务 30 分钟后回到 TimeBank，**任务正常显示已计时状态**，可正常结束；"开始"按钮不再误重置悬浮窗、丢弃已计时的时长。</p>

## v9.3.0 (2026-06-10)

<h4>同步链路幂等修复</h4>
- ✅ **云函数 tbMutation 幂等化**：`stopTask / deleteTask / updateTransaction / deleteTransaction` 在云端记录不存在时不再返回 1003 错误，改返回 410（幂等），客户端视为成功。失败队列不再堆积"数据不存在"条目。
- 🔇 **1003 业务错误静默化**：`callMutation` 中 1003 仍记录失败、仍触发回滚，但**不再弹 toast 打扰用户**（作为云函数幂等化的兜底防护）。
- 📝 **失败队列错误体可读化**：`MutationFailureHandler.recordFailure` 错误序列化增加 stack/JSON.stringify 兜底，杜绝 `[object Object]`，调试更高效。
- 🛡️ **兼容旧数据**：升级前已有的 1003 失败记录仍会保留；升级后新增的失败记录走新路径。
<p class="log-note">📌 业务影响：用户不会再看到"失败队列 5"红标 + "❌ 数据不存在"弹窗的组合；调试日志可读性大幅提升。</p>

## v9.2.3 (2026-06-10)

<h4>冷启动不加载数据修复 + 监听状态显示器优化</h4>
- ✅ **冷启动不加载数据修复**：安卓端冷启动后任务/交易列表立即显示，不再出现"已登录+已同步"但无数据；不再需要"关闭重开"作为临时解决方案。
- ✅ `DAL.init()` 增加 2 次重试（200/600ms 退避），冷启动 SDK 首次握手失败不再误判"无数据"。
- ✅ `handlePostLoginDataInit` 移除 `if (hasData)` gate，始终走完整数据加载链（`loadAll + subscribeAll + updateAllUI + startActiveSync`）。
- 📊 **监听状态显示器升级 5 态**：拆分🟢"已同步"和🟡"已连接"两态——Watch 建立后显示"已连接"，数据加载完成才显示"已同步"，彻底告别"已同步但列表为空"的尴尬。
- 🔄 **保活中显示重连倒计时**：指数退避期间状态条显示"保活中 3/8 · 12s 后重试"，让用户清楚知道"系统正在努力"。
- 💚 **自愈探针成功后补偿同步**：断网期间云端产生的新数据不再丢失——探针恢复后立即调用 `reconcileCloudAfterWatch` 拉取 delta。
- 🔍 **诊断面板倒计时实时刷新**：打开诊断弹窗后，自愈倒计时每秒自动更新，不再是"死数字"。
- 🚪 **登出重置降级状态**：退出登录时清零 `__watchDegradeStatus`，避免再次登录时残留旧 paused 状态导致自愈探针误启动。
- 🎨 **状态点过渡动画**：🟢↔🟡↔🔴 切换 0.5s 渐变动画 + 首次连接 scale 动效，视觉反馈更自然。
- ⚡ **UI 更新防抖**：`updateWatchStatusUI` 100ms 防抖，避免 15+ 高频触发点同时重排 DOM。
- 🔄 **右侧图标替换为"重启"**：移除无功能的 🔧 "重置 Watch" 和 🔄 "手动同步"两个旧按钮，替换为单一 🔄 "重启"按钮——点击后调用 `Android.restartApp()` 桥接，**彻底关闭进程并重新启动应用**（用户看到完整的"关闭→打开"周期，比"重置 Watch"更彻底）。
- 📱 **Android 桥接新增 `restartApp()`**：<a href="file:///d:/TimeBank/android_project/app/src/main/java/com/jianglicheng/timebank/WebAppInterface.java">WebAppInterface.java</a> 新增 `@JavascriptInterface restartApp()`，通过 `FLAG_ACTIVITY_CLEAR_TASK + startActivity + finishAffinity + killProcess` 实现真正的"应用重启"。
<p class="log-note">📌 用户体验改善：监听状态显示更准确、更可读、更及时反馈同步进度；冷启动+断网恢复双场景均无数据丢失。</p>

## v9.2.2 (2026-06-09)

<h4>Watch 生命周期修复</h4>
- ✅ 页面关闭/刷新时主动清理 Watch 连接，消除 "no realtime listener found" 僵尸推送
- ✅ Watchdog 补偿同步改为重建完成后再执行，避免时序竞态
- ✅ 重建后心跳时间戳重置，给新连接完整 60 秒窗口，避免连续超时循环

## v9.2.1 (2026-06-09)

<h4>PWA 实时性问题彻底修复</h4>
- ✅ 启动并完成第一个任务不再报 "isImportMode is not defined" 错误
- ✅ 5 分钟连续操作，监控状态指示器长期保持 🟢（不再每分钟变红重建）
- ✅ 启动/停止任务不再被误判为"来自其他设备"，任务数据不重复
- ✅ 控制台错误数从 700+ 降到 < 20（之前的 ReferenceError + Watch 雪崩都消失了）
- ✅ 重复代码清理：3 处 "completionCount 修复" 统一为一个工具函数
<p class="log-note">📌 本版本是 v9.0.12 工作的延续。原 v9.0.12 版本号废弃，实际工作以 v9.2.1 版本号发布。</p>

## v9.2.0 (2026-06-09)

**[UI + 内务] 使用偏好独立化 + 报告页 AI 伙伴「时光」合并 + 推送自动化**：v9.2.0 是一个"使用偏好独立化 + 工程内务自动化"版本，3 个改造互相配合：
- 🪄 **改造 A：报告页 AI 伙伴「时光」+ AI 洞察报告 合并**：把"AI 伙伴"和"AI 洞察报告"两张卡片合并成一张「AI伙伴 · 时光」卡片。**默认显示「时光」今日问候**（点击进聊天），点击右上角"▼ AI 洞察报告"展开报告工具区（周期/模型选择 + 生成报告 + AI 记忆管理）。收起后只剩问候区，简洁不打扰。合并后的卡片自动出现在「设置 → 自定义报告卡片」中，**默认排在报告页最末位**。
- 📂 **改造 B：分类折叠状态改为每端独立**：之前收起/展开分类操作会立即同步到所有设备——这导致手机和平板互相"打架"。本版本改为**每端独立**（参考"分类栏顺序"模式），使用 localStorage 持久化本端偏好，与云端解耦。**首次升级自动迁移**：从云端取一次初始值，之后完全独立。
- 🤖 **改造 C：版本号位置从 11 减为 9 + 推送自动化**：之前 11 处版本号易遗漏。删除 2 处装饰性重复（启动日志注释 + AGENTS.md 当前版本号），**AGENTS.md 改用占位符 + 推送前自动注入**。以后只需改 `app-1.js` 一处，`pre-push-check.ps1` 自动同步到 AGENTS.md。
- 🛡️ **完全兼容旧配置**：如果你已经手动调整过卡片顺序，本次升级会自动把新卡片追加到列表末尾，不会打乱你的现有排序。云端 AI 服务、报告生成逻辑、AI 认知记忆、聊天浮层 100% 保留——只是把两个 UI 入口合并到一张卡片里。
**用户可见改善**：报告页从 6 张卡片精简为 5 张；「时光」问候消息与 AI 工具区合一，视觉更连贯；多端折叠状态独立，不再互相覆盖；推送版本号永不遗漏。

## v9.1.0 (2026-06-08)

**[架构] 纯云端架构：dailyChanges + 余额 双云端权威**：v9.1.0 是一个大版本，把"本地业务数据"全部迁到云端，杜绝多设备数据漂移。共 3 个互相配合的改造：
- ☁️ **改造 A：启动数据流统一为 `DAL.loadAll` 唯一入口**：之前启动有 2 条路径（本地缓存秒开 + 云端全量同步），容易产生"本地旧数据覆盖云端新数据"的诡异 bug。本版本统一为单一入口——启动后只能从云端拉取，不再有"秒开但数据陈旧"或"秒开但被云端回滚"的二选一难题。
- 📅 **改造 B：日数据（dailyChanges）云端权威化**：之前的"今日获得/消费"数据是各设备自己从交易流累加的——如果某台设备错过一笔交易，就会显示不一样的数。本版本改为**云端 tb_daily 表原子维护**，所有设备只能读取不能写入。
- 💰 **改造 C：余额云端权威化**：之前余额是各设备本地重算的。本版本改为**信任云端 tb_profile.cachedBalance**，本地不再重算。设置页新增"重算余额"按钮——点击后云端原子扫描所有交易、重算并写回。
**用户可见改善**：彻底消除"多设备余额诡异不一致""今日数据不同步"等历史遗留问题。

## v9.0.11 (2026-06-08)

**[修复] PWA 端控制台 bug 反馈修复 + Watch 雪崩治理**：本次是一次"机制层修复"——把多个互相叠加的脆弱性一次性拆解。共 6 类问题：
- 🐛 **真 Bug：`currentUid is not defined`**：`DAL.fetchDelta` 引用了未声明的变量，导致第一次增量同步必抛 `ReferenceError`。这是雪崩的第一块多米诺骨牌。修复：在函数顶部显式 `const currentUid = await this.getCurrentUid()`。
- ☁️ **SDK 加载失败连环报错**：本地 `cloudbase.v2.bundle.js` 加载 `ERR_CONNECTION_RESET`，CDN 兜底也失败，旧版每 200ms 重试 20 次打 5 行错误。修复：引入 `whenCloudBaseReady()` Promise，首次失败只打一行日志；`waitForCloudBase` 扩到 30s；`refreshLoginState` 改用 await。
- 🐕 **Watch 60s 雪崩**：`onError` 把 `watchLastEventTime=0`，`onChange` 又不刷新心跳，60s 后 watchdog 误判触发重建 + 补偿同步，补偿同步因 #1 失败又触发重建，**5 次循环产生 700+ 行日志**。修复：watchdog 限频 1h 6 次 + 60s 探针接管；`unsubscribeAll` 真正等 ws ACK（800ms）；5 处 `onChange` 恢复心跳刷新（v8.2.17 设计的语义修正）；补偿同步延后到 8s（给重建留窗口）。
- 📊 **completionCount 反复 +1 修复**：三处"修复"循环只改内存，`DAL.saveTask` 和云函数 `tbMutation.saveTask` 的 `taskData` 都不写 `completionCount` 字段——下次 `loadAll` 又读到旧值，循环报警。修复：客户端 `DAL.saveTask` taskData 增加 `completionCount` 字段；云函数 `tbMutation.saveTask` 同步加字段；三处"修复"循环改为"修 + 写回云端"。
- 🔘 **按钮 ID 错误**：`setupTaskModalEventListeners` 绑定了 `#registerButton` 和 `#loginButton`，但 index.html 实际是 `#startSyncButton` / `#emailLoginBtn` / `#emailRegisterBtn`，且该函数是**死代码**——没人调。修复：改用真实 ID；`setAuthLoading` 用 null-safe getElementById；DOMContentLoaded 时激活 `setupTaskModalEventListeners`。
- 🤖 **AI 服务每 3 秒抛"CloudBase 尚未初始化"**：`app-reports.js:8171` setInterval 3 秒一报。修复：先 `await whenCloudBaseReady(3000)` + try/catch；setInterval 间隔 3s → 30s。
**用户可见改善**：启动后 5 分钟内控制台错误行数从 **700+** 降到 **< 20**；5 个 taskId 反复报 completionCount 不一致→首次自动修复后不再出现；watch 不再 60s 雪崩；邮箱登录按钮可点击。

## v9.0.10 (2026-06-05)

**[修复] Watch 报错刷屏 + 用户感知强化 + 紧急热修复**：从"机制修复 + 主动恢复"双管齐下，Watch 不再无声降级。
- 💚 **修复 Watch 报错刷屏（根因）**：之前空闲 30 秒 SDK 内部 WebSocket 会自动断开，控制台大量 `pong timed out` 报错。新版本每 20 秒主动产生一次极轻量网络流量，让 SDK 不会进入空闲超时。
- 🛠️ **修复优先于降级**：连续重试上限从 3 次提升到 8 次，给修复更多机会，不轻易降级。
- 🔄 **自愈探针——不等用户**：Watch 进入"已暂停"状态后，后台自愈探针每 60 秒自动尝试一次恢复，网络恢复后无需任何操作即可自动重建。
- 📊 **监听状态显示器 4 状态**：复用原有的"最近任务"标题旁状态指示器——🟢已同步 / 🟡保活中 n/8 / 🔴已暂停 Xs（倒计时实时刷新）/ ⚫未登录。点击弹出诊断面板。顶部不再有横条。
- 🔍 **诊断面板（点击监听状态）**：显示失败次数、失败原因、自愈探针状态、最后心跳时间等内部状态细节。
- 🔧 **暂停时一键重置**：监听状态显示器右侧的按钮在暂停时会自动从 🔄（手动同步）切换为 🔧（重置 Watch），用同样的小图标样式，不破坏原有外观。
- 🛡️ **修 Bug：戒除习惯 weekly 崩溃**：之前传 null/无效时间参数会抛 `TypeError: baseDate.getDay is not a function`。新增 `__normalizeDate` 工具，无效输入返回 null 不崩溃。
- 🛡️ **修 Bug：任务模态框事件 null 崩溃**：之前删除某个元素 id 后启动会抛 `Cannot read properties of null (reading 'addEventListener')`。新增 `__safeBind`/`__safeBindAll` 工具，缺失仅警告不崩溃。
- 🔥 **热修复：v9.0.10 第一版 SyntaxError**：如果你在 v9.0.10 第一版安装后看到"页面空白/卡住"，那是 v9.0.10 第一版有两个 JS 语法错误（变量重复声明 + 函数重复定义），导致整个脚本加载失败。本热修复已修复——App 可正常使用。
- 🛡️ **热修复：后台同步不再弹"数据导入中"卡住**：之前 App 启动时如果检测到本地有数据但云端为空，会自动调用导入流程并弹出"数据导入中"模态框；如果云端 hang 住模态框会卡死无法关闭。现在后台同步改为静默模式（仅日志+通知），用户主动点击"导入数据"按钮时仍显示模态框；同时模态框增加"取消"按钮作为兜底，万一卡住可手动关闭。
- 🛡️ **热修复：启动瞬间 5 个 watch 抢 WebSocket 全部失败**：之前 v9.0.10 的修复解决了"空闲 30s 自动断开"问题，但启动瞬间 5 个 watch 在 <100ms 内同时抢同一个还没就绪的 WebSocket，导致 5 个 watch 全部抛 `wsclient.send timedout` 错误。本热修复做了三件事：①建 watch 之前先做一次预热查询 + 200ms 延迟，让 WebSocket 完成握手；②5 个 watch 之间各加 200ms 错峰间隔；③心跳保活首次 tick 改为 1s 后立即触发（不等 20s）。预期 watch 建立成功率从"几乎 0"提升到"接近 100%"。
修复后，**Watch 错误频率从每 30 秒一次降至接近 0**，且 Watch 出问题时你随时能看见、能主动干预、能查看详情。

## v9.0.8 (2026-06-04)

**[修复] 分类颜色/折叠状态丢失问题**：修复网页端任务标签颜色丢失、折叠状态异常的 bug，根因是云端同步时错误地使用了数据库保护格式导致数据损坏。
- 🎨 **修复分类颜色丢失**：之前网页端修改分类颜色后，云端存储的是数据库保护格式（如 `{fieldName, operands, operator}`）而非实际的颜色值，导致刷新后颜色全部丢失。本版本修复了同步逻辑，颜色数据现在正确存储。
- 📂 **修复折叠状态异常**：与分类颜色同根因，折叠状态（哪些分类是收起/展开的）也使用了错误的存储格式，导致状态无法持久化。已一并修复。
- 🔄 **自动修复已损坏的云端数据**：如果你的云端数据已经被错误格式污染，App 加载时会自动识别并提取原始值恢复，无需手动操作。
- 🛡️ **防止未来再次损坏**：移除了同步代码中多余的数据库格式包装，云端直接存储原始数组格式，与数据库更新机制配合更可靠。
修复后，**分类颜色和折叠状态将正确持久化到云端**，跨设备同步也不再丢失。

## v9.0.7 (2026-06-04)

**[修复] 习惯连胜重算与奖励发放更可靠**：彻底修复 v9.0.1 之后才暴露的"连胜突然清零"bug；新增"修复习惯连胜"按钮，可一键恢复被错误清零的连胜数据。
- 🐛 **修复"连胜突然清零"问题**：之前在某些启动场景下（App 走本地缓存秒开、后台同步尚未完成时）点击完成习惯任务，会导致连胜从 14 天突然变成 1 天——即使你已连续完成 14 天。本版本彻底修复了这个隐性 bug，连胜数据将准确反映你的实际完成情况。
- 🔄 **习惯系统数据源统一**：之前连胜计算依赖一个"交易索引"（用于性能优化），但该索引在某些启动路径下为空，导致计算结果错误。本版本改为**始终从交易记录读取**，杜绝数据漂移。
- 🎁 **习惯奖励发放更准确**：之前"连胜是否达标"和"是否发放奖励"由两次独立的判断组成，两次判断之间可能因异步操作导致数据漂移。本版本将两次判断合并为**一次原子操作**，确保奖励发放与连胜状态完全一致。
- 🧹 **索引清理更彻底**：之前"添加交易"等操作失败时，会清理交易数组但漏掉交易索引，残留数据导致后续计算错误。本版本在 3 类操作（添加/编辑/删除交易）的失败回滚中**同步清理索引**，彻底杜绝残留。
- 🛠️ **设置页新增"修复习惯连胜"按钮**：如果你的某些习惯任务连胜数据看起来不对（特别是 v9.0.1 ~ v9.0.6 期间被错误清零的任务），现在可以在设置页手动触发"修复"——系统会重新扫描交易记录，算出正确的连胜并写回云端。**建议每个受影响用户都点一次**。
本次更新彻底重构了习惯系统，**所有失败的操作都有明确的反馈与回滚**，连胜数据完全由交易历史决定，不会因为任何 bug 丢失你的真实努力。

## v9.0.5 (2026-06-03)

**[修复] 任务复活数据损坏 + 数据操作更可靠**：完善 v9.0.0 引入的 onRollback（回滚）机制，修复"任务瞬间复活后数据被破坏"的核心 bug；同时为更多操作加上"失败自动回滚"保护。
- 🛡️ **修复"任务复活数据损坏"**：之前在安卓端结束一个计时任务时，云端如果报错"任务不存在"（你可能在另一台设备刚结束过），任务会在界面上"瞬间复活"——但这次复活的任务数据是损坏的（之前保存的是任务 ID 字符串，不是任务内容）。本版本修正了回滚快照，复活的任务保留完整的原始数据（计时、暂停历史、累计时间等），不会因为"回滚"而损坏。
- 🔄 **4 类操作新增"失败自动回滚"**：编辑交易、删除交易、编辑任务、删除任务——这 4 类操作现在失败时也会自动回滚本地界面（撤销乐观更新），不再"瞬变瞬回"。之前只有"添加交易"和"停止任务"有回滚保护。
- 🧹 **自动同步设置字段更可靠**：之前分类颜色、折叠状态、报告视图等设置的"自动云端同步"机制，在某些边界情况下会漏掉某些类型的修改（比如 `delete` 操作）。本版本补全了 Proxy 拦截器，**任何**修改（包括删除属性）都会触发云端同步。
- 🛠️ **失败通知不再重复打扰**：之前多次失败时可能弹窗通知好几次。本版本用"已通知 ID 集合"避免重复弹窗，且从集合中正确清理已处理的失败项，防止长会话后内存占用持续增长。
- 🔧 **清理冗余字段**：移除"重算余额"操作中的一个云端不再使用的标识字段——节省云端存储，避免误以为是"重要数据"但其实已经无效。
修复后，**所有失败的操作都会有明确的反馈与回滚**，不会再出现"任务复活但数据坏了"或"修改了但没存上"等诡异现象。v9.0.5 是一次彻底的可靠性增强——本次更新也是为下一个大版本（v9.1.0 复合操作原子性）打基础。

## v9.0.4 (2026-06-02)

**[架构] saveData 重构 + Proxy 自动云端同步**：彻底拆分"本地缓存保存"与"云端同步"两件事，用 Proxy 拦截机制让 profile 字段的修改自动同步到云端。
- 🪄 **Proxy 自动云端同步**：分类颜色、折叠状态、报告视图状态这三个 profile 字段，现在通过 JavaScript Proxy 拦截"修改"操作，**自动云端同步**。无需任何手动调用——你设置分类颜色，300ms 后自动同步到云端；你切换报告页时间范围，自动保存。
- 🧹 **清理 clientId 字段**：v9.0.0 后云函数不再使用 clientId 区分设备，但客户端还在向 mutation data 注入它、云函数还在写入数据库。本版本彻底清理——节省云端存储空间、消除"数据已无意义但仍占用"的冗余。
- 🔧 **profile 写入自动扩展**：之前云端用 9 个写死 key 决定哪些 profile 字段需要"嵌套保护"（避免覆盖整个子对象）。现在改为自动判断"值是普通对象 → 嵌套保护"，新增 profile 子对象（如 aiSettings）无需改云函数即可生效。
- 🔒 **更安全的类型判断**：自动遍历时排除 null、数组、Date 对象，避免误包装破坏数据结构。
- 🔀 **本地缓存与云端同步解耦**：拆分 `saveLocalCache()`（仅本地）和 `DAL.saveProfile()`（云端精确同步），不再耦合。业务层 56 处调用已全部迁移到 `saveLocalCache()`，消除"全量字段模糊保存"的性能浪费。
本次升级是底层架构优化，**用户界面和操作流程完全无感知**，但云端同步更及时、更精确，分类颜色等设置跨设备也能立即生效。

## v9.0.2 (2026-06-02)

**[修复] 数据失败回滚 + 失败队列**：完善 v9.0.0 引入的"乐观更新 + 云函数写入"模式，修复"安卓端'连接中'时操作 1 秒后退回"bug。
- 🛡️ **onRollback 机制**：完成交易/任务/Profile 等操作失败时，UI 自动回滚到修改前状态（移除交易、恢复余额、恢复 running 等），不再"瞬变瞬回"。
- 📋 **失败队列**：设置页新增"📋 失败队列"按钮，可查看历史失败记录（最多 50 条），单条"重新执行"或"删除记录"操作。
- 🔔 **实时通知**：失败队列按钮右侧红色 badge 角标（30 秒自动刷新），失败时立即弹窗告知原因（业务异常/数据冲突/网络/限流等）。
- 🏷️ **错误码标准化**：云函数与客户端错误码统一为 0/410/400/401/1001-1004/429/500/503 体系。业务错误（如余额不足）不再入重试队列，节省 QPS。
- 🛠️ **静默数据丢失修复**：mutationQueue 重试 10 次后不再静默丢弃，而是记录到失败队列 + 通知用户。
修复后用户不会再遇到"显示已计入，1 秒后回退"的现象，所有失败都有明确反馈与可恢复路径。

## v9.0.1 (2026-06-02)

**[架构清理] v9.0.0 同步架构兼容性修复**：清理 v9.0.0 重构后的残留代码，确保客户端严格遵守"服务端权威写入"哲学。
- 🧹 **移除 v6.4.x 冲突对话框死代码**（~470 行）：forceCloudSync/forceLocalToCloud/showMultiDeviceConflictDialog/resolveConflict* 等函数。其中 forceLocalToCloud 内部引用了 v7.0.0 迁移到 CloudBase 后已不存在的 LeanCloud 全局（AV.User/AV.Query/AV.Object/AV.ACL），触发时会 ReferenceError 崩溃。
- 🔧 **DAL.recalculateBalance 改为云函数调用**：原实现直接 `db.collection().update({ cachedBalance })`，绕过云函数串行化与 `_.inc()` 原子性保证。改为 `callFunction('tbMutation', { action: 'recalculateBalance' })`，与 v9.0.0 服务端权威写入架构一致。
- 🧹 **移除 isSaving 标志及检查**：v9.0.0 后客户端不再直接写 DB，isSaving "防并发保存"已无意义。同步移除 app-auth.js 中 triggerSync 和 v7.24.1 自愈同步中的相关检查。
- 🧹 **移除客户端直接删 DB 逻辑**：loadAllTasks/loadAllTransactions 中遇到重复时不再 `db.collection().doc().remove()`，重复检测由云函数 addTransaction/saveTask 的幂等检查保证。
- 🧹 **移除死代码**：isSyncing 标志、saveQueue 队列、USER_OPERATION_PROTECTION_MS 常量、误导性 v8.2.17 注释。
预计净减少约 480 行代码，提升架构一致性并消除潜在崩溃点。

## v9.0.0 (2026-05-31)

**[架构重构] 服务端权威写入**：全面重构数据同步架构，所有数据变更通过云函数 tbMutation 统一执行，客户端不再直接写入数据库。新增 callMutation 统一变更入口和离线变更队列；移除 pendingRegistry 回声识别机制（不再需要）；移除跨设备 clientId 感知合并（云函数权威仲裁）；移除陈旧端写入门禁和全局写锁（云函数天然互斥）；余额由云函数原子更新，消除双倍计算和漂移问题；Watch 处理逻辑统一简化。预计减少约 800 行防御性代码。

## v8.20 (2026-05-07)

<h4>v8.20.2 分类栏独立控制任务显示数量</h4>

## v8.2 (2026-05-30)

<h4>同步 Android 项目到根目录</h4>

## v8.1 (2026-05-05)

<h4>AI伙伴时光：每日关怀、长期记忆、聊天浮层、时段分布修复、CLI自动部署</h4>

## v8.0 (2026-05-05)

<h4>v8.0.0 AI 洞察报告（云端 DeepSeek 方案）</h4>

## v7.40 (2026-05-03)

<h4>优化认识报告系统引导 - 修复气泡溢出和卡片展开定位问题</h4>

## v7.39 (2026-05-02)

<h4>修复 continuous_target 习惯奖励不发放；修复补录弹窗异常时不关闭</h4>

## v7.38 (2026-04-20)

<h4>pendingRegistry 确定性本地写入追踪替代时间窗口去重</h4>

## v7.37 (2026-04-20)

<h4>[v7.37.4] 修复达标任务习惯连胜计算：continuous_target类型交易标记advancement异常</h4>

## v7.36 (2026-04-14)

<h4>修复continuous_target习惯判定逻辑，支持targetCountInPeriod>1的场景</h4>

## v7.35 (2026-04-09)

<h4>v7.35.2 手动同步与上传云端可靠性修复</h4>

## v7.34 (2026-04-08)

<h4>v7.34.0 数据同步区域间距统一</h4>

## v7.33 (2026-04-08)

<h4>监听与同步机制修复 - DAL.stopTask重试 + stopTask断连补偿同步</h4>

## v7.31 (2026-04-05)

<h4>极大简化云函数机制 + 修复数组顺序问题</h4>

## v7.30 (2026-04-03)

<h4>hotfix 修复 v7.30.6 函数名错误导致的余额计算问题</h4>

## v7.29 (2026-03-31)

<h4>云同步竞态修复: 任务结束操作添加完整异步等待</h4>

## v7.28 (2026-03-30)

<h4>(v7.28.1): stopTask 竞态修复 + 纯色深色主题屏幕时间卡片亮度统一</h4>

## v7.25 (2026-03-27)

<h4>同步修复、导入提速、备注可见、色板优化</h4>

## v7.24 (2026-03-06)

<h4>v7.24.2 - 代码优化与项目精简</h4>

## v7.23 (2026-03-02)

<h4>(v7.23.0): 任务表单布局优化 - 类型/分类同行、分类combo-box、备注自适应、高度对齐、z-index修复</h4>

## v7.22 (2026-03-01)

<h4>(v7.22.0): 任务卡片恢复原样并更新日志</h4>

## v7.21 (2026-03-01)

<h4>修复习惯戒除奖励统计逻辑</h4>

## v7.20 (2026-02-26)

<h4>更新版本号至 v7.20.2</h4>

## v7.19 (2026-02-22)

<h4>docs(release): expand v7.19.0 user log and normalize comment version tags</h4>

## v7.18 (2026-02-15)

<h4>(v7.18.5): 悬浮窗点击跳转修复 + 拖拽边界约束</h4>

## v7.17 (2026-02-12)

<h4>任务展开标签重构与云端调用优化</h4>

## v7.16 (2026-02-12)

<h4>云端调用优化与任务展开重构</h4>

## v7.15 (2026-02-09)

<h4>(v7.15.4): 数据同步审计修复 - 余额undone过滤+云端去重同步+屏幕时间/睡眠守卫+休眠恢复串联+导入关闭watch+删除中间文件</h4>

## v7.14 (2026-02-07)

<h4>Tab indicator animation, widget permission management, glass mode fixes</h4>

## v7.13 (2026-02-05)

<h4>hotfix: v7.13.3 - 修复睡眠撤销与重算逻辑（recalculateDailyStats + 撤销时强制重算）</h4>

## v7.11 (2026-02-03)

<h4>报告视图持久化与趋势弹窗优化</h4>

## v7.10 (2026-02-01)

<h4>新手引导系统完善 - 帮助中心/示例任务引导/数据隔离/跳过提示</h4>

## v7.9 (2026-01-31)

<h4>bump version v7.9.12</h4>

## v7.8 (2026-01-24)

<h4>每日启动报告优化与通知设置持久化修复</h4>

## v7.6 (2026-01-21)

<h4>睡眠详情与设置弹窗</h4>

## v7.5 (2026-01-21)

<h4>睡眠简报与报告</h4>

## v7.4 (2026-01-21)

<h4>交易记录显示优化 - 颜色代替文字</h4>

## v7.3 (2026-01-18)

<h4>均衡模式持久化修复 - 改用独立本地存储</h4>

## v7.2 (2026-01-18)

<h4>多设备同步增强 - 设备名称显示/编辑、屏幕时间分类云端统一、主题色按设备同步、饼图/趋势图鼠标交互修复</h4>

## v7.1 (2026-01-17)

<h4>修复预置规则兼容性 - 移除手动设置 _openid</h4>

## v7.0 (2026-01-16)

<h4>任务编辑同步到云端, 归档v7.0.0日志</h4>

## v6.6 (2026-01-16)

<h4>移除不必要的 clientId，v2 SDK 只需 env 和 region</h4>

## v6.5 (2026-01-15)

<h4>丰富示例数据</h4>

## v6.4 (2026-01-07)

<h4>同步机制修复</h4>

## v6.0 (2026-01-16)

<h4>修复更新日志 v6.0.1 处的容器嵌套问题</h4>

## v5.5 (2025-12-23)

<h4>手动检测补录、屏幕时间详情Top5、趋势图分类全显示、Android导出修复、云同步冲突修复</h4>

## v5.2 (2025-12-22)

<h4>屏幕时间管理功能完善</h4>

## v5.1 (2025-12-21)

<h4>为时间流图、时间仪表盘增加了长按弹窗</h4>

## v5.0 (2025-12-20)

<h4>修复页面过度滚动、日历长按冲突，新增任务分类折叠功能</h4>

## v4.12 (2025-12-19)

<h4>全面细节优化</h4>

## v4.11 (2025-12-19)

<h4>release v4.11.0 with universal floating timer and menu fix</h4>

## v4.10 (2025-12-18)

<h4>release v4.10.0 with smart app launcher and UI polish</h4>

## v4.9 (2025-12-13)

<h4>Self-Healing Sync Engine (Retry Guard, Auto-Reconnect, Stale Lock Fix)</h4>

## v4.8 (2025-12-13)

<h4>Fix Sync Deadlock, Smart State Merge, and Optimistic Locking</h4>

## v4.7 (2025-12-05)

<h4>Update to v4.7.1: 修复达标任务自动取消的问题</h4>

## v4.6 (2025-12-04)

<h4>修复悬浮窗多任务冲突，优化趋势图布局，完善后台保活机制</h4>

## v4.5 (2025-11-28)

<h4>(PWA): Update Service Worker cache version to v4.5.9 to force cache clear.</h4>

## v4.4 (2025-11-06)

<h4>修复 v4.4.0 启动语法错误</h4>

## v4.3 (2025-11-08)

<h4>添加 LiveQuery 守卫修复竞态条件</h4>

## v4.2 (2025-11-02)

<h4>补充 v1.0-v3.0 历史日志</h4>

## v4.1 (2025-11-01)

<h4>更新：支持点击余额卡片及修复习惯UI</h4>

## v4.0 (2025-11-01)

<h4>更新：修复每日N>1习惯卡片UI Bug</h4>

## v3.19 (2025-10-31)

<h4>新增限时系统与提醒联动</h4>

## v3.18 (2025-10-28)

<h4>习惯任务新增周期内达标次数</h4>

## v3.17 (2025-10-28)

<h4>修复循环提醒时区漂移Bug</h4>

## v3.9 (2025-10-18)

<h4></h4>

## v3.8 (2025-10-17)

<h4></h4>

## v3.7 (2025-10-17)

<h4></h4>

## v3.6 (2025-10-16)

<h4>[修复] 修复了“深度分析”模块因无法识别旧数据格式而导致的计算错误（如平均值、占比显示为0）。现在该功能已完全兼容新旧两种数据格式。[新功能] 新增数据迁移功能。在“设置”中执行“导出数据”操作时，应用会自动将所有旧格式的交易记录无缝转换为新版标准格式。这有助于您逐步统一和净化历史数据。</h4>

## v3.5 (2025-10-16)

<h4></h4>

## v3.4 (2025-10-16)

<h4>版本回退</h4>

## v3.2 (2025-10-16)

<h4></h4>

## v3.1 (2025-10-16)

<h4></h4>

## v3.0 (2025-10-15)

<h4></h4>

## v2.85 (2025-10-11)

<h4>内容更新</h4>

## v2.9 (2025-10-15)

<h4></h4>

## v2.8 (2025-10-04)

<h4>更新时间银行至 v2.8 逻辑</h4>

## v9.21.0 (2026-07-21)

### [Core] 推荐算法全面重构：W1-W4 统一 [0, 2] 范围

#### 背景

推荐算法的四个维度（W1 时段匹配、W2 习惯紧迫度、W3 最近使用、W4 提醒命中）原本各自独立设计，范围不一致（[0,1]、[0,2.5]、[0,1]、[0,2]），导致加权求和需要各自除以不同分母，弹窗展示不直观。本次重构将所有 W 子分量统一到 [0.1, 2] 或 [-2, 2] 范围，组合方式全部采用几何平均（任一弱 = 整体弱原则）。

#### W1 时段匹配：完全重构

旧实现只用一个"稳定性"复合分（含丰度、一致性、活跃天数），存在多个问题：环形均值在双峰分布时算出错误中间值；稳定性阈值 0.2 过严导致新任务走默认值；consistency 语义反转（高 CV = 集中分布反而得低分）。

新实现拆分为四个独立子分量，几何平均组合：
- **abundance**（丰度）：total=0→0.1，total=30→1.0，total=60→2.0，线性 + 最小值
- **activeDayRatio**（活跃天数比例）：activeDays=0→0.1，activeDays=15→1.0，activeDays=30→2.0，线性 + 最小值
- **regularity**（规律性）：48 桶直方图 CV 衍生，sigmoid 平滑过渡（消除分段跳变）
- **time_slot_match**（时段匹配）：高斯叠加（σ=4 桶 = 2 小时），解决双峰/多峰分布问题

W1 = ∜(abundance × activeDayRatio × regularity × time_slot_match)，[0.1, 2]

#### W2 习惯紧迫度：几何平均

旧实现：importance × cycleUrgency × targetPull 后乘以 2.5 封顶，范围 [0, 2.5]，不统一。

新实现：
- importance（重要性）：ln(1+streak)/ln(31) × 2，锚点 streak=0→0.1（最小值，避免几何平均归零），streak=7→1.0，streak=30→2.0
- cycleUrgency（周期紧迫度）：1-cos(p·π)，p=0→0，p=0.5→1，p=1→2（不变）
- targetPull（目标引力）：2×(1-0.5^r)，r=0→0，r=1→1.0，r≥5→2.0（封顶）

W2 = ∛(importance × cycleUrgency × targetPull)，[0, 2]

**关键 bug 修复**：旧代码 W2 入口条件 streak >= 1 || hour >= 20 让 streak=0 且 hour<20 的习惯任务跳过整个 W2 计算，导致 importance=0.1 永远不会被调用。改为永远进入 W2，依赖其他子分量做最终过滤。

#### W3 最近使用：几何平均

旧实现：fitScore × recencyScore，范围 [0, 1]，完美拟合=0（数值小），解释困难。

新实现：
- fit_pull（拟合引力）：48 桶数据 CV 衍生，完美拟合（todayCount === round(average)）= 1.0（中性），未做侧 1~2（拉回），超额侧 0~1（抑制）。均线以四舍五入纳入判断，average 本身不变。
- recency_score（新近性）：24h 线性衰减，0h→2.0（峰值），6h→1.5，24h→0。

W3 = √(fit_pull × recency_score)，[0, 2]

#### W4 提醒命中：双曲线衰减 [-2, 2]

旧实现：高斯曲线 2×exp(-x²/5202)，范围 (0, 2]，永远为非负，"远离提醒"仅趋近 0。

新实现：双曲线衰减 2 - 4|x|/(|x|+180)，范围 [-2, 2]，原有锚点（x=0→2.0 峰值，x=±60→1.0）保持不变。远离提醒的实际拉低 finalScore 而非中性。

#### 补录交易过滤

W1 和 W3 不再包含补录交易（手动补录 isBackdate=true 和自动检测补录 isAutoDetected=true 都标记 isBackdate=true）。推荐基于"用户自然行为"，补录是修正性数据。W2 streak 和 W4 提醒不受影响。

#### 持续类任务时间基准统一

旧实现：_aggregateHourHistograms 使用完成时间入桶，_build48BucketHist 使用反推的开始时间，W1 内部两个直方图对持续类任务使用不同时间基准。

新实现：两个函数都按"开始时间"入桶（持续类任务 amount 即为持续秒数，反推）。W1 内部一致。

#### Bug 修复

- _countActiveDays 中 	x.timestamp < cutoff 的字符串/数字比较失败导致返回历史所有天数（240+），改为统一转为数字再比较。同时修正 getMonth() 缺少 +1 导致 key 冲突。

#### 涉及文件

- Android 权威前端：js/app-1.js（核心算法重写）
- 同步到 PWA 副本（推送流程）
- uild.gradle versionCode 102 → 103

#### 收益

- W1-W4 范围全部统一，弹窗展示更直观
- 几何平均 + 最小值机制：符合"任一弱 = 整体弱"原则
- 双峰/多峰分布正确识别
- 远离提醒时间真正拉低推荐分数
- 新习惯（streak=0）和新任务不再被压制
