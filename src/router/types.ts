/** 应用路由 */
export type AppRoute =
  | { page: 'dashboard' }
  | {
      page: 'middleware-config'
      view: 'list' | 'create' | 'edit'
      middlewareType?: string
      connectionId?: string
    }
  | { page: 'middleware-catalog' }
  | { page: 'mcp-export' }

export function middlewareConfigRoute(
  view: 'list' | 'create' | 'edit' = 'list',
  opts?: { middlewareType?: string; connectionId?: string }
): AppRoute {
  return {
    page: 'middleware-config',
    view,
    middlewareType: opts?.middlewareType,
    connectionId: opts?.connectionId
  }
}

/** 判断侧边栏主菜单项是否激活 */
export function isMainNavActive(route: AppRoute, page: AppRoute['page']): boolean {
  return route.page === page
}
