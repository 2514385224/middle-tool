import type { UvxDetectResult } from './mcp'

export interface ConnectionTestResult {
  ok: boolean
  message: string
  detail?: string
}

/** 目录页批量校验时使用 quick，缩短超时并跳过重型探测 */
export interface ConnectionTestOptions {
  quick?: boolean
}

export interface ConnectionTypeStats {
  total: number
  enabled: number
}

export interface RocketmqBridgeStatus {
  running: boolean
  healthy: boolean
  baseUrl: string
}

export interface DashboardStatus {
  configPath: string
  rocketmqBridge: RocketmqBridgeStatus
  uvx: UvxDetectResult
  connectionsByType: Record<string, ConnectionTypeStats>
  connectionTotal: number
  connectionEnabled: number
}
