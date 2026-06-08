'use client'
// CEO (Yönetici) lens — situation, headline KPIs, 12-month trend, alerts, partners.

import React from 'react'
import { ChartCard, AreaTrend, CHART } from '@/components/charts'
import { ShellGrid } from '@/components/dashboard/DashboardShell'
import {
  HomePayload, KpiTile, AlertList, RankedList, fmtTRY, fmtCompact, EmptyHint,
} from './shared'

export function CeoDashboard({ data }: { data: HomePayload }) {
  const k = data.summary.kpis
  const monthly = data.charts.monthly

  const partners = data.summary.partner_strip.map(p => ({
    key:   p.partner_id,
    name:  p.name,
    value: `%${p.share_pct.toFixed(0)}`,
    meta:  p.loan_outstanding_try > 0 ? `Kredi: ${fmtCompact(p.loan_outstanding_try)}` : 'Kredi yok',
    href:  '/dashboard/partners',
  }))

  return (
    <>
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <KpiTile label="Gelir (Bu Ay)" value={fmtTRY(k.revenue_mtd_try)} accent={CHART.primary} href="/dashboard/sales" />
        <KpiTile label="Net Kâr (Bu Ay)" value={fmtTRY(k.net_income_mtd_try)}
          tone={k.net_income_mtd_try < 0 ? 'negative' : 'positive'}
          sub={k.net_income_mtd_try < 0 ? 'Zarar' : undefined}
          accent={k.net_income_mtd_try < 0 ? CHART.neg : CHART.pos} href="/dashboard/finance" />
        <KpiTile label="Nakit" value={fmtTRY(k.cash_balance_try)} accent={CHART.info} href="/dashboard/finance" />
        <KpiTile label="Nakit Ömrü" value={k.cash_balance_try <= 0 ? '—' : k.runway_months == null ? '∞' : `${k.runway_months.toFixed(1)} ay`}
          tone={k.runway_months != null && k.runway_months < 3 ? 'negative' : 'neutral'}
          sub={k.cash_balance_try <= 0 ? 'Nakit yok' : undefined}
          accent={CHART.warn} href="/dashboard/finance?tab=cfo" />
        <KpiTile label="Alacaklar" value={fmtTRY(k.accounts_receivable_try)}
          sub={k.overdue_receivable_try > 0 ? `Vadesi geçen: ${fmtCompact(k.overdue_receivable_try)}` : 'Vadesi geçen yok'}
          tone={k.overdue_receivable_try > 0 ? 'negative' : 'neutral'}
          accent={CHART.ink3} href="/dashboard/collections" />
      </div>

      {/* Body */}
      <ShellGrid className="grid-cols-1 lg:grid-cols-3 lg:grid-rows-2 min-h-[420px] lg:min-h-0">
        <ChartCard
          title="Gelir / Gider Trendi"
          subtitle="Son 12 ay"
          className="lg:col-span-2 lg:row-span-2 min-h-[220px]"
        >
          <AreaTrend
            data={monthly}
            series={[
              { key: 'revenue', label: 'Gelir', color: CHART.primary },
              { key: 'expense', label: 'Gider', color: CHART.neg },
            ]}
            valueFormatter={(v) => fmtCompact(Number(v))}
          />
        </ChartCard>

        <ChartCard title="Kritik Uyarılar" subtitle={`${data.summary.kpis.active_alerts} aktif`} className="min-h-[160px]" bodyClassName="px-3 py-2">
          <AlertList alerts={data.summary.top_alerts} />
        </ChartCard>

        <ChartCard title="Ortaklar" subtitle={`${partners.length} ortak`} className="min-h-[160px]" bodyClassName="px-3 py-1">
          {partners.length ? <RankedList rows={partners} /> : <EmptyHint icon="👥" text="Henüz ortak eklenmemiş." />}
        </ChartCard>
      </ShellGrid>
    </>
  )
}
