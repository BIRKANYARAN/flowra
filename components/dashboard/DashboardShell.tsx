'use client'
// ─────────────────────────────────────────────────────────────────────────────
// components/dashboard/DashboardShell.tsx
//
// No-scroll dashboard frame. On desktop (lg+) it fits exactly within the content
// area (100dvh − 44px header − 24px main padding = 68px) and hides overflow, so a
// role dashboard reads as one screen — KPI strip + chart grid, no endless scroll.
// Below lg (tablet/phone) it falls back to natural flow (the layout's <main>
// scrolls), where the multi-column grid collapses to one column and needs scroll.
//
// Compose inside it with <ShellGrid> for the flexible chart region.
// ─────────────────────────────────────────────────────────────────────────────

import React, { ReactNode } from 'react'

export function DashboardShell({
  title, subtitle, badge, actions, children,
}: {
  title:     string
  subtitle?: string
  badge?:    ReactNode
  actions?:  ReactNode
  children:  ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100dvh-68px)] lg:overflow-hidden">
      {/* Title band */}
      <header className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-lg font-black text-[#0f172a] truncate">{title}</h1>
          {badge}
          {subtitle && <span className="text-xs text-[#94a3b8] truncate hidden sm:inline">· {subtitle}</span>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

// ShellGrid — the flexible region that fills remaining height. Pass a tailwind
// grid template via `cols`/`rows`; children with min-h-0 will flex to fill.
export function ShellGrid({
  children, className = '',
}: {
  children:  ReactNode
  className?: string
}) {
  return (
    <div className={`grid gap-3 flex-1 min-h-0 ${className}`}>
      {children}
    </div>
  )
}
