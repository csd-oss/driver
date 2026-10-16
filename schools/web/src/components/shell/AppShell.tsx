import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { MAIN_ID } from '@/components/ui/focus-return'
import { signedIn, signedOut, useAuth } from '@/lib/auth'
import { useMe } from '@/lib/queries'
import { SignInScreen } from '@/features/auth/SignInScreen'
import { Sidebar } from './Sidebar'

/**
 * The dashboard, or the sign-in screen. Until `me` answers nothing renders (one round trip), so
 * a signed-out visit never flashes screens that would fail.
 */
export function AppShell() {
  const me = useMe()
  const auth = useAuth()
  useEffect(() => {
    if (me.data) signedIn(me.data)
    else if (me.isError) signedOut()
  }, [me.data, me.isError])
  if (auth.status === 'signed-out') return <SignInScreen />
  if (auth.status === 'unknown') return <div aria-busy="true" aria-label="Načítava sa" className="h-dvh bg-canvas-subtle" />
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas-subtle">
      <Sidebar />
      <div className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs max-desk:m-0 max-desk:rounded-none max-desk:border-0 max-desk:shadow-none">
        <main id={MAIN_ID} tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
