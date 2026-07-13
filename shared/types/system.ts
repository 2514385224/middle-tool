import type { UvxDetectResult } from './mcp'

export interface ConnectionTestResult {
  ok: boolean
  message: string
  detail?: string
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
