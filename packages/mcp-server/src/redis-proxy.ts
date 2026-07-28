import { spawn } from 'node:child_process'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import { buildRedisSpawnArgs, type RedisCredentials } from './config-reader.js'
import { loadBundledRedisTools } from './redis-tools-manifest.js'

export const REDIS_TOOL_PREFIX = 'redis_'
export const CONNECTION_ARG_KEYS = ['connection_id', 'connection_name', 'environment'] as const

const DEFAULT_PROBE_TIMEOUT_MS = 8000
const DEFAULT_WARMUP_TIMEOUT_MS = 20_000

interface PooledClientEntry {
  client: Client
  lastUsed: number
}

const pooledClients = new Map<string, PooledClientEntry>()
const connectingClients = new Map<string, Promise<Client>>()

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

function resolveWarmupSpawnArgs(): { command: string; args: string[] } {
  const customCommand = process.env.REDIS_MCP_COMMAND?.trim()
  const customWarmupArgs = process.env.REDIS_MCP_WARMUP_ARGS?.trim()
  if (customCommand && customWarmupArgs) {
    return { command: customCommand, args: customWarmupArgs.split(/\s+/).filter(Boolean) }
  }

  const command = customCommand || 'uvx'
  return {
    command,
    args: ['--from', 'redis-mcp-server@latest', 'redis-mcp-server', '--help']
  }
}

function credsCacheKey(creds: RedisCredentials): string {
  return [
    creds.host,
    creds.port,
    creds.db,
    creds.password ?? '',
    creds.username ?? '',
    creds.ssl ? '1' : '0',
    creds.clusterMode ? '1' : '0'
  ].join('\0')
}

async function connectUpstreamClient(creds: RedisCredentials): Promise<Client> {
  const { command, args } = resolveSpawnArgs(creds)
  const transport = new StdioClientTransport({ command, args })
  const client = new Client({ name: 'middle-tool-redis-proxy', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  return client
}

export function invalidatePooledClient(creds: RedisCredentials): void {
  const key = credsCacheKey(creds)
  const entry = pooledClients.get(key)
  if (!entry) return
  pooledClients.delete(key)
  void entry.client.close().catch(() => {})
}

async function getPooledClient(creds: RedisCredentials): Promise<Client> {
  const key = credsCacheKey(creds)
  const existing = pooledClients.get(key)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.client
  }

  let pending = connectingClients.get(key)
  if (!pending) {
    pending = connectUpstreamClient(creds)
      .then((client) => {
        pooledClients.set(key, { client, lastUsed: Date.now() })
        return client
      })
      .finally(() => {
        connectingClients.delete(key)
      })
    connectingClients.set(key, pending)
  }

  return pending
}

async function withPooledClient<T>(creds: RedisCredentials, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await getPooledClient(creds)
  return fn(client)
}

async function withOneShotClient<T>(creds: RedisCredentials, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = await connectUpstreamClient(creds)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => {})
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
    withOneShotClient(probeCreds, async (client) => {
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

  await warmupRedisUpstream()
}

function runWarmupCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true })
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Redis uvx 预热超时（${timeoutMs}ms）`))
    }, timeoutMs)

    child.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })

    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0 || code === null) {
        resolve()
        return
      }
      reject(new Error(`Redis uvx 预热退出码 ${code}`))
    })
  })
}

/** 启动时预拉 redis-mcp-server 包，避免首次 tools/call 冷启动过慢 */
export async function warmupRedisUpstream(): Promise<void> {
  if (process.env.REDIS_MCP_WARMUP === '0') return

  const timeoutRaw = process.env.REDIS_MCP_WARMUP_TIMEOUT_MS?.trim()
  const timeoutMs = timeoutRaw && Number.isFinite(Number(timeoutRaw)) ? Number(timeoutRaw) : DEFAULT_WARMUP_TIMEOUT_MS
  const { command, args } = resolveWarmupSpawnArgs()

  try {
    await runWarmupCommand(command, args, timeoutMs)
    console.error('[middle-tool] Redis uvx 预热完成')
  } catch (err) {
    console.error(
      `[middle-tool] Redis uvx 预热失败（不影响启动）: ${err instanceof Error ? err.message : String(err)}`
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

  const invoke = async () =>
    withPooledClient(creds, async (client) => {
      const result = await client.callTool({ name: upstreamName, arguments: args })
      return normalizeUpstreamToolResult(result)
    })

  try {
    return await invoke()
  } catch (firstErr) {
    invalidatePooledClient(creds)
    try {
      return await invoke()
    } catch {
      throw firstErr
    }
  }
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
