'use client'
// ── PriceOptimizationClient — Fiyat Optimizasyonu bölümü ─────────────────────
// Client island: fetches /api/commercial/price-optimization via TanStack Query,
// renders discount analytics, price realization, and per-product recommendations.

import { useQuery } from '@tanstack/react-query'
import type {
  PriceOptimizationReport,
  classifyDiscountLevel,
  classifyPriceConsistency,
  computeOptimalPriceRecommendation,
} from '@/lib/services/commercial/price-optimization.service'

type DiscountLevel = ReturnType<typeof classifyDiscountLevel>
type PriceConsistency = ReturnType<typeof classifyPriceConsistency>
type PriceRecommendation = ReturnType<typeof computeOptimalPriceRecommendation>

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return '—'
  return `₺${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `%${n.toFixed(1)}`
}

function discountLevelChip(level: DiscountLevel): { label: string; cls: string } {
  switch (level) {
    case 'no_discount': return { label: 'İskonto Yok', cls: 'bg-pos-light text-pos-text' }
    case 'minimal':     return { label: 'Minimal',     cls: 'bg-[#ecfdf5] text-[#065f46]' }
    case 'standard':    return { label: 'Standart',    cls: 'bg-[#fffbeb] text-[#92400e]' }
    case 'heavy':       return { label: 'Yüksek',      cls: 'bg-[#fff7ed] text-[#9a3412]' }
    case 'excessive':   return { label: 'Aşırı',       cls: 'bg-neg-light text-neg-text' }
    default:            return { label: '—',            cls: 'bg-[#f1f5f9] text-[#64748b]' }
  }
}

function consistencyChip(level: PriceConsistency): { label: string; cls: string } {
  switch (level) {
    case 'very_consistent':   return { label: 'Tutarlı',      cls: 'bg-pos-light text-pos-text' }
    case 'consistent':        return { label: 'İyi',          cls: 'bg-[#ecfdf5] text-[#065f46]' }
    case 'moderate_variation':return { label: 'Orta',         cls: 'bg-[#fffbeb] text-[#92400e]' }
    case 'high_variation':    return { label: 'Değişken',     cls: 'bg-[#fff7ed] text-[#9a3412]' }
    case 'erratic':           return { label: 'Tutarsız',     cls: 'bg-neg-light text-neg-text' }
    default:                  return { label: '—',            cls: 'bg-[#f1f5f9] text-[#64748b]' }
  }
}

function strategyChip(strategy: PriceRecommendation['strategy']): { label: string; cls: string } {
  switch (strategy) {
    case 'maintain_list':        return { label: 'Liste Koru',      cls: 'bg-pos-light text-pos-text' }
    case 'standardize_discount': return { label: 'İskonto Standart',cls: 'bg-[#fffbeb] text-[#92400e]' }
    case 'reduce_list':          return { label: 'Liste Düşür',     cls: 'bg-neg-light text-neg-text' }
  }
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className="h-16 bg-[#f1f5f9] rounded" />
      <div className="h-4 bg-[#f1f5f9] rounded w-3/4" />
      <div className="h-48 bg-[#f1f5f9] rounded" />
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ApiResponse {
  report: PriceOptimizationReport
}

export function PriceOptimizationClient() {
  const { data, isLoading, error } = useQuery<ApiResponse>({
    queryKey: ['price-optimization'],
    queryFn:  () => fetch('/api/commercial/price-optimization').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    }),
    staleTime: 60 * 60 * 1_000,
  })

  if (isLoading) return <Skeleton />
  if (error || !data?.report) return null

  const report = data.report

  if (report.per_product.length === 0) {
    return (
      <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm px-6 py-8 text-center text-sm text-[#94a3b8]">
        Son dönemde fiyat verisi bulunan ürün yok. Satış kaydedildikçe optimizasyon analizi burada görünür.
      </div>
    )
  }

  // Sort: excessive discount first, then heavy, then by revenue_lost desc
  const sortedProducts = [...report.per_product].sort((a, b) => {
    const discountOrder = ['excessive','heavy','standard','minimal','no_discount','insufficient_data']
    const aIdx = discountOrder.indexOf(a.discount_level)
    const bIdx = discountOrder.indexOf(b.discount_level)
    if (aIdx !== bIdx) return aIdx - bIdx
    return b.revenue_lost_try - a.revenue_lost_try
  })

  const realizationPct = report.price_realization_rate_pct
  const realizationColor =
    realizationPct === null      ? 'text-[#94a3b8]' :
    realizationPct >= 97         ? 'text-pos-text' :
    realizationPct >= 85         ? 'text-warn-text' :
    'text-neg-text'

  return (
    <div className="bg-white border border-[#e8eaef] rounded-xl shadow-soft shadow-sm">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Fiyat Optimizasyonu</div>
          <div className="text-xs text-[#64748b] mt-0.5">
            Son {report.period_months} ay · {report.per_product.length} ürün analiz edildi
          </div>
        </div>
        {realizationPct !== null && (
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Fiyat Gerçekleşme</div>
            <div className={`font-extrabold tabular-nums text-sm ${realizationColor}`}>
              {fmtPct(realizationPct)}
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 border-b border-[#f1f5f9]">
        {[
          {
            label: 'Ort. İskonto Oranı',
            value: report.avg_discount_rate_pct !== null ? fmtPct(report.avg_discount_rate_pct) : '—',
            sub:   report.avg_discount_rate_pct !== null
              ? (report.avg_discount_rate_pct > 20 ? 'Yüksek iskonto riski' : 'Kontrol altında')
              : 'Veri yok',
            color: report.avg_discount_rate_pct !== null && report.avg_discount_rate_pct > 20
              ? 'text-neg-text' : 'text-pos-text',
          },
          {
            label: 'İskonto Frekansı',
            value: report.discount_frequency_pct !== null ? fmtPct(report.discount_frequency_pct) : '—',
            sub:   'İskontolu satış oranı',
            color: report.discount_frequency_pct !== null && report.discount_frequency_pct > 50
              ? 'text-warn-text' : 'text-[#334155]',
          },
          {
            label: 'Kayıp Gelir',
            value: report.revenue_lost_to_discounts_try > 0
              ? fmtTRY(report.revenue_lost_to_discounts_try) : '—',
            sub:   'İskonto kaynaklı',
            color: report.revenue_lost_to_discounts_try > 0 ? 'text-neg-text' : 'text-pos-text',
          },
        ].map((card, i) => (
          <div key={card.label} className={`px-4 py-2.5 ${i === 0 ? 'rounded-bl' : ''}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[#94a3b8] mb-0.5">{card.label}</div>
            <div className={`text-lg font-extrabold tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Narrative */}
      {report.narrative && (
        <div className="px-4 py-2.5 border-b border-[#f1f5f9] bg-[#fafafa]">
          <p className="text-xs text-[#64748b] leading-relaxed">{report.narrative}</p>
        </div>
      )}

      {/* Product table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Ürün</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Liste / Ort.</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Tavsiye</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">İskonto</th>
              <th className="text-center px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Tutarlılık</th>
              <th className="text-center px-4 py-2 text-[9px] font-bold uppercase tracking-wider text-[#94a3b8]">Strateji</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map(p => {
              const chip   = discountLevelChip(p.discount_level)
              const consis = consistencyChip(p.price_consistency)
              const strat  = strategyChip(p.recommendation.strategy)

              return (
                <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                  {/* Product name */}
                  <td className="px-4 py-2">
                    <div className="font-semibold text-[#0f172a]">{p.product_name}</div>
                    <div className="text-[10px] text-[#94a3b8]">{p.total_units_sold} adet · {fmtTRY(p.total_revenue_try)}</div>
                  </td>

                  {/* List / avg actual price */}
                  <td className="px-4 py-2 text-right tabular-nums text-[#334155]">
                    <div>{fmtPrice(p.list_price)}</div>
                    <div className="text-[10px] text-[#94a3b8]">{fmtPrice(p.avg_actual_price)}</div>
                  </td>

                  {/* Recommended price */}
                  <td className="px-4 py-2 text-right tabular-nums">
                    <span className="font-semibold text-[#0f172a]">
                      {fmtPrice(p.recommendation.recommended_price)}
                    </span>
                  </td>

                  {/* Discount level chip */}
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${chip.cls}`}>
                      {chip.label}
                    </span>
                    {p.avg_discount_pct !== null && (
                      <div className="text-[10px] text-[#94a3b8] mt-0.5">{fmtPct(p.avg_discount_pct)}</div>
                    )}
                  </td>

                  {/* Price consistency */}
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${consis.cls}`}>
                      {consis.label}
                    </span>
                  </td>

                  {/* Strategy badge */}
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${strat.cls}`}>
                      {strat.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {report.below_floor_sales_count > 0 && (
        <div className="px-4 py-2.5 border-t border-[#f1f5f9] bg-[#fef2f2]">
          <p className="text-xs text-neg-text font-medium">
            ⚠ {report.below_floor_sales_count} satış minimum karlılık eşiğinin altında gerçekleşti.
          </p>
        </div>
      )}

      <div className="px-4 py-2 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8]">
        Tavsiye fiyat stratejisi: iskonto &lt;%5 → liste koru · %5-20 → standart iskonto · &gt;%20 → liste fiyatını güncelle.
      </div>
    </div>
  )
}
