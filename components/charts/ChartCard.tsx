'use client'
// ChartCard — titled frame for a chart, matching FlowraCard surface. The chart
// area flexes to fill remaining height so it works inside a no-scroll grid cell.

import React, { ReactNode } from 'react'

export function ChartCard({
  title, subtitle, action, children, className = '', bodyClassName = '',
}: {
  title?:    string
  subtitle?: string
  action?:   ReactNode
  children:  ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={`flex flex-col min-h-0 bg-white border border-[#e2e8f0] rounded-xl shadow-sm overflow-hidden ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2 shrink-0">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-bold text-[#0f172a] truncate">{title}</h3>}
            {subtitle && <p className="text-[11px] text-[#94a3b8] mt-0.5 truncate">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={`flex-1 min-h-0 px-2 pb-2 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
