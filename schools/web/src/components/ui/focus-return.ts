/**
 * Where focus goes when a dialog or panel closes. Radix returns focus to a
 * `Trigger`; dialogs opened by a shortcut, a menu item or code have none, so
 * focus would fall to <body> and the next Tab would start at the top of the
 * page. The shared Dialog and SidePanel record what had focus when they
 * opened (`useFocusReturn`) and, if nothing holds focus after closing, put it
 * back there, else on the page's anchor (`[data-focus-anchor]`, e.g. the
 * timeline's selected release), else on the main region.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'

/** The page's fallback focus target, e.g. the timeline's tabbable bar. */
export const FOCUS_ANCHOR_ATTR = 'data-focus-anchor'
/** The app's main region (AppShell's `<main id="main" tabIndex={-1}>`). */
export const MAIN_ID = 'main'

/** Nothing (or a removed element) has focus. */
export function focusLost(doc: Document = document): boolean {
  const a = doc.activeElement
  return !a || a === doc.body || a === doc.documentElement || !a.isConnected
}

let restoring = false

/**
 * True inside the focus event `returnFocus` causes: a focus handler that acts
 * on keyboard focus (e.g. a timeline bar selecting itself) should leave a
 * restored focus alone.
 */
export const isRestoringFocus = () => restoring

function tryFocus(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected || el.closest('[inert]')) return false
  restoring = true
  try {
    // Without scrolling: the timeline's anchor bar would pull the plan back
    // to it, away from what the dialog just added (RM-50).
    el.focus({ preventScroll: true })
  } finally {
    restoring = false
  }
  return el.ownerDocument.activeElement === el
}

/**
 * Focus `previous`, else the page anchor, else the main region. Only when
 * focus is lost: a Radix trigger, or a click elsewhere, keeps what it has.
 */
export function returnFocus(previous: Element | null, doc: Document = document): void {
  if (!focusLost(doc)) return
  if (tryFocus(previous)) return
  for (const el of doc.querySelectorAll(`[${FOCUS_ANCHOR_ATTR}]`)) if (tryFocus(el)) return
  tryFocus(doc.getElementById(MAIN_ID))
}

/**
 * For a Radix `Content`: pass `onCloseAutoFocus` to the content (it runs the
 * caller's handler first) and render `<FocusCapture into={previous} />` first
 * inside it, which records what had focus before Radix (or an `autoFocus`
 * field) moved it in.
 */
export function useFocusReturn(onCloseAutoFocus?: (e: Event) => void) {
  const previousRef = useRef<Element | null>(null)
  return {
    previous: previousRef,
    onCloseAutoFocus(e: Event) {
      onCloseAutoFocus?.(e)
      const prev = previousRef.current
      previousRef.current = null
      // Radix focuses its trigger (if any) after this handler; check once it has.
      queueMicrotask(() => returnFocus(prev))
    },
  }
}

/** Records `document.activeElement` into `intoRef` on mount (with the dialog content). */
export function useCaptureFocus(intoRef: RefObject<Element | null>) {
  useLayoutEffect(() => {
    const a = document.activeElement
    intoRef.current = a && a !== document.body ? a : null
  }, [intoRef])
}
