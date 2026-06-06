'use client'
// DonutBreakdown — proportional donut with a centered total + legend column.

import React from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { CHART_SERIES, ANIM } from './palette'
import { ChartTooltip } from './ChartTooltip'

export interface DonutDatum {
  name:   string
  value:  number
  color?: string
}

export function DonutBreakdown({
  data, centerLabel, centerValue, valueFormatter, showLegend = true,
}: {
  data:        DonutDatum[]
  centerLabel?: string
  centerValue?: string
  valueFormatter?: (v: number | string, name?: string) => string
  showLegend?: boolean
}) {
  const colored = data.map((d, i) => ({ ...d, color: d.color ?? CHART_SERIES[i % CHART_SERIES.length] }))

  return (
    <div className="flex items-center gap-3 h-full w-full px-2">
      <div className="relative h-full flex-1 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={colored}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="92%"
              paddingAngle={1.5}
              stroke="none"
              animationDuration={ANIM.duration}
              animationEasing={ANIM.easing}
            >
              {colored.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={valueFormatter} />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerValue || centerLabel) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {centerValue && <span className="text-base font-black tabular-nums text-[#0f172a] leading-none">{centerValue}</span>}
            {centerLabel && <span className="text-[10px] text-[#94a3b8] mt-1 uppercase tracking-wide">{centerLabel}</span>}
          </div>
        )}
      </div>
      {showLegend && (
        <ul className="flex flex-col gap-1.5 shrink-0 max-w-[46%] overflow-hidden">
          {colored.map((d, i) => (
            <li key={i} className="flex items-center gap-2 text-[11px]">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              <span className="text-[#64748b] truncate">{d.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
