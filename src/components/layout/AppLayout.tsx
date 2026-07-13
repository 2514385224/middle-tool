import { ReactNode } from 'react'
import type { AppRoute } from '../../router/types'
import { isMainNavActive } from '../../router/types'
import './AppLayout.css'

interface AppLayoutProps {
  route: AppRoute
  onNavigate: (route: AppRoute) => void
  children: ReactNode
}

const MAIN_NAV: { route: AppRoute; label: string; id: string }[] = [
  { route: { page: 'dashboard' }, label: '概览', id: 'dashboard' },
  { route: { page: 'middleware-catalog' }, label: '中间件目录', id: 'catalog' },
  { route: { page: 'middleware-config', view: 'list' }, label: '中间件配置', id: 'middleware' },
  { route: { page: 'mcp-export' }, label: 'MCP 配置', id: 'mcp' }
]

export default function AppLayout({ route, onNavigate, children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-brand-mark">MT</span>
          <div className="sidebar-brand-text">
            <h1>MiddleTool</h1>
            <p>Middleware MCP</p>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {MAIN_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isMainNavActive(route, item.route.page) ? 'active' : ''}`}
              onClick={() => onNavigate(item.route)}
            >
              <span className="nav-item-bar" aria-hidden />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
