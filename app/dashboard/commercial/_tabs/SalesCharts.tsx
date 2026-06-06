'use client'
// Client chart island for the (server-rendered) SalesContent: 6-month sales trend
// + top customers (90d). Receives serializable props.

import React from 'react'
import { ChartCard, BarCompare, AreaTrend, CHART } from '@/components/charts'

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

export function SalesCharts({
  monthly, topCustomers,
}: {
  monthly:      Array<{ label: string; revenue: number }>
  topCustomers: Array<{ name: string; value: number }>
}) {
  const hasMonthly = monthly.some(m => m.revenue > 0)
  if (!hasMonthly && topCustomers.length === 0) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Aylık Ciro" subtitle="Son 6 ay" className="h-52">
        <BarCompare
          data={monthly}
          series={[{ key: 'revenue', label: 'Ciro', color: CHART.primary }]}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>

      <ChartCard title="En İyi Müşteriler" subtitle="Ciroya göre · 90 gün" className="h-52">
        {topCustomers.length
          ? <BarCompare
              layout="horizontal"
              data={topCustomers.map(c => ({ label: c.name, value: c.value }))}
              series={[{ key: 'value', label: 'Ciro', color: CHART.info }]}
              valueFormatter={(v) => compactTRY(Number(v))}
            />
          : <div className="h-full flex items-center justify-center text-[12px] text-[#94a3b8]">Müşteri verisi yok.</div>}
      </ChartCard>
    </div>
  )
}
