import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_ROCKETMQ_ADMIN_PORT = 16868
export const ROCKETMQ_ADMIN_JAR_NAME = 'rocketmq-mcp.jar'

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

export async function healthCheckAdmin(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/actuator/health`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
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
}): string | null {
  const explicit = process.env.ROCKETMQ_MCP_JAR_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

  const candidates: string[] = []

  if (opts.isPackaged) {
    candidates.push(path.join(opts.resourcesPath, 'rocketmq-mcp-server', 'runtime', ROCKETMQ_ADMIN_JAR_NAME))
    candidates.push(path.join(opts.resourcesPath, 'runtime', ROCKETMQ_ADMIN_JAR_NAME))
  } else {
    candidates.push(path.join(opts.appPath, 'packages', 'rocketmq-mcp-server', 'runtime', ROCKETMQ_ADMIN_JAR_NAME))
    if (opts.packageRoot) {
      candidates.push(path.join(opts.packageRoot, 'runtime', ROCKETMQ_ADMIN_JAR_NAME))
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return null
}

export function jarMissingMessage(): string {
  return (
    '未找到内置 RocketMQ Admin 桥接 JAR。\n' +
    '开发环境请在项目根目录执行：npm run rocketmq-mcp:java:build\n' +
    '（需要 Java 17+ 与 Maven；发布安装包会预置 JAR）'
  )
}
