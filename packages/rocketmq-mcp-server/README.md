# MiddleTool RocketMQ MCP Server

RocketMQ 专用 MCP Server，配合 MiddleTool 桌面端 **内嵌托管 Java Admin 桥接**。

## 架构

```
Cursor → rocketmq-mcp-server (Node, stdio)
              ↓ localhost:16868
         Java Admin 桥接（由 Electron 托管，或 Node 兜底自动拉起）
              ↓ RocketMQ Admin API
         NameServer / Broker
```

| 场景 | 谁启动 Admin |
|------|----------------|
| MiddleTool 桌面端已打开 | **Electron 主进程**托管 |
| 仅 Cursor 调 MCP（桌面端未开） | Node `java-runtime` 检测端口后自动拉起 |

用户只需配置 **NameServer + ACL**，无需部署 Admin 服务、无需填写 Admin 地址。

## 开发环境构建 JAR（一次性）

发布安装包会在 `build:win` 时自动构建；本地开发需手动执行一次：

```bash
npm run rocketmq-mcp:java:build
```

产物：`packages/rocketmq-mcp-server/runtime/rocketmq-mcp.jar`（需 Java 17+、Maven、Git）

## 打包

`npm run build:win` 会依次：编译 MCP → 构建 JAR → 打入 `extraResources`。

安装包可选内置 JRE（`resources/jre`），否则使用系统 `java`。

## 环境变量

| 变量 | 说明 |
|------|------|
| `MIDDLE_TOOL_CONFIG_PATH` | MiddleTool 配置文件路径 |
| `ROCKETMQ_MCP_JAR_PATH` | Admin 桥接 JAR 路径 |
| `ROCKETMQ_MCP_PORT` | Admin 端口，默认 `16868` |
| `ROCKETMQ_JAVA_PATH` | Java 可执行文件路径（可选） |

## License

MIT
