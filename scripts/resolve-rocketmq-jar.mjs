/**
 * 解析 RocketMQ Admin JAR 路径（开发 / 打包共用）
 * 优先级：ROCKETMQ_MCP_JAR_PATH > runtime/rocketmq-mcp.jar > runtime/rocketmq-mcp*.jar > deploy 目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const projectRoot = path.resolve(__dirname, '..')

export const ROCKETMQ_RUNTIME_DIR = path.join(projectRoot, 'packages', 'rocketmq-mcp-server', 'runtime')
export const ROCKETMQ_JAR_DEST = path.join(ROCKETMQ_RUNTIME_DIR, 'rocketmq-mcp.jar')

function findJarInDir(dir) {
  if (!dir || !fs.existsSync(dir)) return null

  const fixed = path.join(dir, 'rocketmq-mcp.jar')
  if (fs.existsSync(fixed)) return fixed

  const jars = fs
    .readdirSync(dir)
    .filter((f) => /^rocketmq-mcp/i.test(f) && f.endsWith('.jar') && !f.includes('sources'))
    .sort()

  return jars.length ? path.join(dir, jars[0]) : null
}

export function resolveRocketmqJarSource() {
  const explicit = process.env.ROCKETMQ_MCP_JAR_PATH?.trim()
  if (explicit && fs.existsSync(explicit)) return explicit

  const fromRuntime = findJarInDir(ROCKETMQ_RUNTIME_DIR)
  if (fromRuntime) return fromRuntime

  const deployDir = process.env.ROCKETMQ_MCP_DEPLOY_DIR?.trim()
  if (deployDir) {
    const fromDeploy = findJarInDir(deployDir)
    if (fromDeploy) return fromDeploy
  }

  if (process.platform === 'win32') {
    const fromDefaultDeploy = findJarInDir('D:/mcp/deploy')
    if (fromDefaultDeploy) return fromDefaultDeploy
  }

  return null
}

export function stageRocketmqJar({ required = false } = {}) {
  const source = resolveRocketmqJarSource()
  if (!source) {
    const message =
      '未找到 RocketMQ Admin JAR。请执行 npm run rocketmq-mcp:java:build，' +
      '或将 JAR 放到 packages/rocketmq-mcp-server/runtime/，或设置 ROCKETMQ_MCP_JAR_PATH'
    if (required) throw new Error(message)
    console.warn(`[rocketmq-jar] 跳过：${message}`)
    return null
  }

  if (path.normalize(source) === path.normalize(ROCKETMQ_JAR_DEST)) {
    console.log(`[rocketmq-jar] 已就绪: ${ROCKETMQ_JAR_DEST}`)
    return ROCKETMQ_JAR_DEST
  }

  fs.mkdirSync(ROCKETMQ_RUNTIME_DIR, { recursive: true })
  fs.copyFileSync(source, ROCKETMQ_JAR_DEST)
  console.log(`[rocketmq-jar] 已 staging: ${source} → ${ROCKETMQ_JAR_DEST}`)
  return ROCKETMQ_JAR_DEST
}
