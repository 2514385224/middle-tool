/**

 * 打包前准备：将统一 mcp-server 及生产依赖复制到 build-resources，

 * 供 electron-builder extraResources 打入安装包。

 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function copyWorkspacePackage(packageName: string, destName = packageName) {
  const src = path.join(root, 'packages', packageName)
  const dest = path.join(root, 'build-resources', destName)

  if (!fs.existsSync(path.join(src, 'dist', 'index.js'))) {
    throw new Error(`packages/${packageName}/dist 不存在，请先运行 npm run mcp:build`)
  }

  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })

  fs.cpSync(path.join(src, 'dist'), path.join(dest, 'dist'), { recursive: true })
  fs.copyFileSync(path.join(src, 'package.json'), path.join(dest, 'package.json'))

  const runtimeSrc = path.join(src, 'runtime')
  if (fs.existsSync(runtimeSrc)) {
    fs.cpSync(runtimeSrc, path.join(dest, 'runtime'), { recursive: true })
  }

  console.log(`[pack] 安装 ${packageName} 生产依赖…`)
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: dest,
    stdio: 'inherit',
    env: { ...process.env, npm_config_update_notifier: 'false' }
  })

  console.log(`[pack] ${destName} 资源已就绪:`, dest)
  return dest
}

const mcpDest = copyWorkspacePackage('mcp-server')

const rocketmqJarSrc = path.join(root, 'packages', 'rocketmq-mcp-server', 'runtime', 'rocketmq-mcp.jar')
const rocketmqJarDest = path.join(mcpDest, 'runtime', 'rocketmq-mcp.jar')

if (fs.existsSync(rocketmqJarSrc)) {
  fs.mkdirSync(path.dirname(rocketmqJarDest), { recursive: true })
  fs.copyFileSync(rocketmqJarSrc, rocketmqJarDest)
  console.log('[pack] RocketMQ JAR 已复制到 mcp-server/runtime')
} else {
  console.warn('[pack] 警告: rocketmq-mcp.jar 不存在，请先运行 npm run rocketmq-mcp:java:build')
}
