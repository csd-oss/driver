import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'
import { describeShortcut, formatShortcut } from '@/lib/shortcuts'

export type KbdTone = 'default' | 'accent' | 'inverse'

const tones: Record<KbdTone, string> = {
  default: 'border-line bg-sunken text-subtle',
  accent: 'border-transparent bg-accent-fg/18 text-accent-fg',
  inverse: 'border-on-inverse/30 bg-transparent text-on-inverse',
}

/** One key cap (prototype `.kbd`). */
export function Kbd({ className, tone = 'default', ...props }: ComponentProps<'kbd'> & { tone?: KbdTone }) {
  return (
    <kbd
      className={cn(
        'inline-grid h-4.5 min-w-4.5 place-items-center rounded-xs border px-1 font-sans text-2xs leading-none font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}

export interface KeyHintProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Same syntax as useShortcut: 'c', 'mod+k', 'shift+s', 'g d'. */
  keys: string
  tone?: KbdTone
  /** Keep visible under 900px. Default false: hints hide on touch-sized screens. */
  always?: boolean
  /** Read the keys to screen readers ("⌘K", "G then D"). Default false: hints are visual,
   *  put `aria-keyshortcuts` on the control instead. */
  announce?: boolean
}

/** Key caps for a shortcut, with "then" between sequence steps. */
export function KeyHint({ keys, tone = 'default', always = false, announce = false, className, ...props }: KeyHintProps) {
  const steps = formatShortcut(keys)
  return (
    <span
      aria-hidden={announce ? undefined : true}
      className={cn('inline-flex flex-none items-center gap-0.5', !always && 'max-desk:hidden', className)}
      {...props}
    >
      {steps.map((caps, i) => (
        <span key={i} aria-hidden className="inline-flex items-center gap-0.5">
          {i > 0 && <span className={cn('mx-0.5 text-2xs', tone === 'default' ? 'text-subtle' : 'opacity-70')}>then</span>}
          {caps.map((k, j) => (
            <Kbd key={j} tone={tone}>
              {k}
            </Kbd>
          ))}
        </span>
      ))}
      {announce && <span className="sr-only">{describeShortcut(keys)}</span>}
    </span>
  )
}
