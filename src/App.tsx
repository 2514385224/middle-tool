import { useState } from 'react'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import EnvironmentConfig from './pages/EnvironmentConfig'
import MiddlewareConfig from './pages/MiddlewareConfig'
import MiddlewareCatalog from './pages/MiddlewareCatalog'
import McpExport from './pages/McpExport'
import type { AppRoute } from './router/types'

export default function App() {
  const [route, setRoute] = useState<AppRoute>({ page: 'dashboard' })

  const renderPage = () => {
    switch (route.page) {
      case 'dashboard':
        return <Dashboard onNavigate={setRoute} />
      case 'environment-config':
        return (
          <EnvironmentConfig
            view={route.view ?? 'list'}
            environmentId={route.environmentId}
            onNavigate={setRoute}
          />
        )
      case 'middleware-config':
        return (
          <MiddlewareConfig
            view={route.view ?? 'list'}
            middlewareType={route.middlewareType}
            connectionId={route.connectionId}
            onNavigate={setRoute}
          />
        )
      case 'middleware-catalog':
        return <MiddlewareCatalog />
      case 'mcp-export':
        return <McpExport />
    }
  }

  return (
    <AppLayout route={route} onNavigate={setRoute}>
      {renderPage()}
    </AppLayout>
  )
}
