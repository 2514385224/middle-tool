import { useEffect, useMemo, useState } from 'react'
import type { Environment } from '../types'
import { useConnections, useEnvironments } from '../hooks/useData'
import type { AppRoute } from '../router/types'
import { environmentConfigRoute } from '../router/types'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import '../components/connection/ConnectionForm.css'
import '../components/ui/ConfirmDialog.css'
import './EnvironmentConfig.css'

const COLOR_PRESETS = ['#4a9eff', '#3ecf8e', '#e5a50a', '#e5484d', '#a78bfa', '#38bdf8']

type ConfirmState = {
  title: string
  message: string
  danger?: boolean
  confirmLabel?: string
  onConfirm: () => void | Promise<void>
}

interface EnvironmentConfigProps {
  view: 'list' | 'create' | 'edit'
  environmentId?: string
  onNavigate: (route: AppRoute) => void
}

export default function EnvironmentConfig({
  view = 'list',
  environmentId,
  onNavigate
}: EnvironmentConfigProps) {
  const { environments, loading: envLoading, refresh: refreshEnvs } = useEnvironments()
  const { connections, loading: connLoading, refresh: refreshConns } = useConnections()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(COLOR_PRESETS[0])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const connCountByEnv = useMemo(() => {
    const map = new Map<string, number>()
    for (const conn of connections) {
      map.set(conn.environmentId, (map.get(conn.environmentId) ?? 0) + 1)
    }
    return map
  }, [connections])

  const editingEnv = useMemo(
    () => (environmentId ? environments.find((e) => e.id === environmentId) : undefined),
    [environmentId, environments]
  )

  useEffect(() => {
    if (view === 'create') {
      setName('')
      setDescription('')
      setColor(COLOR_PRESETS[0])
      setMessage(null)
      return
    }

    if (view === 'edit' && editingEnv) {
      setName(editingEnv.name)
      setDescription(editingEnv.description ?? '')
      setColor(editingEnv.color ?? COLOR_PRESETS[0])
      setMessage(null)
    }
  }, [view, editingEnv])

  const goList = () => onNavigate(environmentConfigRoute('list'))
  const goCreate = () => onNavigate(environmentConfigRoute('create'))
  const goEdit = (env: Environment) => onNavigate(environmentConfigRoute('edit', { environmentId: env.id }))

  const refreshAll = async () => {
    await Promise.all([refreshEnvs(), refreshConns()])
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setMessage({ kind: 'error', text: '请填写环境名称' })
      return
    }

    const duplicate = environments.find(
      (e) => e.name === trimmedName && e.id !== environmentId
    )
    if (duplicate) {
      setMessage({ kind: 'error', text: `已存在同名环境「${trimmedName}」` })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      if (view === 'edit' && environmentId) {
        await window.middleTool.env.update(environmentId, {
          name: trimmedName,
          description: description.trim() || undefined,
          color
        })
      } else {
        await window.middleTool.env.create({
          name: trimmedName,
          description: description.trim() || undefined,
          color
        })
      }
      await refreshAll()
      goList()
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : '保存失败'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (env: Environment) => {
    const connCount = connCountByEnv.get(env.id) ?? 0
    const isLast = environments.length <= 1

    if (isLast) {
      setMessage({ kind: 'error', text: '至少保留一个环境，无法删除最后一个' })
      return
    }

    const connHint =
      connCount > 0
        ? `该环境下有 ${connCount} 条连接，删除后连接也会一并移除。`
        : '该环境下暂无连接。'

    setConfirmState({
      title: '删除环境',
      message: `确认删除「${env.name}」？${connHint}`,
      danger: true,
      confirmLabel: '删除',
      onConfirm: async () => {
        setConfirmState(null)
        try {
          await window.middleTool.env.delete(env.id)
          await refreshAll()
          setMessage({ kind: 'success', text: `已删除环境「${env.name}」` })
        } catch (err) {
          setMessage({
            kind: 'error',
            text: err instanceof Error ? err.message : '删除失败'
          })
        }
      }
    })
  }

  if (view === 'list' && (envLoading || connLoading)) {
    return <div className="card empty-state">加载中...</div>
  }

  if (view === 'create' || view === 'edit') {
    if (view === 'edit' && environmentId && !envLoading && !editingEnv) {
      return (
        <div className="card empty-state">
          <p>环境不存在或已删除</p>
          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} onClick={goList}>
            返回列表
          </button>
        </div>
      )
    }

    return (
      <div className="env-form-page">
        <nav className="breadcrumb">
          <button type="button" onClick={goList}>
            环境配置
          </button>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{view === 'edit' ? '编辑环境' : '新建环境'}</span>
        </nav>

        <header className="page-header">
          <h2>{view === 'edit' ? (name || '编辑环境') : '新建环境'}</h2>
          <p>环境用于分组中间件连接，MCP 调用时可按 environment 区分目标。</p>
        </header>

        {message && (
          <div
            className={`env-feedback ${message.kind === 'error' ? 'is-error' : 'is-success'}`}
            role="alert"
            style={{ marginBottom: 16 }}
          >
            {message.text}
          </div>
        )}

        <form
          className="env-form"
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
        >
          <div className="form-group">
            <label htmlFor="env-name">环境名称</label>
            <input
              id="env-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 经纪商-sit、云商-prod"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="env-desc">说明（可选）</label>
            <textarea
              id="env-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="用途、负责人或网络说明"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label>标识色</label>
            <div className="env-color-picker" role="listbox" aria-label="环境标识色">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`env-color-option ${color === preset ? 'is-selected' : ''}`}
                  style={{ background: preset }}
                  aria-label={preset}
                  aria-selected={color === preset}
                  onClick={() => setColor(preset)}
                />
              ))}
            </div>
            <div className="env-color-custom">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="自定义颜色"
              />
              <code>{color}</code>
            </div>
          </div>

          <div className="env-form-actions">
            <button type="button" className="btn-secondary" onClick={goList}>
              取消
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? '保存中…' : view === 'edit' ? '更新' : '创建'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="environment-config-layout">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h2>环境配置</h2>
        <p>管理 environment 分组；中间件连接需归属到某一环境。</p>
        <div className="page-actions">
          <button type="button" className="btn-primary" onClick={goCreate}>
            新建环境
          </button>
        </div>
      </div>

      <section className="env-hint-panel" aria-label="环境说明">
        <p>每个环境对应一组中间件连接，例如 经纪商-sit、云商-prod。</p>
        <p>删除环境会同时移除其下全部连接，请谨慎操作。</p>
      </section>

      {message && (
        <div
          className={`env-feedback ${message.kind === 'error' ? 'is-error' : 'is-success'}`}
          role="status"
        >
          {message.text}
        </div>
      )}

      {environments.length === 0 ? (
        <div className="card empty-state">
          <p>尚无环境</p>
          <button className="btn-primary btn-sm" style={{ marginTop: 12 }} onClick={goCreate}>
            新建环境
          </button>
        </div>
      ) : (
        <ul className="env-list">
          {environments.map((env) => {
            const connCount = connCountByEnv.get(env.id) ?? 0
            return (
              <li key={env.id} className="env-row">
                <span
                  className="env-row-mark"
                  style={{ background: env.color ?? COLOR_PRESETS[0] }}
                  aria-hidden
                />
                <div className="env-row-main">
                  <span className="env-row-name">{env.name}</span>
                  {env.description ? (
                    <span className="env-row-desc">{env.description}</span>
                  ) : (
                    <span className="env-row-desc">无说明</span>
                  )}
                </div>
                <span className="env-row-meta">{connCount} 连接</span>
                <div className="env-row-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => goEdit(env)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => handleDelete(env)}
                    disabled={environments.length <= 1}
                    title={environments.length <= 1 ? '至少保留一个环境' : undefined}
                  >
                    删除
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
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
