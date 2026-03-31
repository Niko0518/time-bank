# TimeBank 服务端任务锁云函数部署指南

## 环境信息
- **云函数名称**: `timebankTaskLock`
- **运行环境**: Node.js 18.15
- **所属环境**: `cloud1-8gvjsmyd7860b4a3`

---

## 操作步骤

### 第一步：创建云函数

1. 打开腾讯云开发控制台：https://console.cloud.tencent.com/tcb
2. 进入左侧菜单 **「云函数」**
3. 点击 **「新建云函数」** 按钮
4. 填写配置：
   - **函数名称**: `timebankTaskLock`
   - **运行环境**: 选择 **Node.js 18.15**
   - **创建方式**: 选择 **「空白创建」**
5. 点击 **「开始创建」**

### 第二步：写入云函数代码

1. 进入 `timebankTaskLock` 云函数编辑页面
2. 将 `index.js` 文件内容**全部替换**为以下代码：

```javascript
/**
 * TimeBank 服务端任务锁云函数 - timebankTaskLock
 * [v7.30.0] 跨设备任务操作互斥锁
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
    const uid = context.OPENID;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const { action, data = {} } = event;

    try {
        switch (action) {

            /**
             * lockTask - 申请任务锁
             * 参数: { taskId: string, clientId: string, deviceId: string }
             * 返回: { code: 0|409, locked: boolean, expiresAt: number }
             */
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
                        // 锁是自己持有的，续期
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

            /**
             * unlockTask - 释放任务锁
             * 参数: { taskId: string, clientId: string }
             */
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

            /**
             * checkLock - 查询任务锁状态
             * 参数: { taskId: string }
             * 返回: { code: 0, locked: boolean, lock?: object }
             */
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
```

3. 点击 **「保存」** 按钮

### 第三步：安装依赖

1. 在云函数编辑页面，找到 **「依赖安装」** 或 **「package.json」** 配置区域
2. 点击 **「保存并安装依赖」** 或 **「安装依赖」** 按钮
3. 等待依赖安装完成（`@cloudbase/node-sdk` 是云函数内置 SDK，通常无需额外安装）

### 第四步：部署确认

1. 部署完成后，在云函数列表中确认状态为 **「正常」**
2. 可选：使用控制台的「测试」功能，输入以下测试参数：

```json
{
  "action": "checkLock",
  "data": {
    "taskId": "test_task_123"
  }
}
```

预期返回：
```json
{
  "code": 0,
  "locked": false
}
```

---

## 客户端集成说明

部署完成后，客户端可通过以下方式调用：

```javascript
// DAL 新增方法
async lockTask(taskId) {
    const res = await app.callFunction({
        name: 'timebankTaskLock',
        data: { action: 'lockTask', data: { taskId, clientId, deviceId } }
    });
    return res.result;
}

async unlockTask(taskId) {
    const res = await app.callFunction({
        name: 'timebankTaskLock',
        data: { action: 'unlockTask', data: { taskId, clientId } }
    });
    return res.result;
}

async checkLock(taskId) {
    const res = await app.callFunction({
        name: 'timebankTaskLock',
        data: { action: 'checkLock', data: { taskId } }
    });
    return res.result;
}
```

---

## 故障排查

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| 返回 401 | 用户未登录 | 确保用户已登录 CloudBase |
| 返回 500 | 代码错误 | 检查 index.js 是否保存成功 |
| 锁一直存在 | 设备崩溃未释放 | 等待 60 秒自动过期 |
| 依赖安装失败 | 网络问题 | 重试或检查控制台日志 |
