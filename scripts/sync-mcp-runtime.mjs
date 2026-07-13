/** 将 RocketMQ JAR 同步到统一 mcp-server/runtime，便于仅配置 args 即可使用 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const srcJar = path.join(root, 'packages', 'rocketmq-mcp-server', 'runtime', 'rocketmq-mcp.jar')
const destDir = path.join(root, 'packages', 'mcp-server', 'runtime')
const destJar = path.join(destDir, 'rocketmq-mcp.jar')

if (!fs.existsSync(srcJar)) {
  console.warn('[sync-mcp-runtime] 跳过：未找到 rocketmq-mcp.jar，请先运行 npm run rocketmq-mcp:java:build')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(srcJar, destJar)
console.log('[sync-mcp-runtime] 已同步 → packages/mcp-server/runtime/rocketmq-mcp.jar')
