/**
 * TimeBank 同步云函数 - timebankSync
 * [v9.12.2] 新增 getNativeDelta action 供原生层 CloudSyncWorker 调用
 * [v7.31.3-simplified] 仅保留增量同步，移除幂等写入（改为客户端直接写入）
 *
 * 支持的 action：
 *   getDelta        - 获取本端缺失的增量交易记录（前端 JS 调用，单集合）
 *   getNativeDelta  - 获取 5 集合增量差集（原生层 Worker 调用，结构化返回）
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
             * getDelta - 增量拉取
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
             * [v9.12.2] getNativeDelta - 原生层 5 集合增量拉取
             * 参数: { lastSyncAt: number } - 毫秒时间戳
             * 返回: { code, delta: { transactions, running, tasks, profiles, dailies, maxUpdateTime }, serverTime }
             *
             * 用途：供 Android CloudSyncWorker 调用，拉取 5 个集合的增量数据
             * 设计：用 _.gte 避免同毫秒记录丢失（客户端用 _id/tx.id 去重）
             *      单页 limit 1000，原生层场景（15min 周期）数据量小
             */
            case 'getNativeDelta': {
                const { lastSyncAt = 0 } = data;
                const cursorTime = new Date(Number(lastSyncAt));
                const LIMIT = 1000;

                // 并行查询 5 个集合
                const [txRes, runRes, taskRes, profileRes, dailyRes] = await Promise.all([
                    db.collection('tb_transaction').where({ _openid: uid, _updateTime: _.gte(cursorTime) }).orderBy('_updateTime', 'asc').limit(LIMIT).get(),
                    db.collection('tb_running').where({ _openid: uid, _updateTime: _.gte(cursorTime) }).orderBy('_updateTime', 'asc').limit(LIMIT).get(),
                    db.collection('tb_task').where({ _openid: uid, _updateTime: _.gte(cursorTime) }).orderBy('_updateTime', 'asc').limit(LIMIT).get(),
                    db.collection('tb_profile').where({ _openid: uid, _updateTime: _.gte(cursorTime) }).orderBy('_updateTime', 'asc').limit(LIMIT).get(),
                    db.collection('tb_daily').where({ _openid: uid, _updateTime: _.gte(cursorTime) }).orderBy('_updateTime', 'asc').limit(LIMIT).get(),
                ]);

                const transactions = txRes.data || [];
                const running = runRes.data || [];
                const tasks = taskRes.data || [];
                const profiles = profileRes.data || [];
                const dailies = dailyRes.data || [];

                // 计算 maxUpdateTime（取所有集合最大 _updateTime）
                let maxUpdateTime = 0;
                const allDocs = [...transactions, ...running, ...tasks, ...profiles, ...dailies];
                for (const doc of allDocs) {
                    const t = doc._updateTime ? new Date(doc._updateTime).getTime() : 0;
                    if (t > maxUpdateTime) maxUpdateTime = t;
                }

                return {
                    code: 0,
                    delta: { transactions, running, tasks, profiles, dailies, maxUpdateTime },
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
