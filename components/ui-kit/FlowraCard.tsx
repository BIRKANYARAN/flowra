'use client'
// FlowraCard — adapter over the design-system Card primitive.
// Maps the legacy className-only API to the new CVA padding/interactive system.

import { ReactNode } from 'react'
import { Card, cn } from '@/components/ui'

interface FlowraCardProps {
  children: ReactNode
  /** Inner padding: none | sm (p-4) | md (p-5, default) | lg (p-6) */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Show hover-border and pointer — use for clickable cards */
  interactive?: boolean
  /** Extra Tailwind classes */
  className?: string
  /** Optional click handler (enables interactive automatically) */
  onClick?: () => void
  /** Test/accessibility id */
  id?: string
}

export function FlowraCard({
  children, padding = 'md', interactive = false, className, onClick, id,
}: FlowraCardProps) {
  return (
    <Card
      padding={padding}
      interactive={!!(interactive || onClick)}
      className={cn(onClick && 'cursor-pointer', className)}
      id={id}
    >
      {onClick
        ? <div onClick={onClick} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && onClick()}>{children}</div>
        : children}
    </Card>
  )
}
