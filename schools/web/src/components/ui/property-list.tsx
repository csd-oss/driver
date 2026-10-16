import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Two-column label / value grid (prototype `.props`: item sidebar, release
 * editor) that adapts to its own width, not the viewport's (D60): the wrapper
 * is a size container and under 240px each label stacks above its value, so
 * a narrow rail or card never gives half its width to labels.
 */
export function PropertyList({ className, labelWidth, style, ...props }: ComponentProps<'dl'> & { labelWidth?: string }) {
  return (
    <div className="@container/props min-w-0">
      <dl
        className={cn(
          'grid grid-cols-[var(--props-label,96px)_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5',
          '@max-[240px]/props:grid-cols-[minmax(0,1fr)] @max-[240px]/props:gap-y-0',
          className,
        )}
        style={labelWidth ? { ['--props-label' as string]: labelWidth, ...style } : style}
        {...props}
      />
    </div>
  )
}

export interface PropertyProps {
  label: ReactNode
  children: ReactNode
  className?: string
}

/** One row: `<dt>` label + `<dd>` value. Stacked (narrow), the label sits on top with a little air above. */
export function Property({ label, children, className }: PropertyProps) {
  return (
    <>
      <dt className="min-h-7 content-center text-xs text-subtle @max-[240px]/props:mt-1.5 @max-[240px]/props:min-h-0 @max-[240px]/props:first-of-type:mt-0">
        {label}
      </dt>
      <dd className={cn('m-0 min-w-0', className)}>{children}</dd>
    </>
  )
}

/**
 * Inline value button that opens a picker (prototype `.prop-btn`). Aligns
 * text with the column. It never wraps, so an icon stays with its text; put
 * long text in a `truncate` span. Multi-value buttons (assignees, labels)
 * opt back in with `flex-wrap h-auto`.
 */
export function PropertyButton({ className, type = 'button', ...props }: ComponentProps<'button'>) {
  return (
    <button
      type={type}
      className={cn(
        '-ml-2 inline-flex h-7 max-w-[calc(100%+0.5rem)] min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm whitespace-nowrap text-fg outline-none',
        'hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
        '[&>svg]:flex-none',
        className,
      )}
      {...props}
    />
  )
}
