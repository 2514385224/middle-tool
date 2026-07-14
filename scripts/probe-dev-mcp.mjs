#!/usr/bin/env node
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
const ENV = process.env.MCP_PROBE_ENV ?? 'broker-dev'

function pickText(result) {
  const parts = Array.isArray(result.content) ? result.content : []
  return parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim()
}

async function callTool(client, name, args = {}) {
  const started = Date.now()
  try {
    const result = await client.callTool({ name, arguments: args })
    const text = pickText(result)
    return {
      ok: !result.isError,
      ms: Date.now() - started,
      preview: text.slice(0, 400) + (text.length > 400 ? '...' : '')
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      preview: err instanceof Error ? err.message : String(err)
    }
  }
}

async function main() {
  const entry = path.join(root, 'packages/mcp-server/dist/index.js')
  const transport = new StdioClientTransport({
    command: 'node',
    args: [entry],
    env: { ...process.env, MIDDLE_TOOL_CONFIG_PATH: configPath }
  })

  const client = new Client({ name: 'probe-dev-mcp', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  const tools = await client.listTools()
  const probes = [
    ['middle_list_environments', {}],
    ['middle_list_connections', { environment: ENV }],
    ['rocketmq_list_connections', { environment: ENV }],
    ['rocketmq_list_topics', { environment: ENV, connection_name: `${ENV}-rocketmq` }],
    ['mysql_list_connections', { environment: ENV }],
    ['mysql_list_tables', { environment: ENV, connection_name: `${ENV}-mysql` }],
    ['loki_label_names', { environment: ENV, connection_name: `${ENV}-loki` }],
    ['redis_list_connections', { environment: ENV }]
  ]

  console.log(`MCP 探测 · 环境: ${ENV}`)
  console.log(`配置: ${configPath}`)
  console.log(`工具总数: ${tools.tools.length}`)
  console.log('')

  for (const [name, args] of probes) {
    const out = await callTool(client, name, args)
    const status = out.ok ? 'OK' : 'FAIL'
    console.log(`[${status}] ${name} (${out.ms}ms)`)
    console.log(`  ${out.preview.replace(/\n/g, '\n  ')}`)
    console.log('')
  }

  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
