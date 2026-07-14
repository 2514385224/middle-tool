export const connectionParams = {
  connection_id: {
    type: 'string' as const,
    description: 'MiddleTool 连接 ID（推荐，可通过 middle_list_connections 获取）'
  },
  connection_name: {
    type: 'string' as const,
    description: '连接名称（需配合 environment 使用）'
  },
  environment: {
    type: 'string' as const,
    description: '环境名称（与 connection_name 配合使用）'
  }
}

export const staticTools = [
  {
    name: 'middle_list_environments',
    description: '列出 MiddleTool 中配置的所有环境（dev/staging/prod 等）',
    inputSchema: { type: 'object' as const, properties: {} }
  },
  {
    name: 'middle_list_connections',
    description: '列出 MiddleTool 中已配置的中间件连接，可按类型或环境筛选',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: '中间件类型，如 loki、rocketmq、mysql、redis、elasticsearch、mongodb' },
        environment: { type: 'string', description: '环境名称筛选' },
        enabled_only: { type: 'boolean', description: '仅返回已启用的连接，默认 true' }
      }
    }
  },
  {
    name: 'loki_query',
    description: '使用 MiddleTool 已配置的 Loki 连接执行 LogQL 查询',
    inputSchema: {
      type: 'object' as const,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'LogQL 查询语句' },
        ...connectionParams,
        start: { type: 'string', description: '开始时间，如 -1h、now、ISO8601，默认 1h 前' },
        end: { type: 'string', description: '结束时间，默认 now' },
        limit: { type: 'number', description: '最大返回条数，默认 100' }
      }
    }
  },
  {
    name: 'loki_label_names',
    description: '获取 Loki 标签名列表',
    inputSchema: {
      type: 'object' as const,
      properties: { ...connectionParams, start: { type: 'string' }, end: { type: 'string' } }
    }
  },
  {
    name: 'loki_label_values',
    description: '获取 Loki 指定标签的值列表',
    inputSchema: {
      type: 'object' as const,
      required: ['label'],
      properties: {
        label: { type: 'string', description: '标签名' },
        ...connectionParams,
        start: { type: 'string' },
        end: { type: 'string' }
      }
    }
  },
  {
    name: 'mysql_list_connections',
    description: '列出 MiddleTool 中已配置的 MySQL 连接',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string' },
        enabled_only: { type: 'boolean', description: '默认 true' }
      }
    }
  },
  {
    name: 'mysql_query',
    description: '对 MiddleTool 已配置的 MySQL 连接执行 SQL（默认只读）',
    inputSchema: {
      type: 'object' as const,
      required: ['sql'],
      properties: { sql: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'mysql_list_tables',
    description: '列出 MySQL 数据库中的表及元信息',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'mysql_table_columns',
    description: '查询指定表的列定义',
    inputSchema: {
      type: 'object' as const,
      required: ['table'],
      properties: {
        table: { type: 'string' },
        database: { type: 'string' },
        ...connectionParams
      }
    }
  },
  {
    name: 'redis_list_connections',
    description: '列出 MiddleTool 中已配置的 Redis 连接',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string' },
        enabled_only: { type: 'boolean', description: '默认 true' }
      }
    }
  },
  {
    name: 'rocketmq_list_connections',
    description: '列出 MiddleTool 中已配置的 RocketMQ 连接',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string' },
        enabled_only: { type: 'boolean', description: '默认 true' }
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
    description: '查询 Topic 路由信息',
    inputSchema: {
      type: 'object' as const,
      required: ['topic'],
      properties: { topic: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_topic_stats',
    description: '查询 Topic 统计信息',
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
      properties: { topic: { type: 'string' }, msg_id: { type: 'string' }, ...connectionParams }
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
    description: '查询消息轨迹',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'msg_id'],
      properties: { topic: { type: 'string' }, msg_id: { type: 'string' }, ...connectionParams }
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
      properties: { broker_addr: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_consumer_info',
    description: '查询消费者组连接信息',
    inputSchema: {
      type: 'object' as const,
      required: ['consumer_group'],
      properties: { consumer_group: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_consumer_status',
    description: '查询消费者组消费状态与堆积',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'consumer_group'],
      properties: { topic: { type: 'string' }, consumer_group: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'rocketmq_query_consumer_offset',
    description: '查询消费者组消费偏移量',
    inputSchema: {
      type: 'object' as const,
      required: ['consumer_group', 'topic', 'queue_id'],
      properties: {
        consumer_group: { type: 'string' },
        topic: { type: 'string' },
        queue_id: { type: 'number' },
        ...connectionParams
      }
    }
  },
  {
    name: 'rocketmq_producer_info',
    description: '查询生产者组连接信息（需指定 topic）',
    inputSchema: {
      type: 'object' as const,
      required: ['producer_group', 'topic'],
      properties: {
        producer_group: { type: 'string' },
        topic: { type: 'string' },
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
    description: '查看 Topic 消费队列详情',
    inputSchema: {
      type: 'object' as const,
      required: ['topic', 'broker_addr'],
      properties: { topic: { type: 'string' }, broker_addr: { type: 'string' }, ...connectionParams }
    }
  },
  {
    name: 'elasticsearch_list_connections',
    description: '列出 MiddleTool 中已配置的 Elasticsearch / OpenSearch 连接',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string' },
        enabled_only: { type: 'boolean', description: '默认 true' }
      }
    }
  },
  {
    name: 'elasticsearch_list_indices',
    description: '列出 Elasticsearch 集群中的索引',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'elasticsearch_cluster_health',
    description: '获取 Elasticsearch 集群健康状态',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'elasticsearch_get_index',
    description: '获取索引的 mapping、settings 等信息',
    inputSchema: {
      type: 'object' as const,
      required: ['index'],
      properties: {
        index: { type: 'string', description: '索引名，支持通配符如 logs-*' },
        ...connectionParams
      }
    }
  },
  {
    name: 'elasticsearch_search',
    description: '在 Elasticsearch 索引中搜索文档（支持 Query DSL 或 query_string）',
    inputSchema: {
      type: 'object' as const,
      required: ['index'],
      properties: {
        index: { type: 'string', description: '索引名，如 logs-2024.01.01 或 logs-*' },
        query_string: { type: 'string', description: 'Lucene 查询语法，如 level:ERROR AND service:api' },
        body: {
          type: 'object',
          description: '完整 Elasticsearch Query DSL（与 query_string 二选一）'
        },
        size: { type: 'number', description: '返回条数，默认 20' },
        from: { type: 'number', description: '偏移量，默认 0' },
        sort: { description: '排序规则，如 [{ "@timestamp": "desc" }]' },
        ...connectionParams
      }
    }
  },
  {
    name: 'mongodb_list_connections',
    description: '列出 MiddleTool 中已配置的 MongoDB 连接',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string' },
        enabled_only: { type: 'boolean', description: '默认 true' }
      }
    }
  },
  {
    name: 'mongodb_list_databases',
    description: '列出 MongoDB 实例中的数据库',
    inputSchema: { type: 'object' as const, properties: { ...connectionParams } }
  },
  {
    name: 'mongodb_list_collections',
    description: '列出指定数据库中的集合',
    inputSchema: {
      type: 'object' as const,
      properties: {
        database: { type: 'string', description: '数据库名（可省略，使用连接默认库）' },
        ...connectionParams
      }
    }
  },
  {
    name: 'mongodb_find',
    description: '查询 MongoDB 集合文档（默认只读，limit 最大 100）',
    inputSchema: {
      type: 'object' as const,
      required: ['collection'],
      properties: {
        database: { type: 'string' },
        collection: { type: 'string' },
        filter: { type: 'object', description: 'MongoDB 查询过滤条件' },
        projection: { type: 'object', description: '字段投影' },
        sort: { type: 'object', description: '排序，如 { "createdAt": -1 }' },
        limit: { type: 'number', description: '默认 20，最大 100' },
        skip: { type: 'number', description: '跳过条数，默认 0' },
        ...connectionParams
      }
    }
  },
  {
    name: 'mongodb_aggregate',
    description: '执行 MongoDB 聚合管道（只读连接禁止 $out / $merge）',
    inputSchema: {
      type: 'object' as const,
      required: ['collection', 'pipeline'],
      properties: {
        database: { type: 'string' },
        collection: { type: 'string' },
        pipeline: {
          type: 'array',
          description: '聚合管道数组',
          items: { type: 'object' }
        },
        ...connectionParams
      }
    }
  }
]
