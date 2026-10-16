import { cn } from '@/lib/cn'

/** The Driver mark: a speedometer needle, in the app's indigo. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('text-accent', className)}>
      <rect width="64" height="64" rx="14" fill="currentColor" />
      <path d="M18 40c0-9 6-16 14-16s14 7 14 16" fill="none" stroke="var(--accent-fg)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="40" r="4" fill="var(--accent-fg)" />
      <path d="M32 40l9-9" stroke="var(--accent-fg)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}
