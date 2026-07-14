#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import {
  getDefaultConfigPath,
  getRedisCredentials,
  listRedisConnectionSummaries,
  readAppData,
  resolveConnection
} from './config-reader.js'
import {
  callUpstreamTool,
  extractConnectionArgs,
  getUpstreamRequirementHint,
  listProxiedTools
} from './redis-proxy.js'

const SERVER_VERSION = '0.1.0'

const listConnectionsTool = {
  name: 'redis_list_connections',
  description:
    '列出 MiddleTool 中已配置的 Redis 连接。仅一条连接时返回 default_connection_id，后续 redis_* 工具可省略 connection 参数。',
  inputSchema: {
    type: 'object' as const,
    properties: {
      environment: { type: 'string', description: '按环境名称筛选' },
      enabled_only: { type: 'boolean', description: '仅返回已启用连接，默认 true' }
    }
  }
}

function resolveFromConnectionArgs(args: Record<string, unknown>) {
  const data = readAppData()
  let connectionId = args.connection_id as string | undefined
  const connectionName = args.connection_name as string | undefined
  const environmentName = args.environment as string | undefined

  if (!connectionId && !connectionName) {
    const { default_connection_id } = listRedisConnectionSummaries(data)
    if (default_connection_id) connectionId = default_connection_id
  }

  return resolveConnection(data, {
    connectionId,
    connectionName,
    environmentName,
    type: 'redis'
  })
}

function resolveCredsFromConnectionArgs(args: Record<string, unknown>) {
  const { connection } = resolveFromConnectionArgs(args)
  return getRedisCredentials(connection)
}

async function main() {
  const server = new Server(
    { name: 'middle-tool-redis-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const proxied = await listProxiedTools()
      return { tools: [listConnectionsTool, ...proxied] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[redis-mcp] 无法加载官方 redis-mcp 工具列表: ${message}`)
      console.error(`[redis-mcp] ${getUpstreamRequirementHint()}`)
      return { tools: [listConnectionsTool] }
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const a = args as Record<string, unknown>

    try {
      if (name === 'redis_list_connections') {
        const data = readAppData()
        const summary = listRedisConnectionSummaries(data, {
          enabledOnly: a.enabled_only !== false,
          environmentName: a.environment as string | undefined
        })
        const payload = {
          ...summary,
          upstream: 'redis/mcp-redis',
          hint:
            summary.default_connection_id
              ? '仅有一条连接，后续 redis_* 工具可省略 connection 参数，或直接使用 default_connection_id'
              : '存在多条连接，后续 redis_* 工具请传入 connection_id（推荐）或 connection_name'
        }
        return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
      }

      const { connectionArgs, toolArgs } = extractConnectionArgs(a)
      const creds = resolveCredsFromConnectionArgs(connectionArgs)
      const result = await callUpstreamTool(creds, name, toolArgs)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const hint = getUpstreamRequirementHint()
      return {
        content: [{ type: 'text', text: `Error: ${message}\n\n${hint}` }],
        isError: true
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`Redis MCP Server v${SERVER_VERSION} started (proxy → redis/mcp-redis)`)
  console.error(`Config: ${getDefaultConfigPath()}`)
  console.error(getUpstreamRequirementHint())
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
