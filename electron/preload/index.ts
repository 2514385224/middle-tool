import { contextBridge, ipcRenderer } from 'electron'
import type {
  AdapterMeta,
  ConfigImportResult,
  ConnectionTestResult,
  DashboardStatus,
  Environment,
  MiddlewareConnection,
  MiddlewareType,
  McpExportMeta,
  McpToolCallResult,
  McpToolDefinition,
  PackBuildResult,
  PackInfo,
  UvxDetectResult
} from '../../shared/types'

export interface MiddleToolAPI {
  env: {
    list: () => Promise<Environment[]>
    create: (input: Pick<Environment, 'name' | 'description' | 'color'>) => Promise<Environment>
    update: (id: string, input: Partial<Pick<Environment, 'name' | 'description' | 'color'>>) => Promise<Environment | null>
    delete: (id: string) => Promise<boolean>
  }
  conn: {
    list: (environmentId?: string) => Promise<MiddlewareConnection[]>
    create: (input: {
      type: MiddlewareType
      name: string
      config: Record<string, string>
      enabled?: boolean
      environmentId?: string
    }) => Promise<MiddlewareConnection>
    update: (
      id: string,
      input: Partial<Pick<MiddlewareConnection, 'name' | 'enabled' | 'config' | 'environmentId'>>
    ) => Promise<MiddlewareConnection | null>
    delete: (id: string) => Promise<boolean>
    test: (type: MiddlewareType, config: Record<string, string>) => Promise<ConnectionTestResult>
  }
  adapter: {
    list: () => Promise<AdapterMeta[]>
    listAvailable: () => Promise<AdapterMeta[]>
    get: (type: string) => Promise<AdapterMeta | undefined>
    groupByCategory: () => Promise<Record<string, AdapterMeta[]>>
  }
  mcp: {
    exportUnifiedConfig: () => Promise<string>
    getExportMeta: () => Promise<McpExportMeta>
    detectUvx: () => Promise<UvxDetectResult>
    listTools: () => Promise<McpToolDefinition[]>
    callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>
    writeConfigFile: () => Promise<
      | { canceled: true }
      | { canceled: false; filePath: string; merged: boolean }
    >
  }
  config: {
    export: () => Promise<string>
    exportToFile: () => Promise<{ canceled: true } | { canceled: false; filePath: string }>
    importFromFile: (
      mode: 'merge' | 'replace'
    ) => Promise<
      | { canceled: true }
      | ({ canceled: false; filePath: string } & ConfigImportResult)
    >
  }
  system: {
    status: () => Promise<DashboardStatus>
  }
  pack: {
    info: () => Promise<PackInfo>
    buildWin: () => Promise<PackBuildResult>
    openOutputDir: () => Promise<string>
  }
}

const api: MiddleToolAPI = {
  env: {
    list: () => ipcRenderer.invoke('env:list'),
    create: (input) => ipcRenderer.invoke('env:create', input),
    update: (id, input) => ipcRenderer.invoke('env:update', id, input),
    delete: (id) => ipcRenderer.invoke('env:delete', id)
  },
  conn: {
    list: (environmentId) => ipcRenderer.invoke('conn:list', environmentId),
    create: (input) => ipcRenderer.invoke('conn:create', input),
    update: (id, input) => ipcRenderer.invoke('conn:update', id, input),
    delete: (id) => ipcRenderer.invoke('conn:delete', id),
    test: (type, config) => ipcRenderer.invoke('conn:test', type, config)
  },
  adapter: {
    list: () => ipcRenderer.invoke('adapter:list'),
    listAvailable: () => ipcRenderer.invoke('adapter:list-available'),
    get: (type) => ipcRenderer.invoke('adapter:get', type),
    groupByCategory: () => ipcRenderer.invoke('adapter:group-by-category')
  },
  mcp: {
    exportUnifiedConfig: () => ipcRenderer.invoke('mcp:export-unified-config'),
    getExportMeta: () => ipcRenderer.invoke('mcp:export-meta'),
    detectUvx: () => ipcRenderer.invoke('mcp:detect-uvx'),
    listTools: () => ipcRenderer.invoke('mcp:list-tools'),
    callTool: (name, args) => ipcRenderer.invoke('mcp:call-tool', name, args),
    writeConfigFile: () => ipcRenderer.invoke('mcp:write-config-file')
  },
  config: {
    export: () => ipcRenderer.invoke('config:export'),
    exportToFile: () => ipcRenderer.invoke('config:export-to-file'),
    importFromFile: (mode) => ipcRenderer.invoke('config:import-from-file', mode)
  },
  system: {
    status: () => ipcRenderer.invoke('system:status')
  },
  pack: {
    info: () => ipcRenderer.invoke('pack:info'),
    buildWin: () => ipcRenderer.invoke('pack:build-win'),
    openOutputDir: () => ipcRenderer.invoke('pack:open-output-dir')
  }
}

contextBridge.exposeInMainWorld('middleTool', api)

declare global {
  interface Window {
    middleTool: MiddleToolAPI
  }
}
