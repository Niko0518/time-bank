/**
 * TimeBank Hermes - 记忆检索引擎
 * 
 * 功能：
 * 1. 解析 USER.md / MEMORY.md 结构
 * 2. 根据问题类型检索对应模块
 * 3. 返回 top-5 相关片段
 * 
 * 用法：node memory-retrieval.mjs [question] [memoryContent]
 */

import { readFileSync } from 'fs';

// ============================================================
// 核心检索逻辑
// ============================================================

/**
 * 检索相关记忆片段
 */
export function retrieveRelevantMemory(question, memoryContent) {
  console.log('[MemoryRetrieval] Retrieving relevant memory for question:', question);
  
  const questionType = detectQuestionType(question);
  const keywords = extractKeywords(question);
  
  // 分段检索
  const sections = parseMemorySections(memoryContent);
  
  const results = [];
  
  // 1. 基础统计检索
  if (shouldRetrieveSection(sections.basicStats, questionType, keywords)) {
    results.push({
      section: 'basicStats',
      priority: 1,
      content: sections.basicStats,
      relevanceScore: calculateRelevance(sections.basicStats, keywords),
    });
  }
  
  // 2. 习惯模式检索
  if (shouldRetrieveSection(sections.habitPatterns, questionType, keywords)) {
    results.push({
      section: 'habitPatterns',
      priority: 2,
      content: sections.habitPatterns,
      relevanceScore: calculateRelevance(sections.habitPatterns, keywords),
    });
  }
  
  // 3. 时间分布检索
  if (shouldRetrieveSection(sections.timeDistribution, questionType, keywords)) {
    results.push({
      section: 'timeDistribution',
      priority: 3,
      content: sections.timeDistribution,
      relevanceScore: calculateRelevance(sections.timeDistribution, keywords),
    });
  }
  
  // 4. 异常检测检索
  if (shouldRetrieveSection(sections.anomalies, questionType, keywords)) {
    results.push({
      section: 'anomalies',
      priority: 4,
      content: sections.anomalies,
      relevanceScore: calculateRelevance(sections.anomalies, keywords),
    });
  }
  
  // 5. 历史约定检索
  if (shouldRetrieveSection(sections.commitments, questionType, keywords)) {
    results.push({
      section: 'commitments',
      priority: 5,
      content: sections.commitments,
      relevanceScore: calculateRelevance(sections.commitments, keywords),
    });
  }
  
  // 6. 偏好提取检索
  if (shouldRetrieveSection(sections.preferences, questionType, keywords)) {
    results.push({
      section: 'preferences',
      priority: 6,
      content: sections.preferences,
      relevanceScore: calculateRelevance(sections.preferences, keywords),
    });
  }
  
  // 排序并返回 top-5
  const sorted = results.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 5);
  
  console.log(`[MemoryRetrieval] Found ${sorted.length} relevant sections`);
  
  return sorted.map(r => ({
    section: r.section,
    content: r.content,
    score: r.relevanceScore,
  }));
}

/**
 * 检测问题类型
 */
export function detectQuestionType(question) {
  const q = question.toLowerCase();
  
  if (/总 (共 | 计)|多少 (小时 | 分钟)|余额|累计/.test(q)) {
    return 'total';
  }
  
  if (/一般 | 通常 | 习惯 | 模式 | 几点 | 什么时候 (.* )?/.test(q)) {
    return 'pattern';
  }
  
  if (/为什么 | 异常 | 低 | 差 | 问题 | 原因/.test(q)) {
    return 'anomaly';
  }
  
  if (/习惯 | 规律 | 频率 | 经常 |  streak/.test(q)) {
    return 'habit';
  }
  
  if (/约定 | 承诺 | 目标 | 计划 | 说 (过 | 到)/.test(q)) {
    return 'commitment';
  }
  
  if (/偏好 | 喜欢 | 讨厌 | 倾向/.test(q)) {
    return 'preference';
  }
  
  return 'general'; // 默认全量
}

/**
 * 提取关键词
 */
export function extractKeywords(question) {
  // 简单分词：去除停用词，保留名词和动词
  const stopWords = ['的', '了', '和', '是', '在', '我', '你', '他', '这', '那', '什么', '怎么'];
  
  const words = question
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(' ')
    .filter(w => w.length > 1 && !stopWords.includes(w));
  
  return [...new Set(words)];
}

/**
 * 判断是否应该检索该模块
 */
function shouldRetrieveSection(sectionData, questionType, keywords) {
  if (!sectionData || Object.keys(sectionData).length === 0) {
    return false;
  }
  
  // 通用问题：检索所有非空模块
  if (questionType === 'general') {
    return true;
  }
  
  // 特定问题：只检索相关模块
  const typeMappings = {
    total: ['basicStats'],
    pattern: ['timeDistribution', 'habitPatterns'],
    anomaly: ['anomalies'],
    habit: ['habitPatterns', 'timeDistribution'],
    commitment: ['commitments'],
    preference: ['preferences'],
  };
  
  const allowedSections = typeMappings[questionType] || ['basicStats'];
  const sectionName = Object.keys(sectionData)[0];
  
  return allowedSections.includes(sectionName);
}

/**
 * 计算相关性分数
 */
function calculateRelevance(sectionData, keywords) {
  if (!keywords || keywords.length === 0) {
    return 1.0;
  }
  
  let score = 0;
  const sectionText = JSON.stringify(sectionData).toLowerCase();
  
  keywords.forEach(keyword => {
    if (sectionText.includes(keyword.toLowerCase())) {
      score += 0.3;
    }
  });
  
  // 基础分
  score += 0.5;
  
  return Math.min(score, 1.0);
}

/**
 * 解析 Memory.md 为结构化对象
 */
export function parseMemorySections(memoryContent) {
  const sections = {
    basicStats: {},
    habitPatterns: [],
    timeDistribution: {},
    anomalies: [],
    commitments: [],
    preferences: [],
  };
  
  try {
    // 尝试解析 JSON 部分
    const jsonMatch = memoryContent.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      
      if (jsonData.basicStats) {
        sections.basicStats = jsonData.basicStats;
      }
      
      if (jsonData.habitPatterns) {
        sections.habitPatterns = jsonData.habitPatterns;
      }
      
      if (jsonData.timeDistribution) {
        sections.timeDistribution = jsonData.timeDistribution;
      }
      
      if (jsonData.anomalies) {
        sections.anomalies = jsonData.anomalies;
      }
    }
    
    // 从自然语言部分提取约定
    const commitmentMatches = memoryContent.match(/(?:约定 | 承诺 | 目标)[\s\S]*?(?=##|$)/g);
    if (commitmentMatches) {
      sections.commitments = commitmentMatches.map(m => m.trim());
    }
    
    // 从自然语言部分提取偏好
    const preferenceMatches = memoryContent.match(/(?:偏好 | 喜欢 | 讨厌)[\s\S]*?(?=##|$)/g);
    if (preferenceMatches) {
      sections.preferences = preferenceMatches.map(m => m.trim());
    }
    
  } catch (error) {
    console.error('[parseMemorySections] Error:', error);
  }
  
  return sections;
}

/**
 * 构建检索结果文本（用于拼接至 prompt）
 */
export function formatRetrievedMemory(retrievedSections) {
  if (!retrievedSections || retrievedSections.length === 0) {
    return '暂无相关记忆';
  }
  
  const lines = [];
  
  retrievedSections.forEach((item, index) => {
    lines.push(`## 第${index + 1}条相关记忆 (${item.section}, 相关性${item.score.toFixed(2)})`);
    
    if (typeof item.content === 'object' && item.content !== null) {
      lines.push(JSON.stringify(item.content, null, 2));
    } else if (Array.isArray(item.content)) {
      item.content.forEach(c => lines.push(`- ${c}`));
    } else {
      lines.push(String(item.content));
    }
    
    lines.push('');
  });
  
  return lines.join('\n');
}
