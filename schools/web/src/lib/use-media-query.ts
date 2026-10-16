import { useCallback, useSyncExternalStore } from 'react'

/** Live `matchMedia` result. False where matchMedia is unavailable. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

/** Under the `desk` breakpoint (900px, D55): touch layouts, sheets instead of popovers. */
export const MOBILE_QUERY = '(max-width: 899px)'
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY)

/**
 * Phones: a narrow screen with a coarse (touch) primary pointer. Width alone
 * can't tell a phone from a desktop zoomed to 200% (about 720 CSS px wide),
 * which keeps its mouse and so keeps desktop-only layouts like the Gantt.
 */
export const PHONE_QUERY = '(max-width: 899px) and (pointer: coarse)'
export const usePhone = () => useMediaQuery(PHONE_QUERY)
