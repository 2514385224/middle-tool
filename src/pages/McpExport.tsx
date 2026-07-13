import { useCallback, useEffect, useState } from 'react'
import type { McpExportMeta, UvxDetectResult } from '../types'
import './McpExport.css'

interface ClientConfig {
  id: string
  name: string
  configPath: string
  hint?: string
}

const CLIENTS: ClientConfig[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    configPath: '.cursor/mcp.json',
    hint: '项目根目录'
  },
  {
    id: 'claude',
    name: 'Claude Desktop',
    configPath: '%APPDATA%\\Claude\\claude_desktop_config.json',
    hint: 'Windows 用户目录'
  }
]

export default function McpExport() {
  const [activeClient, setActiveClient] = useState(CLIENTS[0].id)
  const [configJson, setConfigJson] = useState('')
  const [exportMeta, setExportMeta] = useState<McpExportMeta | null>(null)
  const [uvxStatus, setUvxStatus] = useState<UvxDetectResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [copiedInstall, setCopiedInstall] = useState(false)
  const [copiedUvxPath, setCopiedUvxPath] = useState(false)
  const [writing, setWriting] = useState(false)
  const [writeMessage, setWriteMessage] = useState<string | null>(null)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [json, meta, uvx] = await Promise.all([
        window.middleTool.mcp.exportUnifiedConfig(),
        window.middleTool.mcp.getExportMeta(),
        window.middleTool.mcp.detectUvx()
      ])
      setConfigJson(json)
      setExportMeta(meta)
      setUvxStatus(uvx)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const current = CLIENTS.find((c) => c.id === activeClient) ?? CLIENTS[0]
  const uvx = uvxStatus ?? exportMeta?.uvx

  const handleCopy = async () => {
    if (!configJson) return
    await navigator.clipboard.writeText(configJson)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyInstall = async () => {
    if (!uvx?.installCommand) return
    await navigator.clipboard.writeText(uvx.installCommand)
    setCopiedInstall(true)
    setTimeout(() => setCopiedInstall(false), 2000)
  }

  const handleCopyUvxPath = async () => {
    if (!uvx?.path) return
    await navigator.clipboard.writeText(uvx.path)
    setCopiedUvxPath(true)
    setTimeout(() => setCopiedUvxPath(false), 2000)
  }

  const handleWriteFile = async () => {
    setWriting(true)
    setWriteMessage(null)
    try {
      const result = await window.middleTool.mcp.writeConfigFile()
      if (result.canceled) return
      setWriteMessage(
        result.merged
          ? `已合并写入 ${result.filePath}`
          : `已写入 ${result.filePath}`
      )
    } catch (err) {
      setWriteMessage(err instanceof Error ? err.message : '写入失败')
    } finally {
      setWriting(false)
    }
  }

  return (
    <div className="mcp-page">
      <header className="page-header mcp-page-header">
        <div>
          <h2>MCP 配置</h2>
          <p>
            根据已启用的中间件连接自动生成 JSON；启用 Redis 时会写入检测到的 uvx 路径到{' '}
            <code>REDIS_MCP_COMMAND</code>。
          </p>
        </div>

        <div className="mcp-client-switch" role="tablist" aria-label="客户端">
          {CLIENTS.map((client) => (
            <button
              key={client.id}
              type="button"
              role="tab"
              aria-selected={activeClient === client.id}
              className={`mcp-client-switch-btn ${activeClient === client.id ? 'active' : ''}`}
              onClick={() => setActiveClient(client.id)}
            >
              {client.name}
            </button>
          ))}
        </div>
      </header>

      {exportMeta && exportMeta.notes.length > 0 && (
        <section className="mcp-export-notes" aria-label="导出说明">
          <h3 className="mcp-export-notes-title">
            生成说明
            {exportMeta.envKeys.length > 0 && (
              <span className="mcp-export-env-keys">env: {exportMeta.envKeys.join(', ')}</span>
            )}
          </h3>
          <ul className="mcp-export-notes-list">
            {exportMeta.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {uvx && (
        <section
          className={`mcp-deps-panel ${uvx.installed ? 'is-ready' : 'is-missing'}`}
          aria-label="uvx 检测与安装"
        >
          <div className="mcp-deps-head">
            <div>
              <h3>Redis 依赖 · uvx</h3>
              <p className="mcp-deps-desc">
                使用 Redis 需本机安装 uv/uvx。检测到的路径会写入导出 JSON 的{' '}
                <code>REDIS_MCP_COMMAND</code>（仅当已启用 Redis 连接时）。
              </p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={loadConfig}>
              重新检测
            </button>
          </div>

          <div className="mcp-uvx-grid">
            <div className="mcp-uvx-field">
              <span className="mcp-uvx-label">检测状态</span>
              <span className={`mcp-deps-badge ${uvx.installed ? 'mcp-deps-badge-ok' : 'mcp-deps-badge-warn'}`}>
                {uvx.installed ? (uvx.inPath ? '已安装 · 在 PATH' : '已安装 · 不在 PATH') : '未检测到'}
              </span>
            </div>

            <div className="mcp-uvx-field">
              <span className="mcp-uvx-label">检测地址（REDIS_MCP_COMMAND）</span>
              {uvx.path ? (
                <div className="mcp-uvx-path-row">
                  <code className="mcp-deps-path">{uvx.path}</code>
                  <button type="button" className="btn-ghost btn-sm" onClick={handleCopyUvxPath}>
                    {copiedUvxPath ? '已复制' : '复制路径'}
                  </button>
                </div>
              ) : (
                <p className="mcp-deps-note">未检测到可执行文件，请先安装 uv。</p>
              )}
            </div>

            <div className="mcp-uvx-field mcp-uvx-field-full">
              <span className="mcp-uvx-label">安装命令（PowerShell）</span>
              <pre className="mcp-deps-install-cmd">{uvx.installCommand}</pre>
              <div className="mcp-deps-install-actions">
                <button type="button" className="btn-primary btn-sm" onClick={handleCopyInstall}>
                  {copiedInstall ? '已复制' : '复制安装命令'}
                </button>
                <a
                  className="btn-ghost btn-sm mcp-deps-docs-link"
                  href={uvx.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  查看 uv 文档
                </a>
              </div>
            </div>
          </div>

          {exportMeta?.usesRedis && !uvx.installed && (
            <p className="mcp-deps-note mcp-deps-note-warn">
              已启用 Redis 连接，但 uvx 未就绪。安装后点击「重新检测」，再复制下方 JSON。
            </p>
          )}
        </section>
      )}

      {loading ? (
        <div className="mcp-loading">加载配置…</div>
      ) : (
        <section className="mcp-panel">
          <div className="mcp-panel-toolbar">
            <div>
              <h3>{current.name}</h3>
              <p className="mcp-client-path">
                路径 <code>{current.configPath}</code>
              </p>
              {current.hint && <p className="mcp-client-hint">{current.hint}</p>}
            </div>
            <button type="button" className="btn-primary btn-sm" onClick={handleCopy}>
              {copied ? '已复制' : '复制 JSON'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleWriteFile}
              disabled={writing}
            >
              {writing ? '写入中…' : '写入文件'}
            </button>
          </div>
          {writeMessage && <p className="mcp-write-message">{writeMessage}</p>}
          <pre className="mcp-config-pre">{configJson}</pre>
        </section>
      )}
    </div>
  )
}
