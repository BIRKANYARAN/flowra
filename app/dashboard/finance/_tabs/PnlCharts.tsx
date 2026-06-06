'use client'
// Client chart island for the (server-rendered) PnlTab: profit cascade, 6-month
// revenue/net trend, and expense-by-category donut. Receives serializable props.

import React from 'react'
import { ChartCard, BarCompare, AreaTrend, DonutBreakdown, CHART } from '@/components/charts'

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

export function PnlCharts({
  cascade, monthly, expenses,
}: {
  cascade:  { revenue: number; gross: number; ebit: number; net: number }
  monthly:  Array<{ label: string; revenue: number; net: number }>
  expenses: Array<{ name: string; value: number }>
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <ChartCard title="Kâr Şelalesi" subtitle="Ciro → Net" className="h-52">
        <BarCompare
          colorByPoint
          data={[
            { label: 'Ciro',     value: cascade.revenue, color: CHART.primary },
            { label: 'Brüt Kâr', value: cascade.gross,   color: '#0891b2' },
            { label: 'EBIT',     value: cascade.ebit,    color: cascade.ebit >= 0 ? CHART.info : CHART.neg },
            { label: 'Net',      value: cascade.net,     color: cascade.net >= 0 ? CHART.pos : CHART.neg },
          ]}
          series={[{ key: 'value', label: 'Tutar' }]}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>

      <ChartCard title="6 Aylık Trend" subtitle="Ciro & Net Kâr" className="h-52">
        <AreaTrend
          data={monthly}
          series={[
            { key: 'revenue', label: 'Ciro', color: CHART.primary },
            { key: 'net',     label: 'Net',  color: CHART.pos },
          ]}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>

      <ChartCard title="Gider Dağılımı" subtitle="Kategoriye göre · bu ay" className="h-52">
        {expenses.length
          ? <DonutBreakdown
              data={expenses}
              centerLabel="Gider"
              centerValue={compactTRY(expenses.reduce((s, e) => s + e.value, 0))}
              valueFormatter={(v) => compactTRY(Number(v))}
            />
          : <div className="h-full flex items-center justify-center text-[12px] text-[#94a3b8]">Gider verisi yok.</div>}
      </ChartCard>
    </div>
  )
}
