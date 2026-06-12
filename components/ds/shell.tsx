'use client'

// ─────────────────────────────────────────────────────────────────────────────
// components/ds/shell.tsx — Flowra OS Shell Primitives
//
// THE canonical set of layout and content primitives for Flowra's executive
// operating system. Every new screen MUST use these instead of ad-hoc divs.
//
// GOVERNANCE RULES:
//
//   PageShell      → wraps every dashboard page    (max-w-5xl, gap-5)
//   Panel          → every content block            (white, gray-100 border, rounded, subtle shadow)
//   PanelHeader    → panel title row                (border-b, px-5 py-3.5)
//   KpiStrip       → horizontal instrument bar      (divide-x, single container)
//   KpiCell        → individual reading in a strip  (px-5 py-3.5)
//   SectionLabel   → uppercase category label       (text-[0.65rem] font-bold uppercase tracking-wider)
//   PageHero       → page title + subtitle + CTA
//   PressureBanner → adaptive pressure mode banner  (severity-aware colors)
//   EmptySlate     → empty state inside a panel
//   Skeleton       → loading placeholder            (animate-pulse)
//   DataTable      → canonical table wrapper
//   DataRow        → canonical table row (hover state, divide-y)
// ─────────────────────────────────────────────────────────────────────────────

import { ReactNode } from 'react'
import React from 'react'
import Link from 'next/link'
import { cn } from '@/components/ui'

// ─────────────────────────────────────────────────────────────────────────────
// TOKENS (canonical values — never deviate from these)
// ─────────────────────────────────────────────────────────────────────────────

export const TOKENS = {
  // Card / Panel
  panel:         'bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm',
  panelHover:    'hover:shadow-[0_2px_6px_rgba(17,24,39,0.07)] hover:border-[#e8eaef] transition-all',
  panelCritical: 'bg-neg-light   border border-neg-light   rounded',
  panelWarn:     'bg-warn-light border border-warn-light rounded',
  panelOk:       'bg-pos-light border border-pos-light rounded',

  // Section label (inner, above a block)
  label: 'text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] leading-none',

  // Page-level section divider label
  pageLabel: 'text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-1.5',

  // Page hero title
  heroTitle: 'text-2xl font-bold tracking-tight text-[#0f172a] leading-tight',
  heroSub:   'text-sm text-[#94a3b8] mt-1',
  heroSuper: 'text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1',

  // Typography
  valueXl:  'text-xl font-extrabold tabular-nums leading-none',
  value2xl: 'text-[22px] font-extrabold tabular-nums leading-none',
  valueSm:  'text-sm font-extrabold tabular-nums',
  mono:     'font-mono tabular-nums',

  // Status colors
  ok:       'text-pos-text',
  warn:     'text-warn-text',
  critical: 'text-neg',
  neutral:  'text-[#0f172a]',

  // Layout
  page:       'flex flex-col gap-5 max-w-5xl',
  pageNarrow: 'flex flex-col gap-5 max-w-3xl',
  pageWide:   'flex flex-col gap-5',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// PageShell
// ─────────────────────────────────────────────────────────────────────────────

export function PageShell({
  children,
  width = 'default',
  className,
}: {
  children: ReactNode
  width?: 'narrow' | 'default' | 'wide'
  className?: string
}) {
  const w = width === 'narrow' ? TOKENS.pageNarrow : width === 'wide' ? TOKENS.pageWide : TOKENS.page
  return <div className={cn(w, className)}>{children}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// PageHero — canonical page title block
// ─────────────────────────────────────────────────────────────────────────────

export function PageHero({
  super: superLabel,
  title,
  sub,
  cta,
}: {
  super?: string
  title: string
  sub?: string
  cta?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div>
        {superLabel && (
          <div className={TOKENS.heroSuper}>{superLabel}</div>
        )}
        <h1 className={TOKENS.heroTitle}>{title}</h1>
        {sub && <p className={TOKENS.heroSub}>{sub}</p>}
      </div>
      {cta && <div className="flex items-center gap-2 flex-shrink-0">{cta}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SectionLabel — uppercase 10px category label
// ─────────────────────────────────────────────────────────────────────────────

export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn(TOKENS.label, className)}>{children}</div>
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel — canonical content block
// ─────────────────────────────────────────────────────────────────────────────

export function Panel({
  children,
  className,
  tone,
  as,
  href,
  onClick,
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'critical' | 'warn' | 'ok'
  as?: string
  href?: string
  onClick?: () => void
}) {
  const toneClass =
    tone === 'critical' ? TOKENS.panelCritical :
    tone === 'warn'     ? TOKENS.panelWarn     :
    tone === 'ok'       ? TOKENS.panelOk       :
    TOKENS.panel

  const isInteractive = !!(href || onClick)

  if (href) {
    return (
      <Link
        href={href}
        className={cn(toneClass, TOKENS.panelHover, 'block overflow-hidden', className)}
      >
        {children}
      </Link>
    )
  }

  const DivEl = (as ?? 'div') as React.ElementType
  return (
    <DivEl
      className={cn(toneClass, isInteractive && TOKENS.panelHover, 'overflow-hidden', className)}
      onClick={onClick}
    >
      {children}
    </DivEl>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PanelHeader — panel title row with optional action
// ─────────────────────────────────────────────────────────────────────────────

export function PanelHeader({
  label,
  sub,
  action,
  tight = false,
}: {
  label: string
  sub?: string
  action?: ReactNode
  tight?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center justify-between border-b border-[#f1f5f9]',
      tight ? 'px-4 py-2.5' : 'px-5 py-3.5'
    )}>
      <div>
        <div className={TOKENS.label}>{label}</div>
        {sub && <div className="text-[10px] text-[#94a3b8] mt-0.5">{sub}</div>}
      </div>
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiStrip — horizontal instrument bar (Bloomberg-style)
// ─────────────────────────────────────────────────────────────────────────────

export function KpiStrip({
  children,
  cols,
  className,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4 | 5 | 6
  className?: string
}) {
  const colClass = cols ? {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  }[cols] : undefined

  return (
    <div className={cn(
      TOKENS.panel,
      'overflow-hidden',
      className
    )}>
      <div className={cn(
        colClass ? `grid ${colClass} divide-x divide-[#e8eaef]` : 'flex items-stretch divide-x divide-[#e8eaef] overflow-x-auto scrollbar-none',
      )}>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiCell — individual reading inside a KpiStrip
// ─────────────────────────────────────────────────────────────────────────────

export function KpiCell({
  label,
  value,
  sub,
  tone = 'neutral',
  href,
  compact = false,
}: {
  label: string
  value: string | ReactNode
  sub?: string
  tone?: 'neutral' | 'ok' | 'warn' | 'critical'
  href?: string
  compact?: boolean
}) {
  const valueColor =
    tone === 'ok'       ? TOKENS.ok       :
    tone === 'warn'     ? TOKENS.warn      :
    tone === 'critical' ? TOKENS.critical  :
    TOKENS.neutral

  const content = (
    <div className={cn('flex flex-col flex-shrink-0', compact ? 'px-4 py-3' : 'px-5 py-3.5')}>
      <span className={cn(TOKENS.label, 'mb-1.5')}>{label}</span>
      <span className={cn(TOKENS.value2xl, valueColor)}>{value}</span>
      {sub && <span className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</span>}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="hover:bg-[#f8fafc]/70 transition-colors">
        {content}
      </Link>
    )
  }
  return content
}

// ─────────────────────────────────────────────────────────────────────────────
// PressureBanner — adaptive pressure mode banner
// ─────────────────────────────────────────────────────────────────────────────

export function PressureBanner({
  severity,
  tag,
  message,
  actionLabel,
  actionHref,
}: {
  severity: 'critical' | 'warn' | 'info'
  tag: string
  message: string
  actionLabel?: string
  actionHref?: string
}) {
  const theme = {
    critical: {
      wrap:   'border border-neg-light bg-neg-light',
      tag:    'text-[9px] font-bold uppercase tracking-wider text-neg',
      msg:    'text-sm text-neg-text font-medium',
      btn:    'text-xs font-bold text-neg-text bg-neg-light hover:bg-neg-light',
    },
    warn: {
      wrap:   'border border-warn-light bg-warn-light',
      tag:    'text-[9px] font-bold uppercase tracking-wider text-warn-text',
      msg:    'text-sm text-warn-text font-medium',
      btn:    'text-xs font-bold text-warn-text bg-warn-light hover:bg-warn-light',
    },
    info: {
      wrap:   'border border-info-light bg-info-light',
      tag:    'text-[9px] font-bold uppercase tracking-wider text-info-text',
      msg:    'text-sm text-info-text font-medium',
      btn:    'text-xs font-bold text-info-text bg-info-light hover:bg-info-light',
    },
  }[severity]

  return (
    <div className={cn('flex items-center justify-between gap-3 px-5 py-3 rounded', theme.wrap)}>
      <div className="flex items-center gap-3 min-w-0">
        <span className={cn(theme.tag, 'flex-shrink-0')}>{tag}</span>
        <span className={cn(theme.msg, 'truncate')}>{message}</span>
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className={cn(theme.btn, 'flex-shrink-0 px-3 py-1.5 rounded transition-colors whitespace-nowrap')}
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptySlate — canonical empty state inside a panel
// ─────────────────────────────────────────────────────────────────────────────

export function EmptySlate({
  icon,
  title,
  sub,
  action,
}: {
  icon?: string
  title: string
  sub?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-14 px-6">
      {icon && <div className="text-3xl mb-3">{icon}</div>}
      <div className="text-sm font-black text-[#0f172a] mb-1">{title}</div>
      {sub && <div className="text-xs text-[#94a3b8] mb-4">{sub}</div>}
      {action}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton — consistent loading placeholder
// ─────────────────────────────────────────────────────────────────────────────

export function Skeleton({
  height = 'h-12',
  className,
}: {
  height?: string
  className?: string
}) {
  return (
    <div className={cn('fl-shimmer rounded-lg', height, className)} />
  )
}

export function SkeletonPanel({ rows = 3 }: { rows?: number }) {
  return (
    <div className={cn(TOKENS.panel, 'p-5 space-y-3 animate-pulse')}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-3 bg-[#f1f5f9] rounded-full" style={{ width: `${65 + (i % 3) * 15}%` }} />
      ))}
    </div>
  )
}

export function SkeletonKpiStrip({ cells = 4 }: { cells?: number }) {
  return (
    <div className={cn(TOKENS.panel, 'overflow-hidden')}>
      <div className={`grid grid-cols-${cells} divide-x divide-[#e8eaef]`}>
        {Array.from({ length: cells }).map((_, i) => (
          <div key={i} className="px-5 py-3.5 animate-pulse space-y-2">
            <div className="h-2 bg-[#f1f5f9] rounded-full w-16" />
            <div className="h-5 bg-[#f1f5f9] rounded-full w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DataTable — canonical table wrapper
// ─────────────────────────────────────────────────────────────────────────────

export function DataTable({
  children,
  minWidth,
}: {
  children: ReactNode
  minWidth?: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  )
}

export function DataTh({
  children,
  align = 'left',
  first = false,
  className,
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  first?: boolean
  className?: string
}) {
  return (
    <th className={cn(
      'px-4 py-2.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] bg-[#f8fafc]/60 border-b border-[#e8eaef]',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      first && 'pl-5',
      className,
    )}>
      {children}
    </th>
  )
}

export function DataTd({
  children,
  align = 'left',
  className,
  first = false,
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
  first?: boolean
}) {
  return (
    <td className={cn(
      'px-4 py-3 border-b border-[#f1f5f9]',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      first && 'pl-5',
      className,
    )}>
      {children}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AlertRow — canonical workflow queue row (Decision Queue pattern)
// ─────────────────────────────────────────────────────────────────────────────

export function AlertRow({
  severity,
  title,
  detail,
  actionLabel,
  actionHref,
}: {
  severity: 'critical' | 'warning' | 'info'
  title: string
  detail?: string
  actionLabel: string
  actionHref: string
}) {
  const accentColor =
    severity === 'critical' ? 'border-neg hover:bg-neg-light/30' :
    severity === 'warning'  ? 'border-warn hover:bg-warn-light/30' :
    'border-[#e8eaef] hover:bg-[#f8fafc]/60'

  const btnClass =
    severity === 'critical'
      ? 'bg-neg text-white hover:bg-neg'
      : 'border border-[#e8eaef] text-[#64748b] hover:bg-[#f8fafc]'

  return (
    <Link
      href={actionHref}
      className={cn(
        'flex items-center gap-4 px-5 py-3.5 border-l-[3px] transition-colors group',
        accentColor,
      )}
    >
      <div className="flex-1 min-w-0">
        <div className={cn('text-sm leading-tight', severity === 'critical' ? 'font-semibold text-[#0f172a]' : 'font-medium text-[#1e293b]')}>
          {title}
        </div>
        {detail && (
          <div className="text-[11px] text-[#64748b] mt-0.5 truncate">{detail}</div>
        )}
      </div>
      <span className={cn(
        'flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded transition-colors whitespace-nowrap',
        btnClass,
      )}>
        {actionLabel} →
      </span>
    </Link>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NarrativeFooter — causal chain footer at bottom of panels / tab content
//
// Canonical cross-hub navigation + financial causality text.
// Appears at the bottom of every hub tab content block.
// ─────────────────────────────────────────────────────────────────────────────

export function NarrativeFooter({
  narrative,
  links,
  className,
}: {
  narrative: string
  links: Array<{ label: string; href: string }>
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between px-1', className)}>
      <p className="text-[10px] text-[#94a3b8] leading-relaxed">{narrative}</p>
      {links.length > 0 && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {links.map((link, i) => (
            <React.Fragment key={link.href}>
              {i > 0 && <span className="text-[#e2e8f0]">|</span>}
              <Link
                href={link.href}
                className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap"
              >
                {link.label} →
              </Link>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ContextReading — individual reading cell inside a ContextBar
//
// Bloomberg-style micro-instrument: label / value / sub.
// Used by Finance, Commercial, Operations, Partners, Planning context bars.
// ─────────────────────────────────────────────────────────────────────────────

export function ContextReading({
  label,
  value,
  sub,
  status = 'neutral',
  border = true,
}: {
  label: string
  value: string
  sub?: string
  status?: 'ok' | 'warn' | 'critical' | 'neutral'
  border?: boolean
}) {
  const valueCls =
    status === 'critical' ? 'text-neg' :
    status === 'warn'     ? 'text-warn-text' :
    'text-[#0f172a]'
  const dotCls =
    status === 'critical' ? 'bg-neg' :
    status === 'warn'     ? 'bg-warn' :
    status === 'ok'       ? 'bg-pos' :
    'bg-[#cbd5e1]'
  return (
    <div className={cn(
      'flex flex-col gap-1 flex-shrink-0 px-4 py-2.5 min-w-[118px]',
      border && 'border-l border-[#edeef2]',
    )}>
      <div className="flex items-center gap-1.5">
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotCls)} />
        <span className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] leading-none">
          {label}
        </span>
      </div>
      <span className={cn('text-[15px] font-extrabold tabular-nums leading-tight', valueCls)}>
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-[#94a3b8] leading-none">{sub}</span>
      )}
    </div>
  )
}

// ── ContextRail — clean premium status strip ──────────────────────────────────
// A row of ContextReading cells in one elevated panel (color-coded status dots).
// Replaced the cramped Bloomberg strip. Use ContextRailSkeleton during async load.

export function ContextRail({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch gap-0 bg-white border border-[#edeef2] rounded-xl shadow-soft overflow-x-auto scrollbar-none">
      {children}
    </div>
  )
}

export function ContextRailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('h-[64px] bg-white border border-[#edeef2] rounded-xl shadow-soft fl-shimmer', className)} />
  )
}
