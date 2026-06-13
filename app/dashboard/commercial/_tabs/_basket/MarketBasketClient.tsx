'use client'
// ── MarketBasketClient — Sepet Analizi / Çapraz Satış Fırsatları ──────────────
// Fetches /api/commercial/market-basket via TanStack Query.
// Features:
//   • Summary stats: toplam işlem / ortalama ürün/sepet / bulunan kural sayısı
//   • Top cross-sell table: "X alıyorsa → Y de al" with confidence% + strength badge
//   • Full rules table with lift values
//   • Empty state when no rules found
//   • Skeleton loading state

import { useQuery } from '@tanstack/react-query'
import type {
  buildAssociationRules,
  findTopCrossSellOpportunities,
} from '@/lib/services/commercial/market-basket.service'

// ── Formatters ────────────────────────────────────────────────────────────────

const PCT_FMT = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function fmtPct(n: number): string {
  return `%${PCT_FMT.format(n)}`
}

function fmtLift(n: number | null): string {
  if (n === null) return '—'
  return n.toFixed(2)
}

// ── Strength badge ────────────────────────────────────────────────────────────

type Strength = 'strong' | 'moderate' | 'weak' | 'none' | 'insufficient_data'

const STRENGTH_CFG: Record<Strength, { label: string; bg: string; text: string }> = {
  strong:            { label: 'Güçlü',       bg: 'bg-emerald-100', text: 'text-emerald-800' },
  moderate:          { label: 'Orta',         bg: 'bg-teal-100',    text: 'text-teal-700'    },
  weak:              { label: 'Zayıf',        bg: 'bg-yellow-100',  text: 'text-yellow-700'  },
  none:              { label: 'Yok',          bg: 'bg-[#f1f5f9]',   text: 'text-[#94a3b8]'  },
  insufficient_data: { label: 'Yetersiz',    bg: 'bg-[#f1f5f9]',   text: 'text-[#94a3b8]'  },
}

function StrengthBadge({ strength }: { strength: Strength }) {
  const cfg = STRENGTH_CFG[strength]
  return (
    <span className={`inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-3 space-y-3 animate-pulse">
      <div className="h-3 w-64 bg-[#f1f5f9] rounded" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-[#f1f5f9] rounded" />
        ))}
      </div>
      <div className="h-40 bg-[#f8fafc] rounded" />
    </div>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketBasketReport {
  association_rules: ReturnType<typeof buildAssociationRules>
  top_cross_sell:    ReturnType<typeof findTopCrossSellOpportunities>
  summary: {
    total_transactions:        number
    total_products:            number
    unique_pairs_found:        number
    avg_items_per_transaction: number | null
    rules_found:               number
  }
}

interface ApiResponse {
  report: MarketBasketReport
}

interface Props {
  companyId: string
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarketBasketClient({ companyId }: Props) {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['market-basket', companyId],
    queryFn: async () => {
      const res = await fetch('/api/commercial/market-basket')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<ApiResponse>
    },
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  if (isLoading) return <Skeleton />
  if (error)     return null

  const report = data?.report

  // Empty state — not enough data
  if (!report || report.summary.rules_found === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft px-4 py-6 text-center">
        <p className="text-sm text-[#94a3b8]">
          Yeterli ortak satış verisi bulunamadı (en az 20 çoklu satış gerekli)
        </p>
        <p className="text-[10px] text-[#cbd5e1] mt-1">
          Aynı faturada birden fazla ürün bulunan satışlara ihtiyaç duyulur.
        </p>
      </div>
    )
  }

  const { summary, top_cross_sell, association_rules } = report

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#f1f5f9]">
        <span className="text-[0.65rem] font-bold uppercase tracking-wider text-[#94a3b8]">
          Sepet Analizi — Çapraz Satış Fırsatları
        </span>
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-0 divide-x divide-[#e8eaef] border-b border-[#e8eaef]">
        <div className="p-3">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Toplam İşlem
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-[#0f172a]">
            {summary.total_transactions.toLocaleString('tr-TR')}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            çoklu ürünlü satış
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Toplam Ürün
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-[#0f172a]">
            {summary.total_products}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            birden fazla kez satılan
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Ort. Ürün/Sepet
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-[#0f172a]">
            {summary.avg_items_per_transaction !== null
              ? summary.avg_items_per_transaction.toFixed(1)
              : '—'}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            ürün / işlem
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Eşsiz Çift
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-[#0f172a]">
            {summary.unique_pairs_found}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            ürün kombinasyonu
          </div>
        </div>
        <div className="p-3">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-1">
            Kural Sayısı
          </div>
          <div className="text-lg font-bold tabular-nums leading-none text-emerald-700">
            {summary.rules_found}
          </div>
          <div className="text-[9px] text-[#94a3b8] mt-0.5">
            anlamlı ilişki
          </div>
        </div>
      </div>

      {/* Top cross-sell opportunities table */}
      {top_cross_sell.length > 0 && (
        <div className="px-4 pt-3 pb-1">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            En İyi Çapraz Satış Fırsatları
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Alınan Ürün
                  </th>
                  <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Öneri
                  </th>
                  <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Güven
                  </th>
                  <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Lift
                  </th>
                  <th className="text-center px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Güç
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {top_cross_sell.map((opp, idx) => (
                  <tr key={idx} className="hover:bg-[#f8fafc]/60">
                    <td className="px-2 py-2 font-semibold text-[#0f172a] max-w-[160px] truncate" title={opp.if_buying}>
                      {opp.if_buying}
                    </td>
                    <td className="px-2 py-2 text-[#334155] max-w-[160px] truncate" title={opp.also_buy}>
                      <span className="text-[#94a3b8] mr-1">→</span>
                      {opp.also_buy}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-emerald-700">
                      {fmtPct(opp.confidence_pct)}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums font-bold ${
                      opp.lift === null ? 'text-[#94a3b8]'
                      : opp.lift >= 2 ? 'text-emerald-700'
                      : opp.lift >= 1.5 ? 'text-teal-700'
                      : opp.lift > 1 ? 'text-[#334155]'
                      : 'text-[#94a3b8]'
                    }`}>
                      {fmtLift(opp.lift)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <StrengthBadge strength={opp.strength} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full association rules table */}
      {association_rules.length > top_cross_sell.length && (
        <div className="px-4 pt-3 pb-1 border-t border-[#f1f5f9] mt-2">
          <div className="text-[0.6rem] font-bold uppercase tracking-wider text-[#94a3b8] mb-2">
            Tüm İlişki Kuralları
            <span className="font-normal normal-case ml-1 text-[#cbd5e1]">
              (lift = 1 = bağımsız)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#f1f5f9]">
                  <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Öncül
                  </th>
                  <th className="text-left px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Ardıl
                  </th>
                  <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Destek
                  </th>
                  <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Güven
                  </th>
                  <th className="text-right px-2 py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">
                    Lift
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f8fafc]">
                {association_rules.slice(0, 20).map((rule, idx) => (
                  <tr key={idx} className="hover:bg-[#f8fafc]/60">
                    <td className="px-2 py-1.5 text-[#0f172a] font-medium max-w-[140px] truncate">
                      {rule.antecedent}
                    </td>
                    <td className="px-2 py-1.5 text-[#334155] max-w-[140px] truncate">
                      {rule.consequent}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[#64748b]">
                      {fmtPct(rule.support_pct)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-[#334155]">
                      {fmtPct(rule.confidence_pct)}
                    </td>
                    <td className={`px-2 py-1.5 text-right tabular-nums font-bold ${
                      rule.lift === null ? 'text-[#94a3b8]'
                      : rule.lift >= 2 ? 'text-emerald-700'
                      : rule.lift >= 1.5 ? 'text-teal-700'
                      : rule.lift > 1 ? 'text-[#334155]'
                      : 'text-[#94a3b8]'
                    }`}>
                      {fmtLift(rule.lift)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {association_rules.length > 20 && (
            <div className="text-[9px] text-[#94a3b8] py-2 text-center">
              +{association_rules.length - 20} kural daha · En yüksek lift ilk sırada
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-2 border-t border-[#f8fafc] text-[9px] text-[#cbd5e1]">
        Destek ≥%5 · Güven ≥%20 · Son 12 ay satış verisi · Lift &gt; 1 = pozitif ilişki · Lift = 1 = bağımsız · Lift &lt; 1 = negatif ilişki
      </div>
    </div>
  )
}
