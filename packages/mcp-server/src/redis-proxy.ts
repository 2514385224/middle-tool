import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

export const REDIS_TOOL_PREFIX = 'redis_'
export const CONNECTION_ARG_KEYS = ['connection_id', 'connection_name', 'environment'] as const

const PROBE_URL = 'redis://127.0.0.1:6379/0'

let cachedUpstreamTools: Tool[] | null = null

function resolveSpawnArgs(url: string): { command: string; args: string[] } {
  const customCommand = process.env.REDIS_MCP_COMMAND?.trim()
  const customArgs = process.env.REDIS_MCP_ARGS?.trim()

  if (customCommand && customArgs) {
    return { command: customCommand, args: [...customArgs.split(/\s+/), '--url', url] }
  }

  if (customCommand) {
    return {
      command: customCommand,
      args: ['--from', 'redis-mcp-server@latest', 'redis-mcp-server', '--url', url]
    }
  }

  return {
    command: 'uvx',
    args: ['--from', 'redis-mcp-server@latest', 'redis-mcp-server', '--url', url]
  }
}

function prefixToolName(name: string): string {
  return name.startsWith(REDIS_TOOL_PREFIX) ? name : `${REDIS_TOOL_PREFIX}${name}`
}

function stripToolPrefix(name: string): string {
  return name.startsWith(REDIS_TOOL_PREFIX) ? name.slice(REDIS_TOOL_PREFIX.length) : name
}

const connectionParamsSchema = {
  connection_id: {
    type: 'string',
    description: 'MiddleTool Redis 连接 ID（推荐）'
  },
  connection_name: {
    type: 'string',
    description: '连接名称（需配合 environment 使用）'
  },
  environment: {
    type: 'string',
    description: '环境名称'
  }
}

function withConnectionParams(tool: Tool): Tool {
  const schema = tool.inputSchema ?? { type: 'object', properties: {} }
  return {
    ...tool,
    name: prefixToolName(tool.name),
    description: `[需指定连接] ${tool.description ?? ''}`.trim(),
    inputSchema: {
      ...schema,
      type: 'object',
      properties: { ...connectionParamsSchema, ...(schema.properties ?? {}) }
    }
  }
}

async function withUpstreamClient<T>(url: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const { command, args } = resolveSpawnArgs(url)
  const transport = new StdioClientTransport({ command, args })
  const client = new Client({ name: 'middle-tool-redis-proxy', version: '0.1.0' }, { capabilities: {} })

  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

export async function fetchUpstreamTools(): Promise<Tool[]> {
  if (cachedUpstreamTools) return cachedUpstreamTools
  const tools = await withUpstreamClient(PROBE_URL, async (client) => {
    const result = await client.listTools()
    return result.tools
  })
  cachedUpstreamTools = tools
  return tools
}

export async function listProxiedTools(): Promise<Tool[]> {
  const upstream = await fetchUpstreamTools()
  return upstream.map(withConnectionParams)
}

export function extractConnectionArgs(args: Record<string, unknown>): {
  connectionArgs: Record<string, unknown>
  toolArgs: Record<string, unknown>
} {
  const connectionArgs: Record<string, unknown> = {}
  const toolArgs: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(args)) {
    if ((CONNECTION_ARG_KEYS as readonly string[]).includes(key)) {
      connectionArgs[key] = value
    } else {
      toolArgs[key] = value
    }
  }

  return { connectionArgs, toolArgs }
}

export async function callUpstreamTool(
  url: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string; [key: string]: unknown }>; isError?: boolean }> {
  const upstreamName = stripToolPrefix(toolName)
  return withUpstreamClient(url, async (client) => {
    const result = await client.callTool({ name: upstreamName, arguments: args })
    return {
      content: (result.content ?? []) as Array<{ type: string; text?: string; [key: string]: unknown }>,
      isError: Boolean(result.isError)
    }
  })
}

export function getUpstreamRequirementHint(): string {
  const custom = process.env.REDIS_MCP_COMMAND?.trim()
  if (custom) {
    return `需已安装并可执行 REDIS_MCP_COMMAND=${custom}（官方 redis/mcp-redis）`
  }
  return '需已安装 uv/uvx（https://docs.astral.sh/uv/），用于运行官方 redis-mcp-server PyPI 包'
}

export function isRedisProxiedTool(name: string): boolean {
  return name.startsWith(REDIS_TOOL_PREFIX) && name !== 'redis_list_connections'
}
