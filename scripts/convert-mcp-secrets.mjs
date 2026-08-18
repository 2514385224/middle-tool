/**
 * 将 mcp.workspace.secrets.json + mcp.workspace.json 转为 MiddleTool 配置导入文件。
 *
 * 用法:
 *   node scripts/convert-mcp-secrets.mjs \
 *     --workspace "D:/project/zfnjjs-two/.cursor/skills/shared/mcp-switch/mcp.workspace.json" \
 *     --secrets   "D:/project/zfnjjs-two/.cursor/skills/shared/mcp-switch/mcp.workspace.secrets.json" \
 *     --output    "config/import-from-mcp-secrets.json"
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const PROJECT_LABELS = { broker: '经纪商', cloud: '云商', b2c: 'B2C' }
const PROFILE_LABELS = { dev: 'DEV', sit: 'SIT', pre: 'PRE' }
const PROJECT_COLORS = { broker: '#4a9eff', cloud: '#22c55e', b2c: '#f59e0b' }

function parseArgs() {
  const args = process.argv.slice(2)
  const get = (flag) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args[i + 1] : undefined
  }
  return {
    workspace: get('--workspace'),
    secrets: get('--secrets'),
    output: get('--output') ?? 'config/import-from-mcp-secrets.json'
  }
}

function parseRedisUrl(raw) {
  if (!raw?.trim()) return null
  const url = new URL(raw.trim())
  return {
    host: url.hostname,
    port: url.port || '6379',
    password: decodeURIComponent(url.password),
    db: url.pathname.replace(/^\//, '') || '0'
  }
}

function now() {
  return new Date().toISOString()
}

function buildConnections(envId, envName, baseEnv, secretEnv) {
  const env = { ...baseEnv, ...secretEnv }
  const connections = []
  const ts = now()
  const connName = (type) => `${envName}-${type}`

  const add = (type, config) => {
    connections.push({
      id: randomUUID(),
      environmentId: envId,
      type,
      name: connName(type),
      enabled: true,
      config: Object.fromEntries(
        Object.entries(config).filter(([, v]) => v != null && String(v).trim() !== '')
      ),
      createdAt: ts,
      updatedAt: ts
    })
  }

  if (env.LOKI_URL) {
    add('loki', { url: env.LOKI_URL })
  }

  if (env.MYSQL_HOST) {
    add('mysql', {
      host: env.MYSQL_HOST,
      port: env.MYSQL_PORT ?? '3306',
      user: env.MYSQL_USER ?? 'root',
      password: env.MYSQL_PASS ?? '',
      database: env.MYSQL_DB ?? '',
      ssl: 'no',
      allowInsert: 'no',
      allowUpdate: 'no',
      allowDelete: 'no'
    })
  }

  const redis = parseRedisUrl(env.REDIS_URL)
  if (redis) {
    add('redis', {
      host: redis.host,
      port: redis.port,
      db: redis.db,
      password: redis.password,
      ssl: 'no',
      clusterMode: 'no'
    })
  }

  if (env.ROCKETMQ_NS_ADDR) {
    add('rocketmq', {
      namesrvAddr: env.ROCKETMQ_NS_ADDR,
      enableAcl: 'no'
    })
  }

  if (env.ES_URL) {
    add('elasticsearch', {
      url: env.ES_URL,
      engine: 'elasticsearch',
      verifyCerts: 'no'
    })
  }

  if (connections.length === 0) {
    console.warn(`[warn] ${envName}: 无可用连接（MiddleTool 暂不支持 Nacos / XXL-Job）`)
  }

  return connections
}

function convert(workspacePath, secretsPath) {
  const workspace = JSON.parse(readFileSync(workspacePath, 'utf8'))
  const secrets = JSON.parse(readFileSync(secretsPath, 'utf8'))

  const environments = []
  const connections = []
  const ts = now()

  for (const [projectId, project] of Object.entries(workspace.projects ?? {})) {
    const secretProject = secrets.projects?.[projectId] ?? {}
    for (const [profileId, profile] of Object.entries(project.profiles ?? {})) {
      const envId = randomUUID()
      const projectLabel = PROJECT_LABELS[projectId] ?? projectId
      const envName = `${projectLabel}-${profileId}`
      const label = `${projectLabel} ${PROFILE_LABELS[profileId] ?? profileId}`

      environments.push({
        id: envId,
        name: envName,
        description: `${label}（${profile.label ?? profileId}）`,
        color: PROJECT_COLORS[projectId],
        createdAt: ts,
        updatedAt: ts
      })

      const secretProfile = secretProject.profiles?.[profileId]?.env ?? {}
      connections.push(
        ...buildConnections(envId, envName, profile.env ?? {}, secretProfile)
      )
    }
  }

  return {
    format: 'middle-tool-config',
    version: 1,
    exportedAt: ts,
    data: { environments, connections }
  }
}

const { workspace, secrets, output } = parseArgs()
if (!workspace || !secrets) {
  console.error(
    '用法: node scripts/convert-mcp-secrets.mjs --workspace <mcp.workspace.json> --secrets <mcp.workspace.secrets.json> [--output <path>]'
  )
  process.exit(1)
}

const payload = convert(resolve(workspace), resolve(secrets))
const outPath = resolve(output)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')

console.log(`已生成 ${outPath}`)
console.log(`环境: ${payload.data.environments.length}，连接: ${payload.data.connections.length}`)
