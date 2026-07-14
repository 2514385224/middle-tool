import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { app } from 'electron'

import type { McpToolCallResult, McpToolDefinition } from '../../../shared/types/mcp'
import type { ConfigStore } from './config-store'
import type { RocketmqAdminBridge } from './rocketmq-admin-bridge'

type ToolHandlers = {
  handleToolCall: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>
  formatToolError: (err: unknown, toolName: string) => McpToolCallResult
}

type ToolsModule = {
  staticTools: McpToolDefinition[]
}

type RedisProxyModule = {
  listProxiedTools: () => Promise<McpToolDefinition[]>
}

type ToolPolicyModule = {
  filterToolsByWritePolicy: <T extends { name: string }>(
    tools: T[],
    settings?: Record<string, unknown> | { mcpWriteEnabled?: boolean } | null
  ) => T[]
}

let toolPolicyModule: ToolPolicyModule | null = null
let handlers: ToolHandlers | null = null
let toolsModule: ToolsModule | null = null
let redisProxyModule: RedisProxyModule | null = null

function resolveMcpServerRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'mcp-server')
    : path.join(app.getAppPath(), 'packages', 'mcp-server')
}

async function importMcpModule<T>(relativePath: string): Promise<T> {
  const filePath = path.join(resolveMcpServerRoot(), 'dist', relativePath)
  return (await import(pathToFileURL(filePath).href)) as T
}

async function getToolPolicyModule(): Promise<ToolPolicyModule> {
  if (!toolPolicyModule) {
    toolPolicyModule = await importMcpModule<ToolPolicyModule>('tool-policy.js')
  }
  return toolPolicyModule
}

async function getHandlers(): Promise<ToolHandlers> {
  if (!handlers) {
    handlers = await importMcpModule<ToolHandlers>('call-tool.js')
  }
  return handlers
}

async function getToolsModule(): Promise<ToolsModule> {
  if (!toolsModule) {
    toolsModule = await importMcpModule<ToolsModule>('tools.js')
  }
  return toolsModule
}

async function getRedisProxyModule(): Promise<RedisProxyModule> {
  if (!redisProxyModule) {
    redisProxyModule = await importMcpModule<RedisProxyModule>('redis-proxy.js')
  }
  return redisProxyModule
}

function withConfigPath(configStore: ConfigStore): void {
  process.env.MIDDLE_TOOL_CONFIG_PATH = configStore.getConfigPath()
}

export async function listMcpTools(configStore: ConfigStore): Promise<McpToolDefinition[]> {
  withConfigPath(configStore)
  const { staticTools } = await getToolsModule()
  const { filterToolsByWritePolicy } = await getToolPolicyModule()
  const settings = configStore.getSettings()

  try {
    const { listProxiedTools } = await getRedisProxyModule()
    const redisTools = await Promise.race([
      listProxiedTools(),
      new Promise<McpToolDefinition[]>((_, reject) => {
        setTimeout(() => reject(new Error('Redis tools 探测超时')), 8_000)
      })
    ])
    return filterToolsByWritePolicy([...staticTools, ...redisTools], settings)
  } catch (err) {
    console.error('[mcp-tool-runner] Redis tools 加载失败，仅返回静态 tools:', err)
    return filterToolsByWritePolicy(staticTools, settings)
  }
}

export async function callMcpTool(
  configStore: ConfigStore,
  rocketmqBridge: RocketmqAdminBridge,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolCallResult> {
  withConfigPath(configStore)

  if (name.startsWith('rocketmq_') && name !== 'rocketmq_list_connections') {
    await rocketmqBridge.ensureStarted()
  }

  const { handleToolCall, formatToolError } = await getHandlers()
  try {
    return await handleToolCall(name, args)
  } catch (err) {
    return formatToolError(err, name)
  }
}
