'use client'
// FlowraKpiCard — composite KPI tile matching the design system spec.
// Replaces hand-rolled KpiCard components throughout the dashboard.

import { ReactNode } from 'react'
import Link from 'next/link'
import { cn, Label, Money } from '@/components/ui'

interface FlowraKpiCardProps {
  /** Uppercase label shown above the value */
  label: string
  /** Numeric value — rendered via <Money> */
  value: number
  /** ISO currency symbol ('₺' | '$' | '€') or the raw symbol string */
  currency?: string
  /** Decimal places (default 0 for KPI tiles) */
  decimals?: number
  /** Small sub-line below the value */
  sub?: string
  /** Delta percentage versus previous period — shown with ▲/▼ */
  delta?: number
  /** Custom tone override */
  tone?: 'neutral' | 'positive' | 'negative' | 'auto'
  /** Link the whole card to a page */
  href?: string
  /** Extra classes on the outer wrapper */
  className?: string
  /** Render pre-formatted string instead of Money (for abbreviated values) */
  rawValue?: string
  /** Optional slot for an action or badge in the top-right */
  action?: ReactNode
}

export function FlowraKpiCard({
  label, value, currency = '₺', decimals = 0, sub, delta,
  tone = 'auto', href, className, rawValue, action,
}: FlowraKpiCardProps) {
  const resolvedTone = tone === 'auto'
    ? value > 0 ? 'neutral' : value < 0 ? 'negative' : 'neutral'
    : tone

  const inner = (
    <div className={cn(
      'bg-white border border-gray-100 rounded px-3.5 py-3 flex flex-col gap-1 shadow-sm',
      href && 'hover:border-gray-300 transition-colors',
      className,
    )}>
      <div className="flex items-start justify-between gap-1">
        <Label>{label}</Label>
        {action}
      </div>

      <div className="leading-none mt-0.5">
        {rawValue ? (
          <span className={cn(
            'text-[22px] font-black tabular-nums leading-none',
            resolvedTone === 'negative' ? 'text-red-600' : 'text-gray-900',
          )}>
            {rawValue}
          </span>
        ) : (
          <Money
            value={value}
            currency={currency}
            decimals={decimals}
            emphasis="kpi"
            tone={resolvedTone === 'neutral' ? 'neutral' : resolvedTone}
          />
        )}
      </div>

      {sub && (
        <div className="text-[10px] text-gray-400 leading-tight truncate">{sub}</div>
      )}

      {delta !== undefined && (
        <div className={cn(
          'text-[11px] font-semibold tabular-nums',
          delta >= 0 ? 'text-emerald-600' : 'text-red-600',
        )}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
          <span className="text-gray-400 font-normal"> geçen ay</span>
        </div>
      )}
    </div>
  )

  return href ? <Link href={href} className="block">{inner}</Link> : inner
}
