'use client'
// Client chart island for the (server-rendered) StockContent: inventory value by
// product (donut) + stock-aging buckets (bar). Receives serializable props.

import React from 'react'
import { ChartCard, DonutBreakdown, BarCompare, CHART } from '@/components/charts'

function compactTRY(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return '₺' + (n / 1e9).toFixed(1).replace('.', ',') + 'Mr'
  if (a >= 1e6) return '₺' + (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return '₺' + (n / 1e3).toFixed(0) + 'B'
  return '₺' + Math.round(n).toLocaleString('tr-TR')
}

export function StockCharts({
  byProduct, aging, totalValue,
}: {
  byProduct:  Array<{ name: string; value: number }>
  aging:      { current: number; d30: number; d60: number; d90plus: number }
  totalValue: number
}) {
  const hasValue = byProduct.some(p => p.value > 0)
  if (!hasValue) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <ChartCard title="Stok Değeri Dağılımı" subtitle="Ürüne göre (FIFO)" className="h-52">
        <DonutBreakdown
          data={byProduct}
          centerLabel="Stok"
          centerValue={compactTRY(totalValue)}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>

      <ChartCard title="Stok Yaşlandırma" subtitle="Bekleme süresine göre" className="h-52">
        <BarCompare
          colorByPoint
          data={[
            { label: 'Güncel',   value: aging.current, color: CHART.pos },
            { label: '30-60g',   value: aging.d30,     color: CHART.info },
            { label: '60-90g',   value: aging.d60,     color: CHART.warn },
            { label: '90+g',     value: aging.d90plus, color: CHART.neg },
          ]}
          series={[{ key: 'value', label: 'Değer' }]}
          valueFormatter={(v) => compactTRY(Number(v))}
        />
      </ChartCard>
    </div>
  )
}
