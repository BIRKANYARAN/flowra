'use client'
// FlowraStatusBadge — adapter that passes through to the unified StatusBadge.
// Accepts both English DB keys and Turkish display strings.

import { StatusBadge } from '@/components/ui'

interface FlowraStatusBadgeProps {
  /** English DB key (draft, sent, accepted…) OR Turkish display string */
  status: string
  /** Optional size override */
  size?: 'sm' | 'md'
}

export function FlowraStatusBadge({ status, size = 'md' }: FlowraStatusBadgeProps) {
  // size="sm" — slightly smaller pill, otherwise identical
  return (
    <span className={size === 'sm' ? 'scale-90 origin-left inline-block' : 'inline-block'}>
      <StatusBadge status={status} />
    </span>
  )
}
