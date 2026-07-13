import type { RocketmqCredentials } from './config-reader.js'
import { ensureAdminBridge } from './java-runtime.js'

function buildBasePayload(creds: RocketmqCredentials): Record<string, unknown> {
  return {
    nameserverAddressList: creds.nameserverAddressList,
    ak: creds.accessKey,
    sk: creds.secretKey
  }
}

async function callAdmin(
  creds: RocketmqCredentials,
  endpoint: string,
  extra: Record<string, unknown> = {}
): Promise<string> {
  const baseUrl = await ensureAdminBridge()
  const url = `${baseUrl}${endpoint}`
  const body = { ...buildBasePayload(creds), ...extra }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`RocketMQ Admin 请求失败 (${res.status}): ${text}`)
  }

  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

// Topic
export const listTopics = (c: RocketmqCredentials) => callAdmin(c, '/topic/topicList')
export const topicRoute = (c: RocketmqCredentials, topic: string) =>
  callAdmin(c, '/topic/examineTopicRouteInfo', { topic })
export const topicStats = (c: RocketmqCredentials, topic: string) =>
  callAdmin(c, '/topic/examineTopicStats', { topic })

// Message
export const viewMessage = (c: RocketmqCredentials, topic: string, msgId: string) =>
  callAdmin(c, '/message/viewMessage', { topic, msgId })
export const queryMessageByKey = (
  c: RocketmqCredentials,
  topic: string,
  key: string,
  opts?: { maxNum?: number; begin?: number; end?: number }
) =>
  callAdmin(c, '/message/queryMessageByKey', {
    topic,
    key,
    maxNum: opts?.maxNum ?? 32,
    begin: opts?.begin ?? 0,
    end: opts?.end ?? Date.now()
  })
export const messageTrace = (c: RocketmqCredentials, topic: string, msgId: string) =>
  callAdmin(c, '/message/getMessageTrace', { topic, msgId })

// Cluster & Broker
export const clusterList = (c: RocketmqCredentials) => callAdmin(c, '/cluster/clusterList')
export const brokerClusterInfo = (c: RocketmqCredentials) =>
  callAdmin(c, '/broker/getBrokerClusterInfo')
export const brokerRuntimeStats = (c: RocketmqCredentials, brokerAddr: string) =>
  callAdmin(c, '/broker/getBrokerRuntimeStats', { brokerAddr })

// Consumer & Producer
export const consumerInfo = (c: RocketmqCredentials, consumerGroup: string) =>
  callAdmin(c, '/consumer/examineConsumerConnectionInfo', { consumerGroup })
export const consumerStatus = (c: RocketmqCredentials, topic: string, consumerGroup: string) =>
  callAdmin(c, '/consumer/getConsumerStatus', { topic, consumerGroup })
export const queryConsumerOffset = (
  c: RocketmqCredentials,
  consumerGroup: string,
  topic: string,
  queueId: number
) => callAdmin(c, '/consumer/queryConsumerOffset', { consumerGroup, topic, queueId })
export const producerInfo = (c: RocketmqCredentials, producerGroup: string) =>
  callAdmin(c, '/producer/examineProducerConnectionInfo', { producerGroup })
export const producerList = (c: RocketmqCredentials) => callAdmin(c, '/producer/getProducerList')

// ConsumeQueue
export const examineConsumeQueue = (
  c: RocketmqCredentials,
  topic: string,
  brokerAddr: string
) => callAdmin(c, '/consumequeue/examineConsumeQueue', { topic, brokerAddr })
