import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')

const DEFAULT_PORT = Number(process.env.ROCKETMQ_MCP_PORT ?? 16868)

let javaProcess: ChildProcess | null = null
let cachedBaseUrl: string | null = null
let starting: Promise<string> | null = null

function getAdminBaseUrl(port = DEFAULT_PORT): string {
  const override = process.env.ROCKETMQ_MCP_ADMIN_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  return `http://127.0.0.1:${port}`
}

function findJarPath(): string | null {
  const explicit = process.env.ROCKETMQ_MCP_JAR_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

  const fixed = path.join(PACKAGE_ROOT, 'runtime', 'rocketmq-mcp.jar')
  if (fs.existsSync(fixed)) return fixed

  const runtimeDir = path.join(PACKAGE_ROOT, 'runtime')
  if (!fs.existsSync(runtimeDir)) return null

  const jars = fs
    .readdirSync(runtimeDir)
    .filter((f) => f.startsWith('rocketmq-mcp') && f.endsWith('.jar') && !f.includes('sources'))
  return jars.length ? path.join(runtimeDir, jars[0]) : null
}

function resolveJavaExecutable(): string {
  return process.env.ROCKETMQ_JAVA_PATH?.trim() || 'java'
}

async function healthCheck(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/actuator/health`, { signal: AbortSignal.timeout(2000) })
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await healthCheck(baseUrl)) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Java Admin 桥接启动超时（${timeoutMs}ms），请检查 Java 环境与 JAR 是否完整`)
}

function spawnJava(jarPath: string, port: number): void {
  if (javaProcess) return

  javaProcess = spawn(resolveJavaExecutable(), ['-jar', jarPath, `--server.port=${port}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })

  javaProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim()
    if (line) console.error(`[rocketmq-java] ${line}`)
  })

  javaProcess.on('exit', (code) => {
    console.error(`[rocketmq-java] 进程退出 code=${code ?? 'null'}`)
    javaProcess = null
    cachedBaseUrl = null
  })
}

function shutdownJava(): void {
  if (!javaProcess) return
  javaProcess.kill()
  javaProcess = null
  cachedBaseUrl = null
}

process.on('exit', shutdownJava)
process.on('SIGINT', () => {
  shutdownJava()
  process.exit(0)
})
process.on('SIGTERM', () => {
  shutdownJava()
  process.exit(0)
})

export async function ensureAdminBridge(): Promise<string> {
  const port = Number(process.env.ROCKETMQ_MCP_PORT ?? DEFAULT_PORT)
  const baseUrl = getAdminBaseUrl(port)

  if (cachedBaseUrl && (await healthCheck(cachedBaseUrl))) return cachedBaseUrl
  if (await healthCheck(baseUrl)) {
    cachedBaseUrl = baseUrl
    return baseUrl
  }

  if (starting) return starting

  starting = (async () => {
    const jarPath = findJarPath()
    if (!jarPath) {
      throw new Error(
        '未找到内置 RocketMQ Admin 桥接 JAR。\n' +
          '请先启动 MiddleTool 桌面端，或在开发环境执行：npm run rocketmq-mcp:java:build'
      )
    }

    spawnJava(jarPath, port)
    await waitForHealth(baseUrl, 60_000)
    cachedBaseUrl = baseUrl
    console.error(`[rocketmq-java] Admin 桥接已就绪: ${baseUrl}`)
    return baseUrl
  })()

  try {
    return await starting
  } finally {
    starting = null
  }
}
