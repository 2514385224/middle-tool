import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  getAdapter,
  getAdapterMeta,
  groupAdaptersByCategory,
  listAdapterMeta,
  listAvailableMeta
} from './adapters/registry'
import { ConfigStore } from './services/config-store'
import { testConnection } from './services/connection-test'
import { McpManager } from './services/mcp-manager'
import { RocketmqAdminBridge } from './services/rocketmq-admin-bridge'
import { getDashboardStatus } from './services/system-status'
import { callMcpTool, listMcpTools } from './services/mcp-tool-runner'
import {
  buildWindowsInstaller,
  getPackInfo,
  openReleaseDir
} from './services/pack-builder'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
const configStore = new ConfigStore()
const mcpManager = new McpManager(configStore)
const rocketmqAdminBridge = new RocketmqAdminBridge()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'MiddleTool',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function validateConnection(type: string, config: Record<string, string>): void {
  const adapter = getAdapter(type)
  const error = adapter?.validateConnection?.(config)
  if (error) throw new Error(error)
}

function registerIpc(): void {
  ipcMain.handle('env:list', () => configStore.listEnvironments())
  ipcMain.handle('env:create', (_e, input) => configStore.createEnvironment(input))
  ipcMain.handle('env:update', (_e, id, input) => configStore.updateEnvironment(id, input))
  ipcMain.handle('env:delete', (_e, id) => configStore.deleteEnvironment(id))

  ipcMain.handle('conn:list', (_e, environmentId?: string) => configStore.listConnections(environmentId))
  ipcMain.handle('conn:create', async (_e, input) => {
    try {
      validateConnection(input.type, input.config)
      const conn = configStore.createConnection(input)
      if (conn.type === 'rocketmq' && conn.enabled) {
        await ensureRocketmqBridgeIfNeeded()
      }
      return conn
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })
  ipcMain.handle('conn:update', async (_e, id, input) => {
    try {
      if (input.config) {
        const conn = configStore.getConnection(id)
        if (conn) validateConnection(conn.type, input.config)
      }
      const updated = configStore.updateConnection(id, input)
      if (updated?.type === 'rocketmq' && updated.enabled) {
        await ensureRocketmqBridgeIfNeeded()
      }
      return updated
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })
  ipcMain.handle('conn:delete', (_e, id) => configStore.deleteConnection(id))
  ipcMain.handle('conn:test', async (_e, type: string, config: Record<string, string>) => {
    try {
      return await testConnection(type, config, () => rocketmqAdminBridge.ensureStarted())
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })

  ipcMain.handle('adapter:list', () => listAdapterMeta())
  ipcMain.handle('adapter:list-available', () => listAvailableMeta())
  ipcMain.handle('adapter:get', (_e, type: string) => getAdapterMeta(type))
  ipcMain.handle('adapter:group-by-category', () => groupAdaptersByCategory())

  ipcMain.handle('mcp:export-unified-config', () => mcpManager.exportUnifiedMcpConfig())
  ipcMain.handle('mcp:export-meta', () => mcpManager.getExportMeta())
  ipcMain.handle('mcp:detect-uvx', () => mcpManager.detectUvx())
  ipcMain.handle('mcp:write-config-file', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    return mcpManager.writeConfigToFile(win)
  })
  ipcMain.handle('rocketmq:admin-status', () => rocketmqAdminBridge.getStatus())
  ipcMain.handle('system:status', () => getDashboardStatus(configStore, rocketmqAdminBridge))

  ipcMain.handle('mcp:list-tools', async () => {
    try {
      return await listMcpTools()
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : '加载 MCP tools 失败，请先执行 npm run mcp:build'
      )
    }
  })
  ipcMain.handle('mcp:call-tool', async (_e, name: string, args: Record<string, unknown>) => {
    try {
      return await callMcpTool(configStore, rocketmqAdminBridge, name, args)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })

  ipcMain.handle('config:export', () => configStore.exportConfig())
  ipcMain.handle('config:export-to-file', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showSaveDialog(win!, {
      title: '导出 MiddleTool 配置',
      defaultPath: `middle-tool-config-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) {
      return { canceled: true as const }
    }
    writeFileSync(result.filePath, configStore.exportConfig(), 'utf-8')
    return { canceled: false as const, filePath: result.filePath }
  })
  ipcMain.handle('config:import-from-file', async (_e, mode: 'merge' | 'replace') => {
    const win = BrowserWindow.getFocusedWindow() ?? mainWindow
    const result = await dialog.showOpenDialog(win!, {
      title: mode === 'merge' ? '导入配置（合并）' : '导入配置（覆盖）',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true as const }
    }

    const json = readFileSync(result.filePaths[0], 'utf-8')
    try {
      const importResult = configStore.importConfig(json, mode, (type, config) => {
        validateConnection(type, config)
      })
      await ensureRocketmqBridgeIfNeeded()
      return {
        canceled: false as const,
        filePath: result.filePaths[0],
        ...importResult
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
  })

  ipcMain.handle('pack:info', () => getPackInfo())
  ipcMain.handle('pack:build-win', async () => buildWindowsInstaller())
  ipcMain.handle('pack:open-output-dir', async () => openReleaseDir())
}

async function ensureRocketmqBridgeIfNeeded(): Promise<void> {
  if (!rocketmqAdminBridge.hasEnabledConnections(configStore)) return
  try {
    await rocketmqAdminBridge.ensureStarted()
  } catch (err) {
    console.error('[rocketmq-admin] 启动失败:', err)
  }
}

app.whenReady().then(async () => {
  registerIpc()
  createWindow()
  await ensureRocketmqBridgeIfNeeded()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  rocketmqAdminBridge.shutdown()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
