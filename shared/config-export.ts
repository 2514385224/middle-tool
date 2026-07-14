import type { AppData, Environment, MiddlewareConnection } from './types/app'
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, type AppSettings } from './types/settings'

export const CONFIG_EXPORT_FORMAT = 'middle-tool-config' as const
export const CONFIG_EXPORT_VERSION = 1

export interface ConfigExportPayload {
  format: typeof CONFIG_EXPORT_FORMAT
  version: number
  exportedAt: string
  data: AppData
}

export interface ConfigImportResult {
  mode: 'merge' | 'replace'
  environmentsAdded: number
  environmentsSkipped: number
  connectionsAdded: number
  connectionsSkipped: number
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeEnvironment(raw: unknown, index: number): Environment {
  if (!isRecord(raw) || typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`第 ${index + 1} 个环境缺少有效 name`)
  }

  const now = new Date().toISOString()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `import-env-${index}`,
    name: raw.name.trim(),
    description: typeof raw.description === 'string' ? raw.description : undefined,
    color: typeof raw.color === 'string' ? raw.color : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  }
}

function normalizeConnection(raw: unknown, index: number): MiddlewareConnection {
  if (!isRecord(raw)) {
    throw new Error(`第 ${index + 1} 条连接格式无效`)
  }
  if (typeof raw.type !== 'string' || !raw.type.trim()) {
    throw new Error(`第 ${index + 1} 条连接缺少 type`)
  }
  if (typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`第 ${index + 1} 条连接缺少 name`)
  }
  if (typeof raw.environmentId !== 'string' || !raw.environmentId) {
    throw new Error(`第 ${index + 1} 条连接缺少 environmentId`)
  }
  if (!isRecord(raw.config)) {
    throw new Error(`第 ${index + 1} 条连接缺少 config`)
  }

  const config: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw.config)) {
    if (value != null) config[key] = String(value)
  }

  const now = new Date().toISOString()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `import-conn-${index}`,
    environmentId: raw.environmentId,
    type: raw.type.trim(),
    name: raw.name.trim(),
    enabled: raw.enabled !== false,
    config,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  }
}

export function normalizeAppData(raw: unknown): AppData {
  if (!isRecord(raw)) {
    throw new Error('配置 data 必须是对象')
  }

  const environmentsRaw = raw.environments
  const connectionsRaw = raw.connections

  if (!Array.isArray(environmentsRaw) || !Array.isArray(connectionsRaw)) {
    throw new Error('配置需包含 environments 与 connections 数组')
  }

  return {
    environments: environmentsRaw.map(normalizeEnvironment),
    connections: connectionsRaw.map(normalizeConnection),
    settings: normalizeAppSettings(raw.settings)
  }
}

/** 解析导出文件或 electron-store 原始 JSON */
export function parseConfigImport(json: string): AppData {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('JSON 解析失败，请检查文件格式')
  }

  if (!isRecord(parsed)) {
    throw new Error('配置文件根节点必须是对象')
  }

  if (parsed.format === CONFIG_EXPORT_FORMAT) {
    const version = parsed.version
    if (typeof version !== 'number' || version > CONFIG_EXPORT_VERSION) {
      throw new Error(`不支持的配置版本: ${String(version)}`)
    }
    return normalizeAppData(parsed.data)
  }

  if (Array.isArray(parsed.environments) && Array.isArray(parsed.connections)) {
    return normalizeAppData(parsed)
  }

  throw new Error('无法识别的配置文件格式（需 middle-tool-config 或 environments/connections 结构）')
}

export function buildConfigExportPayload(data: AppData): ConfigExportPayload {
  return {
    format: CONFIG_EXPORT_FORMAT,
    version: CONFIG_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      environments: data.environments,
      connections: data.connections,
      settings: normalizeAppSettings(data.settings ?? DEFAULT_APP_SETTINGS)
    }
  }
}

export function serializeConfigExport(data: AppData): string {
  return JSON.stringify(buildConfigExportPayload(data), null, 2)
}
