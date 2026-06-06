'use client'
// Client island for the (server-rendered) health report: overall-score gauge +
// per-section score bars. Receives plain serializable props.

import React from 'react'
import { ChartCard, RadialGauge, BarCompare, CHART } from '@/components/charts'

const GRADE_COLOR: Record<string, string> = {
  A: CHART.pos, B: CHART.info, C: '#ca8a04', D: CHART.warn, F: CHART.neg,
}

function scoreColor(score: number): string {
  if (score >= 90) return CHART.pos
  if (score >= 75) return CHART.info
  if (score >= 60) return '#ca8a04'
  if (score >= 45) return CHART.warn
  return CHART.neg
}

export function HealthCharts({
  overallScore, overallGrade, sections,
}: {
  overallScore: number
  overallGrade: string
  sections: Array<{ title: string; score: number | null }>
}) {
  const bars = sections
    .filter(s => s.score != null)
    .map(s => ({ label: s.title, value: s.score as number, color: scoreColor(s.score as number) }))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 print:hidden">
      <ChartCard title="Genel Puan" subtitle={`Not: ${overallGrade}`} className="h-52">
        <RadialGauge value={overallScore} color={GRADE_COLOR[overallGrade] ?? CHART.primary} label="/ 100" />
      </ChartCard>
      <ChartCard title="Bölüm Puanları" subtitle="0–100" className="h-52 sm:col-span-2">
        <BarCompare
          layout="horizontal"
          colorByPoint
          data={bars}
          series={[{ key: 'value', label: 'Puan' }]}
          valueFormatter={(v) => String(Math.round(Number(v)))}
        />
      </ChartCard>
    </div>
  )
}
