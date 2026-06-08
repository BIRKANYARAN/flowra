'use client'

// ─────────────────────────────────────────────────────────────────────────────
// FiscalYearSummaryClient
//
// Executive-grade fiscal year close summary.
//
// Features:
//   - Year selector: current year, back 3 years
//   - 4 KPI cards: Revenue, Gross Profit %, Net Income, Net Margin %
//   - Quarterly bar comparison (Q1-Q4 net income, pure CSS)
//   - Best / Worst month callout
//   - Monthly breakdown table (12 rows max)
//   - Empty state when no closed periods
//   - Incomplete year banner when < 12 periods
// ─────────────────────────────────────────────────────────────────────────────

import { useState }            from 'react'
import { useQuery }            from '@tanstack/react-query'
import { fmtTRY, fmtPct }      from '@/lib/format'
import type { FiscalYearSummary, QuarterlyBreakdown, MonthlyData } from '@/lib/services/finance/fiscal-year-summary.service'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart',
  '04': 'Nisan', '05': 'Mayıs', '06': 'Haziran',
  '07': 'Temmuz', '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim', '11': 'Kasım', '12': 'Aralık',
}

function periodLabel(periodKey: string): string {
  // "2025-03" → "Mart 2025"
  const [year, month] = periodKey.split('-')
  return `${MONTH_NAMES[month] ?? month} ${year}`
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'warning'
}) {
  const valueColor = {
    positive: 'text-[#16a34a]',
    negative: 'text-[#dc2626]',
    warning:  'text-[#d97706]',
    neutral:  'text-[#0f172a]',
  }[tone]

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-3 shadow-sm">
      <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className={`text-xl font-black tabular-nums leading-none ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-[#94a3b8] mt-1 leading-tight">{sub}</div>
      )}
    </div>
  )
}

function QuarterlyBars({ quarters }: { quarters: QuarterlyBreakdown[] }) {
  const maxNet    = Math.max(1, ...quarters.map(q => Math.abs(q.net_income_try)))
  const hasData   = quarters.some(q => q.revenue_try > 0 || q.net_income_try !== 0)

  if (!hasData) return null

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Çeyreklik Net Gelir
      </div>
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft px-4 py-4 shadow-sm">
        <div className="flex items-end gap-4 h-20">
          {quarters.map(q => {
            const net      = q.net_income_try
            const isNeg    = net < 0
            const barH     = maxNet > 0 ? Math.max(2, Math.round((Math.abs(net) / maxNet) * 72)) : 2
            const barColor = isNeg ? 'bg-[#ef4444]' : 'bg-[#22c55e]'
            return (
              <div key={q.quarter} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="text-[9px] tabular-nums font-semibold text-[#64748b] whitespace-nowrap"
                  style={{ minHeight: '16px' }}
                >
                  {fmtTRY(net, 0)}
                </div>
                <div className="w-full flex items-end justify-center" style={{ height: '60px' }}>
                  <div
                    className={`w-full rounded-sm ${barColor} opacity-90 transition-all`}
                    style={{ height: `${barH}px` }}
                    title={`${q.quarter}: ${fmtTRY(net)}`}
                  />
                </div>
                <div className="text-[10px] font-black text-[#334155]">{q.quarter}</div>
                <div className="text-[9px] text-[#94a3b8] tabular-nums">
                  {fmtPct(q.margin_pct)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthCallouts({
  best,
  worst,
}: {
  best:  { month: string; value: number } | null
  worst: { month: string; value: number } | null
}) {
  if (!best && !worst) return null
  return (
    <div className="grid grid-cols-2 gap-2">
      {best && (
        <div className="flex items-center gap-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded px-3 py-2.5">
          <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wide text-[#15803d]">En İyi Ay</div>
            <div className="text-xs font-black text-[#166534]">{periodLabel(best.month)}</div>
            <div className="text-[10px] tabular-nums text-[#16a34a]">{fmtTRY(best.value)}</div>
          </div>
        </div>
      )}
      {worst && (
        <div className="flex items-center gap-2.5 bg-[#fef2f2] border border-[#fecaca] rounded px-3 py-2.5">
          <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />
          <div>
            <div className="text-[9px] font-black uppercase tracking-wide text-[#b91c1c]">En Kötü Ay</div>
            <div className="text-xs font-black text-[#991b1b]">{periodLabel(worst.month)}</div>
            <div className="text-[10px] tabular-nums text-[#dc2626]">{fmtTRY(worst.value)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function MonthlyTable({ rows }: { rows: MonthlyData[] }) {
  if (rows.length === 0) return null

  return (
    <div>
      <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">
        Aylık Döküm
      </div>
      <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-soft shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] bg-[#f8fafc] border-b border-[#e2e8f0]">
                <th className="text-left px-4 py-2">Dönem</th>
                <th className="text-right px-4 py-2">Gelir</th>
                <th className="text-right px-4 py-2">Gider</th>
                <th className="text-right px-4 py-2">Net Gelir</th>
                <th className="text-right px-4 py-2">Marj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {rows.slice(0, 12).map(row => {
                const margin = row.revenue_try > 0
                  ? (row.net_income_try / row.revenue_try) * 100
                  : 0
                const netColor = row.net_income_try >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'
                return (
                  <tr key={row.period_key} className="hover:bg-[#f8fafc]/60">
                    <td className="px-4 py-2 font-semibold text-[#334155]">
                      {periodLabel(row.period_key)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#0f172a]">
                      {fmtTRY(row.revenue_try)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#64748b]">
                      {fmtTRY(row.expenses_try)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums font-semibold ${netColor}`}>
                      {fmtTRY(row.net_income_try)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-[#64748b]">
                      {fmtPct(margin)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function FiscalYearSummaryClient({ companyId }: Props) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

  const { data, isLoading } = useQuery<FiscalYearSummary>({
    queryKey: ['fiscal-year', companyId, year],
    queryFn: () =>
      fetch(`/api/finance/fiscal-year?year=${year}&companyId=${companyId}`)
        .then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  return (
    <div className="space-y-4">

      {/* ── Header + Year Selector ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
            Mali Yıl Kapanış Özeti
          </div>
          {data && !data.is_complete && data.periods_count > 0 && (
            <div className="text-[10px] text-[#d97706] font-semibold mt-0.5">
              {data.periods_count}/12 dönem kapatılmış
            </div>
          )}
        </div>
        <select
          value={year}
          onChange={e => setYear(Number(e.target.value))}
          className="text-xs border border-[#e2e8f0] rounded px-2 py-1.5 bg-white text-[#334155] font-semibold focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
        >
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* ── Loading skeleton ───────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-[#f1f5f9] rounded h-16 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!isLoading && data && data.periods_count === 0 && (
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded px-5 py-6 flex flex-col items-center gap-2 text-center">
          <span className="text-[#94a3b8] text-xl">—</span>
          <p className="text-sm font-semibold text-[#64748b]">
            Bu yıl için kapatılmış dönem bulunamadı
          </p>
          <p className="text-[11px] text-[#94a3b8]">
            {year} yılına ait kapalı veya kilitli dönem kaydı mevcut değil.
          </p>
        </div>
      )}

      {/* ── Data views ─────────────────────────────────────────────────────── */}
      {!isLoading && data && data.periods_count > 0 && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-2">
            <KpiCard
              label="Yıllık Ciro"
              value={fmtTRY(data.annual.revenue_try)}
              sub={`${data.periods_count} dönem kapalı`}
              tone={data.annual.revenue_try > 0 ? 'positive' : 'neutral'}
            />
            <KpiCard
              label="Brüt Kâr Marjı"
              value={fmtPct(data.annual.gross_margin_pct)}
              sub={fmtTRY(data.annual.gross_profit_try) + ' brüt kâr'}
              tone={
                data.annual.gross_margin_pct >= 40 ? 'positive' :
                data.annual.gross_margin_pct >= 20 ? 'warning' : 'negative'
              }
            />
            <KpiCard
              label="Net Gelir"
              value={fmtTRY(data.annual.net_income_try)}
              sub={data.annual.net_income_try >= 0 ? 'Kârlı yıl' : 'Zararlı yıl'}
              tone={data.annual.net_income_try >= 0 ? 'positive' : 'negative'}
            />
            <KpiCard
              label="Net Marj"
              value={fmtPct(data.annual.net_margin_pct)}
              sub={`EBITDA: ${fmtTRY(data.annual.ebitda_try)}`}
              tone={
                data.annual.net_margin_pct >= 10 ? 'positive' :
                data.annual.net_margin_pct >= 0  ? 'warning'  : 'negative'
              }
            />
          </div>

          {/* Quarterly Bar Chart */}
          {data.quarterly.length > 0 && (
            <QuarterlyBars quarters={data.quarterly} />
          )}

          {/* Best / Worst Month */}
          <MonthCallouts best={data.best_month} worst={data.worst_month} />

          {/* Monthly Breakdown Table */}
          <MonthlyTable rows={data.monthly_breakdown} />
        </>
      )}
    </div>
  )
}
