#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(process.env.APPDATA ?? '', 'middle-tool', 'middle-tool-config.json')
const env = 'broker-dev'

function pickText(result) {
  return (Array.isArray(result.content) ? result.content : [])
    .filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) throw new Error(pickText(result))
  return pickText(result)
}

async function section(title, fn) {
  console.log(`\n=== ${title} ===`)
  try {
    console.log(await fn())
  } catch (err) {
    console.log(`[失败] ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(root, 'packages/mcp-server/dist/index.js')],
    env: { ...process.env, MIDDLE_TOOL_CONFIG_PATH: configPath, ROCKETMQ_MCP_PORT: '6868' }
  })
  const client = new Client({ name: 'query-broker-dev', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  const conn = { environment: env }

  await section('MySQL · 库统计', async () => {
    return call(client, 'mysql_query', {
      ...conn,
      connection_name: 'broker-dev-mysql',
      sql: `SELECT table_schema AS db, COUNT(*) AS tables, SUM(TABLE_ROWS) AS approx_rows
            FROM information_schema.tables
            WHERE table_schema NOT IN ('information_schema','mysql','performance_schema','sys')
            GROUP BY table_schema ORDER BY approx_rows DESC LIMIT 8`
    })
  })

  await section('MySQL · agreement 最新 3 条', async () => {
    return call(client, 'mysql_query', {
      ...conn,
      connection_name: 'broker-dev-mysql',
      sql: 'SELECT id, agreement_code, agreement_name, create_time FROM 0607_test.agreement ORDER BY id DESC LIMIT 3'
    })
  })

  await section('RocketMQ · Broker 运行时', async () => {
    return call(client, 'rocketmq_broker_runtime_stats', {
      ...conn,
      connection_name: 'broker-dev-rocketmq',
      broker_addr: '192.168.3.25:10911'
    }).then((t) => t.slice(0, 500))
  })

  await section('RocketMQ · 生产者列表', async () => {
    return call(client, 'rocketmq_producer_list', {
      ...conn,
      connection_name: 'broker-dev-rocketmq'
    }).then((t) => t.slice(0, 500))
  })

  await section('RocketMQ · Topic 概览', async () => {
    const raw = await call(client, 'rocketmq_list_topics', {
      ...conn,
      connection_name: 'broker-dev-rocketmq'
    })
    const { topicList } = JSON.parse(raw)
    const business = topicList.filter(
      (t) => !t.startsWith('%RETRY%') && !t.startsWith('%DLQ%') && !t.startsWith('rmq_sys')
    )
    return `总数 ${topicList.length}，业务 Topic ${business.length} 个\n样例: ${business.slice(0, 8).join(', ')}`
  })

  await section('RocketMQ · 集群列表', async () => {
    return call(client, 'rocketmq_cluster_list', {
      ...conn,
      connection_name: 'broker-dev-rocketmq'
    }).then((t) => t.slice(0, 600))
  })

  await section('Loki · namespace 列表', async () => {
    return call(client, 'loki_label_values', {
      ...conn,
      connection_name: 'broker-dev-loki',
      label: 'namespace'
    })
  })

  await section('Loki · 最近 ERROR 日志', async () => {
    return call(client, 'loki_query', {
      ...conn,
      connection_name: 'broker-dev-loki',
      query: '{namespace=~".+"} |= "ERROR"',
      limit: 2
    }).then((t) => t.slice(0, 600) || '(无匹配)')
  })

  await client.close()
}

main().catch((err) => {
  console.error('查询失败:', err.message ?? err)
  process.exit(1)
})
