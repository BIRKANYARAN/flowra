'use client'

// ── SupplierTermsClient — Supplier Payment Terms Optimizer ────────────────────
// Analyzes vendor payment behaviour, early payment discount costs, and DPO
// opportunities for Turkish SMEs.

import { useQuery } from '@tanstack/react-query'
import { fmtTRY, fmtPct } from '@/lib/format'
import type {
  classifyPaymentBehavior,
  classifyEarlyPaymentDecision,
} from '@/lib/services/commercial/supplier-terms.service'

// ── Types ──────────────────────────────────────────────────────────────────────

type PaymentBehavior = ReturnType<typeof classifyPaymentBehavior>
type EarlyPaymentDecision = ReturnType<typeof classifyEarlyPaymentDecision>

interface VendorRow {
  vendor_name: string
  total_spend: number
  transaction_count: number
  avg_days_to_pay: number | null
  payment_behavior: PaymentBehavior | null
  trust_score: number
  on_time_rate: number
  dpo_opportunity: number
}

interface CompanySummary {
  total_vendors: number
  avg_dpo: number | null
  vendor_health_score: number | null
  total_dpo_opportunity: number
  payment_behavior_distribution: {
    early_payer: number
    on_time: number
    slightly_late: number
    late: number
    very_late: number
  }
}

interface EarlyPaymentAnalysis {
  default_borrowing_rate: number
  cost_of_2_10_net_30: number | null
  decision_2_10_net_30: EarlyPaymentDecision
  cost_of_1_10_net_30: number | null
  decision_1_10_net_30: EarlyPaymentDecision
}

interface Report {
  vendors: VendorRow[]
  company_summary: CompanySummary
  early_payment_analysis: EarlyPaymentAnalysis
}

interface ApiResponse {
  report: Report
}

// ── Badge helpers ──────────────────────────────────────────────────────────────

const BEHAVIOR_BADGE: Record<PaymentBehavior, { cls: string; label: string }> = {
  early_payer:   { cls: 'bg-[#dcfce7] text-[#15803d]',   label: 'Erken Ödeyen' },
  on_time:       { cls: 'bg-[#dbeafe] text-[#1d4ed8]',   label: 'Zamanında' },
  slightly_late: { cls: 'bg-[#fef9c3] text-[#854d0e]',   label: 'Hafif Geç' },
  late:          { cls: 'bg-[#ffedd5] text-[#c2410c]',   label: 'Geç' },
  very_late:     { cls: 'bg-[#fee2e2] text-[#991b1b]',   label: 'Çok Geç' },
}

const DECISION_BADGE: Record<EarlyPaymentDecision, { cls: string; label: string }> = {
  take_discount:     { cls: 'bg-[#dcfce7] text-[#15803d]', label: 'İndirimi Al' },
  skip_discount:     { cls: 'bg-[#fee2e2] text-[#991b1b]', label: 'Geç' },
  insufficient_data: { cls: 'bg-[#f1f5f9] text-[#64748b]', label: 'Veri Yok' },
}

function healthScoreColor(score: number): string {
  if (score >= 75) return 'text-[#15803d]'
  if (score >= 55) return 'text-[#1d4ed8]'
  if (score >= 35) return 'text-[#854d0e]'
  return 'text-[#991b1b]'
}

function healthBarColor(score: number): string {
  if (score >= 75) return 'bg-[#22c55e]'
  if (score >= 55) return 'bg-[#3b82f6]'
  if (score >= 35) return 'bg-[#eab308]'
  return 'bg-[#ef4444]'
}

// ── Early payment decision card ────────────────────────────────────────────────

function EarlyPaymentCard({
  title,
  cost,
  decision,
  borrowingRate,
}: {
  title: string
  cost: number | null
  decision: EarlyPaymentDecision
  borrowingRate: number
}) {
  const badge = DECISION_BADGE[decision]
  return (
    <div className="border border-[#e8eaef] rounded p-3 flex flex-col gap-1">
      <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">{title}</div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-bold tabular-nums text-[#0f172a]">
            {cost !== null ? `%${cost.toFixed(2)}` : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8]">Yıllık maliyet eşdeğeri</div>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      {cost !== null && (
        <div className="text-[10px] text-[#64748b] mt-1">
          {decision === 'take_discount'
            ? `İndirim maliyeti (${cost.toFixed(1)}%) > Borçlanma oranı (%${borrowingRate}) → erken ödeme avantajlı`
            : `İndirim maliyeti (${cost.toFixed(1)}%) ≤ Borçlanma oranı (%${borrowingRate}) → vadede ödeme avantajlı`}
        </div>
      )}
    </div>
  )
}

// ── Vendor table row ───────────────────────────────────────────────────────────

function VendorRow({ v }: { v: VendorRow }) {
  return (
    <tr className="hover:bg-[#f8fafc]/60 border-b border-[#f1f5f9] last:border-0">
      <td className="px-4 py-2.5 font-medium text-[#334155] truncate max-w-[160px]">
        {v.vendor_name}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-[#64748b]">
        {fmtTRY(v.total_spend)}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className={`text-xs font-bold tabular-nums ${healthScoreColor(v.trust_score)}`}>
          {v.trust_score.toFixed(0)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        {v.payment_behavior ? (
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${BEHAVIOR_BADGE[v.payment_behavior].cls}`}>
            {BEHAVIOR_BADGE[v.payment_behavior].label}
          </span>
        ) : (
          <span className="text-[#94a3b8] text-xs">—</span>
        )}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-semibold ${v.dpo_opportunity > 0 ? 'text-[#15803d]' : v.dpo_opportunity < 0 ? 'text-[#991b1b]' : 'text-[#94a3b8]'}`}>
        {v.dpo_opportunity !== 0 ? fmtTRY(Math.abs(v.dpo_opportunity)) : '—'}
        {v.dpo_opportunity > 0 ? ' ↑' : v.dpo_opportunity < 0 ? ' ↓' : ''}
      </td>
    </tr>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export function SupplierTermsClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['supplier-terms', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/supplier-terms')
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
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-3">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-[#94a3b8] animate-pulse">Yükleniyor…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-neg-light border border-neg-light rounded p-4">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-neg-text mb-1">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-neg-text">
          Veri yüklenemedi: {error instanceof Error ? error.message : 'Bilinmeyen hata'}
        </div>
      </div>
    )
  }

  const report = data?.report

  if (!report || report.company_summary.total_vendors === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft p-4 shadow-sm">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Tedarikçi Ödeme Koşulları
        </div>
        <div className="text-xs text-[#94a3b8]">Tedarikçi verisi bulunamadı</div>
      </div>
    )
  }

  const { company_summary: cs, early_payment_analysis: epa, vendors } = report
  const healthScore = cs.vendor_health_score

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Tedarikçi Ödeme Koşulları
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">
              {cs.total_vendors} tedarikçi · erken ödeme fırsat analizi
            </div>
          </div>
          {healthScore !== null && (
            <span className={`text-sm font-bold tabular-nums ${healthScoreColor(healthScore)}`}>
              Skor {healthScore.toFixed(0)}/100
            </span>
          )}
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-b border-[#e8eaef]">
        {/* Health score */}
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Sağlık Skoru
          </div>
          {healthScore !== null ? (
            <>
              <div className={`text-xl font-bold tabular-nums ${healthScoreColor(healthScore)}`}>
                {healthScore.toFixed(0)}
              </div>
              <div className="mt-1 h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${healthBarColor(healthScore)}`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-xl font-bold text-[#94a3b8]">—</div>
          )}
        </div>

        {/* Average DPO */}
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Ort. DPO
          </div>
          <div className="text-xl font-bold tabular-nums text-[#0f172a]">
            {cs.avg_dpo !== null ? `${cs.avg_dpo} gün` : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8]">Hedef: 45 gün</div>
        </div>

        {/* DPO Opportunity */}
        <div className="px-4 py-3 text-center">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            DPO Fırsatı
          </div>
          <div className={`text-xl font-bold tabular-nums ${cs.total_dpo_opportunity > 0 ? 'text-[#15803d]' : 'text-[#94a3b8]'}`}>
            {cs.total_dpo_opportunity > 0 ? fmtTRY(cs.total_dpo_opportunity) : '—'}
          </div>
          <div className="text-[10px] text-[#94a3b8]">Serbest kalacak nakit</div>
        </div>
      </div>

      {/* ── Early payment analysis ───────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#e8eaef]">
        <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
          Erken Ödeme İndirim Analizi
          <span className="ml-2 font-normal normal-case text-[10px]">
            (Borçlanma oranı: %{epa.default_borrowing_rate})
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EarlyPaymentCard
            title="2/10 Net 30"
            cost={epa.cost_of_2_10_net_30}
            decision={epa.decision_2_10_net_30}
            borrowingRate={epa.default_borrowing_rate}
          />
          <EarlyPaymentCard
            title="1/10 Net 30"
            cost={epa.cost_of_1_10_net_30}
            decision={epa.decision_1_10_net_30}
            borrowingRate={epa.default_borrowing_rate}
          />
        </div>
      </div>

      {/* ── Payment behavior distribution ───────────────────────────────────── */}
      {cs.total_vendors > 0 && (
        <div className="px-4 py-3 border-b border-[#e8eaef]">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            Ödeme Davranışı Dağılımı
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {(Object.entries(cs.payment_behavior_distribution) as [string, number][])
              .filter(([, count]) => count > 0)
              .map(([key, count]) => {
                const k = key as ReturnType<typeof classifyPaymentBehavior>
                const b = BEHAVIOR_BADGE[k]
                return (
                  <span key={key} className="flex items-center gap-1 text-xs text-[#64748b]">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${b.cls}`}>
                      {b.label}
                    </span>
                    <strong className="text-[#1e293b]">{count}</strong>
                  </span>
                )
              })}
          </div>
        </div>
      )}

      {/* ── Vendor table ────────────────────────────────────────────────────── */}
      {vendors.length > 0 && (
        <details className="group" open>
          <summary className="px-4 py-3 cursor-pointer list-none flex items-center justify-between select-none hover:bg-[#f8fafc] transition-colors border-b border-[#e8eaef]">
            <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
              Tedarikçi Tablosu ({vendors.length})
            </span>
            <span className="text-xs text-[#94a3b8] group-open:rotate-90 transition-transform inline-block">
              ▶
            </span>
          </summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e8eaef]">
                  <th className="text-left px-4 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Tedarikçi</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Harcama</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Güven</th>
                  <th className="text-center px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">Davranış</th>
                  <th className="text-right px-3 py-2 text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">DPO Fırsatı</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <VendorRow key={v.vendor_name} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}
