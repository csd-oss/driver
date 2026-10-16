/**
 * Overlays (dialogs, side panels, sheets) close on an outside press, except
 * when the press is on a toast (its Undo), a popover/menu/picker opened from
 * them, or another dialog stacked over them.
 *
 * On touch, Radix reports the outside press at click time, by which point an
 * Undo toast may already be gone from the DOM; so where each press started is
 * remembered at pointerdown.
 */
export const KEEP_OPEN = '[aria-label="Notifications"], [data-radix-popper-content-wrapper], [role="dialog"], [role="menu"], [role="listbox"]'

let lastPressKeepsOpen = false
if (typeof document !== 'undefined')
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPressKeepsOpen = e.target instanceof Element && e.target.closest(KEEP_OPEN) !== null
    },
    true,
  )

/** The outside press started on a toast, a popover or another dialog. */
export function pressedInside(e: { target: EventTarget | null; type?: string }): boolean {
  const t = e.target
  if (t instanceof Element && t.isConnected && t.closest(KEEP_OPEN) !== null) return true
  return e.type !== 'dismissableLayer.focusOutside' && lastPressKeepsOpen
}

/** Compose into `onInteractOutside`: keeps the overlay open for presses on toasts and popovers. */
export function keepOpenOnOverlays<E extends Event>(handler?: (e: E) => void) {
  return (e: E) => {
    handler?.(e)
    if (!e.defaultPrevented && pressedInside(e)) e.preventDefault()
  }
}
