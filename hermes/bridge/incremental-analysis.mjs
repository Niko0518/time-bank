/**
 * TimeBank Hermes - 增量分析脚本
 * 
 * 功能：
 * 1. 接收新增交易列表（来自 CloudBase Watch）
 * 2. 对比上次分析时间点
 * 3. 识别新模式/中断/突破
 * 4. 生成即时洞察并更新 USER.md
 * 
 * 用法：node incremental-analysis.mjs [openid] [lastCheckpointTs] [newTransactionsJSON]
 */

import cloudbase from '@cloudbase/node-sdk';
import { normalizeAllTransactions } from './data-normalizer.mjs';

const E = process.env;
const ENV_ID = E.CLOUDBASE_ENV_ID || '';
const OPENID = process.argv[2] || E.TARGET_USER_OPENID || '';
const MODEL = E.CLOUDBASE_AI_MODEL || 'hy3';
const GATEWAY = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/ai/cloudbase/chat/completions`;
const KEY = E.CLOUDBASE_SERVER_API_KEY || '';

const app = cloudbase.init({
  env: ENV_ID,
  secretId: E.TC_SECRET_ID,
  secretKey: E.TC_SECRET_KEY,
});
const db = app.database();

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log(`[incremental] Starting incremental analysis for openid: ${OPENID.substring(0, 8)}...`);
  
  try {
    // 1. 解析参数
    const lastCheckpointTs = parseInt(process.argv[3] || '0');
    const newTxsRaw = process.argv[4];
    
    if (!newTxsRaw) {
      console.error('[incremental] Missing new transactions JSON');
      process.exit(1);
    }
    
    const newTxs = JSON.parse(newTxsRaw);
    console.log(`[incremental] Received ${newTxs.length} new transactions`);
    
    if (newTxs.length === 0) {
      console.log('[incremental] No new transactions, skipping');
      return;
    }
    
    // 2. 读取用户画像（USER.md / MEMORY.md）
    console.log('[incremental] Loading user profile...');
    const userProfile = await loadUserProfile(OPENID);
    
    // 3. 数据清洗与标注
    console.log('[incremental] Normalizing new transactions...');
    const { normalized } = normalizeAllTransactions(newTxs);
    
    // 4. 分析增量变化
    console.log('[incremental] Analyzing incremental changes...');
    const insights = analyzeIncrementalChanges(normalized, userProfile);
    
    // 5. 构建精简版 AI 分析 prompt（包含用户画像）
    console.log('[incremental] Building concise AI analysis prompt...');
    const aiPrompt = buildConciseAnalysisPrompt(insights, userProfile);
    
    // 6. 调用 hy3 生成个性化洞察（精简版，快速响应）
    console.log('[incremental] Calling hy3 for quick insights...');
    const startTime = Date.now();
    const aiResponse = await callAI(aiPrompt);
    const elapsed = Date.now() - startTime;
    console.log(`[incremental] ⚡ AI response received in ${elapsed}ms (${(elapsed/1000).toFixed(1)}s)`);
    
    // 7. 写入 tb_ai_messages (type='realtime_insight')
    console.log('[incremental] Writing to tb_ai_messages...');
    await writeRealtimeInsight(OPENID, {
      type: 'realtime_insight',
      content: aiResponse,
      insightType: insights.summary.type,
      transactionCount: newTxs.length,
      generatedAt: Date.now(),
    });
    
    // 8. 更新 checkpoint
    console.log('[incremental] Updating checkpoint...');
    await updateCheckpoint(OPENID, {
      lastAnalyzedAt: Date.now(),
      lastCheckpointTs: Math.max(...newTxs.map(t => new Date(t.timestamp).getTime())),
      totalInsightsGenerated: (userProfile.insightCount || 0) + 1,
    });
    
    console.log('[incremental] ✅ Done! Insight written to tb_ai_messages');
    console.log('\n=== Summary ===');
    console.log(`New transactions: ${newTxs.length}`);
    console.log(`Insight type: ${insights.summary.type}`);
    console.log(`AI response length: ${aiResponse.length} chars`);
    
  } catch (error) {
    console.error('[incremental] FAIL:', error.message);
    process.exit(1);
  }
}

// ============================================================
// 增量分析逻辑
// ============================================================

function analyzeIncrementalChanges(newTxs, userProfile) {
  const now = new Date();
  const todayStr = formatDate(now);
  const yesterdayStr = formatDate(new Date(now.getTime() - 86400000));
  
  // 分类统计
  const byType = {
    earn: newTxs.filter(t => t.type === 'earn').length,
    spend: newTxs.filter(t => t.type === 'spend').length,
  };
  
  const byTask = new Map();
  newTxs.forEach(tx => {
    if (!byTask.has(tx.taskName)) {
      byTask.set(tx.taskName, 0);
    }
    byTask.set(tx.taskName, byTask.get(tx.taskName) + 1);
  });
  
  // 检测模式变化
  const patterns = [];
  
  // 1. 连续完成 streak
  const recentTasks = Array.from(byTask.entries()).filter(([_, count]) => count >= 3);
  if (recentTasks.length > 0) {
    patterns.push({
      type: 'streak_achievement',
      description: `连续完成 ${recentTasks.map(([name, _]) => name).join('、')} 等任务`,
      severity: 'positive'
    });
  }
  
  // 2. 异常消费
  const highSpendTasks = Array.from(byTask.entries())
    .filter(([_, count]) => count >= 5)
    .filter(([name, _]) => newTxs.some(t => t.taskName === name && t.type === 'spend'));
  
  if (highSpendTasks.length > 0) {
    patterns.push({
      type: 'high_consumption',
      description: `在「${highSpendTasks[0][0]}」上花费较多`,
      severity: 'warning'
    });
  }
  
  // 3. 时间分布异常
  const morningTasks = newTxs.filter(t => {
    const hour = new Date(t.timestamp).getHours();
    return hour >= 6 && hour <= 9;
  });
  
  if (morningTasks.length >= 3) {
    patterns.push({
      type: 'early_riser',
      description: `今天已经有 ${morningTasks.length} 个任务在早上 6-9 点完成`,
      severity: 'positive'
    });
  }
  
  // 4. 习惯中断检测
  const interruptedHabits = detectHabitInterruption(newTxs, userProfile);
  
  return {
    summary: {
      type: byType.earn > byType.spend ? 'productive_day' : 'balanced_day',
      totalTransactions: newTxs.length,
      positivePatterns: patterns.filter(p => p.severity === 'positive').length,
      warnings: patterns.filter(p => p.severity === 'warning').length,
    },
    patterns,
    interruptedHabits,
    timeDistribution: {
      morning: morningTasks.length,
      afternoon: newTxs.filter(t => {
        const hour = new Date(t.timestamp).getHours();
        return hour >= 12 && hour <= 17;
      }).length,
      evening: newTxs.filter(t => {
        const hour = new Date(t.timestamp).getHours();
        return hour >= 18 && hour <= 23;
      }).length,
    },
    topTasks: Array.from(byTask.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
  };
}

function detectHabitInterruption(newTxs, userProfile) {
  const interruptions = [];
  
  // 检查已知习惯是否中断
  if (userProfile.habits && Array.isArray(userProfile.habits)) {
    userProfile.habits.forEach(habit => {
      const todayCount = newTxs.filter(t => t.taskName === habit.name).length;
      const expectedFrequency = habit.frequency || 1; // 每天至少 1 次
      
      if (todayCount === 0 && expectedFrequency > 0) {
        // 检查昨天是否有记录（确认是中断而非从未开始）
        const yesterdayTxs = userProfile.recentTransactions?.filter(t => {
          const date = new Date(t.timestamp);
          const yesterday = new Date(date.getTime() - 86400000);
          return formatDate(date) === formatDate(yesterday);
        }) || [];
        
        const hadRecordYesterday = yesterdayTxs.some(t => t.taskName === habit.name);
        
        if (hadRecordYesterday) {
          interruptions.push({
            habitName: habit.name,
            type: 'missing_today',
            description: `今天还没有记录「${habit.name}」（昨天有完成）`
          });
        }
      }
    });
  }
  
  return interruptions;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// AI Prompt 构建
// ============================================================

/**
 * 构建精简版增量分析 prompt（30 秒内响应，包含用户画像）
 */
function buildConciseAnalysisPrompt(insights, userProfile) {
  const sections = [];
  
  // 添加用户基本信息
  if (userProfile.summary) {
    sections.push('## 用户背景');
    sections.push(userProfile.summary.slice(0, 300) + '...');
  }
  
  sections.push('\n## 今日新增交易');
  sections.push(`- 总数：${insights.summary.totalTransactions}笔`);
  sections.push(`- 类型：${insights.summary.type === 'productive_day' ? '✅ 赚取占优' : '⚖️ 平衡'}`);
  
  sections.push('\n## 时间分布');
  sections.push(`- 早晨 (6-9 点): ${insights.timeDistribution.morning}笔`);
  sections.push(`- 下午 (12-17 点): ${insights.timeDistribution.afternoon}笔`);
  sections.push(`- 晚上 (18-23 点): ${insights.timeDistribution.evening}笔`);
  
  sections.push('\n## 活跃任务 (Top 5)');
  insights.topTasks.forEach((t, i) => {
    sections.push(`${i + 1}. ${t.name}: ${t.count}笔`);
  });
  
  sections.push('\n## 模式检测');
  if (insights.patterns.length === 0) {
    sections.push('- 暂无特殊模式');
  } else {
    insights.patterns.forEach(p => {
      const icon = p.severity === 'positive' ? '🎉' : '⚠️';
      sections.push(`${icon} ${p.description}`);
    });
  }
  
  sections.push('\n## 习惯中断检测');
  if (insights.interruptedHabits.length > 0) {
    sections.push('⚠️ 以下习惯可能中断:');
    insights.interruptedHabits.forEach(i => {
      sections.push(`- ${i.description}`);
    });
  }
  
  sections.push('\n## 任务要求');
  sections.push('基于以上数据和用户背景，生成一条个性化的即时洞察（80-120 字）。');
  sections.push('要求：');
  sections.push('- 引用用户的历史习惯或偏好（如相关）');
  sections.push('- 温暖友好，像朋友一样说话');
  sections.push('- 肯定进步或温和提醒');
  sections.push('- 给出具体可执行的建议');
  
  return sections.join('\n');
}

function buildIncrementalAnalysisPrompt(insights, userProfile) {
  const sections = [];
  
  sections.push('## 今日新增交易概况');
  sections.push(`- 总笔数：${insights.summary.totalTransactions}`);
  sections.push(`- 赚取类：${insights.summary.type === 'productive_day' ? '✅ 占优' : '⚖️ 平衡'}`);
  sections.push(`- 消费类：${insights.summary.type === 'productive_day' ? '⚖️ 平衡' : '✅ 占优'}`);
  
  sections.push('\n## 时间分布');
  sections.push(`- 早晨 (6-9 点): ${insights.timeDistribution.morning}笔`);
  sections.push(`- 下午 (12-17 点): ${insights.timeDistribution.afternoon}笔`);
  sections.push(`- 晚上 (18-23 点): ${insights.timeDistribution.evening}笔`);
  
  sections.push('\n## 活跃任务 (Top 5)');
  insights.topTasks.forEach((t, i) => {
    sections.push(`${i + 1}. ${t.name}: ${t.count}笔`);
  });
  
  sections.push('\n## 模式检测');
  if (insights.patterns.length === 0) {
    sections.push('- 暂无特殊模式');
  } else {
    insights.patterns.forEach(p => {
      const icon = p.severity === 'positive' ? '🎉' : '⚠️';
      sections.push(`${icon} ${p.description}`);
    });
  }
  
  sections.push('\n## 习惯中断检测');
  if (insights.interruptedHabits.length === 0) {
    sections.push('- 所有习惯保持良好连续性');
  } else {
    insights.interruptedHabits.forEach(i => {
      sections.push(`- ⚠️ ${i.description}`);
    });
  }
  
  sections.push('\n## 用户画像摘要（仅供参考）');
  if (userProfile.summary) {
    sections.push(userProfile.summary.slice(0, 500) + '...');
  }
  
  sections.push('\n## 任务要求');
  sections.push('请基于以上今日新增数据，结合用户历史画像，生成一条个性化的即时洞察（100-200 字）。');
  sections.push('要求：');
  sections.push('- 温暖友好，像朋友一样对话');
  sections.push('- 肯定用户的进步（如有）');
  sections.push('- 温和提醒需要注意的地方（如有）');
  sections.push('- 给出具体可执行的建议');
  sections.push('- 引用用户的历史约定或偏好（如相关）');
  
  return sections.join('\n');
}

// ============================================================
// AI 调用
// ============================================================

async function callAI(prompt) {
  // 使用精简版 system prompt（避免超时）
  const minimalSystemPrompt = `
你正在分析 TimeBank 用户的交易数据。

时间戳可信度分级：
- 🔴 高可信度：手动记录，完全信赖
- 🟡 中可信度：手动补录，可能有误差
- 🟢 低可信度：自动检测，使用 originalDate

回答原则：
1. 总量分析可用全部数据
2. 时序分析仅用高可信度数据
3. 习惯识别优先自动检测数据
4. 温暖友好，像朋友一样对话
5. 给出具体可执行的建议
`;
  
  const response = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: minimalSystemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: false,
      max_tokens: 300,  // 减少输出长度
      temperature: 0.3,  // 降低随机性，加快响应
    }),
  });
  
  if (!response.ok) {
    throw new Error(`AI API failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// 数据库操作
// ============================================================

async function loadUserProfile(openid) {
  const brainRes = await db.collection('tb_ai_brain').where({ _openid: openid }).limit(1).get();
  const brain = brainRes.data?.[0] || {};
  
  return {
    summary: brain.summary || '',
    habits: brain.habits || [],
    recentTransactions: brain.recentTransactions || [],
    insightCount: brain.insightCount || 0,
    lastAnalyzedAt: brain.lastAnalyzedAt || 0,
  };
}

async function writeRealtimeInsight(openid, data) {
  await db.collection('tb_ai_messages').add({
    _openid: openid,
    type: data.type,
    role: 'assistant',
    content: data.content,
    isRead: false,
    createdAt: data.generatedAt,
    meta: {
      source: 'hermes_incremental',
      insightType: data.insightType,
      transactionCount: data.transactionCount,
    },
  });
}

async function updateCheckpoint(openid, updates) {
  const res = await db.collection('tb_ai_brain').where({ _openid: openid }).limit(1).get();
  
  if (res.data && res.data.length > 0) {
    await db.collection('tb_ai_brain').doc(res.data[0]._id).update({
      ...updates,
    });
  } else {
    await db.collection('tb_ai_brain').add({
      _openid: openid,
      ...updates,
      createdAt: Date.now(),
    });
  }
}

// 执行
main();
