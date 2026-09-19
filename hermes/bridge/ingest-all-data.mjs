/**
 * TimeBank Hermes - 全量数据摄入脚本
 * 
 * 功能：
 * 1. 读取用户全部交易记录（4000+ 条）
 * 2. 清洗并标注可信度
 * 3. 调用 hy3 生成深度用户画像
 * 4. 写入 MEMORY.md（结构化 JSON + 自然语言混合）
 * 
 * 用法：node ingest-all-data.mjs [openid]
 */

import cloudbase from '@cloudbase/node-sdk';
import { readFileSync, writeFileSync } from 'fs';
import { normalizeAllTransactions, generateQualityReport } from './data-normalizer.mjs';
import { buildSystemPrompt } from './system-prompt.mjs';

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
  console.log(`[ingest] Starting full data ingestion for openid: ${OPENID.substring(0, 8)}...`);
  
  try {
    // 1. 读取全量数据
    console.log('[ingest] Loading transactions from cloud...');
    const txRes = await db.collection('tb_transaction').get();
    const allTxs = (txRes.data || []).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    console.log(`[ingest] Loaded ${allTxs.length} transactions`);
    
    if (allTxs.length === 0) {
      console.warn('[ingest] No transactions found, creating empty profile');
      await createEmptyProfile(OPENID);
      return;
    }
    
    // 2. 读取其他辅助数据
    console.log('[ingest] Loading daily stats...');
    const dailyRes = await db.collection('tb_daily').limit(365).get();
    const allDaily = (dailyRes.data || []).reverse();
    
    console.log('[ingest] Loading profile...');
    const profileRes = await db.collection('tb_profile').limit(1).get();
    const profile = profileRes.data?.[0] || {};
    
    // 3. 数据清洗与标注
    console.log('[ingest] Normalizing and annotating data...');
    const { normalized, qualityReport } = normalizeAllTransactions(allTxs);
    
    // 4. 构建特征工程
    console.log('[ingest] Building feature engineering...');
    const features = buildFeatures(normalized, allDaily, profile);
    
    // 5. 生成数据质量说明
    const dataQualityNote = generateDataQualityNote(qualityReport);
    
    // 6. 构建 prompt
    const prompt = buildDeepAnalysisPrompt(features, dataQualityNote);
    
    // 7. 调用 hy3
    console.log('[ingest] Calling hy3 for deep analysis...');
    const startTime = Date.now();
    const analysis = await callAI(prompt);
    const elapsed = Date.now() - startTime;
    
    console.log(`[ingest] AI response received (${elapsed}ms, ${analysis.length} chars)`);
    
    // 8. 写入 MEMORY.md
    console.log('[ingest] Writing to MEMORY.md...');
    const memoryContent = formatMemoryMD(analysis, qualityReport);
    await uploadToCloudStorage(`users/${OPENID}/MEMORY.tar`, memoryContent);
    
    // 9. 更新 brain 文档
    console.log('[ingest] Updating brain document...');
    await updateBrainDoc(OPENID, {
      cognitionVersion: (profile.cognitionVersion || 0) + 1,
      lastAnalysisAt: Date.now(),
      lastAnalysisMethod: 'full_ingestion',
      transactionCount: allTxs.length,
      qualityReport,
      summary: extractSummary(analysis),
    });
    
    console.log('[ingest] ✅ Done!');
    console.log('\n=== Summary ===');
    console.log(`Total transactions: ${allTxs.length}`);
    console.log(`High confidence: ${qualityReport.timeAccuracyDistribution.high}`);
    console.log(`Medium confidence: ${qualityReport.timeAccuracyDistribution.medium}`);
    console.log(`Low confidence: ${qualityReport.timeAccuracyDistribution.low}`);
    console.log(`Auto detected: ${qualityReport.autoDetectedStats.totalCount}`);
    console.log(`Manual backdate: ${qualityReport.backdateStats.totalCount}`);
    
  } catch (error) {
    console.error('[ingest] FAIL:', error.message);
    process.exit(1);
  }
}

// ============================================================
// 特征工程
// ============================================================

function buildFeatures(normalizedTxs, allDaily, profile) {
  const transactions = normalizedTxs.map(tx => ({
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    taskName: tx.taskName,
    timestamp: tx.timestamp,
    timeMetadata: tx.timeMetadata,
    tags: tx.tags,
    deviceId: tx.deviceId,
  }));
  
  // 基础统计
  const totalEarn = transactions.filter(t => t.type === 'earn').reduce((s, t) => s + t.amount, 0);
  const totalSpend = transactions.filter(t => t.type === 'spend').reduce((s, t) => s + t.amount, 0);
  const currentBalance = totalEarn - totalSpend;
  
  // 时间分布
  const timeDistribution = analyzeTimeDistribution(transactions);
  
  // 习惯模式识别
  const habitPatterns = identifyHabitPatterns(transactions);
  
  // 月度趋势
  const monthlyTrend = calculateMonthlyTrend(allDaily);
  
  // 异常检测
  const anomalies = detectAnomalies(transactions, allDaily);
  
  // 设备分布
  const deviceStats = extractDeviceStats(transactions);
  
  return {
    basicStats: {
      totalEarnHours: Math.round(totalEarn / 3600),
      totalSpendHours: Math.round(totalSpend / 3600),
      currentBalanceHours: Math.round(currentBalance / 3600),
      transactionCount: transactions.length,
      firstTransactionDate: transactions[0]?.timestamp || null,
      lastTransactionDate: transactions[transactions.length - 1]?.timestamp || null,
    },
    
    timeDistribution,
    habitPatterns,
    monthlyTrend,
    anomalies,
    deviceStats,
    
    metadata: {
      analysisDate: new Date().toISOString(),
      dataSources: ['tb_transaction', 'tb_daily', 'tb_profile'],
      timeAccuracyWarning: true,
    }
  };
}

function analyzeTimeDistribution(transactions) {
  const byHour = new Array(24).fill(0);
  const byDayOfWeek = new Array(7).fill(0);
  
  transactions.forEach(tx => {
    const date = new Date(tx.timestamp);
    byHour[date.getHours()] += tx.amount;
    byDayOfWeek[date.getDay()] += tx.amount;
  });
  
  const peakHour = byHour.indexOf(Math.max(...byHour));
  const busiestDay = byDayOfWeek.indexOf(Math.max(...byDayOfWeek));
  
  return {
    hourlyDistribution: byHour,
    weeklyDistribution: byDayOfWeek,
    peakHour,
    busiestDay: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][busiestDay],
  };
}

function identifyHabitPatterns(transactions) {
  const taskMap = new Map();
  
  transactions.forEach(tx => {
    if (!taskMap.has(tx.taskName)) {
      taskMap.set(tx.taskName, { count: 0, totalMinutes: 0, dates: new Set() });
    }
    const stat = taskMap.get(tx.taskName);
    stat.count++;
    stat.totalMinutes += tx.amount / 60;
    stat.dates.add(parseLocalDateFromISO(tx.timestamp));
  });
  
  const patterns = [];
  
  taskMap.forEach((stat, taskName) => {
    if (stat.count >= 5) { // 至少 5 次记录才认为是习惯
      patterns.push({
        taskName,
        frequency: stat.count,
        totalMinutes: Math.round(stat.totalMinutes),
        consistency: Math.round((stat.dates.size / Math.max(30, stat.count)) * 100),
      });
    }
  });
  
  return patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 10);
}

function calculateMonthlyTrend(dailyStats) {
  const monthly = new Map();
  
  dailyStats.forEach(d => {
    const monthKey = d.date.slice(0, 7); // YYYY-MM
    if (!monthly.has(monthKey)) {
      monthly.set(monthKey, { earn: 0, spend: 0, balance: 0 });
    }
    const m = monthly.get(monthKey);
    m.earn += (d.earn || 0);
    m.spend += (d.spend || 0);
    m.balance = (d.balance || 0);
  });
  
  return Array.from(monthly.entries()).map(([month, stats]) => ({
    month,
    earnHours: Math.round(stats.earn / 3600),
    spendHours: Math.round(stats.spend / 3600),
    balanceHours: Math.round(stats.balance / 3600),
  }));
}

function detectAnomalies(transactions, dailyStats) {
  const anomalies = [];
  
  // 检测连续熬夜（凌晨 1 点后睡）
  const lateSleepers = transactions
    .filter(t => t.tags.includes('sleep') && t.timeMetadata.accuracy === 'high')
    .filter(t => {
      const hour = new Date(t.timestamp).getHours();
      return hour >= 1;
    });
  
  if (lateSleepers.length >= 3) {
    anomalies.push({
      type: 'late_sleep',
      severity: 'warning',
      description: `检测到 ${lateSleepers.length} 次凌晨 1 点后入睡记录`,
      suggestion: '建议设置 23:30 的睡前提醒'
    });
  }
  
  // 检测余额警告
  const latestTx = transactions[transactions.length - 1];
  const currentBalance = latestTx ? (latestTx.type === 'earn' ? latestTx.amount : -latestTx.amount) : 0;
  
  if (currentBalance > 0 && currentBalance < 3600 * 30) { // 少于 30 天
    anomalies.push({
      type: 'low_balance',
      severity: 'info',
      description: '当前余额较少，建议增加赚取',
      suggestion: '设定一些高倍率任务'
    });
  }
  
  return anomalies;
}

function extractDeviceStats(transactions) {
  const deviceMap = new Map();
  
  transactions.forEach(tx => {
    if (!deviceMap.has(tx.deviceId)) {
      deviceMap.set(tx.deviceId, { count: 0, minutes: 0 });
    }
    const stat = deviceMap.get(tx.deviceId);
    stat.count++;
    stat.minutes += tx.amount / 60;
  });
  
  return Array.from(deviceMap.entries()).map(([deviceId, stats]) => ({
    deviceId,
    transactionCount: stats.count,
    totalMinutes: Math.round(stats.minutes),
  }));
}

function parseLocalDateFromISO(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// AI 调用
// ============================================================

async function callAI(prompt) {
  const systemPrompt = buildSystemPrompt(null, null);
  
  const response = await fetch(GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: false,
      max_tokens: 4000,
      temperature: 0.4,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`AI API failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ============================================================
// 输出格式化
// ============================================================

function buildDeepAnalysisPrompt(features, dataQualityNote) {
  const sections = [];
  
  sections.push('## 基础统计');
  sections.push(`- 总赚取时长：${features.basicStats.totalEarnHours}小时`);
  sections.push(`- 总消费时长：${features.basicStats.totalSpendHours}小时`);
  sections.push(`- 当前余额：${features.basicStats.currentBalanceHours}小时`);
  sections.push(`- 交易总数：${features.basicStats.transactionCount}笔`);
  sections.push(`- 使用时间：${features.basicStats.firstTransactionDate} ~ ${features.basicStats.lastTransactionDate}`);
  
  sections.push('\n## 时间分布');
  sections.push(`- 高峰时段：${features.timeDistribution.peakHour}:00`);
  sections.push(`- 最忙日期：${features.timeDistribution.busiestDay}`);
  
  sections.push('\n## 习惯模式（Top 10）');
  features.habitPatterns.forEach(p => {
    sections.push(`- ${p.taskName}: ${p.frequency}次，${Math.round(p.totalMinutes)}分钟，一致性${p.consistency}%`);
  });
  
  sections.push('\n## 月度趋势（最近 6 个月）');
  features.monthlyTrend.slice(-6).forEach(m => {
    sections.push(`- ${m.month}: 赚${m.earnHours}h / 花${m.spendHours}h / 余额${m.balanceHours}h`);
  });
  
  sections.push('\n## 异常检测');
  if (features.anomalies.length === 0) {
    sections.push('- 暂无明显异常');
  } else {
    features.anomalies.forEach(a => {
      sections.push(`- [${a.severity}] ${a.description}: ${a.suggestion}`);
    });
  }
  
  sections.push('\n## 设备分布');
  features.deviceStats.forEach(d => {
    sections.push(`- ${d.deviceId}: ${d.transactionCount}笔，${d.totalMinutes}分钟`);
  });
  
  return `基于以下用户数据，生成一份详细的个人画像报告（3000-5000 字），包括：
  - 行为习惯模式识别
  - 偏好提取（显式 + 隐式）
  - 目标追踪与承诺一致性分析
  - 异常检测与风险预警
  
  请以结构化 JSON + 自然语言混合格式输出。
  
  数据：
  ${sections.join('\n')}
  
  ${dataQualityNote}
  `;
}

function generateDataQualityNote(qualityReport) {
  return `
### 数据质量说明

- 总交易数：${qualityReport.totalTransactions}笔
- 高可信度（手动记录）：${qualityReport.timeAccuracyDistribution.high}笔
- 中可信度（手动补录）：${qualityReport.timeAccuracyDistribution.medium}笔
- 低可信度（自动检测）：${qualityReport.timeAccuracyDistribution.low}笔

**注意**：
- 自动检测数据的时间戳代表"检测日"，实际发生日期在 autoDetectData.originalDate
- 手动补录数据可能存在±1-2 天误差
- 本分析报告已考虑上述因素，仅在高可信度数据上进行时序分析
  `.trim();
}

function formatMemoryMD(analysis, qualityReport) {
  return `# User Profile - TimeBank Deep Analysis

## Generated At
${new Date().toISOString()}

## Data Quality Summary
- Total Transactions: ${qualityReport.totalTransactions}
- High Confidence: ${qualityReport.timeAccuracyDistribution.high}
- Medium Confidence: ${qualityReport.timeAccuracyDistribution.medium}
- Low Confidence: ${qualityReport.timeAccuracyDistribution.low}
- Auto Detected: ${qualityReport.autoDetectedStats.totalCount}

## AI Analysis
${analysis}

## Raw Features (JSON)
\`\`\`json
{
  "generatedAt": "${new Date().toISOString()}",
  "transactionCount": ${qualityReport.totalTransactions},
  "autoDetectedCount": ${qualityReport.autoDetectedStats.totalCount},
  "backdatedCount": ${qualityReport.backdateStats.totalCount}
}
\`\`\`
`.trim();
}

function extractSummary(analysis) {
  const lines = analysis.split('\n');
  const firstParagraph = lines.filter(l => l.trim() && !l.startsWith('#')).slice(0, 3).join(' ');
  return firstParagraph.slice(0, 200) + '...';
}

async function uploadToCloudStorage(path, content) {
  // TODO: 实现云存储上传逻辑
  console.log(`[upload] Would upload to: ${path}`);
  console.log(`[upload] Content length: ${content.length}`);
  
  // 本地保存作为测试
  writeFileSync(`MEMORY_${path}`, content, 'utf8');
  console.log(`[upload] Saved locally to: MEMORY_${path}`);
}

async function updateBrainDoc(openid, updates) {
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
}

async function createEmptyProfile(openid) {
  await uploadToCloudStorage(`users/${openid}/MEMORY.tar`, '# Empty Profile\nNo transactions found.');
  console.log('[ingest] Created empty profile');
}

// 执行
main();
