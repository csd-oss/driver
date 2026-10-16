import type { ComponentProps } from 'react'
import { LoaderCircleIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface SpinnerProps {
  /** Screen-reader text. Pass `null` when a parent already announces the busy state. */
  label?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const spinnerSizes = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }

/** Indeterminate progress. Announced politely unless `label` is null. */
export function Spinner({ label = 'Loading', size = 'md', className }: SpinnerProps) {
  const icon = <LoaderCircleIcon aria-hidden className={cn('animate-spin motion-reduce:animate-none', spinnerSizes[size])} />
  if (label === null) return <span className={cn('inline-flex text-subtle', className)}>{icon}</span>
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-subtle', className)}>
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  )
}

export interface SkeletonProps extends ComponentProps<'span'> {
  /** 'text' is one line of 13px text; 'block' fills its box; 'circle' for avatars. */
  shape?: 'text' | 'block' | 'circle'
}

/** Placeholder while content loads. Decorative: wrap regions in aria-busy. */
export function Skeleton({ shape = 'text', className, ...props }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-shimmer bg-hover motion-reduce:animate-none',
        shape === 'text' && 'h-3 w-full rounded-xs',
        shape === 'block' && 'h-full w-full rounded-md',
        shape === 'circle' && 'size-5.5 rounded-full',
        className,
      )}
      {...props}
    />
  )
}
