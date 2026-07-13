import mysql from 'mysql2/promise'
import type { Pool, PoolOptions } from 'mysql2/promise'
import type { MysqlCredentials } from './config-reader.js'

const poolCache = new Map<string, Pool>()

const WRITE_PATTERNS: Record<string, RegExp> = {
  insert: /^\s*insert\b/i,
  update: /^\s*update\b/i,
  delete: /^\s*delete\b/i,
  ddl: /^\s*(create|drop|alter|truncate|rename)\b/i,
  replace: /^\s*replace\b/i
}

function poolKey(creds: MysqlCredentials): string {
  return JSON.stringify({
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    database: creds.database ?? '',
    ssl: creds.ssl
  })
}

function buildPoolOptions(creds: MysqlCredentials): PoolOptions {
  const options: PoolOptions = {
    host: creds.host,
    port: creds.port,
    user: creds.user,
    password: creds.password,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 10_000
  }

  if (creds.database) {
    options.database = creds.database
  }

  if (creds.ssl) {
    options.ssl = { rejectUnauthorized: false }
  }

  return options
}

export function getPool(creds: MysqlCredentials): Pool {
  const key = poolKey(creds)
  let pool = poolCache.get(key)
  if (!pool) {
    pool = mysql.createPool(buildPoolOptions(creds))
    poolCache.set(key, pool)
  }
  return pool
}

function assertWriteAllowed(sql: string, creds: MysqlCredentials): void {
  if (WRITE_PATTERNS.insert.test(sql) && !creds.allowInsert) {
    throw new Error('此连接禁止 INSERT，请在 MiddleTool 中启用 allowInsert')
  }
  if (WRITE_PATTERNS.update.test(sql) && !creds.allowUpdate) {
    throw new Error('此连接禁止 UPDATE，请在 MiddleTool 中启用 allowUpdate')
  }
  if (WRITE_PATTERNS.delete.test(sql) && !creds.allowDelete) {
    throw new Error('此连接禁止 DELETE，请在 MiddleTool 中启用 allowDelete')
  }
  if (WRITE_PATTERNS.ddl.test(sql)) {
    throw new Error('此连接禁止 DDL 操作（CREATE/DROP/ALTER 等）')
  }
  if (WRITE_PATTERNS.replace.test(sql) && !creds.allowInsert) {
    throw new Error('此连接禁止 REPLACE，请在 MiddleTool 中启用 allowInsert')
  }
}

function isReadOnly(creds: MysqlCredentials): boolean {
  return !(creds.allowInsert || creds.allowUpdate || creds.allowDelete)
}

export async function executeQuery(creds: MysqlCredentials, sql: string): Promise<string> {
  const trimmed = sql?.trim()
  if (!trimmed) throw new Error('sql 参数不能为空')

  assertWriteAllowed(trimmed, creds)

  const pool = getPool(creds)
  const conn = await pool.getConnection()
  try {
    if (isReadOnly(creds)) {
      await conn.query('SET SESSION TRANSACTION READ ONLY')
    }
    const [rows, fields] = await conn.query(trimmed)
    const payload = {
      rowCount: Array.isArray(rows) ? rows.length : 0,
      fields: Array.isArray(fields) ? fields.map((f) => f.name) : [],
      rows
    }
    return JSON.stringify(payload, null, 2)
  } finally {
    conn.release()
  }
}

export async function listTables(creds: MysqlCredentials): Promise<string> {
  const sql = `
    SELECT
      table_name AS name,
      table_schema AS \`database\`,
      table_comment AS description,
      table_rows AS rowCount,
      data_length AS dataSize,
      index_length AS indexSize,
      create_time AS createTime,
      update_time AS updateTime
    FROM information_schema.tables
    WHERE table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    ${creds.database ? 'AND table_schema = ?' : ''}
    ORDER BY table_schema, table_name
  `

  const pool = getPool(creds)
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.query(sql, creds.database ? [creds.database] : [])
    return JSON.stringify(rows, null, 2)
  } finally {
    conn.release()
  }
}

export async function listTableColumns(
  creds: MysqlCredentials,
  tableName: string,
  database?: string
): Promise<string> {
  let sql = `
    SELECT column_name, data_type, column_type, is_nullable, column_key, column_default, column_comment
    FROM information_schema.columns
    WHERE table_name = ?
  `
  const params: string[] = [tableName]

  const schema = database ?? creds.database
  if (schema) {
    sql += ' AND table_schema = ?'
    params.push(schema)
  }

  sql += ' ORDER BY ordinal_position'

  const pool = getPool(creds)
  const conn = await pool.getConnection()
  try {
    const [rows] = await conn.query(sql, params)
    return JSON.stringify(rows, null, 2)
  } finally {
    conn.release()
  }
}
