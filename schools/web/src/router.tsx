import { Outlet, createRootRoute, createRoute, createRouter, lazyRouteComponent, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/shell/AppShell'
import { NotFound, RootError, RootLayout } from '@/components/shell/RootLayout'

const rootRoute = createRootRoute({ component: RootLayout, errorComponent: RootError, notFoundComponent: NotFound })

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell })

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/prehlad', replace: true })
  },
  component: Outlet,
})

const overviewRoute = createRoute({ getParentRoute: () => appRoute, path: '/prehlad', component: lazyRouteComponent(() => import('@/features/dashboard')) })
const groupsRoute = createRoute({ getParentRoute: () => appRoute, path: '/kurzy', component: lazyRouteComponent(() => import('@/features/groups')) })
const groupRoute = createRoute({ getParentRoute: () => appRoute, path: '/kurzy/$groupId', component: lazyRouteComponent(() => import('@/features/groups/detail')) })
const studentsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/ziaci',
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === 'string' ? s.q : undefined, kurz: typeof s.kurz === 'string' ? s.kurz : undefined }),
  component: lazyRouteComponent(() => import('@/features/students')),
})
const studentRoute = createRoute({ getParentRoute: () => appRoute, path: '/ziaci/$studentId', component: lazyRouteComponent(() => import('@/features/students/detail')) })
const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: '/nastavenia', component: lazyRouteComponent(() => import('@/features/settings')) })

export const routeTree = rootRoute.addChildren([
  appRoute.addChildren([indexRoute, overviewRoute, groupsRoute, groupRoute, studentsRoute, studentRoute, settingsRoute]),
])

export function createAppRouter() {
  return createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
