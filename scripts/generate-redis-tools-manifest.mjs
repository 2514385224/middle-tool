#!/usr/bin/env node
/**
 * 生成 Redis 上游 tools manifest，供 tools/list 快速返回（避免 Docker 内 uvx 探测挂起）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outPath = path.join(root, 'packages', 'mcp-server', 'runtime', 'redis-tools-manifest.json')

async function main() {
  const host = process.env.REDIS_MCP_PROBE_HOST?.trim() || '127.0.0.1'
  const port = process.env.REDIS_MCP_PROBE_PORT?.trim() || '6379'
  const db = process.env.REDIS_MCP_PROBE_DB?.trim() || '0'

  const transport = new StdioClientTransport({
    command: process.env.REDIS_MCP_COMMAND?.trim() || 'uvx',
    args: [
      '--from',
      'redis-mcp-server@latest',
      'redis-mcp-server',
      '--host',
      host,
      '--port',
      port,
      '--db',
      db
    ]
  })

  const client = new Client({ name: 'generate-redis-manifest', version: '1' }, { capabilities: {} })
  await client.connect(transport)
  const result = await client.listTools()
  await client.close()

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(result.tools, null, 2), 'utf-8')
  console.log(`[redis-manifest] 已写入 ${result.tools.length} 个工具 → ${outPath}`)
}

main().catch((err) => {
  console.warn(`[redis-manifest] 跳过: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(0)
})
