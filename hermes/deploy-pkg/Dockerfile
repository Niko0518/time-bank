# ============================================================
# TimeBank Hermes 管家 × CloudBase Run（云托管）容器
# 已验证技术决策（2026-09-19）：
#   1. Hermes 用 PyPI 正式包 hermes-agent==0.18.2（本机验证一致）
#   2. LLM provider=custom → 云开发资源点网关(hy3)，OpenAI 兼容
#      配置: model: {default, provider: custom, base_url, api_key, api_mode: chat_completions}
#   3. CloudBase 读写走 Node 桥(@cloudbase/node-sdk)
#   4. HTTP 壳用 Python 标准库，监听 9000（CloudBase Run 要求）
#   5. 记忆持久化：tar ~/.hermes(记忆部分) → 云存储；启动恢复
#   6. 运行时密钥：/srv/runtime.env（私有镜像内；后续可迁平台环境变量）
# ============================================================
FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    HERMES_HOME=/root/.hermes \
    PORT=9000

# 系统依赖：curl ripgrep(Hermes工具) nodejs+npm(桥) tar(记忆打包)
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ripgrep tar ca-certificates nodejs npm \
 && rm -rf /var/lib/apt/lists/*

# ---- Hermes Agent（PyPI 正式包，腾讯镜像加速）----
RUN pip install --no-cache-dir -i https://mirrors.cloud.tencent.com/pypi/simple \
    hermes-agent==0.18.2

# ---- Node 报告桥 ----
WORKDIR /srv
COPY bridge/package.json ./bridge/package.json
COPY bridge/report.mjs ./bridge/report.mjs
COPY bridge/memory.mjs ./bridge/memory.mjs
RUN cd bridge && npm install --omit=dev --registry=https://registry.npmmirror.com \
 && npm cache clean --force

# ---- HTTP 壳 + 启动脚本 + 运行时配置 ----
COPY server.py ./server.py
COPY entrypoint.sh ./entrypoint.sh
COPY runtime.env ./runtime.env
RUN chmod +x ./entrypoint.sh

EXPOSE 9000
CMD ["./entrypoint.sh"]