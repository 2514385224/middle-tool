#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { getDefaultConfigPath } from './config-reader.js'
import { resolveHttpServerOptions, startHttpServer } from './http-server.js'
import { createMiddleToolServer, SERVER_VERSION } from './server-core.js'

function resolveTransportMode(argv = process.argv): 'stdio' | 'http' {
  const env = process.env.MIDDLE_TOOL_MCP_TRANSPORT?.trim().toLowerCase()
  if (env === 'http' || env === 'sse' || env === 'network') return 'http'
  if (argv.includes('--http') || argv.includes('--network')) return 'http'
  return 'stdio'
}

async function main() {
  const mode = resolveTransportMode()

  if (mode === 'http') {
    await startHttpServer(resolveHttpServerOptions())
    return
  }

  const server = await createMiddleToolServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)

  console.error(`MiddleTool MCP Server v${SERVER_VERSION} started (stdio)`)
  console.error(`Config: ${getDefaultConfigPath()}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
