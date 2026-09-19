// 读取一条 tb_transaction，打印其 _openid（用于填充 TARGET_USER_OPENID）
// 用法：凭据从环境读（TC_SECRET_ID/TC_SECRET_KEY/CLOUDBASE_ENV_ID）
const cloudbase = require('@cloudbase/node-sdk');

(async () => {
  const secretId = process.env.TC_SECRET_ID;
  const secretKey = process.env.TC_SECRET_KEY;
  const envId = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gvjsmyd7860b4a3';
  if (!secretId || !secretKey) {
    console.error('缺少 TC_SECRET_ID / TC_SECRET_KEY');
    process.exit(1);
  }
  const app = cloudbase.init({ env: envId, secretId, secretKey });
  const db = app.database();
  try {
    const res = await db.collection('tb_transaction').limit(1).get();
    const docs = res.data || [];
    if (docs.length === 0) {
      console.log('tb_transaction 为空');
    } else {
      console.log('sample _openid =', docs[0]._openid);
      console.log('sample keys =', Object.keys(docs[0]));
    }
  } catch (e) {
    console.error('查询失败:', e.message || e);
    process.exit(1);
  }
})();