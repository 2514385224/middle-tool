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

interface AppDataCacheEntry {
  mtimeMs: number
  data: AppData
}

const appDataCache = new Map<string, AppDataCacheEntry>()

function loadAppDataFromFile(filePath: string): AppData {
  const raw = unwrapConfigRoot(JSON.parse(fs.readFileSync(filePath, 'utf-8')))
  return {
    environments: raw.environments ?? [],
    connections: raw.connections ?? [],
    settings: raw.settings
  }
}

export function invalidateAppDataCache(configPath?: string): void {
  if (configPath) {
    appDataCache.delete(path.resolve(configPath))
    return
  }
  appDataCache.clear()
}

/** 强制从磁盘重新加载配置（HTTP 热 reload 使用） */
export function reloadAppData(configPath?: string): AppData {
  const filePath = path.resolve(configPath ?? getDefaultConfigPath())
  invalidateAppDataCache(filePath)
  return readAppData(configPath)
}

/** 默认配置文件路径（与 electron-store name: middle-tool-config 一致） */
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
  const filePath = path.resolve(configPath ?? getDefaultConfigPath())
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `MiddleTool 配置文件不存在: ${filePath}\n请先在 MiddleTool 桌面端添加中间件连接，或设置 MIDDLE_TOOL_CONFIG_PATH 环境变量。`
    )
  }

  const stat = fs.statSync(filePath)
  const cached = appDataCache.get(filePath)
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.data
  }

  const data = loadAppDataFromFile(filePath)
  appDataCache.set(filePath, { mtimeMs: stat.mtimeMs, data })
  return data
}

export function parseAppDataInput(input: unknown): AppData {
  const raw = unwrapConfigRoot(input)
  return {
    environments: raw.environments ?? [],
    connections: raw.connections ?? [],
    settings: raw.settings
  }
}

/** 原子写入配置文件（扁平 JSON，不含 export 包装） */
export function writeAppData(data: AppData, configPath?: string): string {
  const filePath = path.resolve(configPath ?? getDefaultConfigPath())
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  const payload = {
    environments: data.environments,
    connections: data.connections,
    ...(data.settings !== undefined ? { settings: data.settings } : {})
  }

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  fs.renameSync(tmpPath, filePath)
  invalidateAppDataCache(filePath)
  return filePath
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
      `连接名「${connectionName}」存在多个匹配，请使用 connection_id 区分。\n匹配 ID: ${matches.map((c) => c.id).join(', ')}`
    )
  }

  const connection = matches[0]
  const environment = data.environments.find((e) => e.id === connection.environmentId)!
  return { connection, environment }
}

export interface LokiCredentials {
  url: string
  orgId?: string
  username?: string
  password?: string
  token?: string
}

export function getLokiCredentials(connection: MiddlewareConnection): LokiCredentials {
  const url = connection.config.url?.trim()
  if (!url) throw new Error(`连接 ${connection.name} 未配置 Loki URL`)
  return {
    url,
    orgId: connection.config.orgId,
    username: connection.config.username,
    password: connection.config.password,
    token: connection.config.token
  }
}

// --- MySQL ---

export interface MysqlCredentials {
  host: string
  port: number
  user: string
  password: string
  database?: string
  ssl: boolean
  allowInsert: boolean
  allowUpdate: boolean
  allowDelete: boolean
}

export function getMysqlCredentials(connection: MiddlewareConnection): MysqlCredentials {
  const host = connection.config.host?.trim()
  if (!host) throw new Error(`连接 ${connection.name} 未配置 Host`)

  const user = connection.config.user?.trim()
  if (!user) throw new Error(`连接 ${connection.name} 未配置用户名`)

  const portRaw = connection.config.port?.trim() || '3306'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`连接 ${connection.name} 的 Port 无效: ${portRaw}`)
  }

  return {
    host,
    port,
    user,
    password: connection.config.password ?? '',
    database: connection.config.database?.trim() || undefined,
    ssl: connection.config.ssl === 'yes',
    allowInsert: connection.config.allowInsert === 'yes',
    allowUpdate: connection.config.allowUpdate === 'yes',
    allowDelete: connection.config.allowDelete === 'yes'
  }
}

export function listMysqlConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'mysql') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const creds = getMysqlCredentials(c)
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        host: creds.host,
        port: creds.port,
        database: creds.database,
        readOnly: !(creds.allowInsert || creds.allowUpdate || creds.allowDelete),
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

// --- Redis ---

export interface RedisCredentials {
  host: string
  port: number
  db: number
  username?: string
  password?: string
  ssl: boolean
  sslCaPath?: string
  clusterMode: boolean
}

export function getRedisCredentials(connection: MiddlewareConnection): RedisCredentials {
  const host = connection.config.host?.trim()
  if (!host) throw new Error(`连接 ${connection.name} 未配置 Host`)

  const portRaw = connection.config.port?.trim() || '6379'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`连接 ${connection.name} 的 Port 无效: ${portRaw}`)
  }

  const dbRaw = connection.config.db?.trim() || '0'
  const db = Number(dbRaw)
  if (!Number.isInteger(db) || db < 0) {
    throw new Error(`连接 ${connection.name} 的 DB Index 无效: ${dbRaw}`)
  }

  return {
    host,
    port,
    db,
    username: connection.config.username?.trim() || undefined,
    password: connection.config.password?.trim() || undefined,
    ssl: connection.config.ssl === 'yes',
    sslCaPath: connection.config.sslCaPath?.trim() || undefined,
    clusterMode: connection.config.clusterMode === 'yes'
  }
}

function encodeAuthPart(value: string): string {
  return encodeURIComponent(value)
}

export function buildRedisUrl(creds: RedisCredentials): string {
  const scheme = creds.ssl ? 'rediss' : 'redis'
  let auth = ''

  if (creds.username && creds.password) {
    auth = `${encodeAuthPart(creds.username)}:${encodeAuthPart(creds.password)}@`
  } else if (creds.password) {
    auth = `:${encodeAuthPart(creds.password)}@`
  } else if (creds.username) {
    auth = `${encodeAuthPart(creds.username)}@`
  }

  const base = `${scheme}://${auth}${creds.host}:${creds.port}/${creds.db}`
  const params = new URLSearchParams()

  if (creds.ssl && creds.sslCaPath) {
    params.set('ssl_cert_reqs', 'required')
    params.set('ssl_ca_certs', creds.sslCaPath)
  } else if (creds.ssl) {
    params.set('ssl_cert_reqs', 'none')
  }

  if (creds.clusterMode) {
    params.set('cluster_mode', 'true')
  }

  const query = params.toString()
  return query ? `${base}?${query}` : base
}

/** redis-mcp-server 的 --url 对含特殊字符的密码解析不可靠，改用独立 CLI 参数 */
export function buildRedisSpawnArgs(creds: RedisCredentials): string[] {
  const args = ['--host', creds.host, '--port', String(creds.port), '--db', String(creds.db)]

  if (creds.username) args.push('--username', creds.username)
  if (creds.password) args.push('--password', creds.password)
  if (creds.ssl) args.push('--ssl')
  if (creds.sslCaPath) args.push('--ssl-ca-path', creds.sslCaPath)
  if (creds.clusterMode) args.push('--cluster-mode')

  return args
}

export function listRedisConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'redis') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const creds = getRedisCredentials(c)
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        host: creds.host,
        port: creds.port,
        db: creds.db,
        ssl: creds.ssl,
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

// --- RocketMQ ---

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

export function listRocketmqConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
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
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        namesrvAddr: c.config.namesrvAddr ?? '',
        enableAcl: c.config.enableAcl === 'yes',
        clusterName: c.config.clusterName?.trim() || undefined,
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

// --- Elasticsearch ---

export interface ElasticsearchCredentials {
  url: string
  engine: 'elasticsearch' | 'opensearch'
  username?: string
  password?: string
  apiKey?: string
  verifyCerts: boolean
}

export function getElasticsearchCredentials(connection: MiddlewareConnection): ElasticsearchCredentials {
  const url = connection.config.url?.trim()
  if (!url) throw new Error(`连接 ${connection.name} 未配置集群 URL`)

  const engine = connection.config.engine?.trim() === 'opensearch' ? 'opensearch' : 'elasticsearch'

  return {
    url,
    engine,
    username: connection.config.username?.trim() || undefined,
    password: connection.config.password?.trim() || undefined,
    apiKey: connection.config.apiKey?.trim() || undefined,
    verifyCerts: connection.config.verifyCerts === 'yes'
  }
}

export function listElasticsearchConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'elasticsearch') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const creds = getElasticsearchCredentials(c)
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        url: creds.url,
        engine: creds.engine,
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

// --- MongoDB ---

export interface MongodbCredentials {
  scheme: 'mongodb' | 'mongodb+srv'
  host: string
  port: number
  user?: string
  password?: string
  database?: string
  authSource?: string
  allowInsert: boolean
  allowUpdate: boolean
  allowDelete: boolean
}

export function getMongodbCredentials(connection: MiddlewareConnection): MongodbCredentials {
  const host = connection.config.host?.trim()
  if (!host) throw new Error(`连接 ${connection.name} 未配置 Host`)

  const portRaw = connection.config.port?.trim() || '27017'
  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`连接 ${connection.name} 的 Port 无效: ${portRaw}`)
  }

  const scheme = connection.config.scheme?.trim() === 'mongodb+srv' ? 'mongodb+srv' : 'mongodb'

  return {
    scheme,
    host,
    port,
    user: connection.config.user?.trim() || undefined,
    password: connection.config.password?.trim() || undefined,
    database: connection.config.database?.trim() || undefined,
    authSource: connection.config.authSource?.trim() || 'admin',
    allowInsert: connection.config.allowInsert === 'yes',
    allowUpdate: connection.config.allowUpdate === 'yes',
    allowDelete: connection.config.allowDelete === 'yes'
  }
}

export function listMongodbConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'mongodb') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const creds = getMongodbCredentials(c)
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        host: creds.host,
        port: creds.port,
        database: creds.database,
        readOnly: !(creds.allowInsert || creds.allowUpdate || creds.allowDelete),
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

// --- Kubernetes ---

export interface KubernetesCredentials {
  kubeconfig?: string
  context?: string
  namespace?: string
  inCluster?: boolean
  deniedResources?: string[]
  readOnly?: boolean
  disableDestructive?: boolean
  enabledTools?: string[]
  disabledTools?: string[]
  toolsets?: string[]
  stateless?: boolean
  logLevel?: number
  logFile?: string
  listOutput?: string
  requireOAuth?: boolean
  oauthAudience?: string
  authorizationUrl?: string
  skipJwtVerification?: boolean
}

export function getKubernetesCredentials(connection: MiddlewareConnection): KubernetesCredentials {
  const config = connection.config

  // 解析多行文本为数组
  const parseMultiline = (value?: string): string[] => {
    if (!value) return []
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  }

  // 解析 denied_resources (格式: group/version/kind)
  const deniedResources = parseMultiline(config.denied_resources)

  return {
    kubeconfig: config.kubeconfig?.trim() || undefined,
    context: config.context?.trim() || undefined,
    namespace: config.namespace?.trim() || undefined,
    inCluster: config.inCluster === 'yes',
    deniedResources,
    readOnly: config.read_only === 'yes',
    disableDestructive: config.disable_destructive === 'yes',
    enabledTools: parseMultiline(config.enabled_tools),
    disabledTools: parseMultiline(config.disabled_tools),
    toolsets: parseMultiline(config.toolsets),
    stateless: config.stateless === 'yes',
    logLevel: config.log_level ? parseInt(config.log_level, 10) : undefined,
    logFile: config.log_file?.trim() || undefined,
    listOutput: config.list_output || 'json',
    requireOAuth: config.require_oauth === 'yes',
    oauthAudience: config.oauth_audience?.trim() || undefined,
    authorizationUrl: config.authorization_url?.trim() || undefined,
    skipJwtVerification: config.skip_jwt_verification === 'yes'
  }
}

export function listKubernetesConnectionSummaries(
  data: AppData,
  opts?: { enabledOnly?: boolean; environmentName?: string }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environmentName
    ? data.environments.find((e) => e.name === opts.environmentName)?.id
    : undefined

  if (opts?.environmentName && !envId) {
    throw new Error(`未找到环境: ${opts.environmentName}`)
  }

  const connections = data.connections
    .filter((c) => {
      if (c.type !== 'kubernetes') return false
      if (enabledOnly && !c.enabled) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const creds = getKubernetesCredentials(c)
      return {
        id: c.id,
        name: c.name,
        environment: env?.name ?? '未知环境',
        context: creds.context,
        namespace: creds.namespace,
        inCluster: creds.inCluster,
        usage: `connection_id: "${c.id}"`
      }
    })

  return {
    total: connections.length,
    default_connection_id: connections.length === 1 ? connections[0].id : null,
    connections
  }
}

/** 解析连接参数，单条同类型连接时自动使用 default_connection_id */
export function resolveTypedConnection(
  data: AppData,
  args: Record<string, unknown>,
  type: string,
  listSummaries: (data: AppData) => { default_connection_id: string | null }
): ResolvedConnection {
  let connectionId = args.connection_id as string | undefined
  const connectionName = args.connection_name as string | undefined
  const environmentName = args.environment as string | undefined

  if (!connectionId && !connectionName) {
    const { default_connection_id } = listSummaries(data)
    if (default_connection_id) connectionId = default_connection_id
  }

  return resolveConnection(data, { connectionId, connectionName, environmentName, type })
}
