import { Link, Outlet, type ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useLocale, useT } from '@/i18n'
import { errorMessage, isApiError } from '@/lib/api'

/** Switching the language remounts the routed tree (the `key`), so every string re-reads. */
export function RootLayout() {
  const locale = useLocale()
  return (
    <TooltipProvider>
      <Outlet key={locale} />
      <Toaster />
    </TooltipProvider>
  )
}

export function RootError({ error, reset }: ErrorComponentProps) {
  const t = useT()
  const offline = isApiError(error) && error.status === 0
  return (
    <main className="grid min-h-full place-items-center px-4">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold text-fg">{offline ? t('root.offlineTitle') : t('root.errorTitle')}</h1>
        <p className="text-sm text-muted">{errorMessage(error)}</p>
        <Button variant="primary" onClick={reset}>
          {t('common.retry')}
        </Button>
      </div>
    </main>
  )
}

export function NotFound() {
  const t = useT()
  return (
    <main className="grid min-h-full place-items-center text-sm text-muted">
      <p>
        {t('root.notFound')}{' '}
        <Link to="/prehlad" className="text-accent-text underline">
          {t('root.backToOverview')}
        </Link>
      </p>
    </main>
  )
}
