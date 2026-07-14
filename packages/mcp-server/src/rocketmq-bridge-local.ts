import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')
const PROJECT_ROOT = path.resolve(PACKAGE_ROOT, '../..')

export const DEFAULT_ROCKETMQ_ADMIN_PORT = 6868
export const ROCKETMQ_ADMIN_JAR_NAME = 'rocketmq-mcp.jar'

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

export async function healthCheckAdmin(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  const url = new URL(baseUrl)
  const host = url.hostname
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
  return tcpPortOpen(host, port, timeoutMs)
}

export function resolveJavaExecutable(): string {
  const explicit = process.env.ROCKETMQ_JAVA_PATH?.trim()
  if (explicit) return explicit
  return 'java'
}

function collectJarSearchDirs(): string[] {
  const dirs = [
    path.join(PACKAGE_ROOT, 'runtime'),
    path.join(PROJECT_ROOT, 'packages', 'rocketmq-mcp-server', 'runtime')
  ]

  const deployDir = process.env.ROCKETMQ_MCP_DEPLOY_DIR?.trim()
  if (deployDir) dirs.push(deployDir)

  if (process.platform === 'win32') {
    dirs.push('D:/mcp/deploy')
  }

  return dirs
}

export function resolveBundledJar(): string | null {
  const explicit = process.env.ROCKETMQ_MCP_JAR_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

  for (const dir of collectJarSearchDirs()) {
    const jar = findRocketmqJarInDir(dir)
    if (jar) return jar
  }

  return null
}

export function jarMissingMessage(): string {
  return (
    '未找到 RocketMQ MCP 桥接 JAR。\n' +
    '可选方案：\n' +
    '1. 将 JAR 放到 packages/rocketmq-mcp-server/runtime/\n' +
    '2. 设置环境变量 ROCKETMQ_MCP_JAR_PATH 指向 JAR 绝对路径\n' +
    '3. 执行 npm run rocketmq-mcp:java:stage'
  )
}
