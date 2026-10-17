/**
 * Dashboard language: Slovak by default, English on request. The choice lives in localStorage
 * (`schools-lang`) per browser. Screens read messages through `useT()` (re-renders on change);
 * plain functions outside React (formatters, error mapping) read `getLocale()`.
 *
 * Messages are flat keys in `sk.ts` / `en.ts`; `{name}` placeholders come from `vars`; plural
 * forms are picked with `Intl.PluralRules` (Slovak one / few / other, English one / other).
 */
import { useSyncExternalStore } from 'react'
import { en } from './en'
import { type MessageKey, type Messages, type PluralForms, type PluralKey, sk } from './sk'

export type { MessageKey, PluralKey } from './sk'

export type Locale = 'sk' | 'en'
export const LOCALES: readonly Locale[] = ['sk', 'en']
export const DEFAULT_LOCALE: Locale = 'sk'
/** BCP 47 tags for Intl. English uses British conventions (day first, 24-hour clock). */
export const INTL_TAG: Record<Locale, string> = { sk: 'sk-SK', en: 'en-GB' }

const CATALOGS: Record<Locale, Messages> = { sk, en }
const STORAGE_KEY = 'schools-lang'

export const isLocale = (v: unknown): v is Locale => v === 'sk' || v === 'en'

function readStored(): Locale {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return isLocale(v) ? v : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

let locale: Locale = readStored()
const listeners = new Set<() => void>()

export const getLocale = (): Locale => locale

/** `<html lang>` and the tab title follow the locale. */
function applyToDocument(): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document.title = translate(locale, 'app.title')
}

export function setLocale(next: Locale): void {
  if (next === locale) return
  locale = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage unavailable: the choice lasts for this page only.
  }
  applyToDocument()
  listeners.forEach((l) => l())
}

/** Call once at startup so the document matches a stored choice. */
export function initLocale(): void {
  applyToDocument()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useLocale = (): Locale => useSyncExternalStore(subscribe, getLocale, getLocale)

export type Vars = Record<string, string | number>

function fill(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export function translate(loc: Locale, key: MessageKey, vars?: Vars): string {
  const value = (CATALOGS[loc] as Record<string, string | PluralForms>)[key] ?? (sk as Record<string, string | PluralForms>)[key]
  return fill(typeof value === 'string' ? value : (value?.other ?? key), vars)
}

/** Does `key` exist in the catalogs? For keys built at runtime (error codes). */
export const hasMessage = (key: string): key is MessageKey => key in sk

const pluralRules = new Map<Locale, Intl.PluralRules>()
function rules(loc: Locale): Intl.PluralRules {
  let r = pluralRules.get(loc)
  if (!r) {
    r = new Intl.PluralRules(INTL_TAG[loc])
    pluralRules.set(loc, r)
  }
  return r
}

/** Plural message; `{n}` is the count unless `vars` says otherwise. */
export function translatePlural(loc: Locale, key: PluralKey, n: number, vars?: Vars): string {
  const forms = (CATALOGS[loc] as Record<string, string | PluralForms>)[key] as PluralForms | undefined
  if (!forms) return `${n}`
  const category = rules(loc).select(n) as keyof PluralForms
  const form = forms[category] ?? forms.other
  return fill(form, { n: n.toLocaleString(INTL_TAG[loc]), ...vars })
}

export type T = (key: MessageKey, vars?: Vars) => string
export type TP = (key: PluralKey, n: number, vars?: Vars) => string

export interface I18n {
  locale: Locale
  t: T
  tp: TP
}

export function i18nFor(loc: Locale): I18n {
  return {
    locale: loc,
    t: (key, vars) => translate(loc, key, vars),
    tp: (key, n, vars) => translatePlural(loc, key, n, vars),
  }
}

const cache = new Map<Locale, I18n>()
function cached(loc: Locale): I18n {
  let v = cache.get(loc)
  if (!v) {
    v = i18nFor(loc)
    cache.set(loc, v)
  }
  return v
}

/** `{ locale, t, tp }` for the current language; the component re-renders when it changes. */
export const useI18n = (): I18n => cached(useLocale())
export const useT = (): T => useI18n().t
