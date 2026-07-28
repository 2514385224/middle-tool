/** 应用级设置（持久化于 middle-tool-config.json） */
export interface AppSettings {
  /** 为 true 时允许 MCP 执行写操作；默认 false（只读） */
  mcpWriteEnabled?: boolean
  /** HTTP MCP 绑定地址（写入 Cursor url 的主机部分） */
  mcpHttpHost?: string
  /** HTTP MCP 端口 */
  mcpHttpPort?: number
  /** HTTP MCP 路径，默认 /mcp */
  mcpHttpPath?: string
  /** 可选。服务端设置了 MIDDLE_TOOL_MCP_API_KEY 时，写入 Cursor headers */
  mcpHttpApiKey?: string
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  mcpWriteEnabled: false,
  mcpHttpHost: '127.0.0.1',
  mcpHttpPort: 8080,
  mcpHttpPath: '/mcp',
  mcpHttpApiKey: ''
}

function normalizeMcpHttpPort(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return DEFAULT_APP_SETTINGS.mcpHttpPort!
  }
  return value
}

function normalizeMcpHttpPath(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return DEFAULT_APP_SETTINGS.mcpHttpPath!
  return value.startsWith('/') ? value : `/${value}`
}

export function normalizeAppSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_APP_SETTINGS }
  }
  const record = raw as Record<string, unknown>
  return {
    mcpWriteEnabled: record.mcpWriteEnabled === true,
    mcpHttpHost:
      typeof record.mcpHttpHost === 'string' && record.mcpHttpHost.trim()
        ? record.mcpHttpHost.trim()
        : DEFAULT_APP_SETTINGS.mcpHttpHost!,
    mcpHttpPort: normalizeMcpHttpPort(record.mcpHttpPort),
    mcpHttpPath: normalizeMcpHttpPath(record.mcpHttpPath),
    mcpHttpApiKey: typeof record.mcpHttpApiKey === 'string' ? record.mcpHttpApiKey.trim() : ''
  }
}

export function isMcpWriteEnabled(settings?: AppSettings | null): boolean {
  return normalizeAppSettings(settings).mcpWriteEnabled === true
}
