# TimeBank 后端大扫描报告（v9.37.0）

> 扫描时间：2026-09-19
> 范围：CloudBase 环境配置 / 6 个云函数 / 18 个集合与索引 / 前端调用链
> 方式：CloudBase MCP（环境、函数、数据库结构、云 API）+ 代码级审查 + 真机/网关实测
> 状态：**已完成 P0/P1 修复并部署验证**，P2 与长期项见文末

---

## 一、结论摘要

| 指标 | 扫描前 | 扫描后 |
|---|---|---|
| 增量同步 | **恒返回空**（游标字段全库不存在，链路从未生效） | 实测返回真实数据（9 条 / 148ms） |
| 公开 HTTP 入口 | 任何人可 POST 冒用 openid、消耗 AI 资源点 | 无密钥 → 401；带密钥 → 正常 |
| 硬编码密钥 | 云函数源码内置 CloudBase 服务端 API Key | 已移除，仅走环境变量 |
| 跨用户越权 | `markMessagesRead` 可改写他人消息 `_openid` | 已限定 `_openid` 且改为单次批量更新 |
| 缺失索引 | 11 处高频查询无索引（交易表 7045 条 / 5.3MB） | 已补 7 个复合索引（云 API 创建，实测 ok） |
| tb_profile 读放大 | 每笔交易整读 113KB 文档 | 改为增量更新（免读）/ 投影只取 `_id` |

---

## 二、P0 级问题与修复（已上线）

### P0-1 增量同步从未生效（本次最重要）

**证据**
- 全集合文档均无 `_updateTime` 字段：`tb_transaction` 7045/7045、`tb_task` 119/119、`tb_daily` 348/348、`tb_profile` 5/5、`tb_running` 3/3。
- 而旧实现所有增量查询都以 `_updateTime` 为条件 → 查询恒为空。
- CloudBase 的 `_id` 形如 `df17f1cc6aadf56b00ff30ce015b0f12`，时间戳在第 **8–16** 位（非前 8 位），不能当时间游标。
- 实测 `timestamp` 为 ISO 字符串（7045/7045），字典序即时间序，且已有 `(_openid, timestamp)` 索引。

**修复**（`cloudbase-functions/timebankSync/index.js`）
- 游标改为 `timestamp`（ISO 字符串）+ `(_id)` 复合推进，兼容数字型 `timestamp`、`updatedAt`、`_updateTime`。
- `tb_transaction` 走增量分页（单页 1000＝平台上限，最多 10 页）；`task/daily/profile/running` 体量小直接全量，天然不漏。
- 返回 `maxUpdateTime`（毫秒）供客户端续传，`hasMore` 标记未拉完。
- 同时显式解析环境：旧写法在 node-sdk 2.x 下会退化为「默认第一个创建的环境」，存在连错环境风险（已实测到该警告日志），现按 `TCB_ENV/SCF_NAMESPACE` 兜底，并统一 SDK 到 `^3.18.3`。

**验证**：`getDelta(lastSyncAt=今日0点)` → `count: 9`、`maxUpdateTime: 1789793394388`、`hasMore: false`、`Duration 148ms`。

### P0-2 硬编码 AI 服务端密钥

- 位置：`timebankAI/index.js` 原 `CLOUDBASE_AI_API_KEY_BUILTIN`（JWT 明文写死，且注释自承已泄漏）。
- 修复：删除常量，密钥只读环境变量 `CLOUDBASE_AI_API_KEY`（已在云端配置，799 字符）；缺失时相关 action 返回 503。
- **待你操作**：到控制台吊销并重新创建该 API Key（旧 Key 已随仓库/函数包外泄）。

### P0-3 公开 HTTP 入口可被任意调用

- 问题：`timebankAI` 的 HTTP 触发地址是公开网关，且身份取自请求体 `_openid`，任何人可冒充或纯粹刷 AI 资源点。
- 修复：新增 `TB_CLIENT_KEY` 共享密钥校验（请求体 `__clientKey` 或 `X-TB-Client-Key` 头）；未配置时保持旧行为。
  - 云端已配置 `TB_CLIENT_KEY`（48 位随机），前端 `config.production.json` 已同步（两处）。
  - 前端 `callViaHTTP` 自动携带该密钥。
- **验证**：不带密钥 → `{"code":401,"message":"未授权：客户端校验失败"}`；带密钥 → `code:0` 正常返回。
- 注意：旧版本客户端未带密钥，其 HTTP 兜底通道会被拒（主用的 SDK 直连不受影响）；安装本版本后恢复正常。

### P0-4 跨用户越权写入（数据错乱风险）

- 位置：`timebankAI.handleMarkMessagesRead` —— 逐条 `doc(id).update({ isRead: true, _openid: uid })`：
  - ① 未按 `_openid` 过滤，任何 `_id` 都会命中并把其 `_openid` **改写成当前用户**；
  - ② N 条消息 = N 次串行往返。
- 修复：改为一次批量更新 `where({ _id: _.in(ids), _openid: uid }).update({ isRead: true })`，不再写 `_openid`。

---

## 三、P1 级问题与修复（已上线）

| # | 问题 | 位置 | 修复 |
|---|---|---|---|
| P1-1 | 每次调用都尝试 `createCollection`（N 次无效往返） | `timebankAI.ensureCollections` | 实例级开关，仅首次执行 |
| P1-2 | `getMessages` 分页失效（先 limit 再 slice） | `timebankAI.handleGetMessages` | 改为查询层 `skip`，参数做上限保护 |
| P1-3 | 首页状态串行 3 次读 | `timebankAI.handleGetHomeState` | 改 `Promise.all` 并行 |
| P1-4 | 每笔交易整读 113KB `tb_profile` 只为拿 `_id` | `tbMutation._updateCachedBalance` | 增量更新免读；绝对写入只投影 `_id` |
| P1-5 | 每次调用新建 `Intl.DateTimeFormat` | `tbMutation._getLocalDateString` | 模块级复用 |
| P1-6 | 索引自愈调用不存在的 API（`createIndex is not a function`） | `tbMutation.ensureIndexes` | 移除无效调用，索引改由云 API 统一维护 |
| P1-7 | 游标累加用 `concat`（大增量 O(n²) 分配） | `timebankSync.getDelta` | 改 `push` |
| P1-8 | `transactionWatcher` 查不存在的 `createdAt` 字段 | `transactionWatcher/index.js` | 改为 `timestamp` 数值比较（该函数随管家 Hermes 停用，未部署） |
| P1-9 | `timebankAI` 超时 900s 与业务不匹配 | `cloudbaserc.json` + 云端 | 下调至 120s |
| P1-10 | SDK 版本漂移（`latest` / 2.5.0） | `tbMutation`、`timebankSync` | 统一锁定 `^3.18.3` |

---

## 四、索引变更（云 API `RunCommands`，全部实测 `ok: 1.0`）

| 集合 | 新增索引 | 支撑查询 |
|---|---|---|
| `tb_transaction` | `(_openid, txId)`、`(_openid, taskId)` | 交易存在性检查（每笔增/改/删）、批量改名 |
| `tb_running` | `(_openid, taskId)` | 启停/更新运行任务 |
| `tb_task` | `(_openid, _updateTime)` | 增量同步 |
| `tb_profile` | `(_openid, _updateTime)` | 增量同步 |
| `tb_daily` | `(_openid, _updateTime)` | 增量同步 |
| `tb_ai_messages` | `(_openid, type, createdAt)` | 对话历史 / 报告读取（最高频 AI 读路径） |

已有并确认可用：`tb_transaction(_openid,_updateTime)`、`(_openid,_id)`、`(_openid,timestamp)`、`tb_task(_openid,taskId)`、`tb_daily(_openid,date)`、`tb_profile(_openid)`、`tb_ai_brain(_openid)`。

> 发现一个**无用索引**：`tb_transaction.openid_timestamp_idx_v2`（索引的是 `data.timestamp` 路径，访问次数 0，占 200KB）。未自动删除（避免不可逆操作），建议你在控制台「数据库 → 索引管理」中手动删除。

---

## 五、云端配置变更记录

| 项 | 变更 |
|---|---|
| `timebankAI` 环境变量 | 新增 `TB_CLIENT_KEY`；确认 `CLOUDBASE_AI_API_KEY` 等 7 项在位 |
| `timebankAI` 超时 | 900s → 120s |
| 部署 | `timebankAI`、`timebankSync`、`tbMutation` 三函数已更新并 Active |
| 云端多余函数 | `tbTxDataCleanup`（本地无对应代码）为孤儿函数；`transactionWatcher` 已停用 → 建议后续确认后删除 |

---

## 六、未做与建议（需你决策）

1. **双 openid 数据分裂**（建议尽快处理）：`tb_transaction` 中 `2011857504337661952` 6286 条（当前登录用户）、`2017556634380800000` 758 条（旧账号，Hermes 曾指向它）、`test-debug-openid` 1 条（测试垃圾）。这会导致"同一人看到两套数据"，且 Hermes 报告曾写到旧账号下。建议明确主账号后，一次性迁移或清理旧数据。
2. **写入侧补 `updatedAt`**（长期更稳）：当前游标依赖 `timestamp` 为 ISO 字符串这一事实。建议前端与 `tbMutation` 在写入时统一补 `updatedAt: Date.now()`，增量游标即可完全摆脱类型假设（本次已在读侧兼容该字段）。
3. **前端 Watch 超 5000 文档上限**：真机日志持续出现 `Exceed max docs number 5000` 并每 3 秒重建。
   → **已实施（方案 C，前端侧）**：
   - `activeSync` 轮询间隔 30s → **10s**（前置条件已具备：v9.12.3 已移除每 tick 的 `__fixCompletionCount` O(N×M) 热点）；
   - 增量拉取改为**前端直连数据库**（显式带 `_openid`，走 `(_openid, timestamp)` 索引；安全规则要求），失败自动回退云函数通道 → 云函数调用约 8640 次/天 → 0；
   - 修复前端三处**同源缺陷**（均因 `_updateTime` 全库不存在而失效）：
     `DAL.fetchRunningDelta`（跨设备"运行中任务"同步实际无效）、
     `DAL.getLatestTransactionUpdateTime`（新鲜度检测恒返回 0）、
     `startDataDiffDetection` 的差异检测（排序恒空）、
     以及原生层差集合并的 `maxUpdateTime` 游标（恒为 0 → MainActivity 的注入条件 `"maxUpdateTime":0` 永不通过 → 后台差集从未注入 WebView，且原生游标反复归零导致重复全量）。
   - 预期：跨端同步 **30 秒 → 10 秒级**；亚秒级实时仍待方案 A（信号集合 + 单文档 Watch）。
4. **废弃集合**：`tb_ai_data_mirror / tb_ai_feedback / tb_ai_memory / tb_ai_sync_schedule / tb_ai_user_brain / tb_ai_incremental_log / tb_ai_external_import` 全仓库 0 引用，可清理。
5. **重复工程**：`timebank-commercial/cloudbase-functions/` 与主目录同名镜像，本次改动未同步（如需保持一致请告知）。
6. **taskLock 非原子 CAS**：`cache.get` 后 `cache.set`，双端极端并发下可能同时持锁（影响面小，建议后续用条件写）。

---

## 七、验证证据速查

- 增量同步：`getDelta` → `count: 9`、`hasMore: false`、148ms（部署后实测）
- 入口鉴权：无密钥 `401 客户端校验失败` / 带密钥 `code:0`
- 索引：6 个集合 `numIndexesBefore → After` 均返回 `ok: 1.0`
- 字段取证：`$type` 聚合确认 `timestamp` 全为 string；`$exists:false` 计数确认 `_updateTime` 全库缺失
- 函数状态：`timebankAI` / `timebankSync` / `tbMutation` 均 `Active`，`ModTime` 为本次部署时间
