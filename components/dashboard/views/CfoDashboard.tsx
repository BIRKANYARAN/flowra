'use client'
// CFO (Finans) lens — cash & runway, net-income trend, expense breakdown, AR.

import React from 'react'
import { ChartCard, AreaTrend, DonutBreakdown, CHART } from '@/components/charts'
import { ShellGrid } from '@/components/dashboard/DashboardShell'
import {
  HomePayload, KpiTile, fmtTRY, fmtCompact, EmptyHint,
} from './shared'

export function CfoDashboard({ data }: { data: HomePayload }) {
  const k = data.summary.kpis
  const monthly = data.charts.monthly
  const breakdown = data.charts.expenseBreakdown
  const totalExpense = breakdown.reduce((s, b) => s + b.value, 0)

  // Net-income margin context
  const ytdRevenue = monthly.reduce((s, m) => s + m.revenue, 0)
  const ytdNet     = monthly.reduce((s, m) => s + m.net, 0)
  const netMarginPct = ytdRevenue > 0 ? (ytdNet / ytdRevenue) * 100 : 0

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <KpiTile label="Nakit" value={fmtTRY(k.cash_balance_try)} accent={CHART.info} href="/dashboard/finance" />
        <KpiTile label="Nakit Ömrü" value={k.runway_months == null ? '∞' : `${k.runway_months.toFixed(1)} ay`}
          tone={k.runway_months != null && k.runway_months < 3 ? 'negative' : 'neutral'}
          sub={k.runway_months != null && k.runway_months < 3 ? 'Kısa — dikkat' : undefined}
          accent={CHART.warn} href="/dashboard/finance?tab=cfo" />
        <KpiTile label="Net Kâr (Bu Ay)" value={fmtTRY(k.net_income_mtd_try)}
          tone={k.net_income_mtd_try < 0 ? 'negative' : 'positive'}
          accent={k.net_income_mtd_try < 0 ? CHART.neg : CHART.pos} href="/dashboard/finance" />
        <KpiTile label="Net Marj (12 ay)" value={`%${netMarginPct.toFixed(1)}`}
          tone={netMarginPct < 0 ? 'negative' : 'positive'} accent={CHART.primary} />
        <KpiTile label="Alacaklar" value={fmtTRY(k.accounts_receivable_try)}
          sub={k.overdue_receivable_try > 0 ? `Vadesi geçen: ${fmtCompact(k.overdue_receivable_try)}` : 'Vadesi geçen yok'}
          tone={k.overdue_receivable_try > 0 ? 'negative' : 'neutral'}
          accent={CHART.ink3} href="/dashboard/collections" />
      </div>

      {/* Body */}
      <ShellGrid className="grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 min-h-[420px] lg:min-h-0">
        <ChartCard title="Gelir · Gider · Net Kâr" subtitle="Son 12 ay" className="lg:col-span-2 lg:row-span-2 min-h-[220px]">
          <AreaTrend
            data={monthly}
            series={[
              { key: 'revenue', label: 'Gelir', color: CHART.primary },
              { key: 'expense', label: 'Gider', color: CHART.neg },
              { key: 'net',     label: 'Net',   color: CHART.pos },
            ]}
            valueFormatter={(v) => fmtCompact(Number(v))}
          />
        </ChartCard>

        <ChartCard title="Gider Dağılımı" subtitle="Kategoriye göre" className="min-h-[160px]">
          {breakdown.length
            ? <DonutBreakdown data={breakdown} centerLabel="Toplam" centerValue={fmtCompact(totalExpense)} valueFormatter={(v) => fmtCompact(Number(v))} />
            : <EmptyHint icon="📊" text="Gider verisi yok." />}
        </ChartCard>

        <ChartCard title="Tahsilat Durumu" className="min-h-[160px]" bodyClassName="px-4 py-2">
          <div className="h-full flex flex-col justify-center gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#64748b]">Toplam Alacak</span>
              <span className="text-[15px] font-black tabular-nums text-[#0f172a]">{fmtTRY(k.accounts_receivable_try)}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] text-[#64748b]">Vadesi Geçen</span>
                <span className={`text-[13px] font-bold tabular-nums ${k.overdue_receivable_try > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{fmtTRY(k.overdue_receivable_try)}</span>
              </div>
              <div className="h-2 rounded-full bg-[#f1f5f9] overflow-hidden">
                <div className="h-full rounded-full bg-red-500 transition-all"
                  style={{ width: `${k.accounts_receivable_try > 0 ? Math.min(100, (k.overdue_receivable_try / k.accounts_receivable_try) * 100) : 0}%` }} />
              </div>
            </div>
          </div>
        </ChartCard>
      </ShellGrid>
    </>
  )
}
