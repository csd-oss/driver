import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/** Data table (prototype `.table`): 32px header on canvas-subtle, rows at --row-h, hover tint. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="scroll-hint-x relative overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props} />
    </div>
  )
}

export function TableHead(props: ComponentProps<'thead'>) {
  return <thead {...props} />
}

export function TableBody(props: ComponentProps<'tbody'>) {
  return <tbody {...props} />
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('[&:hover>td]:bg-hover', className)} {...props} />
}

export function TableHeaderCell({ className, scope = 'col', ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope={scope}
      className={cn(
        'h-8 border-b border-line bg-canvas-subtle px-3 text-left text-xs font-medium whitespace-nowrap text-subtle',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('h-row border-b border-line-subtle px-3 whitespace-nowrap', className)} {...props} />
}
