// [v7.21.1] 已删除: highlightIncompleteHabits 函数

// --- Data Handling ---
// [v6.6.0] 修改为支持云端同步
// [v7.9.8] 修复：timestamp 格式统一为 ISO 字符串
// [v7.30.1] 改为 fire-and-forget：云端同步不阻塞主线程
// [v7.30.8-fix] 修复：添加交易后重新计算余额
function addTransaction(transaction) {
    if (typeof transaction.timestamp === 'number') {
        transaction.timestamp = new Date(transaction.timestamp).toISOString();
    } else {
        transaction.timestamp = transaction.timestamp || new Date().toISOString();
    }
    transaction.id = transaction.id || (Date.now().toString() + Math.random().toString(36).substr(2, 9));
    transaction.isStreakAdvancement = transaction.isStreakAdvancement || false;
    transactions.unshift(transaction);
    transactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // [v7.30.8-fix] 重新计算余额，确保 UI 显示正确
    recomputeBalanceAndDailyChanges();

    // [v7.30.1] 云端同步改为 fire-and-forget，不阻塞 UI
    if (isLoggedIn()) {
        DAL.addTransaction(transaction).catch(err => {
            console.error('[addTransaction] ❌ 云端同步失败:', err.code, err.message);
        });
    }
}
function updateDailyChanges(type, amount, date = new Date()) { 
    const dateString = getLocalDateString(date); 
    if (!dailyChanges[dateString]) dailyChanges[dateString] = { earned: 0, spent: 0 }; 
    dailyChanges[dateString][type] += amount; 
}

// [v7.14.0] 强制重新计算指定日期的 dailyChanges，覆盖可能残留的错误缓存
function recalculateDailyStats(targetDate) {
    const dateString = typeof targetDate === 'string' ? targetDate : getLocalDateString(targetDate);
    
    // 重置该日期的统计
    dailyChanges[dateString] = { earned: 0, spent: 0 };
    
    // 重新统计该日期的所有交易
    transactions.forEach(tx => {
        if (tx.undone) return;
        const txDate = getLocalDateString(new Date(tx.timestamp));
        if (txDate === dateString) {
            const amount = tx.amount || 0;
            if (tx.type === 'earn') {
                dailyChanges[dateString].earned += amount;
            } else {
                dailyChanges[dateString].spent += amount;
            }
        }
    });
    
    console.log(`[recalculateDailyStats] ${dateString}:`, dailyChanges[dateString]);
}

// --- Reports Tab ---
function setupReportEventListeners() { 
    document.getElementById('heatmapPrevMonth').addEventListener('click', () => navigateHeatmap(-1)); 
    document.getElementById('heatmapNextMonth').addEventListener('click', () => navigateHeatmap(1)); 
}
function updateAllReports() { 
    updateActivityHeatmap(); 
    updateAnalysisDashboard(); 
    updateDetailedDataTable(); 
    updateTrendChart(); 
}

function normalizeDeletedTaskCategoryMap(rawMap) {
    const normalized = {};
    if (!rawMap || typeof rawMap !== 'object') return normalized;
    Object.entries(rawMap).forEach(([taskId, entry]) => {
        if (!taskId || !entry || typeof entry !== 'object') return;
        const category = typeof entry.category === 'string' ? entry.category.trim() : '';
        if (!category) return;
        normalized[String(taskId)] = {
            category,
            taskName: typeof entry.taskName === 'string' ? entry.taskName : '',
            taskType: typeof entry.taskType === 'string' ? entry.taskType : '',
            deletedAt: entry.deletedAt || null
        };
    });
    return normalized;
}

function getDeletedTaskCategoryFromMap(taskId, taskName = '') {
    if (taskId) {
        const hit = deletedTaskCategoryMap[String(taskId)];
        if (hit && hit.category) return hit.category;
    }
    if (taskName) {
        const name = String(taskName).trim();
        if (name) {
            const hitByName = Object.values(deletedTaskCategoryMap).find(entry => entry && entry.taskName === name && entry.category);
            if (hitByName) return hitByName.category;
        }
    }
    return null;
}

function rememberDeletedTaskCategory(task) {
    if (!task || !task.id) return;
    const taskId = String(task.id);
    const fallbackCategory = getDeletedTaskCategoryFromMap(taskId, task.name) || task.category || null;
    if (!fallbackCategory) return;

    const previous = deletedTaskCategoryMap[taskId] || {};
    deletedTaskCategoryMap[taskId] = {
        category: fallbackCategory,
        taskName: task.name || previous.taskName || '',
        taskType: task.type || previous.taskType || '',
        deletedAt: new Date().toISOString()
    };

    if (isLoggedIn()) {
        DAL.saveProfile({ deletedTaskCategoryMap: _.set(deletedTaskCategoryMap) }).catch(err => {
            console.error('[rememberDeletedTaskCategory] 云端同步失败:', err.message || err);
        });
    }
}

// [v5.2.0] 获取 transaction 的分类（支持系统任务）
// [v5.10.0] 支持屏幕时间的自定义分类
function getTransactionCategory(t) {
    // 系统任务处理
    if (t.isSystem) {
        // [v7.9.3] 屏幕时间：始终使用当前设置的分类（强制覆盖记录中的分类）
        if (t.systemType === 'screen-time' || t.taskName === '屏幕时间管理') {
            if (t.type === 'earn' && screenTimeSettings.earnCategory) {
                return screenTimeSettings.earnCategory;
            }
            if (t.type === 'spend' && screenTimeSettings.spendCategory) {
                return screenTimeSettings.spendCategory;
            }
            // [v7.16.1] 默认分类改为“屏幕”
            return SCREEN_TIME_CATEGORY;
        }
        // [v7.9.3] 睡眠时间：始终使用当前设置的分类（强制覆盖记录中的分类）
        // [v7.9.7] 兼容历史数据（带图标任务名）
        if (t.sleepData || t.taskName === '睡眠时间管理' || t.taskName === '😴 睡眠时间管理' || t.taskName === '小睡' || t.taskName === '💤 小睡') {
            if (t.type === 'earn' && sleepSettings.earnCategory) {
                return sleepSettings.earnCategory;
            }
            if (t.type === 'spend' && sleepSettings.spendCategory) {
                return sleepSettings.spendCategory;
            }
            // [v7.16.1] 默认分类改为“睡眠”
            return SLEEP_CATEGORY;
        }
        // [v7.16.1] 利息交易默认分类“利息”
        // [v7.30.5] 删除 interest-adjust 判断（利息重算机制已移除）
        if (t.systemType === 'interest') {
            return INTEREST_CATEGORY;
        }
        return SYSTEM_CATEGORY;
    }
    // 普通任务从 tasks 数组查找
    const task = tasks.find(tsk => tsk.id === t.taskId);
    if (task && task.category) return task.category;
    if (t.category) return t.category;
    const mappedCategory = getDeletedTaskCategoryFromMap(t.taskId, t.taskName);
    return mappedCategory || '未知';
}

// [v5.2.0] 安全获取分类颜色（支持系统分类）
// [v7.16.1] 系统子分类动态选色，避开用户已选颜色
function getCategoryColorSafe(category) {
    if (category === SYSTEM_CATEGORY) return SYSTEM_CATEGORY_COLOR;
    if (category === INTEREST_CATEGORY) return INTEREST_CATEGORY_COLOR;
    if (category === SCREEN_TIME_CATEGORY) {
        const used = new Set(categoryColors.values());
        return SCREEN_TIME_COLORS.find(c => !used.has(c)) || SCREEN_TIME_COLORS[0];
    }
    if (category === SLEEP_CATEGORY) return SLEEP_CATEGORY_COLOR;
    return categoryColors.get(category) || '#888';
}

function getFilteredTransactions(period, sortBy = 'desc') { 
    let filtered = transactions.filter(t => !t.undone);
    if (period !== 'all') {
        const now = new Date(); 
        let startDate; 
        if (period === '1d') startDate = new Date(new Date().setDate(now.getDate() - 1)); 
        else if (period === '3d') startDate = new Date(new Date().setDate(now.getDate() - 3)); 
        else if (period === '7d') startDate = new Date(new Date().setDate(now.getDate() - 7)); 
        else if (period === '30d') startDate = new Date(new Date().setDate(now.getDate() - 30)); 
        filtered = filtered.filter(t => new Date(t.timestamp) >= startDate);
    }
    filtered.sort((a, b) => (sortBy === 'asc' ? new Date(a.timestamp) - new Date(b.timestamp) : new Date(b.timestamp) - new Date(a.timestamp)));
    return filtered; 
}

// [v5.8.0] 格式化时间为 HH:MM
function formatTimeHM(date) {
    const d = new Date(date);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

// [v5.8.0] 从交易描述中提取真实时长（倍率换算前）
function extractRealDurationFromTransaction(t, task) {
    // 尝试从 description 中解析 "(时长 × 倍率)" 格式
    if (t.description) {
        const match = t.description.match(/\(([^)]+)\s*×\s*[\d.]+\)/);
        if (match) {
            const realSeconds = parseDurationTextToSeconds(match[1]);
            if (realSeconds > 0) return realSeconds;
        }
    }
    
    // 如果解析失败，尝试通过任务倍率反推
    if (task && task.multiplier && task.multiplier > 0) {
        // 连续类任务：amount = 真实时长 × 倍率
        if (['continuous', 'continuous_target', 'continuous_redeem'].includes(task.type)) {
            return Math.abs(t.amount) / task.multiplier;
        }
    }
    
    // 其他情况（奖励任务、即时消费等）：amount 就是真实时长
    return Math.abs(t.amount);
}

// [v5.8.0] 多天连续时间流图状态
let multiDayFlowState = {
    currentDate: null,   // 当前显示的日期
    oldestDate: null,    // 最早加载的日期
    newestDate: null,    // 最新加载的日期
    isLoading: false     // 防止重复加载
};

// [v5.8.0] 获取多天时间段数据（不截断跨午夜任务）
function getMultiDayFlowSlots(endDate, days) {
    const slots = [];
    const SHORT_PAUSE_THRESHOLD = 10 * 60 * 1000;
    const processedTransactions = new Set(); // 防止重复处理
    
    // 计算日期范围
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    
    // 获取范围内所有交易（包括开始时间可能在范围外的跨天任务）
    // 扩展搜索范围：往前多搜1天以捕获跨午夜任务
    const searchStart = new Date(startDate);
    searchStart.setDate(searchStart.getDate() - 1);
    
    transactions.filter(t => {
        if (t.undone) return false;
        const tDate = new Date(t.timestamp);
        // 交易结束时间在搜索范围内
        return tDate >= searchStart && tDate <= endDateTime;
    }).forEach(t => {
        if (processedTransactions.has(t.id)) return;
        processedTransactions.add(t.id);
        
        const task = tasks.find(tsk => tsk.id === t.taskId);
        const isSleepRecord = t.sleepData || t.taskName === '睡眠时间管理' || t.taskName === '😴 睡眠时间管理' || t.taskName === '小睡' || t.taskName === '💤 小睡';
        if (!task && !t.isSystem) return;
        if (t.isSystem && !isSleepRecord) return;
        if (t.description && (t.description.startsWith('自动补录:') || t.description.startsWith('自动修正:'))) return;
        
        let endTime;
        let taskStartTime;
        let realDurationSeconds;
        if (isSleepRecord) {
            const sleepStart = t.sleepData?.startTime;
            const sleepEnd = t.sleepData?.wakeTime;
            if (!sleepStart || !sleepEnd) return;
            taskStartTime = new Date(sleepStart);
            endTime = new Date(sleepEnd);
            realDurationSeconds = Math.max(0, (endTime.getTime() - taskStartTime.getTime()) / 1000);
        } else {
            endTime = new Date(t.timestamp);
            realDurationSeconds = extractRealDurationFromTransaction(t, task);
            taskStartTime = new Date(endTime.getTime() - realDurationSeconds * 1000);
        }
        
        // 检查任务是否与显示范围有交集
        if (endTime < startDate || taskStartTime > endDateTime) return;
        
        const color = getCategoryColorSafe(getTransactionCategory(t));
        const taskName = isSleepRecord ? (t.taskName || (t.sleepData?.sleepType === 'nap' ? '小睡' : '睡眠时间管理')) : (task?.name || '未知任务');
        const isSpend = isSleepRecord ? (t.type === 'spend') : (task && ['instant_redeem', 'continuous_redeem'].includes(task.type));
        
        // 处理暂停历史
        if (t.pauseHistory && t.pauseHistory.length > 0) {
            const significantPauses = t.pauseHistory.filter(p => 
                p.pauseEnd && (p.pauseEnd - p.pauseStart) >= SHORT_PAUSE_THRESHOLD
            );
            
            if (significantPauses.length === 0) {
                addMultiDaySlot(slots, t, taskStartTime, endTime, taskName, color, isSpend, 'only', null, null, startDate, endDateTime, 0, 1, null, null, isSleepRecord ? realDurationSeconds : undefined);
            } else {
                let currentStart = taskStartTime;
                const totalSegments = significantPauses.length + 1;
                
                for (let i = 0; i < significantPauses.length; i++) {
                    const pause = significantPauses[i];
                    const pauseStart = new Date(pause.pauseStart);
                    const pauseEnd = new Date(pause.pauseEnd);
                    const segmentType = i === 0 ? 'first' : 'middle';
                    
                    if (pauseStart > currentStart) {
                        addMultiDaySlot(slots, t, currentStart, pauseStart, taskName, color, isSpend, segmentType,
                            null, formatTimeHM(pauseStart), startDate, endDateTime, i, totalSegments, pause.pauseStart, pause.pauseEnd, isSleepRecord ? realDurationSeconds : undefined);
                    }
                    currentStart = pauseEnd;
                }
                
                if (currentStart < endTime) {
                    const lastPause = significantPauses[significantPauses.length - 1];
                    addMultiDaySlot(slots, t, currentStart, endTime, taskName, color, isSpend, 'last',
                        formatTimeHM(new Date(lastPause.pauseEnd)), null, startDate, endDateTime, significantPauses.length, totalSegments, null, null, isSleepRecord ? realDurationSeconds : undefined);
                }
            }
        } else {
            addMultiDaySlot(slots, t, taskStartTime, endTime, taskName, color, isSpend, 'only', null, null, startDate, endDateTime, 0, 1, null, null, isSleepRecord ? realDurationSeconds : undefined);
        }
    });
    
    return slots.sort((a, b) => a.start - b.start);
}

// 辅助函数：添加多天时间段（不截断）
function addMultiDaySlot(slots, t, startTime, endTime, taskName, color, isSpend, segmentType, resumeTime, pauseTime, rangeStart, rangeEnd, segmentIndex = 0, totalSegments = 1, pauseStartTs = null, pauseEndTs = null, durationSecondsOverride = null) {
    // 裁剪到显示范围（但不按天截断）
    let slotStart = new Date(Math.max(startTime.getTime(), rangeStart.getTime()));
    let slotEnd = new Date(Math.min(endTime.getTime(), rangeEnd.getTime()));
    
    if (slotEnd <= slotStart) return;
    
    // 原始任务完整时长（用于判断是否显示时间标签）
    const originalDurationMinutes = (endTime - startTime) / (60 * 1000);
    
    slots.push({
        id: t.id + (segmentIndex > 0 ? '_seg' + segmentIndex : ''),
        taskId: t.taskId,
        transactionId: t.id,
        start: slotStart,
        end: slotEnd,
        originalStart: startTime, // 保留原始时间用于显示
        originalEnd: endTime,
        durationSeconds: Number.isFinite(durationSecondsOverride) ? durationSecondsOverride : Math.abs(t.amount),
        realDurationSeconds: (slotEnd - slotStart) / 1000,
        durationMinutes: originalDurationMinutes, // 使用原始时长判断显示
        taskName,
        color,
        isSpend,
        segmentType,
        segmentIndex,
        totalSegments,
        resumeTime,
        pauseTime,
        pauseStartTs,
        pauseEndTs
    });
}

// [v5.8.0] 获取当天时间段数据
function getFlowTimeSlots(date) {
    const dateStr = getLocalDateString(date);
    const slots = [];
    const SHORT_PAUSE_THRESHOLD = 10 * 60 * 1000; // 10分钟阈值
    
    transactions.filter(t => !t.undone && getLocalDateString(t.timestamp) === dateStr)
        .forEach(t => {
            const task = tasks.find(tsk => tsk.id === t.taskId);
            const isSleepRecord = t.sleepData || t.taskName === '睡眠时间管理' || t.taskName === '😴 睡眠时间管理' || t.taskName === '小睡' || t.taskName === '💤 小睡';
            const isSpend = isSleepRecord ? (t.type === 'spend') : (task && ['instant_redeem', 'continuous_redeem'].includes(task.type));
            // 排除系统任务和无任务关联的交易（如时间调整）
            if (!task && !t.isSystem) return;
            // 排除非睡眠的系统任务
            if (t.isSystem && !isSleepRecord) return;
            // 排除自动补录的漏记和多记
            if (t.description && (t.description.startsWith('自动补录:') || t.description.startsWith('自动修正:'))) return;
            
            let endTime;
            let taskStartTime;
            let realDurationSeconds;
            if (isSleepRecord) {
                const sleepStart = t.sleepData?.startTime;
                const sleepEnd = t.sleepData?.wakeTime;
                if (!sleepStart || !sleepEnd) return;
                taskStartTime = new Date(sleepStart);
                endTime = new Date(sleepEnd);
                realDurationSeconds = Math.max(0, (endTime.getTime() - taskStartTime.getTime()) / 1000);
            } else {
                endTime = new Date(t.timestamp);
                realDurationSeconds = extractRealDurationFromTransaction(t, task);
                taskStartTime = new Date(endTime.getTime() - realDurationSeconds * 1000);
            }
            
            const color = getCategoryColorSafe(getTransactionCategory(t));
            const taskName = isSleepRecord ? (t.taskName || (t.sleepData?.sleepType === 'nap' ? '小睡' : '睡眠时间管理')) : (task?.name || (t.isSystem ? '系统任务' : '未知任务'));
            
            // [v5.8.0] 如果有 pauseHistory，构建活动段和暂停区间
            if (t.pauseHistory && t.pauseHistory.length > 0) {
                // 先过滤/合并短暂停（<10分钟）
                const significantPauses = [];
                for (const pause of t.pauseHistory) {
                    if (!pause.pauseEnd) continue; // 跳过未结束的暂停
                    const pauseDuration = pause.pauseEnd - pause.pauseStart;
                    if (pauseDuration >= SHORT_PAUSE_THRESHOLD) {
                        significantPauses.push(pause);
                    }
                }
                
                if (significantPauses.length === 0) {
                    // 所有暂停都<10分钟，视为连续任务
                    addSingleSlot(slots, t, taskStartTime, endTime, taskName, color, isSpend, dateStr, date, 'only', null, null, 0, 1, null, null, isSleepRecord ? realDurationSeconds : undefined);
                } else {
                    // 有显著暂停，拆分为多段
                    let currentStart = taskStartTime;
                    const totalSegments = significantPauses.length + 1;
                    
                    for (let i = 0; i < significantPauses.length; i++) {
                        const pause = significantPauses[i];
                        const pauseStart = new Date(pause.pauseStart);
                        const pauseEnd = new Date(pause.pauseEnd);
                        const segmentType = i === 0 ? 'first' : 'middle';
                        
                        // 添加活动段
                        if (pauseStart > currentStart) {
                            addSingleSlot(slots, t, currentStart, pauseStart, taskName, color, isSpend, dateStr, date, segmentType, 
                                null, formatTimeHM(new Date(pause.pauseStart)), i, totalSegments, pause.pauseStart, pauseEnd.getTime(), isSleepRecord ? realDurationSeconds : undefined);
                        }
                        currentStart = pauseEnd;
                    }
                    
                    // 最后一段
                    if (currentStart < endTime) {
                        const lastPause = significantPauses[significantPauses.length - 1];
                        addSingleSlot(slots, t, currentStart, endTime, taskName, color, isSpend, dateStr, date, 'last',
                            formatTimeHM(new Date(lastPause.pauseEnd)), null, significantPauses.length, totalSegments, null, null, isSleepRecord ? realDurationSeconds : undefined);
                    }
                }
            } else {
                // 无暂停历史，单独一段
                addSingleSlot(slots, t, taskStartTime, endTime, taskName, color, isSpend, dateStr, date, 'only', null, null, 0, 1, null, null, isSleepRecord ? realDurationSeconds : undefined);
            }
        });
    
    return slots.sort((a, b) => a.start - b.start);
}

// 辅助函数：添加单个时间段
function addSingleSlot(slots, t, startTime, endTime, taskName, color, isSpend, dateStr, date, segmentType, resumeTime, pauseTime, segmentIndex = 0, totalSegments = 1, pauseStartTs = null, pauseEndTs = null, durationSecondsOverride = null) {
    const startDateStr = getLocalDateString(startTime);
    const endDateStr = getLocalDateString(endTime);
    
    // 跨天处理
    if (startDateStr !== dateStr && endDateStr !== dateStr) return; // 不在当天
    
    let slotStart = startTime;
    let slotEnd = endTime;
    
    if (startDateStr !== dateStr) {
        slotStart = new Date(date);
        slotStart.setHours(0, 0, 0, 0);
    }
    if (endDateStr !== dateStr) {
        slotEnd = new Date(date);
        slotEnd.setHours(23, 59, 59, 999);
    }
    
    if (slotEnd <= slotStart) return;
    
    // 原始任务完整时长（用于判断是否显示时间标签）
    const originalDurationMinutes = (endTime - startTime) / (60 * 1000);
    
    slots.push({
        id: t.id + (segmentIndex > 0 ? '_seg' + segmentIndex : ''),
        taskId: t.taskId,
        transactionId: t.id,
        start: slotStart,
        end: slotEnd,
        durationSeconds: Number.isFinite(durationSecondsOverride) ? durationSecondsOverride : Math.abs(t.amount),
        realDurationSeconds: (slotEnd - slotStart) / 1000,
        durationMinutes: originalDurationMinutes, // 使用原始时长判断显示
        taskName,
        color,
        isSpend,
        segmentType,    // 'only', 'first', 'middle', 'last'
        segmentIndex,
        totalSegments,
        resumeTime,     // 继续时间（用于middle/last段顶部）
        pauseTime,      // 暂停时间（用于first/middle段底部）
        pauseStartTs,   // 暂停开始时间戳（用于列占用）
        pauseEndTs      // 暂停结束时间戳（用于列占用）
    });
}

// [v5.8.0] 分配列（固定3列，暂停区间保护，时长排序，超3条忽略）
function assignFlowColumns(slots) {
    const MAX_COLS = 3;
    // 每列维护占用区间列表 [{start, end}, ...]
    const columnOccupied = [[], [], []];
    
    // 辅助函数：检查时间段是否与列的占用区间重叠
    function isOverlapping(colIndex, start, end) {
        return columnOccupied[colIndex].some(interval => 
            !(end.getTime() <= interval.start || start.getTime() >= interval.end)
        );
    }
    
    // 辅助函数：添加占用区间
    function addOccupied(colIndex, start, end) {
        columnOccupied[colIndex].push({ start: start.getTime(), end: end.getTime() });
    }
    
    // 1. 按开始时间排序，同开始时间按时长降序
    slots.sort((a, b) => {
        const startDiff = a.start - b.start;
        if (startDiff !== 0) return startDiff;
        return b.durationMinutes - a.durationMinutes; // 时长大的优先
    });
    
    // 2. 分配列
    const assignedSlots = [];
    slots.forEach(slot => {
        // 计算此slot的完整占用区间（包括暂停虚线区域）
        let occupyEnd = slot.end;
        if (slot.pauseEndTs && slot.segmentType !== 'last') {
            occupyEnd = new Date(slot.pauseEndTs);
        }
        
        // 找到可用列
        let assigned = false;
        for (let col = 0; col < MAX_COLS; col++) {
            if (!isOverlapping(col, slot.start, occupyEnd)) {
                slot.column = col;
                addOccupied(col, slot.start, occupyEnd);
                assigned = true;
                assignedSlots.push(slot);
                break;
            }
        }
        
        // 所有列都被占用，忽略此slot
        if (!assigned) {
            slot.column = -1; // 标记为被忽略
        }
    });
    
    // 过滤掉被忽略的slots
    slots.length = 0;
    assignedSlots.forEach(s => slots.push(s));
    
    // 重新按开始时间排序（恢复显示顺序）
    slots.sort((a, b) => a.start - b.start);
    
    return 3; // 固定返回3列
}

// [v5.8.0] 找出同一任务的暂停-继续连接（仅同一transactionId内的段）
function findFlowPauseConnections(slots) {
    const connections = [];
    const transactionSlots = new Map();
    
    slots.forEach(slot => {
        if (!slot.transactionId) return;
        if (!transactionSlots.has(slot.transactionId)) {
            transactionSlots.set(slot.transactionId, []);
        }
        transactionSlots.get(slot.transactionId).push(slot);
    });
    
    transactionSlots.forEach((slotList) => {
        if (slotList.length < 2) return;
        slotList.sort((a, b) => a.start - b.start);
        for (let i = 0; i < slotList.length - 1; i++) {
            connections.push({
                from: slotList[i],
                to: slotList[i + 1],
                color: slotList[i].color
            });
        }
    });
    
    return connections;
}

function navigateHeatmap(offset) { reportState.heatmapDate.setMonth(reportState.heatmapDate.getMonth() + offset); updateActivityHeatmap(); }
function updateActivityHeatmap() { 
    const container = document.getElementById('heatmapGrid'); 
    const legendContainer = document.getElementById('heatmapLegend'); 
    const label = document.getElementById('heatmapMonthLabel'); 
    const dailyData = new Map(); 
    transactions.filter(t => !t.undone).forEach(t => { 
        const localDateStr = getLocalDateString(t.timestamp); 
        if (!dailyData.has(localDateStr)) { 
            dailyData.set(localDateStr, { earned: 0, spent: 0, count: 0 }); 
        } 
        const dayData = dailyData.get(localDateStr);
        dayData.count++;
        if (t.type) { 
            const typeKey = t.type === 'earn' ? 'earned' : 'spent'; 
            dayData[typeKey] += t.amount; 
        } else { 
            if (t.amount > 0) dayData.earned += t.amount; 
            else dayData.spent += Math.abs(t.amount); 
        } 
    }); 
    const year = reportState.heatmapDate.getFullYear(); 
    const month = reportState.heatmapDate.getMonth(); 
    label.textContent = `${year}年 ${month + 1}月`; 
    const firstDayOfMonth = new Date(year, month, 1).getDay(); 
    const daysInMonth = new Date(year, month + 1, 0).getDate(); 
    let html = ''; 
    for(let i = 0; i < firstDayOfMonth; i++) { 
        html += `<div class="heatmap-spacer"></div>`; 
    } 
    for (let day = 1; day <= daysInMonth; day++) { 
        const currentDate = new Date(year, month, day); 
        const localDateStr = getLocalDateString(currentDate); 
        const data = dailyData.get(localDateStr); 
        let colorClass = ''; 
        let tooltipContent = '';
        
        if (data) { 
            const net = data.earned - data.spent; 
            colorClass = getHeatmapColorClass(net);
            const netClass = net > 0 ? 'positive' : (net < 0 ? 'negative' : '');
            const netSign = net > 0 ? '+' : '';
            tooltipContent = `<div class="heatmap-tooltip-date">${localDateStr}</div>` +
                `<div class="heatmap-tooltip-net ${netClass}">${netSign}${formatTime(net)}</div>` +
                `<div class="heatmap-tooltip-stats">获得 ${formatTime(data.earned)}</div>` +
                `<div class="heatmap-tooltip-stats">消费 ${formatTime(data.spent)}</div>` +
                `<div class="heatmap-tooltip-stats">${data.count} 条记录</div>` +
                `<div class="heatmap-tooltip-hint">长按 3 秒自动查看详情</div>` +
                `<div class="heatmap-tooltip-progress"></div>`;
        } else {
            tooltipContent = `<div class="heatmap-tooltip-date">${localDateStr}</div>` +
                `<div class="heatmap-tooltip-stats" style="opacity:0.7">暂无活动记录</div>`;
        }
        
        const encodedTooltip = encodeURIComponent(tooltipContent);
        html += `<div class="heatmap-day" data-date="${localDateStr}" data-tooltip="${encodedTooltip}" onclick="handleHeatmapDayClick(event, '${localDateStr}')"><div class="heatmap-day-content ${colorClass}">${day}</div></div>`; 
    } 
    container.innerHTML = html; 
    const nextMonth = new Date(year, month + 1, 1); 
    document.getElementById('heatmapNextMonth').disabled = nextMonth > new Date(); 
    legendContainer.innerHTML = `减少 <div class="legend-item"><div class="legend-box" style="background-color: #ffcdd2;"></div><div class="legend-box" style="background-color: #e57373;"></div><div class="legend-box" style="background-color: #f44336;"></div></div> | <div class="legend-item"><div class="legend-box" style="background-color: #9be9a8;"></div><div class="legend-box" style="background-color: #40c463;"></div><div class="legend-box" style="background-color: #216e39;"></div></div> 增加`; 
    // 初始化长按交互
    initHeatmapTooltips();
}

// [v5.6.0] 将“1小时30分45秒/30分/45秒/1h30m”解析为秒
function parseDurationTextToSeconds(text) {
    if (!text) return 0;
    let total = 0;
    const h = text.match(/(\d+)\s*(小时|时|h)/i);
    const m = text.match(/(\d+)\s*(分钟|分|m)/i);
    const s = text.match(/(\d+)\s*(秒|s)/i);
    if (h) total += parseInt(h[1], 10) * 3600;
    if (m) total += parseInt(m[1], 10) * 60;
    if (s) total += parseInt(s[1], 10);
    return total;
}

// [v5.6.0] 解析交易描述，分离标题和详情
// [v5.7.0] 新增 isBackdate, isTarget, hasHabitBonus 标记
function parseTransactionDescription(transaction) {
    const originalDesc = (transaction && transaction.description) ? String(transaction.description) : '';
    let desc = originalDesc;
    const transType = transaction.type; // earn 或 spend
    let title = '';
    let detail = '';
    let icon = ''; // 主图标
    let warning = false; // 是否有负余额警告
    let isBackdate = false; // 是否为手动补录
    let isTarget = false; // 是否为达标任务
    let hasHabitBonus = false; // 是否包含习惯奖励
    const hasHistoricalPenaltyFlag = !!transaction?.historicalPenalty;
    const hasNegativeBalanceWarningFlag = !!transaction?.negativeBalanceWarning;
    if (hasNegativeBalanceWarningFlag) warning = true;

    // [v7.4.1] 兜底：description 为空时，使用 taskName / note 作为展示
    if (!desc) {
        title = transaction && transaction.taskName ? transaction.taskName : '系统记录';
        detail = transaction && transaction.note ? transaction.note : '';
        if (detail.startsWith('睡眠结算:')) {
            detail = detail.replace(/^睡眠结算:\s*/, '');
        }
        // 统一将旧格式的“|”替换为空格
        if (detail.includes('|')) {
            detail = detail.replace('|', ' ');
        }
        // [v7.4.1] 睡眠结算详情补全：若只有时长，补成 入睡~起床 总时长
        // [v7.9.10] 睡眠记录统一标题为"夜间睡眠时间"
        const isSleepTask = transaction?.sleepData || 
            title === '睡眠时间管理' || 
            title === '😴 睡眠时间管理';
        if (isSleepTask) {
            // [v7.16.0] 根据 sleepType 区分小睡和夜间睡眠
            if (transaction?.sleepData?.sleepType === 'nap') {
                title = '小睡';
                icon = '💤';
            } else {
                title = '夜间睡眠时间';
                icon = '😴';
            }
            // 从 sleepData 构建详情
            if (transaction && transaction.sleepData && transaction.sleepData.startTime && transaction.sleepData.wakeTime) {
                const startMs = transaction.sleepData.startTime;
                const wakeMs = transaction.sleepData.wakeTime;
                const minutes = transaction.sleepData.durationMinutes || Math.round((wakeMs - startMs) / 60000);
                detail = `${formatSleepTimeHM(startMs)}~${formatSleepTimeHM(wakeMs)} ${formatSleepDuration(minutes)}`;
            } else if (detail && !detail.includes('~')) {
                // 降级：尝试从 note 重建详情
                const seconds = parseDurationTextToSeconds(detail);
                if (seconds > 0) {
                    const minutes = Math.round(seconds / 60);
                    const wakeMs = transaction && transaction.timestamp ? new Date(transaction.timestamp).getTime() : Date.now();
                    const startMs = wakeMs - minutes * 60000;
                    detail = `${formatSleepTimeHM(startMs)}~${formatSleepTimeHM(wakeMs)} ${formatSleepDuration(minutes)}`;
                }
            }
            return { title, detail, icon, warning, isBackdate: false, isTarget, hasHabitBonus };
        } else if (title.includes('睡眠') && detail && !detail.includes('~')) {
            // 其他睡眠相关任务（保留原有逻辑）
            if (transaction && transaction.sleepData && transaction.sleepData.startTime && transaction.sleepData.wakeTime) {
                const startMs = transaction.sleepData.startTime;
                const wakeMs = transaction.sleepData.wakeTime;
                const minutes = transaction.sleepData.durationMinutes || Math.round((wakeMs - startMs) / 60000);
                detail = `${formatSleepTimeHM(startMs)}~${formatSleepTimeHM(wakeMs)} ${formatSleepDuration(minutes)}`;
            } else {
                const seconds = parseDurationTextToSeconds(detail);
                if (seconds > 0) {
                    const minutes = Math.round(seconds / 60);
                    const wakeMs = transaction && transaction.timestamp ? new Date(transaction.timestamp).getTime() : Date.now();
                    const startMs = wakeMs - minutes * 60000;
                    detail = `${formatSleepTimeHM(startMs)}~${formatSleepTimeHM(wakeMs)} ${formatSleepDuration(minutes)}`;
                }
            }
        }
        return { title, detail, icon, warning, isBackdate, isTarget, hasHabitBonus };
    }

    const txTask = transaction?.taskId ? tasks.find(t => t.id === transaction.taskId) : null;
    const isTimedTask = !!txTask && ['continuous', 'continuous_target', 'continuous_redeem'].includes(txTask.type);

    // [v7.24.1] 统一计时详情展示：计时类任务超过1小时不显示秒
    function normalizeTimedDurationText(text) {
        const raw = (text || '').trim();
        if (!raw || !isTimedTask) return raw;
        const durationSeconds = parseDurationTextToSeconds(raw);
        if (durationSeconds >= 3600) {
            return formatTimeNoSeconds(durationSeconds).replace(/小时0分$/, '小时');
        }
        return raw;
    }

    function hasDurationText(text) {
        return /(\d+)\s*(小时|时|分|秒|h|m|s)/i.test(text || '');
    }

    // [v7.24.1] 按次消费详情兜底：确保展示基础时长
    function ensureInstantRedeemBase(detailText) {
        const raw = (detailText || '').trim();
        if (!txTask || txTask.type !== 'instant_redeem' || typeof txTask.consumeTime !== 'number') {
            return raw;
        }
        const baseText = formatTimeNoSeconds(txTask.consumeTime).replace(/小时0分$/, '小时');
        if (!raw) return baseText;
        return hasDurationText(raw) ? raw : `${baseText} ${raw}`;
    }
    
    // [v7.4.0] 辅助函数：根据倍率和交易类型返回带颜色的倍率HTML
    function coloredMultiplier(mult, type) {
        const m = parseFloat(mult);
        if (m === 1.0) return `×${mult}`; // 1.0 不着色
        // earn: <1 不利(红), >1 有利(蓝)
        // spend: >1 不利(红), <1 有利(蓝)
        const isBad = (type === 'earn' && m < 1) || (type === 'spend' && m > 1);
        const cls = isBad ? 'multiplier-bad' : 'multiplier-good';
        return `<span class="${cls}">×${mult}</span>`;
    }

    // [v7.24.1] 戒除专属倍率格式化：仅保留百分数（用于倍率序列末尾）
    function formatAbstinenceMultiplierDetail(text, type = 'spend') {
        const raw = (text || '').trim();
        if (!raw) return '';

        function toDisplayPercent(value) {
            if (!isFinite(value)) return '';
            const normalized = Math.max(0, value);
            return Number.isInteger(normalized)
                ? String(normalized)
                : normalized.toFixed(1).replace(/\.0$/, '');
        }

        function coloredPercent(percent, txType) {
            const pct = Number(percent);
            if (!isFinite(pct)) return '';
            const ratio = pct / 100;
            const display = `×${toDisplayPercent(pct)}%`;
            if (Math.abs(ratio - 1) < 1e-9) return display;
            const isBad = (txType === 'earn' && ratio < 1) || (txType === 'spend' && ratio > 1);
            const cls = isBad ? 'multiplier-bad' : 'multiplier-good';
            return `<span class="${cls}">${display}</span>`;
        }

        // 额度内/超出分段：额度内10分×50% + 超出20分×200%
        const segmented = raw.match(/^(?:额度内|配额内)\s*(\d+)分\s*[×x]\s*50%\s*\+\s*超出(?:额度|配额)?\s*(\d+)分\s*[×x]\s*200%$/);
        if (segmented) {
            const within = parseInt(segmented[1], 10);
            const over = parseInt(segmented[2], 10);
            const total = within + over;
            const weighted = total > 0 ? ((within * 50 + over * 200) / total) : 50;
            return coloredPercent(Math.round(weighted), type);
        }

        // [v7.30.5] 修复：支持带分钟数的额度内/超出格式
        // 例如：额度内10分×50%、配额内30分×50%
        const quotaWithinWithMins = raw.match(/^(?:额度内|配额内)\s*(\d+)分\s*[×x]\s*50%$/);
        if (quotaWithinWithMins) return coloredPercent(50, type);

        // 例如：超出额度20分×200%、超出配额20分×200%、超出20分×200%
        const quotaOverWithMins = raw.match(/^超出(?:额度|配额)?\s*(\d+)分\s*[×x]\s*200%$/);
        if (quotaOverWithMins) return coloredPercent(200, type);

        if (/^(?:额度内|配额内)\s*50%$/.test(raw)) return coloredPercent(50, type);
        if (/^超出(?:额度|配额)?\s*200%$/.test(raw)) return coloredPercent(200, type);

        // 动态倍率标签：动态倍率≈85%
        const dynamic = raw.match(/^动态倍率≈\s*([\d.]+)%$/);
        if (dynamic) {
            const pct = parseFloat(dynamic[1]);
            if (!isNaN(pct)) {
                return coloredPercent(pct, type);
            }
        }

        return '';
    }
    
    // 检测通用标记
    isBackdate = !!transaction?.isBackdate || /^补录[:：]/.test(desc) || desc.startsWith('补录');
    isTarget = desc.includes('达标奖励');
    hasHabitBonus = desc.includes('含习惯奖励');

    // [v7.9.10] 辅助函数：从原始标题中清理所有时间/倍率/均衡信息
    function cleanBackdateTitle(rawTitle) {
        if (!rawTitle) return '';
        return rawTitle
            // 移除 (补录) 或 （补录）后缀
            .replace(/\s*[（(]补录[）)]/g, '')
            // 移除 ×数字 及之后所有内容
            .replace(/\s*[×x]\s*[\d.]+.*$/g, '')
            // 移除完整括号对（全角/半角）包含数字/时间信息的
            .replace(/\s*[（(][^）)]*[）)]/g, '')
            // 移除未闭合的括号及之后内容
            .replace(/\s*[（(].*$/g, '')
            .trim();
    }

    // [v7.9.10] 手动补录强制重建详情：确保显示"实际时长 × 任务倍率 (+均衡倍率)"
    function buildBackdateDetail(trans, transType) {
        const task = trans?.taskId ? tasks.find(t => t.id === trans.taskId) : null;
        if (!task) return '';
        
        // 获取均衡倍率
        let balanceMult = null;
        if (trans.balanceAdjust && typeof trans.balanceAdjust === 'object') {
            if (typeof trans.balanceAdjust.multiplier === 'number') {
                balanceMult = trans.balanceAdjust.multiplier;
            }
        }
        
        // 计时类任务：显示 实际时长 × 任务倍率 (+均衡倍率)
        if (['continuous', 'continuous_target', 'continuous_redeem'].includes(task.type)) {
            const taskMult = task.multiplier || 1;
            let baseSeconds = trans.amount;
            
            // 优先使用 balanceAdjust.originalAmount
            if (trans.balanceAdjust && typeof trans.balanceAdjust.originalAmount === 'number') {
                baseSeconds = trans.balanceAdjust.originalAmount;
            }
            
            // 反推实际时长 = 基础金额 / 任务倍率
            const actualSeconds = taskMult ? Math.round(baseSeconds / taskMult) : baseSeconds;
            
            let parts = [formatTimeNoSeconds(actualSeconds)];
            if (taskMult !== 1) {
                parts.push(`×${taskMult}`);
            }
            if (balanceMult && balanceMult !== 1) {
                parts.push(coloredMultiplier(balanceMult.toString(), transType || 'earn'));
            }
            return parts.join(' ');
        }
        
        // 固定时间类任务：显示固定时间 (+均衡倍率)
        if (task.type === 'reward' || task.type === 'instant_redeem') {
            const baseAmount = task.type === 'reward' ? task.fixedTime : task.consumeTime;
            let parts = [formatTime(baseAmount)];
            if (balanceMult && balanceMult !== 1) {
                parts.push(coloredMultiplier(balanceMult.toString(), transType || 'earn'));
            }
            return parts.join(' ');
        }
        
        return '';
    }

    // [v7.9.10] 对手动补录强制应用标题清理和详情重建
    function finalizeResult(result) {
        // 仅处理手动补录（非自动补录：自动补录有 🤖 图标，自动修正有 🔧 图标）
        if (isBackdate && !result.icon) {
            // [v7.9.10] 强制使用 taskName 作为纯净标题（最可靠）
            if (transaction?.taskName) {
                result.title = transaction.taskName;
            } else if (result.title) {
                // 降级：清理已解析的标题
                result.title = cleanBackdateTitle(result.title);
            }
            
            // 强制重建详情（计时类任务）
            const task = transaction?.taskId ? tasks.find(t => t.id === transaction.taskId) : null;
            if (task && ['continuous', 'continuous_target', 'continuous_redeem'].includes(task.type)) {
                const rebuilt = buildBackdateDetail(transaction, transType);
                if (rebuilt) {
                    result.detail = rebuilt;
                }
            }
        }

        // [v7.24.1] 补录历史惩罚：去掉文案后仍保留⚠与惩罚倍率展示
        if (hasHistoricalPenaltyFlag && transaction?.type === 'spend') {
            result.warning = true;
            const penaltyInText = /(?:历史)?余额不足/.test(originalDesc);
            if (!penaltyInText) {
                const penaltyPart = coloredMultiplier('1.2', 'spend');
                result.detail = result.detail ? `${result.detail} ${penaltyPart}` : penaltyPart;
            }
        }
        return result;
    }

    // [v7.9.10] 手动补录统一显示格式：使用与正常完成相同的解析规则，仅保留📆图标
    if (isBackdate && /^补录[:：]/.test(desc)) {
        let rest = desc.replace(/^补录[:：]\s*/, '').replace(/[（(]补录[)）]/g, '').trim();
        const task = transaction?.taskId ? tasks.find(t => t.id === transaction.taskId) : null;
        const isHabitLike = !!task?.isHabit || (transaction?.isStreakAdvancement || false) || rest.includes('含习惯奖励');
        let prefix = '完成任务:';
        if (isHabitLike) {
            prefix = '完成习惯:';
        } else if (task?.type === 'instant_redeem') {
            prefix = '兑换项目:';
        } else if (task?.type === 'continuous_redeem') {
            prefix = '连续消费:';
        }
        desc = `${prefix} ${rest}`.trim();
    }
    
    // 屏幕时间特殊处理
    // 格式: 📱 屏幕时间: 4小时29分钟/6小时 (奖励1小时31分钟) ×0.9 (均衡调整)
    if (desc.startsWith('📱')) {
        const match = desc.match(/📱\s*屏幕时间:\s*(.+?)\/(.+?)\s*\((奖励|超出)(.+?)\)/);
        if (match) {
            title = '屏幕时间';
            const used = match[1].trim();
            const limit = match[2].trim();
            const isReward = match[3] === '奖励';
            // 检查均衡调整倍率
            const balanceMatch = desc.match(/[×x]([\d.]+)\s*\(均衡调整\)/);
            let detailParts = [`${used} / ${limit}`];
            if (balanceMatch) {
                detailParts.push(coloredMultiplier(balanceMatch[1], isReward ? 'earn' : 'spend'));
            }
            detail = detailParts.join(' ');
        } else {
            title = desc.replace('📱', '').replace('屏幕时间:', '').trim();
        }
        return finalizeResult({ title, detail, icon: '📱', warning, isBackdate: false, isTarget, hasHabitBonus });
    }
    
    // [v7.9.10] 睡眠记录统一处理（自动结算 + 手动记录）
    // 检测条件：有 sleepData 或 taskName 包含"睡眠时间管理"
    const isSleepRecord = transaction?.sleepData || 
        transaction?.taskName === '睡眠时间管理' || 
        transaction?.taskName === '😴 睡眠时间管理';
    if (isSleepRecord) {
        // 统一标题为"夜间睡眠时间"
        title = '夜间睡眠时间';
        
        // 从 sleepData 构建详情：入睡时间~起床时间 总时长
        if (transaction.sleepData && transaction.sleepData.startTime && transaction.sleepData.wakeTime) {
            const startMs = transaction.sleepData.startTime;
            const wakeMs = transaction.sleepData.wakeTime;
            const minutes = transaction.sleepData.durationMinutes || Math.round((wakeMs - startMs) / 60000);
            detail = `${formatSleepTimeHM(startMs)}~${formatSleepTimeHM(wakeMs)} ${formatSleepDuration(minutes)}`;
        } else if (transaction.note) {
            // 降级：使用 note 字段（去除"手动记录:"前缀）
            detail = transaction.note.replace(/^手动记录:\s*/, '').replace(/^睡眠结算:\s*/, '');
        }
        
        return { title, detail, icon: '😴', warning, isBackdate: false, isTarget, hasHabitBonus };
    }
    
    // [v7.15.0] 利息交易特殊处理
    // 检测条件：systemType === 'interest'
    if (transaction?.isSystem && transaction?.systemType === 'interest') {
        // 纯净标题
        const isDeposit = transaction.type === 'earn';
        title = isDeposit ? '存款利息' : '贷款利息';
        
        // 从 interestData 构建详情：-42小时58分 × 1%
        if (transaction.interestData) {
            const { baseBalance, rate } = transaction.interestData;
            const sign = baseBalance >= 0 ? '+' : '-';
            detail = `${sign}${formatTime(Math.abs(baseBalance))} × ${rate}%`;
        } else {
            // 降级：使用 description
            detail = desc;
        }
        
        return { title, detail, icon: isDeposit ? '💰' : '💸', warning, isBackdate: false, isTarget, hasHabitBonus };
    }
    
    // [v7.30.5] 删除：利息调整交易特殊处理（利息重算机制已移除）
    
    // 自动补录: 任务名 (漏记X分钟, ×任务倍率×惩罚倍率) 或 (漏记X分钟, ×惩罚倍率)
    if (desc.startsWith('自动补录:')) {
        // 先尝试匹配新格式: (漏记X分钟, ×任务倍率×惩罚倍率惩罚)
        let match = desc.match(/^自动补录:\s*(.+?)\s*\(漏记(\d+)分钟,\s*[×x]([\d.]+)[×x]([\d.]+)惩罚\)/);
        let taskMultiplier = 1, penaltyMultiplier = 1, minutes = 0;
        if (match) {
            title = match[1].trim();
            minutes = parseInt(match[2]);
            taskMultiplier = parseFloat(match[3]);
            penaltyMultiplier = parseFloat(match[4]);
        } else {
            // 尝试匹配旧格式: (漏记X分钟, ×惩罚倍率惩罚)
            match = desc.match(/^自动补录:\s*(.+?)\s*\(漏记(\d+)分钟,\s*[×x]([\d.]+)惩罚\)/);
            if (match) {
                title = match[1].trim();
                minutes = parseInt(match[2]);
                penaltyMultiplier = parseFloat(match[3]);
            }
        }
        if (match) {
            // [v7.4.0] 自动补录是 spend 类型，惩罚倍率>1对用户不利
            // [v7.18.4] 修复：任务倍率不着色，仅惩罚倍率着色，与普通记录保持一致
            const result = Math.round(minutes * taskMultiplier * penaltyMultiplier);
            let detailParts = [`漏记${minutes}分`];
            if (taskMultiplier !== 1) {
                detailParts.push(`×${taskMultiplier}`);
            }
            detailParts.push(coloredMultiplier(penaltyMultiplier, 'spend'));
            detail = detailParts.join(' ');
        } else {
            // fallback: 尝试简单提取任务名
            const simpleMatch = desc.match(/^自动补录:\s*(.+?)(?:\s*\(|$)/);
            title = simpleMatch ? simpleMatch[1].trim() : desc.replace('自动补录:', '').trim();
            // 提取括号内容作为详情
            const bracketMatch = desc.match(/\(([^)]+)\)/);
            if (bracketMatch) detail = bracketMatch[1];
        }
        return finalizeResult({ title, detail, icon: '🤖', warning, isBackdate: true, isTarget, hasHabitBonus });
    }
    
    // 自动修正: 任务名 (多记录X分钟, ×任务倍率×惩罚倍率返还/扣减) 或 (多记录X分钟, ×惩罚倍率返还/扣减)
    // earn多记 → 扣减(×1.2)，spend多记 → 返还(×0.8)
    if (desc.startsWith('自动修正:')) {
        // 先尝试匹配新格式: (多记录X分钟, ×任务倍率×惩罚倍率返还/扣减)
        let match = desc.match(/^自动修正:\s*(.+?)\s*\(多记录(\d+)分钟,\s*[×x]([\d.]+)[×x]([\d.]+)(返还|扣减)\)/);
        let taskMultiplier = 1, penaltyMultiplier = 1, minutes = 0, isReturn = false;
        if (match) {
            title = match[1].trim();
            minutes = parseInt(match[2]);
            taskMultiplier = parseFloat(match[3]);
            penaltyMultiplier = parseFloat(match[4]);
            isReturn = match[5] === '返还';
        } else {
            // 尝试匹配旧格式: (多记录X分钟, ×惩罚倍率返还/扣减)
            match = desc.match(/^自动修正:\s*(.+?)\s*\(多记录(\d+)分钟,\s*[×x]([\d.]+)(返还|扣减)\)/);
            if (match) {
                title = match[1].trim();
                minutes = parseInt(match[2]);
                penaltyMultiplier = parseFloat(match[3]);
                isReturn = match[4] === '返还';
            }
        }
        if (match) {
            // [v7.4.0] 返还是 earn 类型(×0.8<1有利用蓝)，扣减是 spend 类型(×1.2>1不利用红)
            // [v7.18.4] 修复：任务倍率不着色，仅惩罚倍率着色，与普通记录保持一致
            const effectiveType = isReturn ? 'earn' : 'spend';
            let detailParts = [`多记${minutes}分`];
            if (taskMultiplier !== 1) {
                detailParts.push(`×${taskMultiplier}`);
            }
            detailParts.push(coloredMultiplier(penaltyMultiplier, effectiveType));
            detail = detailParts.join(' ');
        } else {
            // fallback: 尝试简单提取任务名
            const simpleMatch = desc.match(/^自动修正:\s*(.+?)(?:\s*\(|$)/);
            title = simpleMatch ? simpleMatch[1].trim() : desc.replace('自动修正:', '').trim();
            // 提取括号内容作为详情
            const bracketMatch = desc.match(/\(([^)]+)\)/);
            if (bracketMatch) detail = bracketMatch[1];
        }
        return finalizeResult({ title, detail, icon: '🔧', warning, isBackdate: false, isTarget, hasHabitBonus });
    }
    
    // 达标任务（包含"达标奖励"）+ 可能有习惯奖励
    // 例如: "完成习惯: 腿部拉伸 (30分6秒 × 1) + 15分 达标奖励"
    // 例如: "补录: 腿部拉伸 (38分 × 1) + 15分 达标奖励"
    // 例如: "完成习惯: 腿部拉伸 (30分45秒 × 1) + 15分 达标奖励 (含习惯奖励 30分) ×0.9 (均衡调整)"
    if (desc.includes('达标奖励')) {
        // [v7.4.0] 增加对均衡调整的匹配
        const match = desc.match(/^[^:]+:\s*(.+?)\s*\(([^)]+)\)\s*\+\s*(.+?)\s*达标奖励(?:\s*\(含习惯奖励\s*(.+?)\))?(?:\s*[×x]([\d.]+)\s*\(均衡调整\))?/);
        if (match) {
            title = match[1].trim();
            const timeDetail = match[2].trim();
            const targetBonus = match[3] ? match[3].trim() : '';
            const habitBonus = match[4] ? match[4].trim() : '';
            const balanceMult = match[5] ? match[5] : '';
            // [v7.4.0] 解析时间详情中的倍率，任务倍率不着色
            const timeMatch = timeDetail.match(/^(.+?)\s*[×x]\s*([\d.]+)$/);
            let detailParts = [];
            if (timeMatch) {
                detailParts.push(normalizeTimedDurationText(timeMatch[1]));
                if (parseFloat(timeMatch[2]) !== 1) {
                    detailParts.push(`×${timeMatch[2]}`); // 任务倍率不着色
                }
            } else {
                detailParts.push(normalizeTimedDurationText(timeDetail));
            }
            // [v7.4.0] 达标奖励用蓝色 +Xmin，删除"达标"字样
            if (targetBonus) {
                detailParts.push(`<span class="bonus-target">+${targetBonus}</span>`);
            }
            // [v7.4.0] 习惯奖励用黄色 +Xmin，删除"习惯"字样
            if (habitBonus) {
                detailParts.push(`<span class="bonus-habit">+${habitBonus}</span>`);
            }
            // [v7.4.0] 均衡调整倍率，着色
            if (balanceMult) {
                detailParts.push(coloredMultiplier(balanceMult, 'earn'));
            }
            detail = detailParts.join(' ');
            icon = '🎯';
        }
        return finalizeResult({ title, detail, icon, warning, isBackdate, isTarget: true, hasHabitBonus });
    }
    
    // 习惯任务（含习惯奖励但无达标）
    // 例如: "完成习惯: 晚上刷牙 (含习惯奖励 30分)"
    // 例如: "完成习惯: 晚上刷牙 (含习惯奖励 30分) ×0.9 (均衡调整)"
    if (desc.includes('含习惯奖励')) {
        // [v7.4.0] 增加对均衡调整的匹配（兼容均衡调整在前/后）
        let match = desc.match(/^[^:]+:\s*(.+?)\s*\(含习惯奖励\s*(.+?)\)(?:\s*[×x]([\d.]+)\s*\(均衡调整\))?/);
        let balanceMult = '';
        let habitBonusText = '';
        if (match) {
            title = match[1].trim();
            habitBonusText = match[2].trim();
            balanceMult = match[3] ? match[3] : '';
        } else {
            const altMatch = desc.match(/^[^:]+:\s*(.+?)\s*[×x]([\d.]+)\s*\(均衡调整\)\s*\(含习惯奖励\s*(.+?)\)/);
            if (altMatch) {
                title = altMatch[1].trim();
                balanceMult = altMatch[2] ? altMatch[2] : '';
                habitBonusText = altMatch[3].trim();
            }
        }
        if (title) {
            
            // [v7.8.1] 优先使用 balanceAdjust 对象中的精确数据
            let baseSeconds = 0;
            const habitSeconds = parseDurationTextToSeconds(habitBonusText);
            
            if (transaction.balanceAdjust && typeof transaction.balanceAdjust === 'object') {
                // 新格式：包含 baseReward 字段
                if (typeof transaction.balanceAdjust.baseReward === 'number') {
                    baseSeconds = transaction.balanceAdjust.baseReward;
                } else if (typeof transaction.balanceAdjust.originalAmount === 'number') {
                    // 有 originalAmount 但无 baseReward（过渡格式）
                    // [v7.9.10] 手动补录：originalAmount 为基础奖励本身，不应再减去习惯奖励
                    if (isBackdate) {
                        baseSeconds = transaction.balanceAdjust.originalAmount;
                    } else {
                        baseSeconds = Math.max(transaction.balanceAdjust.originalAmount - habitSeconds, 0);
                    }
                }
            } else if (balanceMult) {
                // 旧格式：从 amount 和倍率反推原始金额
                const mult = parseFloat(balanceMult);
                const originalTotal = Math.round(transaction.amount / mult);
                baseSeconds = Math.max(originalTotal - habitSeconds, 0);
            } else {
                // 无均衡调整的情况
                baseSeconds = Math.max(transaction.amount - habitSeconds, 0);
            }
            
            // [v7.4.0] 习惯奖励用黄色，删除"习惯"字样
            let detailParts = [formatTime(baseSeconds)];
            detailParts.push(`<span class="bonus-habit">+${habitBonusText}</span>`);
            if (!balanceMult && transaction.balanceAdjust && typeof transaction.balanceAdjust.multiplier === 'number') {
                balanceMult = transaction.balanceAdjust.multiplier.toString();
            }
            if (balanceMult) {
                detailParts.push(coloredMultiplier(balanceMult, 'earn'));
            }
            detail = detailParts.join(' ');
        }
        return finalizeResult({ title, detail, icon, warning, isBackdate, isTarget, hasHabitBonus: true });
    }
    
    // 普通习惯（无任何奖励）或 reward 类型
    // 例如: "完成习惯: 哑铃站姿弯举"
    // 例如: "完成任务: 阅读30分钟 (30分6秒 × 1)"
    // 例如: "完成任务: 阅读30分钟 (原30分 ×0.9 均衡调整)"
    // 例如: "完成习惯: 吃饱饭 ×0.9 (均衡调整)"  [v7.8.1 新增]
    if (desc.startsWith('完成习惯:') || desc.startsWith('完成任务:') || desc.startsWith('任务未达标:')) {
        const balanceSuffixMatch = desc.match(/\s*[×x]([\d.]+)\s*\(均衡(?:调整|模式)\)\s*$/);
        const suffixBalanceMult = balanceSuffixMatch ? balanceSuffixMatch[1] : '';
        // [v7.8.1] 修复：先检查是否有 "×倍率 (均衡调整)" 后缀在括号之前
        // 新格式: "完成习惯: 任务名 ×0.9 (均衡调整)"
        const balanceEndMatch = desc.match(/^[^:]+:\s*(.+?)\s*[×x]([\d.]+)\s*\(均衡(?:调整|模式)\)$/);
        if (balanceEndMatch) {
            title = balanceEndMatch[1].trim();
            const balanceMult = balanceEndMatch[2];
            // 从 balanceAdjust 或 amount 反推原始金额
            let originalAmount = transaction.amount;
            if (transaction.balanceAdjust && typeof transaction.balanceAdjust === 'object' && 
                typeof transaction.balanceAdjust.originalAmount === 'number') {
                originalAmount = transaction.balanceAdjust.originalAmount;
            } else {
                originalAmount = Math.round(transaction.amount / parseFloat(balanceMult));
            }
            detail = `${formatTime(originalAmount)} ${coloredMultiplier(balanceMult, 'earn')}`;
            return finalizeResult({ title, detail, icon, warning, isBackdate, isTarget, hasHabitBonus });
        }
        
        const match = desc.match(/^[^:]+:\s*(.+?)(?:\s*[（(]|$)/);
        if (match) {
            title = match[1].trim();
            // [v7.4.0] 检查均衡调整格式: (原Xmin ×倍率 均衡调整)
            const balanceMatch = desc.match(/[（(]原(.+?)\s*[×x]([\d.]+)\s*均衡调整[）)]/);
            // [v7.9.6] 检查任务倍率格式: (时间 × 倍率)
            const taskMultMatch = desc.match(/[（(]([^）)]+?)\s*[×x]\s*([\d.]+)[）)]/);
            
            if (balanceMatch && taskMultMatch) {
                // [v7.9.6] 同时有任务倍率和均衡倍率：显示 原始时间 ×任务倍率 ×均衡倍率
                const taskMult = parseFloat(taskMultMatch[2]);
                const balanceMult = balanceMatch[2];
                let detailParts = [normalizeTimedDurationText(taskMultMatch[1])]; // 原始时间
                if (taskMult !== 1) {
                    detailParts.push(`×${taskMultMatch[2]}`); // 任务倍率不着色
                }
                detailParts.push(coloredMultiplier(balanceMult, transType || 'earn')); // 均衡倍率着色
                detail = detailParts.join(' ');
            } else if (balanceMatch) {
                detail = `${normalizeTimedDurationText(balanceMatch[1])} ${coloredMultiplier(balanceMatch[2], 'earn')}`;
            } else {
                // 检查普通括号内容（如时间×倍率）
                const bracketMatch = desc.match(/[（(]([^）)]+)[）)]/);
                if (bracketMatch) {
                    const bracketContent = bracketMatch[1].trim();
                    // 解析 时间 × 倍率 格式
                    const timeMultMatch = bracketContent.match(/^(.+?)\s*[×x]\s*([\d.]+)$/);
                    if (timeMultMatch) {
                        const mult = parseFloat(timeMultMatch[2]);
                        if (mult !== 1) {
                            detail = `${normalizeTimedDurationText(timeMultMatch[1])} ×${timeMultMatch[2]}`; // 任务倍率不着色
                        } else {
                            detail = normalizeTimedDurationText(timeMultMatch[1]); // ×1 不显示
                        }
                    } else {
                        detail = normalizeTimedDurationText(bracketContent);
                    }
                    if (suffixBalanceMult) {
                        detail = `${detail} ${coloredMultiplier(suffixBalanceMult, transType || 'earn')}`;
                    }
                } else {
                    // 无括号，显示获得的时间
                    detail = formatTime(transaction.amount);
                    if (suffixBalanceMult) {
                        detail = `${detail} ${coloredMultiplier(suffixBalanceMult, transType || 'earn')}`;
                    }
                }
            }
        }
        // [v7.9.10] 手动补录计时类兜底：确保详情显示“实际时长 × 任务倍率 (+均衡倍率)”
        if (isBackdate && (!detail || !detail.includes('×'))) {
            const task = transaction?.taskId ? tasks.find(t => t.id === transaction.taskId) : null;
            if (task && ['continuous', 'continuous_target'].includes(task.type)) {
                const taskMult = task.multiplier || 1;
                let baseSeconds = transaction.amount;
                if (transaction.balanceAdjust && typeof transaction.balanceAdjust.originalAmount === 'number') {
                    baseSeconds = transaction.balanceAdjust.originalAmount;
                }
                const timeSeconds = taskMult ? Math.round(baseSeconds / taskMult) : baseSeconds;
                let fallbackDetail = formatTimeNoSeconds(timeSeconds);
                if (taskMult !== 1) {
                    fallbackDetail += ` ×${taskMult}`;
                }
                if (suffixBalanceMult) {
                    fallbackDetail += ` ${coloredMultiplier(suffixBalanceMult, transType || 'earn')}`;
                }
                detail = fallbackDetail;
            }
        }
        return finalizeResult({ title, detail, icon, warning, isBackdate, isTarget, hasHabitBonus });
    }
    
    // 检测负余额惩罚
    const hasPenalty = desc.includes('余额不足') || desc.includes('历史余额不足') || desc.includes('负余额预警') || hasHistoricalPenaltyFlag || hasNegativeBalanceWarningFlag;
    if (hasPenalty) warning = true;
    
    // [v7.4.0] 检查戒除挑战成功格式
    // 例如: "戒除挑战成功: 任务名 (额度 30/60) ×0.9 (均衡调整)"
    if (desc.startsWith('戒除挑战成功:')) {
        const match = desc.match(/^戒除挑战成功:\s*(.+?)\s*\(额度\s*(\d+)\/(\d+)\)(?:\s*[×x]([\d.]+)\s*\(均衡调整\))?/);
        if (match) {
            title = match[1].trim();
            const used = match[2];
            const limit = match[3];
            const balanceMult = match[4] ? match[4] : '';
            let detailParts = [`${used}/${limit}`];
            if (balanceMult) {
                detailParts.push(coloredMultiplier(balanceMult, 'earn'));
            }
            detail = detailParts.join(' ');
            return finalizeResult({ title, detail, icon: '🛡️', warning, isBackdate, isTarget, hasHabitBonus });
        }
    }
    
    // 通用格式: "前缀: 任务名 (详情1) (详情2)..."
    // 例如: "补录: 看视频 (30分 × 1.0) (历史余额不足, 1.2倍消耗)"
    // 例如: "补录: 任务名 (30分 × 1) ×0.9 (均衡调整)"
    // 例如: "兑换项目: 涩涩 (余额不足, 1.2倍消耗)"
    const mainMatch = desc.match(/^([^:：]+)[:：]\s*(.+)$/);
    if (mainMatch) {
        const prefix = mainMatch[1].trim(); // 补录、兑换项目等
        let rest = mainMatch[2].trim();
        
        // [v7.4.0] 先检查末尾的均衡调整
        const balanceEndMatch = rest.match(/\s*[×x]([\d.]+)\s*\(均衡调整\)$/);
        let balanceMult = '';
        if (balanceEndMatch) {
            balanceMult = balanceEndMatch[1];
            rest = rest.replace(/\s*[×x][\d.]+\s*\(均衡调整\)$/, '');
        }
        
        // 提取所有括号内容
        const bracketMatches = rest.match(/\([^)]+\)/g) || [];
        // 任务名是括号之前的部分
        const taskName = rest.replace(/\s*\([^)]+\)/g, '').trim();
        
        title = taskName;
        
        // 判断交易类型：补录/兑换等
        const effectiveType = (prefix === '兑换项目' || prefix === '兑换') ? 'spend' : transType;
        
        // 合并括号内容作为详情
        if (bracketMatches.length > 0) {
            // 去掉括号
            let details = bracketMatches.map(b => b.slice(1, -1));
            
            // 检查是否有负余额惩罚：(时间 × 倍率) + (余额不足, 1.2倍消耗)
            const timeMatch = details[0] ? details[0].match(/^(.+?)\s*[×x]\s*([\d.]+)$/) : null;
            const penaltyMatch = details.find(d => d.includes('余额不足') || d.includes('历史余额不足'));
            
            if (timeMatch && penaltyMatch) {
                // [v7.4.0] 合并为: 时间 × 倍率(不着色) × 惩罚(红色)
                const penaltyMultiplier = penaltyMatch.match(/([\d.]+)倍/);
                const penalty = penaltyMultiplier ? penaltyMultiplier[1] : '1.2';
                const extraDetails = details.filter(d => d !== details[0] && d !== penaltyMatch);
                let abstinenceMultiplier = '';
                let detailParts = [normalizeTimedDurationText(timeMatch[1])];
                if (parseFloat(timeMatch[2]) !== 1) {
                    detailParts.push(`×${timeMatch[2]}`); // 任务倍率不着色
                }
                // [v7.24.1] 保留并格式化戒除专属倍率（额度/动态）
                extraDetails.forEach(d => {
                    const formatted = formatAbstinenceMultiplierDetail(d, effectiveType || 'spend');
                    if (formatted) abstinenceMultiplier = formatted;
                });
                detailParts.push(coloredMultiplier(penalty, 'spend')); // 惩罚总是不利的
                if (balanceMult) {
                    detailParts.push(coloredMultiplier(balanceMult, effectiveType));
                }
                if (abstinenceMultiplier) {
                    // 戒除倍率固定放在倍率序列最后
                    detailParts.push(abstinenceMultiplier);
                }
                detail = detailParts.join(' ');
            } else if (penaltyMatch && !timeMatch) {
                // [v7.24.1] 无时间项但有惩罚：保留戒除专属倍率并统一渲染惩罚倍率
                const penaltyMultiplier = penaltyMatch.match(/([\d.]+)倍/);
                const penalty = penaltyMultiplier ? parseFloat(penaltyMultiplier[1]) : 1.2;
                const nonPenaltyDetails = details.filter(d => d !== penaltyMatch);

                if (nonPenaltyDetails.length === 0) {
                    // 仅惩罚信息（如：兑换项目 + 余额不足）
                    const originalAmount = Math.round(transaction.amount / penalty);
                    detail = `${formatTime(originalAmount)} ${coloredMultiplier(penalty.toString(), 'spend')}`;
                } else {
                    let detailParts = [];
                    let abstinenceMultiplier = '';
                    for (const d of nonPenaltyDetails) {
                        const cleaned = d.replace(/\s*均衡调整\s*/g, '').replace(/\s*原\s*/g, '').trim();
                        if (cleaned) {
                            const formatted = formatAbstinenceMultiplierDetail(cleaned, effectiveType || 'spend');
                            if (formatted) {
                                abstinenceMultiplier = formatted;
                            } else {
                                detailParts.push(normalizeTimedDurationText(cleaned));
                            }
                        }
                    }
                    detailParts.push(coloredMultiplier(penalty.toString(), 'spend'));
                    if (balanceMult) {
                        detailParts.push(coloredMultiplier(balanceMult, effectiveType));
                    }
                    if (abstinenceMultiplier) {
                        // 戒除倍率固定放在倍率序列最后
                        detailParts.push(abstinenceMultiplier);
                    }
                    detail = detailParts.join(' ');
                }
            } else {
                // [v7.4.0] 普通情况：任务倍率不着色
                let detailParts = [];
                let abstinenceMultiplier = '';
                for (const d of details) {
                    const tmMatch = d.match(/^(.+?)\s*[×x]\s*([\d.]+)$/);
                    if (tmMatch) {
                        if (parseFloat(tmMatch[2]) !== 1) {
                            detailParts.push(`${normalizeTimedDurationText(tmMatch[1])} ×${tmMatch[2]}`); // 任务倍率不着色
                        } else {
                            detailParts.push(normalizeTimedDurationText(tmMatch[1])); // ×1 不显示
                        }
                    } else {
                        // 非时间×倍率格式，过滤掉"均衡调整"等文字
                        const cleaned = d.replace(/\s*均衡调整\s*/g, '').replace(/\s*原\s*/g, '').trim();
                        if (cleaned) {
                            const formatted = formatAbstinenceMultiplierDetail(cleaned, effectiveType || 'spend');
                            if (formatted) {
                                abstinenceMultiplier = formatted;
                            } else {
                                detailParts.push(normalizeTimedDurationText(cleaned));
                            }
                        }
                    }
                }
                // 均衡调整前不加·，用空格连接
                let mainDetail = detailParts.join(' ');
                if (balanceMult) {
                    detail = mainDetail + ' ' + coloredMultiplier(balanceMult, effectiveType);
                } else {
                    detail = mainDetail;
                }
                if (abstinenceMultiplier) {
                    // 戒除倍率固定放在倍率序列最后
                    detail = detail ? `${detail} ${abstinenceMultiplier}` : abstinenceMultiplier;
                }
            }
        } else if (balanceMult) {
            // 无括号但有均衡调整
            detail = `${formatTime(transaction.amount)} ${coloredMultiplier(balanceMult, effectiveType)}`;
        }

        // [v7.24.1] 按次消费详情兜底：若仅有倍率，自动补上基础时长
        if (prefix === '兑换项目' || prefix === '兑换') {
            detail = ensureInstantRedeemBase(detail);
        }

        // [v7.9.10] 手动补录计时类兜底（通用分支）
        if (isBackdate && (!detail || !detail.includes('×'))) {
            const task = transaction?.taskId ? tasks.find(t => t.id === transaction.taskId) : null;
            if (task && ['continuous', 'continuous_target'].includes(task.type)) {
                const taskMult = task.multiplier || 1;
                let baseSeconds = transaction.amount;
                if (transaction.balanceAdjust && typeof transaction.balanceAdjust.originalAmount === 'number') {
                    baseSeconds = transaction.balanceAdjust.originalAmount;
                }
                const timeSeconds = taskMult ? Math.round(baseSeconds / taskMult) : baseSeconds;
                let fallbackDetail = formatTimeNoSeconds(timeSeconds);
                if (taskMult !== 1) {
                    fallbackDetail += ` ×${taskMult}`;
                }
                if (balanceMult) {
                    fallbackDetail += ` ${coloredMultiplier(balanceMult, effectiveType)}`;
                }
                detail = fallbackDetail;
            }
        }
    } else {
        // 无前缀格式，直接使用
        title = desc;
    }
    
    return finalizeResult({ title, detail, icon, warning, isBackdate, isTarget, hasHabitBonus });
}

// [v7.9.10] 每日详情图例说明
function showDayDetailLegend() {
    showInfoModal('每日详情说明', `
        <div style="text-align: left; font-size: 0.9rem; line-height: 1.7;">
            <p style="margin-bottom: 8px;"><strong>图标说明</strong></p>
            <ul style="margin: 0 0 16px 18px; padding-left: 8px; color: var(--text-color-light); line-height: 1.8;">
                <li>⚠️ 负余额消费</li>
                <li>⭐ 含习惯奖励</li>
                <li>🎯 达标奖励</li>
                <li>🤖 自动补录</li>
                <li>🔧 自动修正</li>
                <li>📆 手动补录</li>
                <li>📱 屏幕时间记录</li>
                <li>😴 睡眠记录</li>
            </ul>
            <p style="margin-bottom: 8px;"><strong>颜色与倍率</strong></p>
            <ul style="margin: 0 0 6px 18px; padding-left: 8px; color: var(--text-color-light); line-height: 1.8;">
                <li><span class="multiplier-good">×1.1</span> 有利倍率（奖励更高/消耗更低）</li>
                <li><span class="multiplier-bad">×1.1</span> 不利倍率（奖励更低/消耗更高）</li>
                <li><span class="bonus-target">+30分</span> 达标奖励加成</li>
                <li><span class="bonus-habit">+15分</span> 习惯奖励加成</li>
            </ul>
        </div>
    `);
}

// [原版] 活动日历的每日详情（交易列表版）
function showDayDetails(localDateStr) { 
    const modal = document.getElementById('dayDetailModal'); 
    modal.classList.remove('flow-mode'); // [v6.3.3] 退出流图模式
    const title = document.getElementById('dayDetailModalTitle'); 
    const content = document.getElementById('dayDetailContent'); 
    
    // [v5.8.0] 清除可能残留的滚动事件处理器（时间流图设置的）
    content.onscroll = null;
    
    // [v6.3.3] 增加切换按钮 [v7.16.0] 左：余额详情，右：时间流图
    title.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px;">
             <button class="view-switch-btn" onclick="event.stopPropagation();showDayFlowChart('${localDateStr}')" title="切换到时间流图">⇄</button>
             <span>${localDateStr} 详情</span>
             <button class="info-button" onclick="event.stopPropagation();showDayDetailLegend()" aria-label="每日详情说明">?</button>
        </div>
    `;
    // title.textContent = `${localDateStr} 详情`; 
    
    const dayTransactions = transactions.filter(t => !t.undone && getLocalDateString(t.timestamp) === localDateStr).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));  
    if (dayTransactions.length === 0) { 
        content.innerHTML = '<div class="empty-message">本日无活动记录</div>'; 
        modal.classList.add('show'); 
        return; 
    } 
    const dailyEarned = dayTransactions.reduce((sum, t) => sum + (t.type === 'earn' ? t.amount : (!t.type && t.amount > 0 ? t.amount : 0)), 0); 
    const dailySpent = dayTransactions.reduce((sum, t) => sum + (t.type === 'spend' ? t.amount : (!t.type && t.amount < 0 ? Math.abs(t.amount) : 0)), 0); 
    const dailyNet = dailyEarned - dailySpent; 
    const netClass = dailyNet > 0 ? 'positive' : (dailyNet < 0 ? 'negative' : ''); 
    const netSign = dailyNet > 0 ? '+' : (dailyNet < 0 ? '' : ''); 
    let summaryHtml = `<div class="day-detail-summary">
                        <div class="day-detail-net ${netClass}">净值: ${netSign}${formatTime(dailyNet)}</div>
                        <div class="day-detail-stats">
                            <span>获得: <span class="positive">${formatTime(dailyEarned)}</span></span> | 
                            <span>消费: <span class="negative">${formatTime(dailySpent)}</span></span>
                        </div>
                    </div>`; 
    let listHtml = dayTransactions.map(transaction => { 
        const isPositive = transaction.type === 'earn' || (!transaction.type && transaction.amount > 0); 
        const amount = Math.abs(transaction.amount); 
        const parsed = parseTransactionDescription(transaction);
        let descLine1 = parsed.title;
        let descLine2 = parsed.detail;
        const hasWarning = parsed.warning;
        // [v5.8.0] 图标逻辑修复：自动补录用🤖，自动修正用🔧，手动补录用📆
        let iconPrefix = '';
        if (hasWarning) iconPrefix += '⚠️';
        if (parsed.hasHabitBonus) iconPrefix += '⭐';
        if (parsed.isTarget && parsed.icon === '🎯') iconPrefix += '🎯';
        if (parsed.icon === '🤖' || parsed.icon === '🔧' || parsed.icon === '📱' || parsed.icon === '😴') {
            // 系统任务图标（自动补录、自动修正、屏幕时间、睡眠）
            iconPrefix += parsed.icon;
        } else if (parsed.isBackdate) {
            iconPrefix += '📆';
        }
        if (iconPrefix) iconPrefix += ' ';
        descLine1 = iconPrefix + descLine1;
        const timeStr = new Date(transaction.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        return `<div class="history-item">
                    <div class="history-info" title="${transaction.description}">
                        <div class="history-description">
                            <div class="desc-line-1">${descLine1}</div> 
                            ${descLine2 ? `<div class="desc-line-2">${descLine2}</div>` : ''}
                        </div>
                        <div class="history-time">${timeStr}</div>
                    </div>
                    <div class="history-amount-wrapper">
                        <div class="history-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : '-'}${formatTime(amount)}</div>
                    </div>
                </div>`; 
    }).join(''); 
    content.innerHTML = summaryHtml + listHtml; 
    modal.classList.add('show');
    content.scrollTop = 0; 
}

// [v5.8.0] 时间余额卡片的时间流图版每日详情
function showDayFlowChart(localDateStr) { 
    const modal = document.getElementById('dayDetailModal'); 
    modal.classList.add('flow-mode'); // [v6.3.3] 进入流图模式
    const title = document.getElementById('dayDetailModalTitle'); 
    const content = document.getElementById('dayDetailContent'); 
    
    // 初始化状态 - 默认显示3天（选中日期往前2天，往后到今天结束）
    const targetDate = new Date(localDateStr);
    const today = new Date();
    multiDayFlowState.currentDate = new Date(targetDate);
    // 设置newestDate为今天结束，确保加载今天的全部时间（包括未来时段）
    multiDayFlowState.newestDate = new Date(today);
    multiDayFlowState.newestDate.setHours(23, 59, 59, 999);
    multiDayFlowState.oldestDate = new Date(targetDate);
    multiDayFlowState.oldestDate.setDate(multiDayFlowState.oldestDate.getDate() - 2);
    multiDayFlowState.isLoading = false;
    
    // 设置标题：左侧"时间流图"，右侧单日日期导航
    updateFlowDetailTitle();
    
    // 渲染内容
    renderMultiDayFlowContent(content, multiDayFlowState.oldestDate, multiDayFlowState.newestDate);
    
    modal.classList.add('show');
    
    // 滚动到当前时间线位置，使其在视口底部1/3处
    setTimeout(() => {
        const timeIndicator = content.querySelector('.current-time-indicator');
        if (timeIndicator) {
            const topPx = parseInt(timeIndicator.style.getPropertyValue('--top-px')) || 0;
            const viewportHeight = content.clientHeight;
            // 让当前时间线在底部1/3位置，即滚动到 topPx - 2/3视口高度
            content.scrollTop = Math.max(0, topPx - viewportHeight * 2 / 3);
        } else {
            content.scrollTop = content.scrollHeight;
        }
    }, 100);
    
    // 添加滚动监听（滚动到顶部自动加载更早日期）
    content.onscroll = handleFlowDetailScroll;
}

// [v5.8.0] 处理滚动加载更早日期
function handleFlowDetailScroll() {
    const content = document.getElementById('dayDetailContent');
    if (!content || multiDayFlowState.isLoading) return;
    
    // 滚动到顶部附近时加载更早的3天
    if (content.scrollTop < 50) {
        multiDayFlowState.isLoading = true;
        
        const oldScrollHeight = content.scrollHeight;
        const oldScrollTop = content.scrollTop;
        
        // 往前扩展3天
        multiDayFlowState.oldestDate.setDate(multiDayFlowState.oldestDate.getDate() - 3);
        
        renderMultiDayFlowContent(content, multiDayFlowState.oldestDate, multiDayFlowState.newestDate);
        
        // 保持视觉位置
        requestAnimationFrame(() => {
            const newScrollHeight = content.scrollHeight;
            content.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
            multiDayFlowState.isLoading = false;
        });
    }
}

// [v5.8.0] 更新时间流图详情标题（显示单日日期）
function updateFlowDetailTitle() {
    const title = document.getElementById('dayDetailModalTitle');
    const today = getLocalDateString(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);
    const currentStr = getLocalDateString(multiDayFlowState.currentDate);
    const isCurrentToday = currentStr === today;
    
    // 单日日期显示：今天、昨天、或MM-DD格式
    let displayDate;
    if (currentStr === today) {
        displayDate = '今天';
    } else if (currentStr === yesterdayStr) {
        displayDate = '昨天';
    } else {
        displayDate = currentStr.slice(5); // MM-DD格式
    }
    
    // 检查是否隐藏说明按钮
    const hideInfoBtn = localStorage.getItem('flowChartInfoHidden') === 'true';
    const infoBtnStyle = hideInfoBtn ? 'style="display:none"' : '';
    
    title.innerHTML = `
        <div class="flow-detail-header">
            <div class="flow-detail-title-group">
                <button class="view-switch-btn" onclick="event.stopPropagation();switchToBalanceDetail()" title="切换到余额和利息详情">⇄</button>
                <span class="flow-detail-title">时间流图</span>
            </div>
            <div class="flow-date-nav">
                <button onclick="navigateFlowDetail(-1)" title="前一天">&lt;</button>
                <span class="flow-detail-date">${displayDate}</span>
                <button onclick="navigateFlowDetail(1)" ${isCurrentToday ? 'disabled' : ''} title="后一天">&gt;</button>
            </div>
        </div>
    `;
}

// [v6.3.3] 切换到列表视图（今日详情）
function switchToListView() {
     const dateStr = getLocalDateString(multiDayFlowState.currentDate);
     showDayDetails(dateStr);
}

// [v7.16.0] 从时间流图切换到余额详情
function switchToBalanceDetail() {
    const modal = document.getElementById('dayDetailModal');
    if (modal) modal.classList.remove('show');
    showFinanceDetailCombinedModal();
}

// [v5.8.0] 日期导航（切换当前显示日期，同时调整加载范围）+ 滑动动画
function navigateFlowDetail(delta) {
    const content = document.getElementById('dayDetailContent');
    const wrapper = content.querySelector('.multi-day-flow-wrapper');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    // 滑动动画：先滑出
    if (wrapper) {
        wrapper.classList.add(delta > 0 ? 'slide-left' : 'slide-right');
    }
    
    setTimeout(() => {
        // 切换当前日期
        multiDayFlowState.currentDate.setDate(multiDayFlowState.currentDate.getDate() + delta);
        
        // 不能超过今天
        if (multiDayFlowState.currentDate > today) {
            multiDayFlowState.currentDate = new Date(today);
        }
        
        // 更新显示范围：以新的当前日期为基准，往前2天，往后到今天结束
        multiDayFlowState.newestDate = new Date(today);
        multiDayFlowState.newestDate.setHours(23, 59, 59, 999);
        multiDayFlowState.oldestDate = new Date(multiDayFlowState.currentDate);
        multiDayFlowState.oldestDate.setDate(multiDayFlowState.oldestDate.getDate() - 2);
        
        updateFlowDetailTitle();
        renderMultiDayFlowContent(content, multiDayFlowState.oldestDate, multiDayFlowState.newestDate);
        
        // 滑动动画：滑入（从反方向滑入）
        const newWrapper = content.querySelector('.multi-day-flow-wrapper');
        if (newWrapper) {
            newWrapper.classList.add(delta > 0 ? 'slide-right' : 'slide-left');
            // 强制reflow后移除class，触发过渡动画
            newWrapper.offsetHeight;
            newWrapper.classList.remove('slide-left', 'slide-right');
        }
        
        // 滚动到目标日期的0点位置
        setTimeout(() => {
            const targetDateStr = getLocalDateString(multiDayFlowState.currentDate);
            const targetLine = content.querySelector(`.hour-line[data-date="${targetDateStr}"]`);
            if (targetLine) {
                const topPx = parseInt(targetLine.style.getPropertyValue('--top-px')) || 0;
                content.scrollTop = topPx;
            } else {
                content.scrollTop = content.scrollHeight;
            }
        }, 50);
    }, 150); // 等待滑出动画完成
}

// [v5.8.0] 渲染多天时间流图内容
function renderMultiDayFlowContent(container, startDate, endDate) {
    const days = Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000)) + 1;
    const slots = getMultiDayFlowSlots(endDate, days);
    
    // 计算统计
    let earned = 0, spent = 0;
    const countedTransactions = new Set();
    slots.forEach(slot => {
        if (countedTransactions.has(slot.transactionId)) return;
        countedTransactions.add(slot.transactionId);
        if (slot.isSpend) spent += slot.durationSeconds;
        else earned += slot.durationSeconds;
    });
    
    // 空状态
    if (slots.length === 0) {
        container.innerHTML = `
            <div class="multi-day-flow-wrapper">
                <div class="empty-message" style="text-align:center;padding:40px;color:var(--text-color-light)">无活动记录</div>
            </div>
        `;
        return;
    }
    
    // 分配列
    assignFlowColumns(slots);
    
    // 找暂停连接
    const connections = findFlowPauseConnections(slots);
    
    // 计算时间范围（跨多天）
    const minTime = new Date(Math.min(...slots.map(s => s.start.getTime())));
    let maxTime = new Date(Math.max(...slots.map(s => s.end.getTime())));
    
    // [修复] 确保 maxTime 至少包含当前时间，这样才能显示今天的剩余时间和当前时间线
    const now = new Date();
    if (now > maxTime) {
        maxTime = now;
    }
    
    // 计算网格参数
    const PX_PER_HOUR = 51;
    const startHour = minTime.getHours();
    const startDay = new Date(minTime);
    startDay.setHours(0, 0, 0, 0);
    
    // 计算总小时数（从最早slot开始到最晚slot结束）
    const totalMs = maxTime - minTime;
    const totalHours = Math.ceil(totalMs / (60 * 60 * 1000)) + 2; // 加2小时边距
    
    // 基准时间点（网格起始）
    const gridStartTime = new Date(minTime);
    gridStartTime.setMinutes(0, 0, 0);
    gridStartTime.setHours(gridStartTime.getHours() - 1); // 提前1小时
    
    function timeToPx(date) {
        const diffMs = date.getTime() - gridStartTime.getTime();
        const diffHours = diffMs / (60 * 60 * 1000);
        return diffHours * PX_PER_HOUR;
    }
    
    const totalGridHeight = totalHours * PX_PER_HOUR;
    
    // [v5.8.0] 构建刻度小时列表：0-8点折叠为一行，8点后每小时一行
    const displayHours = [];
    let gridStartHour = gridStartTime.getHours();
    let currentTime = new Date(gridStartTime);
    let h = 0;
    while (h < totalHours) {
        const hourNum = (gridStartHour + h) % 24;
        const dayOffset = Math.floor((gridStartHour + h) / 24);
        const hourTime = new Date(gridStartTime.getTime() + h * 60 * 60 * 1000);
        
        if (hourNum < 8) {
            // 0-8点区间：折叠为一行
            const hoursUntil8 = 8 - hourNum;
            const spanHours = Math.min(hoursUntil8, totalHours - h);
            // 0点显示日期，其他显示00:00
            const label = hourNum === 0 ? `${hourTime.getMonth()+1}/${hourTime.getDate()}` : '00:00';
            displayHours.push({ hour: hourNum, span: spanHours, label, time: hourTime, isNewDay: hourNum === 0 });
            h += spanHours;
        } else {
            // 8点及以后：每小时一行
            const label = hourNum.toString().padStart(2, '0') + ':00';
            displayHours.push({ hour: hourNum, span: 1, label, time: hourTime, isNewDay: false });
            h++;
        }
    }
    
    // 计算折叠后的总高度
    let foldedHeight = 0;
    displayHours.forEach(item => {
        if (item.hour < 8) {
            foldedHeight += PX_PER_HOUR; // 0-8点区间固定一行高度
        } else {
            foldedHeight += PX_PER_HOUR;
        }
    });
    
    // 构建小时到像素的映射
    function timeToPxFolded(date) {
        const targetMs = date.getTime();
        let accPx = 0;
        for (const item of displayHours) {
            const itemStartMs = item.time.getTime();
            const itemEndMs = itemStartMs + item.span * 60 * 60 * 1000;
            if (targetMs < itemStartMs) return accPx;
            if (targetMs <= itemEndMs) {
                const fraction = (targetMs - itemStartMs) / (item.span * 60 * 60 * 1000);
                return accPx + fraction * PX_PER_HOUR;
            }
            accPx += PX_PER_HOUR;
        }
        return accPx;
    }
    
    let html = `
        <div class="multi-day-flow-wrapper" id="multiDayFlowWrapper">
            <div class="multi-day-flow-grid" style="height:${foldedHeight}px">
    `;
    
    // 小时刻度线
    html += '<div class="hour-lines">';
    let currentPx = 0;
    for (const item of displayHours) {
        const classes = item.isNewDay ? 'new-day' : '';
        const dateAttr = item.isNewDay ? `data-date="${item.time.getFullYear()}-${String(item.time.getMonth()+1).padStart(2,'0')}-${String(item.time.getDate()).padStart(2,'0')}"` : '';
        html += `<div class="hour-line ${classes}" ${dateAttr} style="--top-px:${currentPx}px;--height-px:${PX_PER_HOUR}px"><span>${item.label}</span></div>`;
        currentPx += PX_PER_HOUR;
    }
    html += '</div>';
    
    // 当前时间指示线（now已在上面定义）
    if (now >= gridStartTime && now <= new Date(gridStartTime.getTime() + totalHours * 60 * 60 * 1000)) {
        const nowPx = timeToPxFolded(now);
        html += `<div class="current-time-indicator" style="--top-px:${nowPx}px"><div class="current-time-ball"></div><div class="current-time-line"></div></div>`;
    }
    
    // 暂停虚线连接
    // [v6.4.6] 修复：虚线应从色块的实际渲染底部开始，考虑最小高度28px
    html += '<div class="pause-connections">';
    connections.forEach(conn => {
        const fromTopPx = timeToPxFolded(conn.from.start);
        const fromEndPx = timeToPxFolded(conn.from.end);
        // 考虑最小高度28px，计算实际渲染的底部位置
        const fromBlockHeight = Math.max(28, fromEndPx - fromTopPx);
        const fromBlockBottomPx = fromTopPx + fromBlockHeight;
        
        const toStartPx = timeToPxFolded(conn.to.start);
        const heightPx = toStartPx - fromBlockBottomPx;
        if (heightPx > 0) {
            html += `<div class="pause-line" style="--col:${conn.from.column};--top-px:${fromBlockBottomPx}px;--height-px:${heightPx}px;--line-color:${conn.color}"></div>`;
        }
    });
    html += '</div>';
    
    // 任务条块
    html += '<div class="task-blocks">';
    slots.forEach(slot => {
        const topPx = timeToPxFolded(slot.start);
        const bottomPx = timeToPxFolded(slot.end);
        const heightPx = Math.max(28, bottomPx - topPx);
        const segType = slot.segmentType || 'only';
        const durationMins = slot.durationMinutes;
        
        // [v5.8.0] 时长判断：涉及0-8点压缩区间的任务需要更高时长要求
        const startHour = slot.start.getHours();
        const endHour = slot.end.getHours();
        const involvesCompressedZone = startHour < 8 || endHour < 8 || (startHour > endHour); // 跨午夜也算
        const showTimeThreshold = involvesCompressedZone ? 240 : 60; // 压缩区间4小时，普通1小时
        const showTime = durationMins >= showTimeThreshold;
        const allowWrap = durationMins >= 45;
        const showDuration = durationMins >= 180;
        const nameClass = allowWrap ? 'task-block-name allow-wrap' : 'task-block-name';
        const durationText = showDuration ? `<div class="task-block-duration">${formatTime(Math.round(slot.realDurationSeconds))}</div>` : '';
        
        let blockContent = '';
        if (segType === 'only') {
            if (showTime) {
                blockContent = `
                    <div class="task-block-time-top">${formatTimeHM(slot.start)}</div>
                    <div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>
                    <div class="task-block-time-bottom">${formatTimeHM(slot.end)}</div>
                `;
            } else {
                blockContent = `<div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>`;
            }
        } else if (segType === 'first') {
            if (showTime) {
                blockContent = `
                    <div class="task-block-time-top">${formatTimeHM(slot.start)}</div>
                    <div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>
                    <div class="task-block-time-bottom">${slot.pauseTime ? '暂停 ' + slot.pauseTime : formatTimeHM(slot.end)}</div>
                `;
            } else {
                blockContent = `<div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>`;
            }
        } else if (segType === 'middle') {
            if (showTime) {
                blockContent = `
                    <div class="task-block-time-top">${slot.resumeTime ? '继续 ' + slot.resumeTime : formatTimeHM(slot.start)}</div>
                    <div class="task-block-content">${durationText}</div>
                    <div class="task-block-time-bottom">${slot.pauseTime ? '暂停 ' + slot.pauseTime : formatTimeHM(slot.end)}</div>
                `;
            } else {
                blockContent = `<div class="task-block-content">${durationText}</div>`;
            }
        } else if (segType === 'last') {
            if (showTime) {
                blockContent = `
                    <div class="task-block-time-top">${slot.resumeTime ? '继续 ' + slot.resumeTime : formatTimeHM(slot.start)}</div>
                    <div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>
                    <div class="task-block-time-bottom">${formatTimeHM(slot.end)}</div>
                `;
            } else {
                blockContent = `<div class="task-block-content"><div class="${nameClass}">${escapeHtml(slot.taskName)}</div>${durationText}</div>`;
            }
        }
        
        html += `<div class="task-block segment-${segType}" style="--col:${slot.column};--top-px:${topPx}px;--height-px:${heightPx}px;--cat-color:${slot.color}">${blockContent}</div>`;
    });
    html += '</div>';
    
    html += '</div></div>';
    
    container.innerHTML = html;
}

// 从日历弹窗展开到详情页的动画版本
function showDayDetailsWithAnimation(localDateStr) {
    const modal = document.getElementById('dayDetailModal');
    // 添加特殊标记用于展开动画（只在关闭弹窗时移除，避免触发二次动画）
    modal.classList.add('from-tooltip');
    // 调用原始函数填充内容
    showDayDetails(localDateStr);
}
function hideDayDetailModal() { document.getElementById('dayDetailModal').classList.remove('show', 'from-tooltip'); }
function hideCategoryDetailModal() { document.getElementById('categoryDetailModal').classList.remove('show', 'from-pie'); }
// [v5.2.0] 通用信息弹窗函数
function showInfoModal(title, content) { 
    document.getElementById('generalInfoModalTitle').textContent = title; 
    document.getElementById('generalInfoModalContent').innerHTML = content; 
    document.getElementById('generalInfoModal').classList.add('show'); 
}
function hideInfoModal() { document.getElementById('generalInfoModal').classList.remove('show'); }
// [v7.10.0] 新手导览（分步）
let onboardingStepIndex = 0;
let onboardingFlow = 'main';
let taskOnboardingStepIndex = 0;
let isTaskOnboardingActive = false;
let taskOnboardingDetailSteps = [];
let taskOnboardingDetailIndex = 0;
let taskOnboardingDetailType = null;
let onboardingEditTaskId = null;
let onboardingEditSpendTaskId = null;
const onboardingSteps = [
    {
id: 'balance',
selector: '#balanceCard',
title: '时间余额一目了然',
text: '这里显示你的时间余额，以及今日获得/消费的快速汇总。'
    },
    {
id: 'earn-single',
title: '单次任务：一键获得',
text: '例如“写周报/整理房间”，点一次就立即获得时间。',
tab: 'earn',
getTarget: () => findOnboardingTaskCard(['reward'])
    },
    {
id: 'earn-timer',
title: '计时任务：按时长累积',
text: '例如“专注学习/跑步”，开始计时后按实际时长累计。',
tab: 'earn',
getTarget: () => findOnboardingTaskCard(['continuous', 'continuous_target'])
    },
    {
id: 'spend-nav',
selector: '.tab-button[data-tab="spend"]',
title: '切换到消费时间',
text: '点击底部的「消费时间」标签，用获得的时间兑换休闲娱乐。',
tab: 'earn'
    }
];

// [v7.10.1] 重新设计的任务引导流程 - 以「练吉他」为例
const taskOnboardingSteps = [
    {
id: 'fab',
selector: '#fabButton',
title: '创建入口',
text: '点击右下角「+」可以创建新任务。现在，我们先看看一个配置完善的示例。',
tab: 'earn'
    },
    {
id: 'pick-guitar-task',
title: '🎸 一起看看这个任务',
text: '「练吉他」是一个达标任务，让我们看看它的各项配置。',
tab: 'earn',
getTarget: () => findOnboardingTaskByName('练吉他'),
scrollIntoView: true
    },
    {
id: 'menu-edit',
title: '进入编辑',
text: '点击菜单中的「✏️ 编辑」，进入任务配置界面。',
tab: 'earn',
getTarget: () => getOnboardingEditMenuItem(),
ensure: () => openOnboardingMenuEdit(getOnboardingEditTaskId()),
scrollIntoView: true
    },
    {
id: 'edit-type',
title: '任务类型：达标任务',
text: '达标任务需要累积到设定时长才能获得额外奖励，适合需要持续专注的活动。',
getTarget: () => document.getElementById('taskTypeTrigger')?.closest('.form-group'),
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId())
    },
    {
id: 'edit-category',
title: '任务分类',
text: '可以选择已有的分类标签，也可以直接输入新分类，系统会自动记住。',
getTarget: () => document.getElementById('taskCategory')?.closest('.form-group'),
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
scrollIntoView: true
    },
    {
id: 'edit-multiplier',
title: '获得倍率',
text: '倍率决定单位时间的收益。灵活调整倍率，可随时激励高价值行为或适度克制。',
getTarget: () => getVisibleElement('#multiplierGroup'),
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
scrollIntoView: true
    },
    {
id: 'edit-target-bonus',
title: '目标与奖励',
text: '设定达标所需的累积时长，达到后一次性获得额外奖励——这是对坚持到底的激励！',
getTarget: () => {
    const target = getVisibleElement('#targetTimeGroup');
    const bonus = getVisibleElement('#bonusRewardGroup');
    if (target && bonus) {
        // 返回一个虚拟矩形包含两者
        return { 
            _isComposite: true,
            elements: [target, bonus],
            getBoundingClientRect: () => {
                const r1 = target.getBoundingClientRect();
                const r2 = bonus.getBoundingClientRect();
                return {
                    top: Math.min(r1.top, r2.top),
                    left: Math.min(r1.left, r2.left),
                    bottom: Math.max(r1.bottom, r2.bottom),
                    right: Math.max(r1.right, r2.right),
                    width: Math.max(r1.right, r2.right) - Math.min(r1.left, r2.left),
                    height: Math.max(r1.bottom, r2.bottom) - Math.min(r1.top, r2.top)
                };
            }
        };
    }
    return target;
},
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
scrollIntoView: true
    },
    {
id: 'edit-habit-settings',
title: '习惯设置',
text: '设置打卡周期（每日/每周等）、目标次数和每日上限，构建你的习惯养成计划。',
getTarget: () => {
    // 高亮标题 + 周期选择 + habit-grid，不包含奖励规则
    const title = document.querySelector('#habitSettingsGroup .habit-settings-title');
    const habitGrid = document.querySelector('#habitSettingsGroup .habit-grid');
    const elements = [title, habitGrid].filter(Boolean);
    if (elements.length >= 2) {
        return {
            _isComposite: true,
            elements: elements,
            getBoundingClientRect: () => {
                const rects = elements.map(el => el.getBoundingClientRect());
                return {
                    top: Math.min(...rects.map(r => r.top)),
                    left: Math.min(...rects.map(r => r.left)),
                    bottom: Math.max(...rects.map(r => r.bottom)),
                    right: Math.max(...rects.map(r => r.right)),
                    width: Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
                    height: Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))
                };
            }
        };
    }
    return title || habitGrid;
},
ensure: () => { openOnboardingEditTask(getOnboardingEditTaskId()); ensureOnboardingHabitEnabled(); },
scrollIntoView: true,
waitTime: 200
    },
    {
id: 'edit-reward-rules',
title: '连胜奖励规则',
text: '已设置好的奖励规则：连续 3 天额外奖励 5 分钟，7 天后每天递增 1 分钟。点击下方按钮可添加更多阶梯奖励！',
getTarget: () => {
    // 高亮标题(#habitRewardsLabel) + 奖励列表，不包含添加按钮
    const label = document.getElementById('habitRewardsLabel');
    const container = document.getElementById('habitRewardsContainer');
    const elements = [label, container].filter(Boolean);
    if (elements.length >= 2 && container.children.length > 0) {
        return {
            _isComposite: true,
            elements: elements,
            getBoundingClientRect: () => {
                const rects = elements.map(el => el.getBoundingClientRect());
                return {
                    top: Math.min(...rects.map(r => r.top)),
                    left: Math.min(...rects.map(r => r.left)),
                    bottom: Math.max(...rects.map(r => r.bottom)),
                    right: Math.max(...rects.map(r => r.right)),
                    width: Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
                    height: Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))
                };
            }
        };
    }
    return label || container;
},
ensure: () => { openOnboardingEditTask(getOnboardingEditTaskId()); ensureOnboardingHabitEnabled(); },
scrollIntoView: true
    },
    {
id: 'edit-extras',
title: '更多实用功能',
text: '「设置提醒」定时通知，「关联应用」自动启动 App，「悬浮窗」实时显示进度——针对特定任务，这些功能能大放异彩。',
getTarget: () => {
    const reminder = getVisibleElement('#reminderToggleContainer');
    const appLauncher = getVisibleElement('#appLauncherToggleContainer');
    const floating = getVisibleElement('#floatingTimerToggleContainer');
    const elements = [reminder, appLauncher, floating].filter(Boolean);
    if (elements.length >= 2) {
        return {
            _isComposite: true,
            elements: elements,
            getBoundingClientRect: () => {
                const rects = elements.map(el => el.getBoundingClientRect());
                return {
                    top: Math.min(...rects.map(r => r.top)),
                    left: Math.min(...rects.map(r => r.left)),
                    bottom: Math.max(...rects.map(r => r.bottom)),
                    right: Math.max(...rects.map(r => r.right)),
                    width: Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)),
                    height: Math.max(...rects.map(r => r.bottom)) - Math.min(...rects.map(r => r.top))
                };
            }
        };
    }
    return reminder;
},
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
scrollIntoView: true
    },
    {
id: 'edit-save',
title: '保存任务',
text: '一切就绪！点击「保存」完成配置。基础引导到此结束，开始你的时间管理之旅吧！',
getTarget: () => getVisibleElement('#submitBtn'),
ensure: () => openOnboardingEditTask(getOnboardingEditTaskId()),
scrollIntoView: true,
waitTime: 260
    }
];

// [v7.11.0] 报告系统引导步骤 - 重点演示交互动画
// ============================================================
// [v7.11.0] 独立报告引导系统 - 完全重构
// ============================================================

// 报告引导步骤定义
const REPORT_ONBOARDING_STEPS = [
    // === 第一部分：活动日历 ===
    {
id: 'heatmap-intro',
selector: '[data-card-id="activityHeatmap"]',
title: '📅 活动日历',
text: '以热力图展示每日活跃度。<b>绿色</b>代表净赚时间，<b>红色</b>代表净消费，颜色越深数值越大。',
useHtml: true
    },
    {
id: 'heatmap-click',
title: '👆 点击查看详情',
text: '你可以<b>长按</b>或<b>点击</b>任意日期查看详情，也可以直接点击下一步继续。',
getTarget: () => findColoredHeatmapCell(),
useHtml: true
    },
    {
id: 'heatmap-longpress',
title: '✨ 长按拖动探索',
text: '<b>进阶技巧：</b>在日历上<b>长按并拖动</b>，tooltip 会跟随手指移动，快速预览每一天！<br><br><span style="opacity:0.7">当前为演示模式</span>',
selector: '[data-card-id="activityHeatmap"]',
useHtml: true,
onEnter: () => startHeatmapOnboardingPreview({ move: true, startFromSecondRow: true, speedMultiplier: 1.25 })
    },
    
    // === 第二部分：时间仪表盘与饼图 ===
    {
id: 'dashboard-intro',
selector: '[data-card-id="analysisDashboard"]',
title: '📈 时间仪表盘',
text: '展示关键指标（总获得/总消费/净余额）和时间分布饼图。',
scrollIntoView: true
    },
    {
id: 'pie-touch',
title: '🥧 触摸饼图试试',
text: '用手指<b>触摸饼图</b>的任意扇形——扇形会<b>向外弹出</b>并显示详情！<br><br><span style="opacity:0.7">演示完成后将自动打开详情页，关闭后继续</span>',
getTarget: () => document.querySelector('.pie-chart-container'),
scrollIntoView: true,
useHtml: true,
onEnter: () => startPieOnboardingDemo()
    },
    {
id: 'pie-longpress',
title: '👆 长按滑动探索',
text: '<b>进阶技巧：</b>在饼图上<b>长按并滑动</b>，悬浮窗会跟随手指在各个扇形间切换！<br><br><span style="opacity:0.7">当前为演示模式</span>',
getTarget: () => document.querySelector('.pie-chart-container'),
scrollIntoView: true,
useHtml: true,
onEnter: () => startPieTooltipSlideDemo()
    },
    
    // === 第三部分：详细数据 ===
    {
id: 'table-intro',
selector: '[data-card-id="dataTable"]',
title: '📋 详细数据',
text: '以表格形式展示累计时间和次数。<b>点击表头</b>可以按不同列排序！',
scrollIntoView: true,
useHtml: true
    },
    
    // === 第四部分：趋势演变 ===
    {
id: 'trend-intro',
selector: '[data-card-id="trendChart"]',
title: '📉 趋势演变',
text: '折线图展示时间使用随日期的变化趋势，发现长期规律。',
scrollIntoView: true
    },
    {
id: 'trend-touch',
title: '👆 长按滑动查看',
text: '在折线图上<b>长按并滑动</b>，可以查看每个数据点的具体数值！<br><br><span style="opacity:0.7">当前为演示模式，点击下一步结束引导</span>',
selector: '[data-card-id="trendChart"]',
scrollIntoView: true,
useHtml: true,
onEnter: () => startTrendTooltipSlideDemo()
    }
];

// ============================================================
// 报告引导状态管理
// ============================================================
let reportOnboardingActive = false;
let reportOnboardingStepIndex = 0;
let reportOnboardingPausedByModal = false;
let reportOnboardingActiveTarget = null;
let reportOnboardingInteractionLockEnabled = false;
let reportOnboardingModalObserver = null;

// ============================================================
// 报告引导核心函数
// ============================================================

/**
 * 启动报告引导（完全独立流程）
 */
function startReportOnboarding() {
    console.log('[ReportOnboarding] start');
    
    // 暂停所有其他引导
    isMainOnboardingPaused = true;
    isSimpleOnboardingActive = false;
    onboardingFlow = 'report';
    
    // 隐藏可能存在的其他引导遮罩
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.classList.remove('show');
    
    // 确保在报告页面
    switchTab('report');
    
    // 重置滚动位置
    const container = document.getElementById('appScrollContainer');
    if (container) {
container.scrollTop = 0;
container.scrollLeft = 0;
    }
    
    // 初始化状态
    reportOnboardingActive = true;
    reportOnboardingStepIndex = 0;
    reportOnboardingPausedByModal = false;
    reportOnboardingActiveTarget = null;
    
    // 启用交互锁
    enableReportOnboardingInteractionLock();
    
    // 设置弹窗监听（暂停/恢复机制）
    setupReportOnboardingModalWatch();
    
    // 显示第一步
    setTimeout(() => showReportOnboardingStep(0), 200);
}

/**
 * 显示报告引导的某一步
 */
function showReportOnboardingStep(stepIndex) {
    console.log('[ReportOnboarding] showStep called', stepIndex, {
active: reportOnboardingActive,
paused: reportOnboardingPausedByModal
    });
    
    if (!reportOnboardingActive) {
console.log('[ReportOnboarding] step blocked: not active');
return;
    }
    
    if (reportOnboardingPausedByModal) {
console.log('[ReportOnboarding] step blocked: paused by modal');
return;
    }
    
    const step = REPORT_ONBOARDING_STEPS[stepIndex];
    if (!step) {
console.log('[ReportOnboarding] no more steps, finishing');
finishReportOnboarding();
return;
    }
    
    console.log('[ReportOnboarding] step', stepIndex, step.id, {
hasSelector: !!step.selector,
hasGetTarget: !!step.getTarget,
scrollIntoView: !!step.scrollIntoView,
hasOnEnter: !!step.onEnter
    });
    
    // 停止上一步可能的演示动画
    stopHeatmapOnboardingPreview();
    stopPieOnboardingDemo();
    stopPieTooltipSlideDemo();
    stopTrendTooltipSlideDemo();
    
    // 确保在报告页面
    switchTab('report');
    
    // 获取目标元素
    setTimeout(() => {
let target = null;
if (step.getTarget) {
    target = step.getTarget();
} else if (step.selector) {
    target = document.querySelector(step.selector);
}

if (!target) {
    console.log('[ReportOnboarding] target NOT found:', step.id, {
        selector: step.selector || 'getTarget()',
        retryCount: step._retryCount || 0
    });
    
    // 重试机制
    const retryCount = step._retryCount || 0;
    if (retryCount < 3) {
        step._retryCount = retryCount + 1;
        console.log('[ReportOnboarding] retry', step._retryCount);
        setTimeout(() => showReportOnboardingStep(stepIndex), 300);
        return;
    }
    
    // 重试失败，跳过
    step._retryCount = 0;
    console.log('[ReportOnboarding] skip step after retries:', step.id);
    nextReportOnboardingStep();
    return;
}

// 清除重试计数
step._retryCount = 0;

console.log('[ReportOnboarding] target FOUND:', step.id, {
    tag: target.tagName,
    id: target.id || null,
    class: (target.className || '').slice(0, 50)
});

// 更新交互锁目标
reportOnboardingActiveTarget = target;

// 显示遮罩
const overlay = document.getElementById('onboardingOverlay');
if (overlay) overlay.classList.add('show');

// 滚动并定位
if (step.scrollIntoView) {
    reportOnboardingScrollToTarget(target, () => {
        positionReportOnboardingHighlight(target, step);
    });
} else {
    positionReportOnboardingHighlight(target, step);
}
    }, 150);
}

/**
 * 滚动到目标元素
 */
function reportOnboardingScrollToTarget(target, callback) {
    if (!target) {
if (callback) callback();
return;
    }
    
    const container = document.getElementById('appScrollContainer');
    if (!container) {
if (callback) callback();
return;
    }
    
    const rect = target.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const viewportHeight = containerRect.height;
    const center = rect.top + rect.height / 2;
    const viewportCenter = containerRect.top + viewportHeight / 2;
    const scrollOffset = center - viewportCenter;
    
    // 检查是否需要滚动
    const threshold = Math.min(140, viewportHeight * 0.2);
    const needsScroll = Math.abs(scrollOffset) > threshold;
    
    if (needsScroll) {
const targetScrollTop = container.scrollTop + scrollOffset;

console.log('[ReportOnboarding] scroll', {
    from: container.scrollTop,
    to: Math.max(0, targetScrollTop),
    offset: scrollOffset
});

// 监听滚动结束
let scrollEndTimer = null;
const onScrollEnd = () => {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
        container.removeEventListener('scroll', onScrollEnd);
        if (callback) callback();
    }, 100);
};

container.addEventListener('scroll', onScrollEnd);
container.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: 'smooth'
});

// 安全超时
setTimeout(() => {
    container.removeEventListener('scroll', onScrollEnd);
    if (callback) callback();
}, 500);
    } else {
if (callback) callback();
    }
}

/**
 * 定位高亮框和气泡
 */
function positionReportOnboardingHighlight(target, step) {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    
    const highlight = overlay.querySelector('.onboarding-highlight');
    const bubble = overlay.querySelector('.onboarding-bubble');
    const titleEl = overlay.querySelector('.onboarding-title');
    const textEl = overlay.querySelector('.onboarding-text');
    const arrow = overlay.querySelector('.onboarding-arrow');
    
    if (!highlight || !bubble || !titleEl || !textEl || !arrow) return;
    
    // 更新文本
    titleEl.textContent = step.title;
    if (step.useHtml) {
textEl.innerHTML = step.text;
    } else {
textEl.textContent = step.text;
    }
    
    // 获取目标位置
    const rect = target.getBoundingClientRect();
    const padding = 8;
    
    // 计算高亮框位置
    const highlightRect = {
left: Math.max(8, rect.left - padding),
top: Math.max(8, rect.top - padding),
width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
height: Math.min(window.innerHeight - 16, rect.height + padding * 2)
    };
    
    console.log('[ReportOnboarding] position highlight:', {
stepId: step.id,
rect: { x: rect.left, y: rect.top, w: rect.width, h: rect.height },
highlight: highlightRect
    });
    
    // 动画序列：先移除 visible
    const isFirstShow = !highlight.classList.contains('visible');
    bubble.classList.remove('visible');
    arrow.classList.remove('visible');
    if (isFirstShow) {
highlight.classList.remove('visible');
    }
    
    // 设置高亮框位置
    highlight.style.left = `${highlightRect.left}px`;
    highlight.style.top = `${highlightRect.top}px`;
    highlight.style.width = `${highlightRect.width}px`;
    highlight.style.height = `${highlightRect.height}px`;
    
    // 添加 visible
    requestAnimationFrame(() => {
highlight.classList.add('visible');
    });
    
    // 计算气泡位置
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    const bubbleRect = bubble.getBoundingClientRect();
    
    const placeBelow = rect.bottom + bubbleRect.height + 18 < window.innerHeight;
    const bubbleLeft = Math.min(
Math.max(rect.left + rect.width / 2 - bubbleRect.width / 2, 12),
window.innerWidth - bubbleRect.width - 12
    );
    
    let bubbleTop, arrowTop, arrowClass;
    if (placeBelow) {
bubbleTop = rect.bottom + 16;
arrowTop = rect.bottom + 6;
arrowClass = 'onboarding-arrow up';
    } else {
bubbleTop = rect.top - bubbleRect.height - 16;
arrowTop = bubbleTop + bubbleRect.height;
arrowClass = 'onboarding-arrow down';
    }
    
    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.top = `${bubbleTop}px`;
    
    const arrowLeft = Math.min(
Math.max(rect.left + rect.width / 2 - 8, 12),
window.innerWidth - 24
    );
    arrow.className = arrowClass;
    arrow.style.left = `${arrowLeft}px`;
    arrow.style.top = `${arrowTop}px`;
    
    // 延迟显示气泡
    const bubbleDelay = isFirstShow ? 220 : 180;
    setTimeout(() => {
if (!reportOnboardingActive || reportOnboardingPausedByModal) return;

bubble.classList.add('visible');
arrow.classList.add('visible');

// 触发 onEnter 回调
if (step.onEnter) {
    console.log('[ReportOnboarding] will call onEnter for', step.id);
    setTimeout(() => {
        if (reportOnboardingActive && !reportOnboardingPausedByModal) {
            console.log('[ReportOnboarding] calling onEnter for', step.id);
            step.onEnter();
        } else {
            console.log('[ReportOnboarding] onEnter skipped', step.id, { active: reportOnboardingActive, paused: reportOnboardingPausedByModal });
        }
    }, 200);
}

// [v7.11.0] 设置等待弹窗关闭（用于 pie-detail 等步骤）
if (step.waitForClose) {
    setupReportOnboardingWaitForClose(step.waitForClose);
}
    }, bubbleDelay);
}

/**
 * [v7.11.0] 等待弹窗关闭后自动进入下一步
 */
let reportOnboardingWaitCloseObserver = null;

function setupReportOnboardingWaitForClose(modalId) {
    if (reportOnboardingWaitCloseObserver) {
reportOnboardingWaitCloseObserver.disconnect();
reportOnboardingWaitCloseObserver = null;
    }
    
    const modal = document.getElementById(modalId);
    if (!modal) {
console.log('[ReportOnboarding] waitForClose: modal not found', modalId);
return;
    }
    
    console.log('[ReportOnboarding] waitForClose: watching', modalId);
    
    reportOnboardingWaitCloseObserver = new MutationObserver(() => {
const isShowing = modal.classList.contains('show');
if (!isShowing && reportOnboardingActive) {
    console.log('[ReportOnboarding] waitForClose: modal closed, going next', modalId);
    reportOnboardingWaitCloseObserver.disconnect();
    reportOnboardingWaitCloseObserver = null;
    
    // 延迟后进入下一步
    setTimeout(() => {
        if (reportOnboardingActive) {
            nextReportOnboardingStep();
        }
    }, 300);
}
    });
    
    reportOnboardingWaitCloseObserver.observe(modal, {
attributes: true,
attributeFilter: ['class']
    });
}

/**
 * 进入下一步
 */
function nextReportOnboardingStep() {
    // 停止当前演示
    stopHeatmapOnboardingPreview();
    stopPieOnboardingDemo();
    stopPieTooltipSlideDemo();
    stopTrendTooltipSlideDemo();
    
    const prevIndex = reportOnboardingStepIndex;
    const prevStep = REPORT_ONBOARDING_STEPS[prevIndex];
    reportOnboardingStepIndex++;
    const nextStep = REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex];
    
    console.log('[ReportOnboarding] nextStep:', prevStep?.id, '->', nextStep?.id, {
prevIndex,
nextIndex: reportOnboardingStepIndex,
total: REPORT_ONBOARDING_STEPS.length
    });
    
    showReportOnboardingStep(reportOnboardingStepIndex);
}

/**
 * 跳过/结束报告引导
 */
function finishReportOnboarding() {
    console.log('[ReportOnboarding] finish');
    
    // 隐藏遮罩
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.classList.remove('show');
    
    // 停止所有演示
    stopHeatmapOnboardingPreview();
    stopPieOnboardingDemo();
    stopPieTooltipSlideDemo();
    stopTrendTooltipSlideDemo();
    
    // 清理状态
    reportOnboardingActive = false;
    reportOnboardingStepIndex = 0;
    reportOnboardingPausedByModal = false;
    reportOnboardingActiveTarget = null;
    
    // 清理监听器
    cleanupReportOnboardingListeners();
    
    // 禁用交互锁
    disableReportOnboardingInteractionLock();
    
    // 恢复主引导状态
    isMainOnboardingPaused = false;
    onboardingFlow = 'none';
    
    // 显示完成提示
    showOnboardingFinishTip();
}

// ============================================================
// 报告引导交互锁
// ============================================================

function handleReportOnboardingInteraction(e) {
    if (!reportOnboardingInteractionLockEnabled) return;
    if (!reportOnboardingActive) return;
    if (reportOnboardingPausedByModal) return;
    
    const target = e.target;
    if (!target) return;
    
    // 允许气泡内交互
    if (target.closest('.onboarding-bubble')) return;
    
    // 允许高亮目标交互
    if (reportOnboardingActiveTarget && reportOnboardingActiveTarget.contains(target)) return;
    
    // 阻止其他交互
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
}

function enableReportOnboardingInteractionLock() {
    if (reportOnboardingInteractionLockEnabled) return;
    reportOnboardingInteractionLockEnabled = true;
    
    const opts = { passive: false, capture: true };
    window.addEventListener('pointerdown', handleReportOnboardingInteraction, opts);
    window.addEventListener('touchstart', handleReportOnboardingInteraction, opts);
    window.addEventListener('touchmove', handleReportOnboardingInteraction, opts);
    window.addEventListener('wheel', handleReportOnboardingInteraction, opts);
    window.addEventListener('click', handleReportOnboardingInteraction, opts);
    window.addEventListener('mousedown', handleReportOnboardingInteraction, opts);
    
    console.log('[ReportOnboarding] interaction lock ENABLED');
}

function disableReportOnboardingInteractionLock() {
    if (!reportOnboardingInteractionLockEnabled) return;
    reportOnboardingInteractionLockEnabled = false;
    
    const opts = { passive: false, capture: true };
    window.removeEventListener('pointerdown', handleReportOnboardingInteraction, opts);
    window.removeEventListener('touchstart', handleReportOnboardingInteraction, opts);
    window.removeEventListener('touchmove', handleReportOnboardingInteraction, opts);
    window.removeEventListener('wheel', handleReportOnboardingInteraction, opts);
    window.removeEventListener('click', handleReportOnboardingInteraction, opts);
    window.removeEventListener('mousedown', handleReportOnboardingInteraction, opts);
    
    console.log('[ReportOnboarding] interaction lock DISABLED');
}

// ============================================================
// 报告引导弹窗暂停机制
// ============================================================

let reportOnboardingModalObservers = []; // 多个弹窗的观察器
let reportOnboardingDemoTriggeredModal = false; // 是否由演示触发的弹窗

function setupReportOnboardingModalWatch() {
    cleanupReportOnboardingListeners();
    
    // 需要监听的弹窗列表
    const modalIds = ['dayDetailModal', 'categoryDetailModal'];
    
    modalIds.forEach(modalId => {
const modal = document.getElementById(modalId);
if (!modal) {
    console.log('[ReportOnboarding]', modalId, 'not found, skip watch');
    return;
}

const observer = new MutationObserver(() => {
    const isShowing = modal.classList.contains('show');
    
    if (isShowing && !reportOnboardingPausedByModal && reportOnboardingActive) {
        // 弹窗打开 → 暂停引导
        console.log('[ReportOnboarding] PAUSE by modal', modalId, {
            demoTriggered: reportOnboardingDemoTriggeredModal,
            currentStep: REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex]?.id
        });
        reportOnboardingPausedByModal = true;
        
        const overlay = document.getElementById('onboardingOverlay');
        if (overlay) overlay.classList.remove('show');
        
        disableReportOnboardingInteractionLock();
        stopHeatmapOnboardingPreview();
        stopPieOnboardingDemo();
        stopPieTooltipSlideDemo();
        stopTrendTooltipSlideDemo();
        
    } else if (!isShowing && reportOnboardingPausedByModal && reportOnboardingActive) {
        // 检查是否还有其他弹窗打开
        const anyModalOpen = modalIds.some(id => {
            const m = document.getElementById(id);
            return m && m.classList.contains('show');
        });
        
        if (!anyModalOpen) {
            // 所有弹窗都关闭 → 进入下一步
            const currentStep = REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex];
            
            console.log('[ReportOnboarding] modal closed, go next step', modalId, {
                currentStep: currentStep?.id
            });
            
            reportOnboardingPausedByModal = false;
            reportOnboardingDemoTriggeredModal = false;
            
            enableReportOnboardingInteractionLock();
            
            // 弹窗关闭后统一进入下一步
            setTimeout(() => {
                if (reportOnboardingActive) {
                    nextReportOnboardingStep();
                }
            }, 300);
        }
    }
});

observer.observe(modal, {
    attributes: true,
    attributeFilter: ['class']
});

reportOnboardingModalObservers.push(observer);
console.log('[ReportOnboarding] modal watch SETUP for', modalId);
    });
}

function cleanupReportOnboardingListeners() {
    reportOnboardingModalObservers.forEach(obs => obs.disconnect());
    reportOnboardingModalObservers = [];
    stopHeatmapOnboardingPreview();
    stopPieOnboardingDemo();
    stopPieTooltipSlideDemo();
    stopTrendTooltipSlideDemo();
}

// ============================================================
// 兼容旧版 API（供 nextOnboardingStep 调用）
// ============================================================
const reportOnboardingSteps = REPORT_ONBOARDING_STEPS;

// [v7.11.0] 查找有颜色的热力图格子（用于引导演示）
function findColoredHeatmapCell() {
    // 优先找有数据的格子
    const cells = document.querySelectorAll('.heatmap-day .heatmap-day-content[class*="net-"]');
    if (cells.length > 0) {
// 返回中间位置的格子，视觉效果更好
return cells[Math.floor(cells.length / 2)]?.parentElement || cells[0]?.parentElement;
    }
    // 如果没有有数据的格子，返回任意格子
    return document.querySelector('.heatmap-day');
}

// [v7.11.0] 自动演示饼图扇形外扩动画
function triggerPieSliceDemo() {
    const container = document.querySelector('.pie-chart-container');
    if (!container) return;
    
    const slices = container.querySelectorAll('.pie-highlight-slice');
    if (slices.length === 0) return;
    
    // 找一个较大的扇形演示（避免太小看不清）
    let targetSlice = slices[0];
    slices.forEach(slice => {
const baseD = slice.getAttribute('data-d-base') || '';
// 简单判断：路径字符串越长，扇形可能越大
if (baseD.length > (targetSlice.getAttribute('data-d-base') || '').length) {
    targetSlice = slice;
}
    });
    
    // 触发外扩动画
    targetSlice.classList.add('active');
    const expandedD = targetSlice.getAttribute('data-d-expanded');
    if (expandedD) targetSlice.setAttribute('d', expandedD);
    
    // 1.5秒后恢复
    setTimeout(() => {
targetSlice.classList.remove('active');
const baseD = targetSlice.getAttribute('data-d-base');
if (baseD) targetSlice.setAttribute('d', baseD);
    }, 1500);
}

// ============================================================
// [v7.11.0] 报告引导演示函数
// ============================================================

// 饼图演示状态
let pieOnboardingDemoActive = false;
let pieOnboardingDemoTimer = null;

// 停止饼图引导演示
function stopPieOnboardingDemo() {
    pieOnboardingDemoActive = false;
    if (pieOnboardingDemoTimer) {
clearTimeout(pieOnboardingDemoTimer);
pieOnboardingDemoTimer = null;
    }
    // 恢复所有扇形
    const slices = document.querySelectorAll('.pie-highlight-slice');
    slices.forEach(slice => {
slice.classList.remove('active');
const baseD = slice.getAttribute('data-d-base');
if (baseD) slice.setAttribute('d', baseD);
    });
}

// [v7.11.0] 饼图演示：外扩动画 + 自动打开详情
function startPieOnboardingDemo() {
    stopPieOnboardingDemo();
    pieOnboardingDemoActive = true;
    
    const container = document.querySelector('.pie-chart-container[data-pie-meta]');
    if (!container) {
console.log('[ReportOnboarding] startPieOnboardingDemo: no container');
return;
    }
    
    // 从 data-pie-meta 属性获取 meta 数据
    const metaStr = container.getAttribute('data-pie-meta');
    if (!metaStr) {
console.log('[ReportOnboarding] startPieOnboardingDemo: no meta attribute');
return;
    }
    
    let meta;
    try {
meta = JSON.parse(decodeURIComponent(metaStr));
    } catch(e) {
console.log('[ReportOnboarding] startPieOnboardingDemo: meta parse error', e);
return;
    }
    
    const slices = Array.from(container.querySelectorAll('.pie-highlight-slice'));
    if (slices.length === 0 || !meta || !meta.slices || meta.slices.length === 0) {
console.log('[ReportOnboarding] startPieOnboardingDemo: no slices or meta data');
return;
    }
    
    // 找一个较大的扇形
    let targetSlice = slices[0];
    let targetIndex = 0;
    slices.forEach((slice, idx) => {
const baseD = slice.getAttribute('data-d-base') || '';
if (baseD.length > (targetSlice.getAttribute('data-d-base') || '').length) {
    targetSlice = slice;
    targetIndex = idx;
}
    });
    
    const sliceData = meta.slices[targetIndex];
    console.log('[ReportOnboarding] startPieOnboardingDemo: target slice', targetIndex, sliceData?.name);
    
    // 触发外扩动画
    targetSlice.classList.add('active');
    const expandedD = targetSlice.getAttribute('data-d-expanded');
    if (expandedD) targetSlice.setAttribute('d', expandedD);
    
    // 2秒后打开详情页（弹窗监听会自动暂停引导）
    pieOnboardingDemoTimer = setTimeout(() => {
if (!pieOnboardingDemoActive) return;

// 恢复扇形
targetSlice.classList.remove('active');
const baseD = targetSlice.getAttribute('data-d-base');
if (baseD) targetSlice.setAttribute('d', baseD);

// 打开分类详情
if (sliceData && sliceData.name) {
    console.log('[ReportOnboarding] opening category detail:', sliceData.name, meta.typeKey);
    // 标记这是演示触发的弹窗，关闭后应该进入下一步
    reportOnboardingDemoTriggeredModal = true;
    // 使用正确的函数打开详情，fromPie=true 表示从饼图进入
    showCategoryDetail(sliceData.name, meta.typeKey || 'earn', true);
}

pieOnboardingDemoActive = false;
    }, 2000);
}

// [v7.11.0] 饼图悬浮窗滑动演示
let pieTooltipSlideDemoActive = false;
let pieTooltipSlideDemoTimer = null;

function stopPieTooltipSlideDemo() {
    pieTooltipSlideDemoActive = false;
    if (pieTooltipSlideDemoTimer) {
clearTimeout(pieTooltipSlideDemoTimer);
pieTooltipSlideDemoTimer = null;
    }
    // 隐藏 tooltip
    if (typeof hidePieTooltip === 'function') {
hidePieTooltip();
    }
    // 清除高亮
    if (typeof clearPieActiveHighlight === 'function') {
clearPieActiveHighlight();
    }
}

function startPieTooltipSlideDemo() {
    stopPieTooltipSlideDemo();
    pieTooltipSlideDemoActive = true;
    
    const container = document.querySelector('.pie-chart-container[data-pie-meta]');
    if (!container) {
console.log('[ReportOnboarding] pie tooltip demo: no container');
return;
    }
    
    // 从 data-pie-meta 属性获取 meta 数据
    const metaStr = container.getAttribute('data-pie-meta');
    if (!metaStr) {
console.log('[ReportOnboarding] pie tooltip demo: no meta attribute');
return;
    }
    
    let meta;
    try {
meta = JSON.parse(decodeURIComponent(metaStr));
    } catch(e) {
console.log('[ReportOnboarding] pie tooltip demo: meta parse error', e);
return;
    }
    
    if (!meta || !meta.slices || meta.slices.length === 0) {
console.log('[ReportOnboarding] pie tooltip demo: no slices in meta');
return;
    }
    
    console.log('[ReportOnboarding] pie tooltip demo START (circle mode), slices:', meta.slices.length);
    
    // 获取饼图中心和半径
    const svg = container.querySelector('svg');
    const svgRect = svg ? svg.getBoundingClientRect() : container.getBoundingClientRect();
    const cx = svgRect.left + svgRect.width / 2;
    const cy = svgRect.top + svgRect.height / 2;
    const radius = Math.min(svgRect.width, svgRect.height) / 2 * 0.6;
    
    // 模拟长按画圆圈：每帧移动一小步
    let angle = -90; // 从顶部开始
    const angleStep = 4; // 每步旋转角度（度）
    const frameInterval = 50; // 每帧间隔5ms，更流畅
    
    const animateCircle = () => {
if (!pieTooltipSlideDemoActive) return;

// 计算当前位置
const rad = angle * Math.PI / 180;
const x = cx + radius * Math.cos(rad);
const y = cy + radius * Math.sin(rad);

// 找到当前位置对应的扇形
const slice = getPieSliceAtPoint(container, meta, x, y);
if (slice) {
    // 设置高亮和显示tooltip
    setPieActiveHighlight(container, meta, slice);
    showPieTooltip(meta, slice, x, y, true);
}

// 更新角度
angle += angleStep;
if (angle >= 270) { // 完成一圈
    angle = -90;
}

pieTooltipSlideDemoTimer = setTimeout(animateCircle, frameInterval);
    };
    
    // 开始动画
    animateCircle();
}

// [v7.11.0] 趋势图悬浮窗滑动演示
let trendTooltipSlideDemoActive = false;
let trendTooltipSlideDemoTimer = null;
let trendTooltipSlideDemoRAF = null;
let trendTooltipSlideDemoStart = 0;
let trendTooltipSlideDemoLastIndex = -1;
let trendTooltipDemoCancelledByUser = false; // [v7.18.4] 标记演示是否被用户交互取消

function stopTrendTooltipSlideDemo() {
    trendTooltipSlideDemoActive = false;
    if (trendTooltipSlideDemoTimer) {
clearTimeout(trendTooltipSlideDemoTimer);
trendTooltipSlideDemoTimer = null;
    }
    if (trendTooltipSlideDemoRAF) {
cancelAnimationFrame(trendTooltipSlideDemoRAF);
trendTooltipSlideDemoRAF = null;
    }
    if (typeof hideTrendTooltip === 'function') {
hideTrendTooltip();
    }
    if (typeof clearTrendActiveBar === 'function') {
clearTrendActiveBar();
    }
}

// [v7.18.4] 停止演示并标记为用户交互取消
function stopTrendTooltipDemoByUser() {
    trendTooltipDemoCancelledByUser = true;
    stopTrendTooltipSlideDemo();
}

function startTrendTooltipSlideDemo() {
    stopTrendTooltipSlideDemo();
    trendTooltipSlideDemoActive = true;
    
    const bars = Array.from(document.querySelectorAll('.trend-day[data-tooltip]'));
    if (bars.length === 0) {
console.log('[ReportOnboarding] trend tooltip demo: no bars');
return;
    }
    
    console.log('[ReportOnboarding] trend tooltip demo START, bars:', bars.length);
    const barRects = bars.map(bar => bar.getBoundingClientRect());
    const minX = barRects[0].left;
    const maxX = barRects[barRects.length - 1].right;
    const midY = barRects[0].top + barRects[0].height / 2;
    const duration = 16640; // [v7.18.4] 动画速度降低60%（总计降低约70%）

    trendTooltipSlideDemoStart = performance.now();
    trendTooltipSlideDemoLastIndex = -1;

    const pickIndexByX = (x) => {
for (let i = 0; i < barRects.length; i++) {
    if (x <= barRects[i].right) return i;
}
return barRects.length - 1;
    };

    const frame = (now) => {
if (!trendTooltipSlideDemoActive) return;
const elapsed = now - trendTooltipSlideDemoStart;
const phase = (elapsed % (duration * 2)) / duration;
const t = phase <= 1 ? phase : 2 - phase; // ping-pong
const x = minX + (maxX - minX) * t;
const index = pickIndexByX(x);

if (index !== trendTooltipSlideDemoLastIndex) {
    trendTooltipSlideDemoLastIndex = index;
    const bar = bars[index];
    if (bar) {
        if (typeof clearTrendActiveBar === 'function') {
            clearTrendActiveBar();
        }
        bar.classList.add('active');
        if (typeof showTrendTooltip === 'function') {
            showTrendTooltip(bar, true);
        }
    }
} else {
    const bar = bars[index];
    if (bar && typeof showTrendTooltip === 'function') {
        showTrendTooltip(bar, true);
    }
}

trendTooltipSlideDemoRAF = requestAnimationFrame(frame);
    };

    trendTooltipSlideDemoRAF = requestAnimationFrame(frame);
}

// [v7.10.1] 设置系统引导步骤
const settingsOnboardingSteps = [
    {
id: 'settings-nav',
selector: '.tab-button[data-tab="settings"]',
title: '进入设置页面',
text: '点击底部「设置」标签，管理你的账户和偏好。',
tab: 'earn'
    },
    {
id: 'sync-section',
selector: '#syncSection',
title: '☁️ 数据同步',
text: '使用邮箱注册登录后，可以在多台设备间同步任务和记录。「快速开始」适合单设备用户。',
tab: 'settings'
    },
    {
id: 'appearance',
selector: '#accentSelector',
title: '🎨 外观设置',
text: '选择主题配色、上传自定义背景，还可以切换「经典」或「通透」卡片样式。',
tab: 'settings',
scrollIntoView: true
    },
    {
id: 'sleep-card',
selector: '#sleepSettingsCard',
title: '😴 睡眠时间管理',
text: '设置就寝/起床时间，系统会根据实际睡眠情况给予奖励或扣除时间。',
tab: 'settings',
scrollIntoView: true
    },
    {
id: 'screen-time-card',
selector: '#screenTimeSettingsCard',
title: '📱 屏幕时间管理',
text: '设置每日屏幕时间限额，超时消费、节省奖励，帮助控制手机使用。',
tab: 'settings',
scrollIntoView: true
    },
    {
id: 'balance-mode',
selector: '#balanceModeSection',
title: '⚖️ 均衡模式',
text: '开启后，余额越高获得倍率越低，鼓励及时使用余额，保持收支平衡。',
tab: 'settings',
scrollIntoView: true
    },
    {
id: 'data-management',
selector: '#data-btn-container',
title: '💾 数据管理',
text: '导出数据备份、导入恢复、或清空重新开始。定期备份是个好习惯！设置引导到此结束。',
tab: 'settings',
scrollIntoView: true
    }
];

// [v7.25.1] 通透模式专属引导：合并为单步，动态获取目标确保可见
const glassTuningOnboardingSteps = [
    {
id: 'glass-tuning',
getTarget: () => {
    const el = document.getElementById('glassStrengthSetting');
    if (!el || el.offsetParent === null) return null;
    return el;
},
title: '调节通透效果',
text: '左右拖动「通透强度」和「模糊强度」滑块，实时预览效果，找到最适合的视觉氛围。',
tab: 'settings',
scrollIntoView: true
    }
];

// [v7.10.1] 当前激活的引导模块
let currentOnboardingModule = 'task';
let isManualTaskOnboarding = false; // 从设置页手动启动的任务引导
let isMainOnboardingPaused = false;

// [v7.11.0] 引导启动时重置主滚动位置，避免跨页面滚动继承
function resetOnboardingScrollPosition() {
    const container = document.getElementById('appScrollContainer');
    if (!container) return;
    container.scrollTop = 0;
    container.scrollLeft = 0;
}

function getOnboardingStepsForModule(module) {
    switch (module) {
case 'report': return reportOnboardingSteps;
case 'settings': return settingsOnboardingSteps;
case 'glass-tuning': return glassTuningOnboardingSteps;
case 'task':
default: return onboardingSteps;
    }
}

// [v7.10.1] 启动指定模块的引导
async function startOnboardingModule(module) {
    currentOnboardingModule = module;
    console.log('[Onboarding] 启动引导模块:', module);
    
    if (module === 'task') {
isMainOnboardingPaused = false;
// 任务系统引导需要使用示例数据，已登录用户需先退出
if (isLoggedIn()) {
    showConfirmModal(
        '需要退出登录',
        '为了展示完整的引导示例，需要先退出登录并使用示例数据。您的云端数据不会丢失，引导结束后可重新登录。',
        async () => {
            await handleLogout();
            // 退出后会自动清空数据，然后加载示例数据并启动引导
            setTimeout(async () => {
                isManualTaskOnboarding = true;
                await initDemoData();
                switchTab('home');
                setTimeout(() => startOnboarding(), 150);
            }, 300);
        },
        '退出并开始',
        '取消'
    );
    return;
}

// 未登录状态：直接加载示例数据并启动引导
isManualTaskOnboarding = true;
await initDemoData();
switchTab('home');
setTimeout(() => startOnboarding(), 150);
    } else if (module === 'report') {
// [v7.11.0] 使用独立的报告引导系统
console.log('[Onboarding] 启动独立报告引导');
startReportOnboarding();
    } else {
// 暂停主引导，避免与设置引导冲突
isMainOnboardingPaused = true;
const overlay = document.getElementById('onboardingOverlay');
if (overlay) overlay.classList.remove('show');
onboardingFlow = 'none';
// 设置系统使用简化引导
startSimpleOnboarding(module);
    }
}

// [v7.11.0] 简化引导（报告/设置系统）- 支持交互式步骤
function startSimpleOnboarding(module) {
    const steps = getOnboardingStepsForModule(module);
    if (!steps || steps.length === 0) return;
    
    simpleOnboardingStepIndex = 0;
    simpleOnboardingSteps = steps;
    simpleOnboardingWaitingFor = null;
    cleanupSimpleOnboardingListeners();
    isSimpleOnboardingActive = true;
    onboardingFlow = 'simple';
    enableSimpleOnboardingInteractionLock();
    setupSimpleOnboardingModalPause('dayDetailModal');
    showSimpleOnboardingStep(0);
}

let simpleOnboardingStepIndex = 0;
let simpleOnboardingSteps = [];
let simpleOnboardingWaitingFor = null; // 当前等待的弹窗ID
let simpleOnboardingModalObserver = null;
let simpleOnboardingPauseObserver = null;
let simpleOnboardingActiveTarget = null;
let simpleOnboardingPausedByModal = false;
let simpleOnboardingInteractionLockEnabled = false;
let isSimpleOnboardingActive = false;

// [v7.11.0] 引导交互锁：仅允许高亮区域与气泡交互
function setSimpleOnboardingActiveTarget(target) {
    simpleOnboardingActiveTarget = target || null;
}

function isSimpleOnboardingEventAllowed(eventTarget) {
    if (!eventTarget) return false;
    // 允许气泡内交互
    if (eventTarget.closest('.onboarding-bubble')) return true;
    // 允许高亮目标交互
    const target = simpleOnboardingActiveTarget;
    if (!target) return false;
    if (target._isComposite && Array.isArray(target.elements)) {
return target.elements.some(el => el && el.contains(eventTarget));
    }
    return target.contains(eventTarget);
}

function handleSimpleOnboardingInteraction(e) {
    if (!simpleOnboardingInteractionLockEnabled) return;
    if (isSimpleOnboardingEventAllowed(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
}

function enableSimpleOnboardingInteractionLock() {
    if (simpleOnboardingInteractionLockEnabled) return;
    simpleOnboardingInteractionLockEnabled = true;
    const opts = { passive: false, capture: true };
    window.addEventListener('pointerdown', handleSimpleOnboardingInteraction, opts);
    window.addEventListener('touchstart', handleSimpleOnboardingInteraction, opts);
    window.addEventListener('touchmove', handleSimpleOnboardingInteraction, opts);
    window.addEventListener('wheel', handleSimpleOnboardingInteraction, opts);
    window.addEventListener('click', handleSimpleOnboardingInteraction, opts);
    window.addEventListener('mousedown', handleSimpleOnboardingInteraction, opts);
}

function disableSimpleOnboardingInteractionLock() {
    if (!simpleOnboardingInteractionLockEnabled) return;
    simpleOnboardingInteractionLockEnabled = false;
    const opts = { passive: false, capture: true };
    window.removeEventListener('pointerdown', handleSimpleOnboardingInteraction, opts);
    window.removeEventListener('touchstart', handleSimpleOnboardingInteraction, opts);
    window.removeEventListener('touchmove', handleSimpleOnboardingInteraction, opts);
    window.removeEventListener('wheel', handleSimpleOnboardingInteraction, opts);
    window.removeEventListener('click', handleSimpleOnboardingInteraction, opts);
    window.removeEventListener('mousedown', handleSimpleOnboardingInteraction, opts);
}

// [v7.11.0] 弹窗出现时暂停遮罩，关闭后恢复
function setupSimpleOnboardingModalPause(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (simpleOnboardingPauseObserver) simpleOnboardingPauseObserver.disconnect();
    simpleOnboardingPauseObserver = new MutationObserver(() => {
const isShowing = modal.classList.contains('show');
const overlay = document.getElementById('onboardingOverlay');
if (isShowing && !simpleOnboardingPausedByModal && simpleOnboardingSteps.length > 0) {
    console.log('[Onboarding][Simple] paused by modal', modalId);
    simpleOnboardingPausedByModal = true;
    if (overlay) overlay.classList.remove('show');
    disableSimpleOnboardingInteractionLock();
    stopHeatmapOnboardingPreview();
} else if (!isShowing && simpleOnboardingPausedByModal) {
    console.log('[Onboarding][Simple] resume after modal', modalId);
    simpleOnboardingPausedByModal = false;
    if (overlay) overlay.classList.add('show');
    enableSimpleOnboardingInteractionLock();
    // 重新定位当前步骤
    showSimpleOnboardingStep(simpleOnboardingStepIndex);
}
    });
    simpleOnboardingPauseObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

function showSimpleOnboardingStep(stepIndex) {
    const step = simpleOnboardingSteps[stepIndex];
    if (!step) {
finishSimpleOnboarding();
return;
    }
    
    console.log('[Onboarding][Simple] step', stepIndex, step.id, {
active: isSimpleOnboardingActive,
stepsCount: simpleOnboardingSteps.length,
flow: onboardingFlow,
tab: step.tab || null
    });

    // [v7.11.0] 强制确保在正确的页面
    if (step.tab) {
switchTab(step.tab);
    }

    setTimeout(() => {
// 支持 getTarget 动态获取目标
let target = null;
if (step.getTarget) {
    target = step.getTarget();
} else if (step.selector) {
    target = document.querySelector(step.selector);
}

if (!target) {
    console.log('[Onboarding][Simple] target missing', step.selector || step.id, {
        retry: step._retryCount || 0,
        tab: step.tab || null
    });
    // [v7.11.0] 增加重试机制，最多重试3次
    const retryCount = step._retryCount || 0;
    if (retryCount < 3) {
        step._retryCount = retryCount + 1;
        console.log('[Onboarding] 重试第', step._retryCount, '次');
        setTimeout(() => showSimpleOnboardingStep(stepIndex), 300);
        return;
    }
    // 重试失败，清除重试计数并跳到下一步
    step._retryCount = 0;
    nextSimpleOnboardingStep();
    return;
}

// 找到目标，清除重试计数
step._retryCount = 0;
setSimpleOnboardingActiveTarget(target);
console.log('[Onboarding][Simple] target found', step.id, {
    selector: step.selector || null,
    targetTag: target.tagName,
    targetId: target.id || null,
    targetClass: target.className || null
});

continueWithTarget(target, step);
    }, 150);
}

function continueWithTarget(target, step) {
    // 切换步骤时停止上一步的演示
    stopHeatmapOnboardingPreview();
    // 用户实际操作时停止演示
    if (target) {
const stopHandler = () => stopHeatmapOnboardingPreview();
target.addEventListener('pointerdown', stopHandler, { once: true });
target.addEventListener('touchstart', stopHandler, { once: true, passive: true });
    }
    // [v7.11.0] 使用任务引导同款定位与滚动逻辑
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
overlay.classList.add('show');
    }
    if (step.scrollIntoView) {
maybeScrollIntoView(target, () => {
    positionOnboardingAfterScroll(target, step);
});
    } else {
positionOnboardingAfterScroll(target, step);
    }
}

// [v7.11.0] 设置监听弹窗打开/关闭
function setupWaitForModal(modalId, action) {
    simpleOnboardingWaitingFor = { modalId, action };
    
    const modal = document.getElementById(modalId);
    if (!modal) {
console.log('[Onboarding] 等待的弹窗不存在:', modalId);
return;
    }
    
    // 如果已经满足条件，直接进入下一步
    const isShowing = modal.classList.contains('show');
    if ((action === 'open' && isShowing) || (action === 'close' && !isShowing)) {
setTimeout(() => {
    simpleOnboardingWaitingFor = null;
    nextSimpleOnboardingStep();
}, 300);
return;
    }
    
    // 使用 MutationObserver 监听 class 变化
    if (simpleOnboardingModalObserver) {
simpleOnboardingModalObserver.disconnect();
    }
    
    simpleOnboardingModalObserver = new MutationObserver((mutations) => {
for (const mutation of mutations) {
    if (mutation.attributeName === 'class') {
        const isNowShowing = modal.classList.contains('show');
        if ((action === 'open' && isNowShowing) || (action === 'close' && !isNowShowing)) {
            console.log('[Onboarding] 弹窗状态变化，进入下一步:', modalId, action);
            simpleOnboardingModalObserver.disconnect();
            simpleOnboardingModalObserver = null;
            simpleOnboardingWaitingFor = null;
            setTimeout(() => nextSimpleOnboardingStep(), 300);
            break;
        }
    }
}
    });
    
    simpleOnboardingModalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    console.log('[Onboarding] 开始监听弹窗:', modalId, action);
}

function cleanupSimpleOnboardingListeners() {
    if (simpleOnboardingModalObserver) {
simpleOnboardingModalObserver.disconnect();
simpleOnboardingModalObserver = null;
    }
    if (simpleOnboardingPauseObserver) {
simpleOnboardingPauseObserver.disconnect();
simpleOnboardingPauseObserver = null;
    }
    simpleOnboardingWaitingFor = null;
    setSimpleOnboardingActiveTarget(null);
    disableSimpleOnboardingInteractionLock();
    stopHeatmapOnboardingPreview();
}

function nextSimpleOnboardingStep() {
    console.log('[Onboarding][Simple] next step', {
currentIndex: simpleOnboardingStepIndex,
stepsCount: simpleOnboardingSteps.length,
active: isSimpleOnboardingActive,
flow: onboardingFlow
    });
    simpleOnboardingStepIndex++;
    showSimpleOnboardingStep(simpleOnboardingStepIndex);
}

function finishSimpleOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
overlay.classList.remove('show');
    }
    cleanupSimpleOnboardingListeners();
    simpleOnboardingStepIndex = 0;
    simpleOnboardingSteps = [];
    isSimpleOnboardingActive = false;
    if (onboardingFlow === 'simple') {
onboardingFlow = 'none';
    }
    console.log('[Onboarding][Simple] completed');
}

function getVisibleElement(selector) {
    const el = document.querySelector(selector);
    if (!el) {
console.log('[Onboarding] getVisibleElement:', selector, '→ 元素不存在');
return null;
    }
    if (el.classList.contains('hidden')) {
console.log('[Onboarding] getVisibleElement:', selector, '→ 有 hidden 类');
return null;
    }
    if (el.offsetParent === null && el.getClientRects().length === 0) {
console.log('[Onboarding] getVisibleElement:', selector, '→ 不可见(offsetParent=null)');
return null;
    }
    return el;
}

// [v7.10.1] 修复：只返回指定类型的任务卡片，不回退到任意卡片
function findOnboardingTaskCardInContainer(taskTypes, containerSelector) {
    if (!Array.isArray(taskTypes) || taskTypes.length === 0) {
console.log('[Onboarding] findOnboardingTaskCardInContainer: 无效的 taskTypes');
return null;
    }
    const candidates = tasks.filter(t => taskTypes.includes(t.type));
    console.log('[Onboarding] findOnboardingTaskCardInContainer: 找到', candidates.length, '个候选任务');
    const sorted = [...candidates].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    const pick = sorted[0];
    if (!pick) {
console.log('[Onboarding] findOnboardingTaskCardInContainer: 没有匹配类型的任务');
return null;
    }
    console.log('[Onboarding] findOnboardingTaskCardInContainer: 选择任务', pick.name, pick.id);
    const container = document.querySelector(containerSelector);
    if (container) {
const recentCard = container.querySelector(`.task-card[data-task-id="${pick.id}"]`);
if (recentCard) {
    console.log('[Onboarding] 在容器中找到卡片');
    return recentCard;
}
console.log('[Onboarding] 容器中未找到，尝试全局');
    }
    // 如果不在最近任务中，尝试全局查找
    const globalCard = document.querySelector(`.task-card[data-task-id="${pick.id}"]`);
    if (globalCard) {
console.log('[Onboarding] 全局找到卡片');
return globalCard;
    }
    console.log('[Onboarding] 全局也未找到卡片');
    return null;
}

// [v7.10.1] 修复：优先习惯任务，回退到同类型非习惯任务，但不回退到不同类型
function findOnboardingHabitTaskCard(taskTypes, containerSelector) {
    if (!Array.isArray(taskTypes) || taskTypes.length === 0) {
console.log('[Onboarding] findOnboardingHabitTaskCard: 无效的 taskTypes');
return null;
    }
    console.log('[Onboarding] findOnboardingHabitTaskCard: 查找类型', taskTypes, '容器', containerSelector);
    console.log('[Onboarding] 当前任务数量:', tasks.length);
    
    // 优先查找习惯任务
    const habitCandidates = tasks.filter(t => taskTypes.includes(t.type) && t.isHabit);
    console.log('[Onboarding] 习惯任务候选:', habitCandidates.map(t => ({ id: t.id, name: t.name, type: t.type, lastUsed: t.lastUsed })));
    
    const sortedHabit = [...habitCandidates].sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
    const habitPick = sortedHabit[0];
    if (habitPick) {
console.log('[Onboarding] 选择习惯任务:', habitPick.name, habitPick.id);
const container = document.querySelector(containerSelector);
if (container) {
    const card = container.querySelector(`.task-card[data-task-id="${habitPick.id}"]`);
    if (card) {
        console.log('[Onboarding] 在容器中找到卡片');
        return card;
    }
    console.log('[Onboarding] 容器中未找到卡片，尝试全局查找');
}
const globalCard = document.querySelector(`.task-card[data-task-id="${habitPick.id}"]`);
if (globalCard) {
    console.log('[Onboarding] 全局找到卡片');
    return globalCard;
}
console.log('[Onboarding] 全局也未找到卡片');
    }
    // 回退到同类型的非习惯任务
    console.log('[Onboarding] 回退到非习惯任务查找');
    return findOnboardingTaskCardInContainer(taskTypes, containerSelector);
}

// [v7.10.1] 按任务名称查找任务卡片（用于引导指定任务）
function findOnboardingTaskByName(nameKeyword) {
    console.log('[Onboarding] findOnboardingTaskByName:', nameKeyword);
    const task = tasks.find(t => t.name && t.name.includes(nameKeyword));
    if (!task) {
console.log('[Onboarding] 未找到包含关键词的任务:', nameKeyword);
return null;
    }
    console.log('[Onboarding] 找到任务:', task.name, task.id);
    // 优先在最近任务中查找
    const recentCard = document.querySelector(`#recentEarnTasks .task-card[data-task-id="${task.id}"]`);
    if (recentCard) {
console.log('[Onboarding] 在最近任务中找到卡片');
return recentCard;
    }
    // 全局查找
    const globalCard = document.querySelector(`.task-card[data-task-id="${task.id}"]`);
    if (globalCard) {
console.log('[Onboarding] 全局找到卡片');
return globalCard;
    }
    console.log('[Onboarding] 未找到任务卡片');
    return null;
}

// [v7.10.1] 获取引导用的获得任务卡片（优先练吉他）
function getOnboardingEditTaskCard() {
    // 优先查找「练吉他」
    const guitarCard = findOnboardingTaskByName('练吉他');
    if (guitarCard) return guitarCard;
    // 回退到原逻辑
    return findOnboardingHabitTaskCard(['continuous', 'continuous_target'], '#recentEarnTasks');
}

function getOnboardingSpendTaskCard() {
    return findOnboardingHabitTaskCard(['continuous_redeem', 'instant_redeem'], '#recentSpendTasks');
}

function getOnboardingEditTaskId() {
    if (onboardingEditTaskId && tasks.some(t => t.id === onboardingEditTaskId)) return onboardingEditTaskId;
    const card = getOnboardingEditTaskCard();
    onboardingEditTaskId = card?.dataset?.taskId || null;
    return onboardingEditTaskId;
}

function getOnboardingSpendTaskId() {
    if (onboardingEditSpendTaskId && tasks.some(t => t.id === onboardingEditSpendTaskId)) return onboardingEditSpendTaskId;
    const card = getOnboardingSpendTaskCard();
    onboardingEditSpendTaskId = card?.dataset?.taskId || null;
    return onboardingEditSpendTaskId;
}

// [v7.10.1] 引导期间菜单状态控制
let onboardingMenuLocked = false;

function openOnboardingTaskMenu(taskId) {
    if (!taskId) return;
    const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
    const moreBtn = card?.querySelector('.more-btn');
    if (!card || !moreBtn) return;
    // 锁定菜单防止被意外关闭
    onboardingMenuLocked = true;
    toggleTaskMenu({ target: moreBtn, stopPropagation: () => {} });
}

// [v7.10.1] 引导时打开菜单并确保编辑可正常进入
function openOnboardingMenuEdit(taskId) {
    if (!taskId) return;
    openOnboardingTaskMenu(taskId);
    requestAnimationFrame(() => {
const item = getOnboardingEditMenuItem();
if (!item) return;
if (!item.dataset.onboardingEditBound) {
    item.dataset.onboardingEditBound = 'true';
    item.addEventListener('click', () => {
        openOnboardingEditTask(taskId);
    }, { once: true });
}
    });
}

// [v7.10.1] 关闭编辑弹窗（用于切换到下一个任务引导）
function closeOnboardingEditModal() {
    const modal = document.getElementById('taskModal');
    if (modal && modal.classList.contains('show')) {
hideTaskModal();
    }
}

function getOnboardingEditMenuItem() {
    const menu = document.getElementById('globalTaskMenu');
    if (!menu || !menu.classList.contains('show')) return null;
    const items = Array.from(menu.querySelectorAll('.global-task-menu-item'));
    return items.find(item => item.textContent && item.textContent.includes('编辑')) || items[0] || null;
}

// [v7.10.1] 避免重复打开编辑弹窗
function openOnboardingEditTask(taskId) {
    if (!taskId) return;
    const modal = document.getElementById('taskModal');
    // 如果弹窗已打开且是同一个任务，不重复打开
    if (modal && modal.classList.contains('show') && currentEditingTask?.id === taskId) {
return;
    }
    // 解锁菜单（从菜单步骤进入编辑）
    onboardingMenuLocked = false;
    closeGlobalTaskMenu();
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    editTask(task);
    // [v7.10.1] 引导时重置编辑弹窗滚动位置，避免停留在底部
    requestAnimationFrame(() => {
resetOnboardingEditModalScroll();
setTimeout(resetOnboardingEditModalScroll, 60);
    });
}

// [v7.10.1] 重置任务编辑弹窗滚动位置
function resetOnboardingEditModalScroll() {
    const modal = document.getElementById('taskModal');
    const content = modal?.querySelector('.modal-content');
    if (content) {
content.scrollTop = 0;
content.scrollLeft = 0;
    }
}

// [v7.10.1] 确保习惯开关打开并触发 UI 更新
function ensureOnboardingHabitEnabled() {
    console.log('[Onboarding] ensureOnboardingHabitEnabled 开始');
    const toggle = document.getElementById('isHabitToggle');
    if (!toggle) {
console.log('[Onboarding] 未找到 isHabitToggle');
return;
    }
    if (!toggle.checked) {
console.log('[Onboarding] 打开习惯开关');
toggle.checked = true;
toggleHabitSettings(true);
    }
    // 确保消费类型的戒除设置区域正确显示
    const taskType = document.getElementById('taskType')?.value;
    console.log('[Onboarding] 当前任务类型:', taskType);
    if (['continuous_redeem', 'instant_redeem'].includes(taskType)) {
// 触发类型 UI 更新以显示 planDurationGroup
console.log('[Onboarding] 调用 updateTaskTypeUI 显示戒除设置');
try {
    updateTaskTypeUI(taskType);
} catch (e) {
    console.error('[Onboarding] updateTaskTypeUI 异常:', e);
}
// 检查 planDurationGroup 状态
const pg = document.getElementById('planDurationGroup');
console.log('[Onboarding] planDurationGroup hidden?', pg?.classList.contains('hidden'));
    }
}

function buildTaskTypeOnboardingSteps(type) {
    const steps = [];
    const commonEnsureModal = () => {
const modal = document.getElementById('taskModal');
if (!modal || !modal.classList.contains('show')) {
    showTaskModal();
}
    };
    if (type === 'reward') {
steps.push({
    id: 'reward-fixed',
    title: '按次任务：设置奖励时间',
    text: '完成一次即可获得固定时间，适合短任务。',
    getTarget: () => getVisibleElement('#fixedTimeGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'reward-habit-toggle',
    title: '习惯系统：开启打卡与连胜',
    text: '打开“设置为习惯”，可设置周期目标与连胜奖励。',
    getTarget: () => getVisibleElement('#habitToggleContainer'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'reward-habit-settings',
    title: '习惯奖励更丰富',
    text: '在习惯设置里添加多层奖励规则，激励持续完成。',
    getTarget: () => getVisibleElement('#habitSettingsGroup'),
    ensure: commonEnsureModal
});
    } else if (type === 'continuous') {
steps.push({
    id: 'continuous-multiplier',
    title: '计时任务：倍率决定收益',
    text: '按实际时长 × 倍率获得时间，适合专注或运动。',
    getTarget: () => getVisibleElement('#multiplierGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'continuous-floating',
    title: '悬浮窗计时器',
    text: '任务运行时显示计时/倒计时，方便随时查看。',
    getTarget: () => getVisibleElement('#floatingTimerToggleContainer'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'continuous-habit-toggle',
    title: '计时也可设为习惯',
    text: '开启习惯后，可设置周期目标并获得连胜奖励。',
    getTarget: () => getVisibleElement('#habitToggleContainer'),
    ensure: commonEnsureModal
});
    } else if (type === 'continuous_target') {
steps.push({
    id: 'target-time',
    title: '达标任务：设定目标时长',
    text: '达到目标时长后触发额外奖励。',
    getTarget: () => getVisibleElement('#targetTimeGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'bonus-reward',
    title: '达标奖励更有动力',
    text: '可设置额外奖励，达标时一次性发放。',
    getTarget: () => getVisibleElement('#bonusRewardGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'target-floating',
    title: '悬浮窗倒计时',
    text: '达标任务支持倒计时模式，清晰掌控剩余时长。',
    getTarget: () => getVisibleElement('#floatingTimerToggleContainer'),
    ensure: commonEnsureModal
});
    } else if (type === 'instant_redeem') {
steps.push({
    id: 'redeem-fixed',
    title: '按次消费：设置消耗时间',
    text: '一次消费固定时间，适合短时娱乐。',
    getTarget: () => getVisibleElement('#consumeTimeGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'abstinence-toggle',
    title: '习惯戒除系统',
    text: '消费任务开启“习惯”后即进入戒除挑战，控制消费获取连胜奖励。',
    getTarget: () => getVisibleElement('#habitToggleContainer'),
    ensure: commonEnsureModal
});
    } else if (type === 'continuous_redeem') {
steps.push({
    id: 'redeem-multiplier',
    title: '计时消费：倍率决定扣减',
    text: '按实际时长 × 倍率消费时间，适合长时间娱乐。',
    getTarget: () => getVisibleElement('#multiplierGroup'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'redeem-floating',
    title: '悬浮窗计时器',
    text: '计时消费也支持悬浮窗，实时掌握消耗时长。',
    getTarget: () => getVisibleElement('#floatingTimerToggleContainer'),
    ensure: commonEnsureModal
});
steps.push({
    id: 'abstinence-toggle',
    title: '习惯戒除系统',
    text: '开启习惯后进入戒除挑战，周期内控制额度即视为达标。',
    getTarget: () => getVisibleElement('#habitToggleContainer'),
    ensure: commonEnsureModal
});
    }
    return steps;
}

function startOnboardingIfNeeded() {
    if (localStorage.getItem('tb_onboarding_done') === 'true') {
localStorage.removeItem('tb_onboarding_pending');
return;
    }
    if (localStorage.getItem('tb_onboarding_pending') !== 'true') return;
    startOnboarding();
}

function startOnboarding() {
    if (isMainOnboardingPaused) {
console.log('[Onboarding] startOnboarding blocked: main paused');
return;
    }
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    onboardingFlow = 'main';
    console.log('[Onboarding] startOnboarding: flow=main');
    isTaskOnboardingActive = false;
    onboardingStepIndex = 0;
    showOnboardingStep(onboardingStepIndex);
}

function showOnboardingStep(stepIndex) {
    if (isMainOnboardingPaused || currentOnboardingModule === 'report' || currentOnboardingModule === 'settings') {
console.log('[Onboarding] main step blocked', {
    stepIndex,
    module: currentOnboardingModule,
    paused: isMainOnboardingPaused
});
return;
    }
    const step = onboardingSteps[stepIndex];
    if (!step) {
finishOnboarding();
return;
    }

    console.log('[Onboarding] main step', stepIndex, step?.id || null, {
module: currentOnboardingModule,
flow: onboardingFlow
    });

    if (step.tab) {
switchTab(step.tab);
    }

    setTimeout(() => {
const target = getOnboardingTarget(step);
if (!target) {
    nextOnboardingStep();
    return;
}

positionOnboardingAfterScroll(target, step);
    }, 60);
}

function getOnboardingTarget(step) {
    if (typeof step.getTarget === 'function') {
return step.getTarget();
    }
    if (step.selector) {
return document.querySelector(step.selector);
    }
    return null;
}

function findOnboardingTaskCard(taskTypes) {
    return findOnboardingTaskCardInContainer(taskTypes, '#recentEarnTasks');
}

function positionOnboardingAfterScroll(target, step, attempts = 0) {
    const refreshedTarget = step ? getOnboardingTarget(step) : target;
    if (!refreshedTarget) return;
    if (attempts === 0) {
console.log('[Onboarding][Position] afterScroll start', {
    stepId: step?.id || null,
    attempts,
    flow: onboardingFlow,
    simpleActive: isSimpleOnboardingActive
});
    }
    
    // [v7.10.1] 使用双重 rAF 确保布局稳定
    requestAnimationFrame(() => {
requestAnimationFrame(() => {
    const rect = refreshedTarget.getBoundingClientRect();
    if ((rect.width === 0 || rect.height === 0) && attempts < 6) {
        setTimeout(() => positionOnboardingAfterScroll(refreshedTarget, step, attempts + 1), 80);
        return;
    }
    console.log('[Onboarding][Position] rect', {
        stepId: step?.id || null,
        attempts,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    });
    positionOnboardingForTarget(refreshedTarget, step);
});
    });
}

// [v7.10.1] 智能滚动：支持主页面滚动容器和弹窗内滚动容器
function maybeScrollIntoView(target, callback) {
    if (!target) {
if (callback) callback();
return;
    }
    
    // 查找目标元素所在的滚动容器
    const scrollContainer = findScrollContainer(target);
    const rect = target.getBoundingClientRect();
    
    // 确定视口范围（如果在弹窗内，使用弹窗范围）
    let viewportTop = 0;
    let viewportHeight = window.innerHeight;
    
    if (scrollContainer && scrollContainer !== document.getElementById('appScrollContainer')) {
const containerRect = scrollContainer.getBoundingClientRect();
viewportTop = containerRect.top;
viewportHeight = containerRect.height;
    }
    
    const center = rect.top + rect.height / 2;
    const viewportCenter = viewportTop + viewportHeight / 2;
    const threshold = Math.min(140, viewportHeight * 0.2);
    const isOutOfCenterRange = Math.abs(center - viewportCenter) > threshold;
    
    // 检查是否在可视区域内
    const isAboveView = rect.bottom < viewportTop + 60;
    const isBelowView = rect.top > viewportTop + viewportHeight - 60;
    const needsScroll = isOutOfCenterRange || isAboveView || isBelowView;
    
    if (needsScroll && scrollContainer) {
// 计算需要滚动的距离
const scrollOffset = center - viewportCenter;
const targetScrollTop = scrollContainer.scrollTop + scrollOffset;

// 监听滚动结束
let scrollEndTimer = null;
const onScrollEnd = () => {
    if (scrollEndTimer) clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
        scrollContainer.removeEventListener('scroll', onScrollEnd);
        if (callback) callback();
    }, 80);
};

scrollContainer.addEventListener('scroll', onScrollEnd);

// 执行滚动
scrollContainer.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: 'smooth'
});

// 安全超时：如果滚动没有触发（已经在位置），也要调用回调
setTimeout(() => {
    scrollContainer.removeEventListener('scroll', onScrollEnd);
    if (callback) callback();
}, 400);
    } else {
if (callback) callback();
    }
}

// [v7.10.1] 查找元素所在的滚动容器
function findScrollContainer(element) {
    if (!element) return null;
    
    // [v7.10.1] 支持复合元素
    const realElement = element._isComposite ? element.elements[0] : element;
    if (!realElement) return null;
    
    // 先检查是否在弹窗内
    const modal = realElement.closest('.modal.show');
    if (modal) {
const modalContent = modal.querySelector('.modal-content');
if (modalContent && modalContent.scrollHeight > modalContent.clientHeight) {
    return modalContent;
}
    }
    
    // 否则返回主滚动容器
    return document.getElementById('appScrollContainer');
}

function positionOnboardingForTarget(target, step) {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    const highlight = overlay.querySelector('.onboarding-highlight');
    const bubble = overlay.querySelector('.onboarding-bubble');
    const titleEl = overlay.querySelector('.onboarding-title');
    const textEl = overlay.querySelector('.onboarding-text');
    const arrow = overlay.querySelector('.onboarding-arrow');

    // 更新文本内容
    titleEl.textContent = step.title;
    if (step.useHtml) {
textEl.innerHTML = step.text;
    } else {
textEl.textContent = step.text;
    }

    const rect = target.getBoundingClientRect();
    
    // [v7.10.1] 检查目标是否在可视区域内（考虑滚动容器）
    const scrollContainer = findScrollContainer(target);
    let visibleRect = { ...rect };
    
    if (scrollContainer) {
const containerRect = scrollContainer.getBoundingClientRect();
visibleRect = {
    left: Math.max(rect.left, containerRect.left),
    top: Math.max(rect.top, containerRect.top),
    right: Math.min(rect.right, containerRect.right),
    bottom: Math.min(rect.bottom, containerRect.bottom),
    width: rect.width,
    height: rect.height
};
visibleRect.width = visibleRect.right - visibleRect.left;
visibleRect.height = visibleRect.bottom - visibleRect.top;

if (visibleRect.width <= 0 || visibleRect.height <= 0) {
    visibleRect = rect;
}
    }
    
    const viewportOffsetX = window.visualViewport ? window.visualViewport.offsetLeft : 0;
    const viewportOffsetY = window.visualViewport ? window.visualViewport.offsetTop : 0;
    const rectLeft = rect.left + viewportOffsetX;
    const rectTop = rect.top + viewportOffsetY;
    const rectRight = rect.right + viewportOffsetX;
    const rectBottom = rect.bottom + viewportOffsetY;
    const padding = 8;
    const highlightRect = {
left: Math.max(8, rectLeft - padding),
top: Math.max(8, rectTop - padding),
width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
height: Math.min(window.innerHeight - 16, rect.height + padding * 2)
    };

    // [v7.10.1] 顺序动画优化：减少空白等待时间，使用 rAF 确保位置设置后再显示
    const isFirstShow = !highlight.classList.contains('visible');
    bubble.classList.remove('visible');
    arrow.classList.remove('visible');
    
    // [v7.10.1] 先移除 visible 让高亮框进入初始 scale 状态（仅首次）
    if (isFirstShow) {
highlight.classList.remove('visible');
    }
    
    // 设置高亮框位置
    highlight.style.left = `${highlightRect.left}px`;
    highlight.style.top = `${highlightRect.top}px`;
    highlight.style.width = `${highlightRect.width}px`;
    highlight.style.height = `${highlightRect.height}px`;
    
    // [v7.10.1] 使用 rAF 确保位置设置完成后再添加 visible，避免闪现
    requestAnimationFrame(() => {
highlight.classList.add('visible');
    });

    // 计算气泡位置（先隐藏计算）
    bubble.style.left = '0px';
    bubble.style.top = '0px';
    const bubbleRect = bubble.getBoundingClientRect();
    
    const placeBelow = rectBottom + bubbleRect.height + 18 < window.innerHeight;
    const bubbleLeft = Math.min(
Math.max(rectLeft + rect.width / 2 - bubbleRect.width / 2, 12),
window.innerWidth - bubbleRect.width - 12
    );

    let bubbleTop = rectBottom + 16;
    let arrowTop = rectBottom + 6;
    let arrowClass = 'onboarding-arrow up';

    if (!placeBelow) {
bubbleTop = rectTop - bubbleRect.height - 16;
arrowTop = bubbleTop + bubbleRect.height;
arrowClass = 'onboarding-arrow down';
    }

    // 设置气泡和箭头的最终位置
    bubble.style.left = `${bubbleLeft}px`;
    bubble.style.top = `${bubbleTop}px`;
    
    const arrowLeft = Math.min(
Math.max(rectLeft + rect.width / 2 - 8, 12),
window.innerWidth - 24
    );
    arrow.className = arrowClass;
    arrow.style.left = `${arrowLeft}px`;
    arrow.style.top = `${arrowTop}px`;

    // [v7.10.1] 优化时序：缩短等待时间，高亮框动画 280ms，气泡提前 60ms 开始淡入形成衔接
    const bubbleDelay = isFirstShow ? 220 : 180;
    setTimeout(() => {
bubble.classList.add('visible');
arrow.classList.add('visible');
// [v7.11.0] 触发 onEnter 回调（如自动演示动画）
if (step.onEnter) {
    setTimeout(() => step.onEnter(), 200);
}
// [v7.11.0] 设置等待弹窗打开/关闭
if (step.waitForAction) {
    setupWaitForModal(step.waitForAction, 'open');
} else if (step.waitForClose) {
    setupWaitForModal(step.waitForClose, 'close');
}
    }, bubbleDelay);
}

function nextOnboardingStep() {
    console.log('[Onboarding] nextOnboardingStep route', {
simpleActive: isSimpleOnboardingActive,
simpleSteps: simpleOnboardingSteps.length,
flow: onboardingFlow,
module: currentOnboardingModule,
stepIndex: onboardingStepIndex,
reportActive: reportOnboardingActive
    });
    
    // [v7.11.0] 优先处理独立报告引导
    if (onboardingFlow === 'report' && reportOnboardingActive) {
console.log('[Onboarding] route to nextReportOnboardingStep');
nextReportOnboardingStep();
return;
    }
    
    if (isMainOnboardingPaused) {
console.log('[Onboarding] main next blocked: paused');
return;
    }
    if (currentOnboardingModule === 'report' || currentOnboardingModule === 'settings') {
if (simpleOnboardingSteps.length > 0) {
    nextSimpleOnboardingStep();
} else {
    console.log('[Onboarding] simple steps empty, ignore main routing', {
        module: currentOnboardingModule,
        flow: onboardingFlow
    });
}
return;
    }
    if (onboardingFlow === 'simple') {
if (simpleOnboardingSteps.length > 0) {
    nextSimpleOnboardingStep();
}
return;
    }
    // [v7.10.1] 支持简化引导模式
    if (isSimpleOnboardingActive || simpleOnboardingSteps.length > 0) {
nextSimpleOnboardingStep();
return;
    }
    if (onboardingFlow === 'task-detail') {
nextTaskDetailOnboardingStep();
return;
    }
    if (onboardingFlow === 'task') {
nextTaskOnboardingStep();
return;
    }
    onboardingStepIndex += 1;
    showOnboardingStep(onboardingStepIndex);
}

function skipOnboarding() {
    // [v7.11.0] 独立报告引导的跳过处理
    if (onboardingFlow === 'report' && reportOnboardingActive) {
console.log('[Onboarding] skip report onboarding');
finishReportOnboarding();
return;
    }
    
    // [v7.10.1] 支持简化引导模式
    if (simpleOnboardingSteps.length > 0) {
finishSimpleOnboarding();
return;
    }
    if (onboardingFlow === 'task-detail') {
finishTaskOnboarding();
return;
    }
    if (onboardingFlow === 'task') {
finishTaskOnboarding();
return;
    }
    // 跳过时完全结束，不继续到任务引导
    finishOnboarding(true);
}

function finishOnboarding(skipped = false) {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.classList.remove('show');
    localStorage.setItem('tb_onboarding_done', 'true');
    localStorage.removeItem('tb_onboarding_pending');
    
    // 跳过时不继续到任务引导，但显示提示
    if (skipped) {
showOnboardingFinishTip();
isManualTaskOnboarding = false;
return;
    }
    
    // 从设置页手动启动时，无论之前状态如何都继续到任务引导
    if (isManualTaskOnboarding || localStorage.getItem('tb_task_onboarding_done') !== 'true') {
localStorage.setItem('tb_task_onboarding_pending', 'true');
setTimeout(() => {
    if (localStorage.getItem('tb_task_onboarding_pending') === 'true') {
        startTaskOnboarding();
    }
}, 260);
    }
}

function startTaskOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    onboardingFlow = 'task';
    isTaskOnboardingActive = true;
    taskOnboardingDetailSteps = [];
    taskOnboardingDetailIndex = 0;
    taskOnboardingDetailType = null;
    onboardingEditTaskId = null;
    onboardingEditSpendTaskId = null;
    taskOnboardingStepIndex = 0;
    showTaskOnboardingStep(taskOnboardingStepIndex);
}

function showTaskOnboardingStep(stepIndex) {
    const step = taskOnboardingSteps[stepIndex];
    console.log('[Onboarding] showTaskOnboardingStep:', stepIndex, step?.id);
    if (!step) {
console.log('[Onboarding] 没有更多步骤，结束引导');
finishTaskOnboarding();
return;
    }

    // [v7.10.1] 切换步骤时先隐藏气泡和箭头（淡出效果）
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) {
const bubble = overlay.querySelector('.onboarding-bubble');
const arrow = overlay.querySelector('.onboarding-arrow');
if (bubble) bubble.classList.remove('visible');
if (arrow) arrow.classList.remove('visible');
    }

    if (step.tab) {
console.log('[Onboarding] 切换到 tab:', step.tab);
switchTab(step.tab);
    }

    if (typeof step.ensure === 'function') {
console.log('[Onboarding] 执行 ensure 函数');
try {
    step.ensure();
} catch (e) {
    console.error('[Onboarding] ensure 函数异常:', e);
}
    }

    // [v7.10.1] 增加延迟以等待 ensure 函数（如打开弹窗/菜单）完成渲染
    const waitTime = typeof step.waitTime === 'number' ? step.waitTime : (step.ensure ? 150 : 60);
    console.log('[Onboarding] 等待', waitTime, 'ms 后获取目标');
    
    setTimeout(() => {
console.log('[Onboarding] setTimeout 回调执行, step:', step.id);
const target = getOnboardingTarget(step);
console.log('[Onboarding] 第一次尝试获取目标:', target ? '成功' : '失败', '元素:', step.getTarget?.toString().slice(0, 80));
if (!target) {
    // [v7.10.1] 如果目标不存在，再尝试一次
    setTimeout(() => {
        const retryTarget = getOnboardingTarget(step);
        console.log('[Onboarding] 重试获取目标:', retryTarget ? '成功' : '失败');
        if (!retryTarget) {
            console.log('[Onboarding] 跳过步骤', step.id);
            nextTaskOnboardingStep();
        } else {
            proceedWithTarget(retryTarget);
        }
    }, 100);
    return;
}
proceedWithTarget(target);
    }, waitTime);
    
    function proceedWithTarget(target) {
if (step.scrollIntoView) {
    // [v7.10.1] 使用回调确保滚动完成后再定位
    maybeScrollIntoView(target, () => {
        positionOnboardingAfterScroll(target, step);
    });
} else {
    positionOnboardingAfterScroll(target, step);
}
    }
}

function nextTaskOnboardingStep() {
    taskOnboardingStepIndex += 1;
    showTaskOnboardingStep(taskOnboardingStepIndex);
}

function startTaskTypeDetailOnboarding(type) {
    const steps = buildTaskTypeOnboardingSteps(type);
    if (!steps || steps.length === 0) {
finishTaskOnboarding();
return;
    }
    taskOnboardingDetailSteps = steps;
    taskOnboardingDetailIndex = 0;
    taskOnboardingDetailType = type;
    onboardingFlow = 'task-detail';
    showTaskDetailOnboardingStep(taskOnboardingDetailIndex);
}

function showTaskDetailOnboardingStep(stepIndex) {
    const step = taskOnboardingDetailSteps[stepIndex];
    if (!step) {
finishTaskOnboarding();
return;
    }

    if (step.tab) {
switchTab(step.tab);
    }

    if (typeof step.ensure === 'function') {
step.ensure();
    }

    setTimeout(() => {
const target = getOnboardingTarget(step);
if (!target) {
    nextTaskDetailOnboardingStep();
    return;
}

positionOnboardingAfterScroll(target, step);
    }, 60);
}

function nextTaskDetailOnboardingStep() {
    taskOnboardingDetailIndex += 1;
    showTaskDetailOnboardingStep(taskOnboardingDetailIndex);
}

// [v7.10.1] 引导结束时清理所有打开的弹窗和菜单
function finishTaskOnboarding() {
    const overlay = document.getElementById('onboardingOverlay');
    if (overlay) overlay.classList.remove('show');
    localStorage.setItem('tb_task_onboarding_done', 'true');
    localStorage.removeItem('tb_task_onboarding_pending');
    onboardingFlow = 'main';
    isTaskOnboardingActive = false;
    taskOnboardingDetailSteps = [];
    taskOnboardingDetailIndex = 0;
    taskOnboardingDetailType = null;
    
    // 清理状态
    onboardingMenuLocked = false;
    onboardingEditTaskId = null;
    onboardingEditSpendTaskId = null;
    
    // 关闭可能打开的菜单
    if (typeof closeGlobalTaskMenu === 'function') {
closeGlobalTaskMenu();
    }
    
    // 关闭可能打开的编辑弹窗
    const taskModal = document.getElementById('taskModal');
    if (taskModal && taskModal.classList.contains('show')) {
hideTaskModal();
    }
    
    // [v7.10.1] 显示引导结束提示
    showOnboardingFinishTip();
    
    isManualTaskOnboarding = false; // 重置手动启动标记
}

// [v7.10.1] 显示引导结束提示
function showOnboardingFinishTip() {
    setTimeout(() => {
showAlert('如需再次查看引导，可前往「设置 → 帮助与引导」重新开始。', '引导已结束');
    }, 300);
}

function getActiveOnboardingStep() {
    // [v7.11.0] 优先处理独立报告引导
    if (onboardingFlow === 'report' && reportOnboardingActive) {
return REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex];
    }
    if (onboardingFlow === 'task-detail') {
return taskOnboardingDetailSteps[taskOnboardingDetailIndex];
    }
    if (onboardingFlow === 'task') {
return taskOnboardingSteps[taskOnboardingStepIndex];
    }
    return onboardingSteps[onboardingStepIndex];
}
// [v7.10.0] 导览窗口尺寸变更时重新定位
window.addEventListener('resize', () => {
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay || !overlay.classList.contains('show')) return;
    
    // [v7.11.0] 报告引导使用独立定位函数
    if (onboardingFlow === 'report' && reportOnboardingActive) {
const step = REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex];
let target = null;
if (step?.getTarget) target = step.getTarget();
else if (step?.selector) target = document.querySelector(step.selector);
if (target && step) {
    positionReportOnboardingHighlight(target, step);
}
return;
    }
    
    const step = getActiveOnboardingStep();
    const target = step ? getOnboardingTarget(step) : null;
    if (target && step) {
positionOnboardingForTarget(target, step);
    }
});
let onboardingScrollTimer = null;
const onboardingScrollContainer = document.getElementById('appScrollContainer');
if (onboardingScrollContainer) {
    onboardingScrollContainer.addEventListener('scroll', () => {
const overlay = document.getElementById('onboardingOverlay');
if (!overlay || !overlay.classList.contains('show')) return;
if (onboardingScrollTimer) clearTimeout(onboardingScrollTimer);
onboardingScrollTimer = setTimeout(() => {
    // [v7.11.0] 报告引导使用独立定位函数
    if (onboardingFlow === 'report' && reportOnboardingActive) {
        const step = REPORT_ONBOARDING_STEPS[reportOnboardingStepIndex];
        let target = null;
        if (step?.getTarget) target = step.getTarget();
        else if (step?.selector) target = document.querySelector(step.selector);
        if (target && step) {
            positionReportOnboardingHighlight(target, step);
        }
        return;
    }
    
    const step = getActiveOnboardingStep();
    const target = step ? getOnboardingTarget(step) : null;
    if (target && step) {
        positionOnboardingForTarget(target, step);
    }
}, 60);
    });
}

// [v7.10.1] 监听弹窗内滚动，重新定位引导高亮
let onboardingModalScrollTimer = null;
document.addEventListener('scroll', (e) => {
    // 检查是否在 modal-content 内滚动
    if (!e.target.classList || !e.target.classList.contains('modal-content')) return;
    const overlay = document.getElementById('onboardingOverlay');
    if (!overlay || !overlay.classList.contains('show')) return;
    if (onboardingModalScrollTimer) clearTimeout(onboardingModalScrollTimer);
    onboardingModalScrollTimer = setTimeout(() => {
const step = getActiveOnboardingStep();
const target = step ? getOnboardingTarget(step) : null;
if (target && step) {
    positionOnboardingForTarget(target, step);
}
    }, 60);
}, true); // 使用捕获阶段监听

// [v5.2.1] 自定义 alert 替代函数，避免显示"网址为..."的丑陋标题
function showAlert(message, title = '提示') {
    // 将换行符转换为 <br> 以便正确显示多行消息
    const htmlContent = message.replace(/\n/g, '<br>');
    showInfoModal(title, `<div style="white-space: pre-wrap;">${htmlContent}</div>`);
}
// [v5.2.1] 自定义 confirm 替代函数
let confirmResolve = null;
function showConfirm(message, title = '确认') {
    return new Promise((resolve) => {
confirmResolve = resolve;
document.getElementById('confirmModalTitle').textContent = title;
document.getElementById('confirmModalContent').textContent = message;
document.getElementById('confirmModal').classList.add('show');
    });
}

// [v7.4.0] 自定义确认弹窗 - 支持自定义按钮文本和回调
let confirmModalCallback = null;
function showConfirmModal(title, message, onConfirm, confirmText = '确定', cancelText = '取消') {
    confirmModalCallback = onConfirm;
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalContent').innerHTML = message;
    
    // 替换按钮文本
    const buttons = modal.querySelectorAll('.modal-content > div:last-child button');
    if (buttons.length >= 2) {
buttons[0].textContent = cancelText;
buttons[1].textContent = confirmText;
    }
    
    modal.classList.add('show');
}

let taskDeleteModeResolve = null;
function showTaskDeleteModeModal(taskName) {
    return new Promise((resolve) => {
taskDeleteModeResolve = resolve;
const contentEl = document.getElementById('taskDeleteModeContent');
if (contentEl) {
    contentEl.textContent = `已选择删除任务"${taskName}"。\n请选择删除方式：`;
}
document.getElementById('taskDeleteModeModal').classList.add('show');
    });
}

function resolveTaskDeleteMode(mode) {
    const modal = document.getElementById('taskDeleteModeModal');
    if (modal) {
modal.classList.remove('show');
    }
    if (taskDeleteModeResolve) {
taskDeleteModeResolve(mode);
taskDeleteModeResolve = null;
    }
}

function showTaskDeleteProgressModal(taskName, transactionCount = 0) {
    const modal = document.getElementById('taskDeleteProgressModal');
    const contentEl = document.getElementById('taskDeleteProgressContent');
    if (contentEl) {
const countText = transactionCount > 0 ? `共 ${transactionCount} 条历史记录。` : '';
contentEl.textContent = `正在删除任务"${taskName}"及相关交易记录。\n${countText}\n请勿关闭页面或重复点击。`;
    }
    if (modal) {
modal.classList.add('show');
    }
}

function hideTaskDeleteProgressModal() {
    const modal = document.getElementById('taskDeleteProgressModal');
    if (modal) {
modal.classList.remove('show');
    }
}

// [v7.4.0] 统一处理确认弹窗关闭 - 兼容 Promise 和 callback 两种方式
function resolveConfirm(result) {
    document.getElementById('confirmModal').classList.remove('show');
    
    // 处理 Promise 方式 (showConfirm)
    if (confirmResolve) {
confirmResolve(result);
confirmResolve = null;
    }
    
    // 处理 callback 方式 (showConfirmModal)
    if (result && confirmModalCallback) {
confirmModalCallback();
    }
    confirmModalCallback = null;
    
    // 恢复默认按钮文本
    const modal = document.getElementById('confirmModal');
    const buttons = modal.querySelectorAll('.modal-content > div:last-child button');
    if (buttons.length >= 2) {
buttons[0].textContent = '取消';
buttons[1].textContent = '确定';
    }
}

// [v6.4.1] 输入提示弹窗
function showPrompt(message, defaultValue = '', title = '输入') {
    return new Promise((resolve) => {
const isGlass = document.body.classList.contains('glass-mode');
const overlay = document.createElement('div');
overlay.id = 'prompt-overlay';
overlay.innerHTML = `
    <style>
        #prompt-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
            z-index: 10001;
            display: flex; align-items: center; justify-content: center;
            animation: promptFadeIn 0.2s ease;
        }
        @keyframes promptFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .prompt-card {
            background: ${isGlass ? 'rgba(30,30,35,0.95)' : 'var(--card-bg, #fff)'};
            backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
            border-radius: 16px; padding: 20px;
            width: 85%; max-width: 320px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            border: 1px solid ${isGlass ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
            color: ${isGlass ? 'rgba(255,255,255,0.95)' : 'var(--text-color, #333)'};
        }
        .prompt-card h4 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
        .prompt-card p { margin: 0 0 16px; font-size: 13px; opacity: 0.8; line-height: 1.5; }
        .prompt-card input {
            width: 100%; padding: 12px; border-radius: 10px;
            border: 1px solid ${isGlass ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'};
            background: ${isGlass ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.03)'};
            color: inherit; font-size: 15px;
            margin-bottom: 16px; box-sizing: border-box;
        }
        .prompt-card input::placeholder { color: ${isGlass ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'}; }
        .prompt-card input:focus { outline: none; border-color: var(--color-primary, #007aff); }
        .prompt-btns { display: flex; gap: 8px; }
        .prompt-btn {
            flex: 1; padding: 12px; border: none; border-radius: 10px;
            font-size: 14px; font-weight: 500; cursor: pointer;
        }
        .prompt-btn-cancel {
            background: ${isGlass ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'};
            color: ${isGlass ? 'rgba(255,255,255,0.7)' : 'var(--text-color)'};
        }
        .prompt-btn-ok {
            background: linear-gradient(135deg, #007aff 0%, #0055cc 100%);
            color: white;
        }
    </style>
    <div class="prompt-card">
        <h4>${title}</h4>
        <p>${message}</p>
        <input type="text" id="promptInput" value="${defaultValue}" placeholder="请输入...">
        <div class="prompt-btns">
            <button class="prompt-btn prompt-btn-cancel" onclick="resolvePrompt(null)">取消</button>
            <button class="prompt-btn prompt-btn-ok" onclick="resolvePrompt(document.getElementById('promptInput').value)">确定</button>
        </div>
    </div>
`;
document.body.appendChild(overlay);

// 自动聚焦输入框
setTimeout(() => {
    const input = document.getElementById('promptInput');
    if (input) { input.focus(); input.select(); }
}, 100);

// 回车确认
overlay.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') resolvePrompt(document.getElementById('promptInput').value);
    if (e.key === 'Escape') resolvePrompt(null);
});

window._promptResolve = resolve;
    });
}
function resolvePrompt(value) {
    const overlay = document.getElementById('prompt-overlay');
    if (overlay) overlay.remove();
    if (window._promptResolve) {
window._promptResolve(value);
window._promptResolve = null;
    }
}

function showAllTasksInfoModal() { document.getElementById('allTasksInfoModal').classList.add('show'); }
function hideAllTasksInfoModal() { document.getElementById('allTasksInfoModal').classList.remove('show'); }
function showFlowChartInfoModal() { document.getElementById('flowChartInfoModal').classList.add('show'); }
function hideFlowChartInfoModal() { document.getElementById('flowChartInfoModal').classList.remove('show'); }
function disableFlowChartInfoButton() { localStorage.setItem('flowChartInfoHidden', 'true'); const btn = document.getElementById('flowChartInfoButton'); if (btn) btn.style.display = 'none'; hideFlowChartInfoModal(); }
function disableAllTasksInfoButton() { 
    localStorage.setItem('allTasksInfoHidden', 'true'); 
    const btn1 = document.getElementById('allTasksInfoButton'); 
    const btn2 = document.getElementById('allTasksInfoButtonSpend'); 
    if (btn1) btn1.style.display = 'none'; 
    if (btn2) btn2.style.display = 'none'; 
    hideAllTasksInfoModal(); 
}
function showActivityHeatmapInfoModal() { document.getElementById('activityHeatmapInfoModal').classList.add('show'); }
function hideActivityHeatmapInfoModal() { document.getElementById('activityHeatmapInfoModal').classList.remove('show'); }
function showAnalysisDashboardInfoModal() { document.getElementById('analysisDashboardInfoModal').classList.add('show'); }
function hideAnalysisDashboardInfoModal() { document.getElementById('analysisDashboardInfoModal').classList.remove('show'); }
function showTableInfoModal() { document.getElementById('tableInfoModal').classList.add('show'); }
function hideTableInfoModal() { document.getElementById('tableInfoModal').classList.remove('show'); }
function showTrendInfoModal() { document.getElementById('trendInfoModal').classList.add('show'); }
function hideTrendInfoModal() { document.getElementById('trendInfoModal').classList.remove('show'); }
function disableActivityHeatmapInfoButton() { localStorage.setItem('activityHeatmapInfoHidden', 'true'); const btn = document.getElementById('activityHeatmapInfoButton'); if (btn) btn.style.display = 'none'; hideActivityHeatmapInfoModal(); }
function disableAnalysisDashboardInfoButton() { localStorage.setItem('analysisDashboardInfoHidden', 'true'); const btn = document.getElementById('analysisDashboardInfoButton'); if (btn) btn.style.display = 'none'; hideAnalysisDashboardInfoModal(); }
function disableTableInfoButton() { localStorage.setItem('tableInfoHidden', 'true'); const btn = document.getElementById('tableInfoButton'); if (btn) btn.style.display = 'none'; hideTableInfoModal(); }
function disableTrendInfoButton() { localStorage.setItem('trendInfoHidden', 'true'); const btn = document.getElementById('trendInfoButton'); if (btn) btn.style.display = 'none'; hideTrendInfoModal(); }
function showAutoDetectInfoModal() { document.getElementById('autoDetectInfoModal').classList.add('show'); }
function hideAutoDetectInfoModal() { document.getElementById('autoDetectInfoModal').classList.remove('show'); }
function disableAutoDetectInfoButton() { localStorage.setItem('autoDetectInfoHidden', 'true'); const btn = document.getElementById('autoDetectInfoButton'); if (btn) btn.style.display = 'none'; hideAutoDetectInfoModal(); }
// [v5.10.0] 屏幕时间说明弹窗函数
function showScreenTimeInfoModal() { document.getElementById('screenTimeInfoModal').classList.add('show'); }
function hideScreenTimeInfoModal() { document.getElementById('screenTimeInfoModal').classList.remove('show'); }
function disableScreenTimeInfoButton() { localStorage.setItem('screenTimeInfoHidden', 'true'); const btn = document.getElementById('screenTimeInfoButton'); if (btn) btn.style.display = 'none'; hideScreenTimeInfoModal(); }

// [v7.13.0] 悬浮窗计时器说明弹窗函数
function showFloatingTimerInfoModal() { document.getElementById('floatingTimerInfoModal').classList.add('show'); }
function hideFloatingTimerInfoModal() { document.getElementById('floatingTimerInfoModal').classList.remove('show'); }
function disableFloatingTimerInfoButton() { localStorage.setItem('floatingTimerInfoHidden', 'true'); const btn = document.getElementById('floatingTimerInfoButton'); if (btn) btn.style.display = 'none'; hideFloatingTimerInfoModal(); }

// [v7.24.0] 习惯戒除说明弹窗
function showQuotaModeInfoModal() {
    showInfoModal('🛡️ 习惯戒除功能说明', `
<div style="text-align: left; font-size: 0.9rem; line-height: 1.8;">
    <p style="margin-bottom: 12px; color: var(--text-color-light);">
        习惯戒除帮助您控制娱乐/消费类任务的时间投入，通过「额度内低消耗、超出高消耗」的机制，实现柔性自律。
    </p>
    
    <p style="margin-bottom: 8px;"><strong>🎯 两种模式</strong></p>
    <div style="margin-bottom: 16px; padding-left: 8px; color: var(--text-color-light);">
        <div style="margin-bottom: 8px;">
            <strong style="color: var(--color-earn);">配额模式</strong><br>
            额度内按 <b>50%</b> 消耗，超出部分按 <b>200%</b> 消耗<br>
            <span style="font-size: 0.85rem; opacity: 0.8;">适合：有明确时间预算的场景（如每天游戏60分钟）</span>
        </div>
        <div>
            <strong style="color: var(--color-spend);">动态倍率</strong>（仅计时类）<br>
            倍率随使用时长<b>二次增长</b>：∝ (累计时长/额度)²<br>
            <span style="font-size: 0.85rem; opacity: 0.8;">适合：需要强力遏制超额使用的场景，越用越"贵"</span>
        </div>
    </div>
    
    <p style="margin-bottom: 8px;"><strong>📐 额度设置</strong></p>
    <ul style="margin-bottom: 16px; padding-left: 20px; color: var(--text-color-light);">
        <li>计时类任务：额度单位为<b>分钟</b>（如游戏每天限额60分钟）</li>
        <li>按次类任务：额度单位为<b>次数</b>（如每天限定兑换3次）</li>
    </ul>
    
    <p style="margin-bottom: 8px;"><strong>💡 使用技巧</strong></p>
    <ul style="margin-bottom: 12px; padding-left: 20px; color: var(--text-color-light);">
        <li>额度不必设得太紧，给自己留一些弹性空间</li>
        <li>动态倍率的遏制效果随时间指数级增强，适合重度依赖场景</li>
        <li>戒除周期支持每天/每周/每月/每年，灵活匹配不同需求</li>
    </ul>
    
    <p style="font-size: 0.85rem; color: var(--text-color-light); opacity: 0.8; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
        提示：开启习惯戒除后，任务卡片会显示当前周期的额度使用情况（如"额度 45/60分"）。
    </p>
</div>
    `);
}

// [v7.24.0] 习惯养成说明弹窗
function showHabitModeInfoModal() {
    showInfoModal('🎯 习惯养成说明', `
<div style="text-align: left; font-size: 0.9rem; line-height: 1.8;">
    <p style="margin-bottom: 12px; color: var(--text-color-light);">
        将任务设置为习惯，开启连续打卡与奖励机制，帮助您坚持有价值的行为。
    </p>
    
    <p style="margin-bottom: 8px;"><strong>📅 周期设置</strong></p>
    <div style="margin-bottom: 16px; padding-left: 8px; color: var(--text-color-light);">
        <div style="margin-bottom: 8px;">
            <strong style="color: var(--color-earn);">每天</strong>：适合日常习惯（如早起、阅读）<br>
            <span style="font-size: 0.85rem; opacity: 0.8;">目标：每天完成一定次数或时长</span>
        </div>
        <div style="margin-bottom: 8px;">
            <strong style="color: var(--color-earn);">每周/每月/每年</strong>：适合中长期目标<br>
            <span style="font-size: 0.85rem; opacity: 0.8;">目标：在周期内达成累计次数</span>
        </div>
    </div>
    
    <p style="margin-bottom: 8px;"><strong>🎯 周期目标</strong></p>
    <ul style="margin-bottom: 16px; padding-left: 20px; color: var(--text-color-light);">
        <li>计次类任务：设置每周期需完成的次数（如每天3次）</li>
        <li>计时类任务：设置每周期的目标时长（如每天60分钟）</li>
    </ul>
    
    <p style="margin-bottom: 8px;"><strong>🎁 习惯奖励</strong></p>
    <ul style="margin-bottom: 16px; padding-left: 20px; color: var(--text-color-light);">
        <li>可设置多档奖励：如达标5次奖200分，达标10次奖500分</li>
        <li>连续达标连胜：每个周期都完成目标即算连胜</li>
        <li>连胜越长，习惯稳定性越高</li>
    </ul>
    
    <p style="margin-bottom: 8px;"><strong>📝 每日上限（计时类）</strong></p>
    <ul style="margin-bottom: 12px; padding-left: 20px; color: var(--text-color-light);">
        <li>限制单次任务的最长计时时间</li>
        <li>防止忘记结束导致超时累积</li>
    </ul>
    
    <p style="font-size: 0.85rem; color: var(--text-color-light); opacity: 0.8; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
        提示：习惯任务卡片会显示当前周期进度和连胜状态，激励您保持节奏。
    </p>
</div>
    `);
}

// [v6.4.x] 通透强度调节（透明度）
function applyGlassStrength(percent = 100, persist = true) {
    const slider = document.getElementById('glassStrengthSlider');
    const label = document.getElementById('glassStrengthValue');
    const numeric = Number(percent);
    const clamped = Math.max(0, Math.min(120, Number.isFinite(numeric) ? numeric : 100));
    const scale = clamped / 100;
    if (slider) slider.value = clamped;
    if (label) label.textContent = `${clamped}%`;
    screenTimeSettings.glassStrength = clamped;
    if (glassStrengthRaf) cancelAnimationFrame(glassStrengthRaf);
    glassStrengthRaf = requestAnimationFrame(() => {
document.documentElement.style.setProperty('--glass-strength', scale);
document.documentElement.style.setProperty('--glass-opacity-scale', scale);
if (persist) saveScreenTimeSettings();
glassStrengthRaf = null;
    });
}
function onGlassStrengthChange(val) { applyGlassStrength(val); }

// [v6.4.x] 模糊强度调节
function applyGlassBlurStrength(percent = 100, persist = true) {
    const slider = document.getElementById('glassBlurSlider');
    const label = document.getElementById('glassBlurValue');
    const numeric = Number(percent);
    const clamped = Math.max(0, Math.min(120, Number.isFinite(numeric) ? numeric : 100));
    const scale = clamped / 100;
    if (slider) slider.value = clamped;
    if (label) label.textContent = `${clamped}%`;
    screenTimeSettings.glassBlurStrength = clamped;
    if (glassBlurRaf) cancelAnimationFrame(glassBlurRaf);
    glassBlurRaf = requestAnimationFrame(() => {
document.documentElement.style.setProperty('--glass-blur-scale', scale);
if (persist) saveScreenTimeSettings();
glassBlurRaf = null;
    });
}
function onGlassBlurChange(val) { applyGlassBlurStrength(val); }

// [v7.20.2] 同步三态卡片风格切换器状态
function syncCardVisualModeSwitcher(mode) {
    const switcher = document.getElementById('cardVisualModeSwitcher');
    if (!switcher) return;
    switcher.querySelectorAll('.style-btn').forEach(btn => {
btn.classList.toggle('active', btn.dataset.style === mode);
    });
}

// [v7.20.2] 获取当前卡片视觉模式
function getCurrentCardVisualMode() {
    if (screenTimeSettings.cardStyle === 'glass' || document.body.classList.contains('glass-mode')) {
return 'glass';
    }
    return getGradientStyle() === 'flat' ? 'flat' : 'gradient';
}

const GLASS_OIL_THEME_PROMPT_SHOWN_KEY = 'tb_glass_oil_theme_prompt_shown';
const OIL_PAINTING_ACCENTS = ['the-starry-night', 'woman-with-a-parasol', 'almond-blossoms'];

function isOilPaintingAccentTheme(accentName) {
    return OIL_PAINTING_ACCENTS.includes(accentName);
}

function pickRandomOilPaintingAccent() {
    const index = Math.floor(Math.random() * OIL_PAINTING_ACCENTS.length);
    return OIL_PAINTING_ACCENTS[index] || 'the-starry-night';
}

function maybeShowGlassOilThemePrompt(triggeredByUser) {
    if (!triggeredByUser) return;
    if (localStorage.getItem(GLASS_OIL_THEME_PROMPT_SHOWN_KEY) === 'true') return;

    const currentAccent = localStorage.getItem('accentTheme') || 'sky-blue';
    if (isOilPaintingAccentTheme(currentAccent)) return;

    localStorage.setItem(GLASS_OIL_THEME_PROMPT_SHOWN_KEY, 'true');

    const message = '通透模式与油画主题搭配更佳，视觉层次会更自然。<br><br>是否立即切换到一个油画主题？';
    showConfirmModal(
'通透模式搭配建议',
message,
() => {
    const nextAccent = pickRandomOilPaintingAccent();
    setAccentTheme(nextAccent);
    // [v7.25.1] 先切换 tab，等布局稳定后再启动引导（修复定位问题）
    setTimeout(() => {
        switchTab('settings');
        setTimeout(() => startSimpleOnboarding('glass-tuning'), 500);
    }, 200);
},
'立即切换',
'暂不切换'
    );
}

// [v6.0.0] 统一卡片样式切换（时间余额卡片 + 屏幕时间卡片 + 任务卡片 + 底部导航栏 + 全局通透模式）
function setCardStyle(style) {
    // [v6.0.0] 应用全局通透模式到 body
    if (style === 'glass') {
document.body.classList.add('glass-mode');
    } else {
document.body.classList.remove('glass-mode');
    }
    // 应用到时间余额卡片
    const balanceCard = document.getElementById('balanceCard');
    if (balanceCard) {
balanceCard.classList.remove('classic', 'glass');
balanceCard.classList.add(style);
    }
    // 应用到屏幕时间卡片
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    if (screenTimeWrapper) {
screenTimeWrapper.classList.remove('classic', 'glass');
screenTimeWrapper.classList.add(style);
    }
    // 应用到所有任务卡片
    document.querySelectorAll('.task-card').forEach(card => {
card.classList.remove('classic', 'glass');
card.classList.add(style);
    });
    // 应用到底部导航栏
    const bottomTabs = document.querySelector('.bottom-tabs');
    if (bottomTabs) {
bottomTabs.classList.remove('classic', 'glass');
bottomTabs.classList.add(style);
    }
    // 通透强度控制条显隐
    const glassStrengthSetting = document.getElementById('glassStrengthSetting');
    const glassBlurSetting = document.getElementById('glassBlurSetting');
    const glassAffectList = document.getElementById('glassAffectList');
    if (glassStrengthSetting) {
glassStrengthSetting.style.display = style === 'glass' ? 'flex' : 'none';
    }
    if (glassBlurSetting) {
glassBlurSetting.style.display = style === 'glass' ? 'flex' : 'none';
    }
    if (glassAffectList) {
glassAffectList.style.display = style === 'glass' ? 'block' : 'none';
    }
    // 切换到通透时，应用当前强度
    if (style === 'glass') {
applyGlassStrength(screenTimeSettings.glassStrength || 100, false);
applyGlassBlurStrength(screenTimeSettings.glassBlurStrength || 100, false);
    }
    // [v7.20.2] 同步三态开关状态
    syncCardVisualModeSwitcher(getCurrentCardVisualMode());
    // 保存设置到screenTimeSettings（兼容旧的保存机制）
    screenTimeSettings.cardStyle = style;
    saveScreenTimeSettings();
    // 刷新屏幕时间卡片颜色
    updateScreenTimeCard();
    // 刷新余额卡片（确保样式正确显示）
    if (typeof updateBalanceCard === 'function') updateBalanceCard();
}
// [v5.10.0] 兼容旧函数（内部调用统一函数）
function setScreenTimeCardStyle(style) {
    setCardStyle(style);
}

// [v7.20.1] 设置渐变风格（渐变色/纯色系）
function setGradientStyle(style) {
    localStorage.setItem('gradientStyle', style);
    
    // 添加/移除 body 类标记
    if (style === 'flat') {
document.body.classList.add('flat-style');
    } else {
document.body.classList.remove('flat-style');
    }
    
    // 刷新任务列表以应用新的颜色风格
    if (typeof updateTaskList === 'function') updateTaskList();
    // 刷新余额卡片（首页三大卡片）
    if (typeof updateBalanceCard === 'function') updateBalanceCard();
    if (typeof updateScreenTimeCard === 'function') updateScreenTimeCard();
    if (typeof updateSleepCard === 'function') updateSleepCard();

    // [v7.20.2] 同步三态开关状态
    syncCardVisualModeSwitcher(getCurrentCardVisualMode());
}

// [v7.20.2] 统一三态卡片风格入口：纯色 / 渐变 / 通透
function setCardVisualMode(mode, triggeredByUser = true) {
    if (mode === 'glass') {
setGradientStyle('gradient');
setCardStyle('glass');
    } else if (mode === 'flat') {
setCardStyle('classic');
setGradientStyle('flat');
    } else {
setCardStyle('classic');
setGradientStyle('gradient');
    }
    localStorage.setItem('cardVisualMode', mode);
    syncCardVisualModeSwitcher(mode);

    if (mode === 'glass') {
maybeShowGlassOilThemePrompt(triggeredByUser);
    }
}
// [v5.10.0] 通透模式进度条颜色计算
function getScreenTimeProgressColor(percent) {
    if (percent <= 60) {
return { gradient: 'linear-gradient(90deg, #22c55e 0%, #4ade80 100%)', color: '#22c55e' }; // 绿色
    } else if (percent <= 90) {
return { gradient: 'linear-gradient(90deg, #eab308 0%, #facc15 100%)', color: '#eab308' }; // 黄色
    } else if (percent <= 100) {
return { gradient: 'linear-gradient(90deg, #f97316 0%, #fb923c 100%)', color: '#f97316' }; // 橙色
    } else {
return { gradient: 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)', color: '#ef4444' }; // 红色
    }
}

// --- Dashboard & Analysis ---
let cachedAnalysisFilteredTransactions = [];
let cachedAnalysisAggregatedData = []; // [v6.0.0] 缓存聚合数据供KPI切换使用

function updateAnalysisDashboard() { 
    renderAnalysisFilters(); 
    const filteredTransactions = getFilteredTransactions(reportState.analysisPeriod); 
    cachedAnalysisFilteredTransactions = filteredTransactions; 
    const { aggregatedData } = processDashboardData(filteredTransactions, reportState.analysisView); 
    cachedAnalysisAggregatedData = aggregatedData; // 缓存
    renderKpiCards(filteredTransactions, aggregatedData, reportState.insightSubViewIndex || 0, true); // forceRender=true
    updateInteractiveAnalysisModule(aggregatedData, filteredTransactions); 
}
function renderAnalysisFilters() { const container = document.getElementById('analysisDashboardFilters'); container.innerHTML = `<button class="${reportState.analysisPeriod === '7d' ? 'active' : ''}" onclick="setAnalysisPeriod('7d')">7天内</button><button class="${reportState.analysisPeriod === '30d' ? 'active' : ''}" onclick="setAnalysisPeriod('30d')">30天内</button><button class="${reportState.analysisPeriod === 'all' ? 'active' : ''}" onclick="setAnalysisPeriod('all')">全部</button>`; /* Update view switcher in chart header */ const viewSwitcher = document.getElementById('analysisViewSwitcher'); if (viewSwitcher) { viewSwitcher.querySelectorAll('button').forEach(btn => { const isCategory = btn.textContent === '分类'; btn.classList.toggle('active', (isCategory && reportState.analysisView === 'category') || (!isCategory && reportState.analysisView === 'task')); }); } }

// [v6.0.0] 记录上次KPI渲染的状态，用于防止切换饼图时重复刷新
let lastKpiRenderState = { pieIndex: -1, timestamp: 0 };

function renderKpiCards(transactions, data, pieIndex = 0, forceRender = false) {
    const container = document.getElementById('kpiGrid');
    if (transactions.length === 0) { container.innerHTML = ''; lastKpiRenderState = { pieIndex: -1, timestamp: 0 }; return; }
    
    // [v6.0.0] 防止饼图切换后的重复渲染（2秒内相同索引不重复渲染）
    const now = Date.now();
    if (!forceRender && lastKpiRenderState.pieIndex === pieIndex && (now - lastKpiRenderState.timestamp) < 2000) {
        return; // 短时间内相同索引，跳过渲染
    }
    lastKpiRenderState = { pieIndex, timestamp: now };
    
    const uniqueDays = new Set(transactions.map(t => getLocalDateString(t.timestamp))).size;
    
    // 计算各项数据
    const totalEarned = data.reduce((sum, item) => sum + item.earned, 0);
    const totalSpent = data.reduce((sum, item) => sum + item.spent, 0);
    const totalNet = data.reduce((sum, item) => sum + item.net, 0);
    const avgDailyNet = uniqueDays > 0 ? totalNet / uniqueDays : 0;
    const avgDailyEarned = uniqueDays > 0 ? totalEarned / uniqueDays : 0;
    const avgDailySpent = uniqueDays > 0 ? totalSpent / uniqueDays : 0;
    
    // 根据饼图索引决定显示获得还是消费
    const isEarnView = pieIndex === 0;
    const dynamicValue = isEarnView ? avgDailyEarned : avgDailySpent;
    const dynamicLabel = isEarnView ? '平均每日获得' : '平均每日消费';
    const dynamicClass = isEarnView ? 'positive' : 'negative';
    const dynamicPrefix = isEarnView ? '+' : '-';
    
    // KPI卡片直接显示，不使用动画
    container.innerHTML = `
        <div class="kpi-card"> 
            <div class="kpi-label">${dynamicLabel}</div> 
            <div class="kpi-value kpi-time ${dynamicClass}">${dynamicPrefix}${formatTime(Math.abs(dynamicValue))}</div> 
        </div>
        <div class="kpi-card"> 
            <div class="kpi-label">平均每日净增</div> 
            <div class="kpi-value kpi-time ${avgDailyNet >= 0 ? 'positive' : 'negative'}">${avgDailyNet >= 0 ? '+' : ''}${formatTime(avgDailyNet)}</div> 
        </div>
    `;
}

function updateInteractiveAnalysisModule(aggregatedData, filteredTransactions) {
    const pieContainer = document.getElementById('pieChartContainerWrapper');
    pieContainer.className = reportState.analysisView === 'task' ? 'task-view-active' : 'category-view-active';
    renderPieCharts(aggregatedData, filteredTransactions);
}
function setInsightSubViewIndex(index) { reportState.insightSubViewIndex = index; }

function showCategoryDetail(categoryName, typeKey = 'earn', fromPie = false) {
    const modal = document.getElementById('categoryDetailModal');
    const title = document.getElementById('categoryDetailModalTitle');
    const content = document.getElementById('categoryDetailContent');
    if (!modal || !title || !content) return;
    
    // 长按饼图进入时添加展开动画（只在关闭弹窗时移除，避免触发二次动画）
    if (fromPie) {
        modal.classList.add('from-pie');
    }

    const periodLabelMap = { '7d': '7天内', '30d': '30天内', 'all': '全部' };
    const typeLabel = typeKey === 'earn' ? '获得' : '消费';
    const periodLabel = periodLabelMap[reportState.analysisPeriod] || '全部';

    const source = (cachedAnalysisFilteredTransactions && cachedAnalysisFilteredTransactions.length > 0)
        ? cachedAnalysisFilteredTransactions
        : getFilteredTransactions(reportState.analysisPeriod);

    const taskMap = new Map();
    source.forEach(t => {
        // [v5.10.0] 支持系统分类的自定义分类
        let category, taskName;
        if (t.isSystem) {
            category = getTransactionCategory(t); // 使用统一的分类获取函数
            // [v7.16.1] 去除任务名前的表情图标
            const rawName = t.taskName || '屏幕时间';
            taskName = rawName.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, '');
        } else {
            const task = tasks.find(tsk => tsk.id === t.taskId);
            category = getTransactionCategory(t);
            taskName = t.taskName || task?.name || '已删除任务';
        }
        if (category !== categoryName) return;
        const isEarn = t.type ? t.type === 'earn' : t.amount > 0;
        if (typeKey === 'earn' && !isEarn) return;
        if (typeKey === 'spend' && isEarn) return;
        const amount = Math.abs(t.amount);
        taskMap.set(taskName, (taskMap.get(taskName) || 0) + amount);
    });

    const tasksArr = Array.from(taskMap.entries()).map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    const total = tasksArr.reduce((sum, item) => sum + item.value, 0);
    const maxVal = tasksArr.length > 0 ? tasksArr[0].value : 1;

    title.textContent = `${periodLabel} · ${categoryName} · 详情`;

    if (total === 0) {
        content.innerHTML = `<div class="empty-message">此周期该分类暂无${typeLabel}记录</div>`;
        modal.classList.add('show');
        return;
    }

    const colors = generateCategoryTaskColors(getCategoryColorSafe(categoryName), tasksArr.length);
    const slices = [];
    let accum = 0;
    tasksArr.forEach((item, idx) => {
        const percent = (item.value / total) * 100;
        slices.push({
            name: item.name,
            value: item.value,
            percent,
            start: accum,
            end: accum + percent,
            color: colors[idx] || '#7c4dff'
        });
        accum += percent;
    });
    const conicGradient = `conic-gradient(from 0deg, ${slices.map(s => `${s.color} ${s.start}% ${s.end}%`).join(', ')})`;
    const totalMinutes = Math.max(0, Math.round(total / 60));
    const totalHoursPart = Math.floor(totalMinutes / 60);
    const totalMinutesPart = totalMinutes % 60;
    const centerLine1 = `总${typeLabel}`;
    const centerLine2 = `${totalHoursPart}小时`;
    const centerLine3 = `${totalMinutesPart}分`;

    const listHtml = slices.map((s, idx) => {
        const percentText = `${s.percent.toFixed(0)}%`;
        const barPercent = maxVal > 0 ? Math.max(6, (s.value / maxVal) * 100) : 0; // 保持最短条可见
        return `<div class="leaderboard-item category-detail-item" title="${escapeHtml(s.name)}" style="gap: 10px; margin-bottom: 6px;">
                    <div class="leaderboard-label"><span class="color-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}</div>
                    <div class="leaderboard-bar-wrapper" style="background: var(--border-color); height: 18px; border-radius: 4px;">
                        <div class="leaderboard-bar" style="width: ${barPercent}%; background-color: ${s.color}; height: 18px; border-radius: 4px;"></div>
                        <span class="leaderboard-bar-value">${formatTime(s.value)} · ${percentText}</span>
                    </div>
                </div>`;
    }).join('');

    content.innerHTML = `
        <div class="category-detail-summary" style="padding: 4px 4px 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 6px;">
            <span class="category-detail-meta">${typeLabel}时长：${formatTime(total)}</span>
        </div>
        <div class="category-detail-list">${listHtml}</div>
    `;
    modal.classList.add('show');
}

// 分类视图中“其他”分类的详情（列出被合并的分类）
function showOtherCategoriesDetail(otherCategories, typeKey = 'earn', fromPie = false) {
    const modal = document.getElementById('categoryDetailModal');
    const title = document.getElementById('categoryDetailModalTitle');
    const content = document.getElementById('categoryDetailContent');
    if (!modal || !title || !content || !otherCategories || otherCategories.length === 0) return;
    
    // 长按饼图进入时添加展开动画（只在关闭弹窗时移除，避免触发二次动画）
    if (fromPie) {
        modal.classList.add('from-pie');
    }

    const periodLabelMap = { '7d': '7天内', '30d': '30天内', 'all': '全部' };
    const typeLabel = typeKey === 'earn' ? '获得' : '消费';
    const periodLabel = periodLabelMap[reportState.analysisPeriod] || '全部';

    // 确保按数值排序
    const sorted = [...otherCategories].sort((a, b) => (b.value || 0) - (a.value || 0));
    const total = sorted.reduce((sum, c) => sum + (c.value || 0), 0);
    const maxVal = sorted.length > 0 ? (sorted[0].value || 1) : 1;

    title.textContent = `${periodLabel} · 其他分类 · 详情`;

    if (total === 0) {
        content.innerHTML = `<div class="empty-message">此周期其他分类暂无${typeLabel}记录</div>`;
        modal.classList.add('show');
        return;
    }

    const listHtml = sorted.map((cat, idx) => {
        const percent = total > 0 ? (cat.value / total) * 100 : 0;
        const percentText = `${percent.toFixed(0)}%`;
        const barPercent = maxVal > 0 ? Math.max(6, (cat.value / maxVal) * 100) : 0;
        const color = cat.color || getCategoryColorSafe(cat.name);
        const encodedName = encodeURIComponent(cat.name);
        return `<div class="leaderboard-item category-detail-item other-category-row" data-cat-name="${encodedName}" style="gap: 10px; margin-bottom: 6px; cursor: pointer;">
                    <div class="leaderboard-label"><span class="color-dot" style="background:${color}"></span>${escapeHtml(cat.name)}</div>
                    <div class="leaderboard-bar-wrapper" style="background: var(--border-color); height: 18px; border-radius: 4px;">
                        <div class="leaderboard-bar" style="width: ${barPercent}%; background-color: ${color}; height: 18px; border-radius: 4px;"></div>
                        <span class="leaderboard-bar-value">${formatTime(cat.value)} · ${percentText}</span>
                    </div>
                </div>`;
    }).join('');

    content.innerHTML = `
        <div class="category-detail-summary" style="padding: 4px 4px 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 6px;">
            <span class="category-detail-meta">${typeLabel}时长：${formatTime(total)}</span>
        </div>
        <div class="category-detail-list">${listHtml}</div>
    `;

    // 行点击可跳转到具体分类详情
    content.querySelectorAll('.other-category-row').forEach(row => {
        const encodedName = row.dataset.catName;
        if (!encodedName) return;
        const catName = decodeURIComponent(encodedName);
        row.addEventListener('click', () => showCategoryDetail(catName, typeKey));
    });

    modal.classList.add('show');
}

// [v5.1.0] 显示"其他"任务详情弹窗（任务视图）
function showOtherTasksDetail(otherTasks, typeKey = 'earn', fromPie = false) {
    const modal = document.getElementById('categoryDetailModal');
    const title = document.getElementById('categoryDetailModalTitle');
    const content = document.getElementById('categoryDetailContent');
    if (!modal || !title || !content || !otherTasks || otherTasks.length === 0) return;
    
    // 长按饼图进入时添加展开动画（只在关闭弹窗时移除，避免触发二次动画）
    if (fromPie) {
        modal.classList.add('from-pie');
    }

    const periodLabelMap = { '7d': '7天内', '30d': '30天内', 'all': '全部' };
    const typeLabel = typeKey === 'earn' ? '获得' : '消费';
    const periodLabel = periodLabelMap[reportState.analysisPeriod] || '全部';

    const total = otherTasks.reduce((sum, t) => sum + t.value, 0);
    const maxVal = otherTasks.length > 0 ? otherTasks[0].value : 1;

    title.textContent = `${periodLabel} · 其他任务 · 详情`;

    // [v5.1.0] 10级渐变色覆盖所有任务
    const earnGradient10 = ['#2E7D32', '#388E3C', '#43A047', '#4CAF50', '#66BB6A', '#81C784', '#A5D6A7', '#C8E6C9', '#E8F5E9', '#F1F8E9'];
    const spendGradient10 = ['#C62828', '#D32F2F', '#E53935', '#F44336', '#EF5350', '#E57373', '#EF9A9A', '#FFCDD2', '#FFEBEE', '#FFF3E0'];
    const colorPalette = typeKey === 'earn' ? earnGradient10 : spendGradient10;
    
    const listHtml = otherTasks.map((t, idx) => {
        const percent = total > 0 ? (t.value / total) * 100 : 0;
        const percentText = `${percent.toFixed(0)}%`;
        const barPercent = maxVal > 0 ? Math.max(6, (t.value / maxVal) * 100) : 0;
        const color = idx < colorPalette.length ? colorPalette[idx] : OTHER_COLOR;
        return `<div class="leaderboard-item category-detail-item" title="${escapeHtml(t.name)}" style="gap: 10px; margin-bottom: 6px; cursor: pointer;" onclick="showTaskHistory('${t.taskId}')">
                    <div class="leaderboard-label"><span class="color-dot" style="background:${color}"></span>${escapeHtml(t.name)}</div>
                    <div class="leaderboard-bar-wrapper" style="background: var(--border-color); height: 18px; border-radius: 4px;">
                        <div class="leaderboard-bar" style="width: ${barPercent}%; background-color: ${color}; height: 18px; border-radius: 4px;"></div>
                        <span class="leaderboard-bar-value">${formatTime(t.value)} · ${percentText}</span>
                    </div>
                </div>`;
    }).join('');

    content.innerHTML = `
        <div class="category-detail-summary" style="padding: 4px 4px 6px; border-bottom: 1px solid var(--border-color); margin-bottom: 6px;">
            <span class="category-detail-meta">${typeLabel}时长：${formatTime(total)}</span>
        </div>
        <div class="category-detail-list">${listHtml}</div>
    `;
    modal.classList.add('show');
}

// [v4.5.2] FIX: Removed setTimeout and added rAF + cAF
function renderPieCharts(data, filteredTransactions) {
    const container = document.getElementById('pieChartContainerWrapper');
    const earnData = data.filter(d => d.earned > 0).sort((a, b) => b.earned - a.earned);
    const spendData = data.filter(d => d.spent > 0).sort((a, b) => b.spent - a.spent);
    const createPieChartHTML = (type) => `<div class="pie-chart-wrapper" id="pieWrapper-${type}"></div>`;

    const buildCategoryTaskBreakdown = () => {
        if (!filteredTransactions || reportState.analysisView !== 'category') return null;
        const breakdown = new Map();
        filteredTransactions.forEach(t => {
            // [v5.2.0] 支持系统交易的分类细分
            // [v5.10.0] 修复：使用 getTransactionCategory 获取自定义分类
            let categoryName, taskName;
            if (t.isSystem) {
                categoryName = getTransactionCategory(t);
                // [v7.16.1] 去除任务名前的表情图标
                const rawName = t.taskName || '系统任务';
                taskName = rawName.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, '');
            } else {
                const task = tasks.find(tsk => tsk.id === t.taskId);
                categoryName = getTransactionCategory(t);
                if (!categoryName) return;
                taskName = t.taskName || task?.name || '已删除任务';
            }
            const isEarn = t.type ? t.type === 'earn' : t.amount > 0;
            const typeKey = isEarn ? 'earn' : 'spend';
            if (!breakdown.has(categoryName)) breakdown.set(categoryName, { earn: new Map(), spend: new Map() });
            const typeMap = breakdown.get(categoryName)[typeKey];
            typeMap.set(taskName, (typeMap.get(taskName) || 0) + Math.abs(t.amount));
        });
        const result = new Map();
        breakdown.forEach((value, categoryName) => {
            const earnArr = Array.from(value.earn.entries()).map(([name, val]) => ({ name, value: val })).sort((a, b) => b.value - a.value);
            const spendArr = Array.from(value.spend.entries()).map(([name, val]) => ({ name, value: val })).sort((a, b) => b.value - a.value);
            result.set(categoryName, { earn: earnArr, spend: spendArr });
        });
        return result;
    };

    const categoryTaskBreakdown = buildCategoryTaskBreakdown();
    
    // 1. 同步清空 DOM
    container.innerHTML = `<div class="swiper-container" id="pieSwiperContainer"><div class="swiper-wrapper"><div class="swiper-slide">${createPieChartHTML('earn')}</div><div class="swiper-slide">${createPieChartHTML('spend')}</div></div></div><div class="swiper-pagination" id="pieSwiperPagination"></div>`;
    
    // 2. 同步强制回流
    container.getBoundingClientRect(); 

    // 3. (cAF 防护) 取消上一个待处理的帧
    if (pendingPieRender) {
        cancelAnimationFrame(pendingPieRender);
    }

    // 4. (rAF 优化) 请求下一帧绘制
    pendingPieRender = requestAnimationFrame(() => {
        renderSinglePie('earn', earnData, reportState.analysisView, categoryTaskBreakdown); 
        renderSinglePie('spend', spendData, reportState.analysisView, categoryTaskBreakdown); 
        setupSwiper('pieSwiperContainer', 'pieSwiperPagination', (index) => { 
            setInsightSubViewIndex(index); 
            // [v6.0.0] 切换饼图时更新KPI卡片
            if (cachedAnalysisFilteredTransactions.length > 0 && cachedAnalysisAggregatedData.length > 0) {
                renderKpiCards(cachedAnalysisFilteredTransactions, cachedAnalysisAggregatedData, index);
            }
            // [v6.0.0] 切换饼图只保存本地，不触发云同步（避免同步回调导致二次刷新）
            try { 
                localStorage.setItem('timeBankData', JSON.stringify({ 
                    version: APP_VERSION, currentBalance, tasks, transactions, 
                    categoryColors: [...categoryColors], collapsedCategories: [...collapsedCategories], 
                    runningTasks: [...runningTasks], dailyChanges, notificationSettings, reportState,
                    deletedTaskCategoryMap
                })); 
            } catch(e) {} 
        }); 
        initPieTooltips(); // [v5.1.0] 饼图长按弹窗
        pendingPieRender = null; // 完成后重置
    });
}

function renderSinglePie(type, sourceData, view, categoryTaskBreakdown) {
    const wrapper = document.getElementById(`pieWrapper-${type}`);
    if (!wrapper) return;
    const valueKey = type === 'earn' ? 'earned' : 'spent';
    const totalValue = sourceData.reduce((sum, item) => sum + item[valueKey], 0);
    if (totalValue === 0) { wrapper.innerHTML = `<div class="empty-message" style="padding: 20px 0; color: var(--text-color-light);">无${type === 'earn' ? '获得' : '消费'}数据</div>`; return; }
    let processedData = []; let otherValue = 0; let otherTasks = []; let otherCategories = []; const topN = view === 'task' ? 5 : 4; 
    // [v7.9.7] 系统任务名称列表（用于饼图识别，兼容历史数据）
    const systemTaskNames = ['屏幕时间管理', '睡眠时间管理', '小睡', '😴 睡眠时间管理', '💤 小睡'];
    sourceData.forEach((item, index) => { 
        if (index < topN) {
            // 任务视图时查找taskId
            let taskId = null;
            let isSystem = false;
            if (view === 'task' && item.name !== '其他') {
                const task = tasks.find(t => t.name === item.name);
                if (task) {
                    taskId = task.id;
                } else if (systemTaskNames.includes(item.name)) {
                    isSystem = true; // [v7.9.6] 标记为系统任务
                }
            }
            processedData.push({ name: item.name, value: item[valueKey], taskId, isSystem }); 
        } else {
            otherValue += item[valueKey];
            // 任务视图时保存第6-15名任务详情
            if (view === 'task' && index < 15) {
                const task = tasks.find(t => t.name === item.name);
                otherTasks.push({ name: item.name, value: item[valueKey], taskId: task?.id || null });
            }
            // 分类视图：记录被合并的其他分类以便展示详情
            if (view === 'category') {
                otherCategories.push({ name: item.name, value: item[valueKey], color: getCategoryColorSafe(item.name) });
            }
        }
    });
    if (otherValue > 0) processedData.push({ name: '其他', value: otherValue, taskId: null, otherTasks, otherCategories });
    const isCategoryView = view === 'category';
    // [v6.0.0] 任务视图使用分类颜色+递减色阶；"其他"使用与饼图类型协调的颜色
    // [v7.2.2] 传递 type 参数以支持系统任务的动态分类
    const taskColorMap = !isCategoryView ? buildTaskViewColorMap(processedData, type) : null;
    const otherColor = type === 'earn' ? OTHER_EARN_COLOR : OTHER_SPEND_COLOR;
    let currentAngle = 0;
    const gradientParts = processedData.map((item, index) => { const percent = (item.value / totalValue) * 100; let color; if (item.name === '其他') { color = otherColor; } else if (!isCategoryView) { color = taskColorMap.get(item.name) || otherColor; } else { color = getCategoryColorSafe(item.name); } item.color = color; const startAngle = currentAngle; const endAngle = currentAngle + percent; currentAngle = endAngle; return `${color} ${startAngle}% ${endAngle}%`; });
    const conicGradient = `conic-gradient(from 0deg, ${gradientParts.join(', ')})`;
    const legendHTML = isCategoryView ? '' : `<div class="pie-chart-legend">${processedData.map(item => `<div class="pie-legend-item"><div class="pie-legend-color-box" style="background-color: ${item.color};"></div>${item.name}</div>`).join('')}</div>`;
    const slices = []; let accum = 0;
    processedData.forEach(item => {
        const percent = (item.value / totalValue) * 100;
        const taskBreakdown = isCategoryView && categoryTaskBreakdown ? (type === 'earn' ? categoryTaskBreakdown.get(item.name)?.earn : categoryTaskBreakdown.get(item.name)?.spend) : null;
        slices.push({ name: item.name, value: item.value, percent, start: accum, end: accum + percent, tasks: taskBreakdown || [], typeKey: type, taskId: item.taskId || null, isSystem: item.isSystem || false, otherTasks: item.otherTasks || [], otherCategories: item.otherCategories || [], color: item.color });
        accum += percent;
    });
    const totalMinutes = Math.max(0, Math.round(totalValue / 60));
    const totalHoursPart = Math.floor(totalMinutes / 60);
    const totalMinutesPart = totalMinutes % 60;
    const centerLine1 = `总${type === 'earn' ? '获得' : '消费'}`;
    const centerLine2 = `${totalHoursPart}小时`;
    const centerLine3 = `${totalMinutesPart}分`;
    wrapper.innerHTML = `<div class="pie-chart-container" data-pie-meta="${encodeURIComponent(JSON.stringify({ typeLabel: type === 'earn' ? '获得' : '消费', typeKey: type, totalValue, view, slices }))}"><div class="pie-chart" style="background: ${conicGradient};"></div><div class="pie-slice-labels"></div><div class="pie-chart-center"><div class="pie-center-title">${centerLine1}</div><div class="pie-center-value">${centerLine2}</div><div class="pie-center-value">${centerLine3}</div></div></div>${legendHTML}`;
    const labelsContainer = wrapper.querySelector('.pie-slice-labels'); const pieContainer = wrapper.querySelector('.pie-chart-container'); if (!pieContainer || !labelsContainer) return;
    // [v5.4.0] 生成底层 SVG 高亮层（预渲染 base 和 expanded 两套路径）
    const pieSize = 180;
    const expand = 10;
    const svgSize = pieSize + expand * 2;
    const cx = svgSize / 2;
    const cy = svgSize / 2;
    const r0Base = pieSize * 0.195;
    const r1Base = pieSize / 2;
    const r0Expanded = r0Base;
    const r1Expanded = r1Base + expand;
    const toRad = deg => (deg - 90) * Math.PI / 180;
    const buildWedge = (r0, r1, startDeg, endDeg) => {
        let angleDiff = endDeg - startDeg;
        if (angleDiff <= 0 || angleDiff > 360) return '';
        if (angleDiff > 359.9) angleDiff = 359.9;
        const actualEndDeg = startDeg + angleDiff;
        const largeArc = angleDiff > 180 ? 1 : 0;
        const p1 = { x: cx + r1 * Math.cos(toRad(actualEndDeg)), y: cy + r1 * Math.sin(toRad(actualEndDeg)) };
        const p2 = { x: cx + r1 * Math.cos(toRad(startDeg)), y: cy + r1 * Math.sin(toRad(startDeg)) };
        const p3 = { x: cx + r0 * Math.cos(toRad(startDeg)), y: cy + r0 * Math.sin(toRad(startDeg)) };
        const p4 = { x: cx + r0 * Math.cos(toRad(actualEndDeg)), y: cy + r0 * Math.sin(toRad(actualEndDeg)) };
        return `M ${p1.x} ${p1.y} A ${r1} ${r1} 0 ${largeArc} 0 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${r0} ${r0} 0 ${largeArc} 1 ${p4.x} ${p4.y} Z`;
    };
    let highlightPaths = '';
    slices.forEach(slice => {
        const startDeg = (slice.start / 100) * 360;
        const endDeg = (slice.end / 100) * 360;
        const dBase = buildWedge(r0Base, r1Base, startDeg, endDeg);
        const dExpanded = buildWedge(r0Expanded, r1Expanded, startDeg, endDeg);
        if (!dBase) return;
        highlightPaths += `<path class="pie-highlight-slice" data-slice-name="${slice.name}" data-d-base="${dBase}" data-d-expanded="${dExpanded}" fill="${slice.color}" d="${dBase}"/>`;
    });
    const highlightSVG = `<svg class="pie-highlight-layer" width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}">${highlightPaths}</svg>`;
    pieContainer.insertAdjacentHTML('afterbegin', highlightSVG);
    const centerX = pieContainer.offsetWidth / 2; const centerY = pieContainer.offsetHeight / 2; startAngle = -Math.PI / 2;
    processedData.forEach(item => {
        const percent = item.value / totalValue;
        const sliceAngle = 2 * Math.PI * percent;
        const midAngle = startAngle + sliceAngle / 2;
        const labelRadiusFactor = 0.725;
        const labelX = centerX + (centerX * labelRadiusFactor) * Math.cos(midAngle);
        const labelY = centerY + (centerY * labelRadiusFactor) * Math.sin(midAngle);
        const labelEl = document.createElement('div');
        labelEl.className = 'pie-slice-label';
        const percentText = `${(percent * 100).toFixed(0)}%`;
        if (isCategoryView) {
            // 低于5%也显示名称和占比，但不显示时长
            if (percent < 0.05) {
                labelEl.innerHTML = `${item.name}<br>${percentText}`;
            } else {
                labelEl.innerHTML = `${item.name}<br>${percentText}<br><span class="time-value">${formatTimeForPie(item.value)}</span>`;
            }
        } else {
            // 任务视图：低于5%显示百分比，达标则显示时间
            if (percent < 0.05) {
                labelEl.innerHTML = `${percentText}`;
            } else {
                labelEl.innerHTML = `${percentText} <br> <span class="time-value">${formatTime(item.value)}</span>`;
            }
        }
        labelEl.style.left = `${labelX}px`;
        labelEl.style.top = `${labelY}px`;
        labelsContainer.appendChild(labelEl);
        startAngle += sliceAngle;
    });
}

function updateTrendChart() { 
    const container = document.getElementById('trendChartContainerWrapper'); 
    const filtersHTML = `<div class="analysis-filters"> <div> <div class="analysis-view-switcher report-filters"> <button class="${reportState.trendView === 'category' ? 'active' : ''}" onclick="setTrendView('category')">分类</button> <button class="${reportState.trendView === 'task' ? 'active' : ''}" onclick="setTrendView('task')">任务</button> </div> </div> <div class="report-filters"> <button class="${reportState.trendPeriod === '7d' ? 'active' : ''}" onclick="setTrendPeriod('7d')">7天内</button> <button class="${reportState.trendPeriod === '30d' ? 'active' : ''}" onclick="setTrendPeriod('30d')">30天内</button> </div> </div>`; 
    const chartsHTML = `<div class="swiper-container" id="trendSwiperContainer"><div class="swiper-wrapper" id="trendSwiperWrapper"></div></div><div class="swiper-pagination" id="trendSwiperPagination"></div>`; 
    container.innerHTML = filtersHTML + chartsHTML; 
    const filteredTransactions = getFilteredTransactions(reportState.trendPeriod); 
    const { aggregatedData, trendData } = processDashboardData(filteredTransactions, reportState.trendView); 
    const earnChartHTML = createSingleTrendChartHTML('earned', trendData, aggregatedData); 
    const spendChartHTML = createSingleTrendChartHTML('spent', trendData, aggregatedData); 
    document.getElementById('trendSwiperWrapper').innerHTML = `<div class="swiper-slide">${earnChartHTML}</div><div class="swiper-slide">${spendChartHTML}</div>`; 
    setupSwiper('trendSwiperContainer', 'trendSwiperPagination');
    initTrendTooltips();
}
function createSingleTrendChartHTML(type, trendData, allAggregatedData) {
    const valueKey = type;
    const title = valueKey === 'earned' ? '获得时间趋势' : '消费时间趋势';
    const daysCount = reportState.trendPeriod === '30d' ? 30 : 7;
    const fullDates = [];
    const today = new Date();
    for (let i = daysCount - 1; i >= 0; i--) {
const d = new Date(today);
d.setDate(today.getDate() - i);
fullDates.push(getLocalDateString(d));
    }

    const isTaskView = reportState.trendView === 'task';
    // 分类视图：显示全部分类；任务视图：显示前5个
    const topN = isTaskView ? 5 : 999;
    const topItemsData = allAggregatedData
.filter(d => d[valueKey] > 0)
.sort((a, b) => b[valueKey] - a[valueKey])
.slice(0, topN);
    const topItems = new Set(topItemsData.map(d => d.name));
    // [v6.0.0] 任务视图使用分类颜色+递减色阶；“其他”使用与图表类型协调的颜色
    const trendTypeKey = type === 'earned' ? 'earn' : 'spend';
    const colorMap = isTaskView ? buildTaskViewColorMap(topItemsData, trendTypeKey) : null;
    const otherColor = type === 'earned' ? OTHER_EARN_COLOR : OTHER_SPEND_COLOR;
    const maxDailyTotal = Math.max(
1,
...fullDates.map(date => {
    if (!trendData[date] || !trendData[date][type]) return 0;
    return Object.values(trendData[date][type]).reduce((sum, val) => sum + val, 0);
})
    );

    const daysHTML = fullDates
.map((date, index) => {
    const dayData = trendData[date] && trendData[date][type] ? trendData[date][type] : {};
    let dailyTotal = 0;
    let othersValue = 0;
    const segments = [];
    const tooltipEntries = {};

    for (const name in dayData) {
        const value = dayData[name];
        dailyTotal += value;
        tooltipEntries[name] = value;
        if (topItems.has(name)) {
            segments.push({ name, value });
        } else {
            othersValue += value;
        }
    }

    if (othersValue > 0) {
        segments.push({ name: '其他', value: othersValue });
        tooltipEntries['其他'] = othersValue;
    }

    const tooltipRowsHtml =
        dailyTotal > 0
            ? Object.entries(tooltipEntries)
                  .sort((a, b) => b[1] - a[1])
                  .map(
                      ([name, value]) =>
                          `<div class="trend-tooltip-row"><span>${escapeHtml(name)}</span><span>${formatTime(value)}</span></div>`
                  )
                  .join('')
            : '';

    const tooltipHtml =
        dailyTotal > 0
            ? `<span class="trend-tooltip-title">${date}</span><div class="trend-tooltip-list">${tooltipRowsHtml}</div><div class="trend-tooltip-total">总计: ${formatTime(dailyTotal)}</div><div class="trend-tooltip-hint">长按 3 秒查看详情</div><div class="trend-tooltip-progress"></div>`
            : '';

    const tooltipAttr = dailyTotal > 0 ? `data-tooltip="${encodeURIComponent(tooltipHtml)}"` : '';

    const segmentsHTML = segments
        .sort((a, b) => b.value - a.value)
        .map(item => {
            const height = dailyTotal > 0 ? (item.value / dailyTotal) * 100 : 0;
            let color;
            if (item.name === '其他') {
                color = otherColor;
            } else if (isTaskView) {
                color = colorMap.get(item.name);
            } else {
                color = getCategoryColorSafe(item.name);
            }
            return `<div class="trend-segment" style="height: ${height}%; background-color: ${color || '#ccc'}"></div>`;
        })
        .join('');

    const totalHeight = maxDailyTotal > 0 ? (dailyTotal / maxDailyTotal) * 100 : 0;
    const showLabel = daysCount <= 10 || index % 2 === 0;
    const dateLabel = showLabel ? new Date(date).getDate() : '';
    const interactionStyle = dailyTotal > 0 ? 'cursor: pointer;' : 'pointer-events: none;';

    return `<div> <div class="trend-day" data-date="${date}" style="height: 150px; ${interactionStyle}" ${tooltipAttr}> <div class="trend-total-bar" style="height:${totalHeight}%; width: 100%; display: flex; flex-direction: column; justify-content: flex-end; border-radius: 4px; overflow: hidden; background-color: rgba(0,0,0,0.05);"> ${segmentsHTML} </div> </div> <div class="trend-date-label">${dateLabel}</div> </div>`;
})
.join('');

    const legendItems = [...topItemsData];
    // 任务视图：显示"其他"图例；分类视图：已显示全部，无需"其他"
    if (isTaskView && allAggregatedData.filter(d => d[valueKey] > 0).length > topN) legendItems.push({ name: '其他' });

    const legendHTML = legendItems
.map((item, index) => {
    let color;
    if (item.name === '其他') {
        color = otherColor;
    } else if (isTaskView) {
        color = colorMap.get(item.name) || otherColor;
    } else {
        color = getCategoryColorSafe(item.name);
    }
    return `<div class="legend-item"> <div class="legend-color-box" style="background-color:${color || '#ccc'};"></div> <div class="legend-label">${item.name}</div> </div>`;
})
.join('');

    const gridGap = daysCount > 10 ? '1px' : '8px';
    const gridStyle = `display: grid; grid-template-columns: repeat(${daysCount}, minmax(0, 1fr)); gap: ${gridGap};`;

    return `<div class="chart-container"><div class="chart-title">${title}</div><div class="trend-chart" style="${gridStyle}">${daysHTML}</div><div class="chart-legend">${legendHTML}</div></div>`;
}

let trendTooltipLongPressTimer = null;
let trendTooltipGlobalListenersBound = false;
// ====== ⭐ CRITICAL: 趋势演变防误触机制 - 修改前请仔细检查 ======
// 1. TREND_SWIPE_THRESHOLD: 滑动阈值(15px)，超过则取消长按
// 2. setPointerCapture: 长按激活后接管指针事件防止滚动
// 3. evt.preventDefault/stopPropagation: 长按状态下阻止默认行为
// 4. pointermove { passive: false, capture: true }: 确保能阻断事件
// 5. trendTooltipLongPressCooldown: 防止pointerup后touchend误触发滑动
// =============================================================
let trendTooltipPointerId = null;
let trendTooltipLongPressActive = false;
let trendTooltipLongPressCooldown = false; // [v5.3.0] 防止touchend误触发滑动
let trendTooltipActiveBar = null;
let trendTooltipMoveHandler = null;
let trendTooltipEndHandler = null;
let trendTooltipStartX = 0;
let trendTooltipStartY = 0;
let trendTooltipAutoOpenTimer = null; // 3秒自动打开详情
const TREND_SWIPE_THRESHOLD = 15; // pixels to cancel long-press and allow swipe

function hideTrendTooltip() {
    const tooltipEl = document.getElementById('trendTooltip');
    if (!tooltipEl) return;
    tooltipEl.classList.remove('show', 'moving');
    const progressBar = tooltipEl.querySelector('.trend-tooltip-progress');
    if (progressBar) {
progressBar.classList.remove('animating');
progressBar.style.width = '0%';
    }
    // 清理节流和RAF
    clearTimeout(trendTooltipContentUpdateTimer);
    clearTimeout(trendTooltipAutoOpenTimer);
    if (trendTooltipRAFId) cancelAnimationFrame(trendTooltipRAFId);
    if (trendTooltipMoveRAFId) cancelAnimationFrame(trendTooltipMoveRAFId);
    trendTooltipLastTarget = null;
    trendTooltipPos = null;
    trendTooltipTargetPos = null;
    tooltipEl.style.minHeight = '';
}

function clearTrendActiveBar() {
    document.querySelectorAll('.trend-day.active').forEach(el => el.classList.remove('active'));
    trendTooltipActiveBar = null;
}

function calcTrendTooltipPosition(target, tooltipEl) {
    const rect = target.getBoundingClientRect();
    const barEl = target.querySelector('.trend-total-bar');
    const barRect = barEl ? barEl.getBoundingClientRect() : rect;
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    // [v7.11.4] 统一定位在实际彩色柱子上方固定距离
    let top = barRect.top - tooltipRect.height - 10;
    if (top < margin) {
top = barRect.bottom + 10;
    }
    return { left, top };
}

function applyTrendTooltipPosition(pos, tooltipEl) {
    tooltipEl.style.left = `${pos.left}px`;
    tooltipEl.style.top = `${pos.top}px`;
}

let trendTooltipPos = null;
let trendTooltipTargetPos = null;
let trendTooltipMoveRAFId = null;

function updateTrendTooltipPosition(target, tooltipEl, immediate = false) {
    // 滑动时直接设置位置，让 CSS transition 处理动画
    const targetPos = calcTrendTooltipPosition(target, tooltipEl);
    trendTooltipPos = { ...targetPos };
    applyTrendTooltipPosition(trendTooltipPos, tooltipEl);
}

// 节流和RAF优化变量
let trendTooltipContentUpdateTimer = null;
let trendTooltipLastTarget = null;
let trendTooltipRAFId = null;

function showTrendTooltip(target, isMoving = false) {
    const tooltipEl = document.getElementById('trendTooltip');
    if (!tooltipEl) return;
    const encoded = target.getAttribute('data-tooltip');
    if (!encoded) return;
    
    const wasShown = tooltipEl.classList.contains('show');
    
    // 如果是滑动切换柱子
    if (isMoving && wasShown) {
tooltipEl.classList.add('moving');
// 锁定高度，减少内容变更导致的跳动
if (!tooltipEl.style.minHeight) {
    tooltipEl.style.minHeight = `${tooltipEl.offsetHeight}px`;
}
// 直接更新位置，CSS transition 处理平滑动画
updateTrendTooltipPosition(target, tooltipEl);

// 内容节流更新（避免闪烁）- 如果目标不同才更新
if (target !== trendTooltipLastTarget) {
    clearTimeout(trendTooltipContentUpdateTimer);
    trendTooltipContentUpdateTimer = setTimeout(() => {
        const contentEl = tooltipEl.querySelector('.trend-tooltip-content');
        if (contentEl) {
            contentEl.classList.add('updating');
            setTimeout(() => {
                contentEl.innerHTML = decodeURIComponent(encoded);
                contentEl.classList.remove('updating');
            }, 40);
        } else {
            tooltipEl.innerHTML = `<div class="trend-tooltip-content">${decodeURIComponent(encoded)}</div>`;
        }
        if (trendTooltipLongPressActive) startTrendAutoOpenTimer(target);
        setTimeout(() => { tooltipEl.style.minHeight = ''; }, 150);
    }, 60);
}
trendTooltipLastTarget = target;
    } else {
// 首次显示：先计算位置，再显示弹窗
tooltipEl.classList.remove('moving', 'show');
tooltipEl.style.minHeight = '';
// 先设置内容（隐藏状态下）
tooltipEl.innerHTML = `<div class="trend-tooltip-content">${decodeURIComponent(encoded)}</div>`;
// 强制布局计算，确保尺寸正确
void tooltipEl.offsetHeight;
// 先设置正确位置（仍然隐藏）
updateTrendTooltipPosition(target, tooltipEl);
// 再触发弹出动画
requestAnimationFrame(() => {
    tooltipEl.classList.add('show');
    if (trendTooltipLongPressActive) startTrendAutoOpenTimer(target);
});
trendTooltipLastTarget = target;
    }
}

function startTrendAutoOpenTimer(target) {
    clearTimeout(trendTooltipAutoOpenTimer);
    const tooltipEl = document.getElementById('trendTooltip');
    const progressBar = tooltipEl ? tooltipEl.querySelector('.trend-tooltip-progress') : null;
    if (progressBar) {
progressBar.classList.remove('animating');
progressBar.style.width = '0%';
requestAnimationFrame(() => {
    progressBar.style.width = '';
    progressBar.classList.add('animating');
});
    }
    trendTooltipAutoOpenTimer = setTimeout(() => {
if (trendTooltipLongPressActive && target) {
    const date = target.getAttribute('data-date');
    if (date) {
        if (typeof Android !== 'undefined' && Android.vibrate) {
            Android.vibrate(20);
        } else if (navigator.vibrate) {
            navigator.vibrate(20);
        }
        hideTrendTooltip();
        clearTrendActiveBar();
        trendTooltipLongPressActive = false;
        if (typeof showDayDetailsWithAnimation === 'function') {
            showDayDetailsWithAnimation(date);
        } else {
            showDayDetails(date);
        }
    }
}
    }, 3250);
}

function bindTrendTooltipGlobalListeners() {
    if (trendTooltipGlobalListenersBound) return;
    window.addEventListener('scroll', hideTrendTooltip, true);
    window.addEventListener('resize', hideTrendTooltip);
    trendTooltipGlobalListenersBound = true;
}

function initTrendTooltips() {
    const tooltipEl = document.getElementById('trendTooltip');
    if (!tooltipEl) return;
    hideTrendTooltip();
    bindTrendTooltipGlobalListeners();

    const bars = document.querySelectorAll('.trend-day[data-tooltip]');
    bars.forEach(bar => {
const showHandler = () => {
    if (trendTooltipLongPressActive) return;
    clearTrendActiveBar();
    // [v7.2.4] 鼠标悬停时添加高亮效果
    bar.classList.add('active');
    trendTooltipActiveBar = bar;
    showTrendTooltip(bar);
};
const hideHandler = () => {
    if (trendTooltipLongPressActive) return;
    hideTrendTooltip();
    clearTrendActiveBar();
};

bar.addEventListener('mouseenter', showHandler);
bar.addEventListener('mouseleave', hideHandler);
bar.addEventListener('focus', showHandler);
bar.addEventListener('blur', hideHandler);
bar.addEventListener('click', (e) => {
    if (trendTooltipLongPressActive || trendTooltipLongPressCooldown) {
        e.stopPropagation();
        return;
    }
    const date = bar.getAttribute('data-date');
    if (date) {
        if (typeof showDayDetailsWithAnimation === 'function') {
            showDayDetailsWithAnimation(date);
        } else {
            showDayDetails(date);
        }
    }
});
bar.addEventListener('pointerdown', e => {
    // [v7.18.4] 演示期间用户交互检测 - 交互开始时停止演示（标记为用户取消）
    if (trendTooltipSlideDemoActive && reportOnboardingActive) {
        stopTrendTooltipDemoByUser();
    }
    if (e.pointerType === 'mouse') return; // 长按仅针对触控/触笔
    clearTimeout(trendTooltipLongPressTimer);
    clearTimeout(trendTooltipAutoOpenTimer);
    trendTooltipPointerId = e.pointerId;
    trendTooltipLongPressActive = false;
    trendTooltipActiveBar = bar;
    trendTooltipStartX = e.clientX;
    trendTooltipStartY = e.clientY;

    const moveHandler = evt => {
        if (evt.pointerId !== trendTooltipPointerId) return;

        // 长按已激活：处理柱子切换
        if (trendTooltipLongPressActive) {
            evt.preventDefault();
            evt.stopPropagation();
            const target = document.elementFromPoint(evt.clientX, evt.clientY);
            const newBar = target ? target.closest('.trend-day[data-tooltip]') : null;
            if (newBar && newBar !== trendTooltipActiveBar) {
                trendTooltipActiveBar = newBar;
                clearTrendActiveBar();
                newBar.classList.add('active');
                showTrendTooltip(newBar, true); // isMoving=true 实现流畅位置过渡
                startTrendAutoOpenTimer(newBar);
            }
        } else {
            // 长按未激活：检测是否为滑动意图
            const dx = Math.abs(evt.clientX - trendTooltipStartX);
            const dy = Math.abs(evt.clientY - trendTooltipStartY);
            if (dx > TREND_SWIPE_THRESHOLD || dy > TREND_SWIPE_THRESHOLD) {
                // 用户意图是滑动，取消长按
                clearTimeout(trendTooltipLongPressTimer);
                trendTooltipPointerId = null;
                trendTooltipActiveBar = null;
                window.removeEventListener('pointermove', trendTooltipMoveHandler, true);
                window.removeEventListener('pointerup', trendTooltipEndHandler, true);
                window.removeEventListener('pointercancel', trendTooltipEndHandler, true);
                trendTooltipMoveHandler = null;
                trendTooltipEndHandler = null;
            }
        }
    };

    const endHandler = evt => {
        if (trendTooltipPointerId !== null && evt.pointerId !== trendTooltipPointerId) return;
        clearTimeout(trendTooltipLongPressTimer);
        // [v5.3.0] 设置 cooldown 防止 touchend 误触发滑动切换
        const wasLongPressActive = trendTooltipLongPressActive;
        if (wasLongPressActive) {
            trendTooltipLongPressCooldown = true;
            setTimeout(() => { trendTooltipLongPressCooldown = false; }, 100);
        }
        if (trendTooltipLongPressActive && trendTooltipActiveBar) {
            // 释放 pointer capture
            try { trendTooltipActiveBar.releasePointerCapture(evt.pointerId); } catch(e) {}
        }
        trendTooltipPointerId = null;
        trendTooltipLongPressActive = false;
        trendTooltipActiveBar = null;
        hideTrendTooltip();
        clearTrendActiveBar();
        window.removeEventListener('pointermove', trendTooltipMoveHandler, true);
        window.removeEventListener('pointerup', trendTooltipEndHandler, true);
        window.removeEventListener('pointercancel', trendTooltipEndHandler, true);
        trendTooltipMoveHandler = null;
        trendTooltipEndHandler = null;
        // [v7.18.4] 用户交互结束后，如果演示被取消则进入下一步
        if (trendTooltipDemoCancelledByUser && reportOnboardingActive) {
            trendTooltipDemoCancelledByUser = false;
            setTimeout(() => nextReportOnboardingStep(), 300);
        }
    };

    trendTooltipMoveHandler = moveHandler;
    trendTooltipEndHandler = endHandler;
    window.addEventListener('pointermove', trendTooltipMoveHandler, { passive: false, capture: true });
    window.addEventListener('pointerup', trendTooltipEndHandler, true);
    window.addEventListener('pointercancel', trendTooltipEndHandler, true);

    trendTooltipLongPressTimer = setTimeout(() => {
        trendTooltipLongPressActive = true;
        // 使用 setPointerCapture 接管所有指针事件，防止页面滚动
        try { bar.setPointerCapture(trendTooltipPointerId); } catch(e) {}
        clearTrendActiveBar();
        bar.classList.add('active');
        showTrendTooltip(bar);
        startTrendAutoOpenTimer(bar);
    }, 250);
});
    });
}

// ========== 活动日历 Tooltip 交互 ==========
// ====== ⭐ CRITICAL: 活动日历防误触机制 - 修改前请仔细检查 ======
// 1. HEATMAP_SWIPE_THRESHOLD: 滑动阈值(10px)，超过则取消长按
// 2. setPointerCapture: 长按激活后接管指针事件防止滚动
// 3. setTimeout延迟清除长按状态: 确保touchend处理时状态仍为true
// 4. evt.preventDefault/stopPropagation/stopImmediatePropagation: 全面阻断
// 5. pointermove { passive: false, capture: true }: 确保能阻断事件
// =============================================================
let heatmapTooltipLongPressTimer = null;
let heatmapTooltipAutoOpenTimer = null; // 3秒自动打开详情
let heatmapTooltipPointerId = null;
let heatmapTooltipLongPressActive = false;
let heatmapTooltipActiveCell = null;
let heatmapTooltipMoveHandler = null;
let heatmapTooltipEndHandler = null;
let heatmapTooltipStartX = 0;
let heatmapTooltipStartY = 0;
let heatmapTooltipContentUpdateTimer = null;
let heatmapTooltipLastTarget = null;
let heatmapTooltipRAFId = null;
let heatmapTouchInteractionActive = false; // 触摸交互进行中，阻止mouseenter
const HEATMAP_SWIPE_THRESHOLD = 10; // 日历格子较小，阈值更低

// [v7.11.0] 引导演示：禁用自动打开详情
let onboardingHeatmapSuppressAutoOpen = false;
let onboardingHeatmapPreviewTimer = null;
let onboardingHeatmapPreviewActive = false;

function stopHeatmapOnboardingPreview() {
    onboardingHeatmapPreviewActive = false;
    onboardingHeatmapSuppressAutoOpen = false;
    if (onboardingHeatmapPreviewTimer) {
clearTimeout(onboardingHeatmapPreviewTimer);
onboardingHeatmapPreviewTimer = null;
    }
    heatmapTouchInteractionActive = false;
    heatmapTooltipLongPressActive = false;
    hideHeatmapTooltip();
    clearHeatmapActiveCell();
}

function startHeatmapOnboardingPreview({ move = false, startFromSecondRow = false, speedMultiplier = 1 } = {}) {
    stopHeatmapOnboardingPreview();
    onboardingHeatmapPreviewActive = true;
    onboardingHeatmapSuppressAutoOpen = true;

    const cells = Array.from(document.querySelectorAll('.heatmap-day[data-tooltip]'));
    if (cells.length === 0) return;
    
    // [v7.11.0] 支持从第二行开始
    let startIndex = Math.floor(cells.length / 2);
    if (startFromSecondRow && cells.length > 7) {
// 假设每行7个格子，从第8个开始（第二行第一个）
startIndex = 7;
    }
    let index = startIndex;

    const showAt = (cell, isMoving) => {
heatmapTouchInteractionActive = true;
heatmapTooltipLongPressActive = true;
setHeatmapActiveCell(cell);
showHeatmapTooltip(cell, !!isMoving);
    };

    // [v7.11.0] 支持速度倍率（speedMultiplier > 1 表示加快）
    const baseInterval = move ? 720 : 1200;
    const interval = Math.round(baseInterval / speedMultiplier);
    
    const loop = () => {
if (!onboardingHeatmapPreviewActive) return;
const cell = cells[index];
showAt(cell, move);
if (move) {
    index = (index + 1) % cells.length;
}
onboardingHeatmapPreviewTimer = setTimeout(loop, interval);
    };

    loop();
}

function hideHeatmapTooltip() {
    const tooltipEl = document.getElementById('heatmapTooltip');
    if (!tooltipEl) return;
    
    // [v5.8.0] 如果tooltip正在显示，创建影子元素播放退出动画
    if (tooltipEl.classList.contains('show')) {
const shadow = tooltipEl.cloneNode(true);
shadow.id = '';
shadow.classList.remove('show', 'flipping');
shadow.classList.add('heatmap-tooltip-shadow');
// 移除进度条，避免干扰
const progressBar = shadow.querySelector('.heatmap-tooltip-progress');
if (progressBar) progressBar.remove();
document.body.appendChild(shadow);
// 动画结束后移除影子
shadow.addEventListener('animationend', () => shadow.remove(), { once: true });
    }
    
    tooltipEl.classList.remove('show', 'flipping');
    // 停止进度条动画并重置样式
    const progressBar = tooltipEl.querySelector('.heatmap-tooltip-progress');
    if (progressBar) {
progressBar.classList.remove('animating');
progressBar.style.display = ''; // 重置 display 样式
progressBar.style.width = '0%';
    }
    clearTimeout(heatmapTooltipContentUpdateTimer);
    clearTimeout(heatmapTooltipAutoOpenTimer);
    if (heatmapTooltipRAFId) cancelAnimationFrame(heatmapTooltipRAFId);
    heatmapTooltipLastTarget = null;
}

function clearHeatmapActiveCell() {
    document.querySelectorAll('.heatmap-day.active').forEach(el => el.classList.remove('active'));
    heatmapTooltipActiveCell = null;
}

// 集中管理日历格子的 active 切换，避免遗漏清理
function setHeatmapActiveCell(cell) {
    clearHeatmapActiveCell();
    if (cell) {
heatmapTooltipActiveCell = cell;
cell.classList.add('active');
    }
}

function positionHeatmapTooltip(target, tooltipEl) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));
    let top = rect.top - tooltipRect.height - 10;
    if (top < margin) {
top = rect.bottom + 10;
    }
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
}

function showHeatmapTooltip(target, isMoving = false) {
    const tooltipEl = document.getElementById('heatmapTooltip');
    if (!tooltipEl) return;
    const encoded = target.getAttribute('data-tooltip');
    if (!encoded) return;
    
    const wasShown = tooltipEl.classList.contains('show');
    
    if (isMoving && wasShown) {
// [v5.8.0] 波浪翻页效果：旧位置播放退出动画，新位置播放进入动画
if (target !== heatmapTooltipLastTarget) {
    // 创建影子元素在旧位置播放退出动画
    const shadow = tooltipEl.cloneNode(true);
    shadow.id = '';
    shadow.classList.remove('show', 'flipping');
    shadow.classList.add('heatmap-tooltip-shadow');
    // 移除进度条，避免干扰
    const progressBar = shadow.querySelector('.heatmap-tooltip-progress');
    if (progressBar) progressBar.remove();
    document.body.appendChild(shadow);
    // 动画结束后移除影子
    shadow.addEventListener('animationend', () => shadow.remove(), { once: true });
    
    // 将原 tooltip 移动到新位置并更新内容
    tooltipEl.innerHTML = decodeURIComponent(encoded);
    positionHeatmapTooltip(target, tooltipEl);
    
    // 触发翻页进入动画
    tooltipEl.classList.remove('flipping');
    void tooltipEl.offsetWidth;
    tooltipEl.classList.add('flipping');
    
    // 重置进度条
    startHeatmapAutoOpenTimer(target);
}
heatmapTooltipLastTarget = target;
    } else {
// [v5.8.0] 首次显示也播放翻页动画
tooltipEl.classList.remove('flipping');
tooltipEl.innerHTML = decodeURIComponent(encoded);
// 先使弹窗可测量但不可见，定位后再显示
tooltipEl.style.visibility = 'hidden';
tooltipEl.style.display = 'block';
positionHeatmapTooltip(target, tooltipEl);
tooltipEl.style.visibility = '';
tooltipEl.style.display = '';
tooltipEl.classList.add('show');
// 触发翻页进入动画
void tooltipEl.offsetWidth;
tooltipEl.classList.add('flipping');
heatmapTooltipLastTarget = target;
// 启动3秒自动打开定时器
startHeatmapAutoOpenTimer(target);
    }
}

// 启动3秒自动打开详情的定时器和进度条
function startHeatmapAutoOpenTimer(target) {
    if (onboardingHeatmapSuppressAutoOpen) {
const tooltipEl = document.getElementById('heatmapTooltip');
const progressBar = tooltipEl ? tooltipEl.querySelector('.heatmap-tooltip-progress') : null;
if (progressBar) progressBar.style.display = 'none';
return;
    }
    clearTimeout(heatmapTooltipAutoOpenTimer);
    const tooltipEl = document.getElementById('heatmapTooltip');
    const progressBar = tooltipEl ? tooltipEl.querySelector('.heatmap-tooltip-progress') : null;
    
    if (progressBar) {
// 重置进度条：先移除动画类和内联样式，然后用 RAF 添加动画类
progressBar.classList.remove('animating');
progressBar.style.width = '0%';
progressBar.style.display = ''; // 确保可见
requestAnimationFrame(() => {
    progressBar.style.width = ''; // 清除内联样式，让 CSS 类生效
    progressBar.classList.add('animating');
});
    }
    
    // 3秒后自动打开详情（250ms激活 + 2750ms = 3秒总计）
    heatmapTooltipAutoOpenTimer = setTimeout(() => {
if (heatmapTooltipLongPressActive && target) {
    const date = target.getAttribute('data-date');
    if (date) {
        // [v5.8.0] 进入详情页震动反馈
        if (typeof Android !== 'undefined' && Android.vibrate) {
            Android.vibrate(20);
        } else if (navigator.vibrate) {
            navigator.vibrate(20);
        }
        hideHeatmapTooltip();
        clearHeatmapActiveCell();
        heatmapTooltipLongPressActive = false;
        showDayDetailsWithAnimation(date);
    }
}
    }, 3250);
}

// [v7.4.1] 热力图日期格子点击处理 - 直接通过onclick属性调用，绕过复杂的触摸事件逻辑
function handleHeatmapDayClick(e, dateStr) {
    // 如果长按已激活（正在显示tooltip），不处理点击
    if (heatmapTooltipLongPressActive) {
e.stopPropagation();
return;
    }
    // 直接打开日期详情
    showDayDetails(dateStr);
}

function initHeatmapTooltips() {
    const tooltipEl = document.getElementById('heatmapTooltip');
    if (!tooltipEl) return;
    // [v5.4.0] 初始化前彻底清理旧状态，防止残留
    clearTimeout(heatmapTooltipLongPressTimer);
    clearTimeout(heatmapTooltipAutoOpenTimer);
    if (heatmapTooltipMoveHandler) {
window.removeEventListener('pointermove', heatmapTooltipMoveHandler, true);
    }
    if (heatmapTooltipEndHandler) {
window.removeEventListener('pointerup', heatmapTooltipEndHandler, true);
window.removeEventListener('pointercancel', heatmapTooltipEndHandler, true);
    }
    heatmapTooltipMoveHandler = null;
    heatmapTooltipEndHandler = null;
    heatmapTooltipPointerId = null;
    heatmapTooltipLongPressActive = false;
    heatmapTouchInteractionActive = false;
    clearHeatmapActiveCell();
    hideHeatmapTooltip();

    const cells = document.querySelectorAll('.heatmap-day[data-tooltip]');
    cells.forEach(cell => {
// 桌面端：hover显示tooltip（桌面端不启动自动打开计时器）
cell.addEventListener('mouseenter', () => {
    if (heatmapTooltipLongPressActive || heatmapTouchInteractionActive) return;
    clearHeatmapActiveCell();
    // 桌面端hover时清除自动打开计时器
    clearTimeout(heatmapTooltipAutoOpenTimer);
    const tooltipEl = document.getElementById('heatmapTooltip');
    tooltipEl.classList.remove('moving');
    const encoded = cell.getAttribute('data-tooltip');
    if (!encoded) return;
    tooltipEl.innerHTML = decodeURIComponent(encoded);
    tooltipEl.classList.add('show');
    positionHeatmapTooltip(cell, tooltipEl);
    // 桌面端不显示进度条
    const progressBar = tooltipEl.querySelector('.heatmap-tooltip-progress');
    if (progressBar) progressBar.style.display = 'none';
});
cell.addEventListener('mouseleave', () => {
    if (heatmapTooltipLongPressActive) return;
    hideHeatmapTooltip();
    clearHeatmapActiveCell();
});
// 桌面端点击直接打开详情
cell.addEventListener('click', (e) => {
    if (heatmapTooltipLongPressActive) return;
    const date = cell.getAttribute('data-date');
    if (date) showDayDetails(date);
});

// 移动端：长按拖动
cell.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    // [v5.4.0] 新的 pointerdown 开始前，先清理之前可能残留的状态
    clearTimeout(heatmapTooltipLongPressTimer);
    clearTimeout(heatmapTooltipAutoOpenTimer);
    if (heatmapTooltipMoveHandler) {
        window.removeEventListener('pointermove', heatmapTooltipMoveHandler, true);
    }
    if (heatmapTooltipEndHandler) {
        window.removeEventListener('pointerup', heatmapTooltipEndHandler, true);
        window.removeEventListener('pointercancel', heatmapTooltipEndHandler, true);
    }
    clearHeatmapActiveCell();
    hideHeatmapTooltip();
    
    heatmapTouchInteractionActive = true;
    heatmapTooltipPointerId = e.pointerId;
    heatmapTooltipLongPressActive = false;
    heatmapTooltipStartX = e.clientX;
    heatmapTooltipStartY = e.clientY;

    const moveHandler = evt => {
        if (evt.pointerId !== heatmapTooltipPointerId) return;

        if (heatmapTooltipLongPressActive) {
            evt.preventDefault();
            evt.stopPropagation();
            const target = document.elementFromPoint(evt.clientX, evt.clientY);
            const newCell = target ? target.closest('.heatmap-day[data-tooltip]') : null;
            if (newCell && newCell !== heatmapTooltipActiveCell) {
                // [v5.8.0] 切换日期时震动反馈
                if (typeof Android !== 'undefined' && Android.vibrate) {
                    Android.vibrate(10);
                } else if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
                // [v5.4.0] 统一通过 setHeatmapActiveCell 切换状态，防止遗留
                setHeatmapActiveCell(newCell);
                showHeatmapTooltip(newCell, true);
            } else if (!newCell && heatmapTooltipActiveCell) {
                // [v5.4.0] 移出日历区域时清除 active 状态并隐藏 tooltip
                clearTimeout(heatmapTooltipAutoOpenTimer);
                clearHeatmapActiveCell();
                hideHeatmapTooltip();
            }
        } else {
            const dx = Math.abs(evt.clientX - heatmapTooltipStartX);
            const dy = Math.abs(evt.clientY - heatmapTooltipStartY);
            if (dx > HEATMAP_SWIPE_THRESHOLD || dy > HEATMAP_SWIPE_THRESHOLD) {
                clearTimeout(heatmapTooltipLongPressTimer);
                clearTimeout(heatmapTooltipAutoOpenTimer);
                heatmapTooltipPointerId = null;
                heatmapTooltipLongPressActive = false;
                // [v5.4.0] 确保清除所有可能的 active 状态
                clearHeatmapActiveCell();
                hideHeatmapTooltip();
                setTimeout(() => { heatmapTouchInteractionActive = false; }, 100);
                window.removeEventListener('pointermove', heatmapTooltipMoveHandler, true);
                window.removeEventListener('pointerup', heatmapTooltipEndHandler, true);
                window.removeEventListener('pointercancel', heatmapTooltipEndHandler, true);
                heatmapTooltipMoveHandler = null;
                heatmapTooltipEndHandler = null;
            }
        }
    };

    // [v7.4.0] 移动端点击处理 - 使用 touchend 直接检测
    cell.addEventListener('touchend', touchEvt => {
        // 如果长按已激活，不处理（由 endHandler 处理）
        if (heatmapTooltipLongPressActive) return;
        // 如果事件监听器已被移除（滑动取消），也要检测点击
        const touchDuration = Date.now() - (touchEvt.timeStamp - (touchEvt.timeStamp % 1000) > 0 ? touchEvt.timeStamp : 0);
        const touch = touchEvt.changedTouches[0];
        if (touch) {
            const dx = Math.abs(touch.clientX - heatmapTooltipStartX);
            const dy = Math.abs(touch.clientY - heatmapTooltipStartY);
            // 如果移动距离小且时间短，视为点击
            if (dx < 30 && dy < 30) {
                const date = cell.getAttribute('data-date');
                if (date) {
                    setTimeout(() => showDayDetails(date), 10);
                }
            }
        }
    }, { passive: true });

    const endHandler = evt => {
        const pointerMatches = heatmapTooltipPointerId === null || evt.pointerId === heatmapTooltipPointerId;
        // 如果出现指针ID异常但长按仍为激活状态，也要强制清理，避免残留 active
        if (!pointerMatches && !heatmapTooltipLongPressActive) return;
        clearTimeout(heatmapTooltipLongPressTimer);
        clearTimeout(heatmapTooltipAutoOpenTimer);
        const wasLongPressActive = heatmapTooltipLongPressActive;
        
        // [v7.9.8] 长按取消时不进入详情，只关闭tooltip
        // 自动进入详情由 heatmapTooltipAutoOpenTimer 定时器控制
        // 短按进入详情由 click 事件处理
        
        if (wasLongPressActive) {
            // 阻止事件传播，防止触发页面滑动和click事件
            evt.preventDefault();
            evt.stopPropagation();
            evt.stopImmediatePropagation();
        }
        heatmapTooltipPointerId = null;
        // [v5.0.0] 延迟清除长按状态，确保后续事件处理时状态仍为 true
        if (wasLongPressActive) {
            setTimeout(() => { heatmapTooltipLongPressActive = false; }, 50);
        } else {
            heatmapTooltipLongPressActive = false;
        }
        // 延迟清除触摸交互标志，防止mouseenter在pointerup后立即触发
        setTimeout(() => { heatmapTouchInteractionActive = false; }, 100);
        heatmapTooltipActiveCell = null;
        hideHeatmapTooltip();
        clearHeatmapActiveCell();
        window.removeEventListener('pointermove', heatmapTooltipMoveHandler, true);
        window.removeEventListener('pointerup', heatmapTooltipEndHandler, true);
        window.removeEventListener('pointercancel', heatmapTooltipEndHandler, true);
        heatmapTooltipMoveHandler = null;
        heatmapTooltipEndHandler = null;
    };

    heatmapTooltipMoveHandler = moveHandler;
    heatmapTooltipEndHandler = endHandler;
    window.addEventListener('pointermove', heatmapTooltipMoveHandler, { passive: false, capture: true });
    window.addEventListener('pointerup', heatmapTooltipEndHandler, true);
    window.addEventListener('pointercancel', heatmapTooltipEndHandler, true);

    heatmapTooltipLongPressTimer = setTimeout(() => {
        heatmapTooltipLongPressActive = true;
        // [v5.8.0] 长按激活震动反馈
        if (typeof Android !== 'undefined' && Android.vibrate) {
            Android.vibrate(15);
        } else if (navigator.vibrate) {
            navigator.vibrate(15);
        }
        // [v5.4.0] 不再使用 setPointerCapture，因为它会影响 elementFromPoint 的结果
        // 导致移动时无法正确检测到新的日期格子
        setHeatmapActiveCell(cell);
        showHeatmapTooltip(cell);
    }, 250);
});
    });
}

function setupSwiper(containerId, paginationId, onSlideChangeCallback) {
    const container = document.getElementById(containerId); if (!container) return;
    const wrapper = container.querySelector('.swiper-wrapper'); if (!wrapper) return; 
    const totalSlides = wrapper.children.length; if (totalSlides === 0) return;

    let paginationEl = null; let paginationBullets = [];
    if (paginationId) {
        paginationEl = document.getElementById(paginationId);
        if (paginationEl) {
            paginationEl.innerHTML = ''; 
            for (let i = 0; i < totalSlides; i++) {
                const bullet = document.createElement('span');
                bullet.className = 'swiper-pagination-bullet';
                bullet.onclick = () => goToSlide(i);
                paginationEl.appendChild(bullet);
                paginationBullets.push(bullet);
            }
        }
    }

    let initialIndex = (containerId === 'pieSwiperContainer') ? (reportState.insightSubViewIndex || 0) : 0;
    let currentIndex = -1; 
    const slideWidthPercentage = 100 / totalSlides;
    
    function updatePagination() {
        if (!paginationEl) return;
        paginationBullets.forEach((bullet, index) => {
            bullet.classList.toggle('swiper-pagination-bullet-active', index === currentIndex);
        });
    }

    function goToSlide(index, isInitialization = false) { // [v4.5.4] 修复: 增加标志
        if (index < 0 || index >= totalSlides || index === currentIndex) return; 
        wrapper.style.transform = `translateX(-${index * slideWidthPercentage}%)`; 
        currentIndex = index; 
        updatePagination();
        if (containerId === 'trendSwiperContainer') hideTrendTooltip();
        // [v4.5.4] 修复: 只有在非初始化时才触发回调，防止死循环
        if (!isInitialization && onSlideChangeCallback) {
            onSlideChangeCallback(index);
        }
    }
    
    wrapper.style.transition = 'none'; 
    goToSlide(initialIndex, true); // [v4.5.4] 修复: 传入 true
    setTimeout(() => { wrapper.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)'; }, 50);

    let touchstartX = 0; let touchstartY = 0; 
    container.addEventListener('touchstart', e => {
        if ((containerId === 'trendSwiperContainer' && (trendTooltipLongPressActive || trendTooltipLongPressCooldown)) || (containerId === 'pieSwiperContainer' && (pieTooltipLongPressActive || pieTooltipLongPressCooldown))) return;
        touchstartX = e.changedTouches[0].screenX; touchstartY = e.changedTouches[0].screenY;
    }, { passive: true });
    container.addEventListener('touchend', e => {
        if ((containerId === 'trendSwiperContainer' && (trendTooltipLongPressActive || trendTooltipLongPressCooldown)) || (containerId === 'pieSwiperContainer' && (pieTooltipLongPressActive || pieTooltipLongPressCooldown))) return;
        const touchendX = e.changedTouches[0].screenX; const touchendY = e.changedTouches[0].screenY; const deltaX = touchendX - touchstartX; const deltaY = touchendY - touchstartY; const absDeltaX = Math.abs(deltaX); const absDeltaY = Math.abs(deltaY); const swipeThreshold = 50; if (absDeltaX > swipeThreshold && absDeltaX > absDeltaY) { if (deltaX < 0 && currentIndex < totalSlides - 1) { goToSlide(currentIndex + 1); } else if (deltaX > 0 && currentIndex > 0) { goToSlide(currentIndex - 1); } } touchstartX = 0; touchstartY = 0; });
}

function updateDetailedDataTable() { const container = document.getElementById('tableContainerWrapper'); const isTaskView = reportState.tableView === 'task'; const filtersHTML = `<div class="analysis-filters"> <div> <div class="analysis-view-switcher report-filters"> <button class="${reportState.tableView === 'category' ? 'active' : ''}" onclick="setTableView('category')">分类</button> <button class="${isTaskView ? 'active' : ''}" onclick="setTableView('task')">任务</button> </div> </div> <div class="report-filters"> <button class="${reportState.tablePeriod === '7d' ? 'active' : ''}" onclick="setTablePeriod('7d')">7天内</button> <button class="${reportState.tablePeriod === '30d' ? 'active' : ''}" onclick="setTablePeriod('30d')">30天内</button> <button class="${reportState.tablePeriod === 'all' ? 'active' : ''}" onclick="setTablePeriod('all')">全部</button> </div> </div>`; const tableHTML = `<div class="analysis-table-container"> <table class="analysis-table${isTaskView ? ' task-view' : ''}" id="analysisTable"> <thead></thead> <tbody></tbody> <tfoot></tfoot> </table> </div>`; container.innerHTML = filtersHTML + tableHTML; const filteredTransactions = getFilteredTransactions(reportState.tablePeriod); const { aggregatedData } = processDashboardData(filteredTransactions, reportState.tableView); aggregatedData.forEach(row => { row.avgTime = row.count > 0 ? (row.earned + row.spent) / row.count : 0; }); renderDetailedDataTable(aggregatedData); }
function setTableSort(key) { const currentSort = reportState.tableSortKey; if (key === 'amount') { if (currentSort === 'amount_desc') reportState.tableSortKey = 'amount_asc'; else if (currentSort === 'amount_asc') reportState.tableSortKey = 'amount_abs_desc'; else reportState.tableSortKey = 'amount_desc'; } else if (key === 'count') { if (currentSort === 'count_desc') reportState.tableSortKey = 'count_asc'; else reportState.tableSortKey = 'count_desc'; } else if (key === 'avg_time') { if (currentSort === 'avg_time_desc') reportState.tableSortKey = 'avg_time_asc'; else reportState.tableSortKey = 'avg_time_desc'; } updateDetailedDataTable(); }

function renderDetailedDataTable(data) {
    const table = document.getElementById('analysisTable'); const thead = table.querySelector('thead'); const tbody = table.querySelector('tbody'); const tfoot = table.querySelector('tfoot');
    const sortKey = reportState.tableSortKey; const sortedData = [...data].sort((a, b) => { switch (sortKey) { case 'amount_desc': return b.net - a.net; case 'amount_asc': return a.net - b.net; case 'amount_abs_desc': return Math.abs(b.net) - Math.abs(a.net); case 'count_desc': return b.count - a.count; case 'count_asc': return a.count - b.count; case 'avg_time_desc': return b.avgTime - a.avgTime; case 'avg_time_asc': return a.avgTime - b.avgTime; default: return Math.abs(b.net) - Math.abs(a.net); } });
    const defaultVisibleRows = 10;
    const visibleRows = reportState.tableVisibleRows || defaultVisibleRows; const visibleData = sortedData.slice(0, visibleRows);
    const getSortIndicator = (key) => { const placeholder = '<span style="visibility:hidden"> ▼</span>'; const amountPlaceholder = '<span style="visibility:hidden"> |▼|</span>'; if (key === 'amount') { if (sortKey === 'amount_desc') return ' ▼'; if (sortKey === 'amount_asc') return ' ▲'; if (sortKey === 'amount_abs_desc') return ' |▼|'; return amountPlaceholder; } if (key === 'count') { if (sortKey === 'count_desc') return ' ▼'; if (sortKey === 'count_asc') return ' ▲'; return placeholder; } if (key === 'avg_time') { if (sortKey === 'avg_time_desc') return ' ▼'; if (sortKey === 'avg_time_asc') return ' ▲'; return placeholder; } return ''; };
    const isTaskView = reportState.tableView === 'task'; const headers = isTaskView ? { name: '任务', amount: '时间', avg_time: '平均', count: '次' } : { name: '分类', amount: '时间', count: '次' };
    const headerKeys = Object.keys(headers); thead.innerHTML = `<tr>${headerKeys.map(key => { const sortable = (key === 'amount' || key === 'count' || (isTaskView && key === 'avg_time')); const onClick = sortable ? `onclick="setTableSort('${key}')"` : ''; return `<th ${onClick} style="${sortable ? 'cursor: pointer;' : ''}">${headers[key]}${getSortIndicator(key)}</th>`; }).join('')}</tr>`;
    tbody.innerHTML = visibleData.length > 0 ? visibleData.map(row => { let amountText, amountClass; if (row.earned > 0 && row.spent > 0) { amountText = `<span class="text-positive">+${formatTimeHoursDecimal(row.earned)}</span><br><span class="text-negative">-${formatTimeHoursDecimal(row.spent)}</span>`; } else if (row.earned > 0) { amountText = `+${formatTimeHoursDecimal(row.earned)}`; amountClass = 'text-positive'; } else if (row.spent > 0) { amountText = `-${formatTimeHoursDecimal(row.spent)}`; amountClass = 'text-negative'; } else { amountText = formatTimeHoursDecimal(0); amountClass = 'text-neutral'; } const nameCell = `<td><div class="task-name-scrollable" tabindex="0" title="${row.name}">${row.name}</div></td>`; const amountCell = `<td class="${amountClass || ''}">${amountText}</td>`; const countCell = `<td>${row.count}</td>`; const avgTimeCell = isTaskView ? `<td>${formatTimeHoursDecimal(row.avgTime)}</td>` : ''; if (isTaskView) return `<tr>${nameCell}${amountCell}${avgTimeCell}${countCell}</tr>`; else { const categoryNameCell = `<td>${row.name}</td>`; return `<tr>${categoryNameCell}${amountCell}${countCell}</tr>`; } }).join('') : `<tr><td colspan="${headerKeys.length}" class="empty-message" style="color:var(--text-color);">无匹配数据</td></tr>`;
    tfoot.innerHTML = '';
    if (sortedData.length > visibleRows) {
        const remaining = sortedData.length - visibleRows;
        tfoot.innerHTML = `<tr class="table-footer-row"><td colspan="${headerKeys.length}"><button class="show-more-btn" onclick="showMoreTableRows()">显示更多 (${remaining} 条)</button></td></tr>`;
    } else if (sortedData.length > defaultVisibleRows && visibleRows >= sortedData.length) {
        tfoot.innerHTML = `<tr class="table-footer-row"><td colspan="${headerKeys.length}"><button class="show-more-btn" onclick="collapseTableRows()">收起</button></td></tr>`;
    }
}
function showMoreTableRows() { reportState.tableVisibleRows = (reportState.tableVisibleRows || 10) + 10; updateDetailedDataTable(); }
function collapseTableRows() { reportState.tableVisibleRows = 10; updateDetailedDataTable(); }
function processDashboardData(transactionsToProcess, view) { 
    const dataMap = new Map(); 
    const trendData = {}; 
    const chronoSortedTransactions = [...transactionsToProcess].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); 
    
    // [v5.2.0] 支持系统任务的分类和名称获取
    // [v5.10.0] 修复：系统任务使用 getTransactionCategory 获取自定义分类
    const getItemNameAndCategory = (t) => { 
        // 系统任务特殊处理
        if (t.isSystem) {
            const category = getTransactionCategory(t); // [v5.10.0] 使用统一的分类获取函数
            if (view === 'category') { 
                return { name: category, category: null }; 
            }
            // [v7.16.1] 去除任务名前的表情图标
            const rawName = t.taskName || '系统任务';
            const cleanName = rawName.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, '');
            return { name: cleanName, category: category };
        }
        // 普通任务
        const task = tasks.find(tsk => tsk.id === t.taskId); 
        const resolvedCategory = getTransactionCategory(t);
        if (view === 'category') { 
            return { name: resolvedCategory || '未知', category: null }; 
        } 
        return { name: t.taskName || task?.name || '未知任务', category: resolvedCategory || null }; 
    };
    
    chronoSortedTransactions.forEach(t => { 
        const { name, category } = getItemNameAndCategory(t); 
        if (!name) return; 
        if (!dataMap.has(name)) { 
            dataMap.set(name, { name, category, earned: 0, spent: 0, net: 0, count: 0 }); 
        } 
        const item = dataMap.get(name); 
        
        // [v5.7.0] 修正交易特殊处理：抵消原先的错误记录而非产生反向收支
        const isCorrection = t.autoDetectType === 'correction';
        const isEarn = t.type ? t.type === 'earn' : t.amount > 0; 
        const amount = Math.abs(t.amount); 
        
        if (isCorrection) {
            // 修正交易：type='earn'表示返还（应减少spent），type='spend'表示扣减（应减少earned）
            if (isEarn) {
                // 消耗类多记录返还 → 减少消耗
                item.spent = Math.max(0, item.spent - amount);
                item.net += amount;
            } else {
                // 获得类多记录扣减 → 减少获得
                item.earned = Math.max(0, item.earned - amount);
                item.net -= amount;
            }
            // 修正不增加次数
        } else {
            if (isEarn) { item.earned += amount; item.net += amount; } 
            else { item.spent += amount; item.net -= amount; } 
            item.count++; 
        }
        
        const dateStr = getLocalDateString(t.timestamp); 
        if (!trendData[dateStr]) trendData[dateStr] = { earned: {}, spent: {} }; 
        // 更正交易不应把消费分类计入“获得”趋势：改为抵扣对应方向
        if (isCorrection) {
            if (isEarn) {
                // 返还消费 -> 从消费趋势中扣减
                const prev = trendData[dateStr].spent[name] || 0;
                trendData[dateStr].spent[name] = Math.max(0, prev - amount);
            } else {
                // 扣减获得 -> 从获得趋势中扣减
                const prev = trendData[dateStr].earned[name] || 0;
                trendData[dateStr].earned[name] = Math.max(0, prev - amount);
            }
        } else {
            const trendType = isEarn ? 'earned' : 'spent'; 
            trendData[dateStr][trendType][name] = (trendData[dateStr][trendType][name] || 0) + amount; 
        }
    }); 
    return { aggregatedData: Array.from(dataMap.values()), trendData }; 
}

function loadReportStateLocal() {
    try {
        const saved = localStorage.getItem(REPORT_STATE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            reportState = { ...reportState, ...parsed };
        }
    } catch (e) {
        console.warn('[reportState] local load failed:', e);
    }
}

function saveReportStateLocal() {
    try {
        localStorage.setItem(REPORT_STATE_KEY, JSON.stringify({
            analysisPeriod: reportState.analysisPeriod,
            analysisView: reportState.analysisView,
            trendPeriod: reportState.trendPeriod,
            trendView: reportState.trendView,
            tablePeriod: reportState.tablePeriod,
            tableView: reportState.tableView,
            tableSortKey: reportState.tableSortKey,
            tableVisibleRows: reportState.tableVisibleRows,
            insightView: reportState.insightView,
            insightSubViewIndex: reportState.insightSubViewIndex
        }));
    } catch (e) {
        console.warn('[reportState] local save failed:', e);
    }
}

// --- Report State Changers ---
function setAnalysisPeriod(period) { reportState.analysisPeriod = period; saveReportStateLocal(); saveData(); updateAnalysisDashboard(); }
function setAnalysisView(view) { reportState.analysisView = view; saveReportStateLocal(); saveData(); updateAnalysisDashboard(); }
function setTrendPeriod(period) { reportState.trendPeriod = period; saveReportStateLocal(); saveData(); updateTrendChart(); }
function setTrendView(view) { reportState.trendView = view; saveReportStateLocal(); saveData(); updateTrendChart(); }
function setTablePeriod(period) { reportState.tableVisibleRows = 10; reportState.tablePeriod = period; saveReportStateLocal(); saveData(); updateDetailedDataTable(); }
function setTableView(view) { reportState.tableVisibleRows = 10; reportState.tableView = view; saveReportStateLocal(); saveData(); updateDetailedDataTable(); }

// --- Utilities & Helpers ---
function getLocalDateString(date) { const d = new Date(date); const year = d.getFullYear(); const month = (d.getMonth() + 1).toString().padStart(2, '0'); const day = d.getDate().toString().padStart(2, '0'); return `${year}-${month}-${day}`; }
function getHeatmapColorClass(net) { if (net === 0) return ''; const absNet = Math.abs(net); if (net > 0) { if (absNet < 3600) return 'net-surplus-1'; if (absNet < 10800) return 'net-surplus-2'; return 'net-surplus-3'; } else { if (absNet < 3600) return 'net-deficit-1'; if (absNet < 10800) return 'net-deficit-2'; return 'net-deficit-3'; } }
function escapeHtml(str) { if (str === undefined || str === null) return ''; return String(str).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function generateId() { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') { return crypto.randomUUID(); } return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`; }

// [v4.1.0] New helper function for balance card click
// [v5.8.0] 改为调用时间流图版
function showTodayDetails() {
    const todayStr = getLocalDateString(new Date());
    showDayDetails(todayStr); // [v7.3.4] 默认显示每日详情，可切换到时间流图
}
function updateCategoryRecommendations(taskType) { /* [v7.22.1] 已改为底部抽屉选择器，此函数保留为空兼容调用 */ }
function selectCategory(category) { document.getElementById('taskCategory').value = category; /* [v7.16.1] 自动匹配分类颜色并解除该颜色的禁用 */ const existingColor = categoryColors.get(category); if (existingColor) { currentSelectedColor = existingColor; } renderColorSelectors(existingColor || (currentEditingTask ? categoryColors.get(currentEditingTask.category) : null)); }

// [v7.22.1] 任务分类底部抽屉选择器
function showTaskCategorySelectModal() {
    const modal = document.getElementById('categorySelectModal');
    const title = document.getElementById('categorySelectModalTitle');
    const body = document.getElementById('categorySelectModalBody');
    const content = modal?.querySelector('.bottom-sheet-content');
    if (content) { content.classList.remove('slide-close', 'dragging'); content.style.transform = ''; content.style.transition = ''; }
    initBottomSheetDrag('categorySelectModal', hideCategorySelectModal);
    title.textContent = '选择任务分类';
    const taskType = document.getElementById('taskType').value;
    const isEarnType = ['reward', 'continuous', 'continuous_target'].includes(taskType);
    let relevantCategories;
    if (taskType) {
        const filteredTasks = tasks.filter(t => { const tIsEarn = ['reward', 'continuous', 'continuous_target'].includes(t.type); return isEarnType === tIsEarn; });
        relevantCategories = [...new Set(filteredTasks.map(t => t.category))];
    } else {
        relevantCategories = [...new Set(tasks.map(t => t.category))];
    }
    const currentValue = document.getElementById('taskCategory').value.trim();
    let html = '';
    relevantCategories.forEach(cat => {
        const color = categoryColors.get(cat) || '#888';
        html += `<div class="category-select-item ${currentValue === cat ? 'selected' : ''}" data-value="${cat}" onclick="selectTaskCategoryFromSheet(this)">
            <div class="category-select-color" style="background: ${color};"></div>
            <div class="category-select-name">${cat}</div>
        </div>`;
    });
    if (!html) html = '<div style="padding:16px;text-align:center;color:var(--text-color-light);">暂无已有分类，请直接输入</div>';
    body.innerHTML = html;
    modal.classList.add('show');
}
function selectTaskCategoryFromSheet(el) {
    const cat = el.dataset.value;
    selectCategory(cat);
    hideCategorySelectModal();
}

// [v7.22.1] 备注 textarea 自适应高度
function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}
// [v7.22.1] 键盘弹出时确保输入框可见
function scrollInputIntoView(el) {
    setTimeout(() => {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 300);
}
// [v7.22.1] 初始化备注 textarea 行为
(function initTaskNoteTextarea() {
    document.addEventListener('DOMContentLoaded', () => {
        const noteEl = document.getElementById('taskNote');
        if (!noteEl) return;
        noteEl.addEventListener('input', () => autoResizeTextarea(noteEl));
        noteEl.addEventListener('focus', () => scrollInputIntoView(noteEl));
    });
})();
function formatTime(seconds) { if (seconds === null || isNaN(seconds)) return '0秒'; if (seconds < 0) return '-' + formatTime(-seconds); if (seconds === 0) return '0秒'; seconds = Math.round(seconds); const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = seconds % 60; const parts = []; if (h > 0) parts.push(`${h}小时`); if (m > 0) parts.push(`${m}分`); if (s > 0 && h === 0) parts.push(`${s}秒`); return parts.length > 0 ? parts.join('') : '0秒'; }
// [v7.13.0] 格式化时间（历史记录详情专用）：超过1小时不显示秒，确保统一体验
function formatTimeNoSeconds(seconds) { if (seconds === null || isNaN(seconds)) return '0秒'; if (seconds < 0) return '-' + formatTimeNoSeconds(-seconds); if (seconds === 0) return '0秒'; seconds = Math.round(seconds); const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const parts = []; if (h > 0) parts.push(`${h}小时`); if (m > 0 || (h > 0 && m === 0)) parts.push(`${m}分`); else if (h === 0) parts.push(`${seconds % 60}秒`); return parts.length > 0 ? parts.join('') : '0秒'; }
function formatTimeForPie(seconds) { if (seconds === null || isNaN(seconds)) return '0分'; if (seconds < 0) return '-' + formatTimeForPie(-seconds); const totalMinutes = Math.round(seconds / 60); if (totalMinutes < 1) return '0分'; if (totalMinutes < 60) return `${totalMinutes}分`; const h = Math.floor(totalMinutes / 60); const m = totalMinutes % 60; const parts = []; if (h > 0) parts.push(`${h}小时`); if (m > 0) parts.push(`${m}分`); return parts.join(''); }
function formatTimeHoursDecimal(seconds) { if (seconds === null || isNaN(seconds)) return '0.0小时'; const sign = seconds < 0 ? '-' : ''; const absSeconds = Math.abs(seconds); if (absSeconds === 0) return '0.0小时'; const hours = absSeconds / 3600; return `${sign}${hours.toFixed(1)}小时`; }
// [v7.15.1] 格式化为 x.xh 缩写形式（用于趋势图）
function formatHoursShort(seconds) { if (seconds === null || isNaN(seconds)) return '0h'; const sign = seconds < 0 ? '-' : ''; const absSeconds = Math.abs(seconds); if (absSeconds === 0) return '0h'; const hours = absSeconds / 3600; return `${sign}${hours.toFixed(1)}h`; }
function formatDateTime(timestamp) { const d = new Date(timestamp), n = new Date(); const diff = (new Date(n.toDateString()) - new Date(d.toDateString())) / 86400000; if (diff === 0) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); if (diff === 1) return '昨天 ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); if (diff < 7) return `${diff}天前`; return d.toLocaleDateString('zh-CN'); }

// [v5.10.0] 更新桌面小组件
function updateWidgets() {
    if (typeof Android !== 'undefined' && Android.updateWidgets) {
        try {
            const balance = Math.round(currentBalance || 0);
            const dailyLimit = screenTimeSettings?.dailyLimitMinutes || 120;
            const whitelist = JSON.stringify(screenTimeSettings?.whitelistApps || []);
            console.log('[Widget] Updating widgets: balance=' + balance + ', limit=' + dailyLimit);
            Android.updateWidgets(balance, dailyLimit, whitelist);
        } catch (e) { console.error('Widget update failed:', e); }
    }
}

// --- Settings & Notifications ---
function requestNotificationPermission() { if ('Notification' in window) Notification.requestPermission(); }

// [v4.5.6-Android] 混合开发适配版通知函数
async function showNotification(title, body, type) {
    const isTestNotification = title === '✅ 测试通知';

    // 1. 检查应用内设置开关
    if (!isTestNotification) {
        if (type === 'achievement' && !notificationSettings.achievement) {
            return;
        }
        if (type === 'habitNudge' && !notificationSettings.habitNudgeEnabled) {
            return;
        }
        if (type !== 'reminder' && type !== 'achievement' && type !== 'habitNudge' && !notificationSettings[type]) {
            return; 
        }
    }
    
    // 2. 核心修改：检查是否存在 Android 原生接口
    if (window.Android && window.Android.showNotification) {
        console.log('Calling Android Native Notification');
        // 直接调用 Java 定义的接口
        window.Android.showNotification(title, body);
        return;
    }
    
    // 3. 降级回退：如果是浏览器环境，继续使用 Service Worker
    if (!('Notification' in window) || !('serviceWorker' in navigator) || Notification.permission !== 'granted') {
        return; 
    }
    
    try {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, { body: body, icon: 'icon-192.png' });
    } catch (error) {
        console.error(`Failed to show notification "${title}". Error:`, error);
    }
}

async function sendTestNotification() {
    // [v4.5.6-Android] 核心适配：优先检查是否在安卓 App 中
    if (window.Android && window.Android.showNotification) {
        // 如果是安卓环境，直接发送，跳过后面的 PWA 检查
        console.log('Triggering Android Test Notification');
        // 直接调用之前改好的 showNotification 函数
        showNotification('✅ 测试通知', '如果看到此消息，说明您的通知功能工作正常！', 'achievement');
        showAlert('指令已发送至 Android 系统！\n若未收到通知请授予相关权限。', '测试通知');
        return;
    }

    // === 以下是原本的 PWA 网页版逻辑 (保持不变作为后备) ===
    if (!('Notification' in window) || !('serviceWorker' in navigator)) { showAlert('此浏览器不支持 PWA 通知功能。'); return; }
    if (Notification.permission === 'denied') { showAlert('通知权限已被拒绝。请在您的浏览器或系统设置中为本站重新开启通知权限。'); return; }
    if (Notification.permission === 'default') { const permission = await Notification.requestPermission(); if (permission !== 'granted') { showAlert('您拒绝了通知权限。请在浏览器设置中手动开启。'); return; } }
    try { await showNotification('✅ 测试通知', '如果看到此消息，说明您的通知功能工作正常！', 'achievement'); showAlert('测试通知已成功发送！请检查您的系统通知。', '测试通知'); } catch (error) { showAlert(`发送通知时出错：\n${error.message}\n\n请检查浏览器控制台获取详细信息。`, '错误'); }
}
	// [v4.6.1] 悬浮窗开关逻辑
// [v7.1.7] 通知设置改为纯本地存储，不再同步到云端
function toggleFloatingTimer() {
    notificationSettings.floatingTimer = document.getElementById('floatingTimerToggle').checked;
    saveNotificationSettings();
}
function toggleAchievementNotifications() { 
    notificationSettings.achievement = document.getElementById('achievementNotificationToggle').checked; 
    if (notificationSettings.achievement && Notification.permission === 'default') requestNotificationPermission(); 
    saveNotificationSettings(); 
}
function toggleHabitNudge() { 
    notificationSettings.habitNudgeEnabled = document.getElementById('habitNudgeToggle').checked; 
    if (notificationSettings.habitNudgeEnabled && Notification.permission === 'default') requestNotificationPermission(); 
    saveNotificationSettings(); 
}
function updateHabitNudgeTime() { 
    notificationSettings.habitNudgeTime = document.getElementById('habitNudgeTime').value; 
    saveNotificationSettings(); 
}

// [v4.5.3] FIX: This function now correctly reflects the loaded state
// [v7.1.6] 已删除长时间运行提醒相关 UI 更新
// [v7.11.2] 添加空值检查，防止 DOM 未就绪时异常中断后续初始化
function updateNotificationSettingsUI() { 
    const achievementToggle = document.getElementById('achievementNotificationToggle');
    if (achievementToggle) achievementToggle.checked = notificationSettings.achievement;
    
    const habitNudgeToggle = document.getElementById('habitNudgeToggle');
    if (habitNudgeToggle) habitNudgeToggle.checked = notificationSettings.habitNudgeEnabled;
    
    const habitNudgeTime = document.getElementById('habitNudgeTime');
    if (habitNudgeTime) habitNudgeTime.value = notificationSettings.habitNudgeTime;
    
    // [v4.6.1] Update floating timer toggle
    const floatingToggle = document.getElementById('floatingTimerToggle');
    if (floatingToggle) floatingToggle.checked = notificationSettings.floatingTimer !== false;
    
    updatePermissionStatusUI();
}

function updateStartupBackgroundSettingsUI() {
    const toggle = document.getElementById('bootAutoStartToggle');
    const enabled = !!startupBackgroundSettings.bootAutoStartEnabled;

    if (toggle) toggle.checked = enabled;

    updateSettingsSectionOrder();
}

function toggleBootAutoStart() {
    const toggle = document.getElementById('bootAutoStartToggle');
    startupBackgroundSettings.bootAutoStartEnabled = !!(toggle && toggle.checked);
    saveStartupBackgroundSettings();
    if (startupBackgroundSettings.bootAutoStartEnabled) {
        requestBootAutoStartAccess();
    }
    updateStartupBackgroundSettingsUI();
    updatePermissionStatusUI();
}

function updatePermissionStatusUI() {
    const section = document.getElementById('permissionSection');
    if (!section) return;

    const setStatus = (id, text, color) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = text;
        el.style.color = color || '';
    };

    const setPermissionItemStatus = (key, granted) => {
        const item = section.querySelector(`[data-permission-item][data-permission-key="${key}"]`);
        const pendingList = document.getElementById('permissionPendingList');
        const grantedList = document.getElementById('permissionGrantedList');
        if (!item || !pendingList || !grantedList) return;
        const target = granted ? grantedList : pendingList;
        if (item.parentElement !== target) {
            target.appendChild(item);
        }
    };

    const isAndroid = typeof Android !== 'undefined';

    if (isAndroid && Android.hasUsageStatsPermission) {
        const ok = Android.hasUsageStatsPermission();
        setStatus('usageAccessStatus', ok ? '已授权' : '未授权', ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('usage', ok);
    } else {
        setStatus('usageAccessStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('usage', true);
    }

    if (isAndroid && Android.canDrawOverlays) {
        const ok = Android.canDrawOverlays();
        setStatus('overlayPermissionStatus', ok ? '已授权' : '未授权', ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('overlay', ok);
    } else {
        setStatus('overlayPermissionStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('overlay', true);
    }

    if (isAndroid && Android.hasPostNotificationPermission) {
        const ok = Android.hasPostNotificationPermission();
        setStatus('notificationPermissionStatus', ok ? '已授权' : '未授权', ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('notification', ok);
    } else if ('Notification' in window) {
        const ok = Notification.permission === 'granted';
        const status = Notification.permission === 'default' ? '未询问' : (ok ? '已授权' : '被拒绝');
        setStatus('notificationPermissionStatus', status, ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('notification', ok);
    } else {
        setStatus('notificationPermissionStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('notification', true);
    }

    if (isAndroid && Android.canScheduleExactAlarms) {
        const ok = Android.canScheduleExactAlarms();
        setStatus('exactAlarmStatus', ok ? '已授权' : '未授权', ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('exact-alarm', ok);
    } else {
        setStatus('exactAlarmStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('exact-alarm', true);
    }

    if (isAndroid && Android.isIgnoringBatteryOptimizations) {
        const ok = Android.isIgnoringBatteryOptimizations();
        setStatus('batteryOptStatus', ok ? '已加入白名单' : '未加入', ok ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('battery', ok);
    } else {
        setStatus('batteryOptStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('battery', true);
    }

    // [v7.14.1] 桌面小组件权限检查
    if (isAndroid && Android.canAddWidget) {
        const ok = Android.canAddWidget();
        setStatus('widgetPermissionStatus', ok ? '支持' : '不支持', ok ? 'var(--color-positive)' : 'var(--text-color-light)');
        setPermissionItemStatus('widget', ok);
    } else {
        setStatus('widgetPermissionStatus', '不支持', 'var(--text-color-light)');
        setPermissionItemStatus('widget', true);
    }

    if (isAndroid) {
        const enabled = !!startupBackgroundSettings.bootAutoStartEnabled;
        setStatus('bootAutoStartStatus', enabled ? '已开启' : '未开启', enabled ? 'var(--color-positive)' : 'var(--color-spend)');
        setPermissionItemStatus('startup-background', enabled);
    } else {
        setStatus('bootAutoStartStatus', '不适用', 'var(--text-color-light)');
        setPermissionItemStatus('startup-background', true);
    }

    const grantedSection = document.getElementById('permissionGrantedSection');
    const grantedList = document.getElementById('permissionGrantedList');
    if (grantedSection && grantedList) {
        const hasGranted = grantedList.children.length > 0;
        grantedSection.style.display = hasGranted ? '' : 'none';
    }

    updateSettingsSectionOrder();
}

// [v7.11.3] 设置页模块顺序（权限全授权 + 均衡模式开启时下移）
const settingsSectionOrderState = {
    permission: null,
    balance: null
};

function rememberSettingsSectionPosition(key, element) {
    if (!element || settingsSectionOrderState[key]) return;
    settingsSectionOrderState[key] = {
        parent: element.parentElement,
        next: element.nextElementSibling
    };
}

function restoreSettingsSectionPosition(key, element) {
    const state = settingsSectionOrderState[key];
    if (!element || !state || !state.parent) return;
    state.parent.insertBefore(element, state.next || null);
}

function areAllPermissionsGranted() {
    const pendingList = document.getElementById('permissionPendingList');
    if (!pendingList) return false;
    return pendingList.children.length === 0;
}

function updateSettingsSectionOrder() {
    const permissionSection = document.getElementById('permissionSection');
    const balanceSection = document.getElementById('balanceModeSection');
    const helpSection = document.getElementById('helpSection');
    const aboutSection = document.querySelector('.about-section');
    if (!permissionSection || !balanceSection || !helpSection || !aboutSection) return;

    rememberSettingsSectionPosition('permission', permissionSection);
    rememberSettingsSectionPosition('balance', balanceSection);

    const parent = aboutSection.parentElement;
    if (!parent) return;

    if (areAllPermissionsGranted()) {
        parent.insertBefore(permissionSection, aboutSection);
        if (balanceMode.enabled) {
            parent.insertBefore(balanceSection, aboutSection);
        } else {
            restoreSettingsSectionPosition('balance', balanceSection);
        }
    } else {
        restoreSettingsSectionPosition('permission', permissionSection);
        restoreSettingsSectionPosition('balance', balanceSection);
    }
}

function requestBootAutoStartAccess() {
    const startupItem = document.querySelector('[data-permission-item][data-permission-key="startup-background"]');
    if (startupItem) {
        startupItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (window.Android?.openBootAutoStartSettings) {
        const opened = Android.openBootAutoStartSettings();
        if (opened === false && window.Android?.openAppDetailsSettings) {
            Android.openAppDetailsSettings();
        }
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    if (window.Android?.openAppDetailsSettings) {
        Android.openAppDetailsSettings();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    showAlert('该功能仅在 Android 应用中可用。');
}

function requestUsageAccessPermission() {
    if (window.Android?.openUsageAccessSettings) {
        Android.openUsageAccessSettings();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    showAlert('该功能仅在 Android 应用中可用。');
}

function requestOverlayPermission() {
    if (window.Android?.openOverlaySettings) {
        Android.openOverlaySettings();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    showAlert('该功能仅在 Android 应用中可用。');
}

function requestAppNotificationPermission() {
    if (window.Android?.openAppNotificationSettings) {
        Android.openAppNotificationSettings();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    if ('Notification' in window) {
        Notification.requestPermission().finally(() => setTimeout(updatePermissionStatusUI, 500));
        return;
    }
    showAlert('当前环境不支持通知权限设置。');
}

function requestExactAlarmPermission() {
    if (window.Android?.openExactAlarmSettings) {
        Android.openExactAlarmSettings();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    showAlert('该功能仅在 Android 应用中可用。');
}

function requestBatteryOptimizationPermission() {
    if (window.Android?.requestIgnoreBatteryOptimizations) {
        Android.requestIgnoreBatteryOptimizations();
        setTimeout(updatePermissionStatusUI, 1200);
        return;
    }
    showAlert('该功能仅在 Android 应用中可用。');
}

// [v7.14.1] 请求桌面小组件权限（显示引导）
function requestWidgetPermission() {
    showWidgetPermissionModal();
}

// ========== [v5.10.0] 卡片堆叠系统 ==========

const CARD_STACK_STATE_KEY = 'cardStackExpanded';

// [v7.3.4] 手势滑动状态
let cardStackSwipe = {
    startY: 0,
    startX: 0,
    active: false,
    startTime: 0,
    handled: false
};

// [v7.4.0] 余额卡片触摸点击处理 - 修复移动端点击无响应问题
function handleBalanceCardTap(e) {
    // 如果卡片滑动手势被处理了，不触发点击
    if (cardStackSwipe.handled) return;
    // 检查是否是短触摸（点击），而不是滑动
    const deltaTime = Date.now() - cardStackSwipe.startTime;
    if (deltaTime < 300 && Math.abs(cardStackSwipe.startY - e.changedTouches[0].clientY) < 15) {
        showTodayDetails();
    }
}

// [v7.3.4] 内联事件处理函数 - 卡片堆叠手势
function handleCardStackTouchStart(e) {
    if (e.touches.length !== 1) return;
    cardStackSwipe.startY = e.touches[0].clientY;
    cardStackSwipe.startX = e.touches[0].clientX;
    cardStackSwipe.startTime = Date.now();
    cardStackSwipe.active = true;
    cardStackSwipe.handled = false;
}

function handleCardStackTouchMove(e) {
    if (!cardStackSwipe.active || cardStackSwipe.handled) return;
    if (e.touches.length !== 1) return;
    
    const deltaY = e.touches[0].clientY - cardStackSwipe.startY;
    const deltaX = e.touches[0].clientX - cardStackSwipe.startX;
    
    if (Math.abs(deltaY) > 25 && Math.abs(deltaY) > Math.abs(deltaX) * 1.2) {
        // 检查是否有任意卡片处于展开状态
        const hasAnyExpanded = isAnyCardExpanded();
        
        if (deltaY < -25 && hasAnyExpanded) {
            setAllCardsState(false);
            cardStackSwipe.handled = true;
            cardStackSwipe.active = false;
        } else if (deltaY > 25 && !isAllCardsExpanded()) {
            // [v7.16.0] 修复：只要有未展开的卡片就展开全部（原条件 !hasAnyExpanded 导致部分展开时无法下滑展开）
            setAllCardsState(true);
            cardStackSwipe.handled = true;
            cardStackSwipe.active = false;
        }
    }
}

function handleCardStackTouchEnd(e) {
    if (!cardStackSwipe.active || cardStackSwipe.handled) {
        cardStackSwipe.active = false;
        return;
    }
    
    const endY = e.changedTouches[0].clientY;
    const endX = e.changedTouches[0].clientX;
    const deltaY = endY - cardStackSwipe.startY;
    const deltaX = endX - cardStackSwipe.startX;
    const deltaTime = Date.now() - cardStackSwipe.startTime;
    
    if (Math.abs(deltaY) > 20 && Math.abs(deltaY) > Math.abs(deltaX) && deltaTime < 500) {
        const hasAnyExpanded = isAnyCardExpanded();
        
        if (deltaY < 0 && hasAnyExpanded) {
            setAllCardsState(false);
            cardStackSwipe.handled = true;
        } else if (deltaY > 0 && !isAllCardsExpanded()) {
            // [v7.16.0] 修复：同上，部分展开时也允许下滑展开全部
            setAllCardsState(true);
            cardStackSwipe.handled = true;
        }
    }
    
    cardStackSwipe.active = false;
}

// 初始化卡片堆叠 - [v7.4.0] 独立展开状态
function initCardStack() {
    const cardStack = document.getElementById('cardStack');
    const container = document.getElementById('stackedCardsContainer');
    if (!cardStack) return;
    
    // [v7.4.0] 读取各卡片独立的展开状态，默认展开
    const savedStates = JSON.parse(localStorage.getItem('cardExpandedStates') || '{}');
    
    // 屏幕时间卡片
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    const stExpanded = savedStates.screenTime !== false; // 默认展开
    if (screenTimeWrapper) {
        screenTimeWrapper.classList.toggle('expanded', stExpanded);
    }
    // 容器的margin只由屏幕时间卡片状态决定
    if (container) {
        container.classList.toggle('st-expanded', stExpanded);
    }
    
    // 睡眠卡片
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    if (sleepWrapper) {
        const sleepExpanded = savedStates.sleep !== false; // 默认展开
        sleepWrapper.classList.toggle('expanded', sleepExpanded);
    }
    
    // [v7.18.0] 初始化时更新卡片交错渐变方向
    updateCardGradientDirections();
}

// [v7.4.0] 保存单个卡片的展开状态
function saveCardExpandedState(cardKey, expanded) {
    const savedStates = JSON.parse(localStorage.getItem('cardExpandedStates') || '{}');
    savedStates[cardKey] = expanded;
    localStorage.setItem('cardExpandedStates', JSON.stringify(savedStates));
}

// [v7.4.0] 检查是否有任意卡片处于展开状态
function isAnyCardExpanded() {
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    // [v7.15.0] 添加新时间余额卡片检查
    const balanceCardFinance = document.getElementById('balanceCardFinance');
    
    const stExpanded = screenTimeWrapper && screenTimeWrapper.classList.contains('expanded');
    const sleepExpanded = sleepWrapper && sleepWrapper.style.display !== 'none' && sleepWrapper.classList.contains('expanded');
    // [v7.15.0] 新时间余额卡片仅在金融系统开启时检查
    const balanceExpanded = balanceCardFinance && 
                           !balanceCardFinance.classList.contains('hidden') && 
                           balanceCardFinance.classList.contains('expanded');
    
    return stExpanded || sleepExpanded || balanceExpanded;
}

// [v7.16.0] 检查是否所有可见卡片都已展开
function isAllCardsExpanded() {
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    const balanceCardFinance = document.getElementById('balanceCardFinance');
    
    // 收集所有可见卡片的展开状态
    const cards = [];
    if (screenTimeWrapper) cards.push(screenTimeWrapper.classList.contains('expanded'));
    if (sleepWrapper && sleepWrapper.style.display !== 'none') cards.push(sleepWrapper.classList.contains('expanded'));
    if (balanceCardFinance && !balanceCardFinance.classList.contains('hidden')) cards.push(balanceCardFinance.classList.contains('expanded'));
    
    // 没有可见卡片时视为全部展开（无需展开操作）
    if (cards.length === 0) return true;
    return cards.every(expanded => expanded);
}

// [v7.4.0] 手势滑动时控制所有卡片
function setAllCardsState(expanded) {
    const screenTimeWrapper = document.getElementById('screenTimeWrapper');
    const sleepWrapper = document.getElementById('sleepCardWrapper');
    const container = document.getElementById('stackedCardsContainer');
    // [v7.15.0] 新时间余额卡片
    const balanceCardFinance = document.getElementById('balanceCardFinance');
    
    if (screenTimeWrapper) {
        screenTimeWrapper.classList.toggle('expanded', expanded);
    }
    if (sleepWrapper && sleepWrapper.style.display !== 'none') {
        sleepWrapper.classList.toggle('expanded', expanded);
    }
    // [v7.15.0] 控制新时间余额卡片
    if (balanceCardFinance && !balanceCardFinance.classList.contains('hidden')) {
        balanceCardFinance.classList.toggle('expanded', expanded);
        // [v7.15.0] 同步更新全局展开状态变量
        isBalanceCardFinanceExpanded = expanded;
        localStorage.setItem('balanceCardFinanceExpanded', expanded);
    }
    // 容器的margin只由屏幕时间卡片状态决定
    if (container) {
        container.classList.toggle('st-expanded', expanded);
    }
    
    // 保存状态
    const savedStates = { screenTime: expanded, sleep: expanded };
    localStorage.setItem('cardExpandedStates', JSON.stringify(savedStates));
}

// 设置堆叠状态 (保留用于兼容)
function setCardStackState(expanded) {
    setAllCardsState(expanded);
}

// [v5.10.0] 屏幕时间卡片点击处理 - [v7.4.0] 独立展开/收起
function handleScreenTimeCardClick(event) {
    event.stopPropagation();
    const wrapper = document.getElementById('screenTimeWrapper');
    const container = document.getElementById('stackedCardsContainer');
    if (!wrapper) return;
    
    const isExpanded = wrapper.classList.contains('expanded');
    const header = document.getElementById('screenTimeHeader');
    const clickedHeader = header && header.contains(event.target);
    
    // 如果是收起状态，点击任何位置都展开
    // 如果是展开状态，点击header收起，点击body跳转详情
    if (!isExpanded) {
        // 收起状态，点击展开
        wrapper.classList.add('expanded');
        if (container) container.classList.add('st-expanded');
        saveCardExpandedState('screenTime', true);
    } else if (clickedHeader) {
        // 展开状态，点击header收起
        wrapper.classList.remove('expanded');
        if (container) container.classList.remove('st-expanded');
        saveCardExpandedState('screenTime', false);
    } else {
        // 点击body，跳转详情
        showScreenTimeDetails();
    }
}

// ========== [v7.4.0] 睡眠时间管理系统 ==========

let sleepDurationTimer = null; // 睡眠/午睡时长更新定时器

let sleepSettings = {
    enabled: false,
    plannedBedtime: '22:30',       // 计划入睡时间
    plannedWakeTime: '06:45',      // 计划起床时间
    targetDurationMinutes: 495,    // 目标睡眠时长(分钟) = 8h15m
    durationTolerance: 45,         // 时长容差(分钟)
    toleranceReward: 60,           // 容差内固定奖励(分钟)
    countdownSeconds: 30,          // [v7.11.3] 入睡倒计时(秒) - 固定值
    showCard: true,                // 是否显示首页卡片
    autoDetectWake: true,          // [v7.4.0] 自动检测解锁结束睡眠
    wakeDetectThreshold: 5,        // [v7.4.0] 解锁检测阈值(分钟)，超过此时长的解锁认为是起床
    // 奖惩倍率（默认1:1）
    earlyBedtimeRate: 1,           // 早睡奖励倍率
    lateBedtimeRate: 1,            // 晚睡惩罚倍率
    earlyWakeRate: 1,              // 早起奖励倍率
    lateWakeRate: 1,               // 晚起惩罚倍率
    durationDeviationRate: 1,      // 总时长偏离惩罚倍率
    // [v7.16.0] 统一睡眠模式 - 保留午睡参数（用于小睡检测后的结算）
    napDurationMinutes: 30,        // 小睡判定阈值(分钟)：低于此时长默认判定为小睡
    napMinDurationMinutes: 240,    // [v7.16.0] 夜间睡眠最小时长(分钟)：>=此值或入睡时段20:00-06:00判定为夜间
    napReward: 15,                 // 完成小睡奖励（分钟）
    napAlarmEnabled: true,         // [v7.8.1] 闹钟开关（小睡时使用）
    napVibrateEnabled: true,       // [v7.8.1] 振动开关
    nightAlarmMode: 'none',        // [v7.16.0] 夜间闹钟模式: 'none'关闭 / 'duration'按目标时长 / 'wakeTime'按计划起床时间
    sleepAlarmEnabled: true,       // [v7.19.0] 入睡倒计时闹钟总开关（默认开启）
    autoSyncSystemAlarm: true,     // [v7.19.0] 默认自动同步到系统时钟闹钟（若设备支持）
    // [v7.9.3] 分类标签
    earnCategory: null,            // 奖励分类，null 表示"系统"
    spendCategory: null,           // 惩罚分类，null 表示"系统"
    // [v7.7.0] 已废弃字段（保留以兼容旧数据加载）
    cardMode: 'auto',
    napEnabled: true,
    napMaxDurationMinutes: 60,
};

let sleepState = {
    isSleeping: false,             // [v7.16.0] 是否正在睡眠中（统一，不再区分午睡/夜间）
    sleepStartTime: null,          // 入睡开始时间
    lastSleepRecord: null,         // 上次睡眠记录
    missedPenaltyDates: [],        // [v7.5.3] 已废弃，保留兼容
    lastPenaltyCheckDate: null,    // [v7.7.0] 上次检查未操作惩罚的日期
    lastUpdated: 0,                // [v7.9.7] 状态更新时间戳，用于云端同步冲突解决
    // [v7.7.0] 已废弃字段（保留以兼容旧状态加载）
    isNapping: false,
    napStartTime: null,
    napTargetMinutes: null,
};

// 保存睡眠设置（本地 + 云端统一存储，不分设备）
