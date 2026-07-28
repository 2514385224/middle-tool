# MiddleTool MCP Server

MiddleTool 的**统一 MCP Server**，Cursor / Claude Desktop 只需配置一个 `middle-tool` 入口。

## 特性

- **单一入口** — 一个 MCP Server 提供全部中间件 tools
- **零配置连接** — 自动读取 MiddleTool 桌面端已保存的连接
- **多连接** — 通过 `connection_id`（推荐）或 `connection_name` 选择目标

## 工作原理

```
AI Agent → middle-tool-mcp-server (stdio 或 HTTP/SSE)
                ↓
         middle-tool-config.json
                ↓
    Loki / MySQL / Redis / RocketMQ / Elasticsearch / MongoDB …
```

## 传输模式

| 模式 | 启动方式 | 适用场景 |
|------|----------|----------|
| stdio（默认） | `node dist/index.js` | Cursor / Claude Desktop 本地子进程 |
| HTTP | `MIDDLE_TOOL_MCP_TRANSPORT=http node dist/index.js` | Linux 解压部署，对外 IP:端口 |

HTTP 模式默认监听 `0.0.0.0:8080`：

- Streamable HTTP: `http://<IP>:8080/mcp`
- Legacy SSE: `http://<IP>:8080/sse`
- 健康检查: `http://<IP>:8080/health`

Linux 打包：`npm run build:linux-mcp` → `release/middle-tool-mcp-linux-x64-*.tar.gz`

## 快速开始

```bash
npm run build -w @middle-tool/mcp-server
```

### Cursor 配置

```json
{
  "mcpServers": {
    "middle-tool": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"]
    }
  }
}
```

连接配置自动从默认路径读取。桌面端「MCP 配置」会根据已启用的 RocketMQ / Redis 连接自动补充 env。

### 远程 HTTP MCP（Cursor）

```json
{
  "mcpServers": {
    "middle-tool": {
      "url": "http://192.168.1.100:8080/mcp"
    }
  }
}
```

### HTTP API Key（可选）

服务端设置 `MIDDLE_TOOL_MCP_API_KEY` 后，除 `/health` 外的 HTTP 请求需携带 Key；未设置则与原来一样不校验。

```bash
export MIDDLE_TOOL_MCP_API_KEY=your-secret-key
```

Cursor `mcp.json`：

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

也支持请求头 `X-API-Key: your-secret-key`。curl 示例：

```bash
curl -H "Authorization: Bearer your-secret-key" http://127.0.0.1:8080/api/connections
```

### 配置热 reload 与 API 更新

HTTP 模式下默认监听配置文件变更（`MIDDLE_TOOL_CONFIG_WATCH=0` 可关闭）。Docker 挂载卷时 `fs.watch` 可能不稳定，**推荐用 API 或手动 reload**。

**读取当前配置：**

```bash
curl http://127.0.0.1:8080/admin/config
```

**整文件替换（扁平 JSON 或桌面 export 包装均可）：**

```bash
curl -X PUT http://127.0.0.1:8080/admin/config \
  -H "Content-Type: application/json" \
  -d @middle-tool-config.json
```

**仅重新从磁盘加载（例如已在宿主机改好挂载文件）：**

```bash
curl -X POST http://127.0.0.1:8080/admin/reload
```

启用 API Key 时以上请求需带 `Authorization: Bearer ...`。写入完成后**无需重启容器**；下一次 MCP 工具调用会使用新连接信息（并自动清空 MySQL/Redis 连接池）。

禁用 API 写入：`MIDDLE_TOOL_CONFIG_WRITE=0`（仍可读、可 reload）。

## Tools

| 分类 | 工具 |
|------|------|
| 通用 | `middle_list_environments`, `middle_list_connections` |
| Loki | `loki_query`, `loki_label_names`, `loki_label_values` |
| MySQL | `mysql_list_connections`, `mysql_query`, `mysql_list_tables`, `mysql_table_columns` |
| Redis | `redis_list_connections`, `redis_*`（代理官方 redis/mcp-redis） |
| RocketMQ | `rocketmq_list_connections`, `rocketmq_list_topics`, … |
| Elasticsearch | `elasticsearch_list_connections`, `elasticsearch_list_indices`, `elasticsearch_search`, … |
| MongoDB | `mongodb_list_connections`, `mongodb_list_databases`, `mongodb_find`, `mongodb_aggregate`, … |

## 环境变量

| 变量 | 说明 |
|------|------|
| `MIDDLE_TOOL_CONFIG_PATH` | 覆盖默认配置文件路径 |
| `MIDDLE_TOOL_MCP_TRANSPORT` | `stdio`（默认）或 `http` |
| `MIDDLE_TOOL_MCP_HOST` | HTTP 绑定地址，默认 `0.0.0.0` |
| `MIDDLE_TOOL_MCP_PORT` | HTTP 端口，默认 `8080` |
| `MIDDLE_TOOL_MCP_PATH` | Streamable HTTP 路径，默认 `/mcp` |
| `MIDDLE_TOOL_MCP_ALLOWED_HOSTS` | 绑定 `0.0.0.0` 时的 Host 白名单 |
| `MIDDLE_TOOL_MCP_API_KEY` | 可选。设置后 HTTP/SSE/API 需鉴权；未设置则不校验 |
| `MIDDLE_TOOL_CONFIG_WATCH` | `1`（默认）HTTP 模式下监听配置文件变更并热 reload |
| `MIDDLE_TOOL_CONFIG_WRITE` | `1`（默认）允许 `PUT /admin/config`；设为 `0` 只读 |
| `ROCKETMQ_MCP_JAR_PATH` | RocketMQ Admin 桥接 JAR 路径 |
| `ROCKETMQ_MCP_PORT` | RocketMQ Admin 桥接端口，默认 6868 |
| `REDIS_MCP_COMMAND` | uvx 可执行文件路径（Redis 代理用） |
| `REDIS_MCP_WARMUP` | 设为 `0` 关闭启动时 uvx 预热；默认开启 |
| `REDIS_MCP_WARMUP_TIMEOUT_MS` | uvx 预热超时，默认 `20000` |
| `REDIS_MCP_WARMUP_ARGS` | 自定义预热命令参数（配合 `REDIS_MCP_COMMAND`） |
| `REDIS_MCP_PROBE_LIVE` | 设为 `1` 时启动时 live 探测上游 tools/list（默认用内置 manifest） |

## License

MIT
