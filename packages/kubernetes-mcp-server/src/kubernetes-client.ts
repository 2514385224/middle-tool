import * as k8s from '@kubernetes/client-node'
import { KubernetesCredentials } from './config-reader.js'

export interface KubernetesClient {
  coreV1Api: k8s.CoreV1Api
  appsV1Api: k8s.AppsV1Api
  customObjectsApi: k8s.CustomObjectsApi
  context: string
  namespace: string
}

export async function createKubernetesClient(credentials: KubernetesCredentials): Promise<KubernetesClient> {
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

export async function listNamespaces(client: KubernetesClient): Promise<string> {
  const response = await client.coreV1Api.listNamespace()
  const namespaces = response.items.map((ns: k8s.V1Namespace) => ({
    name: ns.metadata?.name,
    status: ns.status?.phase,
    created: ns.metadata?.creationTimestamp
  }))
  return JSON.stringify(namespaces, null, 2)
}

export async function listPods(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedPod({ namespace: ns })
  const pods = response.items.map((pod: k8s.V1Pod) => ({
    name: pod.metadata?.name,
    namespace: pod.metadata?.namespace,
    status: pod.status?.phase,
    ready: pod.status?.containerStatuses?.map((c: k8s.V1ContainerStatus) => c.ready).filter(Boolean).length || 0,
    total: pod.status?.containerStatuses?.length || 0,
    restarts: pod.status?.containerStatuses?.reduce((sum: number, c: k8s.V1ContainerStatus) => sum + (c.restartCount || 0), 0) || 0,
    age: pod.metadata?.creationTimestamp,
    ip: pod.status?.podIP
  }))
  return JSON.stringify(pods, null, 2)
}

export async function getPod(client: KubernetesClient, name: string, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.readNamespacedPod({ name, namespace: ns })
  return JSON.stringify(response, null, 2)
}

export async function deletePod(client: KubernetesClient, name: string, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  await client.coreV1Api.deleteNamespacedPod({ name, namespace: ns })
  return `Pod ${name} in namespace ${ns} deleted successfully`
}

export async function getPodLogs(
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

export async function getPodMetrics(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  throw new Error(`Metrics API not available in this version of @kubernetes/client-node. Please use kubectl top pods directly.`)
}

export async function listEvents(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedEvent({ namespace: ns })
  const events = response.items.map((event: k8s.CoreV1Event) => ({
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

export async function listDeployments(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.appsV1Api.listNamespacedDeployment({ namespace: ns })
  const deployments = response.items.map((dep: k8s.V1Deployment) => ({
    name: dep.metadata?.name,
    namespace: dep.metadata?.namespace,
    ready: `${dep.status?.readyReplicas || 0}/${dep.status?.replicas || 0}`,
    upToDate: dep.status?.updatedReplicas || 0,
    available: dep.status?.availableReplicas || 0,
    age: dep.metadata?.creationTimestamp
  }))
  return JSON.stringify(deployments, null, 2)
}

export async function listServices(client: KubernetesClient, namespace?: string): Promise<string> {
  const ns = namespace || client.namespace
  const response = await client.coreV1Api.listNamespacedService({ namespace: ns })
  const services = response.items.map((svc: k8s.V1Service) => ({
    name: svc.metadata?.name,
    namespace: svc.metadata?.namespace,
    type: svc.spec?.type,
    clusterIP: svc.spec?.clusterIP,
    externalIPs: svc.spec?.externalIPs,
    ports: svc.spec?.ports?.map((p: k8s.V1ServicePort) => ({
      name: p.name,
      port: p.port,
      targetPort: p.targetPort,
      protocol: p.protocol
    })),
    age: svc.metadata?.creationTimestamp
  }))
  return JSON.stringify(services, null, 2)
}

export async function getGenericResource(
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