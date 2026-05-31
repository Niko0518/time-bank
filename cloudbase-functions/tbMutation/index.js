/**
 * TimeBank 统一数据变更云函数 - tbMutation
 * [v9.0.0] 服务端权威写入，原子操作保证数据一致性
 *
 * 支持的 action：
 *   addTransaction          - 幂等写入交易 + 原子更新余额 + 原子更新每日汇总
 *   updateTransaction       - 更新交易 + 反向旧daily + 正向新daily + 余额差量
 *   deleteTransaction       - 删除交易 + 反向余额 + 反向daily
 *   renameTransactionTaskName - 批量更新 taskName
 *   saveTask                - 保存任务（update 或 add）
 *   deleteTask              - 删除任务
 *   startTask               - 开始运行任务（update 或 add）
 *   stopTask                - 停止运行任务（删除，3次重试）
 *   updateRunningTask       - 更新运行中任务
 *   saveProfile             - 保存用户配置（嵌套对象用 _.set()）
 *   updateDailyChange       - 更新每日汇总（_.inc 或 add）
 *   updateCachedBalance     - 更新余额（_.inc 或绝对值）
 *   recalculateBalance      - 从所有交易重算余额
 *
 * 部署步骤：
 *   1. 打开 https://tcb.cloud.tencent.com/dev?#/scf
 *   2. 新建云函数：名称 tbMutation，运行环境 Node.js 18.15
 *   3. 将本文件全部内容粘贴到 index.js
 *   4. 点击「保存并安装依赖」
 */

const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db  = app.database();
const _   = db.command;

const TABLES = {
    PROFILE:     'tb_profile',
    TASK:        'tb_task',
    TRANSACTION: 'tb_transaction',
    RUNNING:     'tb_running',
    DAILY:       'tb_daily'
};

exports.main = async (event, context) => {
    const uid = context.OPENID;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const { action, data = {} } = event;

    try {
        switch (action) {

            case 'addTransaction': {
                const { tx } = data;
                if (!tx || !tx.id) {
                    return { code: 400, message: '缺少交易数据或 txId' };
                }

                const existRes = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, txId: tx.id })
                    .limit(1)
                    .get();

                if (existRes.data && existRes.data.length > 0) {
                    return { code: 0, message: '交易已存在（幂等）', id: existRes.data[0]._id };
                }

                const doc = {
                    _openid: uid,
                    txId: tx.id,
                    taskId: tx.taskId,
                    taskName: tx.taskName,
                    category: tx.category || null,
                    amount: tx.amount,
                    type: tx.type,
                    timestamp: tx.timestamp,
                    description: tx.description || '',
                    isStreakAdvancement: tx.isStreakAdvancement || false,
                    isSystem: tx.isSystem || false,
                    rawSeconds: tx.rawSeconds || null,
                    clientId: tx.clientId || null,
                    data: tx
                };

                const addRes = await db.collection(TABLES.TRANSACTION).add(doc);

                const balanceDelta = tx.type === 'earn' ? tx.amount : -tx.amount;
                if (balanceDelta !== 0) {
                    await _updateCachedBalance(uid, balanceDelta);
                }

                await _updateDailyChange(uid, tx, false);

                return { code: 0, message: '交易写入成功', id: addRes.id };
            }

            case 'updateTransaction': {
                const { tx, prevTx } = data;
                if (!tx || !tx.id) {
                    return { code: 400, message: '缺少交易数据或 txId' };
                }

                const existRes = await db.collection(TABLES.TRANSACTION)
                    .where({ _openid: uid, txId: tx.id })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 404, message: '云端未找到该交易记录' };
                }

                const docId = existRes.data[0]._id;
                const existingTx = prevTx || existRes.data[0].data || existRes.data[0];

                const updateData = {
                    txId: tx.id,
                    taskId: tx.taskId,
                    taskName: tx.taskName,
                    category: tx.category || null,
                    amount: tx.amount,
                    type: tx.type,
                    timestamp: tx.timestamp,
                    description: tx.description || '',
                    isStreakAdvancement: tx.isStreakAdvancement || false,
                    isSystem: tx.isSystem || false,
                    rawSeconds: tx.rawSeconds || null,
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
                    return { code: 404, message: '云端未找到该交易记录' };
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
                const { task } = data;
                if (!task || !task.id) {
                    return { code: 400, message: '缺少任务数据或 taskId' };
                }

                const safeHabitDetails = task.habitDetails ? { ...task.habitDetails } : {};
                const finalHabitDetails = task.isHabit ? safeHabitDetails : {};

                const taskData = {
                    taskId: task.id,
                    name: task.name,
                    category: task.category,
                    amount: task.amount,
                    unit: task.unit || 'minutes',
                    type: task.type,
                    multiplier: task.multiplier || 1,
                    isHabit: task.isHabit || false,
                    habitDetails: finalHabitDetails,
                    enableFloatingTimer: task.enableFloatingTimer || false,
                    lastUsed: task.lastUsed || null,
                    isSystem: task.isSystem || false,
                    clientId: task.clientId || null,
                    editTimestamp: Date.now(),
                    data: JSON.parse(JSON.stringify(task, (key, value) => {
                        if (key === '_openid' || key === '_id') return undefined;
                        if (key === 'habitDetails' && value === null) return {};
                        return value;
                    }))
                };

                const existRes = await db.collection(TABLES.TASK)
                    .where({ _openid: uid, taskId: task.id })
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

                return { code: 404, message: '云端未找到该任务' };
            }

            case 'startTask': {
                const { taskId, runningData } = data;
                if (!taskId || !runningData) {
                    return { code: 400, message: '缺少 taskId 或 runningData' };
                }

                const doc = {
                    _openid: uid,
                    taskId: taskId,
                    startTime: runningData.startTime,
                    accumulatedTime: runningData.accumulatedTime || 0,
                    isPaused: runningData.isPaused || false,
                    clientId: runningData.clientId || null,
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
                    return { code: 404, message: '云端未找到该运行任务' };
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
                const { taskId, runningData } = data;
                if (!taskId || !runningData) {
                    return { code: 400, message: '缺少 taskId 或 runningData' };
                }

                const existRes = await db.collection(TABLES.RUNNING)
                    .where({ _openid: uid, taskId: taskId })
                    .limit(1)
                    .get();

                if (!existRes.data || existRes.data.length === 0) {
                    return { code: 404, message: '云端未找到该运行任务' };
                }

                const docId = existRes.data[0]._id;
                try {
                    await db.collection(TABLES.RUNNING).doc(docId).update({
                        startTime: runningData.startTime,
                        accumulatedTime: runningData.accumulatedTime || 0,
                        isPaused: runningData.isPaused === true,
                        clientId: runningData.clientId || null,
                        lastUpdatedAt: Date.now(),
                        data: _.set(runningData)
                    });
                    return { code: 0, message: '运行任务更新成功' };
                } catch (e) {
                    if (e.message && (e.message.includes('not found') || e.message.includes('ResourceNotFound') || e.message.includes('DOC_NOT_EXIST'))) {
                        return { code: 404, message: '文档不存在，可能已被其他端删除' };
                    }
                    throw e;
                }
            }

            case 'saveProfile': {
                const { profileData } = data;
                if (!profileData) {
                    return { code: 400, message: '缺少 profileData' };
                }

                const profileRes = await db.collection(TABLES.PROFILE)
                    .where({ _openid: uid })
                    .limit(1)
                    .get();

                if (!profileRes.data || profileRes.data.length === 0) {
                    return { code: 404, message: '云端未找到 Profile' };
                }

                const docId = profileRes.data[0]._id;
                const updateData = { ...profileData };

                const nestedKeys = [
                    'settings', 'reportState', 'categoryColors', 'collapsedCategories',
                    'deletedTaskCategoryMap', 'financeSettings', 'interestLedger',
                    'sleepSettingsShared', 'sleepStateShared'
                ];
                for (const key of nestedKeys) {
                    if (key in updateData) {
                        updateData[key] = _.set(updateData[key]);
                    }
                }

                await db.collection(TABLES.PROFILE).doc(docId).update(updateData);

                return { code: 0, message: 'Profile 更新成功' };
            }

            case 'updateDailyChange': {
                const { tx, reverse } = data;
                if (!tx) {
                    return { code: 400, message: '缺少交易数据' };
                }

                await _updateDailyChange(uid, tx, !!reverse);
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
