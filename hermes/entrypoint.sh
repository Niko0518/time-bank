#!/bin/bash
# TimeBank Hermes 管家 · 云托管启动脚本
# 流程：加载运行时配置 → 恢复记忆 → 写 Hermes 配置 → 启动 HTTP(9000)
set -e

export HOME=/root
export HERMES_HOME=/root/.hermes

# 1) 运行时配置：优先平台环境变量；缺失项从 /srv/runtime.env 补齐
if [ -f /srv/runtime.env ]; then
  set -a; . /srv/runtime.env; set +a
fi
echo "[boot] env ready: envId=${CLOUDBASE_ENV_ID:-?} model=${CLOUDBASE_AI_MODEL:-hy3} keyLen=${#CLOUDBASE_SERVER_API_KEY}"

mkdir -p "${HERMES_HOME}"
touch "${HERMES_HOME}/.env"

# 2) 恢复记忆（云存储 → ~/.hermes）
echo "[boot] 1/3 restore memory..."
node /srv/bridge/memory.mjs restore || echo "[boot] restore skipped (first boot or no backup)"

# 3) Hermes 配置（指向云开发资源点网关；Windows 本机验证过的格式）
echo "[boot] 2/3 write hermes config..."
cat > "${HERMES_HOME}/config.yaml" <<EOF
model:
  default: ${CLOUDBASE_AI_MODEL:-hy3}
  provider: custom
  base_url: https://${CLOUDBASE_ENV_ID}.api.tcloudbasegateway.com/v1/ai/cloudbase
  api_key: ${CLOUDBASE_SERVER_API_KEY}
  api_mode: chat_completions
terminal:
  backend: local
  cwd: /tmp
  timeout: 120
memory:
  memory_enabled: true
  user_profile_enabled: true
  memory_char_limit: 2200
  user_char_limit: 1375
  nudge_interval: 10
streaming:
  enabled: false
agent:
  max_turns: 30
EOF

cat > "${HERMES_HOME}/SOUL.md" <<'EOF'
你是「时间管家」，TimeBank（时间银行）App 的贴身 AI 管家与健康分析师。
- 用中文交流，语气温和、鼓励但不啰嗦
- 你了解时间货币模型：earn(赚取)/spend(消耗)，分钟为记账单位
- 主动在对话中记住用户的偏好、习惯、目标（自动沉淀到长期记忆）
- 分析关注：任务效率、睡眠健康、屏幕时间、消费与储蓄平衡
EOF

# 4) 启动 HTTP（9000）
echo "[boot] 3/3 start HTTP on :${PORT:-9000}..."
exec python /srv/server.py