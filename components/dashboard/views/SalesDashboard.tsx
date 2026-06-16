'use client'
// Sales (Satış) lens — monthly revenue, top customers, open proforma pipeline.

import React from 'react'
import { ChartCard, BarCompare, CHART } from '@/components/charts'
import { ShellGrid } from '@/components/dashboard/DashboardShell'
import {
  HomePayload, KpiTile, RankedList, fmtTRY, fmtCompact,
} from './shared'

const PRO_STATUS_TR: Record<string, string> = { sent: 'Gönderildi', draft: 'Taslak' }

export function SalesDashboard({ data }: { data: HomePayload }) {
  const k = data.summary.kpis
  const monthly = data.charts.monthly
  const pipeline = data.charts.pipeline

  const customers = data.charts.topCustomers.map((c, i) => ({
    key: `${c.name}-${i}`, name: c.name, value: fmtTRY(c.value), meta: undefined, href: '/dashboard/customers',
  }))
  const pipelineRows = pipeline.items.map(p => ({
    key: p.id, name: p.customer_name, value: fmtTRY(p.total),
    meta: `${PRO_STATUS_TR[p.status] ?? p.status}${p.valid_until ? ` · son ${p.valid_until}` : ''}`,
    href: '/dashboard/commercial?tab=teklifler',
  }))

  // Last 3 months revenue for the "last quarter" KPI
  const last3 = monthly.slice(-3).reduce((s, m) => s + m.revenue, 0)

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        <KpiTile label="Gelir (Bu Ay)" value={fmtTRY(k.revenue_mtd_try)} accent={CHART.primary} href="/dashboard/commercial?tab=sales" />
        <KpiTile label="Gelir (Son 3 Ay)" value={fmtTRY(last3)} accent={CHART.info} href="/dashboard/commercial?tab=sales" />
        <KpiTile label="Açık Teklif" value={`${pipeline.open_count} adet`}
          sub={`Toplam ${fmtCompact(pipeline.open_total)}`} accent={CHART.warn} href="/dashboard/commercial?tab=teklifler" />
        <KpiTile label="Vadesi Geçen Alacak" value={fmtTRY(k.overdue_receivable_try)}
          tone={k.overdue_receivable_try > 0 ? 'negative' : 'neutral'}
          accent={CHART.neg} href="/dashboard/commercial?tab=collections" />
      </div>

      {/* Body */}
      <ShellGrid className="grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 min-h-[420px] lg:min-h-0">
        <ChartCard title="Aylık Gelir" subtitle="Son 12 ay" className="lg:col-span-2 lg:row-span-2 min-h-[220px]">
          <BarCompare
            data={monthly}
            series={[{ key: 'revenue', label: 'Gelir', color: CHART.primary }]}
            valueFormatter={(v) => fmtCompact(Number(v))}
          />
        </ChartCard>

        <ChartCard title="En İyi Müşteriler" subtitle="Gelire göre · 12 ay" className="min-h-[160px]" bodyClassName="px-3 py-1">
          <RankedList rows={customers} />
        </ChartCard>

        <ChartCard title="Açık Teklifler" subtitle={`${pipeline.open_count} teklif · ${fmtCompact(pipeline.open_total)}`} className="min-h-[160px]" bodyClassName="px-3 py-1">
          <RankedList rows={pipelineRows} />
        </ChartCard>
      </ShellGrid>
    </>
  )
}
