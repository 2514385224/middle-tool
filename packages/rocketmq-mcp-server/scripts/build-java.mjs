/**
 * 从 francisoliverlee/rocketmq-mcp 构建 Java Admin 桥接 JAR，输出到 runtime/
 * 开发/CI 构建用；发布安装包会预置产物，终端用户无需执行。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')
const vendorDir = path.join(pkgRoot, 'vendor', 'rocketmq-mcp')
const runtimeDir = path.join(pkgRoot, 'runtime')
const repo = 'https://github.com/francisoliverlee/rocketmq-mcp.git'

function run(cmd, cwd) {
  console.log(`[java:build] ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit', shell: true })
}

function findBuiltJar(targetDir) {
  if (!fs.existsSync(targetDir)) return null
  const jars = fs
    .readdirSync(targetDir)
    .filter((f) => f.startsWith('rocketmq-mcp') && f.endsWith('.jar') && !f.includes('sources'))
  return jars.length ? path.join(targetDir, jars[0]) : null
}

if (!fs.existsSync(vendorDir)) {
  fs.mkdirSync(path.dirname(vendorDir), { recursive: true })
  run(`git clone --depth 1 ${repo} "${vendorDir}"`, pkgRoot)
} else {
  console.log('[java:build] vendor 已存在，跳过 clone')
}

run('mvn -q package -DskipTests', vendorDir)

const builtJar = findBuiltJar(path.join(vendorDir, 'target'))
if (!builtJar) {
  throw new Error('Maven 构建完成但未找到 target/rocketmq-mcp-*.jar')
}

fs.mkdirSync(runtimeDir, { recursive: true })
const dest = path.join(runtimeDir, 'rocketmq-mcp.jar')
fs.copyFileSync(builtJar, dest)
console.log('[java:build] 已输出:', dest)
