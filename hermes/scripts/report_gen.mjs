// 端到端：读 tb_transaction/tb_daily → 调云开发资源点模型(hy4-preview→hy3) → 写日报到 tb_ai_messages
import fs from 'fs';
import cloudbase from '@cloudbase/node-sdk';

function loadEnv(file) {
  const out = {};
  const txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const E = loadEnv('d:/TimeBank/hermes/.env');
const type = process.argv[2] || 'daily';
const openid = E.TARGET_USER_OPENID;

const app = cloudbase.init({
  env: E.CLOUDBASE_ENV_ID || 'cloud1-8gvjsmyd7860b4a3',
  secretId: E.TC_SECRET_ID,
  secretKey: E.TC_SECRET_KEY,
});
const db = app.database();

async function main() {
  // 1) 读数据
  const [tx, daily] = await Promise.all([
    db.collection('tb_transaction').orderBy('timestamp', 'desc').limit(40).get(),
    db.collection('tb_daily').orderBy('date', 'desc').limit(7).get(),
  ]);
  const txs = (tx.data || []).slice(0, 20).map(t => ({ n: t.taskName, amt: t.amount, type: t.type, ts: t.timestamp, desc: (t.description||'').slice(0,40) }));
  console.log('[read] transactions=%d daily=%d openid=%s', (tx.data||[]).length, (daily.data||[]).length, openid.slice(0,8));

  // 2) 模型链调用
  const url = E.CLOUDBASE_AI_BASE || `https://${E.CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions`;
  const chain = [E.CLOUDBASE_AI_MODEL || 'hy4-preview', E.CLOUDBASE_AI_FALLBACK_MODEL || 'hy3'];
  const system = '你是 TimeBank 的时间管家与健康分析师。基于用户的真实交易/任务/每日统计数据，做跨维度深度分析并给可执行建议，中文，约200-300字，语气温和。';
  const user = `请生成一份今天的${type === 'weekly' ? '周' : type === 'monthly' ? '月' : '日'}度高阶分析报告。数据如下：\n近20笔交易: ${JSON.stringify(txs)}\n近7天每日统计: ${JSON.stringify((daily.data||[]).slice(0,7))}`;

  let content = '';
  for (const model of chain) {
    const r = await fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${E.CLOUDBASE_SERVER_API_KEY}` },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.4, max_tokens: 2000, stream: false }) });
    const data = await r.json();
    const msg = (data.choices?.[0]?.message) || {};
    content = msg.content || msg.reasoning_content || '';
    console.log(`[model] ${model} HTTP${r.status} 正文长度=${(content||'').length} model=${data.model||''}`);
    if (content.trim()) break;
  }
  if (!content.trim()) { console.error('模型未返回正文，中止，不写入。'); process.exit(1); }

  // 3) 写 tb_ai_messages（与前端 getReports 兼容）
  const title = { daily: 'AI 日报 · 管家', weekly: 'AI 周报 · 管家', monthly: 'AI 月报 · 管家' }[type] || 'AI 报告 · 管家';
  const doc = {
    _openid: openid,
    type: `report_${type}`,
    role: 'assistant',
    title,
    content,
    isRead: false,
    createdAt: Date.now(),
    meta: { source: 'hermes', generator: 'deep-report', model: 'auto-chain' },
  };
  const add = await db.collection('tb_ai_messages').add(doc);
  console.log('写回成功 _id =', add.id);
  console.log('\n--- 报告正文预览(前300字) ---\n' + content.slice(0, 300));
}
main().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });