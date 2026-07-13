import { useCallback, useEffect, useState } from 'react'
import type { DashboardStatus, PackBuildResult, PackInfo } from '../types'
import { useConnections } from '../hooks/useData'
import type { AppRoute } from '../router/types'
import { middlewareConfigRoute } from '../router/types'
import './Dashboard.css'

interface DashboardProps {
  onNavigate: (route: AppRoute) => void
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { connections } = useConnections()
  const [status, setStatus] = useState<DashboardStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [packInfo, setPackInfo] = useState<PackInfo | null>(null)
  const [packBuilding, setPackBuilding] = useState(false)
  const [packResult, setPackResult] = useState<PackBuildResult | null>(null)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const data = await window.middleTool.system.status()
      setStatus(data)
    } catch (err) {
      console.error('加载系统状态失败', err)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus, connections.length])

  const loadPackInfo = useCallback(async () => {
    try {
      const data = await window.middleTool.pack.info()
      setPackInfo(data)
    } catch (err) {
      console.error('加载打包信息失败', err)
    }
  }, [])

  useEffect(() => {
    loadPackInfo()
  }, [loadPackInfo])

  const handleBuildWin = async () => {
    setPackBuilding(true)
    setPackResult(null)
    try {
      const result = await window.middleTool.pack.buildWin()
      setPackResult(result)
      await loadPackInfo()
    } catch (err) {
      console.error('打包失败', err)
      setPackResult({
        available: packInfo?.available ?? false,
        success: false,
        outputDir: packInfo?.outputDir ?? '',
        artifacts: [],
        log: '',
        error: err instanceof Error ? err.message : String(err)
      })
    } finally {
      setPackBuilding(false)
    }
  }

  const handleOpenReleaseDir = async () => {
    try {
      await window.middleTool.pack.openOutputDir()
    } catch (err) {
      console.error('打开输出目录失败', err)
    }
  }

  const enabledCount = connections.filter((c) => c.enabled).length
  const typeCount = new Set(connections.map((c) => c.type)).size

  const metrics = [
    { label: '连接总数', value: status?.connectionTotal ?? connections.length },
    { label: '已启用', value: status?.connectionEnabled ?? enabledCount },
    { label: '中间件类型', value: typeCount }
  ]

  const actions = [
    {
      title: '中间件目录',
      desc: '查看适配器并校验连接连通性',
      label: '打开',
      onClick: () => onNavigate({ page: 'middleware-catalog' })
    },
    {
      title: '中间件配置',
      desc: '添加 NameServer、Loki URL 等连接信息',
      label: '打开',
      onClick: () => onNavigate(middlewareConfigRoute('list'))
    },
    {
      title: 'MCP 配置',
      desc: '根据已启用连接自动生成 MCP 配置',
      label: '复制 JSON',
      onClick: () => onNavigate({ page: 'mcp-export' })
    }
  ]

  const typeStats = status?.connectionsByType ?? {}
  const typeEntries = Object.entries(typeStats).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="dashboard">
      <header className="page-header">
        <h2>概览</h2>
        <p>本地连接配置会写入 MCP Server，供 Cursor 按 connection_id 调用。</p>
      </header>

      <section className="dashboard-metrics" aria-label="统计">
        {metrics.map((m) => (
          <div key={m.label} className="dashboard-metric">
            <span className="dashboard-metric-label">{m.label}</span>
            <span className="dashboard-metric-value">{m.value}</span>
          </div>
        ))}
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <h3 className="dashboard-section-title">运行状态</h3>
          <button type="button" className="btn-ghost btn-sm" onClick={loadStatus} disabled={statusLoading}>
            {statusLoading ? '刷新中…' : '刷新'}
          </button>
        </div>
        <ul className="dashboard-status-list">
          <li className="dashboard-status-row">
            <span className="dashboard-status-label">配置文件</span>
            <code className="dashboard-status-value">{status?.configPath ?? '—'}</code>
          </li>
          <li className="dashboard-status-row">
            <span className="dashboard-status-label">RocketMQ 桥接</span>
            <span className="dashboard-status-value">
              {status ? (
                <>
                  <span
                    className={`dashboard-status-dot ${status.rocketmqBridge.healthy ? 'is-ok' : 'is-warn'}`}
                    aria-hidden
                  />
                  {status.rocketmqBridge.healthy ? '就绪' : '未就绪'}
                  <span className="dashboard-status-sub">{status.rocketmqBridge.baseUrl}</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
          <li className="dashboard-status-row">
            <span className="dashboard-status-label">uvx（Redis）</span>
            <span className="dashboard-status-value">
              {status ? (
                <>
                  <span
                    className={`dashboard-status-dot ${status.uvx.installed ? 'is-ok' : 'is-warn'}`}
                    aria-hidden
                  />
                  {status.uvx.installed
                    ? status.uvx.inPath
                      ? '已安装 · PATH'
                      : '已安装 · 非 PATH'
                    : '未检测到'}
                  {status.uvx.path && (
                    <code className="dashboard-status-sub">{status.uvx.path}</code>
                  )}
                </>
              ) : (
                '—'
              )}
            </span>
          </li>
        </ul>
      </section>

      {typeEntries.length > 0 && (
        <section className="dashboard-section">
          <h3 className="dashboard-section-title">按类型统计</h3>
          <ul className="dashboard-type-stats">
            {typeEntries.map(([type, stats]) => (
              <li key={type} className="dashboard-type-row">
                <span className="dashboard-type-name">{type}</span>
                <span className="dashboard-type-count">
                  {stats.enabled}/{stats.total} 启用
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="dashboard-section">
        <h3 className="dashboard-section-title">快捷入口</h3>
        <ul className="dashboard-action-list">
          {actions.map((action) => (
            <li key={action.title} className="dashboard-action-row">
              <div className="dashboard-action-copy">
                <span className="dashboard-action-title">{action.title}</span>
                <span className="dashboard-action-desc">{action.desc}</span>
              </div>
              <button type="button" className="btn-secondary btn-sm" onClick={action.onClick}>
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="dashboard-section">
        <div className="dashboard-section-head">
          <h3 className="dashboard-section-title">打包 Windows 安装包</h3>
          {packInfo?.available && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={handleOpenReleaseDir}
              disabled={packBuilding}
            >
              打开 release
            </button>
          )}
        </div>
        <div className="dashboard-pack">
          {packInfo?.available ? (
            <>
              <p className="dashboard-pack-desc">
                执行 <code>{packInfo.command}</code>，构建 MCP、RocketMQ JAR 并生成 exe 安装包。需已安装
                Node、Java/Maven，耗时数分钟。
              </p>
              <div className="dashboard-pack-actions">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleBuildWin}
                  disabled={packBuilding}
                >
                  {packBuilding ? '打包中…' : '打包 exe'}
                </button>
                {packInfo.artifacts.length > 0 && (
                  <ul className="dashboard-pack-artifacts">
                    {packInfo.artifacts.map((file) => (
                      <li key={file}>
                        <code>{file}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {packResult && (
                <div
                  className={`dashboard-pack-result ${packResult.success ? 'is-ok' : 'is-error'}`}
                  role="status"
                >
                  {packResult.success
                    ? '打包完成'
                    : packResult.error ?? '打包失败'}
                </div>
              )}
              {(packBuilding || packResult?.log) && (
                <pre className="dashboard-pack-log">{packResult?.log || '正在执行构建…'}</pre>
              )}
            </>
          ) : (
            <p className="dashboard-pack-desc">
              当前为已安装版本，无法在应用内打包。请在项目目录执行 <code>npm run pack</code>。
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
