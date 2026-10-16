import type { ComponentProps, ReactNode } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { cn } from '@/lib/cn'
import { CountBadge } from './badge'

/** Radix Tabs styled as prototype `.tabs` / `.tab` (underline, 34px). Arrow keys move between tabs. */
export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('scroll-hint-x flex gap-4 overflow-x-auto border-b border-line [scrollbar-width:none]', className)}
      {...props}
    />
  )
}

export interface TabsTriggerProps extends ComponentProps<typeof TabsPrimitive.Trigger> {
  count?: ReactNode
}

export function TabsTrigger({ className, count, children, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex h-8.5 items-center gap-1.5 border-b-2 border-transparent font-medium whitespace-nowrap text-muted outline-none',
        'hover:text-fg focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50',
        'data-[state=active]:border-fg data-[state=active]:text-fg',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <CountBadge className="ml-0.5">{count}</CountBadge>}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('outline-none focus-visible:ring-3 focus-visible:ring-ring', className)} {...props} />
}
