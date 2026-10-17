import { describe, expect, it } from 'vitest'
import { ApiError, errorMessage, toApiError } from './api'

describe('errorMessage', () => {
  it('maps server codes to the dashboard language', () => {
    const e = toApiError(404, { code: 'student_not_found', detail: 'Žiak sa nenašiel.', status: 404 })
    expect(errorMessage(e, 'sk')).toBe('Žiak sa nenašiel.')
    expect(errorMessage(e, 'en')).toBe('Student not found.')
    const limit = toApiError(400, { code: 'bad_lesson_count', detail: 'Jeden blok má 1 až 6 vyučovacích hodín (§ 8 ods. 2 vyhl. 45/2016).' })
    expect(errorMessage(limit, 'en')).toMatch(/1 to 6 teaching hours/)
  })
  it('falls back to the Slovak detail only for Slovak readers, else to the status', () => {
    const e = toApiError(400, { code: 'something_new', detail: 'nový dôvod po slovensky' })
    expect(errorMessage(e, 'sk')).toBe('Nový dôvod po slovensky')
    expect(errorMessage(e, 'en')).toBe('The request failed (400).')
    expect(errorMessage(toApiError(503, 'gateway text'), 'en')).toBe('Something went wrong on our side. Try again in a moment.')
    expect(errorMessage(new ApiError(0, 'network_error', null), 'en')).toBe('The server is not responding. Check your connection.')
  })
  it('handles plain errors and unknown values', () => {
    expect(errorMessage(new Error('boom'), 'en')).toBe('Boom')
    expect(errorMessage(undefined, 'sk')).toBe('Niečo sa pokazilo.')
  })
})
