/** 将 RocketMQ JAR 同步到统一 mcp-server/runtime，便于仅配置 args 即可使用 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ROCKETMQ_JAR_DEST, resolveRocketmqJarSource } from './resolve-rocketmq-jar.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const destDir = path.join(root, 'packages', 'mcp-server', 'runtime')
const destJar = path.join(destDir, 'rocketmq-mcp.jar')

const srcJar = resolveRocketmqJarSource()

if (!srcJar) {
  console.warn('[sync-mcp-runtime] 跳过：未找到 rocketmq-mcp.jar，请先运行 npm run rocketmq-mcp:java:stage')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(srcJar, destJar)
console.log(`[sync-mcp-runtime] 已同步 → ${destJar}`)

if (path.normalize(srcJar) !== path.normalize(ROCKETMQ_JAR_DEST) && !fs.existsSync(ROCKETMQ_JAR_DEST)) {
  fs.mkdirSync(path.dirname(ROCKETMQ_JAR_DEST), { recursive: true })
  fs.copyFileSync(srcJar, ROCKETMQ_JAR_DEST)
}
