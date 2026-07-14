const MYSQL_WRITE_SQL =
  /^\s*(insert|update|delete|replace|create|drop|alter|truncate|rename)\b/i

/** 明确注册的写工具（MiddleTool 静态工具） */
const STATIC_WRITE_TOOLS = new Set<string>(['redis_set'])

/** Redis 上游只读工具（去掉 redis_ 前缀后的名称） */
const REDIS_READ_TOOLS = new Set([
  'get',
  'mget',
  'scan',
  'scan_keys',
  'keys',
  'info',
  'dbsize',
  'ttl',
  'pttl',
  'type',
  'exists',
  'strlen',
  'hget',
  'hgetall',
  'hmget',
  'hkeys',
  'hvals',
  'hlen',
  'hexists',
  'llen',
  'lrange',
  'lindex',
  'smembers',
  'scard',
  'sismember',
  'srandmember',
  'zrange',
  'zrevrange',
  'zrangebyscore',
  'zrevrangebyscore',
  'zscore',
  'zrank',
  'zrevrank',
  'zcard',
  'xrange',
  'xrevrange',
  'xlen',
  'xinfo_stream',
  'xinfo_groups',
  'xinfo_consumers',
  'xpending',
  'ping',
  'echo',
  'time',
  'memory_usage',
  'object',
  'randomkey',
  'bitcount',
  'bitpos',
  'geopos',
  'geodist',
  'geohash',
  'georadius_ro',
  'georadiusbymember_ro'
])

/** Redis 上游写操作名称前缀/精确匹配 */
const REDIS_WRITE_PATTERN =
  /^(set|mset|setnx|setex|psetex|del|unlink|expire|expireat|persist|pexpire|pexpireat|incr|incrby|incrbyfloat|decr|decrby|append|getset|getdel|hset|hsetnx|hmset|hdel|hincrby|hincrbyfloat|lpush|rpush|lpop|rpop|lrem|lset|linsert|ltrim|blmove|sadd|srem|spop|smove|zadd|zincrby|zrem|zremrangebyrank|zremrangebyscore|zpopmin|zpopmax|xadd|xdel|xtrim|xgroup|xack|xclaim|flushdb|flushall|rename|renamenx|move|copy|json\.set|json\.del|json\.mset|eval|evalsha|script|publish|spublish|migrate|restore|sort_store)/i

export function isMysqlWriteSql(sql: string): boolean {
  return MYSQL_WRITE_SQL.test(sql.trim())
}

export function hasMongoWriteStages(pipeline: unknown): boolean {
  if (!Array.isArray(pipeline)) return false
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object' || Array.isArray(stage)) continue
    for (const key of Object.keys(stage as Record<string, unknown>)) {
      if (key === '$out' || key === '$merge') return true
    }
  }
  return false
}

function stripRedisPrefix(toolName: string): string {
  return toolName.startsWith('redis_') ? toolName.slice('redis_'.length) : toolName
}

export function isRedisWriteTool(toolName: string): boolean {
  if (toolName === 'redis_list_connections') return false
  if (!toolName.startsWith('redis_')) return false
  if (STATIC_WRITE_TOOLS.has(toolName)) return true

  const upstream = stripRedisPrefix(toolName)
  if (REDIS_READ_TOOLS.has(upstream)) return false
  if (REDIS_WRITE_PATTERN.test(upstream)) return true

  // 未知 Redis 工具保守视为写操作
  return true
}

export function isWriteTool(name: string, args?: Record<string, unknown>): boolean {
  if (STATIC_WRITE_TOOLS.has(name)) return true
  if (name === 'mysql_query' && typeof args?.sql === 'string') {
    return isMysqlWriteSql(args.sql)
  }
  if (name === 'mongodb_aggregate') {
    return hasMongoWriteStages(args?.pipeline)
  }
  if (isRedisWriteTool(name)) return true
  return false
}

export function isMcpWriteEnabled(
  settings?: Record<string, unknown> | { mcpWriteEnabled?: boolean } | null
): boolean {
  if (!settings || typeof settings !== 'object') return false
  return (settings as { mcpWriteEnabled?: boolean }).mcpWriteEnabled === true
}

export function assertMcpWriteAllowed(
  toolName: string,
  settings?: Record<string, unknown> | { mcpWriteEnabled?: boolean } | null,
  args?: Record<string, unknown>
): void {
  if (isMcpWriteEnabled(settings)) return
  if (!isWriteTool(toolName, args)) return

  throw new Error(
    `MCP 写操作已禁用（工具: ${toolName}）。请在 MiddleTool「MCP 配置」中开启「允许 MCP 写入」。`
  )
}

export function filterToolsByWritePolicy<T extends { name: string }>(
  tools: T[],
  settings?: Record<string, unknown> | { mcpWriteEnabled?: boolean } | null
): T[] {
  if (isMcpWriteEnabled(settings)) return tools
  return tools.filter((tool) => !isWriteTool(tool.name))
}
