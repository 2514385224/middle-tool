import type { AdapterMeta, ConnectionField } from '../../types'

export function groupFields(fields: ConnectionField[]): Map<string, ConnectionField[]> {
  const groups = new Map<string, ConnectionField[]>()
  for (const field of fields) {
    const g = field.group ?? '基本配置'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(field)
  }
  return groups
}

export function buildDefaultConfig(adapter: AdapterMeta): Record<string, string> {
  const config: Record<string, string> = {}
  adapter.connectionFields.forEach((f) => {
    if (f.defaultValue) config[f.key] = f.defaultValue
  })
  return config
}

export function getConnectionPreview(adapter: AdapterMeta | undefined, config: Record<string, string>): string | null {
  if (!adapter?.previewField) return null
  return config[adapter.previewField] || null
}
