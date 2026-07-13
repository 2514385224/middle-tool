#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(process.env.APPDATA ?? '', 'middle-tool', 'middle-tool-config.json')

async function withClient(entryRel, fn) {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(root, entryRel)],
    env: { ...process.env, MIDDLE_TOOL_CONFIG_PATH: configPath }
  })
  const client = new Client({ name: 'verify-mcp-deep', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content?.find((c) => c.type === 'text')?.text ?? ''
  const isError = Boolean(result.isError)
  return { isError, text: text.slice(0, 400) }
}

console.log('深度能力验证\n')

const envs = await withClient('packages/mcp-server/dist/index.js', (c) =>
  callTool(c, 'middle_list_environments')
)
console.log('middle_list_environments:', envs.isError ? 'FAIL' : 'OK')
console.log(' ', envs.text.slice(0, 120), '\n')

const loki = await withClient('packages/mcp-server/dist/index.js', (c) =>
  callTool(c, 'loki_label_names', { connection_id: 'f8a960f6-d058-46b9-8ad2-75b400478f9f' })
)
console.log('loki_label_names (dev-loki):', loki.isError ? '预期外失败' : 'OK（Loki 可达）')
if (loki.isError) console.log(' ', loki.text, '\n')
else console.log(' ', loki.text.slice(0, 120), '\n')

const topics = await withClient('packages/rocketmq-mcp-server/dist/index.js', (c) =>
  callTool(c, 'rocketmq_list_topics')
)
console.log('rocketmq_list_topics:', topics.isError ? '失败（需 Admin 桥接 JAR + RocketMQ 集群）' : 'OK')
console.log(' ', topics.text, '\n')
