# 扩展新中间件适配器

MiddleTool 采用**插件式适配器 + 统一 MCP Server** 架构。新增中间件时，桌面端负责连接元数据与校验，实际 MCP tools 在 `packages/mcp-server` 中实现。

## 架构概览

```
shared/types/                    # UI 与主进程共享类型
electron/main/adapters/
  base.ts                        # defineConnectionAdapter / definePlannedAdapter
  registry.ts                    # 注册表（聚合点）
  loki.ts, mysql.ts, redis.ts …  # 各中间件元数据 + validateConnection
packages/mcp-server/src/
  tools.ts                       # tool 定义（给 Cursor 看）
  call-tool.ts                   # tool 实现
  *-client.ts                    # 可选：HTTP/SDK 客户端
electron/main/services/
  connection-test.ts             # 可选：连通性探测
```

数据流：

```
UI 配置连接 → electron-store (middle-tool-config.json)
         → packages/mcp-server 读取配置
         → 按 connection_id 路由到对应中间件 API
```

**不再**为每个中间件单独 spawn MCP 进程（Redis 例外：通过 uvx 代理官方 `redis/mcp-redis`）。

## 快速添加（可用适配器）

### 1. 创建适配器文件

`electron/main/adapters/my-middleware.ts`：

```typescript
import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const META: AdapterMeta = {
  type: 'my-middleware',
  name: 'My Middleware',
  description: '简短说明',
  category: 'database', // logging | messaging | database | cache | monitoring | other
  status: 'available',
  docsUrl: 'https://github.com/org/my-mcp-server',
  tools: ['my_middleware_list_connections', 'my_middleware_query'],
  previewField: 'host',
  connectionFields: [
    {
      key: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      group: '连接'
    }
  ]
}

export const myMiddlewareAdapter = defineConnectionAdapter({
  meta: META,
  validateConnection(config) {
    if (!config.host?.trim()) return 'Host 不能为空'
    return null
  }
})
```

### 2. 注册到 registry.ts

```typescript
import { myMiddlewareAdapter } from './my-middleware'

const ALL_ADAPTERS: McpAdapter[] = [
  // ...
  myMiddlewareAdapter
]
```

### 3. 在 packages/mcp-server 实现 tools

- `tools.ts`：添加 tool 的 `name`、`description`、`inputSchema`
- `call-tool.ts`：在 `handleToolCall` 中实现分支
- `config-reader.ts`：添加 `getXxxCredentials`、`listXxxConnectionSummaries`（参考 MySQL / Elasticsearch）
- 可选 `my-middleware-client.ts`：封装 HTTP 或 SDK 调用

### 4. 连接测试（推荐）

`electron/main/services/connection-test.ts` 的 `switch (type)` 中增加 `case 'my-middleware':`。

完成后 UI 会自动：

- 出现在「中间件配置」适配器列表与筛选器
- 出现在「中间件目录」（含 MCP 来源链接）
- 支持连接测试、MCP 配置导出

## 占位适配器（尚未实现 MCP）

```typescript
import { definePlannedAdapter } from './base'

const KAFKA_META: AdapterMeta = {
  type: 'kafka',
  name: 'Apache Kafka',
  description: '…',
  category: 'messaging',
  status: 'planned',
  docsUrl: 'https://github.com/gAmUssA/mcp-kafka',
  connectionFields: [/* … */]
}

export const kafkaAdapter = definePlannedAdapter(KAFKA_META)
```

`status: 'planned'` 时用户只能预览表单，不能创建连接或导出 MCP。

## 适配器契约

| 字段 / 方法 | 用途 |
|-------------|------|
| `meta.type` | 唯一标识，与 MCP tool 路由一致 |
| `meta.connectionFields` | 驱动连接表单 |
| `meta.docsUrl` | 中间件目录展示 MCP 上游仓库 |
| `meta.tools` | 目录页展示 tool 数量 |
| `validateConnection?` | 保存前校验，返回错误字符串或 `null` |

## 集成方式选型

| 方式 | 适用 | 示例 |
|------|------|------|
| 内置 TS 客户端 | HTTP / DB SDK | Loki、MySQL、Elasticsearch、MongoDB |
| uvx 子进程代理 | 官方 Python MCP 包 | Redis → `redis/mcp-redis` |
| Java 桥接 JAR | 重型 Admin API | RocketMQ Admin 桥接 |

## 分类说明

| category | 说明 |
|----------|------|
| logging | 日志（Loki、Elasticsearch） |
| messaging | 消息队列（RocketMQ、Kafka） |
| database | 数据库（MySQL、MongoDB） |
| cache | 缓存（Redis） |
| monitoring | 监控 |
| other | 其他 |

## 验证

```bash
npm run mcp:build
npm run mcp:verify
npm run typecheck
```

`mcp:verify` 会检查统一 `middle-tool` MCP 是否启动，并校验各类型 `*_list_connections` 工具是否存在。
