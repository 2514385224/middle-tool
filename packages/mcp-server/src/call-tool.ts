import {
  getElasticsearchCredentials,
  getLokiCredentials,
  getMysqlCredentials,
  getMongodbCredentials,
  getRedisCredentials,
  getRocketmqCredentials,
  listElasticsearchConnectionSummaries,
  listMongodbConnectionSummaries,
  listMysqlConnectionSummaries,
  listRedisConnectionSummaries,
  listRocketmqConnectionSummaries,
  readAppData,
  resolveConnection,
  resolveTypedConnection
} from './config-reader.js'
import {
  esClusterHealth,
  esGetIndex,
  esListIndices,
  esSearch
} from './elasticsearch-client.js'
import {
  mongoAggregate,
  mongoFind,
  mongoListCollections,
  mongoListDatabases
} from './mongodb-client.js'
import { lokiLabelNames, lokiLabelValues, lokiQueryRange } from './loki-client.js'
import { executeQuery, listTableColumns, listTables } from './mysql-client.js'
import {
  callUpstreamTool,
  extractConnectionArgs,
  getUpstreamRequirementHint,
  isRedisProxiedTool
} from './redis-proxy.js'
import * as rocketmq from './rocketmq-admin-client.js'
import { assertMcpWriteAllowed } from './tool-policy.js'

type ToolResult = {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>
  isError?: boolean
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError }
}

function summaryPayload(
  summary: { total: number; default_connection_id: string | null; connections: unknown[] },
  type: string
) {
  return {
    ...summary,
    hint:
      summary.default_connection_id
        ? `仅有一条 ${type} 连接，后续工具可省略 connection 参数，或直接使用 default_connection_id`
        : `存在多条 ${type} 连接，请传入 connection_id（推荐）或 connection_name`
  }
}

export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const data = readAppData()
  assertMcpWriteAllowed(name, data.settings, args)

  switch (name) {
    case 'middle_list_environments':
      return textResult(
        JSON.stringify(
          data.environments.map((e) => ({ id: e.id, name: e.name, description: e.description })),
          null,
          2
        )
      )

    case 'middle_list_connections': {
      const enabledOnly = args.enabled_only !== false
      const envFilter = args.environment as string | undefined
      const typeFilter = args.type as string | undefined
      const envId = envFilter ? data.environments.find((e) => e.name === envFilter)?.id : undefined

      const list = data.connections
        .filter((c) => {
          if (enabledOnly && !c.enabled) return false
          if (typeFilter && c.type !== typeFilter) return false
          if (envId && c.environmentId !== envId) return false
          return true
        })
        .map((c) => {
          const env = data.environments.find((e) => e.id === c.environmentId)
          const base = {
            id: c.id,
            name: c.name,
            type: c.type,
            environment: env?.name,
            enabled: c.enabled,
            preview: c.config.url ?? c.config.namesrvAddr ?? c.config.host ?? c.config.database
          }
          if (c.type === 'rocketmq') {
            return {
              ...base,
              namesrvAddr: c.config.namesrvAddr,
              enableAcl: c.config.enableAcl === 'yes',
              clusterName: c.config.clusterName?.trim() || undefined
            }
          }
          return base
        })
      return textResult(JSON.stringify(list, null, 2))
    }

    case 'loki_query': {
      if (!args.query) throw new Error('query 参数必填')
      const { connection } = resolveTypedConnection(data, args, 'loki', () => ({
        default_connection_id: null
      }))
      if (connection.type !== 'loki') throw new Error('连接类型不是 loki')
      const creds = getLokiCredentials(connection)
      const text = await lokiQueryRange(creds, args.query as string, {
        start: args.start as string | undefined,
        end: args.end as string | undefined,
        limit: args.limit as number | undefined
      })
      return textResult(text)
    }

    case 'loki_label_names': {
      const { connection } = resolveConnection(data, {
        connectionId: args.connection_id as string | undefined,
        connectionName: args.connection_name as string | undefined,
        environmentName: args.environment as string | undefined,
        type: 'loki'
      })
      const creds = getLokiCredentials(connection)
      return textResult(await lokiLabelNames(creds, args.start as string | undefined, args.end as string | undefined))
    }

    case 'loki_label_values': {
      if (!args.label) throw new Error('label 参数必填')
      const { connection } = resolveConnection(data, {
        connectionId: args.connection_id as string | undefined,
        connectionName: args.connection_name as string | undefined,
        environmentName: args.environment as string | undefined,
        type: 'loki'
      })
      const creds = getLokiCredentials(connection)
      return textResult(
        await lokiLabelValues(
          creds,
          args.label as string,
          args.start as string | undefined,
          args.end as string | undefined
        )
      )
    }

    case 'mysql_list_connections':
      return textResult(
        JSON.stringify(
          summaryPayload(
            listMysqlConnectionSummaries(data, {
              enabledOnly: args.enabled_only !== false,
              environmentName: args.environment as string | undefined
            }),
            'MySQL'
          ),
          null,
          2
        )
      )

    case 'mysql_query': {
      if (!args.sql) throw new Error('sql 参数必填')
      const { connection } = resolveTypedConnection(data, args, 'mysql', listMysqlConnectionSummaries)
      return textResult(await executeQuery(getMysqlCredentials(connection), args.sql as string))
    }

    case 'mysql_list_tables': {
      const { connection } = resolveTypedConnection(data, args, 'mysql', listMysqlConnectionSummaries)
      return textResult(await listTables(getMysqlCredentials(connection)))
    }

    case 'mysql_table_columns': {
      if (!args.table) throw new Error('table 参数必填')
      const { connection } = resolveTypedConnection(data, args, 'mysql', listMysqlConnectionSummaries)
      return textResult(
        await listTableColumns(
          getMysqlCredentials(connection),
          args.table as string,
          args.database as string | undefined
        )
      )
    }

    case 'redis_list_connections':
      return textResult(
        JSON.stringify(
          {
            ...summaryPayload(
              listRedisConnectionSummaries(data, {
                enabledOnly: args.enabled_only !== false,
                environmentName: args.environment as string | undefined
              }),
              'Redis'
            ),
            upstream: 'redis/mcp-redis'
          },
          null,
          2
        )
      )

    case 'rocketmq_list_connections':
      return textResult(
        JSON.stringify(
          summaryPayload(
            listRocketmqConnectionSummaries(data, {
              enabledOnly: args.enabled_only !== false,
              environmentName: args.environment as string | undefined
            }),
            'RocketMQ'
          ),
          null,
          2
        )
      )

    case 'elasticsearch_list_connections':
      return textResult(
        JSON.stringify(
          summaryPayload(
            listElasticsearchConnectionSummaries(data, {
              enabledOnly: args.enabled_only !== false,
              environmentName: args.environment as string | undefined
            }),
            'Elasticsearch'
          ),
          null,
          2
        )
      )

    case 'elasticsearch_list_indices': {
      const { connection } = resolveTypedConnection(
        data,
        args,
        'elasticsearch',
        listElasticsearchConnectionSummaries
      )
      return textResult(await esListIndices(getElasticsearchCredentials(connection)))
    }

    case 'elasticsearch_cluster_health': {
      const { connection } = resolveTypedConnection(
        data,
        args,
        'elasticsearch',
        listElasticsearchConnectionSummaries
      )
      return textResult(await esClusterHealth(getElasticsearchCredentials(connection)))
    }

    case 'elasticsearch_get_index': {
      if (!args.index) throw new Error('index 参数必填')
      const { connection } = resolveTypedConnection(
        data,
        args,
        'elasticsearch',
        listElasticsearchConnectionSummaries
      )
      return textResult(
        await esGetIndex(getElasticsearchCredentials(connection), args.index as string)
      )
    }

    case 'elasticsearch_search': {
      if (!args.index) throw new Error('index 参数必填')
      const { connection } = resolveTypedConnection(
        data,
        args,
        'elasticsearch',
        listElasticsearchConnectionSummaries
      )
      return textResult(
        await esSearch(getElasticsearchCredentials(connection), {
          index: args.index as string,
          queryString: args.query_string as string | undefined,
          body: args.body as Record<string, unknown> | undefined,
          size: args.size as number | undefined,
          from: args.from as number | undefined,
          sort: args.sort
        })
      )
    }

    case 'mongodb_list_connections':
      return textResult(
        JSON.stringify(
          summaryPayload(
            listMongodbConnectionSummaries(data, {
              enabledOnly: args.enabled_only !== false,
              environmentName: args.environment as string | undefined
            }),
            'MongoDB'
          ),
          null,
          2
        )
      )

    case 'mongodb_list_databases': {
      const { connection } = resolveTypedConnection(data, args, 'mongodb', listMongodbConnectionSummaries)
      return textResult(await mongoListDatabases(getMongodbCredentials(connection)))
    }

    case 'mongodb_list_collections': {
      const { connection } = resolveTypedConnection(data, args, 'mongodb', listMongodbConnectionSummaries)
      return textResult(
        await mongoListCollections(
          getMongodbCredentials(connection),
          args.database as string | undefined
        )
      )
    }

    case 'mongodb_find': {
      if (!args.collection) throw new Error('collection 参数必填')
      const { connection } = resolveTypedConnection(data, args, 'mongodb', listMongodbConnectionSummaries)
      return textResult(
        await mongoFind(getMongodbCredentials(connection), {
          database: args.database as string | undefined,
          collection: args.collection as string,
          filter: args.filter as Record<string, unknown> | undefined,
          projection: args.projection as Record<string, unknown> | undefined,
          sort: args.sort as Record<string, unknown> | undefined,
          limit: args.limit as number | undefined,
          skip: args.skip as number | undefined
        })
      )
    }

    case 'mongodb_aggregate': {
      if (!args.collection) throw new Error('collection 参数必填')
      if (!Array.isArray(args.pipeline)) throw new Error('pipeline 参数必填且需为数组')
      const { connection } = resolveTypedConnection(data, args, 'mongodb', listMongodbConnectionSummaries)
      return textResult(
        await mongoAggregate(getMongodbCredentials(connection), {
          database: args.database as string | undefined,
          collection: args.collection as string,
          pipeline: args.pipeline as unknown[]
        })
      )
    }
  }

  if (isRedisProxiedTool(name)) {
    const { connectionArgs, toolArgs } = extractConnectionArgs(args)
    const { connection } = resolveTypedConnection(data, connectionArgs, 'redis', listRedisConnectionSummaries)
    return callUpstreamTool(getRedisCredentials(connection), name, toolArgs)
  }

  const rocketmqCreds = () => {
    const { connection } = resolveTypedConnection(data, args, 'rocketmq', listRocketmqConnectionSummaries)
    return getRocketmqCredentials(connection)
  }

  switch (name) {
    case 'rocketmq_list_topics':
      return textResult(await rocketmq.listTopics(rocketmqCreds()))
    case 'rocketmq_topic_route': {
      if (!args.topic) throw new Error('topic 参数必填')
      return textResult(await rocketmq.topicRoute(rocketmqCreds(), args.topic as string))
    }
    case 'rocketmq_topic_stats': {
      if (!args.topic) throw new Error('topic 参数必填')
      return textResult(await rocketmq.topicStats(rocketmqCreds(), args.topic as string))
    }
    case 'rocketmq_query_message': {
      if (!args.topic || !args.msg_id) throw new Error('topic 与 msg_id 参数必填')
      return textResult(await rocketmq.viewMessage(rocketmqCreds(), args.topic as string, args.msg_id as string))
    }
    case 'rocketmq_query_message_by_key': {
      if (!args.topic || !args.key) throw new Error('topic 与 key 参数必填')
      return textResult(
        await rocketmq.queryMessageByKey(rocketmqCreds(), args.topic as string, args.key as string, {
          maxNum: args.max_num as number | undefined,
          begin: args.begin as number | undefined,
          end: args.end as number | undefined
        })
      )
    }
    case 'rocketmq_message_trace': {
      if (!args.topic || !args.msg_id) throw new Error('topic 与 msg_id 参数必填')
      return textResult(await rocketmq.messageTrace(rocketmqCreds(), args.topic as string, args.msg_id as string))
    }
    case 'rocketmq_cluster_list':
      return textResult(await rocketmq.clusterList(rocketmqCreds()))
    case 'rocketmq_broker_cluster_info':
      return textResult(await rocketmq.brokerClusterInfo(rocketmqCreds()))
    case 'rocketmq_broker_runtime_stats': {
      if (!args.broker_addr) throw new Error('broker_addr 参数必填')
      return textResult(await rocketmq.brokerRuntimeStats(rocketmqCreds(), args.broker_addr as string))
    }
    case 'rocketmq_consumer_info': {
      if (!args.consumer_group) throw new Error('consumer_group 参数必填')
      return textResult(await rocketmq.consumerInfo(rocketmqCreds(), args.consumer_group as string))
    }
    case 'rocketmq_consumer_status': {
      if (!args.topic || !args.consumer_group) throw new Error('topic 与 consumer_group 参数必填')
      return textResult(
        await rocketmq.consumerStatus(rocketmqCreds(), args.topic as string, args.consumer_group as string)
      )
    }
    case 'rocketmq_query_consumer_offset': {
      if (!args.consumer_group || !args.topic) throw new Error('consumer_group 与 topic 参数必填')
      return textResult(
        await rocketmq.queryConsumerOffset(
          rocketmqCreds(),
          args.consumer_group as string,
          args.topic as string,
          (args.queue_id as number) ?? 0
        )
      )
    }
    case 'rocketmq_producer_info': {
      if (!args.producer_group || !args.topic) throw new Error('producer_group 与 topic 参数必填')
      return textResult(
        await rocketmq.producerInfo(
          rocketmqCreds(),
          args.producer_group as string,
          args.topic as string
        )
      )
    }
    case 'rocketmq_producer_list':
      return textResult(await rocketmq.producerList(rocketmqCreds()))
    case 'rocketmq_examine_consume_queue': {
      if (!args.topic || !args.broker_addr) throw new Error('topic 与 broker_addr 参数必填')
      return textResult(
        await rocketmq.examineConsumeQueue(rocketmqCreds(), args.topic as string, args.broker_addr as string)
      )
    }
    default:
      throw new Error(`未知工具: ${name}`)
  }
}

export function formatToolError(err: unknown, toolName: string): ToolResult {
  const message = err instanceof Error ? err.message : String(err)
  const hint = toolName.startsWith('redis_') ? `\n\n${getUpstreamRequirementHint()}` : ''
  return textResult(`Error: ${message}${hint}`, true)
}
