/**
 * TimeBank 同步云函数 - timebankSync
 * [v7.31.3-simplified] 仅保留增量同步，移除幂等写入（改为客户端直接写入）
 * [v9.3.3] 新增 getNativeDelta：5 表差集（tb_transaction/tb_running/tb_task/tb_daily/tb_profile）
 * [v9.4.0] 原生层 CloudSyncWorker 周期任务 + LongConnectionService 广播均使用 getNativeDelta
 *
 * 支持的 action：
 *   getDelta      - 获取本端缺失的增量交易记录（仅 tb_transaction，兼容旧 JS 心跳）
 *   getNativeDelta- 5 表差集（原生层 Worker / 长连接广播触发）
 *
 * 部署步骤（一次性）：
 *   1. 打开 https://tcb.cloud.tencent.com/dev?#/scf
 *   2. 新建云函数：名称 timebankSync，运行环境 Node.js 18.15
 *   3. 将本文件全部内容粘贴到 index.js
 *   4. 点击「保存并安装依赖」
 */

const cloud = require('@cloudbase/node-sdk');

// 使用动态当前环境，部署到哪个环境就自动使用哪个环境
const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db  = app.database();
const _   = db.command;

exports.main = async (event, context) => {
    // [v9.0.0-fix] Web SDK callFunction 不自动注入 OPENID，添加 data._openid 回退
    const uid = context.OPENID || event._openid || event.data?._openid || null;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const { action, data = {} } = event;

    try {
        switch (action) {

            /**
             * getDelta - 增量拉取（仅 transactions，兼容旧 JS 心跳）
             * 参数: { lastSyncAt: number } - 毫秒时间戳
             * 返回: { code, delta: [], count, serverTime }
             *
             * 用途：获取 lastSyncAt 之后有更新的所有交易记录（CloudBase 自动维护 _updateTime 字段）
             */
            case 'getDelta': {
                const { lastSyncAt = 0 } = data;
                const PAGE_SIZE = 500;
                let allRecords = [];
                // 使用游标分页，避免数据量大时单次超限
                let cursorTime = new Date(Number(lastSyncAt));

                while (true) {
                    const result = await db
                        .collection('tb_transaction')
                        .where({
                            _openid: uid,
                            _updateTime: _.gt(cursorTime)
                        })
                        .orderBy('_updateTime', 'asc')
                        .limit(PAGE_SIZE)
                        .get();

                    allRecords = allRecords.concat(result.data);
                    // 结果不足一页说明已取完
                    if (result.data.length < PAGE_SIZE) break;
                    // 移动游标到本批最后一条
                    cursorTime = result.data[result.data.length - 1]._updateTime;
                }

                return {
                    code: 0,
                    delta: allRecords,
                    count: allRecords.length,
                    serverTime: Date.now()
                };
            }

            /**
             * [v9.3.3] getNativeDelta - 5 表差集（原生层专用）
             * 参数: { lastSyncAt: number } - 毫秒时间戳（0 = 拉全量）
             * 返回: { code, delta: { transactions, running, tasks, profiles, dailies, maxUpdateTime }, serverTime }
             *
             * 用途：CloudSyncWorker 周期任务 + LongConnectionService PUSH 广播 都通过这个 action
             *       一次性拉 5 张表的差集，5 张表共享一个 maxUpdateTime 取并集
             *
             * 设计：
             * - 5 张表并发查询（Promise.all），总延迟 = max(单表)，不是 sum
             * - 每张表 maxUpdateTime 取该表的最大 _updateTime
             * - 总 maxUpdateTime = 5 张表 maxUpdateTime 的最大值（用于 lastSyncAt 游标推进）
             * - 5 张表分页 200 条（数据量小，Worker 一次拉得完）
             */
            case 'getNativeDelta': {
                const { lastSyncAt = 0 } = data;
                const cursorTime = new Date(Number(lastSyncAt));
                const PAGE_SIZE = 200;

                // 单表增量拉取
                async function pullTable(collectionName) {
                    let all = [];
                    let cursor = cursorTime;
                    let localMax = 0;
                    while (true) {
                        const res = await db.collection(collectionName)
                            .where({ _openid: uid, _updateTime: _.gt(cursor) })
                            .orderBy('_updateTime', 'asc')
                            .limit(PAGE_SIZE)
                            .get();
                        all = all.concat(res.data);
                        if (res.data.length < PAGE_SIZE) break;
                        cursor = res.data[res.data.length - 1]._updateTime;
                    }
                    if (all.length > 0) {
                        // _updateTime 是 Date，需要转毫秒数
                        localMax = all.reduce((m, r) => {
                            const t = r._updateTime instanceof Date
                                ? r._updateTime.getTime()
                                : Number(r._updateTime) || 0;
                            return t > m ? t : m;
                        }, 0);
                    }
                    return { records: all, maxTime: localMax };
                }

                // 5 张表并发拉取
                const [tx, run, tsk, prof, daily] = await Promise.all([
                    pullTable('tb_transaction'),
                    pullTable('tb_running'),
                    pullTable('tb_task'),
                    pullTable('tb_profile'),
                    pullTable('tb_daily')
                ]);

                const maxUpdateTime = Math.max(
                    tx.maxTime, run.maxTime, tsk.maxTime, prof.maxTime, daily.maxTime
                );

                return {
                    code: 0,
                    delta: {
                        transactions: tx.records,
                        running: run.records,
                        tasks: tsk.records,
                        profiles: prof.records,
                        dailies: daily.records,
                        maxUpdateTime
                    },
                    count: tx.records.length + run.records.length + tsk.records.length
                          + prof.records.length + daily.records.length,
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
