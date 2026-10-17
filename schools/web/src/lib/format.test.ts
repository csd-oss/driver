import { describe, expect, it } from 'vitest'
import { ageOn, daysUntil, euro, formatAgo, formatDate, formatNumber, percent } from './format'

// Intl separates groups and the currency sign with non-breaking spaces; compare plain ones.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ')

describe('format', () => {
  it('writes dates the Slovak way, and readably in English', () => {
    expect(formatDate('2026-10-03')).toBe('3. 10. 2026')
    expect(formatDate('2026-10-03', 'sk')).toBe('3. 10. 2026')
    expect(formatDate('2026-10-03', 'en')).toBe('3 Oct 2026')
    expect(formatDate(null)).toBe('–')
  })
  it('formats money and numbers per locale', () => {
    expect(plain(euro(89000, 'sk'))).toBe('890,00 €')
    expect(euro(89000, 'en')).toBe('€890.00')
    expect(euro(null)).toBe('–')
    expect(plain(formatNumber(12345, 'sk'))).toBe('12 345')
    expect(formatNumber(12345, 'en')).toBe('12,345')
  })
  it('counts days and ages', () => {
    const now = new Date('2026-10-17T10:00:00').getTime()
    expect(daysUntil('2026-10-20', now)).toBe(3)
    expect(daysUntil('2026-10-16', now)).toBe(-1)
    expect(ageOn('2008-10-18', '2026-10-17')).toBe(17)
    expect(ageOn('2008-10-17', '2026-10-17')).toBe(18)
  })
  it('says how long ago in both languages', () => {
    const now = new Date('2026-10-17T10:00:00').getTime()
    expect(formatAgo('2026-10-17T08:00:00Z', now)).toBe('dnes')
    expect(formatAgo('2026-10-16T08:00:00Z', now, 'sk')).toBe('včera')
    expect(formatAgo('2026-10-16T08:00:00Z', now, 'en')).toBe('yesterday')
    expect(formatAgo('2026-10-14T08:00:00Z', now, 'en')).toBe('3 days ago')
    expect(formatAgo(null, now, 'sk')).toBe('nikdy')
    expect(formatAgo(null, now, 'en')).toBe('never')
  })
  it('rounds percentages', () => {
    expect(percent(1, 3)).toBe(33)
    expect(percent(0, 0)).toBeNull()
  })
})
