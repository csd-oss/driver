import { Badge } from '@/components/ui/badge'
import { Meter } from '@/components/ui/meter'
import { cn } from '@/lib/cn'
import { READINESS_LABEL, READINESS_TONE } from '@/lib/format'
import type { Progress } from '@/lib/types'

type MeterTone = 'in' | 'default' | 'warn' | 'over'
const tone = (score: number): MeterTone => (score >= 97 ? 'in' : score >= 85 ? 'default' : score >= 60 ? 'warn' : 'over')

/** Score bar + number; "bez aplikácie" when the student never linked the app. */
export function ReadinessBar({ progress, className, compact = false }: { progress: Progress; className?: string; compact?: boolean }) {
  if (!progress.linked) return <span className={cn('text-xs text-subtle', className)}>bez aplikácie</span>
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Meter value={progress.score} max={100} label="Pripravenosť" tone={tone(progress.score)} className={compact ? 'w-16' : 'w-24'} />
      <span className="w-7 text-right text-sm font-semibold tabular-nums text-fg">{progress.score}</span>
    </div>
  )
}

export function ReadinessBadge({ progress }: { progress: Progress }) {
  if (!progress.linked) return <Badge tone="neutral">bez aplikácie</Badge>
  return <Badge tone={READINESS_TONE[progress.label]}>{READINESS_LABEL[progress.label]}</Badge>
}

/** A big number with a label, for the overview rows. */
export function StatTile({ label, value, hint, tone = 'default' }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'default' | 'accent' | 'success' | 'warning' }) {
  const color = { default: 'text-fg', accent: 'text-accent-text', success: 'text-success-text', warning: 'text-warning-text' }[tone]
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3">
      <span className="text-xs text-muted">{label}</span>
      <span className={cn('text-2xl font-semibold tabular-nums', color)}>{value}</span>
      {hint && <span className="truncate text-xs text-subtle">{hint}</span>}
    </div>
  )
}

/** Four horizontal bars, one per readiness component, as the app shows them. */
export function ComponentBars({ progress }: { progress: Progress }) {
  const rows: { label: string; value: number; weight: string }[] = [
    { label: 'Chyby', value: progress.components.mistakes, weight: '30 %' },
    { label: 'Úspešnosť za 7 dní', value: progress.components.performance, weight: '25 %' },
    { label: 'Skúšobné testy', value: progress.components.mock, weight: '30 %' },
    { label: 'Precvičené otázky', value: progress.components.coverage, weight: '15 %' },
  ]
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <span className="text-muted">
            {r.label} <span className="text-2xs text-subtle">({r.weight})</span>
          </span>
          <Meter value={r.value} max={100} label={r.label} tone="neutral" />
          <span className="w-8 text-right tabular-nums text-fg">{Math.round(r.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Tiny inline trend of readiness snapshots (SVG polyline). */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return null
  const w = 120
  const h = 28
  const step = w / (points.length - 1)
  const d = points.map((p, i) => `${(i * step).toFixed(1)},${(h - (Math.max(0, Math.min(100, p)) / 100) * (h - 2) - 1).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden className={cn('overflow-visible text-accent', className)}>
      <polyline points={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
