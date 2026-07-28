import fs from 'node:fs'
import path from 'node:path'

import { getDefaultConfigPath, readAppData, reloadAppData, type AppData } from './config-reader.js'

let watcherStarted = false
let debounceTimer: NodeJS.Timeout | undefined

function isConfigWatchEnabled(): boolean {
  return process.env.MIDDLE_TOOL_CONFIG_WATCH !== '0'
}

function scheduleConfigReload(onReload?: (data: AppData) => void): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    try {
      const filePath = getDefaultConfigPath()
      if (!fs.existsSync(filePath)) {
        console.error(`[middle-tool] 配置热重载跳过：文件不存在 ${filePath}`)
        return
      }
      const data = reloadAppData()
      console.error(
        `[middle-tool] 配置已热重载: ${filePath} · ${data.environments.length} 环境 · ${data.connections.length} 连接`
      )
      onReload?.(data)
    } catch (err) {
      console.error('[middle-tool] 配置热重载失败:', err instanceof Error ? err.message : err)
    }
  }, 300)
}

export function startConfigFileWatcher(onReload?: (data: AppData) => void): void {
  if (!isConfigWatchEnabled() || watcherStarted) return
  watcherStarted = true

  const filePath = path.resolve(getDefaultConfigPath())
  const dir = path.dirname(filePath)
  const fileName = path.basename(filePath)

  try {
    fs.watch(dir, (_event, changedName) => {
      if (changedName && changedName !== fileName) return
      scheduleConfigReload(onReload)
    })
    console.error(`[middle-tool] 配置文件监听已启用: ${filePath}`)
  } catch (err) {
    console.error(
      '[middle-tool] 配置文件监听未启用:',
      err instanceof Error ? err.message : err
    )
  }
}

export function reloadAppDataWithMeta(configPath?: string): {
  data: AppData
  reloadedAt: string
  configPath: string
} {
  const resolved = path.resolve(configPath ?? getDefaultConfigPath())
  const data = reloadAppData(resolved)
  return {
    data,
    reloadedAt: new Date().toISOString(),
    configPath: resolved
  }
}

/** 读取当前配置摘要（不强制 reload，走 mtime 缓存） */
export function summarizeLoadedAppData(configPath?: string) {
  const data = readAppData(configPath)
  return {
    environments: data.environments.length,
    connections: data.connections.length,
    configPath: path.resolve(configPath ?? getDefaultConfigPath())
  }
}
