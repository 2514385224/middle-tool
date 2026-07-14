/**
 * 先构建 Linux 包，再基于 tar.gz 构建 Docker 镜像（不在镜像内编译源码）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).version
}

function main() {
  const version = readVersion()
  const tarball = path.join(root, 'release', `middle-tool-mcp-linux-x64-${version}.tar.gz`)
  const imageTag = process.env.MIDDLE_TOOL_DOCKER_IMAGE ?? 'middle-tool-mcp:latest'

  if (!fs.existsSync(tarball)) {
    console.log('[docker] Linux 包不存在，开始构建…')
    execSync('npm run build:linux-mcp', { cwd: root, stdio: 'inherit' })
  }

  if (!fs.existsSync(tarball)) {
    throw new Error(`Linux 包仍未找到: ${tarball}`)
  }

  const sizeMb = (fs.statSync(tarball).size / 1024 / 1024).toFixed(1)
  console.log(`[docker] 使用 Linux 包: ${tarball} (${sizeMb} MB)`)

  execSync(
    [
      'docker build',
      '-f deploy/docker/Dockerfile',
      `--build-arg APP_VERSION=${version}`,
      `-t ${imageTag}`,
      '.'
    ].join(' '),
    { cwd: root, stdio: 'inherit' }
  )

  console.log(`[docker] 镜像已构建: ${imageTag}`)
}

main()
