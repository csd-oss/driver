import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckIcon, CircleAlertIcon, InfoIcon, Redo2Icon, TriangleAlertIcon, Undo2Icon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { isMac, useShortcut } from '@/lib/shortcuts'
import { KeyHint } from './kbd'
import { dismissToast, redoLast, undoLast, useToasts, type ToastItem, type ToastTone } from './toast'

const toneIcon: Record<ToastTone, ReactNode> = {
  default: null,
  success: <CheckIcon aria-hidden />,
  error: <CircleAlertIcon aria-hidden />,
  warning: <TriangleAlertIcon aria-hidden />,
  info: <InfoIcon aria-hidden />,
  undo: <Undo2Icon aria-hidden />,
}

/**
 * Toast stack, bottom centre (prototype `.toasts`). Mount once at the root.
 * Also owns ⌘Z (reverts the most recent `did(…)` change) and ⌘⇧Z / Ctrl+Y
 * (re-applies the last undone one). Both work over dialogs and side panels,
 * but leave text fields their own undo.
 */
export function Toaster() {
  const toasts = useToasts()
  useShortcut('mod+z', () => void undoLast(), {
    description: 'Undo your last change',
    scope: 'General',
    global: true,
    allowInInputs: false,
    icon: Undo2Icon,
  })
  useShortcut(isMac() ? 'mod+shift+z' : ['mod+shift+z', 'mod+y'], () => void redoLast(), {
    description: 'Redo the last undone change',
    scope: 'General',
    global: true,
    allowInInputs: false,
    icon: Redo2Icon,
  })
  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-[calc(var(--space-5)+var(--toast-lift,0px)+var(--bulk-lift,0px)+env(safe-area-inset-bottom,0px))] left-1/2 z-toast flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <Toast key={t.id} item={t} />
      ))}
    </section>
  )
}

function Toast({ item }: { item: ToastItem }) {
  const { id, message, tone = 'default', icon, action } = item
  const duration = item.duration ?? (tone === 'error' ? 6000 : 4200)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(duration)
  const started = useRef(0)

  useEffect(() => {
    remaining.current = duration
  }, [duration, message])

  useEffect(() => {
    if (paused || !Number.isFinite(remaining.current)) return
    started.current = Date.now()
    const t = setTimeout(() => dismissToast(id), remaining.current)
    return () => {
      clearTimeout(t)
      remaining.current -= Date.now() - started.current
    }
  }, [id, paused, message])

  const leading = icon === undefined ? toneIcon[tone] : icon
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      data-tone={tone}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex max-w-full animate-toast-in items-center gap-3 rounded-lg bg-inverse py-2 pr-2 pl-3 text-sm text-on-inverse shadow-lg',
        !action && 'pr-3',
        action && 'max-desk:py-1 max-desk:pr-1',
      )}
    >
      {leading && <span className="flex flex-none opacity-70 [&_svg]:size-4">{leading}</span>}
      <span className="min-w-0 flex-1">{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick()
            dismissToast(id)
          }}
          className="inline-flex flex-none items-center gap-1.5 rounded-sm bg-on-inverse/14 px-2 py-0.75 font-semibold text-on-inverse outline-none hover:bg-on-inverse/22 focus-visible:ring-3 focus-visible:ring-ring max-desk:min-h-11 max-desk:min-w-14 max-desk:justify-center max-desk:px-3"
        >
          {action.label}
          {action.kbd && <KeyHint keys={action.kbd} tone="inverse" />}
        </button>
      )}
    </div>
  )
}
