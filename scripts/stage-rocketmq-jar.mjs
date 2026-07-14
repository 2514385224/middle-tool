/** 将 RocketMQ JAR staging 到 packages/rocketmq-mcp-server/runtime/ */
import { stageRocketmqJar } from './resolve-rocketmq-jar.mjs'

stageRocketmqJar({ required: false })
