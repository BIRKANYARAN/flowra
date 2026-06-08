'use client'

// ── VadeTakvimi — Debt Maturity Section ───────────────────────────────────────
// Extracted verbatim from AmortizationTab.tsx (god-component decomposition).
// Self-contained: own data hook + presentational helpers. No behavior change.

import { useState } from 'react'
import { fmtTRY } from '@/lib/format'
import type { DebtMaturityReport } from '@/lib/services/pcle/debt-maturity.service'

// ── data hook ─────────────────────────────────────────────────────────────────
function useDebtMaturityReport() {
  const [report, setReport] = useState<DebtMaturityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/debt-maturity')
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const json = await res.json() as { report: DebtMaturityReport }
      setReport(json.report)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vade verisi yüklenemedi')
    } finally {
      setLoading(false)
    }
  }

  return { report, loading, error, load, loaded }
}

// ── Vade Takvimi — Debt Maturity Section ─────────────────────────────────────

interface BucketBarItem {
  label: string
  amount: number
  pct: number
  color: string
  textColor: string
}

function MaturityBucketBar({ items, total }: { items: BucketBarItem[]; total: number }) {
  if (total <= 0) return (
    <p className="text-xs text-[#94a3b8] py-2 text-center">Vadelendirilebilir borç bulunamadı.</p>
  )

  return (
    <div className="flex flex-col gap-2">
      {items.map(item => {
        if (item.amount <= 0) return null
        const barWidth = Math.max(item.pct, 2)
        return (
          <div key={item.label} className="flex items-center gap-3">
            <div className="w-28 text-[0.65rem] font-semibold text-[#64748b] shrink-0 text-right">
              {item.label}
            </div>
            <div className="flex-1 h-5 bg-[#f1f5f9] rounded overflow-hidden">
              <div
                className={`h-full rounded flex items-center justify-end pr-2 ${item.color}`}
                style={{ width: `${barWidth}%` }}
              >
                {item.pct >= 8 && (
                  <span className={`text-[0.6rem] font-black tabular-nums ${item.textColor}`}>
                    {item.pct.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div className="w-28 text-right text-[0.7rem] font-semibold text-[#0f172a] tabular-nums shrink-0">
              {fmtTRY(item.amount)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RefinancingScoreChip({ score }: { score: number }) {
  const rounded = Math.round(score)
  const color =
    rounded >= 70
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : rounded >= 40
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-red-50 border-red-200 text-red-700'

  const label =
    rounded >= 70 ? 'Düşük Baskı' : rounded >= 40 ? 'Orta Baskı' : 'Yüksek Baskı'

  return (
    <div className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 ${color}`}>
      <span className="text-[0.6rem] font-black uppercase tracking-widest">Yeniden Finansman Baskısı</span>
      <span className="text-base font-black tabular-nums">{rounded}</span>
      <span className="text-[0.65rem] font-semibold">/100</span>
      <span className="text-[0.65rem] font-semibold">·</span>
      <span className="text-[0.65rem] font-semibold">{label}</span>
    </div>
  )
}

function ConcentrationWarnings({
  concentrationMonth,
  concentrationPartner,
  schedule,
}: {
  concentrationMonth?: string
  concentrationPartner?: string
  schedule: Array<{ month: string; label: string; maturing_try: number; tranche_count: number; partner_ids: string[] }>
}) {
  const warnings: string[] = []

  if (concentrationMonth) {
    const entry = schedule.find(s => s.month === concentrationMonth)
    warnings.push(
      `Konsantrasyon Riski: ${entry?.label ?? concentrationMonth} ayında toplam borcun %30'undan fazlası vadesi doluyor.`,
    )
  }

  if (concentrationPartner) {
    warnings.push(
      `Ortak Konsantrasyonu: "${concentrationPartner}" — önümüzdeki 12 ayda olgunlaşan borcun %50'sinden fazlasından sorumlu.`,
    )
  }

  if (warnings.length === 0) return null

  return (
    <div className="flex flex-col gap-1.5">
      {warnings.map(w => (
        <div
          key={w}
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[0.7rem] font-semibold text-amber-800"
        >
          ⚠ {w}
        </div>
      ))}
    </div>
  )
}

function MaturityScheduleTable({ schedule }: { schedule: Array<{ month: string; label: string; maturing_try: number; tranche_count: number; partner_ids: string[] }> }) {
  const nonEmpty = schedule.filter(s => s.maturing_try > 0)

  if (nonEmpty.length === 0) {
    return (
      <p className="text-xs text-[#94a3b8] py-3 text-center">
        Önümüzdeki 36 ayda vadesi dolacak borç bulunamadı.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-[#e8eaef]">
            <th className="py-1.5 px-2 text-left font-semibold text-[#64748b] whitespace-nowrap">Ay</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Vade Tutarı</th>
            <th className="py-1.5 px-2 text-right font-semibold text-[#64748b] whitespace-nowrap">Tranche</th>
          </tr>
        </thead>
        <tbody>
          {nonEmpty.map(row => (
            <tr key={row.month} className="border-b border-[#f1f5f9] bg-white hover:bg-[#f8fafc]">
              <td className="py-1 px-2 font-medium text-[#334155] whitespace-nowrap">{row.label}</td>
              <td className="py-1 px-2 text-right tabular-nums font-semibold text-[#0f172a]">
                {fmtTRY(row.maturing_try)}
              </td>
              <td className="py-1 px-2 text-right tabular-nums text-[#64748b]">
                {row.tranche_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function VadeTakvimi() {
  const { report, loading, error, load, loaded } = useDebtMaturityReport()

  if (!loaded && !loading && !error) {
    load()
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-7 rounded bg-[#f1f5f9] animate-pulse" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 font-medium">
        {error}
      </div>
    )
  }

  if (!report) return null

  // Map new DebtMaturityReport shape to local display variables
  const total = report.total_outstanding_try
  const ladder = report.maturity_ladder
  const getBucket = (key: string) => ladder.find(b => b.bucket_key === key)
  const overdueTry  = getBucket('overdue')?.principal_try ?? 0
  const immTry      = getBucket('days_0_30')?.principal_try ?? 0
  const shortTry    = getBucket('days_31_90')?.principal_try ?? 0
  const medTry      = (getBucket('days_91_180')?.principal_try ?? 0) +
                      (getBucket('days_181_365')?.principal_try ?? 0)
  const longTry     = getBucket('over_1_year')?.principal_try ?? 0

  const buckets: BucketBarItem[] = [
    {
      label: 'Vadesi Geçmiş',
      amount: overdueTry,
      pct: total > 0 ? (overdueTry / total) * 100 : 0,
      color: 'bg-red-400',
      textColor: 'text-white',
    },
    {
      label: '0–30 gün',
      amount: immTry,
      pct: total > 0 ? (immTry / total) * 100 : 0,
      color: 'bg-orange-400',
      textColor: 'text-white',
    },
    {
      label: '31–90 gün',
      amount: shortTry,
      pct: total > 0 ? (shortTry / total) * 100 : 0,
      color: 'bg-amber-400',
      textColor: 'text-white',
    },
    {
      label: '91–365 gün',
      amount: medTry,
      pct: total > 0 ? (medTry / total) * 100 : 0,
      color: 'bg-yellow-300',
      textColor: 'text-yellow-900',
    },
    {
      label: '1 yıl+',
      amount: longTry,
      pct: total > 0 ? (longTry / total) * 100 : 0,
      color: 'bg-emerald-400',
      textColor: 'text-white',
    },
  ]

  // Derive a 0-100 score from refinancing_risk for the chip
  const riskScoreMap: Record<string, number> = {
    no_debt: 100,
    low: 80,
    moderate: 50,
    high: 25,
    critical: 5,
  }
  const refinancingScore = riskScoreMap[report.refinancing_risk] ?? 50

  // Compute next-12m pct from ladder buckets
  const near12m = overdueTry + immTry + shortTry + medTry
  const next12mPct = total > 0 ? (near12m / total) * 100 : 0

  // Build a schedule-like array from maturity cliffs for concentration warnings
  const scheduleForWarnings = report.maturity_cliffs.map(c => ({
    month: c.date.substring(0, 7),
    label: c.date,
    maturing_try: c.amount_try,
    tranche_count: 1,
    partner_ids: [],
  }))

  // Concentration partner from highest concentration entry
  const topPartner = report.concentration_by_partner.find(p => p.pct_of_total > 50)

  return (
    <div className="flex flex-col gap-4">
      {/* Bucket bar chart */}
      <MaturityBucketBar items={buckets} total={total} />

      {/* Score + next 12m pct */}
      <div className="flex items-center gap-3 flex-wrap">
        <RefinancingScoreChip score={refinancingScore} />
        {total > 0 && (
          <span className="text-[0.7rem] text-[#64748b]">
            12 aylık vade oranı:{' '}
            <strong className="text-[#334155]">%{next12mPct.toFixed(1)}</strong>
          </span>
        )}
      </div>

      {/* Concentration warnings */}
      <ConcentrationWarnings
        concentrationMonth={report.maturity_cliffs[0]?.date.substring(0, 7)}
        concentrationPartner={topPartner?.partner_name}
        schedule={scheduleForWarnings}
      />

      {/* Maturity cliffs summary (replaces 36-month schedule) */}
      <div>
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Vade Dağılımı
        </div>
        <MaturityScheduleTable schedule={scheduleForWarnings} />
      </div>
    </div>
  )
}
