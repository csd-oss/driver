/**
 * Keyboard shortcut registry: one window listener, many `useShortcut` calls.
 *
 * Key syntax (case-insensitive, `KeyboardEvent.key` names):
 *   'c'  '?'  '/'  '1'            single keys
 *   'mod+k'  'mod+shift+z'        chords (`mod` = ⌘ on macOS, Ctrl elsewhere)
 *   'shift+x'  'alt+arrowup'      shift / alt chords
 *   'g d'                         sequences (space-separated steps, 900 ms apart)
 *   ['j', 'arrowdown']            alternatives
 *
 * Rules:
 * - Single keys never fire while typing in an input, textarea, select or
 *   contenteditable. Chords with `mod` do, unless `allowInInputs: false`.
 * - Layers: dialogs, side panels, menus, pickers and the palette open a
 *   shortcut layer (`<ShortcutLayer>`, built into those primitives). Only the
 *   top layer's shortcuts fire; `global: true` shortcuts fire in every layer.
 * - The last registered binding for a key wins within a layer.
 * - A key that starts a sequence (`g` in 'g d') shadows a single-key binding
 *   for the same key.
 * - Registrations with a `description` are listed in the `?` sheet (grouped by
 *   `scope`) and, unless `palette: false`, as commands in ⌘K.
 */
import { createContext, useContext, useEffect, useId, useMemo, useRef, useSyncExternalStore, type ComponentType } from 'react'

export type ShortcutHandler = (event: KeyboardEvent) => void

export interface ShortcutOptions {
  /** Shown in the shortcut sheet and the palette. Omit for hidden bindings. */
  description?: string
  /** Sheet / palette group, e.g. 'General', 'Go to', 'Work items'. Default 'General'. */
  scope?: string
  enabled?: boolean
  /** Fire even while a dialog, picker, menu or the palette is open. */
  global?: boolean
  /** Fire while focus is in a text field. Default: true for `mod` chords only. */
  allowInInputs?: boolean
  /** Default true. */
  preventDefault?: boolean
  /** List in ⌘K. Default: true when `description` is set. */
  palette?: boolean
  /** Icon for the palette row. */
  icon?: ComponentType<{ className?: string }>
}

export interface ShortcutInfo {
  id: string
  /** The first alternative as written, e.g. 'g d' or 'mod+k'. */
  keys: string
  description: string
  scope: string
  palette: boolean
  icon?: ComponentType<{ className?: string }>
  /** Runs the handler as if the keys were pressed (used by the palette). */
  run: () => void
}

interface Entry {
  id: string
  layer: string
  /** Normalised alternatives; each is a list of steps (combos). */
  alternatives: string[][]
  keys: string
  opts: ShortcutOptions
  handler: { current: ShortcutHandler }
}

export const ROOT_LAYER = 'root'
export const SEQUENCE_TIMEOUT_MS = 900

const entries: Entry[] = []
const layers: { id: string; depth: number }[] = []
const listeners = new Set<() => void>()
let snapshot: ShortcutInfo[] = []
let pending: { prefix: string; timer: ReturnType<typeof setTimeout> } | null = null
let installed = false
let nextId = 0

// ---------------------------------------------------------------------------
// Key names

const ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  cmd: 'mod',
  meta: 'mod',
  ctrl: 'mod',
  control: 'mod',
  command: 'mod',
  option: 'alt',
  del: 'delete',
  ' ': 'space',
}
const MODIFIERS = ['mod', 'alt', 'shift'] as const

/** Canonical form of one combo: 'Shift+Mod+K' → 'mod+shift+k'. */
export function normalizeCombo(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => ALIASES[p] ?? p)
  // A literal '+' key is written 'plus'.
  const key = parts.pop() ?? ''
  const mods = new Set(parts)
  return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+')
}

function parseKeys(keys: string | string[]): string[][] {
  const list = Array.isArray(keys) ? keys : [keys]
  return list.map((k) => k.trim().split(/\s+/).map(normalizeCombo))
}

const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt', 'AltGraph', 'CapsLock', 'Fn', 'OS', 'Hyper', 'Super'])

/** Canonical combo for a keyboard event. */
export function comboFromEvent(e: KeyboardEvent): string {
  let key = e.key
  // ⌥+letter types a symbol on macOS (⌥S = ß); fall back to the physical key.
  if (e.altKey && e.code) {
    if (e.code.startsWith('Key')) key = e.code.slice(3)
    else if (e.code.startsWith('Digit')) key = e.code.slice(5)
  }
  if (key === ' ') key = 'space'
  if (key === '+') key = 'plus'
  key = key.toLowerCase()
  const mods: string[] = []
  if (e.metaKey || e.ctrlKey) mods.push('mod')
  if (e.altKey) mods.push('alt')
  // Shift is implicit in symbols ('?', '!'); explicit for letters and named keys.
  if (e.shiftKey && (/^[a-z]$/.test(key) || key.length > 1)) mods.push('shift')
  return [...mods, key].join('+')
}

export const isMac = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

const GLYPHS: Record<string, string> = {
  shift: '⇧',
  enter: '↵',
  escape: 'Esc',
  backspace: '⌫',
  delete: 'Del',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  tab: 'Tab',
  space: 'Space',
  plus: '+',
}

function keyLabel(k: string): string {
  if (k === 'mod') return isMac() ? '⌘' : 'Ctrl'
  if (k === 'alt') return isMac() ? '⌥' : 'Alt'
  return GLYPHS[k] ?? (k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1))
}

/** Key caps for one combo: 'mod+shift+z' → ['⌘', '⇧', 'Z']. */
export function formatKeys(combo: string): string[] {
  return normalizeCombo(combo).split('+').map(keyLabel)
}

/** Key caps per step: 'g d' → [['G'], ['D']]; 'mod+k' → [['⌘', 'K']]. */
export function formatShortcut(keys: string): string[][] {
  return keys.trim().split(/\s+/).map(formatKeys)
}

/** Human text, e.g. for tooltips and aria-keyshortcuts: 'g d' → 'G then D'. */
export function describeShortcut(keys: string): string {
  return formatShortcut(keys)
    .map((step) => step.join(isMac() ? '' : '+'))
    .join(' then ')
}

// ---------------------------------------------------------------------------
// Dispatch

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type)
}

/** Deepest open layer; among equals, the most recently opened. */
function topLayer(): string {
  let top: { id: string; depth: number } | undefined
  for (const l of layers) if (!top || l.depth >= top.depth) top = l
  return top?.id ?? ROOT_LAYER
}

function clearPending() {
  if (pending) clearTimeout(pending.timer)
  pending = null
}

function findLast(list: Entry[], pred: (e: Entry) => boolean): Entry | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const entry = list[i]
    if (entry && pred(entry)) return entry
  }
  return undefined
}

function fire(entry: Entry, e: KeyboardEvent) {
  if (entry.opts.preventDefault !== false) e.preventDefault()
  entry.handler.current(e)
}

export function handleKeydown(e: KeyboardEvent): void {
  if (e.defaultPrevented || e.isComposing || MODIFIER_KEYS.has(e.key)) return
  const combo = comboFromEvent(e)
  const typing = isEditable(e.target)
  const top = topLayer()
  const eligible = entries.filter((s) => s.opts.enabled !== false && (s.layer === top || s.opts.global))
  const allowed = (s: Entry, steps: string[]) =>
    !typing || (s.opts.allowInInputs ?? (steps.length === 1 && steps[0]?.startsWith('mod+')))

  if (pending) {
    const prefix = pending.prefix
    clearPending()
    const hit = findLast(eligible, (s) =>
      s.alternatives.some((alt) => alt.length === 2 && alt[0] === prefix && alt[1] === combo && allowed(s, alt)),
    )
    if (hit) return fire(hit, e)
  }

  if (!typing && !e.repeat) {
    const startsSequence = eligible.some((s) => s.alternatives.some((alt) => alt.length > 1 && alt[0] === combo))
    if (startsSequence) {
      pending = { prefix: combo, timer: setTimeout(clearPending, SEQUENCE_TIMEOUT_MS) }
      return
    }
  }

  const hit = findLast(eligible, (s) =>
    s.alternatives.some((alt) => alt.length === 1 && alt[0] === combo && allowed(s, alt)),
  )
  if (hit) fire(hit, e)
}

/** Install the single window listener. Idempotent; `useShortcut` calls it. */
export function installShortcuts(): () => void {
  if (!installed && typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
    installed = true
  }
  return () => {
    window.removeEventListener('keydown', handleKeydown)
    installed = false
  }
}

// ---------------------------------------------------------------------------
// Registration

function changed() {
  snapshot = entries
    .filter((s) => s.opts.description && s.opts.enabled !== false)
    .map((s) => ({
      id: s.id,
      keys: s.keys,
      description: s.opts.description as string,
      scope: s.opts.scope ?? 'General',
      palette: s.opts.palette ?? true,
      icon: s.opts.icon,
      run: () => s.handler.current(new KeyboardEvent('keydown')),
    }))
  listeners.forEach((l) => l())
}

/** Imperative registration (tests, non-React code). Returns an unregister function. */
export function registerShortcut(
  keys: string | string[],
  handler: ShortcutHandler,
  opts: ShortcutOptions = {},
  layer: string = ROOT_LAYER,
): () => void {
  installShortcuts()
  const entry: Entry = {
    id: `s${nextId++}`,
    layer,
    alternatives: parseKeys(keys),
    keys: Array.isArray(keys) ? (keys[0] ?? '') : keys,
    opts,
    handler: { current: handler },
  }
  entries.push(entry)
  changed()
  return () => {
    const i = entries.indexOf(entry)
    if (i >= 0) entries.splice(i, 1)
    changed()
  }
}

/** Open a layer; shortcuts outside it (except `global`) pause until it closes. */
export function pushLayer(id: string, depth = 1): () => void {
  const layer = { id, depth }
  layers.push(layer)
  clearPending()
  return () => {
    const i = layers.indexOf(layer)
    if (i >= 0) layers.splice(i, 1)
  }
}

export interface ShortcutLayerValue {
  id: string
  depth: number
}
export const ShortcutLayerContext = createContext<ShortcutLayerValue>({ id: ROOT_LAYER, depth: 0 })

/**
 * Register a shortcut while the component is mounted. The latest `handler` is
 * always used, so inline closures are fine.
 *
 *   useShortcut('s', openStatusPicker, { scope: 'Work items', description: 'Set status' })
 *   useShortcut('g t', goTimeline, { scope: 'Go to', description: 'Timeline' })
 */
export function useShortcut(keys: string | string[], handler: ShortcutHandler, opts: ShortcutOptions = {}): void {
  const layer = useContext(ShortcutLayerContext).id
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  const keySig = Array.isArray(keys) ? keys.join('|') : keys
  const { description, scope, enabled, global, allowInInputs, preventDefault, palette, icon } = opts
  useEffect(() => {
    if (enabled === false) return
    return registerShortcut(
      keySig.split('|'),
      (e) => handlerRef.current(e),
      { description, scope, global, allowInInputs, preventDefault, palette, icon },
      layer,
    )
  }, [keySig, layer, description, scope, enabled, global, allowInInputs, preventDefault, palette, icon])
}

/** Open a shortcut layer while `active`. Returns the value to provide via ShortcutLayerContext. */
export function useShortcutLayer(active = true): ShortcutLayerValue {
  const parent = useContext(ShortcutLayerContext)
  const id = useId()
  const depth = parent.depth + 1
  useEffect(() => (active ? pushLayer(id, depth) : undefined), [id, depth, active])
  return useMemo(() => (active ? { id, depth } : parent), [active, id, depth, parent])
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Every described, enabled shortcut currently mounted (feeds the sheet and ⌘K). */
export function useRegisteredShortcuts(): ShortcutInfo[] {
  return useSyncExternalStore(subscribe, () => snapshot)
}

/** Test helper: drop all registrations, layers and pending sequences. */
export function resetShortcuts(): void {
  entries.length = 0
  layers.length = 0
  clearPending()
  changed()
}
