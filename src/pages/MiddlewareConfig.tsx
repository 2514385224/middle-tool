import { useEffect, useMemo, useState } from 'react'
import type { AdapterMeta, MiddlewareConnection } from '../types'
import { ADAPTER_STATUS_LABELS, isAdapterOperational } from '../types'
import { useConnections } from '../hooks/useData'
import ConnectionForm from '../components/connection/ConnectionForm'
import { AdapterFilter, AdapterTypeSelect } from '../components/adapter/AdapterFilter'
import '../components/adapter/AdapterFilter.css'
import { buildDefaultConfig, getConnectionPreview } from '../components/connection/connectionUtils'
import type { AppRoute } from '../router/types'
import { middlewareConfigRoute } from '../router/types'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import './Connections.css'
import './MiddlewareConfig.css'
import '../components/connection/ConnectionForm.css'
import '../components/ui/ConfirmDialog.css'

type ConfirmState = {
  title: string
  message: string
  danger?: boolean
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

interface MiddlewareConfigProps {
  view: 'list' | 'create' | 'edit'
  middlewareType?: string
  connectionId?: string
  onNavigate: (route: AppRoute) => void
}

export default function MiddlewareConfig({
  view = 'list',
  middlewareType: initialType,
  connectionId,
  onNavigate
}: MiddlewareConfigProps) {
  const { connections, loading: connLoading, refresh } = useConnections()
  const [adapters, setAdapters] = useState<AdapterMeta[]>([])
  const [adaptersLoading, setAdaptersLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [filterType, setFilterType] = useState<string>(initialType ?? '')
  const [selectedType, setSelectedType] = useState(initialType ?? 'loki')
  const [name, setName] = useState('')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [ioMessage, setIoMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [formMessage, setFormMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; detail?: string } | null>(null)

  useEffect(() => {
    setAdaptersLoading(true)
    setLoadError(null)
    window.middleTool.adapter
      .list()
      .then(setAdapters)
      .catch((err) => setLoadError(err instanceof Error ? err.message : '加载适配器失败'))
      .finally(() => setAdaptersLoading(false))
  }, [])

  useEffect(() => {
    if (initialType) setFilterType(initialType)
  }, [initialType])

  const adapterMap = useMemo(() => new Map(adapters.map((a) => [a.type, a])), [adapters])
  const availableAdapters = adapters.filter((a) => isAdapterOperational(a))

  const currentAdapter = adapterMap.get(selectedType) ?? availableAdapters[0]

  const filteredConnections = useMemo(() => {
    if (!filterType) return connections
    return connections.filter((c) => c.type === filterType)
  }, [connections, filterType])

  const groupedConnections = useMemo(() => {
    const groups = new Map<string, MiddlewareConnection[]>()
    for (const conn of filteredConnections) {
      if (!groups.has(conn.type)) groups.set(conn.type, [])
      groups.get(conn.type)!.push(conn)
    }
    return groups
  }, [filteredConnections])

  useEffect(() => {
    if (view !== 'create' || adaptersLoading || adapters.length === 0) return
    const preferred = initialType ? adapterMap.get(initialType) : undefined
    const type =
      preferred && isAdapterOperational(preferred) ? initialType! : availableAdapters[0]?.type ?? 'loki'
    const adapter = adapterMap.get(type)
    setSelectedType(type)
    setName('')
    if (adapter) setConfig(buildDefaultConfig(adapter))
  }, [view, initialType, adapters, adaptersLoading])

  useEffect(() => {
    if (view !== 'edit' || !connectionId || connLoading) return
    const conn = connections.find((c) => c.id === connectionId)
    if (conn) {
      setSelectedType(conn.type)
      setName(conn.name)
      setConfig({ ...conn.config })
    }
  }, [view, connectionId, connections, connLoading])

  const goList = () => onNavigate(middlewareConfigRoute('list', { middlewareType: filterType || undefined }))
  const goCreate = (type?: string) => {
    const middlewareType = type || filterType || undefined
    onNavigate(middlewareConfigRoute('create', { middlewareType }))
  }
  const goEdit = (conn: MiddlewareConnection) =>
    onNavigate(middlewareConfigRoute('edit', { connectionId: conn.id, middlewareType: conn.type }))

  const handleSave = async () => {
    if (!name.trim() || !currentAdapter) return
    setSaving(true)
    setFormMessage(null)
    try {
      if (view === 'edit' && connectionId) {
        await window.middleTool.conn.update(connectionId, { name, config })
      } else {
        if (!isAdapterOperational(currentAdapter)) {
          setFormMessage({ kind: 'error', text: '该中间件尚未开放' })
          return
        }
        await window.middleTool.conn.create({ type: selectedType, name, config })
      }
      await refresh()
      goList()
    } catch (err) {
      setFormMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : '保存失败'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    if (!currentAdapter) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.middleTool.conn.test(selectedType, config)
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : '测试失败'
      })
    } finally {
      setTesting(false)
    }
  }

  const handleDelete = (conn: MiddlewareConnection) => {
    setConfirmState({
      title: '删除连接',
      message: `确认删除「${conn.name}」？此操作不可撤销。`,
      danger: true,
      confirmLabel: '删除',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await window.middleTool.conn.delete(conn.id)
          await refresh()
          setIoMessage({ kind: 'success', text: `已删除连接「${conn.name}」` })
        } catch (err) {
          setIoMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : '删除失败'
          })
        }
      }
    })
  }

  const handleToggleEnabled = async (conn: MiddlewareConnection) => {
    await window.middleTool.conn.update(conn.id, { enabled: !conn.enabled })
    refresh()
  }

  const handleExport = async () => {
    setExporting(true)
    setIoMessage(null)
    try {
      const result = await window.middleTool.config.exportToFile()
      if (result.canceled) return
      setIoMessage({ kind: 'success', text: `已导出到 ${result.filePath}` })
    } catch (err) {
      setIoMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : '导出失败'
      })
    } finally {
      setExporting(false)
    }
  }

  const runImport = async () => {
    setImporting(true)
    setIoMessage(null)
    try {
      const result = await window.middleTool.config.importFromFile(importMode)
      if (result.canceled) return

      await refresh()
      const parts = [
        `新增环境 ${result.environmentsAdded} 个`,
        `新增连接 ${result.connectionsAdded} 条`
      ]
      if (result.environmentsSkipped > 0) {
        parts.push(`跳过环境 ${result.environmentsSkipped} 个`)
      }
      if (result.connectionsSkipped > 0) {
        parts.push(`跳过连接 ${result.connectionsSkipped} 条`)
      }

      const warningText =
        result.warnings.length > 0 ? `\n${result.warnings.slice(0, 5).join('\n')}` : ''
      setIoMessage({
        kind: 'success',
        text: `已从 ${result.filePath} 导入（${parts.join('，')}）${warningText}`
      })
    } catch (err) {
      setIoMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : '导入失败'
      })
    } finally {
      setImporting(false)
    }
  }

  const handleImport = () => {
    if (importMode === 'replace') {
      setConfirmState({
        title: '覆盖导入',
        message: '覆盖导入将替换当前全部环境与连接，是否继续？',
        danger: true,
        confirmLabel: '覆盖导入',
        onConfirm: async () => {
          setConfirmState(null)
          await runImport()
        }
      })
      return
    }
    void runImport()
  }

  if (loadError) {
    return (
      <div className="card empty-state">
        <p>加载失败：{loadError}</p>
        <button className="btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    )
  }

  if (adaptersLoading || (view === 'list' && connLoading)) {
    return <div className="card empty-state">加载中...</div>
  }

  if (view === 'create' || view === 'edit') {
    if (view === 'edit' && connectionId && !connections.find((c) => c.id === connectionId)) {
      return (
        <div className="card empty-state">
          <p>连接不存在或已删除</p>
          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} onClick={goList}>
            返回列表
          </button>
        </div>
      )
    }

    if (!currentAdapter) {
      return (
        <div className="card empty-state">
          <p>暂无可用中间件适配器</p>
          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} onClick={goList}>
            返回列表
          </button>
        </div>
      )
    }

    const operational = isAdapterOperational(currentAdapter)

    return (
      <div className="config-form-page">
        <nav className="breadcrumb">
          <button type="button" onClick={goList}>
            中间件配置
          </button>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{view === 'edit' ? '编辑连接' : '添加连接'}</span>
        </nav>

        <header className="config-form-header">
          <h2>{view === 'edit' ? (name || '编辑连接') : '添加连接'}</h2>

          {view === 'create' && (
            <AdapterTypeSelect
              adapters={adapters}
              selectedType={selectedType}
              onSelect={(type) => {
                const adapter = adapterMap.get(type)
                if (!adapter || !isAdapterOperational(adapter)) return
                setSelectedType(type)
                setConfig(buildDefaultConfig(adapter))
              }}
            />
          )}

          {view === 'create' && currentAdapter && (
            <p className="config-form-desc">{currentAdapter.description}</p>
          )}

          {view === 'edit' && currentAdapter && (
            <p className="config-form-desc">
              <span className="config-form-type-label">{currentAdapter.type}</span>
              {' · '}
              {currentAdapter.name}
            </p>
          )}
        </header>

        {!operational && view === 'create' && (
          <div className="planned-banner">
            {ADAPTER_STATUS_LABELS[currentAdapter.status]} — 以下为表单预览
          </div>
        )}

        {formMessage && (
          <div
            className={`config-io-feedback ${formMessage.kind === 'error' ? 'is-error' : 'is-success'}`}
            role="alert"
          >
            {formMessage.text}
          </div>
        )}

        <ConnectionForm
          adapter={currentAdapter}
          name={name}
          config={config}
          onNameChange={setName}
          onConfigChange={(next) => {
            setConfig(next)
            setTestResult(null)
          }}
          onSubmit={handleSave}
          onCancel={goList}
          onTest={handleTestConnection}
          testing={testing}
          testResult={testResult}
          canTest={operational}
          submitLabel={saving ? '保存中...' : view === 'edit' ? '更新' : '创建'}
          readOnly={view === 'create' && !operational}
        />
      </div>
    )
  }

  return (
    <div className="middleware-config-layout">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>中间件配置</h2>
        <p>维护各中间件连接，通过连接名称区分环境（如 prod-loki、test-rocketmq）。</p>
        <div className="page-actions">
          <button type="button" className="btn-secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : '导出配置'}
          </button>
          <button type="button" className="btn-primary" onClick={() => goCreate()}>
            添加连接
          </button>
        </div>
      </div>

      <section className="config-io-panel" aria-label="配置导入导出">
        <div className="config-io-copy">
          <h3 className="config-io-title">备份与迁移</h3>
          <p className="config-io-desc">
            导出当前连接为 JSON；导入支持合并（保留现有）或覆盖（替换全部）。
          </p>
        </div>
        <div className="config-io-controls">
          <div className="config-io-mode" role="radiogroup" aria-label="导入模式">
            <label className="config-io-mode-option">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
              />
              <span>合并导入</span>
            </label>
            <label className="config-io-mode-option">
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
              />
              <span>覆盖导入</span>
            </label>
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? '导入中…' : '选择文件导入'}
          </button>
        </div>
      </section>

      {ioMessage && (
        <div
          className={`config-io-feedback ${ioMessage.kind === 'error' ? 'is-error' : 'is-success'}`}
          role="status"
        >
          {ioMessage.text}
        </div>
      )}

      <AdapterFilter
        adapters={adapters}
        connections={connections}
        filterType={filterType}
        onFilterTypeChange={setFilterType}
      />

      {filteredConnections.length === 0 ? (
        <div className="empty-config-hint">
          <div className="empty-config-hint-label">No connections</div>
          <p>尚无中间件连接</p>
          <button
            type="button"
            className="btn-primary btn-sm"
            style={{ marginTop: 14 }}
            onClick={() => goCreate(filterType || undefined)}
          >
            添加连接
          </button>
        </div>
      ) : (
        Array.from(groupedConnections.entries()).map(([type, conns]) => {
          const adapter = adapterMap.get(type)
          return (
            <div key={type}>
              <div className="conn-section-title">
                {adapter?.name ?? type}
                <span className="conn-section-type">{type}</span>
                <span className="conn-section-count">{conns.length}</span>
              </div>
              <ul className="conn-list">
                {conns.map((conn) => (
                  <li key={conn.id} className="conn-row">
                    <div className="conn-row-main">
                      <span className="conn-row-name">{conn.name}</span>
                      {adapter && getConnectionPreview(adapter, conn.config) && (
                        <code className="conn-row-preview">
                          {getConnectionPreview(adapter, conn.config)}
                        </code>
                      )}
                    </div>
                    <span className={`badge ${conn.enabled ? 'badge-running' : 'badge-stopped'}`}>
                      {conn.enabled ? '启用' : '禁用'}
                    </span>
                    <div className="conn-row-actions">
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => handleToggleEnabled(conn)}
                      >
                        {conn.enabled ? '禁用' : '启用'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        onClick={() => goEdit(conn)}
                        disabled={!adapter || !isAdapterOperational(adapter)}
                      >
                        编辑
                      </button>
                      <button type="button" className="btn-danger btn-sm" onClick={() => handleDelete(conn)}>
                        删除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        danger={confirmState?.danger}
        confirmLabel={confirmState?.confirmLabel}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          void confirmState?.onConfirm()
        }}
      />
    </div>
  )
}
