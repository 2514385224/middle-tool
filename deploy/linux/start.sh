#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export MIDDLE_TOOL_MCP_TRANSPORT="${MIDDLE_TOOL_MCP_TRANSPORT:-http}"
export MIDDLE_TOOL_MCP_HOST="${MIDDLE_TOOL_MCP_HOST:-0.0.0.0}"
export MIDDLE_TOOL_MCP_PORT="${MIDDLE_TOOL_MCP_PORT:-8080}"
export MIDDLE_TOOL_CONFIG_PATH="${MIDDLE_TOOL_CONFIG_PATH:-$ROOT/config/middle-tool-config.json}"
export ROCKETMQ_MCP_JAR_PATH="${ROCKETMQ_MCP_JAR_PATH:-$ROOT/runtime/rocketmq-mcp.jar}"

if [[ ! -f "$MIDDLE_TOOL_CONFIG_PATH" ]]; then
  echo "[middle-tool] 配置文件不存在: $MIDDLE_TOOL_CONFIG_PATH" >&2
  echo "[middle-tool] 请复制 config/middle-tool-config.json.example 并填写连接信息" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[middle-tool] 需要 Node.js >= 18" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "[middle-tool] 当前 Node.js 版本过低，需要 >= 18" >&2
  exit 1
fi

echo "[middle-tool] transport=$MIDDLE_TOOL_MCP_TRANSPORT host=$MIDDLE_TOOL_MCP_HOST port=$MIDDLE_TOOL_MCP_PORT"
echo "[middle-tool] config=$MIDDLE_TOOL_CONFIG_PATH"

exec node "$ROOT/dist/index.js" --http --host "$MIDDLE_TOOL_MCP_HOST" --port "$MIDDLE_TOOL_MCP_PORT"
