import type { Tool } from '@modelcontextprotocol/sdk/types.js'

import { getKubernetesCredentials, listKubernetesConnectionSummaries, readAppData, resolveConnection } from './config-reader.js'

// 内联 Kubernetes 客户端功能
interface KubernetesClient {
  coreV1Api: any
  appsV1Api: any
  customObjectsApi: any
  context: string
  namespace: string
}

async function createKubernetesClient(credentials: any): Promise<KubernetesClient> {
  const k8s = await import('@kubernetes/client-node')
  const kc = new k8s.KubeConfig()

  if (credentials.inCluster) {
    kc.loadFromCluster()
  } else if (credentials.kubeconfig) {
    kc.loadFromFile(credentials.kubeconfig)
  } else {
    kc.loadFromDefault()
  }

  const context = credentials.context || kc.getCurrentContext()
  if (context) {
    kc.setCurrentContext(context)
  }

  const namespace = credentials.namespace || 'default'

  const coreV1Api = kc.makeApiClient(k8s.CoreV1Api)
  const appsV1Api = kc.makeApiClient(k8s.AppsV1Api)
  const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi)

  return {
    coreV1Api,
    appsV1Api,
    customObjectsApi,
    context,
    namespace
  }
}

async function listNamespaces(client: KubernetesClient): Promise<string> {
  const response = await client.coreV1Api.listNamespace()
  const namespaces = response.items.map((ns: any) => ({
    name: ns.metadata?.name,
    status: ns.status?.phase,
    created: ns.metadata?.creationTimestamp
  }))
  return JSON.stringify(namespaces, null, 2)
}

async function listPods(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedPod({ namespace: ns })
  const pods = response.items.map((pod: any) => ({
    name: pod.metadata?.name,
    namespace: pod.metadata?.namespace,
    status: pod.status?.phase,
    ready: pod.status?.containerStatuses?.map((c: any) => c.ready).filter(Boolean).length || 0,
    total: pod.status?.containerStatuses?.length || 0,
    restarts: pod.status?.containerStatuses?.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0) || 0,
    age: pod.metadata?.creationTimestamp,
    ip: pod.status?.podIP
  }))
  return JSON.stringify(pods, null, 2)
}

async function getPod(client: KubernetesClient, name: string, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.readNamespacedPod({ name, namespace: ns })
  return JSON.stringify(response, null, 2)
}

async function deletePod(client: KubernetesClient, name: string, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  await client.coreV1Api.deleteNamespacedPod({ name, namespace: ns })
  return `Pod ${name} in namespace ${ns} deleted successfully`
}

async function getPodLogs(
  client: KubernetesClient,
  name: string,
  namespace?: string,
  container?: string,
  tailLines?: number
): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.readNamespacedPodLog({
    name,
    namespace: ns,
    container,
    tailLines
  })
  return response
}

async function listEvents(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedEvent({ namespace: ns })
  const events = response.items.map((event: any) => ({
    type: event.type,
    reason: event.reason,
    message: event.message,
    involvedObject: {
      kind: event.involvedObject?.kind,
      name: event.involvedObject?.name,
      namespace: event.involvedObject?.namespace
    },
    lastSeen: event.lastTimestamp,
    count: event.count
  }))
  return JSON.stringify(events, null, 2)
}

async function listDeployments(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.appsV1Api.listNamespacedDeployment({ namespace: ns })
  const deployments = response.items.map((dep: any) => ({
    name: dep.metadata?.name,
    namespace: dep.metadata?.namespace,
    ready: `${dep.status?.readyReplicas || 0}/${dep.status?.replicas || 0}`,
    upToDate: dep.status?.updatedReplicas || 0,
    available: dep.status?.availableReplicas || 0,
    age: dep.metadata?.creationTimestamp
  }))
  return JSON.stringify(deployments, null, 2)
}

async function listServices(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedService({ namespace: ns })
  const services = response.items.map((svc: any) => ({
    name: svc.metadata?.name,
    namespace: svc.metadata?.namespace,
    type: svc.spec?.type,
    clusterIP: svc.spec?.clusterIP,
    externalIPs: svc.spec?.externalIPs,
    ports: svc.spec?.ports?.map((p: any) => ({
      name: p.name,
      port: p.port,
      targetPort: p.targetPort,
      protocol: p.protocol
    })),
    age: svc.metadata?.creationTimestamp
  }))
  return JSON.stringify(services, null, 2)
}

async function getGenericResource(
  client: KubernetesClient,
  group: string,
  version: string,
  plural: string,
  name?: string,
  namespace?: string
): Promise<string> {
  const ns = namespace || client.namespace
  if (name) {
    const response = await client.customObjectsApi.getNamespacedCustomObject({
      group,
      version,
      namespace: ns,
      plural,
      name
    })
    return JSON.stringify(response, null, 2)
  } else {
    const response = await client.customObjectsApi.listNamespacedCustomObject({
      group,
      version,
      namespace: ns,
      plural
    })
    return JSON.stringify(response, null, 2)
  }
}

export const KUBERNETES_TOOL_PREFIX = 'kubernetes_'
export const CONNECTION_ARG_KEYS = ['connection_id', 'connection_name', 'environment'] as const

export function isKubernetesTool(name: string): boolean {
  return name.startsWith(KUBERNETES_TOOL_PREFIX)
}

const connectionParamsSchema = {
  connection_id: {
    type: 'string',
    description: 'MiddleTool Kubernetes 连接 ID（推荐）'
  },
  connection_name: {
    type: 'string',
    description: '连接名称（需配合 environment 使用）'
  },
  environment: {
    type: 'string',
    description: '环境名称'
  }
}

function withConnectionParams(tool: Tool): Tool {
  const schema = tool.inputSchema ?? { type: 'object', properties: {} }
  return {
    ...tool,
    name: tool.name.startsWith(KUBERNETES_TOOL_PREFIX) ? tool.name : `${KUBERNETES_TOOL_PREFIX}${tool.name}`,
    description: `[需指定连接] ${tool.description ?? ''}`.trim(),
    inputSchema: {
      ...schema,
      type: 'object',
      properties: { ...connectionParamsSchema, ...(schema.properties ?? {}) }
    }
  }
}

function stripToolPrefix(name: string): string {
  return name.startsWith(KUBERNETES_TOOL_PREFIX) ? name.slice(KUBERNETES_TOOL_PREFIX.length) : name
}

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

const staticTools: Tool[] = [
  {
    name: 'kubernetes_list_connections',
    description: '列出 MiddleTool 中已配置的 Kubernetes 连接。仅一条连接时返回 default_connection_id，后续工具可省略 connection 参数。',
    inputSchema: {
      type: 'object',
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
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'kubernetes_list_pods',
    description: '列出指定命名空间中的 Pod，支持状态、就绪状态、重启次数等信息',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_get_pod',
    description: '获取指定 Pod 的详细信息',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_delete_pod',
    description: '删除指定的 Pod',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_pod_logs',
    description: '获取 Pod 的日志',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Pod 名称' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' },
        container: { type: 'string', description: '容器名称（多容器 Pod 时需要）' },
        tail_lines: { type: 'number', description: '返回的日志行数，默认全部' }
      }
    }
  },
  {
    name: 'kubernetes_list_events',
    description: '列出指定命名空间中的事件',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_list_deployments',
    description: '列出指定命名空间中的 Deployment',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_list_services',
    description: '列出指定命名空间中的 Service',
    inputSchema: {
      type: 'object',
      required: [],
      properties: {
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  },
  {
    name: 'kubernetes_get_resource',
    description: '获取或列出任意 Kubernetes 资源（CRD、自定义资源等）',
    inputSchema: {
      type: 'object',
      required: ['group', 'version', 'plural'],
      properties: {
        group: { type: 'string', description: 'API group，如 apps、batch 或自定义 group' },
        version: { type: 'string', description: 'API version，如 v1、v1beta1' },
        plural: { type: 'string', description: '资源的复数形式，如 deployments、jobs' },
        name: { type: 'string', description: '资源名称，不提供则列出所有' },
        namespace: { type: 'string', description: '命名空间，默认使用连接配置中的 namespace' }
      }
    }
  }
]

export async function listKubernetesTools(): Promise<Tool[]> {
  return staticTools.map(withConnectionParams)
}

export async function handleKubernetesToolCall(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const toolName = stripToolPrefix(name)

  try {
    switch (toolName) {
      case 'kubernetes_list_connections': {
        const data = readAppData()
        const summary = listKubernetesConnectionSummaries(data, {
          enabledOnly: args.enabled_only !== false,
          environmentName: args.environment as string | undefined
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
        const client = await getClientFromArgs(args)
        const text = await listNamespaces(client)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_list_pods': {
        const client = await getClientFromArgs(args)
        const text = await listPods(client, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_get_pod': {
        if (!args.name) throw new Error('name 参数必填')
        const client = await getClientFromArgs(args)
        const text = await getPod(client, args.name as string, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_delete_pod': {
        if (!args.name) throw new Error('name 参数必填')
        const client = await getClientFromArgs(args)
        const text = await deletePod(client, args.name as string, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_pod_logs': {
        if (!args.name) throw new Error('name 参数必填')
        const client = await getClientFromArgs(args)
        const text = await getPodLogs(
          client,
          args.name as string,
          args.namespace as string | undefined,
          args.container as string | undefined,
          args.tail_lines as number | undefined
        )
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_list_events': {
        const client = await getClientFromArgs(args)
        const text = await listEvents(client, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_list_deployments': {
        const client = await getClientFromArgs(args)
        const text = await listDeployments(client, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_list_services': {
        const client = await getClientFromArgs(args)
        const text = await listServices(client, args.namespace as string | undefined)
        return { content: [{ type: 'text', text }] }
      }

      case 'kubernetes_get_resource': {
        if (!args.group || !args.version || !args.plural) {
          throw new Error('group、version、plural 参数必填')
        }
        const client = await getClientFromArgs(args)
        const text = await getGenericResource(
          client,
          args.group as string,
          args.version as string,
          args.plural as string,
          args.name as string | undefined,
          args.namespace as string | undefined
        )
        return { content: [{ type: 'text', text }] }
      }

      default:
        throw new Error(`未知工具: ${toolName}`)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true } as any
  }
}