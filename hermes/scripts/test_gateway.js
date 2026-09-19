// 实测 CloudBase 资源点 OpenAI 兼容网关（与 timebankAI 同通道）
const fs = require('fs');

function loadEnv(file) {
  const out = {};
  const txt = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] !== 'COS_BUCKET') out[m[1]] = m[2];
  }
  return out;
}
const env = loadEnv('d:/TimeBank/hermes/.env');

(async () => {
  const envId = env.CLOUDBASE_ENV_ID || 'cloud1-8gvjsmyd7860b4a3';
  const url = env.CLOUDBASE_AI_BASE || `https://${envId}.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions`;
  const key = env.CLOUDBASE_SERVER_API_KEY;
  const models = process.env.TEST_MODELS ? process.env.TEST_MODELS.split(',') : ['hy4-preview'];
  const extra = process.env.TEST_THINK === 'false' ? { enable_thinking: false } : {};

  for (const model of models) {
    const body = {
      model,
      messages: [
        { role: 'system', content: '你是 TimeBank 时间管理管家，简洁回答。' },
        { role: 'user', content: '用一句话说：如何看待每天做记录这类小事？' },
      ],
      temperature: 0.4,
      max_tokens: 120,
      stream: false,
      ...extra,
    };
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      console.log(`\n[${model}] HTTP ${r.status}: ${content ? content : text.slice(0, 300)}`);
    } catch (e) {
      console.log(`\n[${model}] FAIL ${e.message}`);
    }
  }
})();