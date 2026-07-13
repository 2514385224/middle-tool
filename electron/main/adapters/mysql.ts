import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const MYSQL_META: AdapterMeta = {
  type: 'mysql',
  name: 'MySQL',
  description: 'MySQL 只读查询与表结构探查（基于 mcp-server-mysql 能力）',
  category: 'database',
  status: 'available',
  icon: '🐬',
  docsUrl: 'https://github.com/benborla/mcp-server-mysql',
  tools: ['mysql_list_connections', 'mysql_query', 'mysql_list_tables'],
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
      defaultValue: '3306',
      group: '连接'
    },
    {
      key: 'user',
      label: '用户名',
      type: 'text',
      required: true,
      defaultValue: 'root',
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
      label: '数据库',
      type: 'text',
      placeholder: '留空可跨库查询（需有权限）',
      group: '连接'
    },
    {
      key: 'ssl',
      label: '启用 SSL',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否', value: 'no' },
        { label: '是', value: 'yes' }
      ],
      group: '高级'
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

export const mysqlAdapter = defineConnectionAdapter({
  meta: MYSQL_META,
  validateConnection(config) {
    if (!config.host?.trim()) return 'Host 不能为空'
    if (!config.user?.trim()) return '用户名不能为空'

    const port = config.port?.trim()
    if (port) {
      const portNum = Number(port)
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        return 'Port 应为 1–65535 的整数'
      }
    }

    return null
  }
})
