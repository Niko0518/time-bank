// 验证：用子账号密钥直接调腾讯云混元（hunyuan），看资源点模型是否可从进程调用。
const tencentcloud = require("tencentcloud-sdk-nodejs-hunyuan");

(async () => {
  const secretId = process.env.TC_SECRET_ID;
  const secretKey = process.env.TC_SECRET_KEY;
  if (!secretId || !secretKey) {
    console.error("缺少 TC_SECRET_ID / TC_SECRET_KEY");
    process.exit(1);
  }
  const HunyuanClient = tencentcloud.hunyuan.v20230901.Client;
  const client = new HunyuanClient({
    credential: { secretId, secretKey },
    region: "ap-guangzhou", // 混元服务地域
    profile: { httpProfile: { endpoint: "hunyuan.tencentcloudapi.com" } },
  });
  try {
    const res = await client.ChatCompletions({
      Model: "hunyuan-lite",
      Messages: [{ Role: "user", Content: "你好，用一句话介绍你自己" }],
    });
    const text = (res.Choices && res.Choices[0] && res.Choices[0].Message && res.Choices[0].Message.Content) || "";
    console.log("HunyuanOK:", text.slice(0, 120));
  } catch (e) {
    console.error("HunyanuFail:", e.message || JSON.stringify(e));
    process.exit(1);
  }
})();