import { clearAllPooledClients } from './redis-proxy.js'
import { clearMysqlPoolCache } from './mysql-client.js'

/** 配置 reload 后丢弃旧连接池，避免仍使用过期凭证 */
export async function applyConfigReloadSideEffects(): Promise<void> {
  await Promise.all([clearMysqlPoolCache(), clearAllPooledClients()])
}

export function isConfigWriteEnabled(): boolean {
  return process.env.MIDDLE_TOOL_CONFIG_WRITE !== '0'
}
