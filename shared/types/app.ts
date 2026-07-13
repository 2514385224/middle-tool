import type { MiddlewareType } from './adapter'

/** 环境定义 */
export interface Environment {
  id: string
  name: string
  description?: string
  color?: string
  createdAt: string
  updatedAt: string
}

/** 中间件连接配置 */
export interface MiddlewareConnection {
  id: string
  environmentId: string
  type: MiddlewareType
  name: string
  enabled: boolean
  config: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface AppData {
  environments: Environment[]
  connections: MiddlewareConnection[]
}
