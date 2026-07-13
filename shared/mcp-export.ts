import os from 'node:os'
import path from 'node:path'

const APP_DIR_NAME = 'middle-tool'
const STORE_FILE_NAME = 'middle-tool-config.json'

/** 与 packages/mcp-server config-reader 及 electron-store 默认路径一致 */
export function getDefaultMiddleToolConfigPath(): string {
  const home = os.homedir()
  switch (process.platform) {
    case 'win32':
      return path.join(
        process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'),
        APP_DIR_NAME,
        STORE_FILE_NAME
      )
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', APP_DIR_NAME, STORE_FILE_NAME)
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'),
        APP_DIR_NAME,
        STORE_FILE_NAME
      )
  }
}

export function isDefaultConfigPath(configPath: string): boolean {
  return path.normalize(configPath) === path.normalize(getDefaultMiddleToolConfigPath())
}

export const DEFAULT_MCP_SERVER_RUNTIME_JAR = 'rocketmq-mcp.jar'

export function getMcpServerDefaultJarPath(mcpServerRoot: string): string {
  return path.join(mcpServerRoot, 'runtime', DEFAULT_MCP_SERVER_RUNTIME_JAR)
}
