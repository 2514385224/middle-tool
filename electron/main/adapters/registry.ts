import type { AdapterMeta, McpAdapter } from '../../../shared/types'
import { isAdapterOperational, toAdapterMeta } from '../../../shared/types/adapter'
import { lokiAdapter } from './loki'
import { rocketmqAdapter } from './rocketmq'
import { mysqlAdapter } from './mysql'
import { redisAdapter } from './redis'
import { kafkaAdapter } from './kafka'
import { elasticsearchAdapter } from './elasticsearch'
import { mongodbAdapter } from './mongodb'
import { kubernetesAdapter } from './kubernetes'

/**
 * 适配器注册表
 *
 * 新增中间件步骤：
 * 1. 在 adapters/ 下创建 {name}.ts，使用 defineConnectionAdapter / definePlannedAdapter
 * 2. 在 ALL_ADAPTERS 数组中注册
 * 3. 在 packages/mcp-server 中实现对应 MCP tools
 */
const ALL_ADAPTERS: McpAdapter[] = [
  lokiAdapter,
  rocketmqAdapter,
  mysqlAdapter,
  redisAdapter,
  elasticsearchAdapter,
  mongodbAdapter,
  kafkaAdapter,
  kubernetesAdapter
]

const adapterMap = new Map<string, McpAdapter>(
  ALL_ADAPTERS.map((a) => [a.meta.type, a])
)

export function getAdapter(type: string): McpAdapter | undefined {
  return adapterMap.get(type)
}

export function listAdapters(): McpAdapter[] {
  return ALL_ADAPTERS
}

export function listAdapterMeta(): AdapterMeta[] {
  return ALL_ADAPTERS.map(toAdapterMeta)
}

export function listAvailableAdapters(): McpAdapter[] {
  return ALL_ADAPTERS.filter((a) => isAdapterOperational(a.meta))
}

export function listAvailableMeta(): AdapterMeta[] {
  return listAvailableAdapters().map(toAdapterMeta)
}

export function getAdapterMeta(type: string): AdapterMeta | undefined {
  return adapterMap.get(type)?.meta
}

/** 按分类分组 */
export function groupAdaptersByCategory(): Record<string, AdapterMeta[]> {
  const groups: Record<string, AdapterMeta[]> = {}
  for (const meta of listAdapterMeta()) {
    const cat = meta.category
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(meta)
  }
  return groups
}
