'use client'

// ── SupplierPaymentTermsClient — Supplier Payment Terms Analytics ─────────────
// Client component — fetches /api/commercial/supplier-payment-terms on mount.
// Shows DPO, outstanding balance, payment score, top creditors table,
// timing breakdown stacked bar, 6-month trend, and a collapsible all-suppliers
// table.

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtDate } from '@/lib/format'
import type {
  SupplierPaymentSummary,
  SupplierProfile,
  SupplierPaymentClass,
} from '@/lib/services/commercial/supplier-payment-terms.service'

// ── Badge / color helpers ──────────────────────────────────────────────────────

const CLASS_BADGE: Record<SupplierPaymentClass, string> = {
  excellent: 'bg-[#dcfce7] text-[#15803d]',
  good:      'bg-[#dbeafe] text-[#1d4ed8]',
  average:   'bg-[#fef9c3] text-[#854d0e]',
  poor:      'bg-[#fee2e2] text-[#991b1b]',
}

const CLASS_LABEL: Record<SupplierPaymentClass, string> = {
  excellent: 'Mükemmel',
  good:      'İyi',
  average:   'Orta',
  poor:      'Zayıf',
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-[#22c55e]'
  if (score >= 65) return 'bg-[#3b82f6]'
  if (score >= 50) return 'bg-[#eab308]'
  return 'bg-[#ef4444]'
}

function scoreTextColor(score: number): string {
  if (score >= 80) return 'text-[#15803d]'
  if (score >= 65) return 'text-[#1d4ed8]'
  if (score >= 50) return 'text-[#854d0e]'
  return 'text-[#991b1b]'
}

// ── Timing breakdown bar ───────────────────────────────────────────────────────

const TIMING_COLORS = {
  early:       { bg: 'bg-[#22c55e]', label: 'Erken' },
  on_time:     { bg: 'bg-[#3b82f6]', label: 'Zamanında' },
  late_30:     { bg: 'bg-[#eab308]', label: 'Geç 1-30' },
  late_60:     { bg: 'bg-[#f97316]', label: 'Geç 31-60' },
  late_90plus: { bg: 'bg-[#ef4444]', label: 'Geç 60+' },
  unpaid:      { bg: 'bg-[#94a3b8]', label: 'Ödenmedi' },
} as const

type TimingKey = keyof typeof TIMING_COLORS

function AggregateTimingBar({ suppliers }: { suppliers: SupplierProfile[] }) {
  const totals = { early: 0, on_time: 0, late_30: 0, late_60: 0, late_90plus: 0, unpaid: 0 }
  for (const s of suppliers) {
    totals.early       += s.timing_breakdown.early
    totals.on_time     += s.timing_breakdown.on_time
    totals.late_30     += s.timing_breakdown.late_30
    totals.late_60     += s.timing_breakdown.late_60
    totals.late_90plus += s.timing_breakdown.late_90plus
    totals.unpaid      += s.timing_breakdown.unpaid
  }

  const grand = Object.values(totals).reduce((s, n) => s + n, 0)
  if (grand === 0) return <div className="text-xs text-[#94a3b8]">Veri yok</div>

  const segments = (Object.keys(totals) as TimingKey[])
    .map(k => ({ key: k, count: totals[k], pct: (totals[k] / grand) * 100 }))
    .filter(s => s.count > 0)

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-5 rounded overflow-hidden w-full">
        {segments.map(s => (
          <div
            key={s.key}
            className={`${TIMING_COLORS[s.key].bg} transition-all`}
            style={{ width: `${s.pct}%` }}
            title={`${TIMING_COLORS[s.key].label}: ${s.count} (${s.pct.toFixed(0)}%)`}
          />
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {segments.map(s => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] text-[#64748b]">
            <span className={`inline-block w-2 h-2 rounded-sm ${TIMING_COLORS[s.key].bg}`} />
            {TIMING_COLORS[s.key].label}: <strong>{s.pct.toFixed(0)}%</strong>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Trend text ─────────────────────────────────────────────────────────────────

function TrendAnalysis({
  trend,
}: {
  trend: SupplierPaymentSummary['payment_trend']
}) {
  const withData = trend.filter(t => t.avg_days_to_pay !== null)
  if (withData.length < 2) {
    return <span className="text-[#94a3b8]">Yeterli veri yok</span>
  }

  const first = withData[0].avg_days_to_pay!
  const last  = withData[withData.length - 1].avg_days_to_pay!
  const delta = last - first

  const improving = delta < -2
  const worsening = delta > 2

  const arrow = improving ? '↓' : worsening ? '↑' : '→'
  const color = improving
    ? 'text-[#15803d]'
    : worsening
    ? 'text-[#991b1b]'
    : 'text-[#64748b]'

  const desc = improving
    ? 'Ödeme süresi iyileşiyor'
    : worsening
    ? 'Ödeme süresi kötüleşiyor'
    : 'Ödeme süresi sabit'

  return (
    <span className={`font-semibold ${color}`}>
      {arrow} {desc} ({delta > 0 ? '+' : ''}{Math.round(delta)} gün)
    </span>
  )
}

// ── Supplier row component ─────────────────────────────────────────────────────

function SupplierRow({ s }: { s: SupplierProfile }) {
  return (
    <tr className="hover:bg-[#f8fafc]/60 border-b border-[#f1f5f9] last:border-0">
      <td className="px-4 py-2.5 font-medium text-[#334155] truncate max-w-[160px]">
        {s.supplier_name}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[#64748b]">
        {fmtTRY(s.total_amount_try)}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${s.outstanding_try > 0 ? 'text-[#991b1b]' : 'text-[#94a3b8]'}`}>
        {s.outstanding_try > 0 ? fmtTRY(s.outstanding_try) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[#64748b]">
        {s.avg_days_to_pay !== null ? `${s.avg_days_to_pay} gün` : '—'}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`text-xs font-black tabular-nums ${scoreTextColor(s.payment_score)}`}>
          {s.payment_score}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${CLASS_BADGE[s.payment_class]}`}>
          {CLASS_LABEL[s.payment_class]}
        </span>
      </td>
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

interface ApiResponse {
  summary: SupplierPaymentSummary
}

export function SupplierPaymentTermsClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['supplier-payment-terms', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/supplier-payment-terms')
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: 'Veri alınamadı' })) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light rounded p-4">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-neg-text mb-1">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-neg-text">
          Veri yüklenemedi: {error instanceof Error ? error.message : 'Bilinmeyen hata'}
        </div>
      </div>
    )
  }

  const summary = data?.summary

  if (!summary || summary.total_suppliers === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-[#94a3b8]">Tedarikçi verisi bulunamadı</div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-[10px] text-[#94a3b8] mt-0.5">
          {summary.total_suppliers} tedarikçi ·{' '}
          {summary.excellent_suppliers > 0 && `${summary.excellent_suppliers} mükemmel`}
          {summary.poor_suppliers > 0 && ` · ${summary.poor_suppliers} zayıf`}
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] border-b border-[#e8eaef]">
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            DPO (Ort. Ödeme)
          </div>
          <div className="text-xl font-black tabular-nums text-[#0f172a]">
            {summary.overall_dpo !== null ? `${summary.overall_dpo} gün` : '—'}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Toplam Bekleyen
          </div>
          <div className={`text-xl font-black tabular-nums ${summary.total_outstanding_try > 0 ? 'text-[#991b1b]' : 'text-[#94a3b8]'}`}>
            {summary.total_outstanding_try > 0 ? fmtTRY(summary.total_outstanding_try) : '—'}
          </div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">
            Ödeme Skoru
          </div>
          <div className={`text-xl font-black tabular-nums ${scoreTextColor(summary.overall_payment_score)}`}>
            {summary.overall_payment_score}
          </div>
        </div>
      </div>

      {/* ── Score bar ───────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Genel Ödeme Skoru
          </span>
          <span className={`text-xs font-black tabular-nums ${scoreTextColor(summary.overall_payment_score)}`}>
            {summary.overall_payment_score} / 100
          </span>
        </div>
        <div className="h-2.5 bg-[#f1f5f9] rounded-full overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all ${scoreBarColor(summary.overall_payment_score)}`}
            style={{ width: `${summary.overall_payment_score}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-[#94a3b8]">
          <span>0 — Zayıf</span>
          <span>50 — Orta</span>
          <span>65 — İyi</span>
          <span>80 — Mükemmel</span>
        </div>
      </div>

      {/* ── Top creditors ───────────────────────────────────────────────────── */}
      {summary.top_creditors.length > 0 && (
        <div className="border-b border-[#e8eaef]">
          <div className="px-4 py-2.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
              En Büyük Alacaklılar (Bekleyen Borç)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[500px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tedarikçi</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Bekleyen</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ort. Gün</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Skor</th>
                  <th className="text-center px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Sınıf</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {summary.top_creditors.map(s => (
                  <SupplierRow key={s.supplier_name} s={s} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Timing breakdown ────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Ödeme Zamanlaması Dağılımı
        </div>
        <AggregateTimingBar suppliers={summary.all_suppliers} />
      </div>

      {/* ── 6-month trend ───────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-2">
          Son 6 Ay Trendi
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mb-2">
          {summary.payment_trend.map(t => (
            <span key={t.month} className="text-[#64748b]">
              <strong className="text-[#334155]">{t.month.slice(5)}</strong>
              {': '}
              {t.avg_days_to_pay !== null ? `${t.avg_days_to_pay} gün` : '—'}
              {t.late_count > 0 && (
                <span className="text-[#ef4444] ml-1">({t.late_count} geç)</span>
              )}
            </span>
          ))}
        </div>
        <div className="text-xs">
          <TrendAnalysis trend={summary.payment_trend} />
        </div>
      </div>

      {/* ── All suppliers (collapsible) ─────────────────────────────────────── */}
      <details className="group">
        <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between select-none hover:bg-[#f8fafc] transition-colors">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">
            Tüm Tedarikçiler ({summary.all_suppliers.length})
          </span>
          <span className="text-xs text-[#94a3b8] group-open:rotate-90 transition-transform inline-block">
            ▶
          </span>
        </summary>
        <div className="overflow-x-auto border-t border-[#f1f5f9]">
          <table className="w-full text-xs min-w-[500px]">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                <th className="text-left px-4 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Tedarikçi</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Toplam</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Bekleyen</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Ort. Gün</th>
                <th className="text-right px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Skor</th>
                <th className="text-center px-3 py-2 text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Sınıf</th>
              </tr>
            </thead>
            <tbody>
              {summary.all_suppliers.map(s => (
                <SupplierRow key={s.supplier_name} s={s} />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
