import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface Environment {
  id: string
  name: string
  description?: string
  color?: string
}

export interface MiddlewareConnection {
  id: string
  environmentId: string
  type: string
  name: string
  enabled: boolean
  config: Record<string, string>
}

export interface AppData {
  environments: Environment[]
  connections: MiddlewareConnection[]
  settings?: Record<string, unknown>
}

const APP_DIR_NAME = 'middle-tool'
const STORE_FILE_NAME = 'middle-tool-config.json'
const CONFIG_EXPORT_FORMAT = 'middle-tool-config'
const CONFIG_EXPORT_VERSION = 1

function unwrapConfigRoot(parsed: unknown): AppData {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('配置文件根节点必须是对象')
  }

  const root = parsed as Record<string, unknown>
  let data: unknown = root

  if (root.format === CONFIG_EXPORT_FORMAT) {
    const version = root.version
    if (typeof version === 'number' && version > CONFIG_EXPORT_VERSION) {
      throw new Error(`不支持的配置版本: ${String(version)}`)
    }
    data = root.data
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('无法识别的配置文件格式（需 middle-tool-config 导出或 environments/connections 结构）')
  }

  const app = data as AppData
  if (!Array.isArray(app.environments) || !Array.isArray(app.connections)) {
    throw new Error('配置需包含 environments 与 connections 数组')
  }

  return app
}

export function getDefaultConfigPath(): string {
  const envOverride = process.env.MIDDLE_TOOL_CONFIG_PATH
  if (envOverride) return envOverride

  const home = os.homedir()
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_DIR_NAME, STORE_FILE_NAME)
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', APP_DIR_NAME, STORE_FILE_NAME)
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'),
        APP_DIR_NAME,
        STORE_FILE_NAME
      )
  }
}

export function readAppData(configPath?: string): AppData {
  const filePath = configPath ?? getDefaultConfigPath()
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `MiddleTool 配置文件不存在: ${filePath}\n请先在 MiddleTool 桌面端添加 Kubernetes 连接，或设置 MIDDLE_TOOL_CONFIG_PATH。`
    )
  }
  const raw = unwrapConfigRoot(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  return {
    environments: raw.environments ?? [],
    connections: raw.connections ?? [],
    settings: raw.settings
  }
}

export interface ResolvedConnection {
  connection: MiddlewareConnection
  environment: Environment
}

export function resolveConnection(
  data: AppData,
  opts: {
    connectionId?: string
    connectionName?: string
    environmentName?: string
    type?: string
  }
): ResolvedConnection {
  const { connectionId, connectionName, environmentName, type } = opts

  if (connectionId) {
    const connection = data.connections.find((c) => c.id === connectionId && c.enabled)
    if (!connection) throw new Error(`未找到启用的连接: ${connectionId}`)
    const environment = data.environments.find((e) => e.id === connection.environmentId)
    if (!environment) throw new Error(`连接 ${connectionId} 关联的环境不存在`)
    return { connection, environment }
  }

  if (!connectionName) {
    throw new Error('请提供 connection_id 或 connection_name')
  }

  const envId = environmentName
    ? data.environments.find((e) => e.name === environmentName)?.id
    : undefined

  if (environmentName && !envId) {
    throw new Error(`未找到环境: ${environmentName}`)
  }

  const matches = data.connections.filter((c) => {
    if (!c.enabled) return false
    if (c.name !== connectionName) return false
    if (type && c.type !== type) return false
    if (envId && c.environmentId !== envId) return false
    return true
  })

  if (matches.length === 0) {
    throw new Error(
      `未找到连接「${connectionName}」${environmentName ? `（环境: ${environmentName}）` : ''}${type ? `（类型: ${type}）` : ''}`
    )
  }
  if (matches.length > 1) {
    throw new Error(
      `连接名「${connectionName}」存在多个匹配，请使用 connection_id。\n匹配 ID: ${matches.map((c) => c.id).join(', ')}`
    )
  }

  const connection = matches[0]
  const environment = data.environments.find((e) => e.id === connection.environmentId)!
  return { connection, environment }
}

export interface KubernetesCredentials {
  kubeconfig?: string
  context?: string
  namespace?: string
  inCluster?: boolean
}

export function getKubernetesCredentials(connection: MiddlewareConnection): KubernetesCredentials {
  const kubeconfig = connection.config.kubeconfig?.trim() || undefined
  const context = connection.config.context?.trim() || undefined
  const namespace = connection.config.namespace?.trim() || undefined
  const inCluster = connection.config.inCluster === 'yes'

  return {
    kubeconfig,
    context,
    namespace,
    inCluster
  }
}

export interface KubernetesConnectionSummary {
  id: string
  name: string
  environment: string
  environmentId: string
  enabled: boolean
  context?: string
  namespace?: string
  inCluster: boolean
  usage: string
}

export function listKubernetesConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
): { connections: KubernetesConnectionSummary[]; default_connection_id?: string } {
  const enabledOnly = opts?.enabledOnly !== false
  const environmentName = opts?.environmentName

  const envId = environmentName
    ? data.environments.find((e) => e.name === environmentName)?.id
    : undefined

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'kubernetes') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const environment = data.environments.find((e) => e.id === c.environmentId)
      return {
        id: c.id,
        name: c.name,
        environment: environment?.name || '未知环境',
        environmentId: c.environmentId,
        enabled: c.enabled,
        context: c.config.context,
        namespace: c.config.namespace,
        inCluster: c.config.inCluster === 'yes',
        usage: `context: ${c.config.context || 'default'}, namespace: ${c.config.namespace || 'default'}`
      }
    })

  const default_connection_id = connections.length === 1 ? connections[0].id : undefined

  return { connections, default_connection_id }
}