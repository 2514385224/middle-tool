import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const ELASTICSEARCH_META: AdapterMeta = {
  type: 'elasticsearch',
  name: 'Elasticsearch',
  description: '索引查询、文档搜索与集群健康检查（兼容 OpenSearch）',
  category: 'logging',
  status: 'available',
  icon: '🔍',
  docsUrl: 'https://github.com/cr7258/elasticsearch-mcp-server',
  tools: [
    'elasticsearch_list_connections',
    'elasticsearch_list_indices',
    'elasticsearch_search',
    'elasticsearch_cluster_health',
    'elasticsearch_get_index'
  ],
  previewField: 'url',
  connectionFields: [
    {
      key: 'url',
      label: '集群 URL',
      type: 'text',
      required: true,
      placeholder: 'https://localhost:9200',
      defaultValue: 'https://localhost:9200',
      group: '连接'
    },
    {
      key: 'engine',
      label: '引擎',
      type: 'select',
      defaultValue: 'elasticsearch',
      options: [
        { label: 'Elasticsearch', value: 'elasticsearch' },
        { label: 'OpenSearch', value: 'opensearch' }
      ],
      group: '连接'
    },
    {
      key: 'username',
      label: '用户名',
      type: 'text',
      placeholder: 'elastic / admin',
      group: '认证'
    },
    {
      key: 'password',
      label: '密码',
      type: 'password',
      group: '认证'
    },
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      placeholder: 'Elastic API Key（优先于用户名密码）',
      group: '认证'
    },
    {
      key: 'verifyCerts',
      label: '验证 TLS 证书',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（自签证书）', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '高级'
    }
  ]
}

export const elasticsearchAdapter = defineConnectionAdapter({
  meta: ELASTICSEARCH_META,
  validateConnection(config) {
    if (!config.url?.trim()) return '集群 URL 不能为空'

    const url = config.url.trim()
    if (!/^https?:\/\//i.test(url)) {
      return '集群 URL 需以 http:// 或 https:// 开头'
    }

    const hasApiKey = Boolean(config.apiKey?.trim())
    const hasBasic = Boolean(config.username?.trim() && config.password?.trim())
    const hasUserOnly = Boolean(config.username?.trim() && !config.password?.trim())
    const hasPassOnly = Boolean(!config.username?.trim() && config.password?.trim())

    if (hasUserOnly || hasPassOnly) {
      return '使用基本认证时需同时填写用户名与密码，或改用 API Key'
    }

    if (!hasApiKey && !hasBasic) {
      // 允许无认证集群（本地开发）
    }

    return null
  }
})
