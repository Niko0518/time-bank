const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db  = app.database();
const _   = db.command;

// [v9.0.2] 错误码标准化（与客户端 MutationFailureHandler 对齐）
// 0    - 成功
// 410  - 幂等（已存在/已不存在），视为成功
// 400  - 参数缺失
// 401  - 未授权
// 1001 - 业务异常（如余额不足）
// 1002 - 数据冲突
// 1003 - 资源不存在（保留用于 saveProfile 等真正"必须有记录"的操作）
// 1004 - 权限不足
// 429  - 限流
// 500  - 内部错误
// 503  - 网络异常（由客户端标记）

// [v9.3.0] 幂等码：客户端 callMutation 视为成功，失败队列不再堆积
const IDEMPOTENT = 410;

const TABLES = {
    PROFILE:     'tb_profile',
    TASK:        'tb_task',
    TRANSACTION: 'tb_transaction',
    RUNNING:     'tb_running',
    DAILY:       'tb_daily'
};

// [v9.3.2] Bug 2 修复：建索引确保 _updateTime 增量查询性能
// CloudBase 文档 _updateTime 字段由系统自动维护
// 但 _updateTime > X 的范围查询需要复合索引（_openid + _updateTime）才能高效
// 此函数幂等：重复调用 createIndex 不会报错
let indexesInitialized = false;
async function ensureIndexes() {
    if (indexesInitialized) return;
    indexesInitialized = true;
    try {
        // tb_running 增量查询索引：_openid + _updateTime
        await db.collection(TABLES.RUNNING).createIndex({
            IndexName: 'idx_openid_updateTime',
            MgoKeySchema: {
                MgoIndexKeys: [
                    { Name: '_openid', Direction: '1' },
                    { Name: '_updateTime', Direction: '-1' }
                ],
                MgoIsUnique: false
            }
        });
        console.log('[v9.3.2] tb_running 索引已就绪: idx_openid_updateTime');
    } catch (e) {
        // 索引已存在或其他非致命错误，吞掉异常
        console.log('[v9.3.2] tb_running 索引创建跳过（可能已存在）:', e.message || e);
    }
}

exports.main = async (event, context) => {
    const uid = context.OPENID || event._openid || event.data?._openid || null;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    // [v9.3.2] 首次调用时建索引（幂等）
    await ensureIndexes();

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
                    return { code: IDEMPOTENT, message: '云端未找到该交易记录（幂等）' };
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
                    return { code: IDEMPOTENT, message: '云端未找到该交易记录（幂等）' };
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
                    // [v9.14.0] 任务卡片背景图 URL
                    backgroundImage: data.backgroundImage || null,
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

                return { code: IDEMPOTENT, message: '云端未找到该任务（幂等）' };
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
                    clientId: data.clientId || runningData.clientId || null,
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
                    return { code: IDEMPOTENT, message: '云端未找到该运行任务（幂等）' };
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

            case 'migrateDailyChanges': {
                const { entries } = data;
                if (!Array.isArray(entries) || entries.length === 0) {
                    return { code: 400, message: '缺少 entries 或 entries 为空' };
                }

                const MAX_ENTRIES = 10000;
                if (entries.length > MAX_ENTRIES) {
                    return { code: 400, message: `entries 数量超限（${MAX_ENTRIES}）` };
                }

                for (let i = 0; i < entries.length; i++) {
                    const [date, d] = entries[i];
                    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                        return { code: 400, message: `第 ${i+1} 条 date 格式错误: ${date}` };
                    }
                    if (!d || typeof d !== 'object') {
                        return { code: 400, message: `第 ${i+1} 条 数据格式错误` };
                    }
                }

                const existingRes = await db.collection(TABLES.DAILY)
                    .where({ _openid: uid })
                    .limit(MAX_ENTRIES)
                    .get();
                const existingDates = new Set(
                    (existingRes.data || []).map(d => d.date)
                );

                const toMigrate = entries.filter(([date]) => !existingDates.has(date));
                if (toMigrate.length === 0) {
                    return { code: 0, message: '无新条目需迁移', migrated: 0 };
                }

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

            case 'uploadTaskBackgroundImage': {
                const { taskId, base64, mimeType } = data;
                if (!taskId || !base64) {
                    return { code: 400, message: '缺少 taskId 或 base64' };
                }

                const match = base64.match(/^data:(.+);base64,(.+)$/);
                if (!match) {
                    return { code: 400, message: 'base64 格式无效' };
                }
                const realMime = match[1];
                const base64Data = match[2];
                const ext = (mimeType || realMime).includes('png') ? 'png' : 'jpg';
                const cloudPath = `task-bg/${uid}/${taskId}_${Date.now()}.${ext}`;

                const buffer = Buffer.from(base64Data, 'base64');
                console.log('[uploadTaskBackgroundImage] 上传:', cloudPath, '大小:', buffer.length);
                const result = await app.uploadFile({ cloudPath, fileContent: buffer });
                console.log('[uploadTaskBackgroundImage] 结果:', JSON.stringify(result));

                const fileID = result.fileID;
                if (!fileID) {
                    return { code: 500, message: '上传未返回 fileID' };
                }

                // 获取带签名的临时下载链接
                const urlRes = await app.getTempFileURL({ fileList: [fileID] });
                console.log('[uploadTaskBackgroundImage] URL结果:', JSON.stringify(urlRes));
                const tempFileURL = urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL;
                if (!tempFileURL) {
                    return { code: 500, message: '未获取到下载链接: ' + JSON.stringify(urlRes) };
                }

                return {
                    code: 0,
                    downloadUrl: tempFileURL,
                    cloudPath,
                    fileID
                };
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