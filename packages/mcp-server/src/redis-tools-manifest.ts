import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Tool } from '@modelcontextprotocol/sdk/types.js'

const MANIFEST_FILE = 'redis-tools-manifest.json'

function resolveManifestPath(): string {
  const override = process.env.REDIS_TOOLS_MANIFEST_PATH?.trim()
  if (override) return override

  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.join(here, '..', 'runtime', MANIFEST_FILE)
}

export function loadBundledRedisTools(): Tool[] | null {
  const manifestPath = resolveManifestPath()
  if (!fs.existsSync(manifestPath)) return null

  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as Tool[]
    return Array.isArray(raw) ? raw : null
  } catch {
    return null
  }
}

export function getManifestPath(): string {
  return resolveManifestPath()
}
