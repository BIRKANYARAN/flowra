'use client'
// ── ReceivablesAgingEnhancedClient — Extended Receivables Aging Dashboard ─────
// Client island: fetches /api/commercial/receivables-aging-enhanced via TanStack Query.
// Shows DSO metric, aging bucket bars, customer risk table, bad debt provision,
// collection efficiency, and DSO trend.

import { useQuery }              from '@tanstack/react-query'
import { fmtTRY, fmtPct, fmtNum, fmtMonthShort } from '@/lib/format'
import {
  FlowraKpiCard,
  FlowraAlert,
  LoadingSpinner,
  ErrorBanner,
} from '@/components/ds'
import type {
  ReceivablesAgingEnhancedReport,
  CustomerAgingDetail,
  DSOTrend,
} from '@/lib/services/commercial/receivables-aging-enhanced.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: ReceivablesAgingEnhancedReport
}

// ── Risk tier config ──────────────────────────────────────────────────────────

const RISK_CFG: Record<CustomerAgingDetail['risk_tier'], {
  label: string
  bg: string
  text: string
}> = {
  low:      { label: 'Düşük',   bg: 'bg-[#f0fdf4]', text: 'text-[#15803d]' },
  medium:   { label: 'Orta',    bg: 'bg-[#fffbeb]', text: 'text-[#b45309]' },
  high:     { label: 'Yüksek',  bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]' },
  critical: { label: 'Kritik',  bg: 'bg-[#fef2f2]', text: 'text-[#dc2626]' },
}

// ── Health banner config ──────────────────────────────────────────────────────

const HEALTH_CFG: Record<ReceivablesAgingEnhancedReport['aging_health'], {
  tone: 'success' | 'info' | 'warning' | 'danger'
}> = {
  healthy:  { tone: 'success' },
  watch:    { tone: 'info' },
  concern:  { tone: 'warning' },
  critical: { tone: 'danger' },
}

// ── Aging bar colors ──────────────────────────────────────────────────────────

const BUCKET_BAR_COLOR = [
  '#22c55e',  // current (green)
  '#f59e0b',  // 30-60 (amber)
  '#f97316',  // 60-90 (orange)
  '#ef4444',  // 90+ (red)
]

// ── Component ─────────────────────────────────────────────────────────────────

export function ReceivablesAgingEnhancedClient() {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['receivables-aging-enhanced'],
    queryFn:  () =>
      fetch('/api/commercial/receivables-aging-enhanced').then(r => {
        if (!r.ok) throw new Error('Veri yüklenemedi')
        return r.json()
      }),
    staleTime: 5 * 60 * 1000,
  })

  if (isLoading) return <LoadingSpinner />
  if (isError || !data?.report) return <ErrorBanner msg="Alacak yaşlandırma verisi yüklenemedi." />

  const r = data.report

  const totalOuts = r.total_outstanding
  const bucketAmounts = [
    r.current_outstanding,
    r.total_outstanding - r.current_outstanding - r.days_90_plus - Math.max(0, r.overdue_total - (r.total_outstanding - r.current_outstanding)),
    r.overdue_total - (r.days_90_plus + Math.max(0, r.overdue_total - r.days_90_plus - (r.total_outstanding - r.current_outstanding - r.days_90_plus))),
    r.days_90_plus,
  ]

  // Recompute clean buckets from customer_details (more accurate)
  const sumCurrent  = r.customer_details.reduce((s, c) => s + c.current_outstanding, 0)
  const sum30_60    = r.customer_details.reduce((s, c) => s + c.days_30_60, 0)
  const sum60_90    = r.customer_details.reduce((s, c) => s + c.days_60_90, 0)
  const sum90Plus   = r.customer_details.reduce((s, c) => s + c.days_90_plus, 0)
  const buckets     = [sumCurrent, sum30_60, sum60_90, sum90Plus]
  const bucketLabels = ['Cari (0-30g)', '30-60g', '60-90g', '90+ gün']

  const healthCfg = HEALTH_CFG[r.aging_health]

  return (
    <div className="space-y-4">
      {/* ── Health narrative ─────────────────────────────────────────────── */}
      <FlowraAlert tone={healthCfg.tone} text={r.narrative} />

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FlowraKpiCard
          label="Toplam Açık Alacak"
          value={r.total_outstanding}
          sub={`${r.customer_details.length} müşteri`}
        />
        <FlowraKpiCard
          label="DSO (Gün)"
          rawValue={r.dso_portfolio !== null ? fmtNum(r.dso_portfolio, 1) : '—'}
          value={0}
          sub="Portföy ortalama"
        />
        <FlowraKpiCard
          label="Tahsilat Verimliliği"
          rawValue={r.collection_efficiency_pct !== null ? fmtPct(r.collection_efficiency_pct) : '—'}
          value={0}
          sub="Önceki aya göre"
        />
        <FlowraKpiCard
          label="Karşılık İhtiyacı"
          value={r.bad_debt_provision}
          sub="Şüpheli alacak tahmini"
          tone="negative"
        />
      </div>

      {/* ── Aging bucket bar chart ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
        <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Vade Dağılımı
        </div>

        {/* Stacked bar */}
        {totalOuts > 0 && (
          <div className="flex h-6 rounded overflow-hidden mb-3 gap-px">
            {buckets.map((amt, i) => {
              const pct = (amt / totalOuts) * 100
              if (pct < 0.5) return null
              return (
                <div
                  key={i}
                  style={{ width: `${pct}%`, background: BUCKET_BAR_COLOR[i] }}
                  title={`${bucketLabels[i]}: ${fmtTRY(amt)} (${fmtNum(pct, 1)}%)`}
                />
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {buckets.map((amt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ background: BUCKET_BAR_COLOR[i] }}
              />
              <div>
                <div className="text-[10px] text-[#64748b]">{bucketLabels[i]}</div>
                <div className="text-xs font-bold text-[#0f172a] tabular-nums">{fmtTRY(amt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── DSO trend ────────────────────────────────────────────────────── */}
      {r.dso_trend.length > 0 && (
        <div className="bg-white rounded-xl border border-[#f1f5f9] p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
            DSO Trendi (Son 6 Ay)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left px-0 py-1.5 text-[#94a3b8] font-medium">Dönem</th>
                  <th className="text-right px-2 py-1.5 text-[#94a3b8] font-medium">DSO (Gün)</th>
                  <th className="text-right px-2 py-1.5 text-[#94a3b8] font-medium">Ciro</th>
                  <th className="text-right px-2 py-1.5 text-[#94a3b8] font-medium">Tahsilat</th>
                  <th className="text-right px-0 py-1.5 text-[#94a3b8] font-medium">Tahsilat %</th>
                </tr>
              </thead>
              <tbody>
                {r.dso_trend.map((row: DSOTrend) => (
                  <tr key={row.year_month} className="border-b border-[#f8fafc] hover:bg-[#f8fafc]">
                    <td className="px-0 py-2 text-[#334155] font-medium">
                      {fmtMonthShort(row.year_month)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <span className={
                        row.dso_days === null ? 'text-[#94a3b8]' :
                        row.dso_days > 90 ? 'text-neg font-bold' :
                        row.dso_days > 60 ? 'text-[#b45309] font-semibold' :
                        'text-[#15803d] font-semibold'
                      }>
                        {row.dso_days !== null ? `${fmtNum(row.dso_days, 1)}g` : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[#475569]">
                      {fmtTRY(row.revenue)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-[#475569]">
                      {fmtTRY(row.collected)}
                    </td>
                    <td className="px-0 py-2 text-right tabular-nums">
                      {row.collection_rate_pct !== null
                        ? <span className={row.collection_rate_pct >= 80 ? 'text-[#15803d] font-bold' : 'text-[#b45309] font-bold'}>
                            {fmtPct(row.collection_rate_pct)}
                          </span>
                        : <span className="text-[#94a3b8]">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Customer risk table ───────────────────────────────────────────── */}
      {r.customer_details.length > 0 && (
        <div className="bg-white rounded-xl border border-[#f1f5f9] overflow-hidden">
          <div className="px-4 pt-3 pb-1">
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
              Müşteri Risk Tablosu
            </div>
            {r.critical_customer_count > 0 && (
              <div className="text-[10px] text-neg font-semibold mt-0.5">
                {r.critical_customer_count} kritik müşteri — acil aksiyon
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left px-4 py-2 text-[#94a3b8] font-medium">Müşteri</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Toplam</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium hidden sm:table-cell">Cari</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium hidden sm:table-cell">30-60g</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium hidden sm:table-cell">60-90g</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium hidden sm:table-cell">90+g</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">En Eski</th>
                  <th className="text-right px-2 py-2 text-[#94a3b8] font-medium">Tahsilat %</th>
                  <th className="text-left px-2 py-2 text-[#94a3b8] font-medium">Risk</th>
                </tr>
              </thead>
              <tbody>
                {r.customer_details.slice(0, 20).map((c: CustomerAgingDetail) => {
                  const riskCfg = RISK_CFG[c.risk_tier]
                  return (
                    <tr
                      key={`${c.customer_id ?? c.customer_name}`}
                      className="border-b border-[#f8fafc] hover:bg-[#f8fafc]"
                    >
                      <td className="px-4 py-2 text-[#334155] font-medium truncate max-w-[140px]">
                        {c.customer_name}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-black text-[#0f172a]">
                        {fmtTRY(c.total_outstanding)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#64748b] hidden sm:table-cell">
                        {fmtTRY(c.current_outstanding)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#64748b] hidden sm:table-cell">
                        {fmtTRY(c.days_30_60)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#64748b] hidden sm:table-cell">
                        {fmtTRY(c.days_60_90)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">
                        <span className={c.days_90_plus > 0 ? 'text-neg font-bold' : 'text-[#64748b]'}>
                          {fmtTRY(c.days_90_plus)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#475569]">
                        {c.oldest_invoice_days > 0 ? `${c.oldest_invoice_days}g` : '—'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <span className={
                          c.recovery_probability_pct >= 70 ? 'text-[#15803d] font-bold' :
                          c.recovery_probability_pct >= 40 ? 'text-[#b45309] font-bold' :
                          'text-neg font-bold'
                        }>
                          {fmtPct(c.recovery_probability_pct)}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded ${riskCfg.bg} ${riskCfg.text}`}>
                          {riskCfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {r.customer_details.length > 20 && (
            <div className="px-4 py-2 text-[10px] text-[#94a3b8]">
              +{r.customer_details.length - 20} müşteri daha mevcut
            </div>
          )}

          {/* Provision summary */}
          <div className="border-t border-[#f1f5f9] px-4 py-2.5 flex items-center justify-between bg-[#fafafa]">
            <div>
              <div className="text-[10px] text-[#64748b]">Şüpheli Alacak Karşılığı</div>
              <div className="text-xs font-black text-neg tabular-nums">{fmtTRY(r.bad_debt_provision)}</div>
            </div>
            {r.weighted_age_days !== null && (
              <div className="text-right">
                <div className="text-[10px] text-[#64748b]">Ağırlıklı Vade Yaşı</div>
                <div className="text-xs font-bold text-[#475569]">{fmtNum(r.weighted_age_days, 1)} gün</div>
              </div>
            )}
            <div className="text-right">
              <div className="text-[10px] text-[#64748b]">Konsantrasyon (HHI)</div>
              <div className="text-xs font-bold text-[#475569]">{fmtNum(r.concentration_hhi, 4)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
