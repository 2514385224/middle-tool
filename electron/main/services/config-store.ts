import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import {
  parseConfigImport,
  serializeConfigExport,
  type ConfigImportResult
} from '../../../shared/config-export'
import type { AppData, Environment, MiddlewareConnection } from '../../../shared/types'

const DEFAULT_ENV_NAME = '默认'

const DEFAULT_DATA: AppData = {
  environments: [
    {
      id: uuidv4(),
      name: DEFAULT_ENV_NAME,
      description: '内置默认分组',
      color: '#4a9eff',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ],
  connections: []
}

export class ConfigStore {
  private store: Store<AppData>

  constructor() {
    this.store = new Store<AppData>({
      name: 'middle-tool-config',
      defaults: DEFAULT_DATA
    })
  }

  /** electron-store 配置文件绝对路径，供统一 MCP Server 读取 */
  getConfigPath(): string {
    return this.store.path
  }

  listEnvironments(): Environment[] {
    return this.store.get('environments', [])
  }

  /** 确保存在默认环境，供连接自动归属（UI 不暴露环境管理） */
  ensureDefaultEnvironment(): Environment {
    const envs = this.listEnvironments()
    const named = envs.find((e) => e.name === DEFAULT_ENV_NAME)
    if (named) return named
    if (envs.length > 0) return envs[0]
    return this.createEnvironment({ name: DEFAULT_ENV_NAME, description: '内置默认分组' })
  }

  getDefaultEnvironmentId(): string {
    return this.ensureDefaultEnvironment().id
  }

  createEnvironment(input: Pick<Environment, 'name' | 'description' | 'color'>): Environment {
    const env: Environment = {
      id: uuidv4(),
      name: input.name,
      description: input.description,
      color: input.color ?? '#6366f1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const list = this.listEnvironments()
    list.push(env)
    this.store.set('environments', list)
    return env
  }

  updateEnvironment(id: string, input: Partial<Pick<Environment, 'name' | 'description' | 'color'>>): Environment | null {
    const list = this.listEnvironments()
    const index = list.findIndex((e) => e.id === id)
    if (index === -1) return null
    list[index] = {
      ...list[index],
      ...input,
      updatedAt: new Date().toISOString()
    }
    this.store.set('environments', list)
    return list[index]
  }

  deleteEnvironment(id: string): boolean {
    const envs = this.listEnvironments().filter((e) => e.id !== id)
    const conns = this.listConnections().filter((c) => c.environmentId !== id)
    this.store.set('environments', envs)
    this.store.set('connections', conns)
    return true
  }

  listConnections(environmentId?: string): MiddlewareConnection[] {
    const all = this.store.get('connections', [])
    if (!environmentId) return all
    return all.filter((c) => c.environmentId === environmentId)
  }

  getConnection(id: string): MiddlewareConnection | undefined {
    return this.listConnections().find((c) => c.id === id)
  }

  createConnection(
    input: Pick<MiddlewareConnection, 'type' | 'name' | 'config'> & {
      environmentId?: string
      enabled?: boolean
    }
  ): MiddlewareConnection {
    const environmentId = input.environmentId ?? this.getDefaultEnvironmentId()
    const duplicate = this.listConnections().find(
      (c) => c.type === input.type && c.name === input.name.trim()
    )
    if (duplicate) {
      throw new Error(`已存在同名连接「${input.name}」，请使用不同名称`)
    }

    const conn: MiddlewareConnection = {
      id: uuidv4(),
      environmentId,
      type: input.type,
      name: input.name,
      enabled: input.enabled ?? true,
      config: input.config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const list = this.listConnections()
    list.push(conn)
    this.store.set('connections', list)
    return conn
  }

  updateConnection(
    id: string,
    input: Partial<Pick<MiddlewareConnection, 'name' | 'enabled' | 'config' | 'environmentId'>>
  ): MiddlewareConnection | null {
    const list = this.listConnections()
    const index = list.findIndex((c) => c.id === id)
    if (index === -1) return null

    if (input.name) {
      const duplicate = list.find(
        (c) => c.id !== id && c.type === list[index].type && c.name === input.name!.trim()
      )
      if (duplicate) {
        throw new Error(`已存在同名连接「${input.name}」，请使用不同名称`)
      }
    }

    list[index] = {
      ...list[index],
      ...input,
      updatedAt: new Date().toISOString()
    }
    this.store.set('connections', list)
    return list[index]
  }

  deleteConnection(id: string): boolean {
    const list = this.listConnections().filter((c) => c.id !== id)
    this.store.set('connections', list)
    return true
  }

  getAppData(): AppData {
    return {
      environments: this.listEnvironments(),
      connections: this.listConnections()
    }
  }

  exportConfig(): string {
    return serializeConfigExport(this.getAppData())
  }

  replaceAll(data: AppData): void {
    this.store.set('environments', data.environments)
    this.store.set('connections', data.connections)
  }

  importConfig(
    json: string,
    mode: 'merge' | 'replace',
    validateConnection?: (type: string, config: Record<string, string>) => void
  ): ConfigImportResult {
    const imported = parseConfigImport(json)
    const result: ConfigImportResult = {
      mode,
      environmentsAdded: 0,
      environmentsSkipped: 0,
      connectionsAdded: 0,
      connectionsSkipped: 0,
      warnings: []
    }

    if (mode === 'replace') {
      const environments =
        imported.environments.length > 0 ? imported.environments : [this.ensureDefaultEnvironment()]

      for (const conn of imported.connections) {
        try {
          validateConnection?.(conn.type, conn.config)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          throw new Error(`连接「${conn.name}」校验失败: ${msg}`)
        }
      }

      this.replaceAll({ environments, connections: imported.connections })
      result.environmentsAdded = environments.length
      result.connectionsAdded = imported.connections.length
      return result
    }

    const envIdMap = new Map<string, string>()

    for (const impEnv of imported.environments) {
      const existing = this.listEnvironments().find((e) => e.name === impEnv.name)
      if (existing) {
        envIdMap.set(impEnv.id, existing.id)
        result.environmentsSkipped++
        continue
      }

      const created = this.createEnvironment({
        name: impEnv.name,
        description: impEnv.description,
        color: impEnv.color
      })
      envIdMap.set(impEnv.id, created.id)
      result.environmentsAdded++
    }

    for (const conn of imported.connections) {
      const targetEnvId = envIdMap.get(conn.environmentId) ?? this.getDefaultEnvironmentId()
      const duplicate = this.listConnections().find(
        (c) => c.type === conn.type && c.name === conn.name && c.environmentId === targetEnvId
      )
      if (duplicate) {
        result.connectionsSkipped++
        result.warnings.push(`已跳过重复连接「${conn.name}」（${conn.type}）`)
        continue
      }

      try {
        validateConnection?.(conn.type, conn.config)
        this.createConnection({
          type: conn.type,
          name: conn.name,
          config: conn.config,
          enabled: conn.enabled,
          environmentId: targetEnvId
        })
        result.connectionsAdded++
      } catch (err) {
        result.connectionsSkipped++
        const msg = err instanceof Error ? err.message : String(err)
        result.warnings.push(`连接「${conn.name}」导入失败: ${msg}`)
      }
    }

    return result
  }
}
