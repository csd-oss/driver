import type { ComponentProps, ComponentType, ReactNode } from 'react'
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

export type CalloutTone = 'default' | 'warn' | 'over'

const tones: Record<CalloutTone, { box: string; icon: string; Icon: ComponentType<{ className?: string }> }> = {
  default: { box: 'border-line bg-sunken', icon: 'text-subtle', Icon: InfoIcon },
  warn: { box: 'border-transparent bg-warn-soft', icon: 'text-warn', Icon: TriangleAlertIcon },
  over: { box: 'border-transparent bg-over-soft', icon: 'text-over', Icon: CircleAlertIcon },
}

export interface CalloutProps extends Omit<ComponentProps<'div'>, 'title'> {
  tone?: CalloutTone
  /** Override the tone's icon; `null` for none. */
  icon?: ComponentType<{ className?: string }> | null
  title?: ReactNode
  /** Buttons under the text. */
  actions?: ReactNode
}

/** Inline note (`tone` warn = needs attention, over = over budget). */
export function Callout({ tone = 'default', icon, title, actions, className, children, ...props }: CalloutProps) {
  const t = tones[tone]
  const Icon = icon === undefined ? t.Icon : icon
  return (
    <div
      className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm text-fg', t.box, className)}
      {...props}
    >
      {Icon && <Icon aria-hidden className={cn('mt-px size-4 flex-none', t.icon)} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <strong className="font-medium">{title}</strong>}
        {children && <div className={title ? 'text-muted' : undefined}>{children}</div>}
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
