import net from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

import { resolveAppRoot } from './app-paths'

/** 与 rocketmq-mcp JAR 默认端口一致（application.properties: server.port=6868） */
export const DEFAULT_ROCKETMQ_ADMIN_PORT = 6868
export const ROCKETMQ_MCP_SSE_PATH = '/sse'
export const ROCKETMQ_ADMIN_JAR_NAME = 'rocketmq-mcp.jar'

/** 在目录中查找 rocketmq-mcp*.jar（含 rocketmq-mcp-server.jar 等命名） */
export function findRocketmqJarInDir(dir: string): string | null {
  if (!dir?.trim() || !fs.existsSync(dir)) return null

  const fixed = path.join(dir, ROCKETMQ_ADMIN_JAR_NAME)
  if (fs.existsSync(fixed)) return fixed

  const jars = fs
    .readdirSync(dir)
    .filter((f) => /^rocketmq-mcp/i.test(f) && f.endsWith('.jar') && !f.includes('sources'))
    .sort()

  return jars.length ? path.join(dir, jars[0]) : null
}

function collectJarSearchDirs(opts: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  packageRoot?: string
  mainDirname?: string
}): string[] {
  const dirs: string[] = []
  const projectRoot = resolveAppRoot(opts.isPackaged, opts.appPath, opts.mainDirname ?? opts.appPath)

  if (opts.isPackaged) {
    dirs.push(path.join(opts.resourcesPath, 'mcp-server', 'runtime'))
    dirs.push(path.join(opts.resourcesPath, 'rocketmq-mcp-server', 'runtime'))
    dirs.push(path.join(opts.resourcesPath, 'runtime'))
  } else {
    dirs.push(path.join(projectRoot, 'packages', 'rocketmq-mcp-server', 'runtime'))
    dirs.push(path.join(projectRoot, 'packages', 'mcp-server', 'runtime'))
    if (opts.packageRoot) dirs.push(path.join(opts.packageRoot, 'runtime'))
  }

  const deployDir = process.env.ROCKETMQ_MCP_DEPLOY_DIR?.trim()
  if (deployDir) dirs.push(deployDir)

  if (!opts.isPackaged && process.platform === 'win32') {
    dirs.push('D:/mcp/deploy')
  }

  return dirs
}

export function getAdminPort(): number {
  const raw = process.env.ROCKETMQ_MCP_PORT
  if (!raw) return DEFAULT_ROCKETMQ_ADMIN_PORT
  const port = Number(raw)
  return Number.isFinite(port) && port > 0 ? port : DEFAULT_ROCKETMQ_ADMIN_PORT
}

export function getAdminBaseUrl(port = getAdminPort()): string {
  const override = process.env.ROCKETMQ_MCP_ADMIN_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  return `http://127.0.0.1:${port}`
}

export function getRocketmqMcpSseUrl(baseUrl = getAdminBaseUrl()): string {
  return `${baseUrl.replace(/\/$/, '')}${ROCKETMQ_MCP_SSE_PATH}`
}

export function parseBaseUrl(baseUrl: string): { host: string; port: number } {
  const url = new URL(baseUrl)
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  }
}

export function tcpPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, timeoutMs)

    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

/** 检测 RocketMQ MCP 桥接是否监听（新版 JAR 无 /actuator/health） */
export async function healthCheckAdmin(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  const { host, port } = parseBaseUrl(baseUrl)
  return tcpPortOpen(host, port, timeoutMs)
}

export function resolveJavaExecutable(opts?: {
  isPackaged?: boolean
  resourcesPath?: string
}): string {
  const explicit = process.env.ROCKETMQ_JAVA_PATH?.trim()
  if (explicit) return explicit

  if (opts?.isPackaged && opts.resourcesPath) {
    const bundled =
      process.platform === 'win32'
        ? path.join(opts.resourcesPath, 'jre', 'bin', 'java.exe')
        : path.join(opts.resourcesPath, 'jre', 'bin', 'java')
    if (fs.existsSync(bundled)) return bundled
  }

  return 'java'
}

export function resolveBundledJar(opts: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  packageRoot?: string
  mainDirname?: string
}): string | null {
  const explicit = process.env.ROCKETMQ_MCP_JAR_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

  for (const dir of collectJarSearchDirs(opts)) {
    const jar = findRocketmqJarInDir(dir)
    if (jar) return jar
  }

  return null
}

export function jarMissingMessage(): string {
  return (
    '未找到 RocketMQ MCP 桥接 JAR。\n' +
    '可选方案：\n' +
    '1. 将 JAR 放到 packages/rocketmq-mcp-server/runtime/（或 D:/mcp/deploy/）\n' +
    '2. 设置环境变量 ROCKETMQ_MCP_JAR_PATH 指向 JAR 绝对路径\n' +
    '3. 执行 npm run rocketmq-mcp:java:stage'
  )
}

export function buildRocketmqToolArgs(creds: {
  nameserverAddressList: string[]
  accessKey?: string
  secretKey?: string
}): Record<string, unknown> {
  return {
    nameserverAddressList: creds.nameserverAddressList,
    ak: creds.accessKey ?? '',
    sk: creds.secretKey ?? ''
  }
}
