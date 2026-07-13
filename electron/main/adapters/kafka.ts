import { definePlannedAdapter } from './base'
import type { AdapterMeta } from '../../../shared/types'

const KAFKA_META: AdapterMeta = {
  type: 'kafka',
  name: 'Apache Kafka',
  description: 'Kafka 主题与消息查询',
  category: 'messaging',
  status: 'planned',
  icon: '📨',
  docsUrl: 'https://github.com/gAmUssA/mcp-kafka',
  tools: ['kafka_list_topics', 'kafka_consume'],
  previewField: 'bootstrapServers',
  connectionFields: [
    {
      key: 'bootstrapServers',
      label: 'Bootstrap Servers',
      type: 'text',
      required: true,
      placeholder: 'localhost:9092',
      group: '连接'
    },
    {
      key: 'saslUsername',
      label: 'SASL Username',
      type: 'text',
      group: '认证'
    },
    {
      key: 'saslPassword',
      label: 'SASL Password',
      type: 'password',
      group: '认证'
    }
  ]
}

export const kafkaAdapter = definePlannedAdapter(KAFKA_META)
