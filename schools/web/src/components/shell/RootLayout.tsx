import { Link, Outlet, type ErrorComponentProps } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { errorMessage, isApiError } from '@/lib/api'

export function RootLayout() {
  return (
    <TooltipProvider>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  )
}

export function RootError({ error, reset }: ErrorComponentProps) {
  const offline = isApiError(error) && error.status === 0
  return (
    <main className="grid min-h-full place-items-center px-4">
      <div role="alert" className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold text-fg">{offline ? 'Server neodpovedá' : 'Niečo sa pokazilo'}</h1>
        <p className="text-sm text-muted">{errorMessage(error)}</p>
        <Button variant="primary" onClick={reset}>
          Skúsiť znova
        </Button>
      </div>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="grid min-h-full place-items-center text-sm text-muted">
      <p>
        Táto stránka neexistuje.{' '}
        <Link to="/prehlad" className="text-accent-text underline">
          Späť na prehľad
        </Link>
      </p>
    </main>
  )
}
