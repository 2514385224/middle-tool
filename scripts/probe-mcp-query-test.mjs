const base = process.argv[2] || 'http://192.168.4.94:31008/mcp'

async function post(body, sessionId) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json'
  }
  if (sessionId) headers['mcp-session-id'] = sessionId

  const res = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  })

  const session = res.headers.get('mcp-session-id')
  const text = await res.text()
  return { status: res.status, session: session ?? sessionId, text }
}

function parseSseJson(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6))
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 800) }
  }
}

async function initSession() {
  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'query-test', version: '1.0' }
    }
  })
  const parsed = parseSseJson(init.text)
  if (!init.session) throw new Error('initialize 未返回 session')
  await post(
    {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {}
    },
    init.session
  )
  return init.session
}

async function callTool(sessionId, name, args, id) {
  const res = await post(
    {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    },
    sessionId
  )
  const parsed = parseSseJson(res.text)
  const text = parsed.result?.content
    ?.filter((p) => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
  return {
    ok: !parsed.result?.isError && !parsed.error,
    text: text ?? JSON.stringify(parsed, null, 2).slice(0, 1200),
    error: parsed.error
  }
}

async function main() {
  console.log('MCP:', base)
  const session = await initSession()
  console.log('session ok\n')

  const tests = [
    {
      label: 'middle_list_connections (broker-dev)',
      name: 'middle_list_connections',
      args: { environment: 'broker-dev' }
    },
    {
      label: 'mysql_query SELECT 1 (broker-dev)',
      name: 'mysql_query',
      args: {
        environment: 'broker-dev',
        connection_name: 'broker-dev-mysql',
        sql: 'SELECT 1 AS ok, DATABASE() AS db, NOW() AS ts'
      }
    },
    {
      label: 'mysql_list_tables (broker-dev)',
      name: 'mysql_list_tables',
      args: {
        environment: 'broker-dev',
        connection_name: 'broker-dev-mysql'
      }
    },
    {
      label: 'redis PING via redis_dbsize (broker-dev)',
      name: 'redis_dbsize',
      args: {
        environment: 'broker-dev',
        connection_name: 'broker-dev-redis'
      }
    },
    {
      label: 'loki_label_names (broker-dev)',
      name: 'loki_label_names',
      args: {
        environment: 'broker-dev',
        connection_name: 'broker-dev-loki'
      }
    },
    {
      label: 'rocketmq_list_topics (broker-dev, limit)',
      name: 'rocketmq_list_topics',
      args: {
        environment: 'broker-dev',
        connection_name: 'broker-dev-rocketmq'
      }
    }
  ]

  let id = 2
  for (const t of tests) {
    const started = Date.now()
    try {
      const result = await callTool(session, t.name, t.args, id++)
      const status = result.ok ? 'OK' : 'FAIL'
      console.log(`[${status}] ${t.label} (${Date.now() - started}ms)`)
      console.log(result.text.slice(0, 600))
      if (result.error) console.log('error:', JSON.stringify(result.error))
    } catch (err) {
      console.log(`[FAIL] ${t.label}: ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log('')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
