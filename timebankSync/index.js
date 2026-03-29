/**
 * TimeBank 同步云函数 - timebankSync
 * [v7.28.0] 服务端幂等写入门控 + 增量同步
 *
 * 支持的 action：
 *   getDelta         - 获取本端缺失的增量交易记录
 *   writeTransaction - 幂等写入单条交易（防重复、防旧覆新）
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
    // context.OPENID 由 CloudBase SDK 调用时自动注入（登录态透传）
    const uid = context.OPENID;
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
             * writeTransaction - 幂等安全写入
             * 参数: { transaction: object }
             * 返回: { code, action: 'inserted'|'undone'|'skipped', id }
             *
             * 规则：
             *   - 记录不存在 → 正常插入
             *   - 记录已存在 + 本次设置 undone=true + 云端未撤回 → 执行撤回
             *   - 其他情况（重复提交、旧数据覆盖新数据）→ 跳过，返回 skipped
             */
            case 'writeTransaction': {
                const { transaction } = data;
                if (!transaction) {
                    return { code: 400, message: '缺少 transaction 参数' };
                }

                // 优先用 _id（CloudBase 文档 ID），回退到客户端生成的 id
                const txId = transaction._id || transaction.id;
                if (!txId) {
                    return { code: 400, message: '交易记录缺少 ID (_id/id)' };
                }

                // 查询云端是否已存在该记录
                let existing = null;
                try {
                    const res = await db.collection('tb_transaction').doc(txId).get();
                    existing = res.data;
                } catch (e) {
                    // doc 不存在时 CloudBase 抛异常，属于正常情况
                    existing = null;
                }

                if (existing) {
                    // 已存在：仅允许撤回操作（undone: false → true）
                    if (transaction.undone === true && !existing.undone) {
                        await db.collection('tb_transaction').doc(txId).update({
                            undone: true,
                            undoneAt: db.serverDate()
                        });
                        return { code: 0, action: 'undone', id: txId };
                    }
                    // 其他写入（旧客户端重放/重复提交）均跳过
                    return { code: 0, action: 'skipped', id: txId };
                }

                // 不存在：按 addTransaction 的包装格式写入，与直接写入路径结构一致
                // 这样 loadAllTransactions 和 mergeTransactionDelta 都能正确读取 doc.data
                const toInsert = {
                    _id:                  txId,
                    _openid:              uid,
                    txId:                 txId,           // 顶层字段便于 where 查询
                    taskId:               transaction.taskId,
                    taskName:             transaction.taskName,
                    category:             transaction.category || null,
                    amount:               transaction.amount,
                    type:                 transaction.type,
                    timestamp:            transaction.timestamp,
                    description:          transaction.description || '',
                    isStreakAdvancement:  transaction.isStreakAdvancement || false,
                    isSystem:             transaction.isSystem || false,
                    data:                 { ...transaction }  // 完整 tx 对象（与直接写入路径一致）
                };
                if (transaction.rawSeconds !== undefined) toInsert.rawSeconds = transaction.rawSeconds;

                await db.collection('tb_transaction').add(toInsert);
                return { code: 0, action: 'inserted', id: txId };
            }

            default:
                return { code: 400, message: `未知操作: ${action}` };
        }

    } catch (e) {
        console.error(`[timebankSync] action=${action} 失败:`, e);
        return { code: 500, message: e.message || '服务端错误' };
    }
};
