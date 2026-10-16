/**
 * Toasts and the undo stack (prototype `.toast`, shared.js `RM.toast` / `RM.did`).
 *
 *   toast('Link copied', { tone: 'success' })
 *   toast.error("Couldn't save")
 *   const did = useUndoToast()
 *   did('“Webhook retry queue” assigned to you', () => api.assign(item.id, previous))
 *
 * `did` shows "<label> [Undo ⌘Z]" and pushes the revert onto a stack; ⌘Z
 * (registered by <Toaster />) reverts the most recent entry, and ⌘⇧Z
 * re-applies the last undone one when it was recorded with a redo
 * (`did(label, revert, { redo })`). Render <Toaster /> once at the root.
 */
import { useSyncExternalStore, type ReactNode } from 'react'

export type ToastTone = 'default' | 'success' | 'error' | 'warning' | 'info' | 'undo'

export interface ToastAction {
  label: string
  onClick: () => void
  /** Hint shown in the button, e.g. 'mod+z'. */
  kbd?: string
}

export interface ToastOptions {
  /** Reuse an id to replace a toast in place. */
  id?: string
  tone?: ToastTone
  /** Custom leading icon; `null` for none. Default: the tone's icon. */
  icon?: ReactNode | null
  action?: ToastAction
  /** ms before it disappears; `Infinity` to stay until dismissed. Default 4200 (errors 6000). */
  duration?: number
}

export interface ToastItem extends ToastOptions {
  id: string
  message: ReactNode
}

const MAX_VISIBLE = 4
let items: ToastItem[] = []
let nextId = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Undo and redo notices: "<change> [Undo]", "Undone: …", "Redone: …", "Nothing to undo". */
const isUndoNotice = (t: Pick<ToastItem, 'id' | 'tone'>) => t.id.startsWith('undo-') || t.tone === 'undo'

function show(message: ReactNode, opts: ToastOptions = {}): string {
  const id = opts.id ?? `toast-${nextId++}`
  const item: ToastItem = { ...opts, id, message }
  const existing = items.findIndex((t) => t.id === id)
  // One undo notice at a time, the latest (RM-53): a run of edits doesn't stack
  // them over the page, and ⌘Z undoes that one first anyway.
  const kept = isUndoNotice(item) ? items.filter((t) => t.id === id || !isUndoNotice(t)) : items
  items = existing >= 0 ? kept.map((t) => (t.id === id ? item : t)) : [...kept, item].slice(-MAX_VISIBLE)
  emit()
  return id
}

export function dismissToast(id: string): void {
  if (!items.some((t) => t.id === id)) return
  items = items.filter((t) => t.id !== id)
  emit()
}

type ToastFn = typeof show & {
  success: (message: ReactNode, opts?: Omit<ToastOptions, 'tone'>) => string
  error: (message: ReactNode, opts?: Omit<ToastOptions, 'tone'>) => string
  warning: (message: ReactNode, opts?: Omit<ToastOptions, 'tone'>) => string
  info: (message: ReactNode, opts?: Omit<ToastOptions, 'tone'>) => string
  dismiss: typeof dismissToast
}

/** Show a toast. Returns its id. */
export const toast: ToastFn = Object.assign(show, {
  success: (m: ReactNode, o?: Omit<ToastOptions, 'tone'>) => show(m, { ...o, tone: 'success' }),
  error: (m: ReactNode, o?: Omit<ToastOptions, 'tone'>) => show(m, { ...o, tone: 'error' }),
  warning: (m: ReactNode, o?: Omit<ToastOptions, 'tone'>) => show(m, { ...o, tone: 'warning' }),
  info: (m: ReactNode, o?: Omit<ToastOptions, 'tone'>) => show(m, { ...o, tone: 'info' }),
  dismiss: dismissToast,
})

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Current toasts (for <Toaster />). */
export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribe, () => items)
}

/** `{ toast, dismiss }` for components that prefer a hook. */
export function useToast() {
  return TOAST_API
}
const TOAST_API = { toast, dismiss: dismissToast } as const

// ---------------------------------------------------------------------------
// Undo / redo stacks (D57: every change can be undone)

export type Revert = () => void | Promise<unknown>

interface UndoEntry {
  id: string
  label: string
  revert: Revert
  /** Re-applies the change after an undo (⌘⇧Z). Without it, undoing it ends redo. */
  redo?: Revert
}

const UNDO_LIMIT = 50
const undoStack: UndoEntry[] = []
/** Undone changes, most recent last; any new change clears it. */
const redoStack: UndoEntry[] = []
/**
 * Bumped by every new change. An undo or redo still in flight when one
 * lands doesn't move its entry to the other stack: the new change cleared
 * redo, and replaying the older one would build on a plan that moved since.
 */
let generation = 0

/**
 * Thrown by a revert or redo that failed part way but put back what it had
 * already done (an undo step over several server batches): nothing changed,
 * so its entry stays where it was. `cause` is the failure.
 */
export class RolledBack extends Error {
  constructor(readonly cause: unknown) {
    super('Rolled back', { cause })
  }
}

/**
 * Thrown by an undo that went part way and couldn't put back what it had
 * done: the change is half undone and its entry is dropped. The message says
 * what went back and what didn't.
 */
export class PartlyUndone extends Error {
  constructor(message: string, readonly cause: unknown) {
    super(message, { cause })
  }
}

function reportFailure(verb: 'undo' | 'redo', entry: UndoEntry, failure: unknown) {
  if (failure instanceof PartlyUndone) return void show(failure.message, { tone: 'warning' })
  const e = failure instanceof RolledBack ? failure.cause : failure
  const code = (e as { code?: unknown } | null)?.code
  // The server refuses a revert that would overwrite a newer change.
  // Not this person's to undo (another member's private change), or a later import relies on
  // it (`later_import`): the server says why.
  if (code === 'forbidden' || code === 'later_import') {
    const detail = (e as { message?: unknown } | null)?.message
    return void show(`Can't ${verb}: ${typeof detail === 'string' && detail ? detail : entry.label}`, { tone: 'warning', id: `${verb}-failed-${entry.id}` })
  }
  if (code === 'revert_conflict' || code === 'version_conflict')
    show(`Can't ${verb}: ${entry.label}. Someone changed it since.`, { tone: 'warning', id: `${verb}-failed-${entry.id}` })
  else show(`Couldn't ${verb}: ${entry.label}`, { tone: 'error' })
}

function pushUndo(entry: UndoEntry) {
  undoStack.push(entry)
  if (undoStack.length > UNDO_LIMIT) undoStack.shift()
  emit()
}

async function runUndo(entry: UndoEntry): Promise<boolean> {
  const i = undoStack.indexOf(entry)
  if (i >= 0) undoStack.splice(i, 1)
  emit()
  dismissToast(entry.id)
  const gen = generation
  try {
    await entry.revert()
    // Redo replays in order, so a change that can't be redone ends the chain.
    if (gen === generation) {
      if (entry.redo) redoStack.push(entry)
      else redoStack.length = 0
    }
    show(`Undone: ${entry.label}`, { tone: 'undo' })
    return true
  } catch (e) {
    // Still applied: ⌘Z can try it again.
    if (e instanceof RolledBack && i >= 0) {
      undoStack.splice(Math.min(i, undoStack.length), 0, entry)
      emit()
    }
    reportFailure('undo', entry, e)
    return false
  }
}

/**
 * Record a change that can be reverted and show "<label> [Undo ⌘Z]".
 * Pass `redo` to let ⌘⇧Z re-apply it after an undo. `action` puts another
 * button in the toast instead of Undo ("Billa moved below [View]"); ⌘Z and
 * "Undo last change" still undo the change. Returns the toast id.
 */
export function showUndoToast(label: string, revert: Revert, opts: { duration?: number; redo?: Revert; action?: ToastAction } = {}): string {
  const entry: UndoEntry = { id: `undo-${nextId++}`, label, revert, redo: opts.redo }
  generation++
  redoStack.length = 0
  pushUndo(entry)
  return show(label, {
    id: entry.id,
    tone: 'success',
    duration: opts.duration ?? 6000,
    action: opts.action ?? { label: 'Undo', kbd: 'mod+z', onClick: () => void runUndo(entry) },
  })
}

/** Revert the most recent change (⌘Z). Resolves false when there was nothing to undo or it failed. */
export function undoLast(): Promise<boolean> {
  const last = undoStack[undoStack.length - 1]
  if (!last) {
    show('Nothing to undo', { tone: 'undo' })
    return Promise.resolve(false)
  }
  return runUndo(last)
}

/** Re-apply the most recently undone change (⌘⇧Z). Resolves false when there was nothing to redo or it failed. */
export async function redoLast(): Promise<boolean> {
  const entry = redoStack.pop()
  if (!entry?.redo) {
    show('Nothing to redo', { tone: 'undo' })
    return false
  }
  const gen = generation
  try {
    await entry.redo()
  } catch (e) {
    if (gen === generation) {
      // Still undone: ⌘⇧Z can try it again. Otherwise everything still on
      // the stack was undone before this one: it can't be replayed alone.
      if (e instanceof RolledBack) redoStack.push(entry)
      else redoStack.length = 0
    }
    reportFailure('redo', entry, e)
    return false
  }
  if (gen !== generation) {
    // A newer change landed meanwhile; the history goes on from that one.
    show(`Redone: ${entry.label}`, { tone: 'undo' })
    return true
  }
  const again: UndoEntry = { ...entry, id: `undo-${nextId++}` }
  pushUndo(again)
  show(`Redone: ${entry.label}`, {
    id: again.id,
    tone: 'undo',
    duration: 6000,
    action: { label: 'Undo', kbd: 'mod+z', onClick: () => void runUndo(again) },
  })
  return true
}

const lastUndoLabel = () => undoStack[undoStack.length - 1]?.label ?? null

/**
 * The newest change ⌘Z would undo, in words (null when there is none). It
 * outlives its toast: phones offer it under More as "Undo last change".
 */
export function useLastUndo(): string | null {
  return useSyncExternalStore(subscribe, lastUndoLabel, lastUndoLabel)
}

/** Returns `did(label, revert, { redo })`: toast with Undo, and ⌘Z / ⌘⇧Z support. */
export function useUndoToast(): typeof showUndoToast {
  return showUndoToast
}

/** Test helper. */
export function resetToasts(): void {
  items = []
  undoStack.length = 0
  redoStack.length = 0
  generation++
  emit()
}
