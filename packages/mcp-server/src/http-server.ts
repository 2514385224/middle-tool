import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'

import { getDefaultConfigPath, readAppData } from './config-reader.js'
import { reloadAppDataWithMeta, startConfigFileWatcher } from './config-reload.js'
import { summarizeConnections } from './connection-summary.js'
import { probeConnectionStatuses } from './connection-status.js'
import { createOptionalApiKeyMiddleware, resolveHttpApiKey } from './http-auth.js'
import { createMiddleToolServer, SERVER_VERSION } from './server-core.js'
import { preloadRedisTools } from './redis-proxy.js'

export interface HttpServerOptions {
  host: string
  port: number
  mcpPath: string
  legacySsePath: string
  legacyMessagesPath: string
  enableLegacySse: boolean
  allowedHosts?: string[]
}

function parseAllowedHosts(raw: string | undefined): string[] | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function resolveHttpServerOptions(argv = process.argv): HttpServerOptions {
  const readArg = (name: string): string | undefined => {
    const flag = `--${name}`
    const index = argv.indexOf(flag)
    if (index >= 0) return argv[index + 1]
    const prefix = `${flag}=`
    const inline = argv.find((arg) => arg.startsWith(prefix))
    return inline?.slice(prefix.length)
  }

  const host =
    process.env.MIDDLE_TOOL_MCP_HOST?.trim() ||
    readArg('host') ||
    '0.0.0.0'

  const portRaw =
    process.env.MIDDLE_TOOL_MCP_PORT?.trim() ||
    readArg('port') ||
    '8080'

  const port = Number(portRaw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MIDDLE_TOOL_MCP_PORT 无效: ${portRaw}`)
  }

  const mcpPath = process.env.MIDDLE_TOOL_MCP_PATH?.trim() || readArg('path') || '/mcp'
  const legacySsePath = process.env.MIDDLE_TOOL_MCP_SSE_PATH?.trim() || '/sse'
  const legacyMessagesPath = process.env.MIDDLE_TOOL_MCP_MESSAGES_PATH?.trim() || '/messages'
  const enableLegacySse = process.env.MIDDLE_TOOL_MCP_LEGACY_SSE !== '0'
  const allowedHosts = parseAllowedHosts(process.env.MIDDLE_TOOL_MCP_ALLOWED_HOSTS)

  return {
    host,
    port,
    mcpPath: mcpPath.startsWith('/') ? mcpPath : `/${mcpPath}`,
    legacySsePath: legacySsePath.startsWith('/') ? legacySsePath : `/${legacySsePath}`,
    legacyMessagesPath: legacyMessagesPath.startsWith('/') ? legacyMessagesPath : `/${legacyMessagesPath}`,
    enableLegacySse,
    allowedHosts
  }
}

function formatBaseUrl(host: string, port: number): string {
  const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host
  return `http://${displayHost}:${port}`
}

export async function startHttpServer(options: HttpServerOptions): Promise<void> {
  const app = createMcpExpressApp({
    host: options.host,
    allowedHosts: options.allowedHosts
  })

  const streamableTransports = new Map<string, StreamableHTTPServerTransport>()
  const sseTransports = new Map<string, SSEServerTransport>()
  const apiKey = resolveHttpApiKey()
  const requireApiKey = createOptionalApiKeyMiddleware(apiKey)

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'middle-tool-mcp-server',
      version: SERVER_VERSION,
      config: getDefaultConfigPath(),
      authRequired: Boolean(apiKey)
    })
  })

  app.use((req, res, next) => {
    if (req.path === '/health') {
      next()
      return
    }
    requireApiKey(req, res, next)
  })

  app.get('/api/connections', (req, res) => {
    try {
      const data = readAppData()
      const enabledOnly = req.query.enabled_only !== 'false'
      const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined
      const type = typeof req.query.type === 'string' ? req.query.type : undefined
      res.json(summarizeConnections(data, { enabledOnly, environment, type }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: message })
    }
  })

  app.get('/api/connections/status', async (req, res) => {
    try {
      const data = readAppData()
      const enabledOnly = req.query.enabled_only !== 'false'
      const environment = typeof req.query.environment === 'string' ? req.query.environment : undefined
      const type = typeof req.query.type === 'string' ? req.query.type : undefined
      const connectionId = typeof req.query.connection_id === 'string' ? req.query.connection_id : undefined
      const quick = req.query.full !== 'true'
      const report = await probeConnectionStatuses(data, {
        enabledOnly,
        environment,
        type,
        connectionId,
        quick
      })
      res.json(report)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: message })
    }
  })

  app.post('/admin/reload', (_req, res) => {
    try {
      const result = reloadAppDataWithMeta()
      res.json({
        ok: true,
        reloadedAt: result.reloadedAt,
        config: result.configPath,
        environments: result.data.environments.length,
        connections: result.data.connections.length
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      res.status(500).json({ ok: false, error: message })
    }
  })

  const handleStreamableRequest = async (req: Request, res: Response, body?: unknown) => {
    const sessionIdHeader = req.headers['mcp-session-id']
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader

    try {
      if (sessionId && streamableTransports.has(sessionId)) {
        await streamableTransports.get(sessionId)!.handleRequest(req, res, body)
        return
      }

      if (!sessionId && body && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (initializedSessionId) => {
            streamableTransports.set(initializedSessionId, transport)
          }
        })

        transport.onclose = () => {
          const sid = transport.sessionId
          if (sid) streamableTransports.delete(sid)
        }

        const server = await createMiddleToolServer()
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
        return
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: missing or invalid MCP session' },
        id: null
      })
    } catch (err) {
      console.error('[middle-tool] MCP HTTP request failed:', err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        })
      }
    }
  }

  app.post(options.mcpPath, async (req, res) => {
    await handleStreamableRequest(req, res, req.body)
  })

  app.get(options.mcpPath, async (req, res) => {
    await handleStreamableRequest(req, res)
  })

  if (options.enableLegacySse) {
    app.get(options.legacySsePath, async (_req, res) => {
      try {
        const transport = new SSEServerTransport(options.legacyMessagesPath, res)
        sseTransports.set(transport.sessionId, transport)
        transport.onclose = () => {
          sseTransports.delete(transport.sessionId)
        }

        const server = await createMiddleToolServer()
        await server.connect(transport)
      } catch (err) {
        console.error('[middle-tool] Legacy SSE connection failed:', err)
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE stream')
        }
      }
    })

    app.post(options.legacyMessagesPath, async (req, res) => {
      const sessionIdRaw = req.query.sessionId
      const sessionId = Array.isArray(sessionIdRaw) ? sessionIdRaw[0] : sessionIdRaw
      if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).send('Missing sessionId parameter')
        return
      }

      const transport = sseTransports.get(sessionId)
      if (!transport) {
        res.status(404).send('Session not found')
        return
      }

      await transport.handlePostMessage(req, res, req.body)
    })
  }

  await preloadRedisTools()

  startConfigFileWatcher()

  await new Promise<void>((resolve, reject) => {
    const httpServer = app.listen(options.port, options.host, () => resolve())
    httpServer.on('error', reject)
  })

  const baseUrl = formatBaseUrl(options.host, options.port)
  console.error(`MiddleTool MCP Server v${SERVER_VERSION} started (http)`)
  console.error(`Config: ${getDefaultConfigPath()}`)
  console.error(`Streamable HTTP: ${baseUrl}${options.mcpPath}`)
  if (options.enableLegacySse) {
    console.error(`Legacy SSE: ${baseUrl}${options.legacySsePath}`)
    console.error(`Legacy messages: ${baseUrl}${options.legacyMessagesPath}`)
  }
  console.error(`Health: ${baseUrl}/health`)
  console.error(`Connections API: ${baseUrl}/api/connections`)
  console.error(`Connection status API: ${baseUrl}/api/connections/status`)
  console.error(`Config reload API: POST ${baseUrl}/admin/reload`)
  if (apiKey) {
    console.error('HTTP API Key: enabled (Authorization: Bearer or X-API-Key)')
  }
}
