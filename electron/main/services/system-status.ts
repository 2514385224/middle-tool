import { healthCheckAdmin, getAdminBaseUrl } from '../../../shared/rocketmq-bridge'
import type { DashboardStatus, ConnectionTypeStats } from '../../../shared/types/system'
import type { ConfigStore } from './config-store'
import { detectUvx } from './uvx-detector'
import type { RocketmqAdminBridge } from './rocketmq-admin-bridge'

function buildConnectionStats(configStore: ConfigStore): Record<string, ConnectionTypeStats> {
  const stats: Record<string, ConnectionTypeStats> = {}
  for (const conn of configStore.listConnections()) {
    if (!stats[conn.type]) {
      stats[conn.type] = { total: 0, enabled: 0 }
    }
    stats[conn.type].total++
    if (conn.enabled) stats[conn.type].enabled++
  }
  return stats
}

export async function getDashboardStatus(
  configStore: ConfigStore,
  rocketmqBridge: RocketmqAdminBridge
): Promise<DashboardStatus> {
  const baseUrl = getAdminBaseUrl()
  const bridgeStatus = rocketmqBridge.getStatus()
  const healthy = await healthCheckAdmin(baseUrl)

  const connections = configStore.listConnections()
  return {
    configPath: configStore.getConfigPath(),
    rocketmqBridge: {
      running: bridgeStatus.running || healthy,
      healthy,
      baseUrl
    },
    uvx: detectUvx(),
    connectionsByType: buildConnectionStats(configStore),
    connectionTotal: connections.length,
    connectionEnabled: connections.filter((c) => c.enabled).length
  }
}
