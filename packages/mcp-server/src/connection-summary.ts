import type { AppData } from './config-reader.js'

export function summarizeConnections(
  data: AppData,
  opts?: {
    enabledOnly?: boolean
    environment?: string
    type?: string
  }
) {
  const enabledOnly = opts?.enabledOnly !== false
  const envFilter = opts?.environment
  const typeFilter = opts?.type
  const envId = envFilter ? data.environments.find((e) => e.name === envFilter)?.id : undefined

  const environments = data.environments.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description
  }))

  const connections = data.connections
    .filter((c) => {
      if (enabledOnly && !c.enabled) return false
      if (typeFilter && c.type !== typeFilter) return false
      if (envId && c.environmentId !== envId) return false
      return true
    })
    .map((c) => {
      const env = data.environments.find((e) => e.id === c.environmentId)
      const base = {
        id: c.id,
        name: c.name,
        type: c.type,
        environment: env?.name,
        enabled: c.enabled,
        preview: c.config.url ?? c.config.namesrvAddr ?? c.config.host ?? c.config.database
      }
      if (c.type === 'rocketmq') {
        return {
          ...base,
          namesrvAddr: c.config.namesrvAddr,
          enableAcl: c.config.enableAcl === 'yes',
          clusterName: c.config.clusterName?.trim() || undefined
        }
      }
      return base
    })

  return {
    environments,
    connections,
    total: connections.length
  }
}
