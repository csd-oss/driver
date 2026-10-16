import type { ComponentProps } from 'react'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/cn'
import { KeyHint } from './kbd'
import { Spinner } from './loading'
import { buttonVariants } from './variants'

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>
export type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>['size']>

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Square icon-only button. Give it an `aria-label`. */
  icon?: boolean
  /** Shows a spinner, sets aria-busy and blocks clicks. */
  loading?: boolean
  /** Shortcut hint after the label ('c', 'mod+enter'). Also sets aria-keyshortcuts. */
  kbd?: string
  /** Render the child element (e.g. a router Link) with button styles. */
  asChild?: boolean
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  icon = false,
  loading = false,
  kbd,
  asChild = false,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, icon }), className)
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-keyshortcuts={kbd && !kbd.includes(' ') ? kbd.replace(/\bmod\b/g, 'Meta') : undefined}
      {...props}
    >
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner label={null} size={size === 'sm' ? 'sm' : 'md'} className="text-current" />
        </span>
      )}
      {loading ? <span className="invisible contents">{children}</span> : children}
      {kbd && !icon && <KeyHint keys={kbd} tone={variant === 'primary' ? 'accent' : 'default'} className="ml-1" />}
    </button>
  )
}
