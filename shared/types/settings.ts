/** 应用级设置（持久化于 middle-tool-config.json） */
export interface AppSettings {
  /** 为 true 时允许 MCP 执行写操作；默认 false（只读） */
  mcpWriteEnabled?: boolean
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  mcpWriteEnabled: false
}

export function normalizeAppSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_APP_SETTINGS }
  }
  const record = raw as Record<string, unknown>
  return {
    mcpWriteEnabled: record.mcpWriteEnabled === true
  }
}

export function isMcpWriteEnabled(settings?: AppSettings | null): boolean {
  return normalizeAppSettings(settings).mcpWriteEnabled === true
}
