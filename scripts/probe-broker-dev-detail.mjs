#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(process.env.APPDATA ?? '', 'middle-tool', 'middle-tool-config.json')

function pickText(result) {
  return (Array.isArray(result.content) ? result.content : [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args })
  return { ok: !result.isError, text: pickText(result) }
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(root, 'packages/mcp-server/dist/index.js')],
    env: { ...process.env, MIDDLE_TOOL_CONFIG_PATH: configPath }
  })
  const client = new Client({ name: 'probe-detail', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  const topics = await call(client, 'rocketmq_list_topics', {
    environment: 'broker-dev',
    connection_name: 'broker-dev-rocketmq'
  })
  let topicCount = '?'
  try {
    topicCount = String(JSON.parse(topics.text).topicList.length)
  } catch {
    // ignore
  }

  const mysql = await call(client, 'mysql_query', {
    environment: 'broker-dev',
    connection_name: 'broker-dev-mysql',
    sql:
      "SELECT table_schema AS db, COUNT(*) AS tables FROM information_schema.tables WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys') GROUP BY table_schema ORDER BY tables DESC LIMIT 5"
  })

  const loki = await call(client, 'loki_query', {
    environment: 'broker-dev',
    connection_name: 'broker-dev-loki',
    query: '{namespace=~".+"}',
    limit: 2
  })

  console.log(JSON.stringify({ topicCount, mysql: mysql.text.slice(0, 600), loki: loki.text.slice(0, 600) }, null, 2))
  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
