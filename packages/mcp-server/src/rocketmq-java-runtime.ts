import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  findRocketmqJarInDir,
  getAdminBaseUrl,
  getAdminPort,
  healthCheckAdmin,
  jarMissingMessage,
  resolveBundledJar,
  resolveJavaExecutable
} from './rocketmq-bridge-local.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = path.resolve(__dirname, '..')

let javaProcess: ChildProcess | null = null
let cachedBaseUrl: string | null = null
let starting: Promise<string> | null = null

function findJarPath(): string | null {
  return resolveBundledJar() ?? findRocketmqJarInDir(path.join(PACKAGE_ROOT, 'runtime'))
}

async function waitForHealth(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await healthCheckAdmin(baseUrl)) return
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
  const port = getAdminPort()
  const baseUrl = getAdminBaseUrl(port)

  if (cachedBaseUrl && (await healthCheckAdmin(cachedBaseUrl))) return cachedBaseUrl
  if (await healthCheckAdmin(baseUrl)) {
    cachedBaseUrl = baseUrl
    return baseUrl
  }

  if (starting) return starting

  starting = (async () => {
    const jarPath = findJarPath()
    if (!jarPath) {
      throw new Error(jarMissingMessage())
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
