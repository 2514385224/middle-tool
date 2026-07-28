import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

import { app, dialog, type BrowserWindow } from 'electron'

import { buildMcpHttpUrl } from '../../../shared/mcp-export'
import type { AppSettings } from '../../../shared/types/settings'
import { normalizeAppSettings } from '../../../shared/types/settings'
import type { McpExportMeta, UvxDetectResult } from '../../../shared/types/mcp'
import { ConfigStore } from './config-store'
import { detectUvx } from './uvx-detector'

export class McpManager {
  private configStore: ConfigStore

  constructor(configStore: ConfigStore) {
    this.configStore = configStore
  }

  private hasEnabledConnection(type: string): boolean {
    return this.configStore.listConnections().some((c) => c.type === type && c.enabled)
  }

  private buildExportNotes(uvx: UvxDetectResult, settings: AppSettings): string[] {
    const notes: string[] = []
    const url = buildMcpHttpUrl(
      settings.mcpHttpHost ?? '127.0.0.1',
      settings.mcpHttpPort ?? 8080,
      settings.mcpHttpPath ?? '/mcp'
    )

    notes.push(`HTTP MCP：Cursor 仅需 url 指向已启动的 MCP 服务（当前示例 ${url}）。`)
    notes.push('连接配置由服务端 middle-tool-config.json 读取；改连接后 POST /admin/reload 或重启服务。')

    if (settings.mcpHttpApiKey) {
      notes.push('已写入 Authorization Bearer 请求头（与服务端 MIDDLE_TOOL_MCP_API_KEY 对应）。')
    }
    if (this.hasEnabledConnection('redis')) {
      notes.push(
        uvx.installed
          ? 'Redis：uvx 需安装在运行 HTTP MCP 服务的环境（本地或 Linux/Docker），非 Cursor 侧。'
          : 'Redis：运行 MCP 服务的环境需安装 uvx；本机检测未就绪时请先安装。'
      )
    }
    if (this.hasEnabledConnection('rocketmq')) {
      notes.push('RocketMQ：JAR 与 Java 需在运行 HTTP MCP 服务的环境可用。')
    }

    return notes
  }

  private exportHttpMcpConfig(settings: AppSettings): string {
    const url = buildMcpHttpUrl(
      settings.mcpHttpHost ?? '127.0.0.1',
      settings.mcpHttpPort ?? 8080,
      settings.mcpHttpPath ?? '/mcp'
    )

    const server: Record<string, unknown> = { url }

    if (settings.mcpHttpApiKey) {
      server.headers = {
        Authorization: `Bearer ${settings.mcpHttpApiKey}`
      }
    }

    return JSON.stringify({ mcpServers: { 'middle-tool': server } }, null, 2)
  }

  detectUvx(): UvxDetectResult {
    return detectUvx()
  }

  exportUnifiedMcpConfig(): string {
    const settings = normalizeAppSettings(this.configStore.getSettings())
    return this.exportHttpMcpConfig(settings)
  }

  getExportMeta(): McpExportMeta {
    const settings = normalizeAppSettings(this.configStore.getSettings())
    const uvx = detectUvx()
    const httpUrl = buildMcpHttpUrl(
      settings.mcpHttpHost ?? '127.0.0.1',
      settings.mcpHttpPort ?? 8080,
      settings.mcpHttpPath ?? '/mcp'
    )

    return {
      httpUrl,
      notes: this.buildExportNotes(uvx, settings),
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
