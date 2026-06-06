'use client'
// Sparkline — tiny inline trend for KPI tiles. No axes, no grid.

import React from 'react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import { CHART } from './palette'

export function Sparkline({
  data, color = CHART.primary, height = 36,
}: {
  /** array of numbers, oldest → newest */
  data:   number[]
  color?: string
  height?: number
}) {
  if (!data || data.length < 2) return null
  const points = data.map((v, i) => ({ i, v }))
  const id = `spark-${color.replace('#', '')}`

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"  stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="v" stroke={color} strokeWidth={1.75}
            fill={`url(#${id})`} dot={false} isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
