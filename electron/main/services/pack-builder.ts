import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { app, shell } from 'electron'

import type { PackBuildResult } from '../../../shared/types/pack'

function getProjectRoot(): string {
  return app.getAppPath()
}

export function getReleaseDir(): string {
  return path.join(getProjectRoot(), 'release')
}

export function isPackAvailable(): boolean {
  if (app.isPackaged) return false
  return fs.existsSync(path.join(getProjectRoot(), 'package.json'))
}

function listArtifacts(releaseDir: string): string[] {
  if (!fs.existsSync(releaseDir)) return []
  return fs
    .readdirSync(releaseDir)
    .filter((name) => name.endsWith('.exe'))
    .map((name) => path.join(releaseDir, name))
}

export function getPackInfo() {
  const outputDir = getReleaseDir()
  return {
    available: isPackAvailable(),
    outputDir,
    command: 'npm run pack',
    artifacts: listArtifacts(outputDir)
  }
}

export async function buildWindowsInstaller(): Promise<PackBuildResult> {
  const outputDir = getReleaseDir()

  if (!isPackAvailable()) {
    return {
      available: false,
      success: false,
      outputDir,
      artifacts: [],
      log: '',
      error: '仅开发环境可打包。请在项目目录执行：npm run pack'
    }
  }

  const projectRoot = getProjectRoot()
  const logs: string[] = []

  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(command, ['run', 'build:win'], {
      cwd: projectRoot,
      env: { ...process.env },
      windowsHide: true
    })

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      logs.push(text)
      console.log(`[pack] ${text.trimEnd()}`)
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      logs.push(text)
      console.error(`[pack] ${text.trimEnd()}`)
    })

    child.on('error', (err) => {
      resolve({
        available: true,
        success: false,
        outputDir,
        artifacts: [],
        log: logs.join(''),
        error: err.message
      })
    })

    child.on('close', (code) => {
      const artifacts = listArtifacts(outputDir)
      resolve({
        available: true,
        success: code === 0,
        outputDir,
        artifacts,
        log: logs.join(''),
        error: code === 0 ? undefined : `打包进程退出 code=${code ?? 'null'}`
      })
    })
  })
}

export async function openReleaseDir(): Promise<string> {
  const dir = getReleaseDir()
  fs.mkdirSync(dir, { recursive: true })
  const err = await shell.openPath(dir)
  if (err) throw new Error(err)
  return dir
}
