'use client'
// ── CohortRetentionClient — Customer Cohort Retention & Churn Analysis ────────
// Fetches /api/commercial/cohort-retention via TanStack Query.
// Features:
//   • Lookback selector: 3 / 6 / 12 months
//   • Overall retention health badge + 3m avg retention %
//   • Churn rate display
//   • Cohort retention heatmap table (rows = cohorts, cols = period offsets)
//   • Best/worst cohort callout
//   • Revenue per cohort CSS bar chart
//   • Empty state

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  CohortRetentionReport,
  CustomerCohort,
} from '@/lib/services/commercial/cohort-retention.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${TRY_FMT.format(Math.round(n))}`
}

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

// ── Cell color helper (heatmap) ───────────────────────────────────────────────

function retentionCellClass(pct: number | undefined, isAcquisition: boolean): string {
  if (isAcquisition) return 'bg-[#1e293b] text-white'
  if (pct === undefined) return 'bg-[#f1f5f9] text-[#cbd5e1]'
  if (pct >= 60) return 'bg-emerald-100 text-emerald-800'
  if (pct >= 40) return 'bg-teal-100 text-teal-700'
  if (pct >= 20) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

// ── Health badge ──────────────────────────────────────────────────────────────

const HEALTH_CFG = {
  strong: { label: 'Güçlü',    bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:   { label: 'İyi',      bg: 'bg-teal-100',    text: 'text-teal-700'    },
  fair:   { label: 'Orta',     bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  weak:   { label: 'Zayıf',    bg: 'bg-red-100',     text: 'text-red-700'     },
} as const

type Health = keyof typeof HEALTH_CFG

function HealthBadge({ health }: { health: Health }) {
  const cfg = HEALTH_CFG[health]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-52 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Revenue bar chart (CSS) ───────────────────────────────────────────────────

function RevenueChart({ cohorts }: { cohorts: CustomerCohort[] }) {
  const maxRev = Math.max(...cohorts.map(c => c.total_revenue_try), 1)

  return (
    <div className="space-y-2">
      {cohorts.map(c => {
        const barPct = (c.total_revenue_try / maxRev) * 100
        return (
          <div key={c.cohort_month} className="flex items-center gap-3">
            <div className="w-28 text-[11px] font-medium text-[#334155] shrink-0 truncate">
              {c.cohort_label}
            </div>
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className="h-5 bg-brand-light rounded"
                style={{ width: `${barPct}%` }}
              />
            </div>
            <div className="w-20 text-right shrink-0">
              <span className="text-xs font-bold tabular-nums text-brand">
                {fmtTRY(c.total_revenue_try)}
              </span>
              <span className="text-[9px] text-[#94a3b8] ml-1">
                ({c.cohort_size} müş.)
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: CohortRetentionReport
}

export default function CohortRetentionClient({ companyId: _companyId }: Props) {
  const [months, setMonths] = useState<number>(6)

  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['cohort-retention', months],
    queryFn: async () => {
      const res = await fetch(`/api/commercial/cohort-retention?months=${months}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 2 * 60 * 60 * 1000, // 2 hours
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  // Empty state
  if (!report || report.cohorts.length < 2) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          Kohort analizi için yeterli müşteri verisi yok (en az 2 ay)
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          Son {months} ay tarandı
        </p>
      </div>
    )
  }

  // Max visible periods in the table (up to 7: offset 0–6)
  const MAX_COLS = 7

  // Find best/worst cohort labels
  const bestCohort = report.best_cohort_month
    ? report.cohorts.find(c => c.cohort_month === report.best_cohort_month)
    : null
  const worstCohort = report.worst_cohort_month
    ? report.cohorts.find(c => c.cohort_month === report.worst_cohort_month)
    : null

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9] flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Kohort Tutma & Churn Analizi
        </span>

        {/* Lookback selector */}
        <div className="flex items-center gap-1.5">
          {([3, 6, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setMonths(n)}
              className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
                months === n
                  ? 'bg-brand text-white border-brand'
                  : 'bg-white text-[#64748b] border-[#e2e8f0] hover:border-brand hover:text-brand'
              }`}
            >
              {n} ay
            </button>
          ))}
        </div>
      </div>

      {/* Overall KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Tutma Sağlığı
          </div>
          <HealthBadge health={report.overall_retention_health} />
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            3 Aylık Ort. Tutma
          </div>
          <div className={`text-lg font-black tabular-nums leading-none ${
            report.overall_avg_3m_retention_pct >= 60
              ? 'text-emerald-700'
              : report.overall_avg_3m_retention_pct >= 40
                ? 'text-teal-700'
                : report.overall_avg_3m_retention_pct >= 20
                  ? 'text-yellow-700'
                  : 'text-red-700'
          }`}>
            {fmtPct(report.overall_avg_3m_retention_pct)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ort. Aylık Churn
          </div>
          <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">
            {fmtPct(report.churn_rate_pct)}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            Ortalama aylık churn: {fmtPct(report.churn_rate_pct)}
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam Kohort
          </div>
          <div className="text-lg font-black tabular-nums leading-none text-[#0f172a]">
            {report.cohorts.length}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            Son {months} ay
          </div>
        </div>
      </div>

      {/* Best/worst callout */}
      {(bestCohort || worstCohort) && (
        <div className="px-4 py-2 border-b border-[#f1f5f9] flex flex-wrap gap-3">
          {bestCohort && (
            <div className="text-[11px] text-[#334155]">
              <span className="text-[9px] font-black uppercase tracking-wide text-emerald-600 mr-1">
                En iyi kohort:
              </span>
              <strong>{bestCohort.cohort_label}</strong>
              <span className="text-[#94a3b8] ml-1">
                ({fmtPct(bestCohort.avg_3m_retention_pct)} 3-aylık tutma)
              </span>
            </div>
          )}
          {worstCohort && worstCohort.cohort_month !== bestCohort?.cohort_month && (
            <div className="text-[11px] text-[#334155]">
              <span className="text-[9px] font-black uppercase tracking-wide text-red-600 mr-1">
                En zayıf kohort:
              </span>
              <strong>{worstCohort.cohort_label}</strong>
              <span className="text-[#94a3b8] ml-1">
                ({fmtPct(worstCohort.avg_3m_retention_pct)} 3-aylık tutma)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Retention heatmap table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-28">
                Kohort
              </th>
              <th className="text-center px-2 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-14">
                Müşteri
              </th>
              {Array.from({ length: MAX_COLS }, (_, i) => (
                <th key={i} className="text-center px-1 py-2 text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] w-14">
                  Ay {i}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f8fafc]">
            {report.cohorts.map(cohort => {
              // Build period lookup: offset → CohortPeriodData
              const periodByOffset = new Map(cohort.periods.map(p => [p.period_offset, p]))

              return (
                <tr key={cohort.cohort_month} className="hover:bg-[#f8fafc]/60">
                  <td className="px-4 py-2 text-[11px] font-bold text-[#334155] whitespace-nowrap">
                    {cohort.cohort_label}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-[#64748b] text-[11px]">
                    {cohort.cohort_size}
                  </td>
                  {Array.from({ length: MAX_COLS }, (_, offset) => {
                    const period = periodByOffset.get(offset)
                    const pct = period?.retention_rate_pct
                    const isAcquisition = offset === 0
                    const displayPct = isAcquisition ? 100 : pct

                    const title = period
                      ? `${fmtTRY(period.revenue_try)} · ${period.active_customers} müşteri · ${fmtPct(period.retention_rate_pct)} tutma`
                      : 'Veri yok'

                    return (
                      <td key={offset} className="px-1 py-1.5 text-center">
                        <span
                          className={`inline-block w-12 py-1 rounded text-[10px] font-bold tabular-nums cursor-default ${retentionCellClass(displayPct, isAcquisition)}`}
                          title={title}
                        >
                          {displayPct !== undefined ? `%${Math.round(displayPct)}` : '—'}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Revenue per cohort bar chart */}
      <div className="px-4 pt-3 pb-2 border-t border-[#f1f5f9]">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Kohort Başına Toplam Gelir
        </div>
        <RevenueChart cohorts={report.cohorts} />
      </div>

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Hücre = kohort müşterilerinin o aydaki aktif oranı. Ay 0 = satın alma ayı (her zaman %100). Yeşil ≥%60 · Teal %40-60 · Sarı %20-40 · Kırmızı &lt;%20.
      </div>
    </div>
  )
}
