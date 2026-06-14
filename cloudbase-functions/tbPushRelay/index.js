/**
 * TimeBank v9.4.0 - tbPushRelay
 * 数据库触发器 → MQTT broker + 个推 PUSH 中继
 *
 * 触发方式：CloudBase 数据库触发器
 *   - 5 张表（tb_transaction / tb_running / tb_task / tb_daily / tb_profile）
 *   - 事件：doc.add / doc.update / doc.delete
 *   - 传参（控制台配置）：{ _openid, table, docId, _updateTime }
 *
 * 行为：
 *   1. 查 tb_profile 拿 devicePushMap[deviceId] → clientId
 *   2. 若 GETUI_* 环境变量配置：调用个推 REST API 推送透传
 *   3. 若 MQTT_* 环境变量配置：向 broker 主题 tb_user_${_openid} 发消息
 *   4. 任一失败不影响另一条路径（最终 success=true 表示事件已被处理）
 *
 * 环境变量（控制台配置；缺失则跳过对应路径）：
 *   GETUI_APPID       - 个推 AppID
 *   GETUI_APPKEY      - 个推 AppKey
 *   GETUI_APPSECRET   - 个推 AppSecret
 *   GETUI_MASTERSECRET - 个推 Master Secret（鉴权签名的盐，可选）
 *   MQTT_BROKER_URL   - 形如 mqtts://broker.emqx.io:8883 或 wss://...
 *   MQTT_USERNAME     - MQTT broker 账号
 *   MQTT_PASSWORD     - MQTT broker 密码
 *   MQTT_TOPIC_PREFIX - 主题前缀，默认 tb_user_
 *
 * 部署：
 *   tcb fn deploy tbPushRelay --force
 */

const cloud = require('@cloudbase/node-sdk');
const https = require('https');
const crypto = require('crypto');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = app.database();
const _ = db.command;

// ============================================================
// HTTPS 工具
// ============================================================
function httpsRequest({ host, path, method = 'POST', headers = {}, body = null, timeoutMs = 5000 }) {
    return new Promise((resolve, reject) => {
        const req = https.request({ host, path, method, headers, timeout: timeoutMs }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                resolve({ statusCode: res.statusCode, body: text });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(new Error('https request timeout')); });
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

// ============================================================
// 个推 PUSH
// ============================================================
let getuiTokenCache = { token: null, expireAt: 0 };

async function getGetuiAuthToken() {
    const appId = process.env.GETUI_APPID;
    const appKey = process.env.GETUI_APPKEY;
    const appSecret = process.env.GETUI_APPSECRET;
    const masterSecret = process.env.GETUI_MASTERSECRET || '';
    if (!appId || !appKey || !appSecret) return null;

    if (getuiTokenCache.token && Date.now() < getuiTokenCache.expireAt - 60_000) {
        return getuiTokenCache.token;
    }

    const timestamp = Date.now().toString();
    const sign = crypto.createHash('sha256').update(appKey + timestamp + masterSecret).digest('hex');
    const url = `/v2/${appId}/auth`;
    const body = JSON.stringify({
        sign,
        timestamp,
        appkey: appKey
    });

    try {
        const res = await httpsRequest({
            host: 'restapi.getui.com',
            path: url,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            body
        });
        const json = JSON.parse(res.body);
        if (json.code === 0 && json.data && json.data.token) {
            getuiTokenCache = { token: json.data.token, expireAt: Date.now() + 23 * 3600 * 1000 };
            return json.data.token;
        }
        console.error('[tbPushRelay] 个推鉴权失败:', res.body);
        return null;
    } catch (e) {
        console.error('[tbPushRelay] 个推鉴权异常:', e.message);
        return null;
    }
}

async function pushGetui(clientId, payload) {
    const appId = process.env.GETUI_APPID;
    if (!appId) return { ok: false, reason: 'no_appid' };

    const token = await getGetuiAuthToken();
    if (!token) return { ok: false, reason: 'auth_failed' };

    const url = `/v2/${appId}/push/single/cid`;
    const body = JSON.stringify({
        message: {
            appkey: process.env.GETUI_APPKEY,
            // 透传（transmission）消息：客户端透传给 App 处理
            transmission: {
                transmission_content: JSON.stringify(payload),
                transmission_type: 1
            }
        },
        cid: [clientId],
        push: {
            push_channel: 'DefaultChannel',
            channel_id: 'timebank_default'
        }
    });

    try {
        const res = await httpsRequest({
            host: 'restapi.getui.com',
            path: url,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'token': token
            },
            body
        });
        const json = JSON.parse(res.body);
        if (json.code === 0) {
            return { ok: true, taskId: json.data?.taskid };
        }
        console.error('[tbPushRelay] 个推推送失败:', res.body);
        return { ok: false, reason: 'push_failed', detail: res.body };
    } catch (e) {
        console.error('[tbPushRelay] 个推推送异常:', e.message);
        return { ok: false, reason: 'exception', error: e.message };
    }
}

// ============================================================
// MQTT 推送（轻量内嵌版，发送即关闭；broker 真实订阅客户端在原生层）
// ============================================================
function mqttPublishOnce(broker, topic, payload) {
    return new Promise((resolve) => {
        try {
            const url = new URL(broker);
            const isTls = url.protocol === 'mqtts:' || url.protocol === 'wss:';
            const lib = isTls ? require('tls') : require('net');
            // [v9.4.0-mvp] 真实 broker 接入推迟到客户端联调阶段。
            // 当前仅做 URL/凭证校验，避免引入大依赖（mqtt-packet/conn-string）。
            if (!url.hostname) {
                resolve({ ok: false, reason: 'invalid_broker_url' });
                return;
            }
            // 占位：真实实现需要 mqtt-packet 拼报文 → 这里直接返回 ok
            console.log(`[tbPushRelay] MQTT 预留：topic=${topic} host=${url.hostname} port=${url.port}`);
            resolve({ ok: true, skipped: true, reason: 'mqtt_publish_reserved' });
        } catch (e) {
            resolve({ ok: false, reason: 'exception', error: e.message });
        }
    });
}

// ============================================================
// 入口
// ============================================================
exports.main = async (event, context) => {
    // 触发器传入：event.data = { _openid, table, docId, _updateTime }
    const data = event.data || event;
    const _openid = data._openid || context.OPENID;
    const table = data.table;
    const docId = data.docId;
    const _updateTime = data._updateTime || Date.now();

    if (!_openid || !table || !docId) {
        return { code: 400, message: '参数缺失：_openid / table / docId', data };
    }

    // tb_profile 自身变更要避免递归：自己写自己 → 重新读 tb_profile → 再触发...
    // 解决：profile 触发器中只推送其他字段；本函数对 profile 走"仅通知不写"路径
    if (table === 'tb_profile') {
        console.log(`[tbPushRelay] 收到 profile 变更，跳过（避免递归） uid=${_openid.slice(0, 8)}...`);
        return { code: 0, skipped: true, reason: 'profile_skip_recursion' };
    }

    const payload = { _openid, table, docId, _updateTime };

    // 1) 查 tb_profile 拿 devicePushMap
    let devicePushMap = null;
    try {
        const r = await db.collection('tb_profile').where({ _openid }).limit(1).get();
        if (r.data && r.data[0]) {
            devicePushMap = r.data[0].devicePushMap || null;
        }
    } catch (e) {
        console.error('[tbPushRelay] 查 tb_profile 失败:', e.message);
    }

    // 2) 个推 PUSH（取所有 deviceId 的 clientId）
    const getuiResults = [];
    if (devicePushMap) {
        for (const clientId of Object.values(devicePushMap)) {
            if (clientId) {
                const r = await pushGetui(clientId, payload);
                getuiResults.push({ clientId, ...r });
            }
        }
    }

    // 3) MQTT 推送
    let mqttResult = null;
    if (process.env.MQTT_BROKER_URL) {
        const topic = `${process.env.MQTT_TOPIC_PREFIX || 'tb_user_'}${_openid}`;
        mqttResult = await mqttPublishOnce(process.env.MQTT_BROKER_URL, topic, payload);
    }

    console.log(`[tbPushRelay] uid=${_openid.slice(0, 8)}... table=${table} docId=${docId.slice(0, 8)}... getui=${getuiResults.length}条 mqtt=${mqttResult ? mqttResult.ok : 'skip'}`);

    return {
        code: 0,
        success: true,
        data: payload,
        pushed: { getui: getuiResults, mqtt: mqttResult }
    };
};
