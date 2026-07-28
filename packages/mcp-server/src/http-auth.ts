import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export function resolveHttpApiKey(): string | undefined {
  const key = process.env.MIDDLE_TOOL_MCP_API_KEY?.trim()
  return key || undefined
}

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]?.trim() || undefined
  return value?.trim() || undefined
}

export function extractHttpApiKey(req: Request): string | undefined {
  const authorization = readHeaderValue(req.headers.authorization)
  if (authorization) {
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization)
    if (bearerMatch?.[1]) return bearerMatch[1].trim()
    return authorization
  }

  return readHeaderValue(req.headers['x-api-key'])
}

function keysEqual(expected: string, provided: string): boolean {
  const expectedBuf = Buffer.from(expected)
  const providedBuf = Buffer.from(provided)
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

export function isHttpApiKeyValid(req: Request, expectedKey: string): boolean {
  const provided = extractHttpApiKey(req)
  if (!provided) return false
  return keysEqual(expectedKey, provided)
}

export function createOptionalApiKeyMiddleware(expectedKey: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expectedKey) {
      next()
      return
    }

    if (isHttpApiKeyValid(req, expectedKey)) {
      next()
      return
    }

    res.status(401).json({
      ok: false,
      error: 'Unauthorized: invalid or missing API key'
    })
  }
}
