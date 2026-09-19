# 云托管部署（CloudBase Run）—— 已验证完整流程

> 2026-09-19 通宵实战验证。服务名 `timebank-hermes`，当前版本 v002 正常运行。

## 服务信息（当前生效）
- **服务地址**（两个域名都已路由）：
  - `https://cloud1-8gvjsmyd7860b4a3-1304758747.ap-shanghai.app.tcloudbase.com/timebank-hermes`
  - `https://cloud1-8gvjsmyd7860b4a3-1384910920.ap-shanghai.app.tcloudbase.com/timebank-hermes`
- **控制台**：https://tcb.cloud.tencent.com/dev?envId=cloud1-8gvjsmyd7860b4a3#/platform-run/service/detail?serverName=timebank-hermes

## API（全部已验证）
| 端点 | 方法 | 说明 | 实测 |
|---|---|---|---|
| `/health` | GET | 存活探针 | ✅ 200 |
| `/chat` | POST `{"text":"..."}` | 异步对话，返回 `{"jobId"}` | ✅ 冷启动~4min / 热~10s |
| `/chat/result?id=<jobId>` | GET | 轮询结果 `running/done/error` | ✅ |
| `/report` | POST `{"type":"daily"}` | 生成报告写 `tb_ai_messages` | ✅ 4s |
| `/memory/backup` | POST | 记忆备份到云存储 | ✅ 19.4KB |
| `/memory/restore` | POST | 记忆恢复 | ✅ |

## 重新部署（改代码后）
```powershell
# 1. 改 d:\TimeBank\hermes\ 下的源码（server.py / bridge / entrypoint.sh / Dockerfile）
# 2. 同步到 deploy-pkg（deploy-pkg 是部署源；runtime.env 密钥文件勿进 git）
# 3. 部署（注意 entrypoint.sh 必须是 LF 行尾！）
'' | tcb cloudrun deploy -s timebank-hermes --source d:\TimeBank\hermes\deploy-pkg --port 9000 --force
# 4. 轮询构建（约3-4分钟）：tcb api tcb DescribeCloudBaseRunServer --body '{...}' 或控制台看
```

## 登录 CLI（密钥方式，免扫码）
```powershell
tcb login --apiKeyId <子账号SecretId> --apiKey <子账号SecretKey>
```

## 待办（需控制台手动，1分钟）
1. **最小副本数 0→1**（7×24 常驻，防缩容）：控制台 → timebank-hermes → 服务设置 → 基础配置 → 最小实例数=1
   - CLI 的 ModifyCloudBaseRunServerVersion API 对新版多租户服务报 ServiceNotExist，已试多个参数名无效
   - 缩容后果：闲置后冷启动慢（chat ~4min），但记忆有 10 分钟级备份+启动恢复，不丢失
2. **密钥轮换**：子账号密钥与服务端 API Key 曾在对话/文件中出现，建议日后在 CAM/API Key 页重置

## 排坑记录（AI 必读，防重蹈覆辙）
1. Windows 下 Hermes 家目录 = `%LOCALAPPDATA%\hermes`（不是 `~/.hermes`）；Linux 容器 = `/root/.hermes`
2. Hermes 接云开发资源点网关：`provider: custom` + `api_mode: chat_completions` + `api_key`(服务端Key)
3. 鉴权用「环境→API Key(client_type=server)」Bearer；**CAM 密钥调 AI 网关会 403**
4. `hy3` 出干净正文；`hy4-preview` 非流式只回 reasoning_content（思考草稿）
5. 云托管路由：`tcb routes add`（域名用真实访问域名，`*` 不被接受；上游类型 CBR；默认剥前缀）
6. 平台网关 HTTP 超时 ~60s → chat 必须异步（jobId + 轮询）
7. PowerShell 传 JSON 给 `tcb api --body` 需转义内层引号：`'{\"k\":\"v\"}'`
8. Windows 写的 .sh 必须 LF 行尾，否则容器报 bad interpreter
9. `tcb db nosql execute` 与泛网关 callApis 均不可用；建集合用 node-sdk `db.createCollection()`
10. 云托管 CLS 日志查询不到容器 stdout（只有 SCF 日志），容器调试靠接口返回的自带 log