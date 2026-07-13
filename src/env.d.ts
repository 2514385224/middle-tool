/// <reference types="vite/client" />

import type { MiddleToolAPI } from '../electron/preload/index'

declare global {
  interface Window {
    middleTool: MiddleToolAPI
  }
}

export {}
