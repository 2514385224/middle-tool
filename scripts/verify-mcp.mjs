#!/usr/bin/env node
/**
 * 验证 MiddleTool 统一 MCP：配置读取、工具列表、各中间件 list_connections
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = process.env.MIDDLE_TOOL_CONFIG_PATH ?? path.join(
  process.env.APPDATA ?? '',
  'middle-tool',
  'middle-tool-config.json'
)

const REQUIRED_LIST_TOOLS = [
  'middle_list_connections',
  'loki_query',
  'mysql_list_connections',
  'redis_list_connections',
  'rocketmq_list_connections',
  'elasticsearch_list_connections',
  'mongodb_list_connections'
]

async function probeMiddleTool() {
  const entry = path.join(root, 'packages/mcp-server/dist/index.js')
  const transport = new StdioClientTransport({
    command: 'node',
    args: [entry],
    env: {
      ...process.env,
      MIDDLE_TOOL_CONFIG_PATH: configPath
    }
  })

  const client = new Client({ name: 'verify-mcp', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  const tools = await client.listTools()
  const toolNames = tools.tools.map((t) => t.name)

  const missing = REQUIRED_LIST_TOOLS.filter((name) => !toolNames.includes(name))
  if (missing.length > 0) {
    throw new Error(`缺少工具: ${missing.join(', ')}`)
  }

  const listResult = await client.callTool({
    name: 'middle_list_connections',
    arguments: {}
  })
  await client.close()

  const text = listResult.content?.find((c) => c.type === 'text')?.text ?? JSON.stringify(listResult)
  return {
    toolCount: tools.tools.length,
    toolNames,
    listResult: text
  }
}

console.log('MiddleTool MCP 验证')
console.log('配置文件:', configPath)
console.log('')

process.stdout.write('▶ middle-tool ... ')
try {
  const out = await probeMiddleTool()
  console.log('OK')
  console.log(`  工具数: ${out.toolCount}`)
  console.log(`  必需工具: ${REQUIRED_LIST_TOOLS.join(', ')}`)
  console.log(`  连接列表: ${out.listResult.slice(0, 200)}${out.listResult.length > 200 ? '...' : ''}`)
} catch (err) {
  console.log('FAIL')
  console.log(`  ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}

console.log('')
console.log('统一 MCP Server 验证通过')
