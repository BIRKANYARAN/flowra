'use client'
// AreaTrend — smooth gradient area chart for one or more series over time.
// Fills its parent (ResponsiveContainer), so drop it in any flex/grid cell.

import React from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { CHART, CHART_SERIES, AXIS_TICK, ANIM } from './palette'
import { ChartTooltip } from './ChartTooltip'

export interface AreaSeries {
  key:    string
  label:  string
  color?: string
}

export function AreaTrend({
  data, series, xKey = 'label', valueFormatter, compact = false, showLegend,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data:    any[]
  series:  AreaSeries[]
  xKey?:   string
  valueFormatter?: (v: number | string, name?: string) => string
  compact?: boolean
  showLegend?: boolean
}) {
  const legend = showLegend ?? series.length > 1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: compact ? -18 : 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const c = s.color ?? CHART_SERIES[i % CHART_SERIES.length]
            return (
              <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor={c} stopOpacity={0.28} />
                <stop offset="100%" stopColor={c} stopOpacity={0.02} />
              </linearGradient>
            )
          })}
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
        <YAxis
          tick={AXIS_TICK} axisLine={false} tickLine={false} width={compact ? 36 : 52}
          tickFormatter={(v) => abbr(Number(v))}
        />
        <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ stroke: CHART.ink4, strokeDasharray: 3 }} />
        {legend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: CHART.ink3 }} />}
        {series.map((s, i) => {
          const c = s.color ?? CHART_SERIES[i % CHART_SERIES.length]
          return (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={c}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={ANIM.duration}
              animationEasing={ANIM.easing}
            />
          )
        })}
      </AreaChart>
    </ResponsiveContainer>
  )
}

// Compact number abbreviation for axis ticks (1.2M, 340K).
function abbr(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
