import type { ComponentProps, ComponentType } from 'react'
import { createLink, useNavigate } from '@tanstack/react-router'
import { GraduationCapIcon, LayoutDashboardIcon, LogOutIcon, MoonIcon, SettingsIcon, SunIcon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { signedOut, useAuth } from '@/lib/auth'
import { useLogout, useSchool } from '@/lib/queries'
import { toggleTheme, useResolvedTheme } from '@/lib/theme'
import { Logo } from './Logo'

export const SCREENS = [
  { path: '/prehlad', title: 'Prehľad', icon: LayoutDashboardIcon },
  { path: '/kurzy', title: 'Kurzy', icon: GraduationCapIcon },
  { path: '/ziaci', title: 'Žiaci', icon: UsersIcon },
  { path: '/nastavenia', title: 'Autoškola', icon: SettingsIcon },
] as const

const navItemClass = [
  'group relative flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-sm text-muted outline-none',
  'transition-[background-color,color] duration-(--dur-instant) ease-standard',
  'hover:bg-hover hover:text-fg focus-visible:ring-3 focus-visible:ring-ring',
  'data-[status=active]:bg-selected data-[status=active]:font-medium data-[status=active]:text-fg',
].join(' ')

function NavAnchor({ icon: Icon, className, children, ...props }: ComponentProps<'a'> & { icon: ComponentType<{ className?: string }> }) {
  return (
    <a className={cn(navItemClass, className)} {...props}>
      <Icon aria-hidden className="size-4 flex-none text-subtle group-data-[status=active]:text-accent-text" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </a>
  )
}

const NavItem = createLink(NavAnchor)

/** Desktop sidebar; on phones it becomes a top strip. */
export function Sidebar() {
  const auth = useAuth()
  const school = useSchool()
  const logout = useLogout()
  const navigate = useNavigate()
  const dark = useResolvedTheme() === 'dark'
  return (
    <aside aria-label="Navigácia" className="flex w-sidebar min-h-0 flex-none flex-col bg-canvas-subtle px-2 pt-3 pb-3 max-desk:hidden">
      <div className="mb-4 flex h-8 items-center gap-2 px-2">
        <Logo className="size-6 flex-none" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold text-fg">Driver</span>
          <span className="truncate text-2xs text-subtle">{school.data?.name ?? 'pre autoškoly'}</span>
        </span>
      </div>
      <nav aria-label="Hlavná" className="flex flex-col gap-px">
        {SCREENS.map((s) => (
          <NavItem key={s.path} to={s.path} icon={s.icon}>
            {s.title}
          </NavItem>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
        <div className="flex min-w-0 items-center gap-2 px-2">
          <span className="grid size-6 flex-none place-items-center rounded-full bg-accent-soft text-2xs font-semibold text-accent-text">
            {auth.me?.name.split(' ').filter(Boolean).slice(-1)[0]?.[0] ?? '?'}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-xs font-medium text-fg">{auth.me?.name}</span>
            <span className="truncate text-2xs text-subtle">{auth.me?.role === 'admin' ? 'správca' : 'inštruktor'}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 px-1">
          <Tooltip content={dark ? 'Svetlý režim' : 'Tmavý režim'}>
            <Button variant="ghost" size="sm" icon aria-label={dark ? 'Svetlý režim' : 'Tmavý režim'} onClick={toggleTheme}>
              {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
            </Button>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => {
                  signedOut()
                  void navigate({ to: '/prehlad' })
                },
              })
            }
          >
            <LogOutIcon aria-hidden /> Odhlásiť
          </Button>
        </div>
      </div>
    </aside>
  )
}
