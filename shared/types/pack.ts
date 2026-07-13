export interface PackBuildResult {
  available: boolean
  success: boolean
  outputDir: string
  artifacts: string[]
  log: string
  error?: string
}

export interface PackInfo {
  available: boolean
  outputDir: string
  command: string
  artifacts: string[]
}
