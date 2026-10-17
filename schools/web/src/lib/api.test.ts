import { describe, expect, it } from 'vitest'
import { ApiError, errorMessage, toApiError } from './api'

describe('errorMessage', () => {
  it('maps server codes to the dashboard language', () => {
    const e = toApiError(404, { code: 'student_not_found', detail: 'Žiak sa nenašiel.', status: 404 })
    expect(errorMessage(e, 'sk')).toBe('Žiak sa nenašiel.')
    expect(errorMessage(e, 'en')).toBe('Student not found.')
    const limit = toApiError(400, { code: 'bad_lesson_count', detail: 'Jeden blok má 1 až 6 vyučovacích hodín (§ 8 ods. 2 vyhl. 45/2016).' })
    expect(errorMessage(limit, 'en')).toMatch(/1 to 6 teaching hours/)
    const over = toApiError(400, { code: 'driving_count_over_limit', detail: 'Druh CP má najviac 3 vyučovacie hodiny denne (§ 8 ods. 11 vyhl. 45/2016).', params: { kind: 'CP', max: 3 } })
    expect(errorMessage(over, 'en')).toBe('Kind CP allows at most 3 teaching hours per day (§ 8(11) of Decree 45/2016).')
    expect(errorMessage(over, 'sk')).toBe('Druh CP má najviac 3 vyučovacie hodiny denne (§ 8 ods. 11 vyhl. 45/2016).')
    const missing = toApiError(400, { code: 'field_required', detail: 'Pole `name` je povinné.', params: { field: 'name', ignored: { nested: true } } })
    expect(errorMessage(missing, 'en')).toBe('The field "name" is required.')
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
