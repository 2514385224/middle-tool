# MiddleTool MySQL MCP Server

读取 MiddleTool 桌面端已保存的 MySQL 连接，对外提供与 [mcp-server-mysql](https://github.com/benborla/mcp-server-mysql) 兼容的查询能力。

## 工具

| 工具 | 说明 |
|------|------|
| `mysql_list_connections` | 列出已配置的 MySQL 连接 |
| `mysql_query` | 执行 SQL（默认只读） |
| `mysql_list_tables` | 列出表及元信息 |
| `mysql_table_columns` | 查询表列定义 |

## 连接参数

所有 `mysql_*` 工具（除 `mysql_list_connections`）支持：

- `connection_id`（推荐）
- `connection_name` + `environment`

仅配置一条 MySQL 连接时可省略上述参数。

## 本地启动

```bash
npm run build -w @middle-tool/mysql-mcp-server
MIDDLE_TOOL_CONFIG_PATH=/path/to/middle-tool-config.json npm run start -w @middle-tool/mysql-mcp-server
```

## Cursor 配置片段

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["packages/mysql-mcp-server/dist/index.js"],
      "env": {
        "MIDDLE_TOOL_CONFIG_PATH": "C:\\Users\\你\\AppData\\Roaming\\middle-tool\\middle-tool-config.json"
      },
      "autoApprove": ["mysql_list_connections", "mysql_query", "mysql_list_tables", "mysql_table_columns"]
    }
  }
}
```

也可在 MiddleTool 桌面端「MCP 配置」一键导出完整 JSON。
