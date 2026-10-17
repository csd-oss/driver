/** Dates, money and numbers in the dashboard language (`getLocale()` unless told otherwise). */
import { getLocale, INTL_TAG, type Locale, translate } from '@/i18n'
import type { DrivingKind, GroupStatus, ReadinessLabel, Subject } from './types'

type Formatter<T> = (locale: Locale) => T
function perLocale<T>(make: Formatter<T>): (locale: Locale) => T {
  const cache = new Map<Locale, T>()
  return (locale) => {
    let v = cache.get(locale)
    if (!v) {
      v = make(locale)
      cache.set(locale, v)
    }
    return v
  }
}

// Slovak writes "3. 10. 2026"; English gets "3 Oct 2026" rather than an ambiguous all-numeric date.
const dateFmt = perLocale((l) => new Intl.DateTimeFormat(INTL_TAG[l], l === 'sk' ? { day: 'numeric', month: 'numeric', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }))
const shortFmt = perLocale((l) => new Intl.DateTimeFormat(INTL_TAG[l], l === 'sk' ? { day: 'numeric', month: 'numeric' } : { day: 'numeric', month: 'short' }))
const relFmt = perLocale((l) => new Intl.RelativeTimeFormat(INTL_TAG[l], { numeric: 'auto' }))
const euroFmt = perLocale((l) => new Intl.NumberFormat(INTL_TAG[l], { style: 'currency', currency: 'EUR' }))
const numberFmt = perLocale((l) => new Intl.NumberFormat(INTL_TAG[l]))

const parse = (iso: string) => (iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso))

export function formatDate(iso: string | null | undefined, locale: Locale = getLocale()): string {
  if (!iso) return '–'
  const d = parse(iso)
  return Number.isNaN(d.getTime()) ? '–' : dateFmt(locale).format(d)
}

export function formatShortDate(iso: string, locale: Locale = getLocale()): string {
  return shortFmt(locale).format(parse(iso))
}

/** "dnes", "včera", "pred 3 dňami", else the date (and the English equivalents). */
export function formatAgo(iso: string | null | undefined, now = Date.now(), locale: Locale = getLocale()): string {
  if (!iso) return translate(locale, 'common.never')
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '–'
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000)
  if (days <= 0) return translate(locale, 'common.today')
  if (days === 1) return translate(locale, 'common.yesterday')
  if (days < 14) return relFmt(locale).format(-days, 'day')
  return formatDate(iso, locale)
}

const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Calendar days from today to `iso` (negative when past). */
export function daysUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`).getTime()
  return Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)
}

export function euro(cents: number | null | undefined, locale: Locale = getLocale()): string {
  if (cents === null || cents === undefined) return '–'
  return euroFmt(locale).format(cents / 100)
}

export function formatNumber(n: number, locale: Locale = getLocale()): string {
  return numberFmt(locale).format(n)
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export const READINESS_TONE: Record<ReadinessLabel, 'success' | 'accent' | 'warning' | 'danger'> = {
  ready: 'success',
  almostReady: 'accent',
  gettingThere: 'warning',
  needsWork: 'danger',
}

/** Enumerations in display order; their labels are `t('groupStatus.running')` and friends. */
export const GROUP_STATUSES: readonly GroupStatus[] = ['planned', 'running', 'finished', 'archived']
export const SUBJECTS: readonly Subject[] = ['PCP', 'NVU', 'TVV', 'ZBJ', 'OP']
export const DRIVING_KINDS: readonly DrivingKind[] = ['AT', 'AC', 'CP', 'PU']
export const ENROLMENT_STATUSES = ['active', 'finished', 'withdrawn', 'transferred'] as const
export type EnrolmentStatus = (typeof ENROLMENT_STATUSES)[number]
export const isEnrolmentStatus = (s: string | null | undefined): s is EnrolmentStatus => (ENROLMENT_STATUSES as readonly string[]).includes(s ?? '')

export function fullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`
}

export function ageOn(birth: string | null, on: string | Date = new Date()): number | null {
  if (!birth) return null
  const b = new Date(`${birth}T12:00:00`)
  const d = typeof on === 'string' ? new Date(`${on}T12:00:00`) : on
  let age = d.getFullYear() - b.getFullYear()
  const m = d.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age -= 1
  return age
}
