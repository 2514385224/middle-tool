import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AdapterMeta, ConnectionTestResult, MiddlewareConnection } from '../types'
import { ADAPTER_CATEGORY_LABELS, ADAPTER_STATUS_LABELS, isAdapterOperational } from '../types'
import { useConnections } from '../hooks/useData'
import { getConnectionPreview } from '../components/connection/connectionUtils'
import './MiddlewareCatalog.css'

function formatRepoRef(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.includes('gitee.com')
      ? 'Gitee'
      : parsed.hostname.includes('github.com')
        ? 'GitHub'
        : parsed.hostname
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '')
    return { host, path: path || url }
  } catch {
    return { host: '来源', path: url }
  }
}

type CheckStatus = 'idle' | 'checking' | 'ok' | 'error' | 'skipped'

interface ConnectionCheck {
  status: CheckStatus
  result?: ConnectionTestResult
}

export default function MiddlewareCatalog() {
  const { connections } = useConnections()
  const [adapters, setAdapters] = useState<AdapterMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, ConnectionCheck>>({})
  const [checkingAll, setCheckingAll] = useState(false)

  useEffect(() => {
    window.middleTool.adapter
      .list()
      .then(setAdapters)
      .catch((err) => setError(err instanceof Error ? err.message : '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const adapterMap = useMemo(() => new Map(adapters.map((a) => [a.type, a])), [adapters])

  const connectionFingerprint = useMemo(
    () => connections.map((c) => `${c.id}:${c.enabled}:${c.updatedAt}`).join('|'),
    [connections]
  )

  const grouped = useMemo(() => {
    const map = new Map<string, AdapterMeta[]>()
    for (const adapter of adapters) {
      const cat = adapter.category
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(adapter)
    }
    return map
  }, [adapters])

  const connectionsForType = (type: string) => connections.filter((c) => c.type === type)

  const runCheck = useCallback(async (conn: MiddlewareConnection): Promise<ConnectionCheck> => {
    if (!conn.enabled) {
      return { status: 'skipped', result: { ok: false, message: '连接已禁用' } }
    }
    const adapter = adapterMap.get(conn.type)
    if (!adapter || !isAdapterOperational(adapter)) {
      return { status: 'skipped', result: { ok: false, message: '适配器不可用' } }
    }

    try {
      const result = await window.middleTool.conn.test(conn.type, conn.config)
      return { status: result.ok ? 'ok' : 'error', result }
    } catch (err) {
      return {
        status: 'error',
        result: { ok: false, message: err instanceof Error ? err.message : '校验失败' }
      }
    }
  }, [adapterMap])

  const setCheckState = (connId: string, check: ConnectionCheck) => {
    setChecks((prev) => ({ ...prev, [connId]: check }))
  }

  const runAllChecks = useCallback(async () => {
    if (connections.length === 0) return

    setCheckingAll(true)
    const enabled = connections.filter((c) => {
      const adapter = adapterMap.get(c.type)
      return c.enabled && adapter && isAdapterOperational(adapter)
    })

    for (const conn of connections) {
      if (!conn.enabled) {
        setCheckState(conn.id, { status: 'skipped', result: { ok: false, message: '连接已禁用' } })
      } else {
        setCheckState(conn.id, { status: 'checking' })
      }
    }

    for (const conn of enabled) {
      const check = await runCheck(conn)
      setCheckState(conn.id, check)
    }

    setCheckingAll(false)
  }, [connections, runCheck])

  const handleCheckAll = () => runAllChecks()

  useEffect(() => {
    if (loading || adapters.length === 0) return
    runAllChecks()
  }, [loading, adapters.length, connectionFingerprint, runAllChecks])

  const statusLabel = (check?: ConnectionCheck) => {
    if (!check || check.status === 'idle') return checkingAll ? '等待校验…' : '未校验'
    if (check.status === 'checking') return '校验中…'
    if (check.status === 'skipped') return check.result?.message ?? '已跳过'
    if (check.status === 'ok') return check.result?.message ?? '正常'
    return check.result?.message ?? '失败'
  }

  if (loading) {
    return <div className="card empty-state">加载中...</div>
  }

  if (error) {
    return (
      <div className="card empty-state">
        <p>加载失败：{error}</p>
      </div>
    )
  }

  return (
    <div className="catalog-page">
      <header className="page-header">
        <div>
          <h2>中间件目录</h2>
          <p>进入页面自动校验已启用连接；配置变更后也会重新检测。</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCheckAll}
            disabled={checkingAll || connections.length === 0}
          >
            {checkingAll ? '校验中…' : '重新校验'}
          </button>
        </div>
      </header>

      {Array.from(grouped.entries()).map(([category, items]) => (
        <section key={category} className="catalog-section">
          <h3 className="catalog-section-title">
            {ADAPTER_CATEGORY_LABELS[category as keyof typeof ADAPTER_CATEGORY_LABELS] ?? category}
          </h3>
          <ul className="catalog-list">
            {items.map((adapter) => {
              const operational = isAdapterOperational(adapter)
              const typeConnections = connectionsForType(adapter.type)
              const enabledCount = typeConnections.filter((c) => c.enabled).length
              const repoRef = adapter.docsUrl ? formatRepoRef(adapter.docsUrl) : null

              return (
                <li key={adapter.type} className="catalog-card">
                  <div className="catalog-card-head">
                    <div className="catalog-card-title-row">
                      <span className="catalog-card-type">{adapter.type}</span>
                      <h4 className="catalog-card-name">{adapter.name}</h4>
                      <span className={`badge ${operational ? 'badge-running' : 'badge-stopped'}`}>
                        {ADAPTER_STATUS_LABELS[adapter.status]}
                      </span>
                    </div>
                    <p className="catalog-card-desc">{adapter.description}</p>
                    {repoRef && adapter.docsUrl && (
                      <p className="catalog-card-repo">
                        <span className="catalog-card-repo-label">MCP 来源</span>
                        <a
                          href={adapter.docsUrl}
                          className="catalog-card-repo-link"
                          target="_blank"
                          rel="noopener noreferrer"
                          title={adapter.docsUrl}
                        >
                          <span className="catalog-card-repo-host">{repoRef.host}</span>
                          <span className="catalog-card-repo-path">{repoRef.path}</span>
                        </a>
                      </p>
                    )}
                  </div>

                  <div className="catalog-card-meta">
                    <span className="catalog-meta-item">
                      连接 <strong>{typeConnections.length}</strong>
                      {typeConnections.length > 0 && (
                        <span className="catalog-meta-sub"> / 启用 {enabledCount}</span>
                      )}
                    </span>
                    {adapter.tools && adapter.tools.length > 0 && (
                      <span className="catalog-meta-item">
                        MCP tools <strong>{adapter.tools.length}</strong>
                      </span>
                    )}
                  </div>

                  {typeConnections.length > 0 ? (
                    <ul className="catalog-conn-list">
                      {typeConnections.map((conn) => {
                        const check = checks[conn.id]
                        const status = check?.status ?? 'idle'
                        return (
                          <li key={conn.id} className="catalog-conn-row">
                            <div className="catalog-conn-main">
                              <span className="catalog-conn-name">{conn.name}</span>
                              {getConnectionPreview(adapter, conn.config) && (
                                <code className="catalog-conn-preview">
                                  {getConnectionPreview(adapter, conn.config)}
                                </code>
                              )}
                              <span className={`catalog-conn-status is-${status}`}>
                                <span className="catalog-conn-dot" aria-hidden />
                                {statusLabel(check)}
                                {check?.result?.detail && (
                                  <span className="catalog-conn-detail">{check.result.detail}</span>
                                )}
                              </span>
                            </div>
                            <div className="catalog-conn-actions">
                              <span className={`badge ${conn.enabled ? 'badge-running' : 'badge-stopped'}`}>
                                {conn.enabled ? '启用' : '禁用'}
                              </span>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="catalog-empty-conn">暂无连接，请在「中间件配置」中添加</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
