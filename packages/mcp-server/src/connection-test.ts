import net from 'node:net'
import tls from 'node:tls'
import https from 'node:https'

import mysql from 'mysql2/promise'
import { MongoClient } from 'mongodb'

import { ensureAdminBridge } from './rocketmq-java-runtime.js'

export interface ConnectionTestResult {
  ok: boolean
  message: string
  detail?: string
}

export interface ConnectionTestOptions {
  quick?: boolean
}

const TIMEOUT_MS = { quick: 8_000, full: 10_000 } as const
const REDIS_TIMEOUT_MS = { quick: 8_000, full: 10_000 } as const
const ROCKETMQ_TIMEOUT_MS = { quick: 8_000, full: 30_000 } as const

let insecureHttpsAgent: https.Agent | undefined

function tcpPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

async function healthCheckAdmin(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const url = new URL(baseUrl)
  const host = url.hostname
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  return tcpPortOpen(host, port, timeoutMs)
}

function resolveTimeout(options: ConnectionTestOptions | undefined, full = TIMEOUT_MS.full): number {
  return options?.quick ? TIMEOUT_MS.quick : full
}

function getInsecureHttpsAgent(): https.Agent {
  if (!insecureHttpsAgent) {
    insecureHttpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })
  }
  return insecureHttpsAgent
}

function buildLokiHeaders(config: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (config.orgId?.trim()) headers['X-Scope-OrgID'] = config.orgId.trim()
  if (config.token?.trim()) {
    headers.Authorization = `Bearer ${config.token.trim()}`
  } else if (config.username?.trim() && config.password?.trim()) {
    headers.Authorization = `Basic ${Buffer.from(`${config.username.trim()}:${config.password.trim()}`).toString('base64')}`
  }
  return headers
}

function respCommand(...args: string[]): string {
  let payload = `*${args.length}\r\n`
  for (const arg of args) {
    const bytes = Buffer.byteLength(arg)
    payload += `$${bytes}\r\n${arg}\r\n`
  }
  return payload
}

function readRedisSimpleLine(buffer: Buffer): { line: string; rest: Buffer } | null {
  const text = buffer.toString('utf-8')
  const end = text.indexOf('\r\n')
  if (end < 0) return null
  return {
    line: text.slice(0, end),
    rest: buffer.subarray(end + 2)
  }
}

async function redisPing(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const host = config.host?.trim()
  if (!host) return { ok: false, message: 'Host 不能为空' }

  const port = Number(config.port?.trim() || '6379')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, message: 'Port 无效' }
  }

  if (config.clusterMode === 'yes') {
    return {
      ok: false,
      message: 'Cluster 模式暂不支持快速探测',
      detail: '请关闭 Cluster 模式后测试单节点'
    }
  }

  const useTls = config.ssl === 'yes'
  const username = config.username?.trim()
  const password = config.password?.trim()
  const timeoutMs = options?.quick ? REDIS_TIMEOUT_MS.quick : REDIS_TIMEOUT_MS.full

  return new Promise((resolve) => {
    let settled = false
    let buffer = Buffer.alloc(0)
    let stage: 'auth' | 'ping' | 'done' = username || password ? 'auth' : 'ping'

    const finish = (result: ConnectionTestResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, message: `Redis 连接超时（${timeoutMs / 1000}s）` })
    }, timeoutMs)

    const onError = (err: Error) => {
      finish({ ok: false, message: `Redis 连接失败: ${err.message}` })
    }

    const sendPing = () => {
      stage = 'ping'
      socket.write(respCommand('PING'))
    }

    const handleLine = (line: string) => {
      if (line.startsWith('-')) {
        finish({ ok: false, message: `Redis 错误: ${line.slice(1)}` })
        return
      }

      if (stage === 'auth') {
        if (line.startsWith('+')) sendPing()
        else finish({ ok: false, message: `Redis 认证响应异常: ${line}` })
        return
      }

      if (stage === 'ping') {
        if (line === '+PONG') {
          finish({ ok: true, message: 'Redis PING 成功', detail: `${host}:${port}` })
        } else {
          finish({ ok: false, message: `Redis 响应异常: ${line}` })
        }
      }
    }

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      while (true) {
        const parsed = readRedisSimpleLine(buffer)
        if (!parsed) break
        buffer = Buffer.from(parsed.rest)
        handleLine(parsed.line)
        if (settled) return
      }
    }

    const onConnect = () => {
      if (stage === 'auth') {
        if (username && password) socket.write(respCommand('AUTH', username, password))
        else if (password) socket.write(respCommand('AUTH', password))
        else sendPing()
        return
      }
      sendPing()
    }

    let socket: net.Socket | tls.TLSSocket
    if (useTls) {
      socket = tls.connect({ host, port, rejectUnauthorized: false }, onConnect)
    } else {
      socket = net.createConnection({ host, port }, onConnect)
    }
    socket.setTimeout(timeoutMs, () => finish({ ok: false, message: `Redis 连接超时（${timeoutMs / 1000}s）` }))
    socket.on('data', onData)
    socket.on('error', onError)
  })
}

async function testMysql(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const host = config.host?.trim() || '127.0.0.1'
  const port = Number(config.port?.trim() || '3306')
  const user = config.user?.trim()
  if (!user) return { ok: false, message: '用户名不能为空' }

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password: config.password ?? '',
    database: config.database?.trim() || undefined,
    connectTimeout: resolveTimeout(options),
    ssl: config.ssl === 'yes' ? { rejectUnauthorized: false } : undefined
  })

  try {
    const [rows] = await connection.query('SELECT 1 AS ok')
    const value = Array.isArray(rows) && rows[0] && typeof rows[0] === 'object' ? (rows[0] as { ok: number }).ok : 1
    return {
      ok: true,
      message: 'MySQL 连接成功',
      detail: `${host}:${port} · SELECT 1 → ${value}`
    }
  } finally {
    await connection.end()
  }
}

async function testLoki(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const base = config.url?.trim().replace(/\/$/, '')
  if (!base) return { ok: false, message: 'Loki URL 不能为空' }

  const headers = buildLokiHeaders(config)
  const timeoutMs = resolveTimeout(options)
  const endpoints = options?.quick
    ? [`${base}/ready`]
    : [`${base}/ready`, `${base}/loki/api/v1/status/buildinfo`]

  const attempts = endpoints.map(async (url) => {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { ok: true as const, message: 'Loki 可达', detail: url }
  })

  try {
    return await Promise.any(attempts)
  } catch (err) {
    const lastError =
      err instanceof AggregateError
        ? err.errors
            .map((e) => (e instanceof Error ? e.message : String(e)))
            .filter(Boolean)
            .join(' · ') || '未知错误'
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, message: `Loki 连接失败: ${lastError}` }
  }
}

function buildElasticsearchHeaders(config: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (config.apiKey?.trim()) {
    const key = config.apiKey.trim()
    headers.Authorization = key.startsWith('ApiKey ') ? key : `ApiKey ${key}`
    return headers
  }

  if (config.username?.trim() && config.password?.trim()) {
    headers.Authorization = `Basic ${Buffer.from(`${config.username.trim()}:${config.password.trim()}`).toString('base64')}`
  }

  return headers
}

async function testElasticsearch(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const base = config.url?.trim().replace(/\/$/, '')
  if (!base) return { ok: false, message: '集群 URL 不能为空' }

  const headers = buildElasticsearchHeaders(config)
  const verifyCerts = config.verifyCerts === 'yes'
  const timeoutMs = resolveTimeout(options)
  const endpoints = options?.quick ? [`${base}/`] : [`${base}/_cluster/health`, `${base}/`]

  const attempts = endpoints.map(async (url) => {
    const init: RequestInit & { agent?: https.Agent } = {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    }
    if (url.startsWith('https://') && !verifyCerts) {
      init.agent = getInsecureHttpsAgent()
    }

    const res = await fetch(url, init)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    let detail = url
    if (!options?.quick) {
      try {
        const json = (await res.json()) as { cluster_name?: string; version?: { number?: string } }
        if (json.cluster_name) {
          detail = `${json.cluster_name}${json.version?.number ? ` · v${json.version.number}` : ''}`
        } else if (json.version?.number) {
          detail = `v${json.version.number}`
        }
      } catch {
        // ignore
      }
    }
    return { ok: true as const, message: 'Elasticsearch 可达', detail }
  })

  try {
    return await Promise.any(attempts)
  } catch (err) {
    const lastError =
      err instanceof AggregateError
        ? err.errors
            .map((e) => (e instanceof Error ? e.message : String(e)))
            .filter(Boolean)
            .join(' · ') || '未知错误'
        : err instanceof Error
          ? err.message
          : String(err)
    return { ok: false, message: `Elasticsearch 连接失败: ${lastError}` }
  }
}

function buildMongodbUri(config: Record<string, string>): string {
  const scheme = config.scheme?.trim() === 'mongodb+srv' ? 'mongodb+srv' : 'mongodb'
  const host = config.host?.trim() ?? ''
  const user = config.user?.trim()
  const password = config.password?.trim()
  const auth =
    user && password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}@` : ''

  if (scheme === 'mongodb+srv') {
    const params = new URLSearchParams()
    const authSource = config.authSource?.trim() || 'admin'
    if (user) params.set('authSource', authSource)
    const query = params.toString()
    return query ? `${scheme}://${auth}${host}/?${query}` : `${scheme}://${auth}${host}`
  }

  const port = config.port?.trim() || '27017'
  const database = config.database?.trim()
  const dbPath = database ? `/${encodeURIComponent(database)}` : ''
  const base = `${scheme}://${auth}${host}:${port}${dbPath}`
  const params = new URLSearchParams()
  const authSource = config.authSource?.trim() || 'admin'
  if (user) params.set('authSource', authSource)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

async function testMongodb(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const uri = buildMongodbUri(config)
  const timeoutMs = resolveTimeout(options)
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: timeoutMs,
    connectTimeoutMS: timeoutMs
  })

  try {
    await client.connect()
    const ping = await client.db().admin().ping()
    if (options?.quick) {
      const host = config.host?.trim() || 'localhost'
      return {
        ok: ping.ok === 1,
        message: 'MongoDB 连接成功',
        detail: host
      }
    }

    const databases = await client.db().admin().listDatabases()
    return {
      ok: ping.ok === 1,
      message: 'MongoDB 连接成功',
      detail: `${databases.databases.length} databases`
    }
  } finally {
    await client.close()
  }
}

async function testRocketmq(
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  const namesrvAddr = config.namesrvAddr?.trim()
  if (!namesrvAddr) return { ok: false, message: 'NameServer 地址不能为空' }

  const nameserverAddressList = namesrvAddr
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const enableAcl = config.enableAcl === 'yes'
  const accessKey = config.accessKey?.trim() ?? ''
  const secretKey = config.secretKey?.trim() ?? ''

  if (enableAcl && (!accessKey || !secretKey)) {
    return { ok: false, message: '启用 ACL 时需填写 Access Key 与 Secret Key' }
  }

  let baseUrl: string
  try {
    baseUrl = await ensureAdminBridge()
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'RocketMQ MCP 桥接未就绪'
    }
  }

  const probeTimeout = options?.quick ? ROCKETMQ_TIMEOUT_MS.quick : ROCKETMQ_TIMEOUT_MS.full

  if (!(await healthCheckAdmin(baseUrl, Math.min(probeTimeout, 5_000)))) {
    return { ok: false, message: 'RocketMQ MCP 桥接未监听', detail: baseUrl }
  }

  const firstNs = nameserverAddressList[0]
  const nsHost = firstNs.includes(':') ? firstNs.split(':')[0].trim() : firstNs
  const nsPort = firstNs.includes(':') ? Number(firstNs.split(':')[1]) || 9876 : 9876

  if (!(await tcpPortOpen(nsHost, nsPort, probeTimeout))) {
    return { ok: false, message: `NameServer 不可达: ${firstNs}` }
  }

  return {
    ok: true,
    message: 'RocketMQ MCP 桥接就绪',
    detail: `${baseUrl} · NS ${firstNs}`
  }
}

export async function testConnection(
  type: string,
  config: Record<string, string>,
  options?: ConnectionTestOptions
): Promise<ConnectionTestResult> {
  try {
    switch (type) {
      case 'loki':
        return await testLoki(config, options)
      case 'mysql':
        return await testMysql(config, options)
      case 'redis':
        return await redisPing(config, options)
      case 'rocketmq':
        return await testRocketmq(config, options)
      case 'elasticsearch':
        return await testElasticsearch(config, options)
      case 'mongodb':
        return await testMongodb(config, options)
      default:
        return { ok: false, message: `暂不支持 ${type} 的连接测试` }
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接测试失败'
    }
  }
}
