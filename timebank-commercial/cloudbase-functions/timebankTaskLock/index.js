/**
 * TimeBank 服务端任务锁云函数 - timebankTaskLock
 * [v7.30.0] 跨设备任务操作互斥锁
 * [v9.0.0-fix] Web SDK callFunction 不自动注入 OPENID，添加 data._openid 回退
 *
 * 支持的 action：
 *   lockTask    - 申请任务锁（60秒自动过期）
 *   unlockTask  - 释放任务锁
 *   checkLock   - 查询任务锁状态
 */

const cloud = require('@cloudbase/node-sdk');

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

            case 'lockTask': {
                const { taskId, clientId, deviceId } = data;
                if (!taskId || !clientId) {
                    return { code: 400, message: '缺少 taskId 或 clientId' };
                }

                const lockKey = `task_lock_${uid}_${taskId}`;
                const cache = app.cache();

                const existing = await cache.get(lockKey);
                if (existing) {
                    try {
                        const lock = JSON.parse(existing);
                        if (lock.clientId !== clientId) {
                            return {
                                code: 409,
                                message: '任务正被其他设备操作',
                                lockedBy: lock.deviceId || '未知设备',
                                expiresAt: lock.expiresAt
                            };
                        }
                    } catch (e) {
                        // 锁数据损坏，当作无锁处理
                    }
                }

                const expiresAt = Date.now() + 60000;
                await cache.set(lockKey, JSON.stringify({
                    clientId,
                    deviceId: deviceId || 'unknown',
                    timestamp: Date.now(),
                    expiresAt
                }), { expire: 60 });

                return { code: 0, locked: true, expiresAt };
            }

            case 'unlockTask': {
                const { taskId, clientId } = data;
                if (!taskId || !clientId) {
                    return { code: 400, message: '缺少 taskId 或 clientId' };
                }

                const lockKey = `task_lock_${uid}_${taskId}`;
                const cache = app.cache();

                const existing = await cache.get(lockKey);
                if (existing) {
                    try {
                        const lock = JSON.parse(existing);
                        if (lock.clientId === clientId) {
                            await cache.del(lockKey);
                        }
                    } catch (e) {
                        await cache.del(lockKey);
                    }
                }

                return { code: 0 };
            }

            case 'checkLock': {
                const { taskId } = data;
                if (!taskId) {
                    return { code: 400, message: '缺少 taskId' };
                }

                const lockKey = `task_lock_${uid}_${taskId}`;
                const cache = app.cache();

                const existing = await cache.get(lockKey);
                if (existing) {
                    try {
                        const lock = JSON.parse(existing);
                        return { code: 0, locked: true, lock };
                    } catch (e) {
                        return { code: 0, locked: false };
                    }
                }

                return { code: 0, locked: false };
            }

            default:
                return { code: 400, message: `未知操作: ${action}` };
        }

    } catch (e) {
        console.error(`[timebankTaskLock] action=${action} 失败:`, e);
        return { code: 500, message: e.message || '服务端错误' };
    }
};
