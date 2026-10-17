import { Fragment, type ReactNode } from 'react'
import { type Locale, type MessageKey, translate } from './index'

/**
 * A message whose placeholders are React nodes (a `<code>`, a link). Text around them stays
 * plain. `translateRich('sk', 'auth.demoHint', { admin: <code>jana@demo.sk</code>, … })`.
 */
export function translateRich(locale: Locale, key: MessageKey, vars: Record<string, ReactNode>): ReactNode {
  const parts = translate(locale, key).split(/(\{\w+\})/g)
  return parts.map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part)
    const node = m && m[1] !== undefined && m[1] in vars ? vars[m[1]] : part
    return <Fragment key={i}>{node}</Fragment>
  })
}
