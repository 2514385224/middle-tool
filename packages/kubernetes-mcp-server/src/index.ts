#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js'
import {
  getDefaultConfigPath,
  getKubernetesCredentials,
  listKubernetesConnectionSummaries,
  readAppData,
  resolveConnection
} from './config-reader.js'
import {
  createKubernetesClient,
  deletePod,
  getGenericResource,
  getPod,
  getPodLogs,
  getPodMetrics,
  listDeployments,
  listEvents,
  listNamespaces,
  listPods,
  listServices
} from './kubernetes-client.js'

const SERVER_VERSION = '0.1.0'

const connectionParams = {
  connection_id: {
    type: 'string' as const,
    description: 'MiddleTool Kubernetes 连接 ID（推荐）'
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
    name: 'kubernetes_list_connections',
    description:
      '列出 MiddleTool 中已配置的 Kubernetes 连接。仅一条连接时返回 default_connection_id，后续工具可省略 connection 参数。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        environment: { type: 'string', description: '按环境名称筛选' },
        enabled_only: { type: 'boolean', description: '仅返回已启用连接，默认 true' }
      }
    }
  },
  {
    name: 'kubernetes_list_namespaces',
    description: '列出 Kubernetes 集群中的所有命名空间',
    inputSchema: {
      type: 'object' as const,
      properties: { ...connectionParams }
    }
  },
  {
    name: 'kubernetes_list_pods',
    description: '列出指定命名空间中的 Pod，支持状态、就绪状态、重启次数等信息',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_get_pod',
    description: '获取指定 Pod 的详细信息',
    inputSchema: {
      type: 'object' as const,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_delete_pod',
    description: '删除指定的 Pod',
    inputSchema: {
      type: 'object' as const,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_pod_logs',
    description: '获取 Pod 的日志',
    inputSchema: {
      type: 'object' as const,
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        container: { type: 'string', description: '容器名称（多容器 Pod 时需要）' },
        tail_lines: { type: 'number', description: '返回的日志行数，默认全部' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_pod_metrics',
    description: '获取 Pod 的资源使用指标（CPU、内存），需要 Metrics Server 支持',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_list_events',
    description: '列出指定命名空间中的事件',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_list_deployments',
    description: '列出指定命名空间中的 Deployment',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_list_services',
    description: '列出指定命名空间中的 Service',
    inputSchema: {
      type: 'object' as const,
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        ...connectionParams
      }
    }
  },
  {
    name: 'kubernetes_get_resource',
    description: '获取或列出任意 Kubernetes 资源（CRD、自定义资源等）',
    inputSchema: {
      type: 'object' as const,
      required: ['group', 'version', 'plural'],
      properties: {
        group: { type: 'string', description: 'API group，如 apps、batch 或自定义 group' },
        version: { type: 'string', description: 'API version，如 v1、v1beta1' },
        plural: { type: 'string', description: '资源的复数形式，如 deployments、jobs' },
        name: { type: 'string', description: '资源名称，不提供则列出所有' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
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
    const { default_connection_id } = listKubernetesConnectionSummaries(data)
    if (default_connection_id) connectionId = default_connection_id
  }

  return resolveConnection(data, {
    connectionId,
    connectionName,
    environmentName,
    type: 'kubernetes'
  })
}

async function getClientFromArgs(args: Record<string, unknown>) {
  const { connection } = resolveFromArgs(args)
  const credentials = getKubernetesCredentials(connection)
  return await createKubernetesClient(credentials)
}

async function main() {
  const server = new Server(
    { name: 'middle-tool-kubernetes-mcp-server', version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params
    const a = args as Record<string, unknown>

    try {
      switch (name) {
        case 'kubernetes_list_connections': {
          const data = readAppData()
          const summary = listKubernetesConnectionSummaries(data, {
            enabledOnly: a.enabled_only !== false,
            environmentName: a.environment as string | undefined
          })
          const payload = {
            ...summary,
            hint:
              summary.default_connection_id
                ? '仅有一条连接，后续 kubernetes_* 工具可省略 connection 参数，或直接使用 default_connection_id'
                : '存在多条连接，后续 kubernetes_* 工具请传入 connection_id（推荐）或 connection_name'
          }
          return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
        }

        case 'kubernetes_list_namespaces': {
          const client = await getClientFromArgs(a)
          const text = await listNamespaces(client)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_list_pods': {
          const client = await getClientFromArgs(a)
          const text = await listPods(client, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_get_pod': {
          if (!a.name) throw new Error('name 参数必填')
          const client = await getClientFromArgs(a)
          const text = await getPod(client, a.name as string, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_delete_pod': {
          if (!a.name) throw new Error('name 参数必填')
          const client = await getClientFromArgs(a)
          const text = await deletePod(client, a.name as string, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_pod_logs': {
          if (!a.name) throw new Error('name 参数必填')
          const client = await getClientFromArgs(a)
          const text = await getPodLogs(
            client,
            a.name as string,
            a.namespace as string | undefined,
            a.container as string | undefined,
            a.tail_lines as number | undefined
          )
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_pod_metrics': {
          const client = await getClientFromArgs(a)
          const text = await getPodMetrics(client, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_list_events': {
          const client = await getClientFromArgs(a)
          const text = await listEvents(client, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_list_deployments': {
          const client = await getClientFromArgs(a)
          const text = await listDeployments(client, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_list_services': {
          const client = await getClientFromArgs(a)
          const text = await listServices(client, a.namespace as string | undefined)
          return { content: [{ type: 'text', text }] }
        }

        case 'kubernetes_get_resource': {
          if (!a.group || !a.version || !a.plural) {
            throw new Error('group、version、plural 参数必填')
          }
          const client = await getClientFromArgs(a)
          const text = await getGenericResource(
            client,
            a.group as string,
            a.version as string,
            a.plural as string,
            a.name as string | undefined,
            a.namespace as string | undefined
          )
          return { content: [{ type: 'text', text }] }
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

  console.error(`Kubernetes MCP Server v${SERVER_VERSION} started`)
  console.error(`Config: ${getDefaultConfigPath()}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})