import https from 'node:https'

import type { ElasticsearchCredentials } from './config-reader.js'

function buildAuthHeaders(creds: ElasticsearchCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }

  if (creds.apiKey) {
    const key = creds.apiKey.trim()
    headers.Authorization = key.startsWith('ApiKey ') ? key : `ApiKey ${key}`
    return headers
  }

  if (creds.username && creds.password) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`
  }

  return headers
}

async function esRequest(
  creds: ElasticsearchCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const base = creds.url.replace(/\/$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`
  const headers = buildAuthHeaders(creds)

  const init: RequestInit & { agent?: https.Agent } = {
    method,
    headers
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  if (url.startsWith('https://') && !creds.verifyCerts) {
    init.agent = new https.Agent({ rejectUnauthorized: false })
  }

  const res = await fetch(url, init)
  const text = await res.text()

  if (!res.ok) {
    throw new Error(`Elasticsearch 请求失败 (${res.status}): ${text.slice(0, 500)}`)
  }

  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function esListIndices(creds: ElasticsearchCredentials): Promise<string> {
  const json = await esRequest(creds, 'GET', '/_cat/indices?format=json&h=index,health,status,docs.count,store.size')
  return JSON.stringify(json, null, 2)
}

export async function esClusterHealth(creds: ElasticsearchCredentials): Promise<string> {
  const json = await esRequest(creds, 'GET', '/_cluster/health')
  return JSON.stringify(json, null, 2)
}

export async function esGetIndex(
  creds: ElasticsearchCredentials,
  index: string
): Promise<string> {
  const encoded = encodeURIComponent(index)
  const json = await esRequest(creds, 'GET', `/${encoded}`)
  return JSON.stringify(json, null, 2)
}

export async function esSearch(
  creds: ElasticsearchCredentials,
  opts: {
    index: string
    queryString?: string
    body?: Record<string, unknown>
    size?: number
    from?: number
    sort?: unknown
  }
): Promise<string> {
  const index = opts.index.trim()
  if (!index) throw new Error('index 参数必填')

  const size = opts.size ?? 20
  const from = opts.from ?? 0

  let body: Record<string, unknown>
  if (opts.body) {
    body = { ...opts.body }
  } else if (opts.queryString?.trim()) {
    body = {
      query: {
        query_string: {
          query: opts.queryString.trim()
        }
      }
    }
  } else {
    body = { query: { match_all: {} } }
  }

  body.size = size
  body.from = from
  if (opts.sort !== undefined) body.sort = opts.sort

  const encoded = encodeURIComponent(index)
  const json = await esRequest(creds, 'POST', `/${encoded}/_search`, body)
  return formatSearchResults(json)
}

function formatSearchResults(json: unknown): string {
  const data = json as {
    hits?: {
      total?: number | { value?: number }
      hits?: Array<{
        _index?: string
        _id?: string
        _score?: number
        _source?: unknown
      }>
    }
    took?: number
    timed_out?: boolean
  }

  const hits = data.hits?.hits ?? []
  const total =
    typeof data.hits?.total === 'number'
      ? data.hits.total
      : (data.hits?.total?.value ?? hits.length)

  if (hits.length === 0) {
    return JSON.stringify(
      {
        took_ms: data.took,
        total,
        hits: []
      },
      null,
      2
    )
  }

  const formatted = hits.map((hit) => ({
    index: hit._index,
    id: hit._id,
    score: hit._score,
    source: hit._source
  }))

  return JSON.stringify(
    {
      took_ms: data.took,
      total,
      hits: formatted
    },
    null,
    2
  )
}

export async function esPing(creds: ElasticsearchCredentials): Promise<{ ok: boolean; detail?: string }> {
  const json = (await esRequest(creds, 'GET', '/')) as {
    cluster_name?: string
    version?: { number?: string }
    tagline?: string
  }

  const version = json.version?.number ?? 'unknown'
  const cluster = json.cluster_name ?? 'unknown'
  return { ok: true, detail: `${cluster} · v${version}` }
}
