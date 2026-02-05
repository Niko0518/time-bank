# 睡眠时间管理系统 - 系统性排查报告
**版本**: v7.13.1  
**日期**: 2026-02-05  
**问题来源**: 用户手动补录睡眠记录时遇到的多个问题

---

## 一、问题概述

用户在手动补录睡眠记录时报告了三个问题：

1. **弹窗层级错误**: 确认弹窗显示在手动补录弹窗下方
2. **重复检测提示错误日期**: 补录2月5号记录时提示"2月4号已有记录"
3. **条形图未刷新**: 补录完成后"近7日睡眠"仍显示旧记录

---

## 二、核心时区处理逻辑分析

### 2.1 时间戳生成流程

```
用户输入 → 本地时间字符串 → Date.parse() → 时间戳 → 存储/计算
```

**关键代码**:
```javascript
// submitManualSleep 函数 (L25778-25779)
const sleepStartTime = new Date(`${sleepDate}T${sleepTime}`).getTime();
const wakeTimeMs = new Date(`${wakeDate}T${wakeTime}`).getTime();
```

**时区处理分析**:
- `new Date("2026-02-05T00:05")` 会按**本地时区**解析
- 在北京时间 (UTC+8) 环境下：
  - 输入: `"2026-02-05T00:05"`
  - 解析为: 2026-02-05 00:05 CST (北京时间)
  - 时间戳: 对应 UTC 2026-02-04 16:05
- ✅ **这是正确的行为**

### 2.2 睡眠周期日期计算

**关键代码** (`getSleepCycleDate`, L26090-26100):
```javascript
function getSleepCycleDate(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours();  // 获取本地小时
    
    // 凌晨0:00-11:59入睡，算作前一天的睡眠周期
    if (hour < 12) {
        date.setDate(date.getDate() - 1);
    }
    
    return getLocalDateString(date);
}
```

**问题分析**:
- 北京时间 00:05 → `getHours()` 返回 0 → 减一天 → 睡眠周期日期: 2026-02-04
- 北京时间 21:22 → `getHours()` 返回 21 → 不减 → 睡眠周期日期: 2026-02-03

**用户数据验证**:
| 记录 | 入睡时间(本地) | 入睡时间(UTC) | 本地小时 | 睡眠周期日期 |
|------|---------------|---------------|---------|-------------|
| 自动记录 | 2026-02-03 21:22 | 2026-02-03 13:22 | 21 | 2026-02-03 |
| 手动记录 | 2026-02-05 00:05 | 2026-02-04 16:05 | 0 | 2026-02-04 |

---

## 三、问题深度分析

### 3.1 问题一：重复检测逻辑

**检测代码** (L25795-25802):
```javascript
const cycleDate = getSleepCycleDate(sleepStartTime);
const existingRecord = getSleepRecordForDate(cycleDate);
if (existingRecord) {
    if (!await showConfirm(`${cycleDate} 已有睡眠记录...`)) {
        return;
    }
}
```

**问题根因**:
用户补录的是 2月5号 00:05，按规则应归入 2月4号睡眠周期。
系统检测到 2月4号睡眠周期已有记录（即那条 21:22 入睡的记录），因此提示重复。

**但这里存在逻辑漏洞**:
- 用户撤销了错误的自动记录 (08:05~09:40)
- 但系统仍保留了 2月4号 21:22~09:05 的记录
- 这条记录与补录的 00:05~09:35 属于**同一个睡眠周期日期**

**结论**: 提示"2月4号已有记录"是**正确的行为**，但用户理解有误。

**用户体验问题**:
1. 提示信息不友好，未说明已有记录的具体时间
2. 用户不清楚睡眠周期日期的归类规则

### 3.2 问题二：弹窗层级错误

**样式分析**:
```css
/* .modal 类 (L2691) */
.modal { 
    z-index: 2000;
}

/* .sleep-settings-modal 类 (L3052-3056) */
.sleep-settings-modal { 
    z-index: 2100;
}
```

**问题**:
- 手动补录弹窗 (`#manualSleepModal`): z-index 2100
- 确认弹窗 (`#confirmModal`): z-index 2000
- 当确认弹窗弹出时，应该在补录弹窗**之上**

**实际行为**:
- 确认弹窗显示在补录弹窗**下方**
- 可能是因为确认弹窗使用的是 `.modal` 类，而补录弹窗是 `.sleep-settings-modal`
- 虽然 2100 > 2000，但 DOM 顺序或其他 CSS 可能影响了层级

### 3.3 问题三：条形图未刷新

**条形图渲染代码** (showNightSleepDetailModal, L27215):
```javascript
function showNightSleepDetailModal() {
    // 获取近期7天的睡眠记录
    const today = new Date();
    const recentRecords = [];
    for (let i = 1; i <= 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = getLocalDateString(d);
        const record = getSleepRecordForDate(dateStr);  // ← 从 transactions 查询
        ...
    }
}
```

**问题分析**:
1. 条形图数据来自 `getSleepRecordForDate()` 函数
2. 该函数从 `transactions` 数组查询记录
3. 如果 `addTransaction` 后 `transactions` 未正确更新，条形图会显示旧数据

**可能原因**:
- 异步同步问题：`addTransaction` 是 async，但 UI 更新可能发生在数据同步完成前
- 缓存问题：`getSleepRecordForDate` 可能有缓存机制

---

## 四、数据验证

### 4.1 现有睡眠记录分析

从用户备份数据中提取:

```json
{
  "description": "📝 手动记录 | 睡眠结算",
  "sleepData": {
    "startTime": 1770249928776,  // UTC: 2026-02-04 16:05
    "wakeTime": 1770255639564,    // UTC: 2026-02-05 01:35
    "durationMinutes": 95
  },
  "timestamp": "2026-02-05T01:35:00.000Z",
  "undone": false
}
```

**时间验证**:
- 用户意图: 北京时间 2026-02-05 00:05 ~ 09:35
- 实际存储: 
  - startTime 对应 UTC 16:05 = 北京时间 00:05 ✅
  - wakeTime 对应 UTC 01:35 = 北京时间 09:35 ✅

**结论**: 时间戳存储是**正确的**。

### 4.2 条形图显示问题验证

用户报告条形图仍显示"08:05"的错误记录，但数据文件中已不存在该记录（已被撤销）。

**可能原因**:
1. **Service Worker 缓存**: sw.js 可能缓存了旧数据
2. **内存缓存**: `getSleepRecordForDate` 或相关函数可能缓存了结果
3. **DOM 未刷新**: 弹窗可能是之前打开的，未重新渲染

---

## 五、修复建议

### 5.1 高优先级修复

#### 1. 修复弹窗层级
```css
#confirmModal {
    z-index: 2200 !important;
}
```

#### 2. 改进重复检测提示信息
```javascript
if (existingRecord) {
    const existingTime = formatSleepTimeHM(existingRecord.sleepStartTime);
    const confirmMsg = `${cycleDate} 已有睡眠记录\n` +
                      `已有记录: ${existingTime} 入睡\n` +
                      `新记录: ${sleepTime} 入睡\n\n` +
                      `是否仍要添加？（可能导致重复计算）`;
    if (!await showConfirm(confirmMsg, '记录已存在')) {
        return;
    }
}
```

#### 3. 强制刷新条形图
在 `submitManualSleep` 成功后添加:
```javascript
// 强制刷新睡眠相关 UI
updateSleepCard();
// 如果睡眠详情弹窗已打开，重新加载
const detailModal = document.getElementById('sleepDetailModal');
if (detailModal && !detailModal.classList.contains('hidden')) {
    showNightSleepDetailModal();
}
```

### 5.2 中优先级修复

#### 4. 清除 Service Worker 缓存
在 sw.js 中更新缓存版本号，强制刷新:
```javascript
const CACHE_NAME = 'timebank-cache-v7.13.2';
```

#### 5. 添加睡眠周期日期显示
在手动补录预览中显示睡眠周期日期:
```javascript
function calculateManualSleepPreview() {
    // ... 现有代码 ...
    const cycleDate = getSleepCycleDate(sleepStartTime);
    document.getElementById('sleepCycleDatePreview').textContent = 
        `睡眠周期: ${cycleDate}`;
}
```

---

## 六、总结

| 问题 | 根因 | 严重程度 | 修复难度 |
|------|------|---------|---------|
| 重复检测提示 | 用户不理解睡眠周期归类规则，提示信息不友好 | 中 | 低 |
| 弹窗层级错误 | z-index 设置不当 | 中 | 低 |
| 条形图未刷新 | 可能是缓存或 DOM 更新问题 | 高 | 中 |

**核心建议**:
1. 立即修复弹窗层级和提示信息
2. 强制刷新机制确保数据一致性
3. 增加用户教育（睡眠周期日期概念）
