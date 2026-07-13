import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { UvxDetectResult } from '../../../shared/types/mcp'

const UV_DOCS_URL = 'https://docs.astral.sh/uv/getting-started/installation/'

function uvxBinaryName(): string {
  return process.platform === 'win32' ? 'uvx.exe' : 'uvx'
}

function commonUvxPaths(): string[] {
  const home = os.homedir()
  const bin = uvxBinaryName()
  return [
    path.join(home, '.local', 'bin', bin),
    path.join(home, '.cargo', 'bin', bin)
  ]
}

function tryResolveFromPath(command: string): string | null {
  try {
    const lookup = process.platform === 'win32' ? `where.exe ${command}` : `which ${command}`
    const output = execSync(lookup, { encoding: 'utf-8', timeout: 5000, windowsHide: true }).trim()
    const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first && fs.existsSync(first)) return first
  } catch {
    // not in PATH
  }
  return null
}

function getInstallCommand(): string {
  if (process.platform === 'win32') {
    return 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
  }
  return 'curl -LsSf https://astral.sh/uv/install.sh | sh'
}

export function detectUvx(): UvxDetectResult {
  const installCommand = getInstallCommand()

  const fromPath = tryResolveFromPath('uvx')
  if (fromPath) {
    return { installed: true, inPath: true, path: fromPath, installCommand, docsUrl: UV_DOCS_URL }
  }

  for (const candidate of commonUvxPaths()) {
    if (fs.existsSync(candidate)) {
      return { installed: true, inPath: false, path: candidate, installCommand, docsUrl: UV_DOCS_URL }
    }
  }

  const uvPath = tryResolveFromPath('uv')
  if (uvPath) {
    const sibling = path.join(path.dirname(uvPath), uvxBinaryName())
    if (fs.existsSync(sibling)) {
      return { installed: true, inPath: false, path: sibling, installCommand, docsUrl: UV_DOCS_URL }
    }
  }

  return { installed: false, inPath: false, path: null, installCommand, docsUrl: UV_DOCS_URL }
}
