import type { ComponentProps, ReactNode, RefObject } from 'react'
import { XIcon } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { cn } from '@/lib/cn'
import { Button } from './button'
import { useCaptureFocus, useFocusReturn } from './focus-return'
import { useLiftToasts } from './lift-toasts'
import { keepOpenOnOverlays } from './outside'
import { ShortcutLayer } from './shortcut-layer'

export const Dialog = D.Root
export const DialogTrigger = D.Trigger
export const DialogClose = D.Close

const widths = {
  sm: 'max-w-105',
  md: 'max-w-140',
  lg: 'max-w-180',
  xl: 'max-w-220',
}

export interface DialogContentProps extends Omit<ComponentProps<typeof D.Content>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** 420 / 560 (default) / 720 / 880px. */
  size?: keyof typeof widths
  /** Extra controls in the header, left of the close button. */
  actions?: ReactNode
  hideClose?: boolean
}

/**
 * Modal dialog (prototype `.dialog`): focus trapped and restored (to the
 * trigger, else to what had focus when it opened, e.g. after a shortcut),
 * Esc and scrim click close, page shortcuts paused. On phones it is a bottom
 * sheet, and toasts lift above it while it is open. Compose with DialogBody and
 * DialogFooter:
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent title="Create agent">
 *       <DialogBody>…</DialogBody>
 *       <DialogFooter><Button>Cancel</Button><Button variant="primary">Create</Button></DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
export function DialogContent({
  title,
  description,
  size = 'md',
  actions,
  hideClose = false,
  className,
  children,
  onCloseAutoFocus,
  onInteractOutside,
  ref,
  ...props
}: DialogContentProps) {
  const focus = useFocusReturn(onCloseAutoFocus)
  const liftToasts = useLiftToasts()
  return (
    <D.Portal>
      {/* Phones: a bottom sheet (full width, thumb reach, safe area). */}
      <D.Overlay className="fixed inset-0 z-modal flex animate-fade flex-col items-center overflow-y-auto bg-scrim px-4 pt-[12vh] pb-4 max-desk:justify-end max-desk:overflow-hidden max-desk:p-0">
        <D.Content
          className={cn(
            'flex max-h-[76vh] w-full flex-none flex-col overflow-hidden rounded-xl border border-line bg-raised text-fg shadow-xl outline-none animate-pop-dialog',
            widths[size],
            'max-desk:max-h-[92dvh] max-desk:max-w-none max-desk:animate-sheet-up max-desk:rounded-b-none max-desk:border-x-0 max-desk:border-b-0 max-desk:pb-[env(safe-area-inset-bottom,0px)]',
            className,
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
          {...props}
          ref={(el: HTMLDivElement | null) => {
            liftToasts(el)
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          onInteractOutside={keepOpenOnOverlays(onInteractOutside)}
          onCloseAutoFocus={focus.onCloseAutoFocus}
        >
          <FocusCapture into={focus.previous} />
          <ShortcutLayer>
            <div className="flex flex-none items-start gap-2 border-b border-line px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
                <D.Title className="text-md font-semibold text-fg">{title}</D.Title>
                {description && <D.Description className="text-sm text-muted">{description}</D.Description>}
              </div>
              {actions}
              {!hideClose && (
                <D.Close asChild>
                  <Button variant="ghost" icon aria-label="Close" className="max-desk:size-11">
                    <XIcon aria-hidden />
                  </Button>
                </D.Close>
              )}
            </div>
            {children}
          </ShortcutLayer>
        </D.Content>
      </D.Overlay>
    </D.Portal>
  )
}

/**
 * Records what had focus as a dialog opens; render it first inside the
 * Radix content, so it runs before any `autoFocus` field takes focus.
 */
export function FocusCapture({ into }: { into: RefObject<Element | null> }) {
  useCaptureFocus(into)
  return null
}

/** Scrolling body: 16px padding, 16px gaps. */
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4', className)} {...props} />
}

/** Right-aligned actions with a top hairline. */
export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-none items-center justify-end gap-2 border-t border-line px-4 py-3', className)} {...props} />
}
