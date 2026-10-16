/**
 * Class recipes shared across the component library (kept out of the
 * component files so React Fast Refresh keeps working).
 */
import { cva } from 'class-variance-authority'

/** Prototype `.btn` + `.btn-{primary,ghost,danger}` + `.btn-{sm,lg}` + `.btn-icon`. */
export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium select-none',
    'transition-[background-color,border-color,color] duration-(--dur-instant) ease-standard',
    'outline-none focus-visible:ring-3 focus-visible:ring-ring active:translate-y-[0.5px]',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
    'aria-pressed:border-line-strong aria-pressed:bg-selected aria-pressed:text-fg',
  ],
  {
    variants: {
      variant: {
        default: 'border-line-strong bg-surface text-fg shadow-xs hover:bg-hover [&>svg.lucide]:text-subtle',
        primary: 'border-transparent bg-accent text-accent-fg shadow-xs hover:bg-accent-hover',
        ghost: 'border-transparent bg-transparent text-muted hover:bg-hover hover:text-fg [&>svg.lucide]:text-subtle',
        danger: 'border-line-strong bg-surface text-danger-text shadow-xs hover:bg-danger-soft',
      },
      size: {
        sm: 'h-control-sm px-2 text-xs [&_svg:not([class*=size-])]:size-3.5',
        md: 'h-control px-2.5 text-sm [&_svg:not([class*=size-])]:size-4',
        lg: 'h-control-lg px-4 text-base [&_svg:not([class*=size-])]:size-4',
      },
      icon: { true: 'px-0', false: '' },
    },
    compoundVariants: [
      { icon: true, size: 'sm', className: 'w-control-sm' },
      { icon: true, size: 'md', className: 'w-control' },
      { icon: true, size: 'lg', className: 'w-control-lg' },
    ],
    defaultVariants: { variant: 'default', size: 'md', icon: false },
  },
)

/** Prototype `.chip` + `.chip-{accent,success,warning,danger,info}`. */
export const chipVariants = cva(
  'inline-flex h-5.5 max-w-full items-center gap-1.25 rounded-full border px-1.75 text-xs whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface text-muted',
        accent: 'border-transparent bg-accent-soft text-accent-text',
        success: 'border-transparent bg-success-soft text-success-text',
        warning: 'border-transparent bg-warning-soft text-warning-text',
        danger: 'border-transparent bg-danger-soft text-danger-text',
        info: 'border-transparent bg-info-soft text-info-text',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

/** Floating surface shared by menus, pickers and popovers (prototype `.menu`). */
export const floatingSurface =
  'z-dropdown rounded-lg border border-line bg-raised text-sm text-fg shadow-lg outline-none animate-pop origin-(--radix-popper-transform-origin)'

/** Row styles shared with Picker and the palette (prototype `.menu-item`). */
export const menuItemClass = [
  'relative flex h-7.5 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-sm text-fg outline-none select-none',
  'data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg:not([class*=size-])]:size-4 [&>svg]:text-subtle',
  'max-[720px]:h-auto max-[720px]:min-h-touch',
].join(' ')

/** Category palette index (0–9) or any CSS colour. */
export type LabelColor = number | (string & {})

export function labelColor(color: LabelColor | undefined): string {
  if (color === undefined) return 'var(--fg-faint)'
  return typeof color === 'number' ? `var(--cat-${((color % 10) + 10) % 10})` : color
}
