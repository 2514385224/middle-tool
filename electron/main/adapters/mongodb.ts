import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const MONGODB_META: AdapterMeta = {
  type: 'mongodb',
  name: 'MongoDB',
  description: 'MongoDB 文档查询与聚合（默认只读，兼容 mcp-mongo-server 能力）',
  category: 'database',
  status: 'available',
  icon: '🍃',
  docsUrl: 'https://github.com/kiliczsh/mcp-mongo-server',
  tools: [
    'mongodb_list_connections',
    'mongodb_list_databases',
    'mongodb_list_collections',
    'mongodb_find',
    'mongodb_aggregate'
  ],
  previewField: 'host',
  connectionFields: [
    {
      key: 'scheme',
      label: '连接协议',
      type: 'select',
      defaultValue: 'mongodb',
      options: [
        { label: 'mongodb', value: 'mongodb' },
        { label: 'mongodb+srv（Atlas）', value: 'mongodb+srv' }
      ],
      group: '连接'
    },
    {
      key: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      placeholder: '127.0.0.1 或 cluster.mongodb.net',
      defaultValue: '127.0.0.1',
      group: '连接'
    },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      defaultValue: '27017',
      group: '连接'
    },
    {
      key: 'user',
      label: '用户名',
      type: 'text',
      placeholder: '留空表示无认证',
      group: '认证'
    },
    {
      key: 'password',
      label: '密码',
      type: 'password',
      group: '认证'
    },
    {
      key: 'database',
      label: '默认数据库',
      type: 'text',
      placeholder: '如 app、admin',
      group: '连接'
    },
    {
      key: 'authSource',
      label: 'Auth Source',
      type: 'text',
      placeholder: '默认 admin',
      defaultValue: 'admin',
      group: '认证'
    },
    {
      key: 'allowInsert',
      label: '允许 INSERT',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（只读）', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '权限'
    },
    {
      key: 'allowUpdate',
      label: '允许 UPDATE',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（只读）', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '权限'
    },
    {
      key: 'allowDelete',
      label: '允许 DELETE',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（只读）', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '权限'
    }
  ]
}

export const mongodbAdapter = defineConnectionAdapter({
  meta: MONGODB_META,
  validateConnection(config) {
    if (!config.host?.trim()) return 'Host 不能为空'

    const port = config.port?.trim()
    if (port && config.scheme !== 'mongodb+srv') {
      const portNum = Number(port)
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        return 'Port 应为 1–65535 的整数'
      }
    }

    const hasUser = Boolean(config.user?.trim())
    const hasPass = Boolean(config.password?.trim())
    if (hasUser !== hasPass) {
      return '使用认证时需同时填写用户名与密码'
    }

    return null
  }
})
