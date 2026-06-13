'use client'
// RadialGauge — a 0-100 score arc with the value centered. For health/score KPIs.

import React from 'react'
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts'
import { ANIM } from './palette'

export function RadialGauge({
  value, max = 100, color = '#7c3aed', label, centerText,
}: {
  value:   number
  max?:    number
  color?:  string
  label?:  string
  /** override the centered text (defaults to the rounded value) */
  centerText?: string
}) {
  const v = Math.max(0, Math.min(max, value))
  const data = [{ name: 'score', value: v, fill: color }]

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={220} endAngle={-40}
          innerRadius="66%" outerRadius="100%"
          barSize={14}
        >
          <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value" angleAxisId={0} cornerRadius={8} background={{ fill: '#f1f5f9' }}
            animationDuration={ANIM.duration} animationEasing={ANIM.easing}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
          {centerText ?? Math.round(v)}
        </span>
        {label && <span className="text-[10px] text-[#94a3b8] uppercase tracking-wide mt-1">{label}</span>}
      </div>
    </div>
  )
}
