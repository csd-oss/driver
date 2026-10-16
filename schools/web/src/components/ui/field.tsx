import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon, MinusIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/cn'

// ---------------------------------------------------------------------------
// Field: label + control + hint/error, ids wired for assistive tech.

interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

const FieldContext = createContext<FieldControlProps | null>(null)

/** Merge Field-provided id / aria props into a control's own props. */
function useFieldProps<P extends { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: ComponentProps<'input'>['aria-invalid'] }>(
  props: P,
): P {
  const ctx = useContext(FieldContext)
  if (!ctx) return props
  return {
    ...props,
    id: props.id ?? ctx.id,
    'aria-describedby': props['aria-describedby'] ?? ctx['aria-describedby'],
    'aria-invalid': props['aria-invalid'] ?? ctx['aria-invalid'],
  }
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  /** A control (Input, Select, Textarea pick up the id automatically) or a render function. */
  children: ReactNode | ((props: FieldControlProps) => ReactNode)
  className?: string
}

/** Prototype `.field`: label (12px muted), control, hint or error below. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  const control: FieldControlProps = { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <FieldContext.Provider value={control}>{typeof children === 'function' ? children(control) : children}</FieldContext.Provider>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Text controls (prototype `.input`, `.select`, `.textarea`)

const control = [
  'w-full rounded-md border border-line-input bg-surface text-sm text-fg outline-none placeholder:text-subtle',
  'transition-[border-color,box-shadow] duration-(--dur-instant)',
  'focus:border-accent focus:ring-3 focus:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger',
].join(' ')

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-control px-2.5', className)} {...useFieldProps(props)} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(control, 'min-h-18 resize-y px-2.5 py-2 leading-normal', className)}
      {...useFieldProps(props)}
    />
  )
}

/** Native select (best on touch, keyboard and screen readers) styled as `.select`. `className` sizes the wrapper. */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <span className={cn('relative inline-flex w-full', className)}>
      <select className={cn(control, 'h-control appearance-none pr-6.5 pl-2.5')} {...useFieldProps(props)} />
      <ChevronDownIcon aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-subtle" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// Checkbox and Switch (Radix, styled as `.check` and `.switch`)

function ControlLabel({ label, description, disabled, children, className }: {
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  if (!label) return <>{children}</>
  return (
    <label className={cn('inline-flex items-start gap-2 text-sm text-fg', disabled ? 'opacity-60' : 'cursor-pointer', className)}>
      <span className="flex h-5 items-center">{children}</span>
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        {description && <span className="text-xs text-subtle">{description}</span>}
      </span>
    </label>
  )
}

export interface CheckboxProps extends Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> {
  /** Clickable text to the right; omit and pass `aria-label` for a bare box. */
  label?: ReactNode
  description?: ReactNode
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <ControlLabel label={label} description={description} disabled={props.disabled} className={label ? className : undefined}>
      <CheckboxPrimitive.Root
        className={cn(
          'grid size-3.75 flex-none place-items-center rounded-sm border-[1.5px] border-line-input bg-surface outline-none',
          'focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed',
          'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
          !label && className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator className="text-accent-fg">
          {props.checked === 'indeterminate' ? (
            <MinusIcon aria-hidden className="size-2.75" strokeWidth={3} />
          ) : (
            <CheckIcon aria-hidden className="size-2.75" strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    </ControlLabel>
  )
}

export interface SwitchProps extends Omit<ComponentProps<typeof SwitchPrimitive.Root>, 'children'> {
  label?: ReactNode
  description?: ReactNode
}

export function Switch({ label, description, className, ...props }: SwitchProps) {
  return (
    <ControlLabel label={label} description={description} disabled={props.disabled} className={label ? className : undefined}>
      <SwitchPrimitive.Root
        className={cn(
          'relative h-4 w-7 flex-none rounded-full bg-line-strong outline-none transition-colors duration-(--dur-fast)',
          'focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed data-[state=checked]:bg-accent',
          !label && className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-3 translate-x-0.5 rounded-full bg-surface shadow-xs transition-transform duration-(--dur-fast) ease-standard data-[state=checked]:translate-x-3.5" />
      </SwitchPrimitive.Root>
    </ControlLabel>
  )
}
