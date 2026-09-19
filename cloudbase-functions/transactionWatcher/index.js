/**
 * CloudBase Watch 订阅 - Transaction 变更监听
 * 
 * 功能：
 * 1. 定时轮询检查 tb_transaction 集合的新增记录
 * 2. 提取新增交易 ID 列表
 * 3. 调用 Hermes /analyze-incremental API
 * 4. 返回洞察结果（可选）
 * 
 * 部署方式：tcb fn deploy transactionWatcher --force
 */

const cloudbase = require('@cloudbase/node-sdk');

// 初始化 CloudBase SDK（使用子账号密钥）
const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.TC_SECRET_ID,
  secretKey: process.env.TC_SECRET_KEY,
});

const db = app.database();
const COLLECTION_NAME = 'tb_transaction';

// 上次检查的时间戳（从环境变量读取，默认 24 小时前）
const LAST_CHECK_TIME = process.env.LAST_CHECK_TIME ? parseInt(process.env.LAST_CHECK_TIME) : Date.now() - 86400000;

// 轮询间隔（分钟），默认 5 分钟
const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES) || 5;

// Hermes 服务地址（从环境变量读取，支持多域名容错）
const HERMES_BASES = [
  process.env.HERMES_BASE_URL_1 || 'https://cloud1-8gvjsmyd7860b4a3-1304758747.ap-shanghai.app.tcloudbase.com/timebank-hermes',
  process.env.HERMES_BASE_URL_2 || 'https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebank-hermes',
  process.env.HERMES_BASE_URL_3 || 'https://timebank-hermes-216667-7-1384910920.sh.run.tcloudbase.com',
];

/**
 * 云函数入口（定时触发器调用）
 */
exports.main = async (event, context) => {
  console.log('[TransactionPoller] Starting scheduled poll...');
  
  try {
    // [v9.37.0] 修复字段不匹配（后端扫描 P1）：交易文档实际写入的是数值 timestamp，
    // 旧代码查询/排序 createdAt（该字段不存在）→ 查询恒为空，整条增量分析链路实际从未生效。
    // 注：本函数当前随管家 Hermes 一并停用（前端已切断调用），保留修正以便后续复活；
    // 复活时还需修复「轮询游标未持久化」（模块级常量每次冷启动重置为 24 小时前）的问题。
    const checkTime = new Date(LAST_CHECK_TIME).getTime();
    console.log(`[TransactionPoller] Checking for transactions after ${new Date(checkTime).toISOString()}`);

    const result = await db.collection(COLLECTION_NAME)
      .where({
        timestamp: db.command.gte(checkTime)
      })
      .orderBy('timestamp', 'asc')
      .limit(50)
      .get();
    
    const newTxs = result.data || [];
    
    if (newTxs.length === 0) {
      console.log('[TransactionPoller] No new transactions found');
      return { code: 0, message: 'No new transactions' };
    }
    
    console.log(`[TransactionPoller] Found ${newTxs.length} new transactions`);
    
    // 2. 按 openid 分组处理
    const txsByOpenid = new Map();
    newTxs.forEach(tx => {
      const openid = tx._openid || tx.openid;
      if (!openid) {
        console.warn('[TransactionPoller] Skipping transaction without openid:', tx._id);
        return;
      }
      
      if (!txsByOpenid.has(openid)) {
        txsByOpenid.set(openid, []);
      }
      txsByOpenid.get(openid).push(tx);
    });
    
    // 3. 对每个用户调用 Hermes 分析
    const results = [];
    for (const [openid, txs] of txsByOpenid.entries()) {
      try {
        const insight = await analyzeUserTransactions(openid, txs);
        results.push({ openid, count: txs.length, success: true });
        console.log(`[TransactionPoller] ✅ Analyzed ${openid}: ${txs.length} transactions`);
      } catch (error) {
        console.error(`[TransactionPoller] ❌ Failed to analyze ${openid}:`, error);
        results.push({ openid, count: txs.length, success: false, error: error.message });
      }
    }
    
    // 4. 更新最后检查时间
    const now = Date.now();
    console.log(`[TransactionPoller] Updating last check time to ${now}`);
    
    return {
      code: 0,
      message: 'Success',
      totalNewTransactions: newTxs.length,
      analyzedUsers: results.length,
      results,
      lastCheckTime: now,
    };
    
  } catch (error) {
    console.error('[TransactionPoller] FAIL:', error);
    return {
      code: 500,
      message: error.message,
    };
  }
};

// ============================================================
// 辅助函数
// ============================================================

/**
 * 分析用户交易并调用 Hermes API
 */
async function analyzeUserTransactions(openid, txs) {
  // 构建新增交易 JSON
  const newTxsJSON = JSON.stringify(txs.map(tx => ({
    id: tx._id,
    type: tx.type,
    amount: tx.amount,
    taskName: tx.taskName,
    timestamp: tx.timestamp || tx.createdAt,
    isBackdate: tx.isBackdate || false,
    isAutoDetected: tx.isAutoDetected || false,
    deviceId: tx.deviceId || 'unknown',
  })));
  
  // 获取上次分析 checkpoint
  const checkpoint = await getCheckpoint(openid);
  const lastCheckpointTs = checkpoint.lastCheckpointTs || 0;
  
  // 调用 Hermes 增量分析 API
  console.log(`[TransactionPoller] Calling Hermes incremental analysis for ${openid}...`);
  const insight = await callHermesIncrementalAnalysis(openid, newTxsJSON, lastCheckpointTs);
  
  // 更新 checkpoint
  await updateCheckpoint(openid, {
    lastAnalyzedAt: Date.now(),
    lastCheckpointTs: Math.max(...txs.map(t => new Date(t.createdAt || t.timestamp).getTime())),
  });
  
  return insight;
}

/**
 * 从交易记录获取 openid
 */
async function getOpenidFromTransaction(txId) {
  try {
    const res = await db.collection(COLLECTION_NAME).doc(txId).get();
    return res.data?._openid || null;
  } catch (error) {
    console.error('[getOpenidFromTransaction] Error:', error);
    return null;
  }
}

/**
 * 获取用户分析 checkpoint
 */
async function getCheckpoint(openid) {
  try {
    const res = await db.collection('tb_ai_brain').where({ _openid: openid }).limit(1).get();
    return res.data?.[0] || {};
  } catch (error) {
    console.error('[getCheckpoint] Error:', error);
    return {};
  }
}

/**
 * 更新用户分析 checkpoint
 */
async function updateCheckpoint(openid, updates) {
  try {
    const res = await db.collection('tb_ai_brain').where({ _openid: openid }).limit(1).get();
    if (res.data && res.data.length > 0) {
      await db.collection('tb_ai_brain').doc(res.data[0]._id).update(updates);
    } else {
      await db.collection('tb_ai_brain').add({
        _openid: openid,
        ...updates,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    console.error('[updateCheckpoint] Error:', error);
  }
}

/**
 * 调用 Hermes 增量分析 API
 */
async function callHermesIncrementalAnalysis(openid, newTxsJSON, lastCheckpointTs) {
  // 尝试所有域名，直到成功
  for (let i = 0; i < HERMES_BASES.length; i++) {
    try {
      const baseUrl = HERMES_BASES[i];
      console.log(`[callHermesIncrementalAnalysis] Trying base ${i + 1}: ${baseUrl}`);
      
      const response = await fetch(`${baseUrl}/analyze-incremental`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openid,
          newTransactions: newTxsJSON,
          lastCheckpointTs,
        }),
        timeout: 30000, // 30 秒超时
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log(`[callHermesIncrementalAnalysis] Success with base ${i + 1}`);
      return result.insight || result;
      
    } catch (error) {
      console.warn(`[callHermesIncrementalAnalysis] Base ${i + 1} failed:`, error.message);
      
      // 如果是最后一个域名，抛错
      if (i === HERMES_BASES.length - 1) {
        throw error;
      }
      
      // 否则继续尝试下一个
      continue;
    }
  }
}
