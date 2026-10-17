import type { ComponentProps, ComponentType } from 'react'
import { createLink, useNavigate } from '@tanstack/react-router'
import { GraduationCapIcon, LayoutDashboardIcon, LogOutIcon, MoonIcon, SettingsIcon, SunIcon, UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { type MessageKey, useT } from '@/i18n'
import { cn } from '@/lib/cn'
import { signedOut, useAuth } from '@/lib/auth'
import { useLogout, useSchool } from '@/lib/queries'
import { toggleTheme, useResolvedTheme } from '@/lib/theme'
import { LocaleSwitch } from './LocaleSwitch'
import { Logo } from './Logo'

const SCREENS: readonly { path: '/prehlad' | '/kurzy' | '/ziaci' | '/nastavenia'; title: MessageKey; icon: ComponentType<{ className?: string }> }[] = [
  { path: '/prehlad', title: 'nav.overview', icon: LayoutDashboardIcon },
  { path: '/kurzy', title: 'nav.courses', icon: GraduationCapIcon },
  { path: '/ziaci', title: 'nav.students', icon: UsersIcon },
  { path: '/nastavenia', title: 'nav.school', icon: SettingsIcon },
]

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

/** Phones (under 900px): a top strip with the four screens and sign-out, since the sidebar is hidden. */
export function MobileNav() {
  const t = useT()
  const logout = useLogout()
  const navigate = useNavigate()
  return (
    <nav aria-label={t('nav.label')} className="flex items-center gap-1 overflow-x-auto border-b border-line bg-canvas-subtle px-2 py-1.5 desk:hidden">
      <Logo className="mr-1 size-6 flex-none" />
      {SCREENS.map((s) => (
        <NavItem key={s.path} to={s.path} icon={s.icon} className="h-9 flex-none px-2.5">
          {t(s.title)}
        </NavItem>
      ))}
      <LocaleSwitch className="ml-auto flex-none" />
      <Button
        variant="ghost"
        size="sm"
        icon
        aria-label={t('nav.signOut')}
        className="flex-none"
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => {
              signedOut()
              void navigate({ to: '/prehlad' })
            },
          })
        }
      >
        <LogOutIcon aria-hidden />
      </Button>
    </nav>
  )
}

/** Desktop sidebar (900px and up). */
export function Sidebar() {
  const t = useT()
  const auth = useAuth()
  const school = useSchool()
  const logout = useLogout()
  const navigate = useNavigate()
  const dark = useResolvedTheme() === 'dark'
  return (
    <aside aria-label={t('nav.label')} className="flex w-sidebar min-h-0 flex-none flex-col bg-canvas-subtle px-2 pt-3 pb-3 max-desk:hidden">
      <div className="mb-4 flex h-8 items-center gap-2 px-2">
        <Logo className="size-6 flex-none" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-sm font-semibold text-fg">{t('app.brand')}</span>
          <span className="truncate text-2xs text-subtle">{school.data?.name ?? t('app.tagline')}</span>
        </span>
      </div>
      <nav aria-label={t('nav.main')} className="flex flex-col gap-px">
        {SCREENS.map((s) => (
          <NavItem key={s.path} to={s.path} icon={s.icon}>
            {t(s.title)}
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
            <span className="truncate text-2xs text-subtle">{auth.me?.role === 'admin' ? t('role.admin') : t('role.instructor')}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 px-1">
          <Tooltip content={dark ? t('nav.lightMode') : t('nav.darkMode')}>
            <Button variant="ghost" size="sm" icon aria-label={dark ? t('nav.lightMode') : t('nav.darkMode')} onClick={toggleTheme}>
              {dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
            </Button>
          </Tooltip>
          <LocaleSwitch />
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
            <LogOutIcon aria-hidden /> {t('nav.signOut')}
          </Button>
        </div>
      </div>
    </aside>
  )
}
