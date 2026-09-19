// 打印 AI 模型调用 403 的具体响应体，定位原因
const cloudbase = require('@cloudbase/node-sdk');
(async () => {
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID || 'cloud1-8gvjsmyd7860b4a3',
    secretId: process.env.TC_SECRET_ID,
    secretKey: process.env.TC_SECRET_KEY,
  });
  try {
    const ai = app.ai();
    const m = ai.createModel('cloudbase');
    await m.generateText({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: '回应' }] });
    console.log('AIOK');
  } catch (e) {
    console.log('AIFail', e.message);
    if (e.response && e.response.data) console.log('BODY:', JSON.stringify(e.response.data));
    if (e.data) console.log('EDATA:', JSON.stringify(e.data));
  }
})();