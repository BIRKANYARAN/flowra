'use client'
// ── RecurringRevenueClient — MRR/ARR/NRR Recurring Revenue Analysis ───────────
// Fetches /api/commercial/recurring-revenue via TanStack Query.
// Features:
//   • 4 KPI cards: MRR / ARR / NRR / Tekrarlayan Müşteri Oranı
//   • NRR health badge
//   • Monthly metrics bars: expansion / contraction / churn / new MRR
//   • Top recurring customers table
//   • Empty state

import { useQuery } from '@tanstack/react-query'
import type { RecurringRevenueReport } from '@/lib/services/commercial/recurring-revenue.service'
import { fmtTRY, fmtPct } from '@/lib/format'

// ── NRR health config ─────────────────────────────────────────────────────────

const NRR_HEALTH_CFG = {
  excellent:        { label: 'Mükemmel',       bg: 'bg-emerald-100', text: 'text-emerald-800' },
  good:             { label: 'İyi',             bg: 'bg-teal-100',    text: 'text-teal-700'    },
  neutral:          { label: 'Nötr',            bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  at_risk:          { label: 'Risk Altında',    bg: 'bg-orange-100',  text: 'text-orange-700'  },
  declining:        { label: 'Düşüş Var',       bg: 'bg-red-100',     text: 'text-red-700'     },
  insufficient_data:{ label: 'Veri Yetersiz',   bg: 'bg-[#f1f5f9]',  text: 'text-[#94a3b8]'   },
} as const

type NrrHealth = keyof typeof NRR_HEALTH_CFG

function NrrHealthBadge({ health }: { health: NrrHealth }) {
  const cfg = NRR_HEALTH_CFG[health]
  return (
    <span className={`inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueColor = 'text-[#0f172a]',
}: {
  label: string
  value: string
  sub?: React.ReactNode
  valueColor?: string
}) {
  return (
    <div className="p-3">
      <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
        {label}
      </div>
      <div className={`text-lg font-black tabular-nums leading-none ${valueColor}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Monthly metrics bar ───────────────────────────────────────────────────────

function MetricBar({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-[11px] font-medium text-[#334155] shrink-0 truncate">{label}</div>
      <div className="flex-1 h-4 bg-[#f1f5f9] rounded overflow-hidden">
        <div className={`h-4 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-24 text-right shrink-0 text-xs font-bold tabular-nums text-[#0f172a]">
        {fmtTRY(value)}
      </div>
    </div>
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
      <div className="h-32 bg-[#f8fafc] rounded" />
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  report: RecurringRevenueReport
}

export default function RecurringRevenueClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['recurring-revenue', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/recurring-revenue')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  })

  if (isLoading) return <Skeleton />
  if (error) return null

  const report = data?.report

  // Empty state
  if (!report || report.total_customer_count === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          Tekrarlayan gelir analizi için yeterli veri yok
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          Son 6 ay satış verisi tarandı
        </p>
      </div>
    )
  }

  const {
    mrr,
    arr,
    recurring_customer_count,
    total_customer_count,
    recurring_revenue_ratio_pct,
    nrr_pct,
    grr_pct,
    nrr_health,
    monthly_metrics,
    top_recurring_customers,
  } = report

  const recurringCustomerPct = total_customer_count > 0
    ? (recurring_customer_count / total_customer_count) * 100
    : 0

  const nrrColor = nrr_pct === null
    ? 'text-[#94a3b8]'
    : nrr_pct >= 120
      ? 'text-emerald-700'
      : nrr_pct >= 100
        ? 'text-teal-700'
        : nrr_pct >= 90
          ? 'text-yellow-700'
          : 'text-red-700'

  const maxBar = Math.max(
    monthly_metrics.expansion_revenue,
    monthly_metrics.contraction_revenue,
    monthly_metrics.churned_revenue,
    monthly_metrics.new_mrr,
    1,
  )

  return (
    <div className="bg-white border border-[#e2e8f0] rounded overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tekrarlayan Gelir Analizi
        </span>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-x divide-[#e2e8f0] border-b border-[#e2e8f0]">
        <KpiCard
          label="Aylık Tekrarlayan Gelir (MRR)"
          value={fmtTRY(mrr)}
        />
        <KpiCard
          label="Yıllık Tekrarlayan Gelir (ARR)"
          value={fmtTRY(arr)}
          sub={<span className="text-[9px] text-[#94a3b8]">MRR × 12</span>}
        />
        <KpiCard
          label="Net Gelir Tutma (NRR)"
          value={nrr_pct !== null ? fmtPct(nrr_pct) : '—'}
          valueColor={nrrColor}
          sub={
            <div className="flex items-center gap-1 mt-0.5">
              <NrrHealthBadge health={nrr_health as NrrHealth} />
              {grr_pct !== null && (
                <span className="text-[9px] text-[#94a3b8]">GRR {fmtPct(grr_pct)}</span>
              )}
            </div>
          }
        />
        <KpiCard
          label="Tekrarlayan Müşteri Oranı"
          value={fmtPct(recurringCustomerPct)}
          sub={
            <span className="text-[9px] text-[#94a3b8]">
              {recurring_customer_count} / {total_customer_count} müşteri
              {recurring_revenue_ratio_pct !== null && (
                <> · Gelir payı {fmtPct(recurring_revenue_ratio_pct)}</>
              )}
            </span>
          }
        />
      </div>

      {/* Monthly movement bars */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Bu Ay Hareket
        </div>
        <div className="space-y-2">
          <MetricBar
            label="Yeni MRR"
            value={monthly_metrics.new_mrr}
            max={maxBar}
            color="bg-emerald-400"
          />
          <MetricBar
            label="Genişleme Geliri"
            value={monthly_metrics.expansion_revenue}
            max={maxBar}
            color="bg-teal-400"
          />
          <MetricBar
            label="Daralma Geliri"
            value={monthly_metrics.contraction_revenue}
            max={maxBar}
            color="bg-orange-400"
          />
          <MetricBar
            label="Kayıp MRR (Churn)"
            value={monthly_metrics.churned_revenue}
            max={maxBar}
            color="bg-red-400"
          />
        </div>
      </div>

      {/* Top recurring customers */}
      {top_recurring_customers.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
            En İyi Tekrarlayan Müşteriler
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#f1f5f9] text-[0.6rem] font-black uppercase tracking-widest text-[#94a3b8]">
                <th className="text-left pb-1.5">#</th>
                <th className="text-left pb-1.5">Müşteri</th>
                <th className="text-right pb-1.5">Ort. Aylık Gelir</th>
                <th className="text-right pb-1.5">Aktif Ay</th>
                <th className="text-center pb-1.5">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f8fafc]">
              {top_recurring_customers.map((c, idx) => (
                <tr key={c.customer_id} className="hover:bg-[#f8fafc]/60">
                  <td className="py-1.5 text-[#cbd5e1] tabular-nums">{idx + 1}</td>
                  <td className="py-1.5 font-medium text-[#334155] truncate max-w-[140px]">
                    {c.customer_name}
                  </td>
                  <td className="py-1.5 text-right tabular-nums font-bold text-[#0f172a]">
                    {fmtTRY(c.avg_monthly_revenue)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[#64748b]">
                    {c.months_active} ay
                  </td>
                  <td className="py-1.5 text-center">
                    {c.is_expanding ? (
                      <span className="inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        ↑ Büyüme
                      </span>
                    ) : (
                      <span className="inline-block text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#f1f5f9] text-[#94a3b8]">
                        Stabil
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Son 6 ay verisi. Tekrarlayan = en az 2 ayda alım + aktif aylarda %50+ tutma oranı. NRR &gt;%100 = negatif churn.
      </div>
    </div>
  )
}
