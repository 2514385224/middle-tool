# MiddleTool MCP Server

MiddleTool 的**统一 MCP Server**，Cursor / Claude Desktop 只需配置一个 `middle-tool` 入口。

## 特性

- **单一入口** — 一个 MCP Server 提供全部中间件 tools
- **零配置连接** — 自动读取 MiddleTool 桌面端已保存的连接
- **多连接** — 通过 `connection_id`（推荐）或 `connection_name` 选择目标

## 工作原理

```
AI Agent → middle-tool-mcp-server (stdio)
                ↓
         middle-tool-config.json
                ↓
    Loki / MySQL / Redis / RocketMQ / Elasticsearch / MongoDB …
```

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
| `ROCKETMQ_MCP_JAR_PATH` | RocketMQ Admin 桥接 JAR 路径 |
| `ROCKETMQ_MCP_PORT` | RocketMQ Admin 桥接端口，默认 16868 |
| `REDIS_MCP_COMMAND` | uvx 可执行文件路径（Redis 代理用） |

## License

MIT
