/**
 * Theme preference (`light` | `dark` | `system`), applied as a resolved
 * `data-theme` attribute on <html>. index.html applies the stored preference
 * before first paint with the same storage key.
 */
import { useSyncExternalStore } from 'react'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'schools-theme'
const listeners = new Set<() => void>()
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let preference: ThemePreference = readPreference()

export function resolveTheme(pref: ThemePreference, systemDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

const resolved = (): ResolvedTheme => resolveTheme(preference, media().matches)

function apply(): void {
  document.documentElement.dataset.theme = resolved()
  listeners.forEach((l) => l())
}

export function setThemePreference(next: ThemePreference): void {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  apply()
}

export function toggleTheme(): void {
  setThemePreference(resolved() === 'dark' ? 'light' : 'dark')
}

/** Follow the OS setting while the preference is `system`. Call once at startup. */
export function initTheme(): void {
  media().addEventListener('change', () => {
    if (preference === 'system') apply()
  })
  apply()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, resolved)
}

/** The stored choice (Light / Dark / System), not what it resolves to. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference)
}
