/**
 * TimeBank Data Normalizer - 数据清洗与可信度标注
 * 
 * 功能：
 * 1. 将原始交易记录转换为 Hermes 友好的结构化格式
 * 2. 添加时间可信度标签（区分手动/补录/自动检测）
 * 3. 生成数据质量报告
 * 
 * 使用场景：
 * - ingest-all-data.mjs：全量数据摄入
 * - incremental-analysis.mjs：实时增量分析
 * - realtime-analysis.mjs：事件驱动分析
 */

import cloudbase from '@cloudbase/node-sdk';

const E = process.env;
const ENV_ID = E.CLOUDBASE_ENV_ID || '';
const OPENID = E.TARGET_USER_OPENID || '';

const app = cloudbase.init({
  env: ENV_ID,
  secretId: E.TC_SECRET_ID,
  secretKey: E.TC_SECRET_KEY,
});
const db = app.database();

// ============================================================
// 核心转换函数
// ============================================================

/**
 * 标准化单条交易记录
 */
function normalizeTransaction(tx) {
  const timeMetadata = analyzeTimeAccuracy(tx);
  
  return {
    // === 基础字段 ===
    id: tx.id,
    type: tx.type,           // 'earn' | 'spend'
    amount: tx.amount,       // 秒数（已倍率调整后的实际值）
    taskName: tx.taskName,
    taskId: tx.taskId || null,
    
    // === 时间信息（带可信度标注）===
    timestamp: tx.timestamp, // ISO 字符串（原始写入时间）
    timeMetadata: timeMetadata,
    
    // === 来源设备 ===
    deviceId: tx.deviceId || 'unknown',
    
    // === 特殊标记 ===
    tags: extractTags(tx),
    
    // === 上下文信息 ===
    description: tx.description || '',
    
    // === 额外元数据 ===
    metadata: {
      isSleep: !!(tx.sleepData || (tx.description && tx.description.includes('睡眠'))),
      isHabitStreak: !!(tx.isStreakAdvancement || tx.habitDetails),
      hasPenalty: !!(tx.balanceAdjust || tx.description?.includes('惩罚')),
      autoDetectData: tx.autoDetectData || null,
      rawSeconds: tx.rawSeconds || null,
      multiplier: tx.multiplier || 1,
    }
  };
}

/**
 * 分析时间戳的可信度等级
 */
function analyzeTimeAccuracy(tx) {
  const isAutoDetected = !!(tx.isAutoDetected || tx.autoDetectData);
  const isManualBackdate = !!(tx.isBackdate && !isAutoDetected);
  
  let level;
  if (isAutoDetected) {
    level = 'low';  // 自动检测：timestamp 代表检测日，非实际发生
  } else if (isManualBackdate) {
    level = 'medium';  // 手动补录：用户回忆，可能有±1-2 天误差
  } else {
    level = 'high';  // 手动记录：实时操作，最可信
  }
  
  return {
    accuracy: level,
    isUserConfirmed: level === 'high',
    isManualBackdate: level === 'medium',
    isAutoDetected: level === 'low',
    
    // 实际发生日期（仅自动检测有）
    actualDateStr: isAutoDetected ? tx.autoDetectData?.originalDate : null,
    
    // 写入系统的日期
    recordedDateStr: parseLocalDateFromISO(tx.timestamp),
    
    // 详细说明
    note: getTimeAccuracyNote(level)
  };
}

/**
 * 获取可信度等级的说明文字
 */
function getTimeAccuracyNote(level) {
  const notes = {
    high: '用户手动记录，时间戳代表真实发生时间',
    medium: '用户手动补录，时间戳是回忆后填写的日期，可能有±1-2 天误差',
    low: '系统自动检测，时间戳代表"检测日"而非实际发生日；实际日期在 autoDetectData.originalDate'
  };
  return notes[level];
}

/**
 * 提取交易标签
 */
function extractTags(tx) {
  const tags = [];
  
  if (tx.sleepData || (tx.description && tx.description.includes('睡眠'))) {
    tags.push('sleep');
  }
  
  if (tx.isAutoDetected || tx.autoDetectData) {
    tags.push('auto_detected');
  }
  
  if (tx.isBackdate && !tx.isAutoDetected) {
    tags.push('manual_backdate');
  }
  
  if (tx.isStreakAdvancement || tx.habitDetails) {
    tags.push('habit_streak');
  }
  
  if (tx.autoDetectData?.quotaModeApplied === 'dynamic') {
    tags.push('dynamic_multiplier');
  }
  
  if (tx.autoDetectData?.quotaModeApplied === 'quota') {
    tags.push('quota_mode');
  }
  
  if (tx.description?.includes('自动修正')) {
    tags.push('correction');
  }
  
  return tags;
}

/**
 * 从 ISO 时间戳解析本地日期字符串 (YYYY-MM-DD)
 */
function parseLocalDateFromISO(isoString) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch (e) {
    console.error('[parseLocalDateFromISO] Error:', e);
    return null;
  }
}

/**
 * 标准化全部交易记录
 */
export function normalizeAllTransactions(transactions) {
  console.log(`[DataNormalizer] Processing ${transactions.length} transactions...`);
  
  const normalized = transactions.map(tx => normalizeTransaction(tx));
  
  // 生成质量报告
  const qualityReport = generateQualityReport(normalized);
  
  console.log(`[DataNormalizer] Quality Report:`, {
    total: normalized.length,
    highConfidence: qualityReport.timeAccuracyDistribution.high,
    mediumConfidence: qualityReport.timeAccuracyDistribution.medium,
    lowConfidence: qualityReport.timeAccuracyDistribution.low,
  });
  
  return {
    normalized,
    qualityReport
  };
}

/**
 * 生成数据质量报告
 */
function generateQualityReport(normalized) {
  const byAccuracy = {
    high: normalized.filter(t => t.timeMetadata.accuracy === 'high'),
    medium: normalized.filter(t => t.timeMetadata.accuracy === 'medium'),
    low: normalized.filter(t => t.timeMetadata.accuracy === 'low'),
  };
  
  const autoDetected = normalized.filter(t => t.timeMetadata.isAutoDetected);
  const backdated = normalized.filter(t => t.timeMetadata.isManualBackdate);
  
  return {
    totalTransactions: normalized.length,
    timeAccuracyDistribution: {
      high: byAccuracy.high.length,
      medium: byAccuracy.medium.length,
      low: byAccuracy.low.length,
    },
    
    autoDetectedStats: {
      totalCount: autoDetected.length,
      totalMinutes: autoDetected.reduce((sum, t) => sum + (t.amount / 60), 0),
      tasks: [...new Set(autoDetected.map(t => t.taskName))],
    },
    
    backdateStats: {
      totalCount: backdated.length,
      totalMinutes: backdated.reduce((sum, t) => sum + (t.amount / 60), 0),
    },
    
    deviceDistribution: extractDeviceStats(normalized),
    
    tagDistribution: extractTagDistribution(normalized),
  };
}

/**
 * 提取设备分布统计
 */
function extractDeviceStats(normalized) {
  const deviceMap = new Map();
  
  normalized.forEach(tx => {
    const deviceId = tx.deviceId;
    if (!deviceMap.has(deviceId)) {
      deviceMap.set(deviceId, { count: 0, minutes: 0 });
    }
    const stat = deviceMap.get(deviceId);
    stat.count++;
    stat.minutes += tx.amount / 60;
  });
  
  return Array.from(deviceMap.entries()).map(([deviceId, stats]) => ({
    deviceId,
    transactionCount: stats.count,
    totalMinutes: Math.round(stats.minutes),
  }));
}

/**
 * 提取标签分布统计
 */
function extractTagDistribution(normalized) {
  const tagMap = new Map();
  
  normalized.forEach(tx => {
    tx.tags.forEach(tag => {
      if (!tagMap.has(tag)) {
        tagMap.set(tag, 0);
      }
      tagMap.set(tag, tagMap.get(tag) + 1);
    });
  });
  
  return Array.from(tagMap.entries()).map(([tag, count]) => ({ tag, count }));
}

// ============================================================
// 导出函数
// ============================================================

export {
  normalizeTransaction,
  analyzeTimeAccuracy,
  extractTags,
  parseLocalDateFromISO,
  generateQualityReport,
};
