# Hermes × 云托管部署工程（TimeBank v9.37 AI 管家）

> **更新**：2026-09-19 - 新增深度记忆系统，支持全量数据摄入 + 可信度标注
> 
> 目标：Hermes Agent 常驻云托管（CloudBase Run），用 TimeBank 云开发资源点模型（hy3），
> 提供带长期记忆的管家对话 + 深度报告写回 `tb_ai_messages`（前端报告区零改动显示）。

## 架构（全部已于 2026-09-19 实测验证）

```
云托管 CloudBase Run 服务 timebank-hermes（监听 9000，常驻）
├── Hermes Agent v0.18.2（PyPI 正式包）
│    ├── LLM：provider=custom → 云开发资源点网关(hy3) OpenAI 兼容
│    ├── 长期记忆：MEMORY.md/USER.md 跨会话（已验证"记住健身偏好"）
│    └── 人格：SOUL.md「时间管家」
├── Node 桥 bridge/（@cloudbase/node-sdk + 子账号密钥）
│    ├── data-normalizer.mjs：数据清洗 + 可信度标注（新建）
│    ├── system-prompt.mjs：System Prompt 模板（新建）
│    ├── ingest-all-data.mjs：全量数据摄入（新建）
│    ├── report.mjs：读 tb_transaction/tb_daily → 调 hy3 → 写 tb_ai_messages
│    └── memory.mjs：tar 记忆 → 云存储备份/恢复（防容器盘回收）
├── server.py（纯标准库 HTTP 壳）
│    ├── GET  /health
│    ├── POST /chat        {"text"} → Hermes 对话（含记忆）
│    ├── POST /report      {"type":"daily|weekly|monthly"} → 报告写库
│    ├── POST /memory/backup|restore
│    └── 后台每10分钟自动备份记忆
└── runtime.env（运行时密钥：模型key/子账号密钥/openid/envId）
```

## 已验证的关键事实（排坑记录，AI 必读）
1. **Windows 下 Hermes 家目录是 `%LOCALAPPDATA%\hermes`**（不是 `~/.hermes`）；Linux 容器为 `/root/.hermes`。
2. **接云开发资源点网关的正确配置**（`config.yaml`）：
   `model: {default: hy3, provider: custom, base_url: https://<envId>.api.tcloudbasegateway.com/v1/ai/cloudbase, api_key: <服务端key>, api_mode: chat_completions}`
   - `provider` 必须是 `custom`（不是 openai）；`api_mode` 必须是 `chat_completions`。
   - 鉴权用「控制台→环境→API Key(client_type=server)」的 Bearer key，**不是** CAM 子账号密钥（用 CAM 密钥调 AI 网关会 403）。
3. **hy3 出干净正文**；hy4-preview 是推理模型，非流式只回 `reasoning_content`（思考草稿）。
4. 云开发 Token 资源包已于 2026-06 下线；个人版资源点套餐可直接抵扣模型 Token。
5. `tcb login --apiKeyId <id> --apiKey <key>` 可用子账号密钥免扫码登录 CLI。
6. CloudBase Run 容器必须监听 **9000**；CLI deploy 无 env 注入参数 → 用镜像内 `runtime.env`（私有镜像）。

## 目录
```
hermes/
├── deploy-pkg/        ← 部署包（tcb cloudrun deploy 的 --source）
│   ├── Dockerfile     python:3.11-slim + pip hermes-agent==0.18.2 + node 桥
│   ├── entrypoint.sh  加载 runtime.env → 恢复记忆 → 写 config.yaml → 起 HTTP
│   ├── server.py      HTTP 壳（9000）
│   ├── runtime.env    运行时密钥（不进 git！）
│   └── bridge/        见下方「Bridge 脚本说明」
├── bridge/            桥源码（deploy-pkg 同款，本机可测）
│   ├── data-normalizer.mjs  ⭐ 数据清洗与可信度标注（新建）
│   ├── system-prompt.mjs    ⭐ System Prompt 模板（新建）
│   ├── ingest-all-data.mjs  ⭐ 全量数据摄入（新建）
│   ├── incremental-analysis.mjs  增量分析（待实施）
│   ├── report.mjs           手动报告生成
│   └── memory.mjs           记忆备份/恢复
├── scripts/           本机验证脚本（openid 读取/网关测试/报告桥测试等）
├── skills/timebank-reporter.md   Hermes 技能定义
├── .env               本机环境（git 忽略）
├── config.example.env 配置模板
└── deploy/DEPLOY.md   部署步骤
```

### Bridge 脚本说明（v9.37.0 新增）

| 脚本 | 功能 | 使用场景 |
|------|------|---------|
| `data-normalizer.mjs` | 将原始交易转换为带可信度标签的结构化格式 | 所有分析脚本的预处理层 |
| `system-prompt.mjs` | 构建 System Prompt，告知模型如何解读不同可信度数据 | 调用 hy3 前拼接 |
| `ingest-all-data.mjs` | 读取全部 4000+ 交易 → 生成深度用户画像 → 写入 MEMORY.md | 首次初始化 / 重新训练 |
| `incremental-analysis.mjs` | 读取新增交易 → 生成即时洞察 → 更新 USER.md | Watch 订阅触发（待实施） |
| `report.mjs` | 读取近 20 笔交易 + 近 7 天统计 → 生成日报/周报/月报 | 手动触发 `/report` API |
| `memory.mjs` | tar 打包记忆 → 云存储备份 | 每 10 分钟自动备份 |

**核心设计理念**：
- **数据分层**：原始数据 → 标准化标注 → 特征工程 → AI 分析
- **可信度感知**：区分手动/补录/自动检测，避免误判
- **渐进式摄入**：先全量初始化，再增量实时更新

## 运维
- 部署：`tcb cloudrun deploy -s timebank-hermes --source d:\TimeBank\hermes\deploy-pkg --port 9000 --force`
- 服务地址：云托管控制台 → timebank-hermes → 访问服务（公网 URL）
- 验证：`curl <url>/health`；`curl -X POST <url>/report -d '{"type":"daily"}'`
- 回滚：服务本身独立，不影响 App 任何功能；报告数据只增不改。