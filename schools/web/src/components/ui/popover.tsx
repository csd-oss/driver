import type { ComponentProps } from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { cn } from '@/lib/cn'
import { ShortcutLayer } from './shortcut-layer'
import { floatingSurface } from './variants'

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
/** Position the popover against something other than the trigger (e.g. a focused row). */
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export interface PopoverContentProps extends ComponentProps<typeof PopoverPrimitive.Content> {
  /** Remove the default 12px padding (for lists that manage their own). */
  flush?: boolean
}

/** Portalled, focus-managed, Esc / outside click to close. Opens a shortcut layer. */
export function PopoverContent({ className, flush = false, sideOffset = 4, align = 'start', children, ...props }: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(floatingSurface, 'max-w-[calc(100vw-16px)]', flush ? 'p-0' : 'p-3', className)}
        {...props}
      >
        <ShortcutLayer>{children}</ShortcutLayer>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}
