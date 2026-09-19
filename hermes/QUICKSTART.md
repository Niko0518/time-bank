# Hermes 深度记忆系统 - 快速启动指南

> 版本：v9.37.0-final  
> 创建时间：2026-09-19  
> 预计部署时间：**30 分钟**

---

## 🚀 一键部署流程

### 步骤 1: 部署 transactionWatcher 云函数 (5 分钟)

```powershell
cd d:\TimeBank\cloudbase-functions\transactionWatcher
tcb fn deploy --force
```

**验证**:
```powershell
tcb fn list | findstr transaction-watcher
```

---

### 步骤 2: 配置 CloudBase Watch 订阅 (5 分钟)

在 CloudBase 控制台操作：

1. 登录 [CloudBase 控制台](https://tcb.cloud.tencent.com/console)
2. 进入你的环境 → `tb_transaction` 集合
3. 点击「Watch 订阅」→ 「添加订阅」
4. 配置:
   - **目标类型**: 云函数
   - **目标函数**: `transaction-watcher`
   - **触发类型**: INSERT
   - **数据范围**: 全部文档

**保存后，Watch 订阅即生效！**

---

### 步骤 3: 部署 Hermes 服务 (10 分钟)

```powershell
cd d:\TimeBank\hermes
tcb cloudrun deploy -s timebank-hermes --source d:\TimeBank\hermes\deploy-pkg --port 9000 --force
```

**获取服务地址**:
```powershell
# 在 CloudBase 控制台查看 timebank-hermes 服务的公网 URL
# 例如：https://timebank-hermes-xxxxx.ap-shanghai.app.tcloudbase.com
```

---

### 步骤 4: 初始化用户画像 (5 分钟)

```powershell
cd d:\TimeBank\hermes\bridge

# 方式 1: 本地测试（无需部署）
node ingest-all-data.mjs your-openid-here

# 方式 2: 部署到云函数运行（推荐）
# 创建云函数 hermes-init-brain，调用 ingest-all-data.mjs
tcb fn deploy hermes-init-brain --force
```

**验证**:
```powershell
# 检查 tb_ai_brain 文档是否新增
# 检查 MEMORY.md 是否生成（本地测试时保存在当前目录）
```

---

### 步骤 5: 前端集成 (5 分钟)

修改 `android_project/app/src/main/assets/www/js/time-bot.js`:

```javascript
async _hermesChat(text, { onTick } = {}) {
  const base = await this._hermesBase();
  if (!base) throw new Error('管家服务不可用');
  
  // 新增 openid 参数
  const submit = await fetch(base + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      text,
      openid: currentOpenid  // 从全局变量读取
    }),
  });
  
  // 后续轮询逻辑不变...
}
```

---

## ✅ 验证清单

### 1. Watch 订阅测试
```powershell
# 手动创建一笔交易
# 等待 10 秒
# 检查 tb_ai_messages 是否新增一条 type='realtime_insight' 的记录
```

### 2. 对话测试
```powershell
# 与 Hermes 对话
curl -X POST https://timebank-hermes-xxxxx.ap-shanghai.app.tcloudbase.com/chat \
  -H "Content-Type: application/json" \
  -d '{"text":"我最近表现怎么样？","openid":"your-openid"}'

# 轮询结果
curl https://timebank-hermes-xxxxx.ap-shanghai.app.tcloudbase.com/chat/result?id=abc123
```

### 3. 记忆检索测试
```powershell
cd d:\TimeBank\hermes\bridge

node -e "
import('./memory-retrieval.mjs').then(m => {
  const result = m.retrieveRelevantMemory(
    '我最近表现怎么样？',
    fs.readFileSync('MEMORY.md', 'utf8')
  );
  console.log(JSON.stringify(result, null, 2));
});
"
```

---

## 🎯 预期效果

完成上述步骤后，你将看到：

### 场景 1: 实时洞察
```
用户点击「完成任务」→ 写入交易
→ 10 秒内 tb_ai_messages 新增一条实时洞察
→ 前端轮询显示："这是你今天第 5 个打卡！你的 streak 已经到 12 天了！🎉"
```

### 场景 2: 个性化对话
```
用户问："我最近表现怎么样？"
→ Hermes 检索 USER.md 中的习惯模式和异常检测
→ 返回："根据你过去 7 天的数据（共 23 笔交易），工作学习完成了 15 次，比上周多了 4 次！✅"
```

---

## 🔧 故障排查

### 问题 1: Watch 订阅未触发
**原因**: 权限不足或函数名称错误  
**解决**:
1. 检查云函数名称是否为 `transaction-watcher`
2. 确认 CloudBase 子账号密钥已配置
3. 查看云函数日志是否有报错

### 问题 2: 记忆检索失败
**原因**: MEMORY.md 不存在或格式错误  
**解决**:
1. 先运行 `ingest-all-data.mjs` 初始化
2. 检查 MEMORY.md 是否包含 JSON 和自然语言两部分

### 问题 3: /chat 端点无记忆上下文
**原因**: openid 未传递或 memory-retrieval.mjs 执行失败  
**解决**:
1. 确保请求包含 `openid` 参数
2. 查看 server.py 日志是否有 `Memory retrieval failed` 错误

---

## 📞 技术支持

遇到问题？查看以下文档：
- `FINAL-SUMMARY.md` - 完整实施总结
- `IMPLEMENTATION-STATUS.md` - 详细进度报告
- `README.md` - 架构说明

---

*祝部署顺利！🎉*
