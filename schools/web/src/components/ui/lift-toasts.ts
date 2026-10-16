import { useEffect, useState } from 'react'

/**
 * Phones: toasts sit just above the tab bar, which is where a bottom sheet
 * keeps its primary button. While `el` (an open sheet) is on screen, lift the
 * toast stack above it through the toaster's `--bulk-lift`, so an undo toast
 * never covers the sheet's own buttons. `DialogContent` and the Picker's phone
 * sheet use it, so every sheet gets it.
 */
export function useLiftToasts(): (el: HTMLElement | null) => void {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!el || !window.matchMedia('(max-width: 899px)').matches) return
    const root = document.documentElement
    const before = root.style.getPropertyValue('--bulk-lift')
    const toPx = (v: string) => (parseFloat(v) || 0) * (v.trim().endsWith('rem') ? parseFloat(getComputedStyle(root).fontSize) || 16 : 1)
    const update = () => {
      const tabbar = toPx(getComputedStyle(root).getPropertyValue('--toast-lift'))
      // The toaster sits at space-5 (20px) + --toast-lift + --bulk-lift from the bottom.
      const lift = Math.max(0, el.getBoundingClientRect().height + 8 - 20 - tabbar)
      root.style.setProperty('--bulk-lift', `${Math.round(lift)}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (before) root.style.setProperty('--bulk-lift', before)
      else root.style.removeProperty('--bulk-lift')
    }
  }, [el])
  return setEl
}
