export interface UvxDetectResult {
  installed: boolean
  /** uvx 是否已在 PATH 中（Cursor 子进程可直接调用） */
  inPath: boolean
  path: string | null
  installCommand: string
  docsUrl: string
}

export interface McpExportMeta {
  envKeys: string[]
  notes: string[]
  usesRedis: boolean
  uvx: UvxDetectResult
}

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema?: {
    type?: string
    properties?: Record<string, unknown>
    required?: string[]
  }
}

export interface McpToolCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  isError?: boolean
}
