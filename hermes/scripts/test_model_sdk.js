// 探测：环境是否可用 CloudBase AI 模型（Token Credits / TokenHub）。
const cloudbase = require('@cloudbase/node-sdk');

(async () => {
  const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gvjsmyd7860b4a3';
  const app = cloudbase.init({ env: envId, secretId: process.env.TC_SECRET_ID, secretKey: process.env.TC_SECRET_KEY });
  try {
    const ai = app.ai;
    const model = ai.createModel("cloudbase");
    const res = await model.generateText({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "用一句话回应" }],
    });
    console.log("AIOK:", typeof res === "string" ? res : JSON.stringify(res));
  } catch (e) {
    console.error("AIFail:", e.message || JSON.stringify(e));
    process.exit(1);
  }
})();