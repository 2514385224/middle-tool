import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { app, dialog, type BrowserWindow } from 'electron'

import { getMcpServerDefaultJarPath, isDefaultConfigPath } from '../../../shared/mcp-export'
import { resolveBundledJar } from '../../../shared/rocketmq-bridge'
import type { McpExportMeta, UvxDetectResult } from '../../../shared/types/mcp'
import { ConfigStore } from './config-store'
import { detectUvx } from './uvx-detector'

const MAIN_DIRNAME = path.dirname(fileURLToPath(import.meta.url))

export class McpManager {
  private configStore: ConfigStore

  constructor(configStore: ConfigStore) {
    this.configStore = configStore
  }

  private resolvePackageRoot(packageName: string): string {
    return app.isPackaged
      ? path.join(process.resourcesPath, packageName)
      : path.join(app.getAppPath(), 'packages', packageName)
  }

  private resolveRocketmqJar(mcpServerRoot: string): string {
    const fromBridge = resolveBundledJar({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      packageRoot: mcpServerRoot,
      mainDirname: MAIN_DIRNAME
    })
    if (fromBridge) return fromBridge

    const candidates = [
      getMcpServerDefaultJarPath(mcpServerRoot),
      path.join(this.resolvePackageRoot('rocketmq-mcp-server'), 'runtime', 'rocketmq-mcp.jar')
    ]
    return candidates.find((p) => fs.existsSync(p)) ?? candidates[0]
  }

  private hasEnabledConnection(type: string): boolean {
    return this.configStore.listConnections().some((c) => c.type === type && c.enabled)
  }

  private buildDynamicEnv(mcpServerRoot: string, uvx: UvxDetectResult): Record<string, string> {
    const env: Record<string, string> = {}
    const configPath = this.configStore.getConfigPath()

    if (!isDefaultConfigPath(configPath)) {
      env.MIDDLE_TOOL_CONFIG_PATH = configPath
    }

    if (this.hasEnabledConnection('rocketmq')) {
      const defaultJar = getMcpServerDefaultJarPath(mcpServerRoot)
      const resolvedJar = this.resolveRocketmqJar(mcpServerRoot)
      if (!fs.existsSync(defaultJar) || path.normalize(resolvedJar) !== path.normalize(defaultJar)) {
        env.ROCKETMQ_MCP_JAR_PATH = resolvedJar
      }
    }

    if (this.hasEnabledConnection('redis') && uvx.path) {
      env.REDIS_MCP_COMMAND = uvx.path
    }

    return env
  }

  private buildExportNotes(env: Record<string, string>, uvx: UvxDetectResult): string[] {
    const notes: string[] = []

    if (!this.hasEnabledConnection('rocketmq') && !this.hasEnabledConnection('redis')) {
      notes.push('当前无 RocketMQ / Redis 连接，仅需启动路径即可。')
    }

    if (this.hasEnabledConnection('rocketmq') && !env.ROCKETMQ_MCP_JAR_PATH) {
      notes.push('RocketMQ：JAR 已在默认 runtime 目录，无需额外 env。')
    }

    if (this.hasEnabledConnection('redis')) {
      if (uvx.path) {
        notes.push(
          uvx.inPath
            ? `Redis：已写入 REDIS_MCP_COMMAND=${uvx.path}（确保 Cursor 子进程可找到 uvx）。`
            : `Redis：已写入 REDIS_MCP_COMMAND=${uvx.path}（uvx 不在 PATH）。`
        )
      } else {
        notes.push(`Redis：未检测到 uvx，请先安装。安装命令见下方，安装后点击「重新检测」。`)
      }
    }

    if (!env.MIDDLE_TOOL_CONFIG_PATH) {
      notes.push('连接配置从默认路径 %APPDATA%\\middle-tool\\middle-tool-config.json 读取。')
    }

    return notes
  }

  detectUvx(): UvxDetectResult {
    return detectUvx()
  }

  exportUnifiedMcpConfig(): string {
    const middleToolRoot = this.resolvePackageRoot('mcp-server')
    const uvx = detectUvx()
    const middleToolEntry = path.join(middleToolRoot, 'dist', 'index.js')

    const server: Record<string, unknown> = {
      command: 'node',
      args: [middleToolEntry]
    }

    const env = this.buildDynamicEnv(middleToolRoot, uvx)
    if (Object.keys(env).length > 0) {
      server.env = env
    }

    return JSON.stringify({ mcpServers: { 'middle-tool': server } }, null, 2)
  }

  getExportMeta(): McpExportMeta {
    const middleToolRoot = this.resolvePackageRoot('mcp-server')
    const uvx = detectUvx()
    const env = this.buildDynamicEnv(middleToolRoot, uvx)

    return {
      envKeys: Object.keys(env),
      notes: this.buildExportNotes(env, uvx),
      usesRedis: this.hasEnabledConnection('redis'),
      uvx
    }
  }

  private mergeMcpConfigFile(targetPath: string, exportedJson: string): string {
    const incoming = JSON.parse(exportedJson) as { mcpServers?: Record<string, unknown> }
    if (!fs.existsSync(targetPath)) return exportedJson

    const existing = JSON.parse(fs.readFileSync(targetPath, 'utf-8')) as {
      mcpServers?: Record<string, unknown>
      [key: string]: unknown
    }

    return JSON.stringify(
      {
        ...existing,
        mcpServers: {
          ...(existing.mcpServers ?? {}),
          ...(incoming.mcpServers ?? {})
        }
      },
      null,
      2
    )
  }

  async writeConfigToFile(win: BrowserWindow | null): Promise<
    | { canceled: true }
    | { canceled: false; filePath: string; merged: boolean }
  > {
    const exported = this.exportUnifiedMcpConfig()
    const defaultPath = path.join(homedir(), '.cursor', 'mcp.json')

    const dialogOptions = {
      title: '写入 MCP 配置',
      defaultPath,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)

    if (result.canceled || !result.filePath) {
      return { canceled: true }
    }

    const merged = fs.existsSync(result.filePath)
    const content = merged ? this.mergeMcpConfigFile(result.filePath, exported) : exported
    fs.mkdirSync(path.dirname(result.filePath), { recursive: true })
    fs.writeFileSync(result.filePath, content, 'utf-8')

    return { canceled: false, filePath: result.filePath, merged }
  }
}
