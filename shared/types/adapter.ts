/** 中间件分类 */
export type AdapterCategory = 'logging' | 'messaging' | 'database' | 'cache' | 'monitoring' | 'other'

/** 适配器生命周期状态 */
export type AdapterStatus = 'available' | 'planned' | 'deprecated'

/** 中间件类型标识，开放字符串以支持插件扩展 */
export type MiddlewareType = string

/** 连接字段 schema */
export interface ConnectionField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'select'
  required?: boolean
  placeholder?: string
  defaultValue?: string
  options?: { label: string; value: string }[]
  /** 分组显示，如「连接信息」「认证」 */
  group?: string
  /** 映射到 MCP 进程环境变量（可选，Go 类适配器使用） */
  envVar?: string
}

/** 可序列化的适配器元数据（供 UI / IPC 使用） */
export interface AdapterMeta {
  type: MiddlewareType
  name: string
  description: string
  category: AdapterCategory
  status: AdapterStatus
  icon?: string
  docsUrl?: string
  /** MCP 提供的 tools 列表 */
  tools?: string[]
  connectionFields: ConnectionField[]
  /** 连接卡片预览字段 key */
  previewField?: string
}

/** 完整适配器契约（主进程实现） */
export interface McpAdapter {
  meta: AdapterMeta
  validateConnection?(config: Record<string, string>): string | null
}

export const ADAPTER_CATEGORY_LABELS: Record<AdapterCategory, string> = {
  logging: '日志',
  messaging: '消息队列',
  database: '数据库',
  cache: '缓存',
  monitoring: '监控',
  other: '其他'
}

export const ADAPTER_STATUS_LABELS: Record<AdapterStatus, string> = {
  available: '可用',
  planned: '规划中',
  deprecated: '已弃用'
}

/** 从完整适配器提取可序列化元数据 */
export function toAdapterMeta(adapter: McpAdapter): AdapterMeta {
  return adapter.meta
}

/** 判断适配器是否可操作（创建连接、导出 MCP 配置） */
export function isAdapterOperational(meta: AdapterMeta): boolean {
  return meta.status === 'available'
}
