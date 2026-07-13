import { useCallback, useEffect, useState } from 'react'
import type { MiddlewareConnection } from '../types'

export function useConnections(environmentId?: string) {
  const [connections, setConnections] = useState<MiddlewareConnection[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await window.middleTool.conn.list(environmentId)
      setConnections(data)
    } catch (err) {
      console.error('加载连接失败', err)
      setConnections([])
    } finally {
      setLoading(false)
    }
  }, [environmentId])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { connections, loading, refresh }
}
