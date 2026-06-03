# TimeBank 历史版本归档

> ⚠️ **本文件为只读归档**
> 详细的版本日志（根因 / 修复 / 影响）只保留在 [AGENTS.md](../AGENTS.md) 的"最近 5 个完整版本"。
> 本文件仅保留一行摘要的版本索引，方便回查"哪个版本改了什么"。
> 如需查看完整细节，请通过 `git log` 查询该版本对应的提交。

---

## 归档策略

| 范围 | 处理方式 | 文件位置 |
|------|----------|----------|
| 最近 5 个完整版本 | 完整记录（根因 / 修复 / 影响） | AGENTS.md |
| v8.2.9 ~ v7.36.x | 一行摘要 | 本文件（复制自 AGENTS.md 早期版本索引） |
| v7.36.x 之前的版本 | 一行摘要 | 本文件 |

> 💡 **为什么不把所有细节保留两份？**
> 主指令文件 AGENTS.md 每次对话都会全文加载，太长会浪费 token（每条对话多花 1-2 万 token）。
> 需要回查细节时，用 `git log --oneline --all -- "android_project/app/src/main/assets/www/"` 找到对应提交。

---

## 历史版本索引（v7.36 ~ v8.2.9）

> 此表与 AGENTS.md "早期版本索引" 内容保持一致，作为备份。

| 版本 | 核心内容 |
|------|---------|
| v8.2.9 | 补录弹窗 try/finally 保护 |
| v8.2.8 | 大数据量秒开 + 后台增量同步 |
| v8.2.7 | saveTask 数据保护：clientId、失败重试队列、字段级合并 |
| v8.2.6 | 登录态误报修复、后台延迟修复 |
| v8.2.5 | 通透模式 UI 修复 |
| v8.2.4 | 任务完成后余额双倍计算修复 |
| v8.2.3 | 后台结束任务 UI 僵死修复 |
| v8.2.2 | Watch 连接僵死 + 手动同步失效修复 |
| v8.2.1 | 全量同步覆盖 pending 交易修复 |
| v8.2.0 | AI 统一认知架构 |
| v8.1.0 | AI 增强：Kimi 模型、CLI 部署 |
| v8.0.0 | AI 云端方案：DeepSeek + HTTP 访问服务 |
| v7.39.x | Habit System 3.0 重构 |
| v7.39.5 | 删除习惯 isBroken 状态（与 streak 重复） |
| v7.39.6 | 修复 processHabitCompletion 余额双重累加 |
| v7.38.0 | pendingRegistry 机制（替代 30 秒时间窗口） |
| v7.37.6 | 修复 Watch 去重条件写反 + timestamp 类型 |
| v7.37.5 | transaction 缺少 clientId 导致 Watch 去重失效 |
| v7.37.2 | rebuildHabitStreak 未验证 continuous_target 达标 |
| v7.37.1 | 习惯系统核心逻辑修复（达标判定、周期统计） |
| v7.37.0 | 性能优化：交易索引系统 + 增量重建 |
| v7.36.6 | 修复 continuous_target 习惯有效完成判定 |
| v7.36.5 | 移除阻塞式云端存在性检查 + O(1) 增量更新 |
| v7.36.3 | 取消任务后 AlarmManager 闹钟未取消 + 小睡图标 |
| v7.36.2 | 应用保活服务（KeepAliveService） |
| v7.36.1 | 达标任务习惯连胜计算错误 |
| v7.36.0 | 架构改进：timebankTaskLock 云函数 + 幂等写入 |

---

## 如何回查某个版本的完整细节

```powershell
# 查看某个版本对应的所有提交
git log --all --oneline --grep="v8.2.4"

# 查看某个版本改动的具体文件
git show <commit-hash> --stat

# 对比 v8.2.4 与上一个版本
git diff <v8.2.4-commit>^ <v8.2.4-commit>
```

---

## 已知高危区域历史修复一览

| 区域 | 风险等级 | 历史修复版本 |
|------|---------|------------|
| 睡眠时区计算 | 高 | v7.13.1, v8.2.13 |
| 配额+自动检测补录 | 高 | v8.2.11, v8.2.12 |
| 习惯连胜系统 | 高 | v7.37.1, v7.37.2, v7.39.1, v7.39.5 |
| Watch 连接与同步 | 高 | v7.37.5, v7.37.6, v7.38.0, v8.2.2 |
| 金融系统利息计算 | 高 | v8.2.10, v8.2.14 |
| 跨设备 running 同步 | 高 | v8.2.4, v8.2.15 |
| 任务完成余额双倍 | 高 | v8.2.4 |
| pending 交易丢失 | 高 | v8.2.1 |
| AI 提示词渲染 | 中 | v8.1.0 |
| AlarmManager 残留 | 中 | v7.36.3 |

> 💡 修改以上区域前，请先在 AGENTS.md"已知高危区域"中确认状态，并使用 `git blame` 找到历史修复的具体提交。

---

# v9.x 完整版本归档

> 以下为 v9.0.0 ~ v9.0.4 的完整日志（v9.0.5 仍在 AGENTS.md 当前版本区）。

## v9.0.0（服务端权威写入架构重构）

> 📅 归档于 v9.0.5 推送时
> 🎯 **架构分水岭**：从此客户端不再直接写 DB，所有数据变更走云函数

### 核心问题
v7.0.0 以来，同步机制经历了 170+ 处补丁修复（Watch 回声识别 49%、跨设备冲突 20%、余额不一致 19%、写入竞态 12%），形成"补丁螺旋"——每代补丁都在解决上代补丁引入的新问题。根因：客户端同时承担"写入者"和"同步决策者"，缺乏权威冲突仲裁。

### 根因
客户端直接写入 DB → Watch 收到自身回声 → 需要 pendingRegistry 识别 → 多设备并发写入 → 需要 clientId 感知合并 → 余额客户端增量更新可能漂移 → 需要强制重算。v7.28.0 曾尝试云函数写入但因同步等待 2-5 秒而回退。

### 架构变更
所有数据变更通过云函数 `tbMutation` 统一执行，客户端不再直接写入数据库。

| 变更项 | 旧架构 | 新架构 |
|--------|--------|--------|
| 写入方式 | 客户端 `db.collection().add/update()` | `callMutation()` → 云函数写入 |
| 回声识别 | pendingRegistry 精确判断 | 不需要——乐观更新已覆盖，Watch 推送直接跳过 |
| 跨设备冲突 | clientId 感知 + 字段级合并 | 云函数串行化写入，天然互斥 |
| 余额管理 | 客户端增量 + 启动强制重算 | 云函数 `_.inc()` 原子更新 |
| 失败处理 | 两个独立队列 + 云端去重 | 统一 mutationQueue + 持久化 |
| Watch 处理 | 5 种分支（回声/他机/导入/保护期/...） | 3 种统一（add/update/remove） |

### 新增文件
| 文件 | 用途 |
|------|------|
| `cloudbase-functions/tbMutation/index.js` | 统一数据变更云函数（13 个 action） |
| `cloudbase-functions/tbMutation/package.json` | 云函数依赖 |

### 新增客户端代码
| 代码 | 用途 |
|------|------|
| `callMutation(action, data, { onRollback })` | 统一变更入口，fire-and-forget |
| `mutationQueue` + `flushMutationQueue()` | 离线变更队列 + 网络恢复后批量提交 |
| `saveMutationQueue()` / `loadMutationQueue()` | 队列持久化到 localStorage |

### 移除的防御代码
| 机制 | 行数 | 移除原因 |
|------|------|---------|
| pendingRegistry 全部 | ~164 | 客户端不写 DB，无回声需识别 |
| clientId 感知合并 | ~70 | 云函数权威仲裁，无需客户端判断 |
| 余额强制重算 | ~50 | 云函数原子更新，余额始终准确 |
| 陈旧端写入门禁 | ~31 | 客户端不直接写 DB |
| 全局写锁 | ~20 | 云函数天然互斥 |
| 首次同步保护 | ~11 | 云函数保证一致性 |
| WATCH_GRACE_PERIOD | ~8 | 无本地写入冲突 |
| 失败写入重试队列 | ~170 | mutationQueue 统一替代 |
| isSaving/用户操作保护窗口 | ~40 | 不再需要保护本地写入 |

### 简化的代码
| 机制 | 简化前 | 简化后 |
|------|--------|--------|
| Transaction Watch | pendingRegistry 三路判断 + 保护期 | 已存在则跳过，否则合并 |
| Task Watch | clientId 感知字段级合并 | 直接替换 + lastUsed 保护 |
| reconcileCloudAfterWatch | isSaving + 保护窗口 + 节流 | 仅节流冷却期 |
| scheduleWatchReconnect | isSaving + 保护窗口 + 防抖 | 仅全局防抖 |
| loadAll | 余额重算 + pending 保护 + 保存保护期 | 直接读取 cachedBalance |
| saveData | 写入门禁 + 全局写锁 | 仅首次同步保护 + 空数据保护 |

### 云函数 tbMutation 支持的 action
| Action | 核心逻辑 |
|--------|---------|
| addTransaction | 幂等检查 → 写入 → `_.inc()` 余额 → `_.inc()` 每日汇总 |
| updateTransaction | 更新 → 反向旧 daily + 正向新 daily + 余额差量 |
| deleteTransaction | 删除 → 反向余额 + 反向 daily |
| renameTransactionTaskName | 批量更新 taskName |
| saveTask | 查找 → update（`_.set()` 嵌套对象）或 add |
| deleteTask | 查找并删除 |
| startTask | 查找 running → update 或 add |
| stopTask | 查找 running → 删除（3 次重试） |
| updateRunningTask | 查找 running → 更新 |
| saveProfile | 查找 → update（9 个嵌套 key 自动 `_.set()`） |
| updateDailyChange | 查找 → `_.inc()` 或 add |
| updateCachedBalance | 查找 → `_.inc()` 或绝对值设置 |
| recalculateBalance | 分页加载交易 → 累加 → 绝对值写入 |

### v9.0.0 关键修复（vs v7.28.0 失败尝试）
- **错误码标准化**（v9.0.2 完善）：0/410/400/401/1001-1004/429/500/503 体系
- **mutationQueue 持久化**：离线时排队，恢复后批量 flush
- **onRollback 机制**：v9.0.2 才完整化
- **mutationId 幂等**：v9.0.2 引入，24h 缓存防重

### 影响范围
- 新增 1 个云函数（`tbMutation`）
- 删除 ~520 行客户端防御代码
- 净代码量减少 ~480 行
- 11 个版本号位置同步更新（versionCode 30→31）
- **必须部署云函数 tbMutation**（客户端不部署则完全无法工作）
