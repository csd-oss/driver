import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeftIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/loading'
import { errorMessage } from '@/lib/api'

/** Page frame: reading width, title row, optional back link. */
export function Page({ title, back, description, actions, children, wide = false }: { title: ReactNode; back?: { to: string; label: string }; description?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'w-full px-6 py-6 max-desk:px-4' : 'mx-auto w-full max-w-content px-6 py-6 max-desk:px-4'}>
      {back && (
        <Link to={back.to} className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
          <ChevronLeftIcon aria-hidden className="size-3.5" /> {back.label}
        </Link>
      )}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold text-fg">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

export function Loading({ label = 'Načítava sa' }: { label?: string }) {
  return (
    <div className="grid h-40 place-items-center">
      <Spinner label={label} size="lg" />
    </div>
  )
}

export function LoadError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
      {errorMessage(error)}
    </p>
  )
}

export function Section({ title, actions, children, className }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
