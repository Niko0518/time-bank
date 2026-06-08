const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db  = app.database();
const _   = db.command;

// [v9.0.2] 错误码标准化（与客户端 MutationFailureHandler 对齐）
// 0    - 成功
// 410  - 幂等（已存在），视为成功
// 400  - 参数缺失
// 401  - 未授权
// 1001 - 业务异常（如余额不足）
// 1002 - 数据冲突
// 1003 - 资源不存在
// 1004 - 权限不足
// 429  - 限流
// 500  - 内部错误
// 503  - 网络异常（由客户端标记）

const TABLES = {
    PROFILE:     'tb_profile',
    TASK:        'tb_task',
    TRANSACTION: 'tb_transaction',
    RUNNING:     'tb_running',
    DAILY:       'tb_daily'
};

exports.main = async (event, context) => {
    const uid = context.OPENID || event._openid || event.data?._openid || null;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const { action, data = {} } = event;

    try {
        switch (action) {

            case 'addTransaction': {
                const txId = data.txId;
                if (!txId) {
                    return { code: 400, message: '缺少 txId' };
                }

                const existRes = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, txId: txId })
                    .limit(1)
                    .get();

                if (existRes.data && existRes.data.length > 0) {
                    return { code: 0, message: '交易已存在（幂等）', id: existRes.data[0]._id };
                }

                const doc = {
                    _openid: uid,
                    txId: txId,
                    taskId: data.taskId,
                    taskName: data.taskName,
                    category: data.category || null,
                    amount: data.amount,
                    type: data.type,
                    timestamp: data.timestamp,
                    description: data.description || '',
                    isStreakAdvancement: data.isStreakAdvancement || false,
                    isSystem: data.isSystem || false,
                    rawSeconds: data.rawSeconds || null,
                    data: data.data || {}
                };

                const addRes = await db.collection(TABLES.TRANSACTION).add(doc);

                const tx = data.data || data;
                const balanceDelta = tx.type === 'earn' ? tx.amount : -tx.amount;
                if (balanceDelta !== 0) {
                    await _updateCachedBalance(uid, balanceDelta);
                }

                await _updateDailyChange(uid, tx, false);

                return { code: 0, message: '交易写入成功', id: addRes.id };
            }

            case 'updateTransaction': {
                const txId = data.txId;
                if (!txId) {
                    return { code: 400, message: '缺少 txId' };
                }

                const existRes = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, txId: txId })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 1003, message: '云端未找到该交易记录' };
                }

                const docId = existRes.data[0]._id;
                const existingTx = data.prevTx || existRes.data[0].data || existRes.data[0];

                const tx = data.data || data;

                const updateData = {
                    txId: txId,
                    taskId: data.taskId,
                    taskName: data.taskName,
                    category: data.category || null,
                    amount: data.amount,
                    type: data.type,
                    timestamp: data.timestamp,
                    description: data.description || '',
                    isStreakAdvancement: data.isStreakAdvancement || false,
                    isSystem: data.isSystem || false,
                    rawSeconds: data.rawSeconds || null,
                    data: tx
                };

                await db.collection(TABLES.TRANSACTION).doc(docId).update(updateData);

                if (existingTx) {
                    const oldType = existingTx.type || (existingTx.amount >= 0 ? 'earn' : 'spend');
                    const newType = tx.type || oldType;
                    const oldAmount = existingTx.amount || 0;
                    const newAmount = tx.amount || 0;
                    const oldEffect = oldType === 'earn' ? oldAmount : -oldAmount;
                    const newEffect = newType === 'earn' ? newAmount : -newAmount;
                    const balanceDelta = newEffect - oldEffect;

                    const oldDate = _getLocalDateString(new Date(existingTx.timestamp));
                    const newDate = _getLocalDateString(new Date(tx.timestamp));
                    const shouldUpdateDaily = oldType !== newType || oldAmount !== newAmount || oldDate !== newDate;

                    if (shouldUpdateDaily) {
                        await _updateDailyChange(uid, { type: oldType, amount: oldAmount, timestamp: existingTx.timestamp }, true);
                        await _updateDailyChange(uid, { type: newType, amount: newAmount, timestamp: tx.timestamp }, false);
                    }

                    if (balanceDelta !== 0) {
                        await _updateCachedBalance(uid, balanceDelta);
                    }
                }

                return { code: 0, message: '交易更新成功' };
            }

            case 'deleteTransaction': {
                const { txId } = data;
                if (!txId) {
                    return { code: 400, message: '缺少 txId' };
                }

                const existRes = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, txId: txId })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 1003, message: '云端未找到该交易记录' };
                }

                const doc = existRes.data[0];
                const docId = doc._id;
                const tx = doc.data || doc;

                await db.collection(TABLES.TRANSACTION).doc(docId).remove();

                if (tx) {
                    const balanceDelta = tx.type === 'earn' ? -tx.amount : tx.amount;
                    if (balanceDelta !== 0) {
                        await _updateCachedBalance(uid, balanceDelta);
                    }
                    await _updateDailyChange(uid, tx, true);
                }

                return { code: 0, message: '交易删除成功' };
            }

            case 'renameTransactionTaskName': {
                const { taskId, newTaskName } = data;
                if (!taskId || !newTaskName) {
                    return { code: 400, message: '缺少 taskId 或 newTaskName' };
                }

                await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, taskId: taskId })
                    .update({ taskName: newTaskName, 'data.taskName': newTaskName });

                return { code: 0, message: '批量更新 taskName 成功' };
            }

            case 'saveTask': {
                const taskId = data.taskId;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const safeHabitDetails = data.habitDetails ? { ...data.habitDetails } : {};
                const finalHabitDetails = data.isHabit ? safeHabitDetails : {};

                const taskData = {
                    taskId: taskId,
                    name: data.name,
                    category: data.category,
                    amount: data.amount,
                    unit: data.unit || 'minutes',
                    type: data.type,
                    multiplier: data.multiplier || 1,
                    isHabit: data.isHabit || false,
                    habitDetails: finalHabitDetails,
                    enableFloatingTimer: data.enableFloatingTimer || false,
                    lastUsed: data.lastUsed || null,
                    isSystem: data.isSystem || false,
                    // [v9.0.11-fix] 把 completionCount 提升为顶层字段（与客户端 DAL.saveTask 对齐）
                    // 原因：v7.30.1 客户端"修复"循环只改内存，loadAll 又读到旧值循环报警
                    // 现在 taskData 顶层直接持久化 completionCount，下一次 loadAll 自然读到正确值
                    completionCount: data.completionCount || 0,
                    editTimestamp: Date.now(),
                    data: data.data || {}
                };

                const existRes = await db.collection(TABLES.TASK)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (existRes.data && existRes.data.length > 0) {
                    const docId = existRes.data[0]._id;
                    const updatePayload = {
                        ...taskData,
                        habitDetails: _.set(taskData.habitDetails),
                        data: _.set(taskData.data)
                    };
                    await db.collection(TABLES.TASK).doc(docId).update(updatePayload);
                    return { code: 0, message: '任务更新成功', id: docId };
                } else {
                    const addRes = await db.collection(TABLES.TASK).add({
                        ...taskData,
                        _openid: uid
                    });
                    return { code: 0, message: '任务新增成功', id: addRes.id };
                }
            }

            case 'deleteTask': {
                const { taskId } = data;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const existRes = await db.collection(TABLES.TASK)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (existRes.data && existRes.data.length > 0) {
                    await db.collection(TABLES.TASK).doc(existRes.data[0]._id).remove();
                    return { code: 0, message: '任务删除成功' };
                }

                return { code: 1003, message: '云端未找到该任务' };
            }

            case 'startTask': {
                const taskId = data.taskId;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const runningData = data.data || {
                    startTime: data.startTime,
                    accumulatedTime: data.accumulatedTime || 0,
                    isPaused: data.isPaused || false
                };

                const doc = {
                    _openid: uid,
                    taskId: taskId,
                    startTime: runningData.startTime || data.startTime,
                    accumulatedTime: runningData.accumulatedTime || data.accumulatedTime || 0,
                    isPaused: runningData.isPaused !== undefined ? runningData.isPaused : (data.isPaused || false),
                    lastUpdatedAt: Date.now(),
                    data: runningData
                };

                const existRes = await db.collection(TABLES.RUNNING)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (existRes.data && existRes.data.length > 0) {
                    const docId = existRes.data[0]._id;
                    try {
                        await db.collection(TABLES.RUNNING).doc(docId).update({
                            ...doc,
                            data: _.set(doc.data)
                        });
                        return { code: 0, message: '运行任务更新成功', id: docId };
                    } catch (updateErr) {
                        await db.collection(TABLES.RUNNING).add(doc);
                        return { code: 0, message: '运行任务 ADD 回退成功' };
                    }
                } else {
                    const addRes = await db.collection(TABLES.RUNNING).add(doc);
                    return { code: 0, message: '运行任务新增成功', id: addRes.id };
                }
            }

            case 'stopTask': {
                const { taskId } = data;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const existRes = await db.collection(TABLES.RUNNING)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 1003, message: '云端未找到该运行任务' };
                }

                const docId = existRes.data[0]._id;
                const maxRetries = 3;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        await db.collection(TABLES.RUNNING).doc(docId).remove();
                        return { code: 0, message: '运行任务删除成功' };
                    } catch (e) {
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        }
                    }
                }

                return { code: 500, message: '运行任务删除重试耗尽' };
            }

            case 'updateRunningTask': {
                const taskId = data.taskId;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const runningData = data.data || {
                    startTime: data.startTime,
                    accumulatedTime: data.accumulatedTime || 0,
                    isPaused: data.isPaused === true
                };

                const existRes = await db.collection(TABLES.RUNNING)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 1003, message: '云端未找到该运行任务' };
                }

                const docId = existRes.data[0]._id;
                try {
                    await db.collection(TABLES.RUNNING).doc(docId).update({
                        startTime: runningData.startTime || data.startTime,
                        accumulatedTime: runningData.accumulatedTime || data.accumulatedTime || 0,
                        isPaused: runningData.isPaused !== undefined ? runningData.isPaused === true : (data.isPaused === true),
                        lastUpdatedAt: Date.now(),
                        data: _.set(runningData)
                    });
                    return { code: 0, message: '运行任务更新成功' };
                } catch (e) {
                    if (e.message && (e.message.includes('not found') || e.message.includes('ResourceNotFound') || e.message.includes('DOC_NOT_EXIST'))) {
                        return { code: 1003, message: '文档不存在，可能已被其他端删除' };
                    }
                    throw e;
                }
            }

            case 'saveProfile': {
                const profileData = data.data || data.profileData;
                if (!profileData || typeof profileData !== 'object') {
                    return { code: 400, message: '缺少 profileData' };
                }

                const profileRes = await db.collection(TABLES.PROFILE)
                    .where({ _openid: uid })
                    .limit(1)
                    .get();

                if (!profileRes.data || profileRes.data.length === 0) {
                    return { code: 1003, message: '云端未找到 Profile' };
                }

                const docId = profileRes.data[0]._id;
                const updateData = { ...profileData };

                // [v9.0.3] P2-4: 自动遍历嵌套对象字段（值是 plain object 则 _.set() 保护嵌套键；标量/数组/Date 保持原样）
                for (const key of Object.keys(updateData)) {
                    const value = updateData[key];
                    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                        updateData[key] = _.set(value);
                    }
                }

                await db.collection(TABLES.PROFILE).doc(docId).update(updateData);

                return { code: 0, message: 'Profile 更新成功' };
            }

            case 'updateDailyChange': {
                const tx = { type: data.type, amount: data.amount, timestamp: data.timestamp };
                if (!tx.type || tx.amount === undefined || !tx.timestamp) {
                    return { code: 400, message: '缺少交易数据' };
                }

                await _updateDailyChange(uid, tx, !!data.reverse);
                return { code: 0, message: '每日汇总更新成功' };
            }

            case 'updateCachedBalance': {
                const { delta, absoluteValue } = data;
                if (delta === undefined && absoluteValue === undefined) {
                    return { code: 400, message: '缺少 delta 或 absoluteValue' };
                }

                await _updateCachedBalance(uid, delta || 0, absoluteValue);
                return { code: 0, message: '余额更新成功' };
            }

            // [v9.1.0] 一次性迁移：旧版本 dailyChanges 是客户端从 transactions 算的
            // 没有推到云端。升级到 v9.1.0 时，客户端首次 loadAll 检测到云端 tb_daily 空但本地有 dailyChanges
            // 会调用本 action，把本地 dailyChanges 一次性写入 tb_daily
            // 完成后客户端设置 localStorage 标志位，本 action 不再被调用
            case 'migrateDailyChanges': {
                const { entries } = data;
                if (!Array.isArray(entries) || entries.length === 0) {
                    return { code: 400, message: '缺少 entries 或 entries 为空' };
                }

                // 防御：限制最大条目数（防止误用）
                const MAX_ENTRIES = 10000;
                if (entries.length > MAX_ENTRIES) {
                    return { code: 400, message: `entries 数量超限（${MAX_ENTRIES}）` };
                }

                // 验证格式：[date, {earned, spent}]
                for (let i = 0; i < entries.length; i++) {
                    const [date, d] = entries[i];
                    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        return { code: 400, message: `第 ${i+1} 条 date 格式错误: ${date}` };
                    }
                    if (!d || typeof d !== 'object') {
                        return { code: 400, message: `第 ${i+1} 条 数据格式错误` };
                    }
                }

                // 检查已存在的 daily 文档，跳过重复
                const existingRes = await db.collection(TABLES.DAILY)
                    .where({ _openid: uid })
                    .limit(MAX_ENTRIES)
                    .get();
                const existingDates = new Set(
                    (existingRes.data || []).map(d => d.date)
                );

                // 过滤：跳过云端已有的 date
                const toMigrate = entries.filter(([date]) => !existingDates.has(date));
                if (toMigrate.length === 0) {
                    return { code: 0, message: '无新条目需迁移', migrated: 0 };
                }

                // 分批写入（受控并发，避免 QPS 超限）
                const DAILY_CONCURRENT = 50;
                let successCount = 0;
                let errorCount = 0;

                for (let i = 0; i < toMigrate.length; i += DAILY_CONCURRENT) {
                    const group = toMigrate.slice(i, i + DAILY_CONCURRENT);
                    const results = await Promise.allSettled(group.map(([date, d]) =>
                        db.collection(TABLES.DAILY).add({
                            _openid: uid,
                            date: date,
                            earned: d.earned || 0,
                            spent: d.spent || 0
                        })
                    ));
                    results.forEach(r => {
                        if (r.status === 'fulfilled') successCount++;
                        else errorCount++;
                    });
                    if (i + DAILY_CONCURRENT < toMigrate.length) {
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }

                console.log(`[migrateDailyChanges] 迁移完成: 成功 ${successCount}, 失败 ${errorCount}, 跳过 ${entries.length - toMigrate.length}`);

                if (errorCount > 0) {
                    return {
                        code: 1007,
                        message: `部分迁移失败: 成功 ${successCount}, 失败 ${errorCount}`,
                        migrated: successCount,
                        failed: errorCount
                    };
                }

                return { code: 0, message: `成功迁移 ${successCount} 条日汇总`, migrated: successCount };
            }

            case 'recalculateBalance': {
                const PAGE_SIZE = 1000;
                let allDocs = [];
                let lastTimestamp = null;
                let pageCount = 0;
                const MAX_PAGES = 20;

                while (pageCount < MAX_PAGES) {
                    let query = db.collection(TABLES.TRANSACTION)
                        .where({ _openid: uid });

                    if (lastTimestamp !== null) {
                        query = query.where({ _openid: uid, timestamp: _.gt(lastTimestamp) });
                    }

                    const result = await query
                        .orderBy('timestamp', 'asc')
                        .limit(PAGE_SIZE)
                        .get();

                    allDocs = allDocs.concat(result.data || []);
                    if (!result.data || result.data.length < PAGE_SIZE) break;
                    lastTimestamp = result.data[result.data.length - 1].timestamp;
                    pageCount++;
                }

                let balance = 0;
                allDocs.forEach(doc => {
                    const tx = doc.data || doc;
                    balance += tx.type === 'earn' ? (tx.amount || 0) : -(tx.amount || 0);
                });

                const profileRes = await db.collection(TABLES.PROFILE)
                    .where({ _openid: uid })
                    .limit(1)
                    .get();

                if (profileRes.data && profileRes.data.length > 0) {
                    await db.collection(TABLES.PROFILE).doc(profileRes.data[0]._id).update({
                        cachedBalance: balance
                    });
                }

                return { code: 0, message: '余额重算完成', balance };
            }

            default:
                return { code: 400, message: `未知操作: ${action}` };
        }

    } catch (e) {
        console.error(`[tbMutation] action=${action} 失败:`, e);
        return { code: 500, message: e.message || '服务端错误' };
    }
};

async function _updateCachedBalance(uid, delta, absoluteValue = null) {
    const profileRes = await db.collection(TABLES.PROFILE)
        .where({ _openid: uid })
        .limit(1)
        .get();

    if (!profileRes.data || profileRes.data.length === 0) return;

    const docId = profileRes.data[0]._id;

    if (absoluteValue !== null) {
        await db.collection(TABLES.PROFILE).doc(docId).update({
            cachedBalance: absoluteValue
        });
    } else {
        await db.collection(TABLES.PROFILE).doc(docId).update({
            cachedBalance: _.inc(delta)
        });
    }
}

async function _updateDailyChange(uid, tx, reverse) {
    const date = _getLocalDateString(new Date(tx.timestamp));
    const multiplier = reverse ? -1 : 1;
    const earnDelta = tx.type === 'earn' ? tx.amount * multiplier : 0;
    const spendDelta = tx.type === 'spend' ? tx.amount * multiplier : 0;

    const existRes = await db.collection(TABLES.DAILY)
        .where({ _openid: uid, date: date })
        .limit(1)
        .get();

    if (existRes.data && existRes.data.length > 0) {
        const docId = existRes.data[0]._id;
        await db.collection(TABLES.DAILY).doc(docId).update({
            earned: _.inc(earnDelta),
            spent: _.inc(spendDelta)
        });
    } else {
        await db.collection(TABLES.DAILY).add({
            _openid: uid,
            date: date,
            earned: earnDelta > 0 ? earnDelta : 0,
            spent: spendDelta > 0 ? spendDelta : 0
        });
    }
}

function _getLocalDateString(date) {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

