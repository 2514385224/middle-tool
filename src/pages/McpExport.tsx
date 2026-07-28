import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, McpExportMeta, UvxDetectResult } from '../types'
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
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const [json, meta, uvx, appSettings] = await Promise.all([
        window.middleTool.mcp.exportUnifiedConfig(),
        window.middleTool.mcp.getExportMeta(),
        window.middleTool.mcp.detectUvx(),
        window.middleTool.settings.get()
      ])
      setConfigJson(json)
      setExportMeta(meta)
      setUvxStatus(uvx)
      setSettings(appSettings)
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

  const handleToggleMcpWrite = async () => {
    if (!settings || settingsSaving) return
    setSettingsSaving(true)
    try {
      const next = await window.middleTool.settings.update({
        mcpWriteEnabled: !settings.mcpWriteEnabled
      })
      setSettings(next)
      await loadConfig()
    } catch (err) {
      console.error('更新 MCP 写权限失败', err)
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleHttpSettingBlur = async (
    field: 'mcpHttpHost' | 'mcpHttpPort' | 'mcpHttpPath' | 'mcpHttpApiKey',
    value: string
  ) => {
    if (!settings || settingsSaving) return

    let patch: Partial<AppSettings> | null = null

    if (field === 'mcpHttpPort') {
      const port = Number(value.trim())
      if (!Number.isInteger(port) || port < 1 || port > 65535) return
      if (port === settings.mcpHttpPort) return
      patch = { mcpHttpPort: port }
    } else if (field === 'mcpHttpHost') {
      const host = value.trim() || '127.0.0.1'
      if (host === settings.mcpHttpHost) return
      patch = { mcpHttpHost: host }
    } else if (field === 'mcpHttpPath') {
      const mcpPath = value.trim() ? (value.trim().startsWith('/') ? value.trim() : `/${value.trim()}`) : '/mcp'
      if (mcpPath === settings.mcpHttpPath) return
      patch = { mcpHttpPath: mcpPath }
    } else if (field === 'mcpHttpApiKey') {
      const apiKey = value.trim()
      if (apiKey === (settings.mcpHttpApiKey ?? '')) return
      patch = { mcpHttpApiKey: apiKey }
    }

    if (!patch) return

    setSettingsSaving(true)
    try {
      const next = await window.middleTool.settings.update(patch)
      setSettings(next)
      await loadConfig()
    } catch (err) {
      console.error('更新 HTTP MCP 设置失败', err)
    } finally {
      setSettingsSaving(false)
    }
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
            导出 Streamable HTTP 配置（<code>url</code>），供 Cursor / Claude 连接已启动的 MCP 服务。
            连接信息由服务端读取，无需写入 JSON。
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

      <section className="mcp-write-policy" aria-label="MCP 写权限">
        <div className="mcp-write-policy-head">
          <div>
            <h3>MCP 写权限</h3>
            <p className="mcp-write-policy-desc">
              关闭时，所有 MCP 工具仅允许读操作（MySQL 查询、Redis GET、Loki 查询等）；写操作会被拦截且不出现在工具列表中。
            </p>
          </div>
          <label className="mcp-write-toggle">
            <input
              type="checkbox"
              checked={settings?.mcpWriteEnabled === true}
              disabled={!settings || settingsSaving || loading}
              onChange={handleToggleMcpWrite}
            />
            <span>允许 MCP 写入</span>
          </label>
        </div>
        <p className={`mcp-write-policy-status ${settings?.mcpWriteEnabled ? 'is-on' : 'is-off'}`}>
          当前模式：{settings?.mcpWriteEnabled ? '读写' : '只读'}
          {!settings?.mcpWriteEnabled && ' · MySQL/Redis 等写操作已禁用'}
        </p>
      </section>

      <section className="mcp-transport-panel" aria-label="HTTP 服务地址">
        <div className="mcp-transport-head">
          <div>
            <h3>HTTP 服务地址</h3>
            <p className="mcp-transport-desc">
              Cursor 只需 <code>url</code> 指向 MiddleTool MCP HTTP 服务；改连接后由服务端 reload 生效。
            </p>
          </div>
        </div>

        <div className="mcp-http-grid">
          <label className="mcp-http-field">
            <span className="mcp-http-label">主机</span>
            <input
              type="text"
              className="mcp-http-input"
              defaultValue={settings?.mcpHttpHost ?? '127.0.0.1'}
              key={`host-${settings?.mcpHttpHost ?? '127.0.0.1'}`}
              disabled={loading || settingsSaving}
              placeholder="127.0.0.1 或 192.168.x.x"
              onBlur={(e) => handleHttpSettingBlur('mcpHttpHost', e.target.value)}
            />
          </label>
          <label className="mcp-http-field">
            <span className="mcp-http-label">端口</span>
            <input
              type="number"
              className="mcp-http-input"
              min={1}
              max={65535}
              defaultValue={settings?.mcpHttpPort ?? 8080}
              key={`port-${settings?.mcpHttpPort ?? 8080}`}
              disabled={loading || settingsSaving}
              onBlur={(e) => handleHttpSettingBlur('mcpHttpPort', e.target.value)}
            />
          </label>
          <label className="mcp-http-field">
            <span className="mcp-http-label">路径</span>
            <input
              type="text"
              className="mcp-http-input"
              defaultValue={settings?.mcpHttpPath ?? '/mcp'}
              key={`path-${settings?.mcpHttpPath ?? '/mcp'}`}
              disabled={loading || settingsSaving}
              onBlur={(e) => handleHttpSettingBlur('mcpHttpPath', e.target.value)}
            />
          </label>
          <label className="mcp-http-field mcp-http-field-wide">
            <span className="mcp-http-label">API Key（可选）</span>
            <input
              type="password"
              className="mcp-http-input"
              defaultValue={settings?.mcpHttpApiKey ?? ''}
              key={`api-${settings?.mcpHttpApiKey ?? ''}`}
              disabled={loading || settingsSaving}
              placeholder="与服务端 MIDDLE_TOOL_MCP_API_KEY 一致时填写"
              autoComplete="off"
              onBlur={(e) => handleHttpSettingBlur('mcpHttpApiKey', e.target.value)}
            />
          </label>
        </div>

        {exportMeta?.httpUrl && (
          <p className="mcp-http-preview">
            当前 URL：<code>{exportMeta.httpUrl}</code>
            <span className="mcp-http-preview-hint">
              请先启动 HTTP 服务（如 <code>npm run mcp-server:start:http</code> 或 Linux/Docker 部署）
            </span>
          </p>
        )}
      </section>

      {exportMeta && exportMeta.notes.length > 0 && (
        <section className="mcp-export-notes" aria-label="导出说明">
          <h3 className="mcp-export-notes-title">生成说明</h3>
          <ul className="mcp-export-notes-list">
            {exportMeta.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      {uvx && exportMeta?.usesRedis && (
        <section
          className={`mcp-deps-panel ${uvx.installed ? 'is-ready' : 'is-missing'}`}
          aria-label="uvx 检测与安装"
        >
          <div className="mcp-deps-head">
            <div>
              <h3>Redis 依赖 · uvx</h3>
              <p className="mcp-deps-desc">
                uvx 需安装在运行 MCP HTTP 服务的环境（本机或远程 Linux/Docker），不会写入 Cursor JSON。
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
              <span className="mcp-uvx-label">本机 uvx（供本地 HTTP 服务参考）</span>
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

          {!uvx.installed && (
            <p className="mcp-deps-note mcp-deps-note-warn">
              已启用 Redis 连接。若在本机运行 HTTP MCP，请先安装 uvx；远程部署请在服务器侧安装。
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
