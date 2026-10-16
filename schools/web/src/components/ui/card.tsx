import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** Bordered surface, 8px radius (prototype `.card`). Prefer hairlines over cards in dense views. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-lg border border-line bg-surface', className)} {...props} />
}

/** Small muted section heading (prototype `.section-title`). */
export function SectionTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('flex items-center gap-2 text-xs font-semibold text-muted', className)} {...props} />
}

/** Hairline divider (prototype `.divider`). */
export function Divider({ className, ...props }: ComponentProps<'hr'>) {
  return <hr className={cn('m-0 h-px border-0 bg-line', className)} {...props} />
}
