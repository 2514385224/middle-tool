# MiddleTool MCP · Linux 部署

解压即用，对外提供统一 MCP HTTP/SSE 服务。

## 环境要求

- Linux x64
- Node.js >= 18
- Java 17+（使用 RocketMQ 工具时需要）
- `uvx`（使用 Redis 工具时需要，或设置 `REDIS_MCP_COMMAND`）

## 快速启动

```bash
tar -xzf middle-tool-mcp-linux-x64-*.tar.gz
cd middle-tool-mcp

cp config/middle-tool-config.json.example config/middle-tool-config.json
# 编辑 config/middle-tool-config.json，填入中间件连接

chmod +x bin/start.sh
./bin/start.sh
```

默认监听 `0.0.0.0:8080`。

## 对外访问地址

| 协议 | 地址 | 说明 |
|------|------|------|
| Streamable HTTP | `http://<IP>:8080/mcp` | 推荐，现代 MCP 客户端 |
| Legacy SSE | `http://<IP>:8080/sse` | 兼容旧版 SSE 客户端 |
| Legacy POST | `http://<IP>:8080/messages` | SSE 配套消息端点 |
| Health | `http://<IP>:8080/health` | 健康检查 |
| Config reload | `POST http://<IP>:8080/admin/reload` | 手动热重载配置 |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `MIDDLE_TOOL_MCP_HOST` | `0.0.0.0` | 绑定地址 |
| `MIDDLE_TOOL_MCP_PORT` | `8080` | 监听端口 |
| `MIDDLE_TOOL_MCP_TRANSPORT` | `http` | `http` 或 `stdio` |
| `MIDDLE_TOOL_CONFIG_PATH` | `./config/middle-tool-config.json` | 连接配置文件 |
| `MIDDLE_TOOL_MCP_ALLOWED_HOSTS` | - | 绑定 `0.0.0.0` 时建议设置 Host 白名单 |
| `MIDDLE_TOOL_MCP_API_KEY` | - | 可选。设置后 HTTP/SSE/API 需鉴权；未设置则不校验 |
| `MIDDLE_TOOL_CONFIG_WATCH` | 启用 | HTTP 模式下监听配置文件变更；设为 `0` 关闭 |
| `ROCKETMQ_MCP_JAR_PATH` | `./runtime/rocketmq-mcp.jar` | RocketMQ 桥接 JAR |
| `REDIS_MCP_COMMAND` | `uvx` | Redis 上游 MCP 启动命令 |
| `REDIS_MCP_WARMUP` | 启用 | 启动时预拉 redis-mcp-server；设为 `0` 关闭 |
| `REDIS_MCP_WARMUP_TIMEOUT_MS` | `20000` | uvx 预热超时（毫秒） |

## 自定义端口示例

```bash
MIDDLE_TOOL_MCP_HOST=192.168.1.100 MIDDLE_TOOL_MCP_PORT=9000 ./bin/start.sh
```

## Cursor 远程 MCP 配置示例

Streamable HTTP（按实际 IP/端口修改）：

```json
{
  "mcpServers": {
    "middle-tool": {
      "url": "http://192.168.1.100:8080/mcp"
    }
  }
}
```

启用 API Key 时（`MIDDLE_TOOL_MCP_API_KEY`）：

```json
{
  "mcpServers": {
    "middle-tool": {
      "url": "http://192.168.1.100:8080/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-key"
      }
    }
  }
}
```

Legacy SSE：

```json
{
  "mcpServers": {
    "middle-tool": {
      "url": "http://192.168.1.100:8080/sse"
    }
  }
}
```

## systemd 示例

```ini
[Unit]
Description=MiddleTool MCP Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/middle-tool-mcp
Environment=MIDDLE_TOOL_MCP_HOST=0.0.0.0
Environment=MIDDLE_TOOL_MCP_PORT=8080
Environment=MIDDLE_TOOL_CONFIG_PATH=/opt/middle-tool-mcp/config/middle-tool-config.json
ExecStart=/opt/middle-tool-mcp/bin/start.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## 安全提示

- 默认无鉴权，请勿直接暴露到公网
- 内网部署建议配合防火墙限制来源 IP
- 可通过 `MIDDLE_TOOL_MCP_ALLOWED_HOSTS` 限制 Host 头
- 默认关闭 MCP 写入（`settings.mcpWriteEnabled=false`）
