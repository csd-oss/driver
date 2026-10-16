import type { DrivingKind, GroupStatus, ReadinessLabel, Subject } from './types'

const dateFmt = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric' })
const relFmt = new Intl.RelativeTimeFormat('sk', { numeric: 'auto' })

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? '–' : dateFmt.format(d)
}

export function formatShortDate(iso: string): string {
  const d = iso.length <= 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return shortFmt.format(d)
}

/** "dnes", "včera", "pred 3 dňami", else the date. */
export function formatAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nikdy'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '–'
  const days = Math.round((startOfDay(now) - startOfDay(t)) / 86_400_000)
  if (days <= 0) return 'dnes'
  if (days === 1) return 'včera'
  if (days < 14) return relFmt.format(-days, 'day')
  return formatDate(iso)
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

export function euro(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '–'
  return new Intl.NumberFormat('sk-SK', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}

export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null
}

export const READINESS_LABEL: Record<ReadinessLabel, string> = {
  ready: 'Pripravený',
  almostReady: 'Takmer pripravený',
  gettingThere: 'Na dobrej ceste',
  needsWork: 'Potrebuje prípravu',
}

export const READINESS_TONE: Record<ReadinessLabel, 'success' | 'accent' | 'warning' | 'danger'> = {
  ready: 'success',
  almostReady: 'accent',
  gettingThere: 'warning',
  needsWork: 'danger',
}

export const GROUP_STATUS: Record<GroupStatus, string> = {
  planned: 'Plánovaný',
  running: 'Prebieha',
  finished: 'Ukončený',
  archived: 'Archív',
}

export const SUBJECT: Record<Subject, string> = {
  PCP: 'Predpisy o cestnej premávke',
  NVU: 'Náuka o vozidlách a údržba',
  TVV: 'Teória vedenia vozidla',
  ZBJ: 'Zásady bezpečnej jazdy',
  OP: 'Opakovanie',
}

export const DRIVING_KIND: Record<DrivingKind, string> = {
  AT: 'Trenažér',
  AC: 'Autocvičisko',
  CP: 'Cestná premávka',
  PU: 'Praktická údržba',
}

export const ENROLMENT_STATUS: Record<string, string> = {
  active: 'Aktívny',
  finished: 'Ukončil',
  withdrawn: 'Odišiel',
  transferred: 'Presunutý',
}

/** Slovak plural: 1 žiak, 2–4 žiaci, 5+ žiakov. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n)
  if (a === 1) return `${n} ${one}`
  if (a >= 2 && a <= 4) return `${n} ${few}`
  return `${n} ${many}`
}

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
