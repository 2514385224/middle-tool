# MiddleTool MCP — 基于已构建的 Linux 包（release/*.tar.gz）
# 构建前请先执行: npm run build:linux-mcp
FROM node:20-bookworm-slim

ARG APP_VERSION=0.1.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-17-jre-headless curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.6.14 /uv /uvx /bin/

# 预拉取 redis-mcp-server，避免首次 tools/list 下载阻塞
RUN uvx --from redis-mcp-server@latest redis-mcp-server --help >/dev/null 2>&1 || true

COPY release/middle-tool-mcp-linux-x64-${APP_VERSION}.tar.gz /tmp/bundle.tar.gz

RUN mkdir -p /opt \
  && tar -xzf /tmp/bundle.tar.gz -C /opt \
  && mv "/opt/middle-tool-mcp-linux-x64-${APP_VERSION}" /app \
  && rm /tmp/bundle.tar.gz \
  && chmod +x /app/bin/start.sh

WORKDIR /app

ENV MIDDLE_TOOL_MCP_TRANSPORT=http \
  MIDDLE_TOOL_MCP_HOST=0.0.0.0 \
  MIDDLE_TOOL_MCP_PORT=8080 \
  MIDDLE_TOOL_CONFIG_PATH=/app/config/middle-tool-config.json \
  ROCKETMQ_MCP_JAR_PATH=/app/runtime/rocketmq-mcp.jar \
  REDIS_MCP_COMMAND=uvx

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:8080/health" || exit 1

ENTRYPOINT ["/app/bin/start.sh"]
