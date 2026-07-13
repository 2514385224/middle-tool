import { MongoClient, type Document } from 'mongodb'

import type { MongodbCredentials } from './config-reader.js'

const clientCache = new Map<string, MongoClient>()

function credsKey(creds: MongodbCredentials): string {
  return JSON.stringify(creds)
}

export function buildMongodbUri(creds: MongodbCredentials): string {
  const scheme = creds.scheme
  const host = creds.host
  const auth =
    creds.user && creds.password
      ? `${encodeURIComponent(creds.user)}:${encodeURIComponent(creds.password)}@`
      : ''

  if (scheme === 'mongodb+srv') {
    const base = `${scheme}://${auth}${host}`
    const params = new URLSearchParams()
    if (creds.authSource) params.set('authSource', creds.authSource)
    const query = params.toString()
    return query ? `${base}/?${query}` : base
  }

  const port = creds.port
  const path = creds.database ? `/${encodeURIComponent(creds.database)}` : ''
  const base = `${scheme}://${auth}${host}:${port}${path}`
  const params = new URLSearchParams()
  if (creds.authSource && creds.user) params.set('authSource', creds.authSource)
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

async function getClient(creds: MongodbCredentials): Promise<MongoClient> {
  const key = credsKey(creds)
  let client = clientCache.get(key)
  if (!client) {
    client = new MongoClient(buildMongodbUri(creds), {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000
    })
    await client.connect()
    clientCache.set(key, client)
  }
  return client
}

function isReadOnly(creds: MongodbCredentials): boolean {
  return !(creds.allowInsert || creds.allowUpdate || creds.allowDelete)
}

function assertWriteAllowed(creds: MongodbCredentials, operation: 'insert' | 'update' | 'delete'): void {
  if (operation === 'insert' && !creds.allowInsert) {
    throw new Error('此连接禁止 INSERT，请在 MiddleTool 中启用 allowInsert')
  }
  if (operation === 'update' && !creds.allowUpdate) {
    throw new Error('此连接禁止 UPDATE，请在 MiddleTool 中启用 allowUpdate')
  }
  if (operation === 'delete' && !creds.allowDelete) {
    throw new Error('此连接禁止 DELETE，请在 MiddleTool 中启用 allowDelete')
  }
}

function assertReadOnlyAggregate(pipeline: unknown[]): void {
  const blocked = new Set(['$out', '$merge'])
  for (const stage of pipeline) {
    if (!stage || typeof stage !== 'object') continue
    for (const key of Object.keys(stage as Record<string, unknown>)) {
      if (blocked.has(key)) {
        throw new Error(`只读连接禁止使用聚合阶段 ${key}`)
      }
    }
  }
}

function resolveDatabase(creds: MongodbCredentials, database?: string): string {
  const db = database?.trim() || creds.database
  if (!db) throw new Error('请指定 database 参数，或在连接配置中设置默认数据库')
  return db
}

export async function mongoListDatabases(creds: MongodbCredentials): Promise<string> {
  const client = await getClient(creds)
  const result = await client.db().admin().listDatabases()
  const databases = result.databases.map((db) => ({
    name: db.name,
    sizeOnDisk: db.sizeOnDisk,
    empty: db.empty
  }))
  return JSON.stringify(databases, null, 2)
}

export async function mongoListCollections(
  creds: MongodbCredentials,
  database?: string
): Promise<string> {
  const dbName = resolveDatabase(creds, database)
  const client = await getClient(creds)
  const collections = await client.db(dbName).listCollections().toArray()
  return JSON.stringify(
    collections.map((c) => ({
      name: c.name,
      type: c.type
    })),
    null,
    2
  )
}

export async function mongoFind(
  creds: MongodbCredentials,
  opts: {
    database?: string
    collection: string
    filter?: Record<string, unknown>
    projection?: Record<string, unknown>
    sort?: Record<string, unknown>
    limit?: number
    skip?: number
  }
): Promise<string> {
  const dbName = resolveDatabase(creds, opts.database)
  const collection = opts.collection?.trim()
  if (!collection) throw new Error('collection 参数必填')

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100)
  const skip = Math.max(opts.skip ?? 0, 0)

  const client = await getClient(creds)
  let cursor = client
    .db(dbName)
    .collection(collection)
    .find((opts.filter ?? {}) as Document)

  if (opts.projection) cursor = cursor.project(opts.projection as Document)
  if (opts.sort) cursor = cursor.sort(opts.sort as Document)
  if (skip) cursor = cursor.skip(skip)

  const docs = await cursor.limit(limit).toArray()
  return JSON.stringify(
    {
      database: dbName,
      collection,
      count: docs.length,
      documents: docs
    },
    null,
    2
  )
}

export async function mongoAggregate(
  creds: MongodbCredentials,
  opts: {
    database?: string
    collection: string
    pipeline: unknown[]
  }
): Promise<string> {
  const dbName = resolveDatabase(creds, opts.database)
  const collection = opts.collection?.trim()
  if (!collection) throw new Error('collection 参数必填')
  if (!Array.isArray(opts.pipeline) || opts.pipeline.length === 0) {
    throw new Error('pipeline 参数必填且需为非空数组')
  }

  if (isReadOnly(creds)) {
    assertReadOnlyAggregate(opts.pipeline)
  } else {
    for (const stage of opts.pipeline) {
      if (!stage || typeof stage !== 'object') continue
      const keys = Object.keys(stage as Record<string, unknown>)
      if (keys.includes('$out') || keys.includes('$merge')) {
        assertWriteAllowed(creds, 'insert')
      }
    }
  }

  const client = await getClient(creds)
  const docs = await client
    .db(dbName)
    .collection(collection)
    .aggregate(opts.pipeline as Document[])
    .toArray()

  return JSON.stringify(
    {
      database: dbName,
      collection,
      count: docs.length,
      documents: docs
    },
    null,
    2
  )
}

export async function mongoPing(creds: MongodbCredentials): Promise<{ ok: boolean; detail?: string }> {
  const client = await getClient(creds)
  const result = await client.db().admin().ping()
  const databases = await client.db().admin().listDatabases()
  return {
    ok: result.ok === 1,
    detail: `${databases.databases.length} databases`
  }
}
