/**
 * REST client. Errors are RFC 9457 problem+json from the server; `ApiError.message` carries the
 * server's Slovak `detail`, which screens show as is. A 401 anywhere tells the auth store.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined)

function fallbackMessage(status: number): string {
  if (status === 401) return 'Prihlásenie vypršalo. Prihláste sa znova.'
  if (status === 403) return 'Na toto nemáte oprávnenie.'
  if (status === 404) return 'Nenašlo sa.'
  if (status === 409) return 'Niekto to medzitým zmenil. Obnovte stránku a skúste znova.'
  if (status >= 500) return 'Niečo sa pokazilo na našej strane. Skúste to o chvíľu.'
  return `Požiadavka zlyhala (${status}).`
}

export function toApiError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const b = body as Record<string, unknown>
    const detail = str(b.detail) ?? str(b.title)
    if (detail) return new ApiError(status, str(b.code) ?? `http_${status}`, detail)
  }
  return new ApiError(status, `http_${status}`, fallbackMessage(status))
}

/** A user-facing sentence for any thrown value. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error && error.message ? error.message : 'Niečo sa pokazilo.'
  return message.charAt(0).toUpperCase() + message.slice(1)
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
    throw new ApiError(0, 'network_error', 'Server neodpovedá. Skontrolujte pripojenie.')
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
