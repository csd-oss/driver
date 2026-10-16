import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Tooltip as T } from 'radix-ui'
import { cn } from '@/lib/cn'
import { KeyHint } from './kbd'

const HasProvider = createContext(false)

/** Mount once near the root so moving between tooltips skips the delay. */
export function TooltipProvider({ delayDuration = 400, ...props }: ComponentProps<typeof T.Provider>) {
  return (
    <HasProvider.Provider value={true}>
      <T.Provider delayDuration={delayDuration} {...props} />
    </HasProvider.Provider>
  )
}

export interface TooltipProps {
  /** Short label. Tooltips supplement an accessible name, they don't replace it. */
  content: ReactNode
  /** Shortcut shown after the label ('c', 'mod+k'). */
  kbd?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** The trigger element (asChild): must accept a ref and forward props. */
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

/** Inverse chip on hover / focus (prototype `[data-tip]`). */
export function Tooltip({ content, kbd, side = 'top', align = 'center', children, open, onOpenChange, className }: TooltipProps) {
  const inProvider = useContext(HasProvider)
  const tip = (
    <T.Root open={open} onOpenChange={onOpenChange}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-tooltip inline-flex max-w-xs animate-fade items-center gap-1.5 rounded-sm bg-inverse px-1.75 py-1 text-2xs font-medium text-on-inverse',
            className,
          )}
        >
          {content}
          {kbd && <KeyHint keys={kbd} tone="inverse" always />}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
  return inProvider ? tip : <TooltipProvider>{tip}</TooltipProvider>
}
