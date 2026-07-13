#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
  getDefaultConfigPath,
  getMysqlCredentials,
  listMysqlConnectionSummaries,
  readAppData,
  resolveConnection
} from './config-reader.js'
import { executeQuery, listTableColumns, listTables } from './mysql-client.js'

const SERVER_VERSION = '0.1.0'

const connectionParams = {
  connection_id: {
    type: 'string' as const,
    description: 'MiddleTool MySQL 连接 ID（推荐）'
  },
  connection_name: {
    type: 'string' as const,
    description: '连接名称（需配合 environment）'
  },
  environment: {
    type: 'string' as const,
    description: '环境名称'
  }
}

const tools = [
  {
    name: 'mysql_list_connections',
    description:
      '列出 MiddleTool 中已配置的 MySQL 连接。仅一条连接时返回 default_connection_id，后续工具可省略 connection 参数。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string', description: '按环境名称筛选' },
        enabled_only: { type: 'boolean', description: '仅返回已启用连接，默认 true' }
      }
    }
  },
  {
    name: 'mysql_query',
    description:
      '对 MiddleTool 已配置的 MySQL 连接执行 SQL。默认只读；写操作需在桌面端连接中显式开启 INSERT/UPDATE/DELETE 权限。',
    inputSchema: {
      type: 'object' as const,
      required: ['sql'],
      properties: {
        sql: { type: 'string', description: '要执行的 SQL 语句' },
        ...connectionParams
      }
    }
  },
  {
    name: 'mysql_list_tables',
    description: '列出 MySQL 数据库中的表及元信息（对应 mcp-server-mysql 的 mysql://tables 资源）',
    inputSchema: {
      type: 'object' as const,
      properties: { ...connectionParams }
    }
  },
  {
    name: 'mysql_table_columns',
    description: '查询指定表的列定义',
    inputSchema: {
      type: 'object' as const,
      required: ['table'],
      properties: {
        table: { type: 'string', description: '表名' },
        database: { type: 'string', description: '库名，默认使用连接配置中的 database' },
        ...connectionParams
      }
    }
  }
]

function resolveFromArgs(args: Record<string, unknown>) {
  const data = readAppData()
  let connectionId = args.connection_id as string | undefined
  const connectionName = args.connection_name as string | undefined
  const environmentName = args.environment as string | undefined

  if (!connectionId && !connectionName) {
    const { default_connection_id } = listMysqlConnectionSummaries(data)
    if (default_connection_id) connectionId = default_connection_id
  }

  return resolveConnection(data, {
    connectionId,
    connectionName,
    environmentName,
    type: 'mysql'
  })
}

function credsFromArgs(args: Record<string, unknown>) {
  const { connection } = resolveFromArgs(args)
  return getMysqlCredentials(connection)
}

async function main() {
  const server = new Server(
    { name: 'middle-tool-mysql-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const a = args as Record<string, unknown>

    try {
      switch (name) {
        case 'mysql_list_connections': {
          const data = readAppData()
          const summary = listMysqlConnectionSummaries(data, {
            enabledOnly: a.enabled_only !== false,
            environmentName: a.environment as string | undefined
          })
          const payload = {
            ...summary,
            hint:
              summary.default_connection_id
                ? '仅有一条连接，后续 mysql_* 工具可省略 connection 参数，或直接使用 default_connection_id'
                : '存在多条连接，后续 mysql_* 工具请传入 connection_id（推荐）或 connection_name'
          }
          return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
        }

        case 'mysql_query': {
          if (!a.sql) throw new Error('sql 参数必填')
          const text = await executeQuery(credsFromArgs(a), a.sql as string)
          return { content: [{ type: 'text', text }] }
        }

        case 'mysql_list_tables': {
          const text = await listTables(credsFromArgs(a))
          return { content: [{ type: 'text', text }] }
        }

        case 'mysql_table_columns': {
          if (!a.table) throw new Error('table 参数必填')
          const text = await listTableColumns(
            credsFromArgs(a),
            a.table as string,
            a.database as string | undefined
          )
          return { content: [{ type: 'text', text }] }
        }

        default:
          throw new Error(`未知工具: ${name}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`MySQL MCP Server v${SERVER_VERSION} started`)
  console.error(`Config: ${getDefaultConfigPath()}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
