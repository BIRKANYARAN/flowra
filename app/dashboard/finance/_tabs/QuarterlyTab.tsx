'use client'

// ─────────────────────────────────────────────────────────────────────────────
// QuarterlyTab — Çeyreklik Finansal Özet
//
// Features:
//   1. Rolling 4Q KPI strip (revenue, EBITDA, trend badge)
//   2. Quarterly timeline table with QoQ growth indicators
//   3. Current quarter KPIs (margins, tax rate)
//   4. Best/worst quarter callout
//   5. Turkish narrative footer
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery }  from '@tanstack/react-query'
import {
  KpiStrip,
  KpiCell,
  Panel,
  PanelHeader,
  NarrativeFooter,
  SkeletonPanel,
  EmptySlate,
  DataTable,
  DataTh,
  DataTd,
} from '@/components/ds'
import { fmtTRY } from '@/lib/format'
import type {
  QuarterlySummaryReport,
  QuarterlyData,
} from '@/lib/services/finance/quarterly-summary.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(val: number | null, decimals = 1): string {
  if (val === null) return '—'
  return `%${val.toFixed(decimals)}`
}

function growthBadge(val: number | null): { text: string; cls: string } {
  if (val === null) return { text: '—', cls: 'text-[#94a3b8]' }
  const sign = val >= 0 ? '+' : ''
  return {
    text: `${sign}${val.toFixed(1)}%`,
    cls:  val >= 0 ? 'text-pos-text font-semibold' : 'text-neg font-semibold',
  }
}

function trendBadge(trend: QuarterlySummaryReport['trend']): { label: string; cls: string } {
  const map: Record<QuarterlySummaryReport['trend'], { label: string; cls: string }> = {
    improving:        { label: 'Yükseliş', cls: 'bg-pos-light text-pos-text border-pos-light' },
    stable:           { label: 'Stabil',   cls: 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]' },
    declining:        { label: 'Düşüş',    cls: 'bg-neg-light text-neg-text border-neg-light' },
    insufficient_data:{ label: 'Yetersiz Veri', cls: 'bg-[#f8fafc] text-[#94a3b8] border-[#e2e8f0]' },
  }
  return map[trend]
}

function performanceBadge(
  p: QuarterlySummaryReport['current_performance'],
): { label: string; cls: string } {
  const map: Record<typeof p, { label: string; cls: string }> = {
    exceptional: { label: 'Olağanüstü', cls: 'bg-pos-light text-pos-text border-pos-light' },
    strong:      { label: 'Güçlü',      cls: 'bg-teal-100 text-teal-800 border-teal-200' },
    solid:       { label: 'Sağlam',     cls: 'bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]' },
    weak:        { label: 'Zayıf',      cls: 'bg-warn-light text-warn-text border-warn-light' },
    declining:   { label: 'Gerileme',   cls: 'bg-neg-light text-neg-text border-neg-light' },
  }
  return map[p]
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { companyId?: string }

export function QuarterlyTab({ companyId }: Props) {
  const { data, isLoading, isError } = useQuery<{ report: QuarterlySummaryReport }>({
    queryKey: ['quarterly-summary', companyId],
    queryFn:  async () => {
      const res = await fetch('/api/finance/quarterly-summary')
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    staleTime: 60 * 60 * 1_000,   // matches revalidate = 3600
  })

  if (isLoading) return <SkeletonPanel rows={8} />
  if (isError || !data?.report) {
    return (
      <EmptySlate
        title="Çeyreklik veri yüklenemedi"
        sub="Sayfa yenilenerek tekrar denenebilir."
      />
    )
  }

  const { report } = data
  const {
    current_quarter,
    current_kpis,
    current_performance,
    quarters,
    qoq_growth,
    rolling_4q_revenue,
    rolling_4q_ebitda,
    trend,
    best_quarter,
    worst_quarter,
    narrative,
  } = report

  const tb   = trendBadge(trend)
  const pb   = performanceBadge(current_performance)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-black text-[#0f172a] tracking-tight">
            Çeyreklik Özet
          </h2>
          <p className="text-xs text-[#94a3b8] mt-0.5">
            Son 8 çeyrek · QoQ büyüme · Trend analizi
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold border px-2.5 py-1 rounded ${pb.cls}`}>
            {current_quarter.label}: {pb.label}
          </span>
          <span className={`text-xs font-bold border px-2.5 py-1 rounded ${tb.cls}`}>
            {tb.label}
          </span>
        </div>
      </div>

      {/* Zone 1 — Rolling 4Q KPI strip */}
      <KpiStrip>
        <KpiCell
          label="Son 4Ç Ciro"
          value={fmtTRY(rolling_4q_revenue)}
          tone="neutral"
        />
        <KpiCell
          label="Son 4Ç EBITDA"
          value={fmtTRY(rolling_4q_ebitda)}
          tone={rolling_4q_ebitda >= 0 ? 'ok' : 'critical'}
        />
        <KpiCell
          label="Brüt Marj"
          value={fmtPct(current_kpis.gross_margin_pct)}
          tone={
            (current_kpis.gross_margin_pct ?? 0) >= 30 ? 'ok' :
            (current_kpis.gross_margin_pct ?? 0) >= 15 ? 'warn' :
            'critical'
          }
          sub="Güncel çeyrek"
        />
        <KpiCell
          label="EBITDA Marj"
          value={fmtPct(current_kpis.ebitda_margin_pct)}
          tone={
            (current_kpis.ebitda_margin_pct ?? 0) >= 15 ? 'ok' :
            (current_kpis.ebitda_margin_pct ?? 0) >= 5  ? 'warn' :
            'critical'
          }
          sub="Güncel çeyrek"
        />
      </KpiStrip>

      {/* Zone 2 — Quarterly timeline table */}
      {quarters.length > 0 && (
        <Panel>
          <PanelHeader
            label="Çeyreklik Performans Tablosu"
            sub="Ciro · Brüt Kâr · EBITDA · QoQ Büyüme"
          />
          <DataTable minWidth="700px">
            <thead>
              <tr>
                <DataTh>Çeyrek</DataTh>
                <DataTh align="right">Ciro</DataTh>
                <DataTh align="right">QoQ</DataTh>
                <DataTh align="right">Brüt Kâr</DataTh>
                <DataTh align="right">EBITDA</DataTh>
                <DataTh align="right">Brüt Marj</DataTh>
                <DataTh align="right">EBITDA Marj</DataTh>
                <DataTh align="right">Performans</DataTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {quarters.map((q) => {
                const qoq   = q.qoq_growth?.revenue_growth_pct ?? null
                const badge = growthBadge(qoq)
                const perf  = performanceBadge(q.performance as QuarterlySummaryReport['current_performance'])
                return (
                  <tr key={q.label} className="hover:bg-[#f8fafc]/60">
                    <DataTd>
                      <span className="font-black text-[#0f172a]">{q.label}</span>
                    </DataTd>
                    <DataTd align="right">
                      <span className="font-mono font-bold text-[#0f172a]">
                        {fmtTRY(q.revenue)}
                      </span>
                    </DataTd>
                    <DataTd align="right">
                      <span className={`text-xs ${badge.cls}`}>{badge.text}</span>
                    </DataTd>
                    <DataTd align="right" className={`font-mono font-bold ${q.gross_profit >= 0 ? 'text-brand' : 'text-neg'}`}>
                      {fmtTRY(q.gross_profit)}
                    </DataTd>
                    <DataTd align="right" className={`font-mono font-bold ${q.ebitda >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                      {fmtTRY(q.ebitda)}
                    </DataTd>
                    <DataTd align="right" className="font-mono text-[#64748b]">
                      {fmtPct(q.kpis.gross_margin_pct)}
                    </DataTd>
                    <DataTd align="right" className="font-mono text-[#64748b]">
                      {fmtPct(q.kpis.ebitda_margin_pct)}
                    </DataTd>
                    <DataTd align="right">
                      <span className={`text-[10px] font-bold border px-1.5 py-0.5 rounded ${perf.cls}`}>
                        {perf.label}
                      </span>
                    </DataTd>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {/* Zone 3 — Current quarter KPI detail */}
      <Panel>
        <PanelHeader
          label={`${current_quarter.label} — KPI Detayı`}
          sub="Marjlar · Vergi oranı · OpEx oranı"
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
          {[
            { label: 'Brüt Marj',      value: fmtPct(current_kpis.gross_margin_pct) },
            { label: 'EBITDA Marj',    value: fmtPct(current_kpis.ebitda_margin_pct) },
            { label: 'Net Marj',       value: fmtPct(current_kpis.net_margin_pct) },
            { label: 'OpEx Oranı',     value: fmtPct(current_kpis.opex_ratio_pct) },
            { label: 'Eff. Vergi',     value: fmtPct(current_kpis.tax_rate_effective_pct) },
            { label: 'Gelir/Personel', value: current_kpis.revenue_per_employee !== null
                ? fmtTRY(current_kpis.revenue_per_employee) : '—' },
          ].map(c => (
            <div key={c.label} className="bg-[#f8fafc] rounded px-3 py-2.5">
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
                {c.label}
              </div>
              <div className="text-sm font-black tabular-nums text-[#0f172a]">{c.value}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* Zone 4 — QoQ growth detail (current quarter) */}
      {qoq_growth && (
        <Panel>
          <PanelHeader
            label="QoQ Büyüme Analizi"
            sub={`${current_quarter.label} — bir önceki çeyreğe göre`}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4">
            {([
              ['Ciro',       qoq_growth.revenue_growth_pct],
              ['Brüt Kâr',   qoq_growth.gross_profit_growth_pct],
              ['EBITDA',     qoq_growth.ebitda_growth_pct],
              ['Net Kâr',    qoq_growth.net_income_growth_pct],
            ] as Array<[string, number | null]>).map(([label, val]) => {
              const b = growthBadge(val)
              return (
                <div key={label} className="bg-[#f8fafc] rounded px-3 py-2.5">
                  <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">{label}</div>
                  <div className={`text-base font-black tabular-nums ${b.cls}`}>{b.text}</div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* Zone 5 — Best / Worst quarter */}
      {(best_quarter || worst_quarter) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {best_quarter && (
            <div className="bg-pos-light/30 border border-pos-light rounded p-4">
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-pos-text mb-1">
                En İyi Çeyrek
              </div>
              <div className="text-sm font-black text-[#0f172a]">{best_quarter.label}</div>
              <div className="text-base font-black tabular-nums text-pos-text mt-1">
                {fmtTRY(best_quarter.revenue)}
              </div>
            </div>
          )}
          {worst_quarter && (
            <div className="bg-warn-light/30 border border-warn-light rounded p-4">
              <div className="text-[0.6rem] font-black uppercase tracking-widest text-warn-text mb-1">
                En Zayıf Çeyrek
              </div>
              <div className="text-sm font-black text-[#0f172a]">{worst_quarter.label}</div>
              <div className="text-base font-black tabular-nums text-warn-text mt-1">
                {fmtTRY(worst_quarter.revenue)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Narrative footer */}
      <NarrativeFooter
        narrative={narrative}
        links={[
          { label: 'Aylık P&L',      href: '/dashboard/finance?tab=pnl' },
          { label: 'Yıllık Özet',    href: '/dashboard/finance?tab=annual' },
          { label: 'Gelir Tablosu',  href: '/dashboard/reports/income-statement' },
        ]}
      />
    </div>
  )
}
