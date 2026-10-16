import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'warning' | 'danger' | 'success'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-hover text-muted',
  accent: 'bg-accent-soft text-accent-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-danger-soft text-danger-text',
  success: 'bg-success-soft text-success-text',
}

/** Small square-ish tag for roles and states ("You", "Admin", "Soon"). */
export function Badge({ className, tone = 'neutral', ...props }: ComponentProps<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex h-4.5 items-center rounded-xs px-1.5 text-2xs leading-none font-medium whitespace-nowrap',
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  )
}

/** Numeric count pill (prototype `.nav-count`); `hot` for attention (accent fill). */
export function CountBadge({ className, hot = false, ...props }: ComponentProps<'span'> & { hot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-grid h-4.5 min-w-4.5 place-items-center rounded-full px-1.25 text-2xs font-semibold tabular-nums',
        hot ? 'bg-accent text-accent-fg' : 'bg-hover text-muted',
        className,
      )}
      {...props}
    />
  )
}
