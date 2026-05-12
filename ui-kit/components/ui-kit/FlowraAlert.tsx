'use client'
// FlowraAlert — alert / notification row component.
// Maps tone → colour palette automatically.

import { ReactNode } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/components/ui'

type Tone = 'warning' | 'danger' | 'info' | 'success' | 'orange'

const PALETTE: Record<Tone, { bg: string; fg: string; icon: string }> = {
  warning: { bg: 'bg-amber-50 border-amber-200',  fg: 'text-amber-700',  icon: 'alert'      },
  danger:  { bg: 'bg-red-50 border-red-200',       fg: 'text-red-700',    icon: 'flame'      },
  info:    { bg: 'bg-blue-50 border-blue-200',     fg: 'text-blue-700',   icon: 'info'       },
  success: { bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-700', icon: 'check'  },
  orange:  { bg: 'bg-orange-50 border-orange-200', fg: 'text-orange-700', icon: 'alert'      },
}

interface FlowraAlertProps {
  /** Alert severity */
  tone?: Tone
  /** Primary message */
  text: string
  /** Optional sub-line / detail */
  sub?: string
  /** Override icon — Lucide key or emoji */
  icon?: string
  /** Link the whole alert row to a page */
  href?: string
  /** Slot for a right-side action button/link */
  action?: ReactNode
  className?: string
  /** Compact pill row vs. tall card — pill is the default (matches dashboard) */
  variant?: 'pill' | 'card'
}

export function FlowraAlert({
  tone = 'warning', text, sub, icon, href, action, className, variant = 'pill',
}: FlowraAlertProps) {
  const p = PALETTE[tone]
  const iconKey = icon ?? p.icon

  const inner = variant === 'pill' ? (
    <div className={cn(
      'flex items-center gap-2.5 border rounded-lg px-3 py-1.5 transition-all',
      p.bg,
      href && 'hover:shadow-sm cursor-pointer',
      className,
    )}>
      <Icon name={iconKey} size={14} className={cn('shrink-0', p.fg)} />
      <span className={cn('text-xs font-semibold', p.fg)}>{text}</span>
      {sub && <span className="text-[11px] text-gray-400 ml-1 truncate">{sub}</span>}
      {action && <div className="ml-auto shrink-0">{action}</div>}
      {href && !action && (
        <span className={cn('text-[10px] font-bold ml-auto shrink-0', p.fg)}>→</span>
      )}
    </div>
  ) : (
    <div className={cn(
      'flex items-start gap-3 border rounded-2xl p-4',
      p.bg,
      href && 'hover:shadow-sm cursor-pointer transition-all',
      className,
    )}>
      <div className={cn('mt-0.5 shrink-0', p.fg)}>
        <Icon name={iconKey} size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', p.fg)}>{text}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )

  return href ? <Link href={href}>{inner}</Link> : inner
}
