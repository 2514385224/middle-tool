import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import { buildRedisSpawnArgs, type RedisCredentials } from './config-reader.js'
import { loadBundledRedisTools } from './redis-tools-manifest.js'

export const REDIS_TOOL_PREFIX = 'redis_'
export const CONNECTION_ARG_KEYS = ['connection_id', 'connection_name', 'environment'] as const

const DEFAULT_PROBE_TIMEOUT_MS = 8000

function getProbeTimeoutMs(): number {
  const raw = process.env.REDIS_MCP_PROBE_TIMEOUT_MS?.trim()
  if (!raw) return DEFAULT_PROBE_TIMEOUT_MS
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PROBE_TIMEOUT_MS
}

function shouldProbeUpstreamLive(): boolean {
  return process.env.REDIS_MCP_PROBE_LIVE === '1'
}

let cachedUpstreamTools: Tool[] | null = null

type RedisToolResult = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  structuredContent?: unknown
  isError?: boolean
}

function resolveSpawnArgs(creds: RedisCredentials): { command: string; args: string[] } {
  const redisArgs = buildRedisSpawnArgs(creds)
  const customCommand = process.env.REDIS_MCP_COMMAND?.trim()
  const customArgs = process.env.REDIS_MCP_ARGS?.trim()

  if (customCommand && customArgs) {
    return { command: customCommand, args: [...customArgs.split(/\s+/), ...redisArgs] }
  }

  if (customCommand) {
    return {
      command: customCommand,
      args: ['--from', 'redis-mcp-server@latest', 'redis-mcp-server', ...redisArgs]
    }
  }

  return {
    command: 'uvx',
    args: ['--from', 'redis-mcp-server@latest', 'redis-mcp-server', ...redisArgs]
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

async function withUpstreamClient<T>(creds: RedisCredentials, fn: (client: Client) => Promise<T>): Promise<T> {
  const { command, args } = resolveSpawnArgs(creds)
  const transport = new StdioClientTransport({ command, args })
  const client = new Client({ name: 'middle-tool-redis-proxy', version: '0.1.0' }, { capabilities: {} })

  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 超时（${timeoutMs}ms）`)), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function probeUpstreamToolsLive(): Promise<Tool[]> {
  const probeCreds: RedisCredentials = {
    host: process.env.REDIS_MCP_PROBE_HOST?.trim() || '127.0.0.1',
    port: Number(process.env.REDIS_MCP_PROBE_PORT?.trim() || '6379'),
    db: Number(process.env.REDIS_MCP_PROBE_DB?.trim() || '0'),
    ssl: false,
    clusterMode: false
  }

  return withTimeout(
    withUpstreamClient(probeCreds, async (client) => {
      const result = await client.listTools()
      return result.tools
    }),
    getProbeTimeoutMs(),
    'Redis 上游 tools/list'
  )
}

function normalizeUpstreamToolResult(result: Awaited<ReturnType<Client['callTool']>>): RedisToolResult {
  const content = (Array.isArray(result.content) ? result.content : []) as Array<{
    type: string
    text?: string
    [key: string]: unknown
  }>
  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  const text = content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()

  const normalized: RedisToolResult = {
    content:
      text.length > 0
        ? content
        : [{ type: 'text', text: JSON.stringify(structuredContent ?? result, null, 2) }],
    isError: Boolean(result.isError)
  }

  if (structuredContent !== undefined) {
    normalized.structuredContent = structuredContent
  }

  return normalized
}

export async function fetchUpstreamTools(): Promise<Tool[]> {
  if (cachedUpstreamTools) return cachedUpstreamTools

  const bundled = loadBundledRedisTools()
  if (bundled && !shouldProbeUpstreamLive()) {
    cachedUpstreamTools = bundled
    return bundled
  }

  try {
    const tools = bundled ?? (await probeUpstreamToolsLive())
    cachedUpstreamTools = tools
    return tools
  } catch (err) {
    if (bundled) {
      console.error(
        `[middle-tool] Redis 上游探测失败，使用内置 manifest: ${err instanceof Error ? err.message : String(err)}`
      )
      cachedUpstreamTools = bundled
      return bundled
    }
    throw err
  }
}

export async function preloadRedisTools(): Promise<void> {
  try {
    const tools = await fetchUpstreamTools()
    console.error(`[middle-tool] Redis 工具清单就绪: ${tools.length} 个`)
  } catch (err) {
    console.error(
      `[middle-tool] Redis 工具清单预热失败: ${err instanceof Error ? err.message : String(err)}`
    )
    console.error(`[middle-tool] ${getUpstreamRequirementHint()}`)
  }
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
  creds: RedisCredentials,
  toolName: string,
  args: Record<string, unknown>
): Promise<RedisToolResult> {
  const upstreamName = stripToolPrefix(toolName)
  return withUpstreamClient(creds, async (client) => {
    const result = await client.callTool({ name: upstreamName, arguments: args })
    return normalizeUpstreamToolResult(result)
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
