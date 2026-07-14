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
    signal: AbortSignal.timeout(60_000)
  })

  const session = res.headers.get('mcp-session-id')
  const text = await res.text()
  return { status: res.status, session, text }
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
    return { raw: text.slice(0, 500) }
  }
}

async function main() {
  console.log('target:', base)
  const t0 = Date.now()

  const init = await post({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'probe', version: '1.0' }
    }
  })
  console.log('initialize ms:', Date.now() - t0, 'status:', init.status, 'session:', init.session)
  console.log('initialize body:', JSON.stringify(parseSseJson(init.text)).slice(0, 300))

  if (!init.session) {
    console.error('no session id, abort')
    process.exit(1)
  }

  const t1 = Date.now()
  const listed = await post(
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    init.session
  )
  const parsed = parseSseJson(listed.text)
  const toolCount = parsed.result?.tools?.length ?? 0
  console.log('tools/list ms:', Date.now() - t1, 'status:', listed.status, 'tools:', toolCount)
  if (parsed.error) console.log('tools/list error:', parsed.error)
}

main().catch((err) => {
  console.error('probe failed:', err.message)
  process.exit(1)
})
