import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Outlet } from '@tanstack/react-router'
import { MAIN_ID } from '@/components/ui/focus-return'
import { useT } from '@/i18n'
import { signedIn, signedOut, useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { MobileNav, Sidebar } from './Sidebar'

/**
 * The dashboard, or the sign-in screen. Until `me` answers nothing renders (one round trip), so
 * a signed-out visit never flashes screens that would fail.
 */
export function AppShell() {
  const t = useT()
  const me = useMe()
  const auth = useAuth()
  const qc = useQueryClient()
  useEffect(() => {
    if (me.data) signedIn(me.data)
    else if (me.isError) {
      signedOut()
      // The session ended: nothing of the school may stay cached for the next sign-in.
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
    }
  }, [me.data, me.isError, qc])
  if (auth.status === 'signed-out') return <SignInScreen />
  if (auth.status === 'unknown') return <div aria-busy="true" aria-label={t('common.loading')} className="h-dvh bg-canvas-subtle" />
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas-subtle">
      <Sidebar />
      <div className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs max-desk:m-0 max-desk:rounded-none max-desk:border-0 max-desk:shadow-none">
        <MobileNav />
        <main id={MAIN_ID} tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
