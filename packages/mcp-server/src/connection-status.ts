import type { AppData, MiddlewareConnection } from './config-reader.js'
import { testConnection } from './connection-test.js'

export interface ConnectionStatusItem {
  id: string
  name: string
  type: string
  environment?: string
  enabled: boolean
  preview?: string
  status: {
    ok: boolean
    message: string
    detail?: string
    latencyMs: number
  }
}

export interface ConnectionStatusReport {
  checkedAt: string
  quick: boolean
  summary: {
    total: number
    ok: number
    failed: number
  }
  connections: ConnectionStatusItem[]
}

function filterConnections(
  data: AppData,
  opts?: {
    enabledOnly?: boolean
    environment?: string
    type?: string
    connectionId?: string
  }
): Array<MiddlewareConnection & { environment?: string; preview?: string }> {
  const enabledOnly = opts?.enabledOnly !== false
  const envId = opts?.environment
    ? data.environments.find((e) => e.name === opts.environment)?.id
    : undefined

  return data.connections
    .filter((c) => {
      if (enabledOnly && !c.enabled) return false
      if (opts?.type && c.type !== opts.type) return false
      if (envId && c.environmentId !== envId) return false
      if (opts?.connectionId && c.id !== opts.connectionId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      return {
        ...c,
        environment: env?.name,
        preview: c.config.url ?? c.config.namesrvAddr ?? c.config.host ?? c.config.database
      }
    })
}

async function probeOne(
  connection: MiddlewareConnection & { environment?: string; preview?: string },
  quick: boolean
): Promise<ConnectionStatusItem> {
  const started = Date.now()
  const status = await testConnection(connection.type, connection.config, { quick })
  return {
    id: connection.id,
    name: connection.name,
    type: connection.type,
    environment: connection.environment,
    enabled: connection.enabled,
    preview: connection.preview,
    status: {
      ...status,
      latencyMs: Date.now() - started
    }
  }
}

export async function probeConnectionStatuses(
  data: AppData,
  opts?: {
    enabledOnly?: boolean
    environment?: string
    type?: string
    quick?: boolean
    connectionId?: string
  }
): Promise<ConnectionStatusReport> {
  const quick = opts?.quick !== false
  const targets = filterConnections(data, opts)
  const connections = await Promise.all(targets.map((connection) => probeOne(connection, quick)))
  const ok = connections.filter((c) => c.status.ok).length

  return {
    checkedAt: new Date().toISOString(),
    quick,
    summary: {
      total: connections.length,
      ok,
      failed: connections.length - ok
    },
    connections
  }
}
