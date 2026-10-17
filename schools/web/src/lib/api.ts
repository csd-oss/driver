/**
 * REST client. Errors are RFC 9457 problem+json from the server with a stable machine `code`;
 * `errorMessage()` turns the code into a sentence in the dashboard language and falls back to
 * the server's Slovak `detail` (Slovak UI) or a per-status sentence. A 401 anywhere tells the
 * auth store.
 */
import { getLocale, hasMessage, type Locale, translate } from '@/i18n'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** The server's own (Slovak) sentence, when it sent one. */
  readonly detail: string | null

  constructor(status: number, code: string, detail: string | null) {
    super(detail ?? code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.detail = detail
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

export function toApiError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    const detail = str(b.detail) ?? str(b.title) ?? null
    const code = str(b.code) ?? `http_${status}`
    return new ApiError(status, code, detail)
  }
  return new ApiError(status, `http_${status}`, null)
}

function statusMessage(status: number, locale: Locale): string {
  if (status === 401) return translate(locale, 'error.unauthorized')
  if (status === 403) return translate(locale, 'error.http_403')
  if (status === 404) return translate(locale, 'error.http_404')
  if (status === 409) return translate(locale, 'error.http_409')
  if (status >= 500) return translate(locale, 'error.http_5xx')
  return translate(locale, 'error.http_other', { status })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A user-facing sentence for any thrown value, in the dashboard language. */
export function errorMessage(error: unknown, locale: Locale = getLocale()): string {
  if (isApiError(error)) {
    const key = `error.${error.code}`
    if (hasMessage(key)) return translate(locale, key)
    // An unmapped code: the server's Slovak sentence is better than nothing for a Slovak reader.
    if (locale === 'sk' && error.detail) return capitalize(error.detail)
    return statusMessage(error.status, locale)
  }
  if (error instanceof Error && error.message) return capitalize(error.message)
  return translate(locale, 'error.unknown')
}

type Listener = () => void
const unauthorized = new Set<Listener>()
export function onUnauthorized(l: Listener): () => void {
  unauthorized.add(l)
  return () => unauthorized.delete(l)
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers = new Headers()
  let payload: string | undefined
  if (body !== undefined) {
    headers.set('content-type', 'application/json')
    payload = JSON.stringify(body)
  }
  let response: Response
  try {
    response = await fetch(path, { method, headers, body: payload, credentials: 'include' })
  } catch {
    throw new ApiError(0, 'network_error', null)
  }
  if (response.status === 401) unauthorized.forEach((l) => l())
  const text = response.status === 204 ? '' : await response.text()
  let parsed: unknown
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }
  if (!response.ok) throw toApiError(response.status, parsed)
  return parsed as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
