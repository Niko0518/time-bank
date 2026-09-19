/**
 * TimeBank 同步云函数 - timebankSync
 * [v9.12.2] 新增 getNativeDelta action 供原生层 CloudSyncWorker 调用
 * [v7.31.3-simplified] 仅保留增量同步，移除幂等写入（改为客户端直接写入）
 * [v9.37.0] 增量游标重建（见下方说明），修复「增量同步从未生效」的 P0 缺陷
 *
 * 支持的 action：
 *   getDelta        - 获取本端缺失的增量交易记录（前端 JS 调用，单集合）
 *   getNativeDelta  - 获取 5 集合增量（原生层 Worker 调用，结构化返回）
 */
const cloud = require('@cloudbase/node-sdk');

// [v9.37.0] 显式解析环境：
// 旧写法只依赖 DYNAMIC_CURRENT_ENV，实测日志出现「当前未指定env，将默认使用第一个创建的环境！」，
// 多环境账号下会连错环境导致查询恒空。这里按运行时注入变量显式兜底。
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || cloud.DYNAMIC_CURRENT_ENV;
const app = cloud.init({ env: ENV_ID });
const db  = app.database();
const _   = db.command;

// ============================================================
// [v9.37.0] 增量游标重建（后端扫描 P0，本次最关键修复之一）
// ── 问题取证 ──
// 1) 全库 tb_transaction 7045/7045、tb_task 119/119、tb_daily 348/348、tb_profile 5/5、tb_running 3/3
//    的文档**都不存在 _updateTime 字段**（系统并未维护该字段），而旧实现所有增量查询
//    都以 _updateTime 为条件 → 查询恒为空 → 多端增量同步实际上从未生效过。
// 2) CloudBase 的 _id 形如 df17f1cc6aadf56b00ff30ce015b0f12，时间戳在第 8-16 位而非前 8 位，
//    不能直接当时间游标用（曾据此改过一版，已废弃）。
// 3) 实测 tb_transaction.timestamp 为 ISO 字符串（7045/7045），字典序即时间序，
//    可直接范围比较与排序，且集合已有 (_openid, timestamp) 索引。
// ── 现方案 ──
// 大集合 tb_transaction 用 timestamp 增量 + 复合游标 (timestamp, _id) 分页；
// 小集合（task/daily/profile/running，合计 < 500 条、体积小）直接全量返回，天然不会漏数；
// 同时兼容数字型 timestamp 与未来的 updatedAt / _updateTime 字段。
// ============================================================
const PAGE_SIZE = 1000;   // CloudBase 单次查询返回上限，据此分页
const MAX_PAGES = 10;     // 单次调用最多 1 万条

function cursorToIso(cursorTs) {
    const ms = Number(cursorTs) || 0;
    return new Date(ms).toISOString();
}

// 首屏条件：>= 游标（含边界，宁可重复下发，客户端按 id/txId 去重）
function buildDeltaStartWhere(uid, cursorTs) {
    const ms = Number(cursorTs) || 0;
    const iso = cursorToIso(ms);
    return _.or([
        { _openid: uid, timestamp: _.gte(iso) },
        { _openid: uid, timestamp: _.gte(ms) },
        { _openid: uid, updatedAt: _.gte(ms) },
        { _openid: uid, _updateTime: _.gte(new Date(ms)) }
    ]);
}

// 翻页条件：复合游标 (timestamp, _id)，避免边界记录漏数或死循环
function buildDeltaPageWhere(uid, lastTs, lastId) {
    return _.or([
        { _openid: uid, timestamp: _.gt(lastTs) },
        { _openid: uid, timestamp: lastTs, _id: _.gt(lastId) }
    ]);
}

// timestamp / updatedAt / _updateTime → 毫秒（兼容 string / number / Date）
function valueToMs(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
    if (v instanceof Date) return v.getTime();
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : 0;
}

function docCursorMs(doc) {
    if (!doc) return 0;
    return Math.max(valueToMs(doc.timestamp), valueToMs(doc.updatedAt), valueToMs(doc._updateTime));
}

exports.main = async (event, context) => {
    // [v9.0.0-fix] Web SDK callFunction 不自动注入 OPENID，添加 data._openid 回退
    const uid = (context && context.OPENID) || event._openid || (event.data && event.data._openid) || null;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const { action, data = {} } = event;

    try {
        switch (action) {

            /**
             * getDelta - 增量拉取（单集合：tb_transaction）
             * 参数: { lastSyncAt: number } - 毫秒时间戳
             * 返回: { code, delta: [], count, maxUpdateTime, hasMore, serverTime }
             */
            case 'getDelta': {
                const { lastSyncAt = 0 } = data;
                const allRecords = [];
                let lastTs = null;
                let lastId = null;
                let reachedEnd = true;

                for (let page = 0; page < MAX_PAGES; page++) {
                    const whereCondition = lastId
                        ? buildDeltaPageWhere(uid, lastTs, lastId)
                        : buildDeltaStartWhere(uid, lastSyncAt);

                    const result = await db
                        .collection('tb_transaction')
                        .where(whereCondition)
                        .orderBy('timestamp', 'asc')
                        .orderBy('_id', 'asc')
                        .limit(PAGE_SIZE)
                        .get();

                    const rows = result.data || [];
                    allRecords.push(...rows);
                    if (rows.length < PAGE_SIZE) break;
                    const lastRec = rows[rows.length - 1];
                    lastTs = lastRec.timestamp;
                    lastId = lastRec._id;
                    if (page === MAX_PAGES - 1) reachedEnd = false;
                }

                const tail = allRecords[allRecords.length - 1];
                return {
                    code: 0,
                    delta: allRecords,
                    count: allRecords.length,
                    // 回传毫秒游标供客户端下次作为 lastSyncAt（边界记录可能重复下发，客户端按 id 去重）
                    maxUpdateTime: tail ? docCursorMs(tail) : (Number(lastSyncAt) || 0),
                    hasMore: !reachedEnd,
                    serverTime: Date.now()
                };
            }

            /**
             * getNativeDelta - 原生层 5 集合增量拉取
             * 参数: { lastSyncAt: number } - 毫秒时间戳
             * 返回: { code, delta: { transactions, running, tasks, profiles, dailies, maxUpdateTime }, serverTime }
             *
             * 策略：tb_transaction 走增量（数据量大）；task/daily/profile/running 体量小（合计 < 500 条）直接全量，
             * 这样既不会漏数（它们缺少可靠时间字段），也不会造成明显流量。
             */
            case 'getNativeDelta': {
                const { lastSyncAt = 0 } = data;

                const fetchTransactions = async () => {
                    const docs = [];
                    let lastTs = null;
                    let lastId = null;
                    let complete = true;
                    for (let page = 0; page < MAX_PAGES; page++) {
                        const where = lastId
                            ? buildDeltaPageWhere(uid, lastTs, lastId)
                            : buildDeltaStartWhere(uid, lastSyncAt);
                        const res = await db.collection('tb_transaction')
                            .where(where)
                            .orderBy('timestamp', 'asc')
                            .orderBy('_id', 'asc')
                            .limit(PAGE_SIZE)
                            .get();
                        const rows = res.data || [];
                        docs.push(...rows);
                        if (rows.length < PAGE_SIZE) return { docs, complete: true };
                        const last = rows[rows.length - 1];
                        lastTs = last.timestamp;
                        lastId = last._id;
                        if (page === MAX_PAGES - 1) complete = false;
                    }
                    return { docs, complete };
                };

                const fetchAll = async (collection) => {
                    const res = await db.collection(collection)
                        .where({ _openid: uid })
                        .limit(PAGE_SIZE)
                        .get();
                    return { docs: res.data || [], complete: true };
                };

                const [txRes, runRes, taskRes, profileRes, dailyRes] = await Promise.all([
                    fetchTransactions(),
                    fetchAll('tb_running'),
                    fetchAll('tb_task'),
                    fetchAll('tb_profile'),
                    fetchAll('tb_daily')
                ]);

                const transactions = txRes.docs;
                const running = runRes.docs;
                const tasks = taskRes.docs;
                const profiles = profileRes.docs;
                const dailies = dailyRes.docs;

                // 全局游标：交易增量推进到已下发最新一条的时间；未拉完时退回到该批次边界（宁可重复，绝不漏）
                let maxUpdateTime = 0;
                const txTail = transactions[transactions.length - 1];
                if (txRes.complete) {
                    maxUpdateTime = txTail ? docCursorMs(txTail) : (Number(lastSyncAt) || 0);
                } else {
                    maxUpdateTime = txTail ? docCursorMs(txTail) : (Number(lastSyncAt) || 0);
                }

                return {
                    code: 0,
                    delta: {
                        transactions, running, tasks, profiles, dailies,
                        maxUpdateTime,
                        hasMore: !txRes.complete
                    },
                    serverTime: Date.now()
                };
            }

            /**
             * [v7.31.3-deprecated] writeTransaction 已弃用
             * 客户端改为直接写入数据库，不再通过云函数
             * 保留此 case 返回友好提示，兼容旧版本客户端
             */
            case 'writeTransaction': {
                console.log('[timebankSync] ⚠️ 收到已弃用的 writeTransaction 调用，客户端应直接写入数据库');
                return {
                    code: 410, // Gone
                    message: 'writeTransaction 已弃用，客户端请直接写入数据库',
                    action: 'deprecated'
                };
            }

            default:
                return { code: 400, message: `未知操作: ${action}` };
        }

    } catch (e) {
        console.error(`[timebankSync] action=${action} 失败:`, e);
        return { code: 500, message: e.message || '服务端错误' };
    }
};
