import { useCallback, useEffect, useState } from 'react'
import type { Environment, MiddlewareConnection } from '../types'

export function useEnvironments() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await window.middleTool.env.list()
      setEnvironments(data)
    } catch (err) {
      console.error('加载环境失败', err)
      setEnvironments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { environments, loading, refresh }
}

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
