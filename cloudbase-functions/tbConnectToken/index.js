/**
 * TimeBank v9.4.0 - tbConnectToken
 * MQTT 长连接短时 token 签发（5min JWT，HS256）
 *
 * 调用方式：
 *   客户端 → tb.callFunction({ name: 'tbConnectToken', data: {} })
 *
 * 返回：
 *   { code: 0, token: 'eyJ...', expiresAt: 1700000000000, broker: {...} }
 *
 * 环境变量（控制台配置）：
 *   MQTT_TOKEN_SECRET  - JWT 签名密钥（必须）
 *   MQTT_BROKER_URL    - 形如 wss://your-broker.mqtt.qq.com:8084
 *   MQTT_USERNAME      - MQTT broker 服务端账号
 *   MQTT_PASSWORD      - MQTT broker 服务端密码
 *   MQTT_TOPIC_PREFIX  - 主题前缀，默认 tb_user_
 *
 * 部署：
 *   tcb fn deploy tbConnectToken --force
 */

const cloud = require('@cloudbase/node-sdk');
const crypto = require('crypto');

const app = cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// base64url 编码（JWT 用）
function b64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return buf.toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// HS256 签名
function signHS256(header, payload, secret) {
    const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest();
    return `${data}.${b64url(sig)}`;
}

exports.main = async (event, context) => {
    // [v9.0.0-fix] Web SDK callFunction 不自动注入 OPENID
    const uid = context.OPENID || event._openid || event.data?._openid || null;
    if (!uid) {
        return { code: 401, message: '未授权：请先登录' };
    }

    const secret = process.env.MQTT_TOKEN_SECRET;
    if (!secret) {
        console.error('[tbConnectToken] 缺少环境变量 MQTT_TOKEN_SECRET');
        return { code: 500, message: '服务端未配置签名密钥' };
    }

    const TTL_SEC = 300; // 5 分钟
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + TTL_SEC;
    const payload = {
        _openid: uid,
        iat,
        exp,
        // jti（可选）：防重放
        jti: crypto.randomBytes(8).toString('hex')
    };
    const token = signHS256({ alg: 'HS256', typ: 'JWT' }, payload, secret);

    // 返回 broker 配置（仅配置了就返回；未配置则不返回，客户端用 SharedPreferences 兜底）
    const broker = {};
    if (process.env.MQTT_BROKER_URL) {
        broker.url = process.env.MQTT_BROKER_URL;
        broker.username = process.env.MQTT_USERNAME || null;
        broker.password = process.env.MQTT_PASSWORD || null;
        broker.topicPrefix = process.env.MQTT_TOPIC_PREFIX || 'tb_user_';
    }

    console.log(`[tbConnectToken] ✓ 已签发 token uid=${uid.slice(0, 8)}... exp=${exp}`);

    return {
        code: 0,
        token,
        expiresAt: exp * 1000,
        serverTime: Date.now(),
        broker
    };
};
