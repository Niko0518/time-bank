// TimeBank 报告桥（容器内运行）：读 CloudBase 数据 → 调资源点模型(hy3) → 写 tb_ai_messages
// 用法: node report.mjs [daily|weekly|monthly]
// 全部凭据/配置从环境变量读取（云托管注入）。
// 通道与本机 report_gen.mjs 完全一致（2026-09-19 实测验证）。
import cloudbase from '@cloudbase/node-sdk';

const E = process.env;
const ENV_ID = E.CLOUDBASE_ENV_ID || '';
const OPENID = E.TARGET_USER_OPENID || '';
const MODEL = E.CLOUDBASE_AI_MODEL || 'hy3';
const GATEWAY = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions`;
const KEY = E.CLOUDBASE_SERVER_API_KEY || '';

const type = process.argv[2] || 'daily';
const TITLES = { daily: 'AI 日报 · 管家', weekly: 'AI 周报 · 管家', monthly: 'AI 月报 · 管家' };

const app = cloudbase.init({
  env: ENV_ID,
  secretId: E.TC_SECRET_ID,
  secretKey: E.TC_SECRET_KEY,
});
const db = app.database();

async function main() {
  // 1) 读数据（近40笔交易 + 近7天统计）
  const [tx, daily] = await Promise.all([
    db.collection('tb_transaction').orderBy('timestamp', 'desc').limit(40).get(),
    db.collection('tb_daily').orderBy('date', 'desc').limit(7).get(),
  ]);
  const txs = (tx.data || []).slice(0, 20).map(t => ({
    n: t.taskName, amt: t.amount, type: t.type, ts: t.timestamp,
    desc: (t.description || '').slice(0, 40),
  }));
  console.log(`[bridge] read tx=${(tx.data || []).length} daily=${(daily.data || []).length}`);

  // 2) 调模型（hy3 干净正文；链式回退可扩展）
  const system = '你是 TimeBank 的时间管家与健康分析师。基于用户的真实交易/任务/每日统计数据，做跨维度深度分析并给可执行建议，中文，200-300字，语气温和。';
  const label = { daily: '日', weekly: '周', monthly: '月' }[type] || '日';
  const user = `请生成一份${label}度高阶分析报告。数据：\n近20笔交易: ${JSON.stringify(txs)}\n近7天每日统计: ${JSON.stringify((daily.data || []).slice(0, 7))}`;

  const r = await fetch(GATEWAY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.4, max_tokens: 2000, stream: false,
    }),
  });
  const data = await r.json();
  const msg = (data.choices?.[0]?.message) || {};
  const content = msg.content || msg.reasoning_content || '';
  if (!content.trim()) throw new Error(`模型未返回正文: ${JSON.stringify(data).slice(0, 200)}`);
  console.log(`[bridge] model=${MODEL} HTTP${r.status} len=${content.length}`);

  // 3) 写 tb_ai_messages（前端 getReports 兼容 schema）
  const doc = {
    _openid: OPENID,
    type: `report_${type}`,
    role: 'assistant',
    title: TITLES[type] || 'AI 报告 · 管家',
    content,
    isRead: false,
    createdAt: Date.now(),
    meta: { source: 'hermes', generator: 'hermes-bridge', model: MODEL },
  };
  const add = await db.collection('tb_ai_messages').add(doc);
  console.log(`[bridge] written _id=${add.id}`);
  console.log(content);
}
main().catch(e => { console.error('[bridge] FAIL', e.message || e); process.exit(1); });