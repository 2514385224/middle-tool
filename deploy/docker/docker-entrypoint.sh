#!/bin/sh
set -eu

CONFIG_PATH="${MIDDLE_TOOL_CONFIG_PATH:-/app/config/middle-tool-config.json}"
HOST="${MIDDLE_TOOL_MCP_HOST:-0.0.0.0}"
PORT="${MIDDLE_TOOL_MCP_PORT:-8080}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "[middle-tool] 配置文件不存在: $CONFIG_PATH" >&2
  echo "[middle-tool] 请挂载配置文件，例如:" >&2
  echo "  -v ./config/middle-tool-config.json:/app/config/middle-tool-config.json:ro" >&2
  exit 1
fi

echo "[middle-tool] transport=http host=$HOST port=$PORT"
echo "[middle-tool] config=$CONFIG_PATH"

exec node /app/dist/index.js --http --host "$HOST" --port "$PORT"
