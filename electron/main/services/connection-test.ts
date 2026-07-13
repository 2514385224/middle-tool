import net from 'node:net'
import tls from 'node:tls'
import https from 'node:https'

import mysql from 'mysql2/promise'
import { MongoClient } from 'mongodb'

import type { ConnectionTestResult } from '../../../shared/types/system'
import { getAdapter } from '../adapters/registry'

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

function readRedisResponse(buffer: Buffer): string {
  const text = buffer.toString('utf-8')
  if (text.startsWith('+')) return text.slice(1).split('\r\n')[0]
  if (text.startsWith('-')) throw new Error(text.slice(1).split('\r\n')[0])
  if (text.startsWith('$')) {
    const line = text.split('\r\n')[0]
    if (line === '$-1') return ''
    return text.split('\r\n')[1] ?? ''
  }
  return text.trim()
}

async function redisPing(config: Record<string, string>): Promise<ConnectionTestResult> {
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
      detail: '请关闭 Cluster 模式后测试单节点，或保存后在 MCP 中验证'
    }
  }

  const useTls = config.ssl === 'yes'
  const username = config.username?.trim()
  const password = config.password?.trim()

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve({ ok: false, message: 'Redis 连接超时（10s）' })
    }, 10_000)

    const onError = (err: Error) => {
      clearTimeout(timeout)
      resolve({ ok: false, message: `Redis 连接失败: ${err.message}` })
    }

    const runPing = (socket: net.Socket | tls.TLSSocket) => {
      let buffer = Buffer.alloc(0)

      const sendNext = () => {
        if (username && password) {
          socket.write(respCommand('AUTH', username, password))
          return
        }
        if (password) {
          socket.write(respCommand('AUTH', password))
          return
        }
        socket.write(respCommand('PING'))
      }

      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk])
        const text = buffer.toString('utf-8')
        if (!text.includes('\r\n')) return

        try {
          const firstLine = text.split('\r\n')[0]
          if (firstLine.startsWith('-')) {
            clearTimeout(timeout)
            socket.destroy()
            resolve({ ok: false, message: `Redis 认证失败: ${firstLine.slice(1)}` })
            return
          }

          if ((username || password) && !text.includes('PING')) {
            buffer = Buffer.alloc(0)
            socket.write(respCommand('PING'))
            return
          }

          const response = readRedisResponse(buffer)
          clearTimeout(timeout)
          socket.end()
          if (response.toUpperCase() === 'PONG') {
            resolve({ ok: true, message: 'Redis PING 成功', detail: `${host}:${port}` })
          } else {
            resolve({ ok: false, message: `Redis 响应异常: ${response || text.trim()}` })
          }
        } catch (err) {
          clearTimeout(timeout)
          socket.destroy()
          resolve({
            ok: false,
            message: err instanceof Error ? err.message : 'Redis 响应解析失败'
          })
        }
      })

      socket.on('error', onError)
      sendNext()
    }

    let socket: net.Socket | tls.TLSSocket
    if (useTls) {
      socket = tls.connect({ host, port, rejectUnauthorized: false }, () => runPing(socket))
    } else {
      socket = net.createConnection({ host, port }, () => runPing(socket))
    }
    socket.on('error', onError)
  })
}

async function testMysql(config: Record<string, string>): Promise<ConnectionTestResult> {
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
    connectTimeout: 10_000,
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

async function testLoki(config: Record<string, string>): Promise<ConnectionTestResult> {
  const base = config.url?.trim().replace(/\/$/, '')
  if (!base) return { ok: false, message: 'Loki URL 不能为空' }

  const headers = buildLokiHeaders(config)
  const endpoints = [`${base}/ready`, `${base}/loki/api/v1/status/buildinfo`]

  let lastError = '未知错误'
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
      if (res.ok) {
        return { ok: true, message: 'Loki 可达', detail: url }
      }
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return { ok: false, message: `Loki 连接失败: ${lastError}` }
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

async function testElasticsearch(config: Record<string, string>): Promise<ConnectionTestResult> {
  const base = config.url?.trim().replace(/\/$/, '')
  if (!base) return { ok: false, message: '集群 URL 不能为空' }

  const headers = buildElasticsearchHeaders(config)
  const verifyCerts = config.verifyCerts === 'yes'
  const endpoints = [`${base}/_cluster/health`, `${base}/`]

  let lastError = '未知错误'
  for (const url of endpoints) {
    try {
      const init: RequestInit & { agent?: https.Agent } = {
        headers,
        signal: AbortSignal.timeout(10_000)
      }
      if (url.startsWith('https://') && !verifyCerts) {
        init.agent = new https.Agent({ rejectUnauthorized: false })
      }

      const res = await fetch(url, init)
      if (res.ok) {
        let detail = url
        try {
          const json = (await res.json()) as { cluster_name?: string; version?: { number?: string } }
          if (json.cluster_name) {
            detail = `${json.cluster_name}${json.version?.number ? ` · v${json.version.number}` : ''}`
          } else if (json.version?.number) {
            detail = `v${json.version.number}`
          }
        } catch {
          // ignore parse errors
        }
        return { ok: true, message: 'Elasticsearch 可达', detail }
      }
      lastError = `HTTP ${res.status}`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  return { ok: false, message: `Elasticsearch 连接失败: ${lastError}` }
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
  const path = database ? `/${encodeURIComponent(database)}` : ''
  const base = `${scheme}://${auth}${host}:${port}${path}`
  const params = new URLSearchParams()
  const authSource = config.authSource?.trim() || 'admin'
  if (user) params.set('authSource', authSource)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

async function testMongodb(config: Record<string, string>): Promise<ConnectionTestResult> {
  const uri = buildMongodbUri(config)
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000
  })

  try {
    await client.connect()
    const ping = await client.db().admin().ping()
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
  ensureBridge: () => Promise<string>
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
    baseUrl = await ensureBridge()
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'RocketMQ Admin 桥接未就绪'
    }
  }

  const res = await fetch(`${baseUrl}/topic/topicList`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      nameserverAddressList,
      ak: accessKey,
      sk: secretKey
    }),
    signal: AbortSignal.timeout(30_000)
  })

  const text = await res.text()
  if (!res.ok) {
    return { ok: false, message: `RocketMQ 请求失败 (${res.status})`, detail: text.slice(0, 200) }
  }

  let topicCount: number | null = null
  try {
    const parsed = JSON.parse(text) as { data?: unknown[]; topicList?: unknown[] }
    const list = parsed.data ?? parsed.topicList
    if (Array.isArray(list)) topicCount = list.length
  } catch {
    // ignore parse errors, connection still ok
  }

  return {
    ok: true,
    message: 'RocketMQ Topic 列表获取成功',
    detail: topicCount != null ? `共 ${topicCount} 个 Topic` : namesrvAddr
  }
}

export async function testConnection(
  type: string,
  config: Record<string, string>,
  ensureRocketmqBridge: () => Promise<string>
): Promise<ConnectionTestResult> {
  const adapter = getAdapter(type)
  const validationError = adapter?.validateConnection?.(config)
  if (validationError) {
    return { ok: false, message: validationError }
  }

  try {
    switch (type) {
      case 'loki':
        return await testLoki(config)
      case 'mysql':
        return await testMysql(config)
      case 'redis':
        return await redisPing(config)
      case 'rocketmq':
        return await testRocketmq(config, ensureRocketmqBridge)
      case 'elasticsearch':
        return await testElasticsearch(config)
      case 'mongodb':
        return await testMongodb(config)
      default:
        if (adapter?.meta.status === 'planned') {
          return { ok: false, message: `${adapter.meta.name} 尚未开放，无法测试连接` }
        }
        return { ok: false, message: `暂不支持 ${type} 的连接测试` }
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '连接测试失败'
    }
  }
}
