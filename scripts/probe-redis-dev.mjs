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

function pickText(result) {
  const parts = Array.isArray(result.content) ? result.content : []
  return parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n').trim()
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  return {
    ok: !result.isError,
    text: pickText(result),
    hasStructured: result.structuredContent !== undefined
  }
}

async function probeRedis(client, env, name) {
  const base = { environment: env, connection_name: name }
  const info = await callTool(client, 'redis_info', { ...base, section: 'keyspace' })
  const dbsize = await callTool(client, 'redis_dbsize', base)
  const scan = await callTool(client, 'redis_scan_keys', { ...base, pattern: '*', count: 2 })
  let get = { ok: false, text: 'skipped', hasStructured: false }
  try {
    const parsed = JSON.parse(scan.text)
    if (parsed.keys?.[0]) {
      get = await callTool(client, 'redis_get', { ...base, key: parsed.keys[0] })
    }
  } catch {
    get = { ok: false, text: 'scan parse failed', hasStructured: false }
  }
  return { info, dbsize, scan, get }
}

async function main() {
  const entry = path.join(root, 'packages/mcp-server/dist/index.js')
  const transport = new StdioClientTransport({
    command: 'node',
    args: [entry],
    env: { ...process.env, MIDDLE_TOOL_CONFIG_PATH: configPath }
  })

  const client = new Client({ name: 'probe-redis', version: '0.1.0' }, { capabilities: {} })
  await client.connect(transport)

  const targets = [
    ['broker-dev', 'broker-dev-redis'],
    ['cloud-dev', 'cloud-dev-redis'],
    ['b2c-dev', 'b2c-dev-redis']
  ]

  for (const [env, name] of targets) {
    console.log(`\n=== ${name} (${env}) ===`)
    const out = await probeRedis(client, env, name)
    for (const [tool, r] of Object.entries(out)) {
      const status = r.ok ? 'OK' : 'FAIL'
      console.log(`[${status}] ${tool} structured=${r.hasStructured}`)
      console.log(`  ${r.text.slice(0, 220).replace(/\n/g, '\n  ')}`)
    }
  }

  await client.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
