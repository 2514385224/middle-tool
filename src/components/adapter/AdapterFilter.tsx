import { useEffect, useMemo, useRef, useState } from 'react'
import type { AdapterCategory, AdapterMeta, MiddlewareConnection } from '../../types'
import { ADAPTER_CATEGORY_LABELS, ADAPTER_STATUS_LABELS, isAdapterOperational } from '../../types'
import './AdapterFilter.css'

const CATEGORY_ORDER: AdapterCategory[] = [
  'logging',
  'messaging',
  'database',
  'cache',
  'monitoring',
  'other'
]

function filterAdapters(
  adapters: AdapterMeta[],
  opts: { query: string; category: AdapterCategory | '' }
): AdapterMeta[] {
  const q = opts.query.trim().toLowerCase()
  return adapters.filter((adapter) => {
    if (opts.category && adapter.category !== opts.category) return false
    if (!q) return true
    return (
      adapter.type.toLowerCase().includes(q) ||
      adapter.name.toLowerCase().includes(q) ||
      adapter.description.toLowerCase().includes(q)
    )
  })
}

function groupAdapters(adapters: AdapterMeta[]): Array<{ category: AdapterCategory; items: AdapterMeta[] }> {
  const map = new Map<AdapterCategory, AdapterMeta[]>()
  for (const adapter of adapters) {
    if (!map.has(adapter.category)) map.set(adapter.category, [])
    map.get(adapter.category)!.push(adapter)
  }

  return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((category) => ({
    category,
    items: map.get(category)!.sort((a, b) => a.name.localeCompare(b.name))
  }))
}

interface AdapterFilterProps {
  adapters: AdapterMeta[]
  connections: MiddlewareConnection[]
  filterType: string
  onFilterTypeChange: (type: string) => void
}

export function AdapterFilter({
  adapters,
  connections,
  filterType,
  onFilterTypeChange
}: AdapterFilterProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AdapterCategory | ''>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const connectionCountByType = useMemo(() => {
    const counts = new Map<string, number>()
    for (const conn of connections) {
      counts.set(conn.type, (counts.get(conn.type) ?? 0) + 1)
    }
    return counts
  }, [connections])

  const quickTypes = useMemo(() => {
    return adapters
      .filter((a) => (connectionCountByType.get(a.type) ?? 0) > 0)
      .sort((a, b) => {
        const diff = (connectionCountByType.get(b.type) ?? 0) - (connectionCountByType.get(a.type) ?? 0)
        return diff !== 0 ? diff : a.name.localeCompare(b.name)
      })
  }, [adapters, connectionCountByType])

  const filteredAdapters = useMemo(
    () => filterAdapters(adapters, { query, category }),
    [adapters, query, category]
  )

  const grouped = useMemo(() => groupAdapters(filteredAdapters), [filteredAdapters])

  const selectedAdapter = adapters.find((a) => a.type === filterType)
  const triggerLabel = selectedAdapter ? `${selectedAdapter.name}` : '全部中间件'

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const pickType = (type: string) => {
    onFilterTypeChange(type)
    setMenuOpen(false)
  }

  return (
    <section className="adapter-filter" aria-label="中间件筛选">
      <div className="adapter-filter-toolbar">
        <label className="adapter-filter-search">
          <span className="sr-only">搜索中间件</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索类型、名称…"
            onFocus={() => setMenuOpen(true)}
          />
        </label>

        <label className="adapter-filter-category">
          <span className="adapter-filter-field-label">分类</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as AdapterCategory | '')
              setMenuOpen(true)
            }}
          >
            <option value="">全部</option>
            {CATEGORY_ORDER.map((cat) => (
              <option key={cat} value={cat}>
                {ADAPTER_CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </label>

        <div className="adapter-filter-picker" ref={rootRef}>
          <span className="adapter-filter-field-label">类型</span>
          <button
            type="button"
            className={`adapter-filter-trigger ${menuOpen ? 'is-open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="adapter-filter-trigger-main">
              {filterType ? (
                <code className="adapter-filter-trigger-type">{filterType}</code>
              ) : null}
              <span>{triggerLabel}</span>
            </span>
            <span className="adapter-filter-trigger-meta">
              {filteredAdapters.length}/{adapters.length}
            </span>
          </button>

          {menuOpen && (
            <div className="adapter-filter-menu" role="listbox" aria-label="中间件类型">
              <button
                type="button"
                role="option"
                aria-selected={!filterType}
                className={`adapter-filter-option ${!filterType ? 'is-active' : ''}`}
                onClick={() => pickType('')}
              >
                <span className="adapter-filter-option-name">全部中间件</span>
                <span className="adapter-filter-option-meta">{connections.length} 条连接</span>
              </button>

              {grouped.length === 0 ? (
                <div className="adapter-filter-empty">无匹配类型</div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} className="adapter-filter-group">
                    <div className="adapter-filter-group-label">{ADAPTER_CATEGORY_LABELS[group.category]}</div>
                    {group.items.map((adapter) => {
                      const count = connectionCountByType.get(adapter.type) ?? 0
                      const operational = isAdapterOperational(adapter)
                      return (
                        <button
                          key={adapter.type}
                          type="button"
                          role="option"
                          aria-selected={filterType === adapter.type}
                          className={`adapter-filter-option ${filterType === adapter.type ? 'is-active' : ''} ${!operational ? 'is-planned' : ''}`}
                          onClick={() => pickType(adapter.type)}
                          title={adapter.description}
                        >
                          <span className="adapter-filter-option-main">
                            <code className="adapter-filter-option-type">{adapter.type}</code>
                            <span className="adapter-filter-option-name">{adapter.name}</span>
                          </span>
                          <span className="adapter-filter-option-meta">
                            {!operational ? ADAPTER_STATUS_LABELS[adapter.status] : count > 0 ? `${count} 条` : '—'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {quickTypes.length > 0 && (
        <div className="adapter-filter-quick" aria-label="已配置类型快捷筛选">
          <span className="adapter-filter-quick-label">已配置</span>
          <button
            type="button"
            className={`adapter-filter-chip ${!filterType ? 'is-active' : ''}`}
            onClick={() => onFilterTypeChange('')}
          >
            全部
          </button>
          {quickTypes.map((adapter) => (
            <button
              key={adapter.type}
              type="button"
              className={`adapter-filter-chip ${filterType === adapter.type ? 'is-active' : ''}`}
              onClick={() => onFilterTypeChange(adapter.type)}
              title={adapter.name}
            >
              <code>{adapter.type}</code>
              <span>{connectionCountByType.get(adapter.type)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

interface AdapterTypeSelectProps {
  adapters: AdapterMeta[]
  selectedType: string
  onSelect: (type: string) => void
}

export function AdapterTypeSelect({ adapters, selectedType, onSelect }: AdapterTypeSelectProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AdapterCategory | ''>('')
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const filteredAdapters = useMemo(
    () => filterAdapters(adapters, { query, category }),
    [adapters, query, category]
  )
  const grouped = useMemo(() => groupAdapters(filteredAdapters), [filteredAdapters])
  const selected = adapters.find((a) => a.type === selectedType)

  useEffect(() => {
    if (!menuOpen) return

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const pick = (adapter: AdapterMeta) => {
    if (!isAdapterOperational(adapter)) return
    onSelect(adapter.type)
    setMenuOpen(false)
  }

  return (
    <div className="adapter-type-select" ref={rootRef}>
      <div className="adapter-type-select-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索中间件类型…"
          onFocus={() => setMenuOpen(true)}
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as AdapterCategory | '')
            setMenuOpen(true)
          }}
        >
          <option value="">全部分类</option>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>
              {ADAPTER_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={`adapter-type-select-trigger ${menuOpen ? 'is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {selected ? (
          <>
            <code>{selected.type}</code>
            <span>{selected.name}</span>
            {!isAdapterOperational(selected) && (
              <span className="adapter-type-select-badge">{ADAPTER_STATUS_LABELS[selected.status]}</span>
            )}
          </>
        ) : (
          <span>选择中间件类型</span>
        )}
      </button>

      {menuOpen && (
        <div className="adapter-filter-menu adapter-type-select-menu" role="listbox">
          {grouped.length === 0 ? (
            <div className="adapter-filter-empty">无匹配类型</div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="adapter-filter-group">
                <div className="adapter-filter-group-label">{ADAPTER_CATEGORY_LABELS[group.category]}</div>
                {group.items.map((adapter) => {
                  const operational = isAdapterOperational(adapter)
                  return (
                    <button
                      key={adapter.type}
                      type="button"
                      role="option"
                      aria-selected={selectedType === adapter.type}
                      disabled={!operational}
                      className={`adapter-filter-option ${selectedType === adapter.type ? 'is-active' : ''} ${!operational ? 'is-planned' : ''}`}
                      onClick={() => pick(adapter)}
                      title={adapter.description}
                    >
                      <span className="adapter-filter-option-main">
                        <code className="adapter-filter-option-type">{adapter.type}</code>
                        <span className="adapter-filter-option-name">{adapter.name}</span>
                      </span>
                      {!operational && (
                        <span className="adapter-filter-option-meta">{ADAPTER_STATUS_LABELS[adapter.status]}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
