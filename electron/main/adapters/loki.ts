import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const LOKI_META: AdapterMeta = {
  type: 'loki',
  name: 'Grafana Loki',
  description: '通过 LogQL 查询 Grafana Loki 日志',
  category: 'logging',
  status: 'available',
  icon: '📋',
  docsUrl: 'https://gitee.com/mirrors_grafana/loki-mcp',
  tools: ['loki_query', 'loki_label_names', 'loki_label_values'],
  previewField: 'url',
  connectionFields: [
    {
      key: 'url',
      label: 'Loki URL',
      type: 'text',
      required: true,
      placeholder: 'http://localhost:3100',
      defaultValue: 'http://localhost:3100',
      group: '连接'
    },
    {
      key: 'orgId',
      label: 'Org ID',
      type: 'text',
      placeholder: '多租户 X-Scope-OrgID',
      group: '连接'
    },
    {
      key: 'username',
      label: '用户名',
      type: 'text',
      group: '认证'
    },
    {
      key: 'password',
      label: '密码',
      type: 'password',
      group: '认证'
    },
    {
      key: 'token',
      label: 'Bearer Token',
      type: 'password',
      group: '认证'
    }
  ]
}

export const lokiAdapter = defineConnectionAdapter({
  meta: LOKI_META,
  validateConnection(config) {
    if (!config.url?.trim()) return 'Loki URL 不能为空'
    return null
  }
})
