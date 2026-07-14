import fs from 'node:fs'
import path from 'node:path'

/** electron-vite 开发时 app.getAppPath() 可能不是仓库根目录，用 main 输出目录反推 */
export function resolveDevProjectRoot(appPath: string, mainDirname: string): string {
  const fromMain = path.resolve(mainDirname, '..', '..')
  if (fs.existsSync(path.join(fromMain, 'package.json'))) {
    return fromMain
  }
  if (fs.existsSync(path.join(appPath, 'package.json'))) {
    return appPath
  }
  return fromMain
}

export function resolveAppRoot(isPackaged: boolean, appPath: string, mainDirname: string): string {
  return isPackaged ? appPath : resolveDevProjectRoot(appPath, mainDirname)
}
