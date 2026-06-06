'use client'
// BarCompare — grouped/single bar chart (e.g. revenue vs expense by month).

import React from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { CHART, CHART_SERIES, AXIS_TICK, ANIM } from './palette'
import { ChartTooltip } from './ChartTooltip'

export interface BarSeries {
  key:    string
  label:  string
  color?: string
}

export function BarCompare({
  data, series, xKey = 'label', valueFormatter, compact = false, layout = 'vertical',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  colorByPoint,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data:    any[]
  series:  BarSeries[]
  xKey?:   string
  valueFormatter?: (v: number | string, name?: string) => string
  compact?: boolean
  /** 'vertical' = bars rise from x-axis; 'horizontal' = bars extend from y-axis */
  layout?: 'vertical' | 'horizontal'
  /** color each bar of a single series by its own point.color */
  colorByPoint?: boolean
}) {
  const legend = series.length > 1
  const horizontal = layout === 'horizontal'

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout={horizontal ? 'vertical' : 'horizontal'}
        margin={{ top: 8, right: 8, left: compact ? -18 : 0, bottom: 0 }}
        barCategoryGap={horizontal ? '24%' : '28%'}
      >
        <CartesianGrid stroke={CHART.grid} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => abbr(Number(v))} />
            <YAxis type="category" dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} width={92} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={12} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={compact ? 36 : 52} tickFormatter={(v) => abbr(Number(v))} />
          </>
        )}
        <Tooltip content={<ChartTooltip formatter={valueFormatter} />} cursor={{ fill: 'rgba(124,58,237,0.06)' }} />
        {legend && <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: CHART.ink3 }} />}
        {series.map((s, i) => {
          const c = s.color ?? CHART_SERIES[i % CHART_SERIES.length]
          return (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={c}
              radius={horizontal ? [0, 5, 5, 0] : [5, 5, 0, 0]}
              maxBarSize={horizontal ? 22 : 48}
              animationDuration={ANIM.duration}
              animationEasing={ANIM.easing}
            >
              {colorByPoint &&
                data.map((d, di) => <Cell key={di} fill={d.color ?? c} />)}
            </Bar>
          )
        })}
      </BarChart>
    </ResponsiveContainer>
  )
}

function abbr(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (a >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
