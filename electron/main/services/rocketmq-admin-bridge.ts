import { spawn, type ChildProcess } from 'node:child_process'

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

export class RocketmqAdminBridge {
  private process: ChildProcess | null = null
  private starting: Promise<string> | null = null

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
    if (await healthCheckAdmin(baseUrl)) return baseUrl
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
      resourcesPath: process.resourcesPath
    })

    if (!jarPath) {
      throw new Error(jarMissingMessage())
    }

    const javaExecutable = resolveJavaExecutable({
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath
    })

    this.process = spawn(javaExecutable, ['-jar', jarPath, `--server.port=${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...process.env }
    })

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) console.error(`[rocketmq-admin] ${line}`)
    })

    this.process.on('exit', (code) => {
      console.error(`[rocketmq-admin] 进程退出 code=${code ?? 'null'}`)
      this.process = null
    })

    await this.waitForHealth(baseUrl, 60_000)
    console.error(`[rocketmq-admin] Electron 已托管 Admin 桥接: ${baseUrl}`)
    return baseUrl
  }

  private async waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await healthCheckAdmin(baseUrl)) return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`RocketMQ Admin 桥接启动超时（${timeoutMs}ms）`)
  }

  shutdown(): void {
    if (!this.process) return
    this.process.kill()
    this.process = null
  }
}
