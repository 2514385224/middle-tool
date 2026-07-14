import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

import type { RocketmqCredentials } from './config-reader.js'
import { ensureAdminBridge } from './rocketmq-java-runtime.js'

const DEFAULT_ROCKETMQ_MCP_PORT = 6868

function getAdminBaseUrl(): string {
  const override = process.env.ROCKETMQ_MCP_ADMIN_URL?.trim()
  if (override) return override.replace(/\/$/, '')
  const raw = process.env.ROCKETMQ_MCP_PORT
  const port = raw ? Number(raw) : DEFAULT_ROCKETMQ_MCP_PORT
  return `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : DEFAULT_ROCKETMQ_MCP_PORT}`
}

function getRocketmqMcpSseUrl(): string {
  return `${getAdminBaseUrl()}/sse`
}

function buildRocketmqToolArgs(creds: RocketmqCredentials): Record<string, unknown> {
  return {
    nameserverAddressList: creds.nameserverAddressList,
    ak: creds.accessKey,
    sk: creds.secretKey
  }
}

function extractToolText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const parts = Array.isArray(result.content) ? result.content : []
  const text = parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim()
  if (text) return text
  return JSON.stringify(result, null, 2)
}

function parseApiPayload(text: string): unknown {
  try {
    const parsed = JSON.parse(text) as { data?: unknown; errorCode?: number; errorMessage?: string | null }
    if (parsed && typeof parsed === 'object' && 'data' in parsed) {
      if (parsed.errorCode != null && parsed.errorCode !== 0) {
        throw new Error(parsed.errorMessage ?? `RocketMQ 调用失败 (code ${parsed.errorCode})`)
      }
      return parsed.data
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('RocketMQ')) throw err
  }
  return text
}

async function withRocketmqMcpClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  await ensureAdminBridge()
  const transport = new SSEClientTransport(new URL(getRocketmqMcpSseUrl()))
  const client = new Client({ name: 'middle-tool-rocketmq-client', version: '0.1.0' }, { capabilities: {} })

  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close()
  }
}

async function callToolRaw(
  creds: RocketmqCredentials,
  toolName: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const args = { ...buildRocketmqToolArgs(creds), ...extra }
  return withRocketmqMcpClient(async (client) => {
    const result = await client.callTool({ name: toolName, arguments: args })
    if (result.isError) {
      throw new Error(extractToolText(result))
    }
    return extractToolText(result)
  })
}

async function callTool(
  creds: RocketmqCredentials,
  toolName: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const text = await callToolRaw(creds, toolName, extra)
  const data = parseApiPayload(text)
  return typeof data === 'string' ? data : JSON.stringify(data, null, 2)
}

async function resolveFirstBrokerAddr(creds: RocketmqCredentials): Promise<string> {
  const text = await callToolRaw(creds, 'getAllBrokerAddresses')
  const data = parseApiPayload(text)
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
    return data[0]
  }
  throw new Error('未找到可用 Broker 地址')
}

export const listTopics = (c: RocketmqCredentials) => callTool(c, 'fetchAllTopicList')
export const topicRoute = (c: RocketmqCredentials, topic: string) =>
  callTool(c, 'examineTopicRouteInfo', { topic })
export const topicStats = (c: RocketmqCredentials, topic: string) =>
  callTool(c, 'examineTopicStats', { topic })
export const viewMessage = (c: RocketmqCredentials, topic: string, msgId: string) =>
  callTool(c, 'viewMessage', { topic, msgId })
export const queryMessageByKey = (
  c: RocketmqCredentials,
  topic: string,
  key: string,
  opts?: { maxNum?: number; begin?: number; end?: number }
) =>
  callTool(c, 'queryMessageByKey', {
    topic,
    key,
    maxNum: opts?.maxNum ?? 32,
    begin: opts?.begin ?? 0,
    end: opts?.end ?? Date.now()
  })

export async function messageTrace(
  creds: RocketmqCredentials,
  topic: string,
  msgId: string
): Promise<string> {
  const messageText = await callToolRaw(creds, 'viewMessage', { topic, msgId })
  const messageData = parseApiPayload(messageText)
  return callTool(creds, 'messageTrackDetail', {
    messageJson: typeof messageData === 'string' ? messageData : JSON.stringify(messageData)
  })
}

export const clusterList = (c: RocketmqCredentials) => callTool(c, 'getClusterInfo')
export const brokerClusterInfo = (c: RocketmqCredentials) => callTool(c, 'getClusterInfo')

export const brokerRuntimeStats = (c: RocketmqCredentials, brokerAddr: string) =>
  callTool(c, 'getBrokerRuntimeStats', { brokerAddr })

export const consumerInfo = (c: RocketmqCredentials, consumerGroup: string) =>
  callTool(c, 'examineConsumerConnectionInfo', { consumerGroup })

export const consumerStatus = (c: RocketmqCredentials, topic: string, consumerGroup: string) =>
  callTool(c, 'getConsumeStatus', { topic, group: consumerGroup, clientAddr: '' })

export const queryConsumerOffset = async (
  creds: RocketmqCredentials,
  consumerGroup: string,
  topic: string,
  queueId: number
) => {
  const stats = await callTool(creds, 'examineConsumeStatsByTopic', { consumerGroup, topic })
  return `${stats}\n(queue_id=${queueId} 可通过 examineConsumeStatsByTopic 查看 offsetTable)`
}

export const producerInfo = (c: RocketmqCredentials, producerGroup: string, topic: string) =>
  callTool(c, 'examineProducerConnectionInfo', { producerGroup, topic })

export const producerList = async (c: RocketmqCredentials) => {
  const brokerAddr = await resolveFirstBrokerAddr(c)
  return callTool(c, 'getAllProducerInfo', { brokerAddr })
}

export const examineConsumeQueue = async (
  creds: RocketmqCredentials,
  topic: string,
  brokerAddr: string,
  opts?: { queueId?: number; consumerGroup?: string }
) =>
  callTool(creds, 'queryConsumeQueue', {
    brokerAddr,
    topic,
    queueId: opts?.queueId ?? 0,
    index: 0,
    count: 32,
    consumerGroup: opts?.consumerGroup ?? ''
  })

export async function pingRocketmqCluster(creds: RocketmqCredentials): Promise<string> {
  return listTopics(creds)
}
