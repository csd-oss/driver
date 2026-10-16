import { describe, expect, it } from 'vitest'
import { ageOn, daysUntil, formatAgo, formatDate, percent, plural } from './format'

describe('format', () => {
  it('writes dates the Slovak way', () => {
    expect(formatDate('2026-10-03')).toBe('3. 10. 2026')
    expect(formatDate(null)).toBe('–')
  })
  it('counts days and ages', () => {
    const now = new Date('2026-10-17T10:00:00').getTime()
    expect(daysUntil('2026-10-20', now)).toBe(3)
    expect(daysUntil('2026-10-16', now)).toBe(-1)
    expect(ageOn('2008-10-18', '2026-10-17')).toBe(17)
    expect(ageOn('2008-10-17', '2026-10-17')).toBe(18)
  })
  it('says how long ago', () => {
    const now = new Date('2026-10-17T10:00:00').getTime()
    expect(formatAgo('2026-10-17T08:00:00Z', now)).toBe('dnes')
    expect(formatAgo('2026-10-16T08:00:00Z', now)).toBe('včera')
    expect(formatAgo(null, now)).toBe('nikdy')
  })
  it('pluralises and rounds', () => {
    expect(plural(1, 'žiak', 'žiaci', 'žiakov')).toBe('1 žiak')
    expect(plural(3, 'žiak', 'žiaci', 'žiakov')).toBe('3 žiaci')
    expect(plural(12, 'žiak', 'žiaci', 'žiakov')).toBe('12 žiakov')
    expect(percent(1, 3)).toBe(33)
    expect(percent(0, 0)).toBeNull()
  })
})
