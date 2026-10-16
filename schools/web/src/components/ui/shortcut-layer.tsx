import type { ReactNode } from 'react'
import { ShortcutLayerContext, useShortcutLayer } from '@/lib/shortcuts'

/**
 * Opens a shortcut layer while mounted and `active`: page shortcuts pause and
 * only shortcuts registered inside (or `global` ones) fire. Built into Dialog,
 * SidePanel, Menu, Popover, Picker and the command palette.
 */
export function ShortcutLayer({ active = true, children }: { active?: boolean; children: ReactNode }) {
  const layer = useShortcutLayer(active)
  return <ShortcutLayerContext.Provider value={layer}>{children}</ShortcutLayerContext.Provider>
}
