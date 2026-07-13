#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import { formatToolError, handleToolCall } from './call-tool.js'
import { getDefaultConfigPath } from './config-reader.js'
import { getUpstreamRequirementHint, listProxiedTools } from './redis-proxy.js'
import { staticTools } from './tools.js'

const SERVER_VERSION = '0.2.0'

async function listAllTools() {
  try {
    const redisTools = await listProxiedTools()
    return [...staticTools, ...redisTools]
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[middle-tool] Redis 工具列表加载失败: ${message}`)
    console.error(`[middle-tool] ${getUpstreamRequirementHint()}`)
    return staticTools
  }
}

async function main() {
  const server = new Server(
    { name: 'middle-tool-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: await listAllTools()
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    try {
      return await handleToolCall(name, args as Record<string, unknown>)
    } catch (err) {
      return formatToolError(err, name)
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`MiddleTool MCP Server v${SERVER_VERSION} started (unified)`)
  console.error(`Config: ${getDefaultConfigPath()}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
