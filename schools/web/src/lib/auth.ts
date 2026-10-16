/**
 * Who is signed in, as far as this tab knows: `unknown` until `me` answers, then `signed-in` or
 * `signed-out`. Any 401 from the API signs the tab out.
 */
import { useSyncExternalStore } from 'react'
import { onUnauthorized } from './api'
import type { Me } from './types'

export type AuthStatus = 'unknown' | 'signed-in' | 'signed-out'

interface AuthState {
  status: AuthStatus
  me: Me | null
}

let state: AuthState = { status: 'unknown', me: null }
const listeners = new Set<() => void>()

function set(next: AuthState) {
  state = next
  listeners.forEach((l) => l())
}

export const getAuth = () => state
export function subscribeAuth(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useAuth = () => useSyncExternalStore(subscribeAuth, getAuth, getAuth)

export const signedIn = (me: Me) => set({ status: 'signed-in', me })
export const signedOut = () => {
  if (state.status !== 'signed-out') set({ status: 'signed-out', me: null })
}

onUnauthorized(signedOut)
