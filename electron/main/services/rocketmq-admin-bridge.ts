import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app } from 'electron'

import {
  getAdminBaseUrl,
  getAdminPort,
  healthCheckAdmin,
  jarMissingMessage,
  resolveBundledJar,
  resolveJavaExecutable
} from '../../../shared/rocketmq-bridge'
import type { ConfigStore } from './config-store'

const MAIN_DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const STARTUP_TIMEOUT_MS = 90_000

export class RocketmqAdminBridge {
  private process: ChildProcess | null = null
  private starting: Promise<string> | null = null
  private lastExitCode: number | null = null
  private lastStartupError = ''

  hasEnabledConnections(configStore: ConfigStore): boolean {
    return configStore.listConnections().some((c) => c.type === 'rocketmq' && c.enabled)
  }

  getStatus(): { running: boolean; baseUrl: string; managedBy: 'electron' } {
    return {
      running: this.process != null,
      baseUrl: getAdminBaseUrl(),
      managedBy: 'electron'
    }
  }

  async ensureStarted(): Promise<string> {
    const baseUrl = getAdminBaseUrl()
    if (await healthCheckAdmin(baseUrl, 3_000)) return baseUrl
    if (this.starting) return this.starting

    this.starting = this.startInternal()
    try {
      return await this.starting
    } finally {
      this.starting = null
    }
  }

  private async startInternal(): Promise<string> {
    const baseUrl = getAdminBaseUrl()
    const port = getAdminPort()
    const jarPath = resolveBundledJar({
      isPackaged: app.isPackaged,
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      mainDirname: MAIN_DIRNAME
    })

    if (!jarPath) {
      throw new Error(jarMissingMessage())
    }

    const javaExecutable = resolveJavaExecutable({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath
    })

    this.lastExitCode = null
    this.lastStartupError = ''

    this.process = spawn(javaExecutable, ['-jar', jarPath, `--server.port=${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env }
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) {
        this.lastStartupError = line
        console.error(`[rocketmq-admin] ${line}`)
      }
    })

    this.process.on('exit', (code) => {
      this.lastExitCode = code ?? 1
      console.error(`[rocketmq-admin] 进程退出 code=${code ?? 'null'}`)
      this.process = null
    })

    await this.waitForHealth(baseUrl, STARTUP_TIMEOUT_MS)
    console.error(`[rocketmq-admin] Electron 已托管 MCP 桥接: ${baseUrl}`)
    return baseUrl
  }

  private async waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (this.lastExitCode !== null) {
        const hint = this.lastStartupError.includes('Address already in use')
          ? `端口 ${getAdminPort()} 已被占用，请关闭其他 RocketMQ MCP 实例或设置 ROCKETMQ_MCP_PORT`
          : this.lastStartupError || '请检查 Java 17+ 与 JAR 是否完整'
        throw new Error(`RocketMQ MCP 桥接启动失败 (exit ${this.lastExitCode})：${hint}`)
      }
      if (await healthCheckAdmin(baseUrl, 1_500)) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(
      `RocketMQ MCP 桥接启动超时（${timeoutMs / 1000}s），JAR 首次启动约需 15s，请稍后重试`
    )
  }

  shutdown(): void {
    if (!this.process) return
    this.process.kill()
    this.process = null
    this.lastExitCode = null
  }
}
