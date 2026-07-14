/**
 * 构建 Linux 解压即用 MCP 服务包（tar.gz）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

import { ROCKETMQ_JAR_DEST, stageRocketmqJar } from './resolve-rocketmq-jar.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function copyMcpServerBundle(destRoot) {
  const src = path.join(root, 'packages', 'mcp-server')
  if (!fs.existsSync(path.join(src, 'dist', 'index.js'))) {
    throw new Error('packages/mcp-server/dist 不存在，请先运行 npm run mcp:build')
  }

  fs.mkdirSync(destRoot, { recursive: true })
  fs.cpSync(path.join(src, 'dist'), path.join(destRoot, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(src, 'package.json'), path.join(destRoot, 'package.json'))

  const runtimeSrc = path.join(src, 'runtime')
  if (fs.existsSync(runtimeSrc)) {
    fs.cpSync(runtimeSrc, path.join(destRoot, 'runtime'), { recursive: true })
  }

  console.log('[linux-pack] 安装 mcp-server 生产依赖…')
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: destRoot,
    stdio: 'inherit',
    env: { ...process.env, npm_config_update_notifier: 'false' }
  })
}

function stageDeployAssets(destRoot) {
  const deployRoot = path.join(root, 'deploy', 'linux')
  fs.mkdirSync(path.join(destRoot, 'bin'), { recursive: true })
  fs.mkdirSync(path.join(destRoot, 'config'), { recursive: true })

  fs.copyFileSync(path.join(deployRoot, 'start.sh'), path.join(destRoot, 'bin', 'start.sh'))
  fs.copyFileSync(
    path.join(deployRoot, 'config', 'middle-tool-config.json.example'),
    path.join(destRoot, 'config', 'middle-tool-config.json.example')
  )
  fs.copyFileSync(path.join(deployRoot, 'README.md'), path.join(destRoot, 'README.md'))
}

function createTarball(sourceDir, archivePath) {
  fs.mkdirSync(path.dirname(archivePath), { recursive: true })
  if (process.platform === 'win32') {
    execSync(`tar -czf "${archivePath}" -C "${path.dirname(sourceDir)}" "${path.basename(sourceDir)}"`, {
      stdio: 'inherit'
    })
    return
  }

  execSync(`tar -czf "${archivePath}" -C "${path.dirname(sourceDir)}" "${path.basename(sourceDir)}"`, {
    stdio: 'inherit'
  })
}

function main() {
  const version = readJson(path.join(root, 'package.json')).version
  const bundleName = `middle-tool-mcp-linux-x64-${version}`
  const stagingRoot = path.join(root, 'release', 'staging', bundleName)
  const archivePath = path.join(root, 'release', `${bundleName}.tar.gz`)

  fs.rmSync(stagingRoot, { recursive: true, force: true })

  stageRocketmqJar({ required: true })
  copyMcpServerBundle(stagingRoot)
  stageDeployAssets(stagingRoot)

  const jarDest = path.join(stagingRoot, 'runtime', 'rocketmq-mcp.jar')
  if (!fs.existsSync(jarDest)) {
    fs.mkdirSync(path.dirname(jarDest), { recursive: true })
    fs.copyFileSync(ROCKETMQ_JAR_DEST, jarDest)
  }

  createTarball(stagingRoot, archivePath)

  const sizeMb = (fs.statSync(archivePath).size / 1024 / 1024).toFixed(1)
  console.log(`[linux-pack] 已生成: ${archivePath} (${sizeMb} MB)`)
}

main()
