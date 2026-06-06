'use client'
// Client chart island for the (server-rendered) ExpensesContent: 6-month expense
// trend (bar) + expense-by-category donut. Receives serializable props.

import React from 'react'
import { ChartCard, BarCompare, DonutBreakdown, CHART } from '@/components/charts'

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

export function ExpensesCharts({
  monthly, byCategory, totalExpense,
}: {
  monthly:      Array<{ label: string; amount: number }>
  byCategory:   Array<{ name: string; value: number }>
  totalExpense: number
}) {
  const hasData = monthly.some(m => m.amount > 0) || byCategory.length > 0
  if (!hasData) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Aylık Gider" subtitle="Son 6 ay" className="h-52">
        <BarCompare
          data={monthly}
          series={[{ key: 'amount', label: 'Gider', color: CHART.neg }]}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>

      <ChartCard title="Gider Dağılımı" subtitle="Kategoriye göre · 6 ay" className="h-52">
        {byCategory.length
          ? <DonutBreakdown
              data={byCategory}
              centerLabel="Gider"
              centerValue={compactTRY(totalExpense)}
              valueFormatter={(v) => compactTRY(Number(v))}
            />
          : <div className="h-full flex items-center justify-center text-[12px] text-[#94a3b8]">Gider verisi yok.</div>}
      </ChartCard>
    </div>
  )
}
