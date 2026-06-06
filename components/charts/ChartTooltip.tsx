'use client'
// Themed tooltip shared by every chart. Matches the card surface + ink ramp.

import React from 'react'

export interface TooltipDatum {
  name?:  string
  value?: number | string
  color?: string
}

export function ChartTooltip({
  active, payload, label, formatter,
}: {
  active?:  boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[]
  label?:   string | number
  formatter?: (value: number | string, name?: string) => string
}) {
  if (!active || !payload || payload.length === 0) return null

  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-white/95 backdrop-blur px-3 py-2 shadow-lg">
      {label !== undefined && label !== '' && (
        <div className="text-[11px] font-semibold text-[#334155] mb-1">{label}</div>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color ?? p.fill }} />
            {p.name && <span className="text-[#64748b]">{p.name}</span>}
            <span className="ml-auto font-semibold tabular-nums text-[#0f172a]">
              {formatter ? formatter(p.value, p.name) : p.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
