# 9.22.0 冷启动优化方法 · 重启指令

> **状态**：本文件记录 v9.22.0 的冷启动优化方法和实施步骤，**当前不启用**。
> 用户于 2026-07-21 决定将 TimeBank 整体回退到 9.21.0（commit `e70c04b`），包括云函数。
> 此处记录方法，便于未来重新评估和实施时按步骤操作。

---

## 1. v9.22.0 优化的本质

v9.22.0 是一组**纯前端 + 投影**的优化，不改变数据格式与业务流程，目标是把**首次冷启动**从 13 秒降到约 2 秒。

### 7 项优化（全部在 `android_project/app/src/main/assets/www/js/app-1.js`）

| # | 文件 | 改动 | 收益 |
|---|------|------|------|
| 1 | `app-1.js` L635（relogin 路径） | `await DAL.subscribeAll()` 改为 `DAL.subscribeAll().catch(...)`（后台） | 首屏立即渲染 |
| 2 | `app-1.js` L7170（handlePostLoginDataInit 路径） | `subscribeAll` + `cleanupDemoDataOnLogin` 同样后台化 | 同上 |
| 3 | `app-1.js` L1808（reconcile 入口） | loadAll 完成 5 秒内 skip `active-sync` 触发的 reconcile | 防止二次重置 |
| 4 | `app-1.js` L3344（loadAllTasks） | 加 `TASK_PROJECTION` + `.field()` | 任务数据投影 |
| 5 | `app-1.js` L3565（loadAllTransactions） | 翻页键从 `timestamp` 改 `_id`，加 `TX_PROJECTION` + `.field()` | 交易翻页+投影 |
| 6 | `app-1.js` L4251（subscribeAll） | watch 错峰 200ms → 50ms | 监听建立更快 |
| 7 | `app-1.js` L4242（subscribeAll） | 预热等待 200ms → 50ms；L5291 写 `__loadAllJustFinishedAt` | 配合 #3 使用 |

### 云端配套（timebankSync，**已废弃**）

v9.22.0 在 `timebankSync/index.js` 写了 `TX_PROJECTION`（不包含 `data: true`）。**已废弃**，未来不要重复引入：

```javascript
// [v9.22.0 废弃版本] timebankSync 中的投影不包含 data:true
// 导致老数据 fallback 路径可能丢失 balanceAdjust 等字段
// 9.21.0 状态已回退：timebankSync 用 v9.12.2 旧版（无投影、无 _id 翻页键）
```

---

## 2. 重启条件

仅在以下条件**同时满足**时考虑重启：

- [ ] 9.21.0 跑满 1 周以上无严重问题
- [ ] 用户明确告知"冷启动太慢，想优化"
- [ ] 数据规模仍 < 5000 条（5000+ 条需重新评估投影收益）

---

## 3. 重启实施步骤（按序）

### Step 1: 备份

```powershell
cd D:\TimeBank
git --no-pager log --oneline -5  # 确认当前在 9.21.0 commit (e70c04b)
git checkout -b feature/v9.22.0-coldstart-restoration
```

### Step 2: 重贴 7 项优化（仅 `app-1.js`，**不要碰云函数**）

按下面 diff 顺序逐项 SearchReplace：

1. **app-1.js L635（relogin 路径）**

   ```diff
   - await DAL.subscribeAll();
   + updateAllUI();
   + DAL.subscribeAll().catch(err => {
   +     console.warn('[v9.22.x] 后台 subscribeAll 失败:', err?.message || err);
   + });
   ```

2. **app-1.js L1808（reconcile 入口）**

   ```diff
   + if (source === 'active-sync' && window.__loadAllJustFinishedAt && (Date.now() - window.__loadAllJustFinishedAt) < 5000) {
   +     console.log(`[v9.22.x] [reconcile] 冷启动 5 秒退避期内，跳过本次 active-sync`);
   +     return false;
   + }
   ```

3. **app-1.js L3344（loadAllTasks）**：在 `for (let page = 0; page < MAX_PAGES; page++)` 之前加 `TASK_PROJECTION` 常量；`.get()` 之前加 `.field(TASK_PROJECTION)`。

4. **app-1.js L3565（loadAllTransactions）**：把 `lastTimestamp` 改为 `lastId`；翻页 where 从 `timestamp: _.lt(lastTimestamp)` 改为 `_id: _.gt(lastId)`；orderBy 从 `timestamp` 改为 `_id`；加 `TX_PROJECTION` 和 `.field()`。

5. **app-1.js L4242**：预热等待 `200` → `50`。

6. **app-1.js L4251**：watch 错峰 `200` → `50`。

7. **app-1.js L5291**：在 `console.log('✅ [DAL] 加载完成...')` 后加 `window.__loadAllJustFinishedAt = Date.now();`

8. **app-1.js L7170（handlePostLoginDataInit）**：和 Step 1 一样的后台化改动。

### Step 3: ⚠️ 同步版本号

11 处全部同步到 `v9.XX.Y`（用户指定）。**绝对不要自己拍**。

### Step 4: 同步 + 构建 + 推送

按 `AGENTS.md` 「推送」工作流的标准步骤：
- 5 条 `Copy-Item` 同步 Android → 根目录
- `Get-FileHash` 验证 hash 一致
- 撰写技术 + 用户两份日志
- `git add -A` → `git commit` → `git push`

### Step 5: ⚠️ 切勿触碰云函数

**这次只做前端，云函数保持 9.21.0 状态**。原因：
- 9.22.0 改动 `timebankSync` 引入了"投影不包含 data:true"导致老数据兼容问题
- 9.22.1 在 `tbMutation` 加的 `safeAmount`/`null 兼容` 是应急 hotfix，质量未充分验证
- 数据完整性的代价大于冷启动收益

如果将来还要做云函数层面的优化，必须：
- 写独立云函数（如 `tbSyncOptimized`）**不替换**现有的
- 客户端通过 envId 配置切换
- 灰度发布，单用户测试至少 1 周

---

## 4. 必须配套的客户端修复（如果重启）

重启 v9.22.0 优化时，**`processHabitCompletion` 必须配套修复**：

```javascript
// app-2.js processHabitCompletion 入口
let baseReward = task.fixedTime;
if (typeof baseReward !== 'number' || isNaN(baseReward)) {
    baseReward = computeHabitBaseRewardFromStreak(task);  // 始终返回 0
}

// app-2.js processHabitCompletion 内部（habitBonusReward > 0 块）
const safeBase = (typeof transaction.amount === 'number' && !isNaN(transaction.amount)) ? transaction.amount : 0;
transaction.amount = safeBase + bonusAdjusted;
```

```javascript
// app-2.js 新增函数（关键：始终返回 0，避免双倍计入）
function computeHabitBaseRewardFromStreak(task) {
    return 0;
}
```

**为什么**：v9.22.0 的 subscribeAll 后台化让 addTransaction 路径更宽容，会把 NaN 写入 amount=0。修复让 client 不发 NaN。

---

## 5. 已知风险

| 风险 | 严重性 | 缓解 |
|------|--------|------|
| completionCount 不递增 | 中 | 9.21.0 一直存在，本次不修 |
| cleanupDemoDataOnLogin 重算 currentBalance | 中 | 9.21.0 一直存在，本次不修 |
| 数据文件潜在不一致 | 低 | 用户已确认 amount=0 多为设计预期 |

---

## 6. 回退策略

如果重启后发现问题，**单 git revert 即可**：

```powershell
git revert HEAD
git push --force-with-lease
```

云函数无需重新部署（本次只动前端）。