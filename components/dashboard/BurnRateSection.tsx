'use client'

// ── BurnRateSection — Nakit Tüketim Hızı (Burn Rate Monitor) ─────────────────
// Client island: fetches /api/finance/burn-rate and renders burn trend,
// 6-month table, runway estimate, and peak burn callout.

import { useQuery } from '@tanstack/react-query'
import { Skeleton } from '@/components/ds'
import { fmtTRY } from '@/lib/format'
import type { BurnRateReport, MonthlyBurnData } from '@/lib/services/finance/burn-rate.service'
import { InfoTip } from '@/components/ui/InfoTip'

// ── API response shape ────────────────────────────────────────────────────────

interface BurnRateApiResponse {
  report: BurnRateReport
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TREND_CONFIG: Record<
  BurnRateReport['burn_trend'],
  { label: string; badge: string }
> = {
  accelerating:      { label: 'Hızlanıyor',       badge: 'bg-neg-light text-neg-text' },
  stable:            { label: 'Stabil',             badge: 'bg-warn-light text-warn-text' },
  decelerating:      { label: 'Yavaşlıyor',        badge: 'bg-pos-light text-pos-text' },
  insufficient_data: { label: 'Yetersiz Veri',     badge: 'bg-[#f1f5f9] text-[#64748b]' },
}

function TrendBadge({ trend }: { trend: BurnRateReport['burn_trend'] }) {
  const cfg = TREND_CONFIG[trend]
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cfg.badge}`}>
      {cfg.label}
    </span>
  )
}

function NetBurnCell({ value }: { value: number }) {
  const isPositive = value > 0
  const isNegative = value < 0
  const tone = isPositive
    ? 'text-neg'
    : isNegative
      ? 'text-pos-text'
      : 'text-[#94a3b8]'
  return (
    <td className={`px-4 py-2.5 text-right font-mono font-bold tabular-nums text-xs ${tone}`}>
      {isNegative ? `+${fmtTRY(Math.abs(value))}` : isPositive ? `-${fmtTRY(value)}` : fmtTRY(0)}
    </td>
  )
}

function MonthRow({ month }: { month: MonthlyBurnData }) {
  return (
    <tr className="hover:bg-[#f8fafc]/60">
      <td className="px-4 py-2.5 font-semibold text-[#334155] text-xs">{month.label}</td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs text-neg">
        {month.gross_burn_try > 0 ? fmtTRY(month.gross_burn_try) : <span className="text-[#cbd5e1]">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-xs text-pos-text">
        {month.revenue_try > 0 ? fmtTRY(month.revenue_try) : <span className="text-[#cbd5e1]">—</span>}
      </td>
      <NetBurnCell value={month.net_burn_try} />
    </tr>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function BurnRateSection() {
  const { data, isLoading, error } = useQuery<BurnRateApiResponse>({
    queryKey: ['burn-rate'],
    queryFn: async () => {
      const res = await fetch('/api/finance/burn-rate')
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<BurnRateApiResponse>
    },
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton height="h-8" />
        <Skeleton height="h-48" />
      </div>
    )
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : 'Nakit tüketim hızı verileri alınamadı'
    return (
      <div className="bg-[#fef2f2] border border-[#fecaca] rounded px-4 py-3 text-xs text-[#dc2626] font-medium">
        {msg}
      </div>
    )
  }

  const { report } = data
  const {
    months,
    avg_monthly_burn_try,
    avg_monthly_revenue_try,
    avg_net_burn_try,
    burn_trend,
    runway_estimate_months,
    peak_burn_month,
    peak_burn_try,
  } = report

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden shadow-sm">

      {/* Header */}
      <div className="px-4 py-3 border-b border-[#e8eaef] flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
            Nakit Tüketim Hızı <InfoTip k="Burn" />
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-0.5">
            Son 6 aylık gider ve gelir bazlı burn rate analizi
          </p>
        </div>
        <TrendBadge trend={burn_trend} />
      </div>

      {/* KPI strip — 3-month rolling averages */}
      <div className="grid grid-cols-3 divide-x divide-[#e8eaef] border-b border-[#e8eaef]">
        {[
          {
            label: 'Ort. Aylık Gider (3 ay)',
            value: fmtTRY(avg_monthly_burn_try),
            tone: avg_monthly_burn_try > 0 ? 'text-neg' : 'text-[#94a3b8]',
          },
          {
            label: 'Ort. Aylık Gelir (3 ay)',
            value: fmtTRY(avg_monthly_revenue_try),
            tone: avg_monthly_revenue_try > 0 ? 'text-pos-text' : 'text-[#94a3b8]',
          },
          {
            label: 'Ort. Net Burn (3 ay)',
            value: fmtTRY(Math.abs(avg_net_burn_try)),
            tone: avg_net_burn_try > 0 ? 'text-neg' : avg_net_burn_try < 0 ? 'text-pos-text' : 'text-[#94a3b8]',
          },
        ].map(kpi => (
          <div key={kpi.label} className="px-4 py-3">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
              {kpi.label}
            </div>
            <div className={`text-base font-bold tabular-nums leading-none ${kpi.tone}`}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* 6-month table */}
      {months.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
              <th className="text-left px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                Ay
              </th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-neg">
                Gider
              </th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-pos">
                Gelir
              </th>
              <th className="text-right px-4 py-2.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
                Net Nakit Değişimi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {months.map(m => (
              <MonthRow key={m.month} month={m} />
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-6 text-xs text-[#94a3b8] text-center">
          Henüz veri yok.
        </div>
      )}

      {/* Runway estimate */}
      {runway_estimate_months !== null && (
        <div className="border-t border-[#e8eaef] px-4 py-3 flex items-center gap-2 bg-[#fef9ec]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#d97706]">
            Tahmini Runway
          </span>
          <span className={[
            'text-sm font-bold tabular-nums',
            runway_estimate_months <= 2
              ? 'text-neg'
              : runway_estimate_months <= 6
                ? 'text-warn-text'
                : 'text-pos-text',
          ].join(' ')}>
            {runway_estimate_months.toFixed(1)} ay
          </span>
          <span className="text-[10px] text-[#94a3b8]">
            (mevcut nakit bakiye / ort. net burn üzerinden)
          </span>
        </div>
      )}

      {/* Peak burn callout */}
      {peak_burn_month !== null && peak_burn_try !== null && peak_burn_try > 0 && (
        <div className="border-t border-[#e8eaef] px-4 py-3 flex items-center gap-2 bg-[#fff1f2]">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neg-text">
            En Yüksek Gider Ayı
          </span>
          <span className="text-xs font-bold text-neg-text">
            {peak_burn_month}
          </span>
          <span className="text-xs text-neg font-mono tabular-nums">
            {fmtTRY(peak_burn_try)}
          </span>
        </div>
      )}
    </div>
  )
}
