# 第二部分：版本更新日志（技术日志）

> **目标读者**：技术专家/开发者  
> **目的**：记录关键技术细节，便于技术审计、问题回溯、架构演进理解  
> **风格**：精简、技术导向、代码示例为主  
> 
> ⚠️ **强制规则**：每次更新涉及关键技术细节或重要改动时，必须将其添加到此部分。定期清理已过时的日志，保持内容精炼且具有长期价值。

---

## 📋 两类版本日志的区别

| 维度 | AGENTS.md 技术日志 | HTML 用户日志 |
|------|-------------------|---------------|
| **目标读者** | 技术专家、开发者 | 终端用户 |
| **内容重点** | 架构变更、数据层修改、接口协议、问题根因 | 功能特性、用户体验改进、Bug修复 |
| **写作风格** | 精简、代码示例、行号标注 | 易读、表情符号、用户价值导向 |
| **详细程度** | 关键技术点即可 | 可适度详细，展示工作成果 |
| **内部迭代** | ❌ 不包含（如间距调整、语法修复） | ✅ 可包含（展示细致工作） |

---

## 📝 技术日志记录规范

### 格式要求
- **精简文字**：避免冗长描述，用代码示例替代文字说明
- **标注修改**：代码块注明「修改前 → 修改后」便于回溯
- **关键位置**：标注文件名和大致行号
- **问题链**：复杂问题记录根因链（问题A → 导致B → 表现为C）
- **增量记录**：通过记忆和代码中搜索带有当前版本号的注释综合撰写
- **排除内部修复**：本更新周期内引入又被修复的错误不写入

### ✅ 记录内容（技术导向）
- **优先级门槛**：仅记录会影响长期维护、数据正确性、跨端行为一致性或线上稳定性的改动
- **架构/数据层**：同步机制、存储结构、跨设备一致性、权限/安全规则
- **接口/协议变更**：影响多端或云端数据兼容性的字段/格式变更
- **核心流程重构**：结算逻辑、初始化流程、数据修复工具
- **高风险 Bug 修复**：会导致数据丢失、核心功能不可用的问题

### ❌ 不记录内容
- 纯 UI/样式/间距/文字调整
- 常规显示格式/解析细节微调（除非引发数据错误或跨端不一致）
- 简单数值调整（如数量、间隔、阈值）
- 本周期内引入又修复的内部错误
- 缓存版本号/Service Worker 名称更新

---

## 📝 用户日志指导（HTML 文件中）

**位置**：`index.html` 约第 1301 行，`<details><summary>版本更新日志</summary>` 区域内

**撰写原则**：
- 面向用户，使用通俗易懂的语言
- 使用表情符号增加可读性（🏦 💰 📊 等）
- 突出用户价值："你能获得什么"
- 可包含内部优化（展示团队的细致工作）
- 按版本降序排列，最新版本在最上

**模板**：
```html
<div class="version-history-item">
    <p><strong>版本 vX.X.X (YYYY-MM-DD)</strong> 🏦 <b>大功能名称</b></p>
    <ul>
        <li><strong>[Feat]</strong> 🏦 <b>功能名</b>：用户能感知到的功能描述</li>
        <li><strong>[Fix]</strong> 🛡️ <b>修复项</b>：修复了什么问题，带来什么改善</li>
    </ul>
</div>
```

---

## v7.36.0 (2026-04-09) - 移除自动结算报告机制

**删除内容**：
- `js/app-reports.js`: 删除 `getAutoSettlementReport`, `showAutoSettlementReportModal`, `showAutoNotificationsModal` 等6个函数（~340行）
- `js/app-1.js`: 删除 `autoSettlementNotify` 设置项及启动检查逻辑
- `index.html`: 删除铃铛按钮HTML及 `.btn-auto-notifications` CSS样式
- `css/main.css`: 删除 `.settlement-*` / `.notification-*` 相关样式（~150行）

**保留项**：
- ✅ 所有自动结算核心函数（`settleDailyInterest`, `autoSettleScreenTime`, `checkAbstinenceHabits`）
- ✅ 交易时间戳调整到23:59的逻辑
- ✅ `settledDates` 持久化与云端同步

---

## v7.28.0 (2026-03-29) - 陈旧端写入门禁 + 云函数增量同步

**核心问题**：长期不活跃端重连后将陈旧数据写入云端，覆盖其他设备的新数据

**关键改动**：
1. **写入门禁机制**：`activateCloudSyncWriteLock()` / `releaseCloudSyncWriteLock()`
   - 触发点：启动时lastCloudSyncAt超6h、长休眠恢复
   - 保护：门禁激活时 `saveData()` 直接return，不写云端
   
2. **云函数 timebankSync**：`cloudbase-functions/timebankSync/index.js`
   - `getDelta`: 增量查询（`_updateTime > lastSyncAt`）
   - `writeTransaction`: 幂等写入（已存在→只允许undone=true）
   
3. **DAL新增方法**：
   - `DAL.fetchDelta(lastSyncAt)`: 返回Array或null（云函数未部署时降级）
   - `DAL.writeTransactionSafe(tx)`: 先走云函数，失败降级直接写入

4. **reconcileCloudAfterWatch 增量优先**：
   - 距上次同步<30分钟 → fetchDelta() 增量
   - ≥30分钟 → loadAll() 全量兜底

---

## v7.26.1 (2026-03-28) - JS文件语义拆分

**背景**：`app-3.js` 原为19,235行单文件，AI编辑单次需消耗整个上下文窗口

**拆分方案**：
| 新文件 | 行数 | 功能域 |
|--------|------|-------|
| `js/app-reports.js` | 7,535 | addTransaction、报告系统、通知、权限 |
| `js/app-sleep.js` | 3,124 | 睡眠设置/状态/倒计时/结算/闹钟 |
| `js/app-systems.js` | 5,206 | 设备ID、屏幕时间、均衡模式、金融系统、自动检测 |
| `js/app-auth.js` | 3,370 | 认证登录、数据导入导出、saveData/loadData |

**加载顺序**（不可改变）：
```
app-1.js → app-2.js → app-reports.js → app-sleep.js → app-systems.js → app-auth.js
```

---

## v7.25.4 (2026-03-13) - 多端云同步机制全面增强

**核心问题**：旧同步机制完全依赖CloudBase Watch被动接收，断连后数据不同步

**关键改动**：
1. **主动同步机制**：每30秒检查Watch状态并执行补偿同步
   - `startActiveSync()`: 独立watchdog定时器（递归setTimeout，抗冻结）
   - `checkAndRebuildWatchers(true)`: 检测到断连立即重建
   
2. **数据差异检测**：每5分钟比对云端 `_updateTime` 与本地最大值
   - 若云端有新数据但本地未收到 → 触发补偿同步
   
3. **手动同步按钮**：`manualSync()` 强制重建Watch + 补偿同步

4. **网页端登录恢复增强**：等待时间12s→8s + 重试3次

---

## v7.19.0 (2026-02-21) - 睡眠闹钟可靠性增强

**关键改动**：
1. **系统时钟闹钟同步桥接**：
   - `WebAppInterface.syncSystemAlarm(triggerAtMillis, label)`
   - 入睡倒计时完成后自动同步到系统闹钟（可关闭）
   
2. **闹钟强提醒默认最大化**：
   - `AlarmReceiver` 统一走强提醒通道（PRIORITY_MAX + CATEGORY_ALARM）
   - 支持bypass DND，确保锁屏提醒强度

3. **三开关闹钟模型**：
   - 开启闹钟（持久化）
   - 本次不想闹钟（会话级）
   - 默认同步系统闹钟（持久化）

---

## v7.18.3 (2026-02-13) - 悬浮窗暂停/恢复同步修复

**问题**：悬浮窗点击暂停只影响Android Service，无法通知前端JavaScript

**修复方案**：
1. **广播通信**：
   - `FloatingTimerService.notifyWebView(action, taskName, elapsedTime)`
   - `MainActivity.floatingTimerReceiver` 接收广播并调用 `evaluateJavascript`
   - `window.__onFloatingTimerAction(action, taskName, elapsedTime)` 全局回调

2. **强同步机制**：
   - 前端pauseTask/resumeTask先操作悬浮窗，再查询同步状态
   - 若有悬浮窗时间，完全以其为准（elapsedTime = serviceTime）
   - 查询延迟50ms，确保悬浮窗已更新状态

---

## v7.16.0 (2026-02-10) - 统一睡眠模式（智能检测）

**核心改动**：
1. **睡眠模式合并**：移除午睡/夜间切换，统一为"开始睡眠"按钮
   - `detectSleepType(startTime, wakeTime)`: 智能判断夜间/小睡
     * 入睡时间20:00~06:00 → 夜间
     * 或睡眠时长≥240分钟 → 夜间
     * 其他 → 小睡

2. **新增 sleepData.sleepType 字段**：
   - 新事务统一使用sleepData，内含sleepType: 'night'|'nap'
   - 旧napData记录在DAL.loadAll加载时自动归一化

3. **结算确认弹窗**：
   - 结束睡眠 → 弹出确认弹窗（显示检测结果，可切换类型）
   - 夜间: calculateSleepReward() 完整奖惩
   - 小睡: 达标判定（≥napDurationMinutes → 固定奖励）

---

## v7.15.2 (2026-02-09) - 金融系统稳定性修复

**核心问题**：`settleDailyInterest()` 结算后未调用 `saveFinanceSettings()`，导致settledDates仅存内存，重启后重复结算同一天

**关键修复**：
1. **settledDates持久化**：在 `settleDailyInterest()` 保存段首行添加 `saveFinanceSettings()`

2. **金融系统全量云端统一同步**：
   - `applyFinanceDataFromCloud(doc)`: 同时处理financeSettings + interestLedger
   - settledDates: 取本地与云端并集 + 60天裁剪
   - Profile watch handler: 监听financeSettings + interestLedger变更

3. **recalculateInterestOnUndo重写**：
   - 正向累积法：过滤利息交易，按日期分组累加各日余额
   - 对受影响日期重算利息，与实际利息交易对比生成差额调整

4. **导入速度优化**：
   - `clearAllData()`: 自定义规则表改用where().remove()批量删除
   - 交易导入BATCH_SIZE从50提升到100

---

## v7.11.2 (2026-02-02) - 设置重启后丢失问题（三层问题修复）

**问题链**：
```
问题1: WebView localStorage不可靠
    ↓ 修复后发现
问题2: initApp()中updateNotificationSettingsUI()崩溃，阻断后续init函数
    ↓ 修复后发现  
问题3: 分类标签存储位置分离，initScreenTimeSettings未从profile.screenTimeCategories恢复
```

**关键修复**：
1. **Android原生存储**：
   - `WebAppInterface.saveScreenTimeSettingsNative(json)` / `getScreenTimeSettingsNative()`
   - 同理: saveSleepSettingsNative, getSleepSettingsNative

2. **防止initApp中断**：
   ```javascript
   try { updateNotificationSettingsUI(); } catch (e) { console.error(e); }
   try { initScreenTimeSettings(); } catch (e) { console.error(e); }
   try { initSleepSettings(); } catch (e) { console.error(e); }
   ```

3. **分类标签从云端恢复**：
   - `initScreenTimeSettings()` 中添加从 `DAL.profileData.screenTimeCategories` 恢复逻辑

---

## v7.9.4 (2026-01-26) - 自动重新登录功能

**关键改动**：
1. **CloudBase SDK持久化配置**：
   ```javascript
   app = sdk.init({ env: TCB_ENV_ID, region: 'ap-shanghai', persistence: 'local' });
   ```

2. **Android端凭据存储**：
   - `saveLoginCredentials(email, password)`: 保存邮箱和Base64编码的密码
   - `getSavedLoginPassword()`: 读取解码后的密码
   - `isAutoLoginEnabled()`: 检查是否启用自动登录

3. **自动重新登录逻辑**：
   - `tryAutoReLogin()`: 从SharedPreferences获取凭据并执行登录
   - 登录成功后加载云端数据

---

## v6.6.0 - 多表架构迁移

**核心改动**：从单一JSON迁移到5张独立表
- `tb_profile`: 用户资料
- `tb_task`: 任务列表
- `tb_transaction`: 交易记录
- `tb_running`: 运行中任务
- `tb_daily`: 每日统计

**DAL设计**：统一数据访问层，封装CloudBase CRUD操作

---

*最后更新: 2026-04-09 (v7.36.0)*
