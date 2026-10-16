import type { ComponentType, ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Required when `label` is icon-only or not text. */
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T
  onValueChange: (value: T) => void
  /** Names the group, e.g. "View" or "Scale". */
  'aria-label': string
  className?: string
}

/**
 * Prototype `.seg` (List / Board, Week / Month / Quarter). Single choice that
 * can't be cleared; arrow keys move between options.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={props['aria-label']}
      className={cn('inline-flex gap-0.5 rounded-md border border-line bg-sunken p-0.5', className)}
    >
      {options.map(({ value: v, label, icon: Icon, ariaLabel, disabled }) => (
        <ToggleGroup.Item
          key={v}
          value={v}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'inline-flex h-[calc(var(--control-h)-6px)] items-center gap-1 rounded-sm px-2 text-xs pointer-coarse:h-9 pointer-coarse:px-3 font-medium text-muted outline-none',
            'transition-colors duration-(--dur-instant) hover:text-fg focus-visible:ring-3 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            'data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-sm',
          )}
        >
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
