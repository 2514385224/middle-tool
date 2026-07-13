import type { AdapterMeta, McpAdapter } from '../../../shared/types'

interface DefineConnectionAdapterOptions {
  meta: AdapterMeta
  validateConnection?: (config: Record<string, string>) => string | null
}

/** 定义可用的中间件连接适配器（统一 MCP Server 读取连接配置） */
export function defineConnectionAdapter(options: DefineConnectionAdapterOptions): McpAdapter {
  return {
    meta: options.meta,
    validateConnection: options.validateConnection
  }
}

/** 占位适配器：仅展示在目录中，不可操作 */
export function definePlannedAdapter(meta: AdapterMeta): McpAdapter {
  return {
    meta: { ...meta, status: 'planned' }
  }
}
