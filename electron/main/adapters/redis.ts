import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const REDIS_META: AdapterMeta = {
  type: 'redis',
  name: 'Redis',
  description: 'Redis 键值、Hash、Stream、JSON 等操作（基于官方 redis/mcp-redis）',
  category: 'cache',
  status: 'available',
  icon: '⚡',
  docsUrl: 'https://github.com/redis/mcp-redis',
  tools: [
    'redis_list_connections',
    'redis_get',
    'redis_set',
    'redis_scan_keys',
    'redis_info',
    'redis_dbsize'
  ],
  previewField: 'host',
  connectionFields: [
    {
      key: 'host',
      label: 'Host',
      type: 'text',
      required: true,
      placeholder: '127.0.0.1',
      defaultValue: '127.0.0.1',
      group: '连接'
    },
    {
      key: 'port',
      label: 'Port',
      type: 'number',
      defaultValue: '6379',
      group: '连接'
    },
    {
      key: 'db',
      label: 'DB Index',
      type: 'number',
      defaultValue: '0',
      group: '连接'
    },
    {
      key: 'username',
      label: '用户名',
      type: 'text',
      placeholder: 'Redis ACL 用户名（可选）',
      group: '认证'
    },
    {
      key: 'password',
      label: 'Password',
      type: 'password',
      group: '认证'
    },
    {
      key: 'ssl',
      label: '启用 SSL/TLS',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否', value: 'no' },
        { label: '是（rediss://）', value: 'yes' }
      ],
      group: '高级'
    },
    {
      key: 'sslCaPath',
      label: 'CA 证书路径',
      type: 'text',
      placeholder: 'SSL 验证时填写 CA 证书绝对路径',
      group: '高级'
    },
    {
      key: 'clusterMode',
      label: 'Cluster 模式',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '高级'
    }
  ]
}

export const redisAdapter = defineConnectionAdapter({
  meta: REDIS_META,
  validateConnection(config) {
    if (!config.host?.trim()) return 'Host 不能为空'

    const port = config.port?.trim()
    if (port) {
      const portNum = Number(port)
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        return 'Port 应为 1–65535 的整数'
      }
    }

    const db = config.db?.trim()
    if (db) {
      const dbNum = Number(db)
      if (!Number.isInteger(dbNum) || dbNum < 0) {
        return 'DB Index 应为非负整数'
      }
    }

    return null
  }
})
