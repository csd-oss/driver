import { cn } from '@/lib/cn'

export interface MeterProps {
  value: number
  max?: number
  /** Accessible name, e.g. "Groceries budget". */
  label: string
  /**
   * Fill colour. Default: `over` once value passes max, `warn` from `warnAt`
   * of max, else `default` (accent). `in` for money-in progress, `neutral` for
   * a quiet share bar (category lists).
   */
  tone?: 'default' | 'warn' | 'over' | 'in' | 'neutral'
  /** Share of max (0–1) where the warn tone starts; default 1 (never before over). */
  warnAt?: number
  /** Pace marker: the share of the bar (0–1) that "on pace" would have reached by now. */
  marker?: number
  /** Screen-reader value text, e.g. "€412 of €550, on pace". */
  valueText?: string
  /** `sm` 6px (default) or `md` 8px. */
  size?: 'sm' | 'md'
  className?: string
}

const fills = { default: 'bg-accent', warn: 'bg-warning', over: 'bg-over', in: 'bg-in-fill', neutral: 'bg-out-fill' }

/** Progress / budget bar with an optional pace marker. Over max, the bar is full and turns `--over`. */
export function Meter({ value, max = 100, label, tone, warnAt = 1, marker, valueText, size = 'sm', className }: MeterProps) {
  const ratio = max > 0 ? Math.min(1, Math.max(0, value / max)) : value > 0 ? 1 : 0
  const over = max > 0 ? value > max : value > 0
  const resolved = tone ?? (over ? 'over' : ratio >= warnAt && warnAt < 1 ? 'warn' : 'default')
  const m = marker === undefined ? undefined : Math.min(1, Math.max(0, marker))
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      className={cn('relative rounded-full bg-sunken shadow-[inset_0_0_0_1px_var(--line)]', size === 'md' ? 'h-2' : 'h-1.5', className)}
    >
      <span
        className={cn('block h-full rounded-full transition-[width] duration-(--dur-normal) ease-standard', fills[resolved])}
        style={{ width: `${ratio * 100}%` }}
      />
      {m !== undefined && (
        <span
          aria-hidden
          data-meter-marker
          className="absolute -top-0.75 -bottom-0.75 w-0.5 -translate-x-1/2 rounded-full bg-fg ring-2 ring-surface"
          style={{ left: `${m * 100}%` }}
        />
      )}
    </div>
  )
}
