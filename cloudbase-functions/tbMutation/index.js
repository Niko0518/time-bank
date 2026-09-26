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

// [v9.38.0] 导出格式 v2 语义字段白名单
// 背景：这些字段原本只存在于 `data` 快照（嵌套对象无法建索引/直接查询）。
// 现同时提到顶层，使其**可查询、可分页、可建索引**；读取端 __normalizeTxDoc 会做双向兜底。
// 写入端见 www/js/app-reports.js 的 addTransaction（字段语义见 www/data-dictionary.md 第 3-5 节）。
// 老记录不含这些字段 → 顶层不写入（保持 null/undefined），不影响读取与导出。
const SEMANTIC_TX_FIELDS = [
    'occurredAt',      // 事件发生时刻（ISO 8601 含时区；null = 时刻未知）
    'createdAt',       // 记录写入时刻
    'entryMode',       // live | backfill | auto | import
    'timeSource',      // live | user | estimated | auto
    'timePrecision',   // exact | minute | date
    'businessDate',    // 归属日 YYYY-MM-DD
    'durationSource',  // timer | user | auto | null
    'taskType',        // user | system
    'quantitySeconds', // 不含倍率的原始量（秒）
    'balanceAfter'     // 该笔入账后的余额（秒）
];

function _pickSemanticFields(tx) {
    const out = {};
    if (!tx || typeof tx !== 'object') return out;
    for (let i = 0; i < SEMANTIC_TX_FIELDS.length; i++) {
        const k = SEMANTIC_TX_FIELDS[i];
        if (tx[k] !== undefined) out[k] = tx[k];
    }
    return out;
}

// [v9.3.2] Bug 2 修复：建索引确保 _updateTime 增量查询性能
// CloudBase 文档 _updateTime 字段由系统自动维护
// 但 _updateTime > X 的范围查询需要复合索引（_openid + _updateTime）才能高效
// 此函数幂等：重复调用 createIndex 不会报错
// [v9.37.0] 索引自愈改造（后端扫描 P1）：
// 旧实现只在请求路径上建 1 个索引，且把「已初始化」标记写在 await 之前（失败后本实例永不重试）。
// 现改为：① 覆盖扫描发现的全部缺失索引；② 仅在全部尝试结束后置位标记（失败下次仍会重试）。
// 说明：这些索引已由 v9.37.0 的离线脚本一次性创建，此处仅作为自愈兜底。
// [v9.38.1] 已删除 INDEX_DEFS / ensureIndexes()：
// node-sdk（3.x）本就没有 createIndex 方法，这段"索引自愈"从未真正生效，只产生噪音日志。
// 线上索引实际由云 API RunCommands 统一维护（见本文件顶部 v9.37.0 说明）。
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

                // [v9.38.0] 语义字段来源：前端传的是整笔 tx（= data.data），故先从快照取
                const tx = data.data || data;

                const doc = Object.assign({
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
                }, _pickSemanticFields(tx)); // [v9.38.0] 语义字段提到顶层（可查询）

                const addRes = await db.collection(TABLES.TRANSACTION).add(doc);

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

                const updateData = Object.assign({
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
                }, _pickSemanticFields(tx)); // [v9.38.0] 顶层语义字段同步更新

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

            // [v9.38.1] 一次性数据迁移：把语义字段（occurredAt / timeSource / businessDate ...）
            // 批量写入历史交易（同时写顶层与 data 快照）。
            // 特点：① 批量（默认 200/批，内部 20 并发）② **不触发余额 / 每日汇总重算**（纯字段写入）
            // ③ 幂等（重复写入同值无副作用）④ 不存在的 txId 计入 missing，不报错。
            case 'bulkPatchTransactions': {
                const { items } = data;
                if (!Array.isArray(items) || items.length === 0) {
                    return { code: 400, message: '缺少 items 或 items 为空' };
                }
                const MAX_ITEMS = 200;
                if (items.length > MAX_ITEMS) {
                    return { code: 400, message: `items 数量超限（${MAX_ITEMS}）` };
                }

                const BULK_FIELDS = SEMANTIC_TX_FIELDS.concat(['taskNameAtTime', 'categoryAtTime', 'sourceDeviceLabel']);
                let ok = 0, fail = 0, missing = 0;
                const CONC = 20;

                const doOne = async (it) => {
                    const txId = it && it.txId;
                    const fields = it && it.fields;
                    if (!txId || !fields) { fail++; return; }
                    const patch = {};
                    for (let i = 0; i < BULK_FIELDS.length; i++) {
                        const k = BULK_FIELDS[i];
                        if (fields[k] !== undefined) { patch[k] = fields[k]; patch['data.' + k] = fields[k]; }
                    }
                    if (Object.keys(patch).length === 0) { fail++; return; }
                    try {
                        const res = await db.collection(TABLES.TRANSACTION)
                            .where({ _openid: uid, txId: txId })
                            .update(patch);
                        // where().update() 在无匹配文档时 updated=0
                        if (res && typeof res.updated === 'number' && res.updated === 0) missing++;
                        else ok++;
                    } catch (e) { fail++; }
                };

                for (let i = 0; i < items.length; i += CONC) {
                    await Promise.all(items.slice(i, i + CONC).map(doOne));
                }

                return { code: 0, message: '批量语义字段写入完成', ok: ok, fail: fail, missing: missing };
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
                // [v9.36.0] 兼容 png/webp/jpg 扩展名（CloudBase 资源点生图可能返回 webp）
                const extMime = (mimeType || realMime).toLowerCase();
                const ext = extMime.includes('webp') ? 'webp' : (extMime.includes('png') ? 'png' : 'jpg');
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

// [v9.37.0] 性能优化（后端扫描 P1）：tb_profile 单文档 113KB，旧实现每笔交易增/改/删都整读一次（只为拿 _id），
// 7000+ 笔历史累计读取量近 GB 级。现改为：
//   ① 相对增量（delta）直接用 where(_openid).update 一步到位（免读）；
//   ② 仅在写绝对值时才读，且只投影 _id 字段。
async function _updateCachedBalance(uid, delta, absoluteValue = null) {
    if (absoluteValue === null) {
        await db.collection(TABLES.PROFILE)
            .where({ _openid: uid })
            .update({ cachedBalance: _.inc(delta || 0) });
        return;
    }

    const profileRes = await db.collection(TABLES.PROFILE)
        .where({ _openid: uid })
        .field({ _id: true })
        .limit(1)
        .get();

    if (!profileRes.data || profileRes.data.length === 0) return;

    await db.collection(TABLES.PROFILE).doc(profileRes.data[0]._id).update({
        cachedBalance: absoluteValue
    });
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

// [v9.37.0] formatter 提升到模块级复用（扫描 P2）：旧实现每次调用都 new Intl.DateTimeFormat，
// 而该函数位于每笔交易写入路径上（高频）
const _DATE_FMT = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});
function _getLocalDateString(date) {
    const formatter = _DATE_FMT;
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}