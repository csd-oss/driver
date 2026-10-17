import { describe, expect, it } from 'vitest'
import { en } from './en'
import { i18nFor } from './index'
import { sk } from './sk'
import { translateRich } from './rich'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
const forms = (v: string | { one: string; few?: string; other: string }) => (typeof v === 'string' ? [v] : [v.one, v.few, v.other].filter((x): x is string => x !== undefined))

describe('message catalogs', () => {
  it('every Slovak key has an English message of the same kind', () => {
    const skKeys = Object.keys(sk)
    const enKeys = Object.keys(en)
    expect(enKeys.filter((k) => !(k in sk))).toEqual([])
    expect(skKeys.filter((k) => !(k in en))).toEqual([])
    for (const key of skKeys) {
      const a = (sk as Record<string, unknown>)[key]
      const b = (en as Record<string, unknown>)[key]
      expect(typeof a, key).toBe(typeof b)
    }
  })

  it('placeholders match between languages and within plural forms', () => {
    for (const key of Object.keys(sk)) {
      const a = forms((sk as Record<string, string | { one: string; few?: string; other: string }>)[key]!)
      const b = forms((en as Record<string, string | { one: string; few?: string; other: string }>)[key]!)
      const expected = placeholders(a[0]!)
      for (const s of [...a, ...b]) expect(placeholders(s), key).toEqual(expected)
    }
  })

  it('no English message is left in Slovak by accident (and vice versa) for plain words', () => {
    // A cheap smoke check: the nav labels differ.
    expect(en['nav.students']).not.toBe(sk['nav.students'])
    expect(en['common.cancel']).not.toBe(sk['common.cancel'])
  })
})

describe('translate', () => {
  it('fills placeholders and picks plural forms per language', () => {
    const s = i18nFor('sk')
    const e = i18nFor('en')
    expect(s.t('course.from', { date: '1. 9. 2026' })).toBe('od 1. 9. 2026')
    expect(e.t('course.from', { date: '1 Sept 2026' })).toBe('from 1 Sept 2026')
    expect(s.tp('students.count', 1)).toBe('1 žiak')
    expect(s.tp('students.count', 3)).toBe('3 žiaci')
    expect(s.tp('students.count', 12)).toBe('12 žiakov')
    expect(e.tp('students.count', 1)).toBe('1 student')
    expect(e.tp('students.count', 3)).toBe('3 students')
    expect(s.tp('time.inDays', 1)).toBe('o 1 deň')
    expect(e.tp('time.inDays', 14)).toBe('in 14 days')
  })

  it('renders rich messages around React nodes', () => {
    const nodes = translateRich('en', 'auth.demoHint', { admin: 'A', instructor: 'I', password: 'P' }) as { props: { children: unknown } }[]
    expect(nodes.map((n) => n.props.children).join('')).toBe('Demo school: A (admin) or I (instructor), password P.')
  })
})
