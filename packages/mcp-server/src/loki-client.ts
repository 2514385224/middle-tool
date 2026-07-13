import type { LokiCredentials } from './config-reader.js'

function buildAuthHeaders(creds: LokiCredentials): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  }
  if (creds.orgId) headers['X-Scope-OrgID'] = creds.orgId
  if (creds.token) {
    headers.Authorization = `Bearer ${creds.token}`
  } else if (creds.username && creds.password) {
    headers.Authorization = `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString('base64')}`
  }
  return headers
}

function parseTime(timeStr: string): number {
  if (timeStr === 'now') return Date.now() * 1_000_000
  if (timeStr.startsWith('-')) {
    const ms = parseDuration(timeStr.slice(1))
    return (Date.now() - ms) * 1_000_000
  }
  const parsed = Date.parse(timeStr)
  if (!Number.isNaN(parsed)) return parsed * 1_000_000
  throw new Error(`无法解析时间: ${timeStr}`)
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)(ms|s|m|h|d)$/)
  if (!m) throw new Error(`无法解析时长: ${s}`)
  const n = Number(m[1])
  switch (m[2]) {
    case 'ms':
      return n
    case 's':
      return n * 1000
    case 'm':
      return n * 60_000
    case 'h':
      return n * 3_600_000
    case 'd':
      return n * 86_400_000
    default:
      return n
  }
}

export async function lokiQueryRange(
  creds: LokiCredentials,
  query: string,
  opts: { start?: string; end?: string; limit?: number }
): Promise<string> {
  const start = opts.start ? parseTime(opts.start) : (Date.now() - 3_600_000) * 1_000_000
  const end = opts.end ? parseTime(opts.end) : Date.now() * 1_000_000
  const limit = opts.limit ?? 100

  const base = creds.url.replace(/\/$/, '')
  const url = new URL(`${base}/loki/api/v1/query_range`)
  url.searchParams.set('query', query)
  url.searchParams.set('start', String(start))
  url.searchParams.set('end', String(end))
  url.searchParams.set('limit', String(limit))

  const res = await fetch(url, { headers: buildAuthHeaders(creds) })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Loki 查询失败 (${res.status}): ${body}`)
  }
  const json = await res.json()
  return formatLokiResults(json)
}

export async function lokiLabelNames(creds: LokiCredentials, start?: string, end?: string): Promise<string> {
  const base = creds.url.replace(/\/$/, '')
  const url = new URL(`${base}/loki/api/v1/labels`)
  if (start) url.searchParams.set('start', String(parseTime(start)))
  if (end) url.searchParams.set('end', String(parseTime(end)))

  const res = await fetch(url, { headers: buildAuthHeaders(creds) })
  if (!res.ok) throw new Error(`Loki labels 请求失败 (${res.status})`)
  const json = (await res.json()) as { data?: string[] }
  return JSON.stringify(json.data ?? [], null, 2)
}

export async function lokiLabelValues(
  creds: LokiCredentials,
  label: string,
  start?: string,
  end?: string
): Promise<string> {
  const base = creds.url.replace(/\/$/, '')
  const url = new URL(`${base}/loki/api/v1/label/${encodeURIComponent(label)}/values`)
  if (start) url.searchParams.set('start', String(parseTime(start)))
  if (end) url.searchParams.set('end', String(parseTime(end)))

  const res = await fetch(url, { headers: buildAuthHeaders(creds) })
  if (!res.ok) throw new Error(`Loki label values 请求失败 (${res.status})`)
  const json = (await res.json()) as { data?: string[] }
  return JSON.stringify(json.data ?? [], null, 2)
}

function formatLokiResults(json: unknown): string {
  const data = json as {
    data?: { result?: Array<{ stream: Record<string, string>; values: string[][] }> }
  }
  const results = data.data?.result ?? []
  if (results.length === 0) return 'No logs found.'

  const lines: string[] = []
  for (const entry of results) {
    const labels = Object.entries(entry.stream)
      .map(([k, v]) => `${k}="${v}"`)
      .join(' ')
    for (const [ts, line] of entry.values ?? []) {
      lines.push(`[${labels}] ${ts} ${line}`)
    }
  }
  return lines.join('\n')
}
