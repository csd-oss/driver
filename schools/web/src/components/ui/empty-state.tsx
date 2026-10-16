import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>
  title?: ReactNode
  /** Explanation; plain children also work for one-line empty states. */
  children?: ReactNode
  /** Primary next step, usually a Button. */
  action?: ReactNode
  /** Dashed box (default) for inline lists; `plain` for full-page empties. */
  variant?: 'boxed' | 'plain'
  className?: string
}

/** "Nothing here yet" with the next step. */
export function EmptyState({ icon: Icon, title, children, action, variant = 'boxed', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-4 text-center',
        variant === 'boxed' ? 'rounded-lg border border-dashed border-line-strong py-8' : 'py-16',
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 grid size-10 place-items-center rounded-lg bg-sunken text-subtle">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      {title && <p className="text-base font-semibold text-fg">{title}</p>}
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}
