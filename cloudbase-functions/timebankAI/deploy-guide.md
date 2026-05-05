# TimeBank AI 云函数部署指南

## 概述

本文档指导如何部署 `timebankAI` 云函数，实现云端 AI 洞察报告功能。

**架构**：前端 JS → CloudBase 云函数 → Gemini/混元/OpenAI

---

## 前置条件

- CloudBase 个人版开发会员 ✅（用户已有）
- Google Gemini API 密钥（免费申请）

---

## 第一步：获取 Gemini API 密钥

1. 访问 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 登录 Google 账号
3. 点击「Create API Key」
4. 复制生成的密钥（格式：`AIzaSy...`）

**免费额度**：
- Gemini 2.0 Flash: 15 请求/分钟，100万 Token/分钟，1500 请求/天

---

## 第二步：部署云函数

### 方法一：通过 CloudBase 控制台（推荐）

1. 登录 [CloudBase 控制台](https://tcb.cloud.tencent.com/dev)
2. 进入「云函数」页面
3. 点击「新建云函数」
4. 填写信息：
   - 函数名称：`timebankAI`
   - 运行环境：Node.js 18.15
   - 内存：256MB（足够）
   - 超时时间：30 秒
5. 点击「下一步」
6. 在代码编辑器中：
   - 将 `index.js` 的内容粘贴到编辑器
   - 创建 `package.json` 文件，粘贴对应内容
7. 点击「保存并安装依赖」
8. 切换到「环境变量」标签页，添加：
   ```
   AI_PROVIDER=gemini
   GEMINI_API_KEY=你的API密钥
   ```
9. 点击「保存」

### 方法二：通过 CLI 部署

```bash
# 安装 CloudBase CLI
npm install -g @cloudbase/cli

# 登录
tcb login

# 进入云函数目录
cd cloudbase-functions/timebankAI

# 安装依赖
npm install

# 部署
tcb fn deploy timebankAI

# 设置环境变量
tcb fn config update timebankAI --env-vars AI_PROVIDER=gemini,GEMINI_API_KEY=你的API密钥
```

---

## 第三步：验证部署

### 测试云函数

在 CloudBase 控制台「云函数」→「timebankAI」→「测试」中，输入：

```json
{
  "action": "getStatus"
}
```

期望返回：
```json
{
  "code": 0,
  "available": true,
  "provider": "gemini",
  "providerName": "Gemini",
  "message": "Gemini 2.0 Flash 已配置"
}
```

### 测试报告生成

```json
{
  "action": "generateInsight",
  "data": {
    "userData": {
      "summary": {
        "totalEarnedFormatted": "10小时",
        "totalSpentFormatted": "6小时",
        "totalNetFormatted": "4小时"
      },
      "habits": [
        { "name": "早起", "streak": 5, "completionRate": 80 }
      ],
      "sleep": {
        "avgDuration": 7.5,
        "avgQuality": 8
      },
      "period": "本周"
    }
  }
}
```

---

## 第四步：前端集成

### 1. 确保 ai-service.js 已加载

在 `index.html` 中添加：
```html
<script src="./js/ai-service.js"></script>
```

### 2. 修改报告页按钮事件

```javascript
// 生成 AI 报告按钮点击事件
async function generateAIReport() {
    try {
        showLoading('正在生成报告...');
        
        // 收集用户数据
        const userData = AI_SERVICE.collectUserData();
        
        // 调用云函数生成报告
        const report = await AI_SERVICE.generateInsightReport(userData, '本周');
        
        // 显示报告
        showReportModal(report);
        
    } catch (error) {
        console.error('生成报告失败:', error);
        showToast('报告生成失败: ' + error.message);
    } finally {
        hideLoading();
    }
}
```

### 3. 更新 AI 状态卡片

```javascript
// 更新 AI 状态显示
async function updateAIStatus() {
    const status = await AI_SERVICE.getStatus();
    
    const card = document.getElementById('ai-status-card');
    if (status.available) {
        card.innerHTML = `✅ AI 服务就绪 (${status.providerName})`;
        card.classList.remove('disabled');
    } else {
        card.innerHTML = `❌ AI 服务不可用: ${status.message}`;
        card.classList.add('disabled');
    }
}
```

---

## 环境变量配置参考

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `AI_PROVIDER` | 是 | 默认: `gemini` (可选: `openai`) |
| `GEMINI_API_KEY` | 条件 | Gemini API 密钥，使用 Gemini 时必填 |
| `OPENAI_API_KEY` | 条件 | OpenAI API 密钥，使用 OpenAI 时必填 |

---

## 故障排查

### 问题：云函数返回 503 "Gemini API 密钥未配置"

**解决**：检查环境变量 `GEMINI_API_KEY` 是否已正确设置

### 问题：云函数返回 429 "请求过于频繁"

**解决**：达到 Gemini 免费版限制，等待 1 分钟后重试

### 问题：前端调用云函数报错

**解决**：
1. 确认用户已登录 CloudBase
2. 检查云函数名称是否正确：`timebankAI`
3. 查看浏览器 Console 详细错误

---

## 切换 AI 提供商

如需切换到 OpenAI：

1. 修改云函数环境变量：
   ```
   AI_PROVIDER=openai
   OPENAI_API_KEY=你的OpenAI密钥
   ```

2. 前端无需修改，自动生效

---

## 安全建议

1. **不要将 API 密钥硬编码在前端代码中**
2. **定期轮换 API 密钥**
3. **在 CloudBase 控制台查看云函数调用日志**
4. **考虑添加请求频率限制**（云函数层或 API 层）

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `index.js` | 云函数主代码 |
| `package.json` | 依赖配置 |
| `../../android_project/app/src/main/assets/www/js/ai-service.js` | 前端服务层 |
| `../../android_project/app/src/main/java/.../WebAppInterface.java` | Android JS 桥接 |
