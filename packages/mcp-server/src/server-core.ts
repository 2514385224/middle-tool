import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

import { formatToolError, handleToolCall } from './call-tool.js'
import { readAppData } from './config-reader.js'
import { getUpstreamRequirementHint, listProxiedTools } from './redis-proxy.js'
import { filterToolsByWritePolicy } from './tool-policy.js'
import { staticTools } from './tools.js'
import { listKubernetesTools } from './kubernetes-proxy.js'

export const SERVER_VERSION = '0.2.0'

async function listAllTools() {
  const settings = readAppData().settings
  let tools: Array<{ name: string; description?: string; inputSchema?: unknown }> = [...staticTools]
  try {
    const redisTools = await listProxiedTools()
    tools = [...staticTools, ...redisTools]
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[middle-tool] Redis 工具列表加载失败: ${message}`)
    console.error(`[middle-tool] ${getUpstreamRequirementHint()}`)
  }
  try {
    const kubernetesTools = await listKubernetesTools()
    tools = [...tools, ...kubernetesTools]
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[middle-tool] Kubernetes 工具列表加载失败: ${message}`)
  }
  return filterToolsByWritePolicy(tools, settings)
}

export async function createMiddleToolServer(): Promise<Server> {
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

  return server
}
