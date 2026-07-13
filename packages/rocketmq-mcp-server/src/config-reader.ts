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
      `MiddleTool 配置文件不存在: ${filePath}\n请先在 MiddleTool 桌面端添加 RocketMQ 连接，或设置 MIDDLE_TOOL_CONFIG_PATH。`
    )
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AppData
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

export interface RocketmqCredentials {
  nameserverAddressList: string[]
  accessKey: string
  secretKey: string
  clusterName?: string
}

export function parseNamesrvAddr(namesrvAddr: string): string[] {
  return namesrvAddr
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function getRocketmqCredentials(connection: MiddlewareConnection): RocketmqCredentials {
  const namesrvAddr = connection.config.namesrvAddr?.trim()
  if (!namesrvAddr) throw new Error(`连接 ${connection.name} 未配置 NameServer 地址`)

  const nameserverAddressList = parseNamesrvAddr(namesrvAddr)
  if (nameserverAddressList.length === 0) {
    throw new Error(`连接 ${connection.name} 的 NameServer 地址无效`)
  }

  const enableAcl = connection.config.enableAcl === 'yes'
  if (enableAcl) {
    if (!connection.config.accessKey?.trim()) {
      throw new Error(`连接 ${connection.name} 已启用 ACL，但未配置 Access Key`)
    }
    if (!connection.config.secretKey?.trim()) {
      throw new Error(`连接 ${connection.name} 已启用 ACL，但未配置 Secret Key`)
    }
  }

  return {
    nameserverAddressList,
    accessKey: connection.config.accessKey?.trim() ?? '',
    secretKey: connection.config.secretKey?.trim() ?? '',
    clusterName: connection.config.clusterName?.trim() || undefined
  }
}

export interface RocketmqConnectionSummary {
  id: string
  name: string
  environment: string
  environmentId: string
  enabled: boolean
  namesrvAddr: string
  enableAcl: boolean
  clusterName?: string
  /** 供 AI 直接复制的调用示例 */
  usage: string
}

export function listRocketmqConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
): { total: number; default_connection_id: string | null; connections: RocketmqConnectionSummary[] } {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'rocketmq') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const environment = env?.name ?? '未知环境'
      const clusterName = c.config.clusterName?.trim() || undefined
      return {
        id: c.id,
        name: c.name,
        environment,
        environmentId: c.environmentId,
        enabled: c.enabled,
        namesrvAddr: c.config.namesrvAddr ?? '',
        enableAcl: c.config.enableAcl === 'yes',
        clusterName,
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}
