#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import * as admin from './admin-client.js'
import {
  getDefaultConfigPath,
  getRocketmqCredentials,
  listRocketmqConnectionSummaries,
  readAppData,
  resolveConnection
} from './config-reader.js'

const SERVER_VERSION = '0.1.0'

const connectionParams = {
  connection_id: {
    type: 'string' as const,
    description: 'MiddleTool RocketMQ 连接 ID（推荐）'
  },
  connection_name: {
    type: 'string' as const,
    description: '连接名称（需配合 environment）'
  },
  environment: {
    type: 'string' as const,
    description: '环境名称'
  }
}

const tools = [
  {
    name: 'rocketmq_list_connections',
    description:
      '列出 MiddleTool 中已配置的 RocketMQ 连接（含环境、NameServer、默认集群）。仅一条连接时返回 default_connection_id 可直接用于后续工具。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string', description: '按环境名称筛选' },
        enabled_only: { type: 'boolean', description: '仅返回已启用连接，默认 true' }
      }
    }
  },
  {
    name: 'rocketmq_list_topics',
    description: '获取 RocketMQ 集群 Topic 列表',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'rocketmq_topic_route',
    description: '查询 Topic 路由信息（Broker、队列分布）',
    inputSchema: {
      type: 'object' as const,
      required: ['topic'],
      properties: { topic: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_topic_stats',
    description: '查询 Topic 统计信息（生产/消费 TPS、偏移量等）',
    inputSchema: {
      type: 'object' as const,
      required: ['topic'],
      properties: { topic: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_query_message',
    description: '按消息 ID 查询消息详情',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'msg_id'],
      properties: {
        topic: { type: 'string' },
        msg_id: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_query_message_by_key',
    description: '按消息 Key 查询消息',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'key'],
      properties: {
        topic: { type: 'string' },
        key: { type: 'string' },
        max_num: { type: 'number' },
        begin: { type: 'number' },
        end: { type: 'number' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_message_trace',
    description: '查询消息轨迹（生产/消费路径）',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'msg_id'],
      properties: {
        topic: { type: 'string' },
        msg_id: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_cluster_list',
    description: '获取集群列表',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'rocketmq_broker_cluster_info',
    description: '获取 Broker 集群拓扑信息',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'rocketmq_broker_runtime_stats',
    description: '获取指定 Broker 运行时统计',
    inputSchema: {
      type: 'object' as const,
      required: ['broker_addr'],
      properties: {
        broker_addr: { type: 'string', description: 'Broker 地址，如 127.0.0.1:10911' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_consumer_info',
    description: '查询消费者组连接信息',
    inputSchema: {
      type: 'object' as const,
      required: ['consumer_group'],
      properties: {
        consumer_group: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_consumer_status',
    description: '查询消费者组在指定 Topic 上的消费状态与堆积',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'consumer_group'],
      properties: {
        topic: { type: 'string' },
        consumer_group: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_query_consumer_offset',
    description: '查询消费者组在指定队列的消费偏移量',
    inputSchema: {
      type: 'object' as const,
      required: ['consumer_group', 'topic', 'queue_id'],
      properties: {
        consumer_group: { type: 'string' },
        topic: { type: 'string' },
        queue_id: { type: 'number', description: '队列 ID，默认 0' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_producer_info',
    description: '查询生产者组连接信息',
    inputSchema: {
      type: 'object' as const,
      required: ['producer_group'],
      properties: {
        producer_group: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_producer_list',
    description: '获取集群中的生产者列表',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'rocketmq_examine_consume_queue',
    description: '查看 Topic 在指定 Broker 上的消费队列详情',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'broker_addr'],
      properties: {
        topic: { type: 'string' },
        broker_addr: { type: 'string' },
        ...connectionParams
      }
    }
  }
]

function resolveFromArgs(args: Record<string, unknown>) {
  const data = readAppData()
  let connectionId = args.connection_id as string | undefined
  const connectionName = args.connection_name as string | undefined
  const environmentName = args.environment as string | undefined

  if (!connectionId && !connectionName) {
    const { default_connection_id } = listRocketmqConnectionSummaries(data)
    if (default_connection_id) connectionId = default_connection_id
  }

  return resolveConnection(data, {
    connectionId,
    connectionName,
    environmentName,
    type: 'rocketmq'
  })
}

function credsFromArgs(args: Record<string, unknown>) {
  const { connection } = resolveFromArgs(args)
  return getRocketmqCredentials(connection)
}

async function main() {
  const server = new Server(
    { name: 'middle-tool-rocketmq-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const a = args as Record<string, unknown>

    try {
      switch (name) {
        case 'rocketmq_list_connections': {
          const data = readAppData()
          const summary = listRocketmqConnectionSummaries(data, {
            enabledOnly: a.enabled_only !== false,
            environmentName: a.environment as string | undefined
          })
          const payload = {
            ...summary,
            hint:
              summary.default_connection_id
                ? '仅有一条连接，后续 rocketmq_* 工具可省略 connection 参数，或直接使用 default_connection_id'
                : '存在多条连接，后续 rocketmq_* 工具请传入 connection_id（推荐）或 connection_name'
          }
          return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
        }

        case 'rocketmq_list_topics':
          return { content: [{ type: 'text', text: await admin.listTopics(credsFromArgs(a)) }] }
        case 'rocketmq_topic_route': {
          if (!a.topic) throw new Error('topic 参数必填')
          return {
            content: [{ type: 'text', text: await admin.topicRoute(credsFromArgs(a), a.topic as string) }]
          }
        }
        case 'rocketmq_topic_stats': {
          if (!a.topic) throw new Error('topic 参数必填')
          return {
            content: [{ type: 'text', text: await admin.topicStats(credsFromArgs(a), a.topic as string) }]
          }
        }
        case 'rocketmq_query_message': {
          if (!a.topic || !a.msg_id) throw new Error('topic 与 msg_id 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.viewMessage(credsFromArgs(a), a.topic as string, a.msg_id as string)
              }
            ]
          }
        }
        case 'rocketmq_query_message_by_key': {
          if (!a.topic || !a.key) throw new Error('topic 与 key 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.queryMessageByKey(credsFromArgs(a), a.topic as string, a.key as string, {
                  maxNum: a.max_num as number | undefined,
                  begin: a.begin as number | undefined,
                  end: a.end as number | undefined
                })
              }
            ]
          }
        }
        case 'rocketmq_message_trace': {
          if (!a.topic || !a.msg_id) throw new Error('topic 与 msg_id 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.messageTrace(credsFromArgs(a), a.topic as string, a.msg_id as string)
              }
            ]
          }
        }
        case 'rocketmq_cluster_list':
          return { content: [{ type: 'text', text: await admin.clusterList(credsFromArgs(a)) }] }
        case 'rocketmq_broker_cluster_info':
          return { content: [{ type: 'text', text: await admin.brokerClusterInfo(credsFromArgs(a)) }] }
        case 'rocketmq_broker_runtime_stats': {
          if (!a.broker_addr) throw new Error('broker_addr 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.brokerRuntimeStats(credsFromArgs(a), a.broker_addr as string)
              }
            ]
          }
        }
        case 'rocketmq_consumer_info': {
          if (!a.consumer_group) throw new Error('consumer_group 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.consumerInfo(credsFromArgs(a), a.consumer_group as string)
              }
            ]
          }
        }
        case 'rocketmq_consumer_status': {
          if (!a.topic || !a.consumer_group) throw new Error('topic 与 consumer_group 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.consumerStatus(
                  credsFromArgs(a),
                  a.topic as string,
                  a.consumer_group as string
                )
              }
            ]
          }
        }
        case 'rocketmq_query_consumer_offset': {
          if (!a.consumer_group || !a.topic) throw new Error('consumer_group 与 topic 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.queryConsumerOffset(
                  credsFromArgs(a),
                  a.consumer_group as string,
                  a.topic as string,
                  (a.queue_id as number) ?? 0
                )
              }
            ]
          }
        }
        case 'rocketmq_producer_info': {
          if (!a.producer_group || !a.topic) throw new Error('producer_group 与 topic 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.producerInfo(
                  credsFromArgs(a),
                  a.producer_group as string,
                  a.topic as string
                )
              }
            ]
          }
        }
        case 'rocketmq_producer_list':
          return { content: [{ type: 'text', text: await admin.producerList(credsFromArgs(a)) }] }
        case 'rocketmq_examine_consume_queue': {
          if (!a.topic || !a.broker_addr) throw new Error('topic 与 broker_addr 参数必填')
          return {
            content: [
              {
                type: 'text',
                text: await admin.examineConsumeQueue(
                  credsFromArgs(a),
                  a.topic as string,
                  a.broker_addr as string
                )
              }
            ]
          }
        }
        default:
          throw new Error(`未知工具: ${name}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`RocketMQ MCP Server v${SERVER_VERSION} started`)
  console.error(`Config: ${getDefaultConfigPath()}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
