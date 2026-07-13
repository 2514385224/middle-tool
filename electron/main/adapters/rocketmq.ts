import { defineConnectionAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const ROCKETMQ_META: AdapterMeta = {
  type: 'rocketmq',
  name: 'Apache RocketMQ',
  description: 'RocketMQ 主题/消息/集群管理（MiddleTool 内嵌托管 Admin 桥接）',
  category: 'messaging',
  status: 'available',
  icon: '🚀',
  docsUrl: 'https://github.com/francisoliverlee/rocketmq-mcp',
  tools: [
    'rocketmq_list_connections',
    'rocketmq_list_topics',
    'rocketmq_topic_route',
    'rocketmq_topic_stats',
    'rocketmq_query_message',
    'rocketmq_query_message_by_key',
    'rocketmq_message_trace',
    'rocketmq_cluster_list',
    'rocketmq_broker_cluster_info',
    'rocketmq_broker_runtime_stats',
    'rocketmq_consumer_info',
    'rocketmq_consumer_status',
    'rocketmq_query_consumer_offset',
    'rocketmq_producer_info',
    'rocketmq_producer_list',
    'rocketmq_examine_consume_queue'
  ],
  previewField: 'namesrvAddr',
  connectionFields: [
    {
      key: 'namesrvAddr',
      label: 'NameServer 地址',
      type: 'text',
      required: true,
      placeholder: '127.0.0.1:9876 或 127.0.0.1:9876;127.0.0.2:9876',
      defaultValue: '127.0.0.1:9876',
      group: '连接'
    },
    {
      key: 'enableAcl',
      label: '启用 ACL',
      type: 'select',
      defaultValue: 'no',
      options: [
        { label: '否（无认证）', value: 'no' },
        { label: '是（需 AK/SK）', value: 'yes' }
      ],
      group: '认证'
    },
    {
      key: 'accessKey',
      label: 'Access Key (AK)',
      type: 'text',
      placeholder: 'ACL 开启时填写',
      group: '认证'
    },
    {
      key: 'secretKey',
      label: 'Secret Key (SK)',
      type: 'password',
      placeholder: 'ACL 开启时填写',
      group: '认证'
    },
    {
      key: 'clusterName',
      label: '默认集群名',
      type: 'text',
      placeholder: '可选，部分管理命令需要',
      group: '高级'
    }
  ]
}

export const rocketmqAdapter = defineConnectionAdapter({
  meta: ROCKETMQ_META,
  validateConnection(config) {
    const namesrv = config.namesrvAddr?.trim()
    if (!namesrv) return 'NameServer 地址不能为空'

    const addrPattern = /^[\w.\-]+:\d+(?:[;,][\w.\-]+:\d+)*$/
    if (!addrPattern.test(namesrv)) {
      return 'NameServer 格式应为 host:port，多个地址用 ; 分隔'
    }

    if (config.enableAcl === 'yes') {
      if (!config.accessKey?.trim()) return '启用 ACL 时 Access Key 不能为空'
      if (!config.secretKey?.trim()) return '启用 ACL 时 Secret Key 不能为空'
    }

    return null
  }
})
