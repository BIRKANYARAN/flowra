'use client'
// ── PriceOptimizationClient — Fiyat Optimizasyonu bölümü ─────────────────────
// Client island: fetches /api/commercial/price-optimization via TanStack Query,
// renders a summary strip and a product pricing table.

import { useQuery } from '@tanstack/react-query'
import type {
  PriceOptimizationReport,
  ProductPricing,
  PriceElasticity,
} from '@/lib/services/commercial/price-optimization.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

const FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
function fmtTRY(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(1)}K`
  return `₺${FMT.format(Math.round(n))}`
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—'
  return `₺${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`
}

function marginColor(pct: number | null): string {
  if (pct === null) return 'text-[#94a3b8]'
  if (pct >= 30)    return 'text-pos-text'
  if (pct >= 15)    return 'text-warn-text'
  return 'text-neg'
}

function elasticityLabel(e: PriceElasticity): { label: string; cls: string } {
  if (e === 'elastic')   return { label: 'Esnek',        cls: 'bg-blue-50 text-blue-700' }
  if (e === 'inelastic') return { label: 'Esnek Değil',  cls: 'bg-pos-light text-pos-text' }
  return                         { label: 'Bilinmiyor',  cls: 'bg-[#f1f5f9] text-[#64748b]' }
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

  if (report.products.length === 0) {
    return (
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm px-6 py-8 text-center text-sm text-[#94a3b8]">
        Son 12 ayda fiyat verisi bulunan ürün yok. Satış kaydedildikçe optimizasyon analizi burada görünür.
      </div>
    )
  }

  // Sort: underpriced first, then by potential uplift desc
  const sortedProducts = [...report.products].sort((a, b) => {
    if (a.is_underpriced && !b.is_underpriced) return -1
    if (!a.is_underpriced && b.is_underpriced) return 1
    // secondary: by delta pct desc
    const aDelta = a.recommended_price_delta_pct ?? 0
    const bDelta = b.recommended_price_delta_pct ?? 0
    return bDelta - aDelta
  })

  return (
    <div className="bg-white border border-[#e2e8f0] rounded shadow-sm">
      {/* Header strip */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
        <div>
          <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Fiyat Optimizasyonu</div>
          <div className="text-xs text-[#64748b] mt-0.5">
            Son 12 ay · FIFO maliyet bazlı · {report.products.length} ürün analiz edildi
          </div>
        </div>
        {report.avg_margin_pct !== null && (
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-wide text-[#94a3b8]">Ort. Brüt Marj</div>
            <div className={`font-black tabular-nums text-sm ${marginColor(report.avg_margin_pct)}`}>
              %{report.avg_margin_pct.toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 divide-x divide-[#f1f5f9] border-b border-[#f1f5f9]">
        {[
          {
            label: 'Düşük Fiyatlı Ürün',
            value: report.underpriced_count > 0 ? String(report.underpriced_count) : '—',
            sub:   report.underpriced_count > 0 ? 'Tavsiye fiyatının altında' : 'Sorun yok',
            color: report.underpriced_count > 0 ? 'text-warn-text' : 'text-pos-text',
          },
          {
            label: 'Düşük Marjlı Ürün',
            value: report.low_margin_count > 0 ? String(report.low_margin_count) : '—',
            sub:   report.low_margin_count > 0 ? '<%15 brüt marj' : 'Tüm ürünler eşik üstünde',
            color: report.low_margin_count > 0 ? 'text-neg' : 'text-pos-text',
          },
          {
            label: 'Potansiyel Gelir Artışı',
            value: report.potential_revenue_uplift > 0 ? fmtTRY(report.potential_revenue_uplift) : '—',
            sub:   'Düşük fiyatlı ürünler için',
            color: report.potential_revenue_uplift > 0 ? 'text-pos-text' : 'text-[#94a3b8]',
          },
        ].map((card, i) => (
          <div key={card.label} className={`px-4 py-2.5 ${i === 0 ? 'rounded-bl' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mb-0.5">{card.label}</div>
            <div className={`text-lg font-black tabular-nums leading-none ${card.color}`}>{card.value}</div>
            <div className="text-[10px] text-[#94a3b8] mt-0.5">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Product table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#f1f5f9]">
              <th className="text-left px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürün</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Mevcut Fiyat</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Tavsiye Fiyat</th>
              <th className="text-right px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Brüt Marj %</th>
              <th className="text-center px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Esneklik</th>
              <th className="text-center px-4 py-2 text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Durum</th>
            </tr>
          </thead>
          <tbody>
            {sortedProducts.map((p: ProductPricing) => {
              const elasticity = elasticityLabel(p.elasticity)
              const hasDelta = p.recommended_price_delta_pct !== null
              const deltaPositive = hasDelta && p.recommended_price_delta_pct! > 0
              const deltaSymbol   = deltaPositive ? '↑' : '↓'
              const deltaColor    = deltaPositive ? 'text-pos-text' : 'text-neg'

              return (
                <tr key={p.product_id} className="border-b border-[#f8fafc] hover:bg-[#fafafa]">
                  {/* Product name */}
                  <td className="px-4 py-2">
                    <div className="font-semibold text-[#0f172a]">{p.product_name}</div>
                    {p.category && (
                      <div className="text-[10px] text-[#94a3b8]">{p.category}</div>
                    )}
                  </td>

                  {/* Current avg price */}
                  <td className="px-4 py-2 text-right tabular-nums text-[#334155]">
                    {fmtPrice(p.current_avg_price)}
                  </td>

                  {/* Recommended price + delta */}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {p.recommended_price !== null ? (
                      <span className="font-semibold text-[#0f172a]">
                        {fmtPrice(p.recommended_price)}
                        {hasDelta && Math.abs(p.recommended_price_delta_pct!) >= 0.1 && (
                          <span className={`ml-1 text-[10px] font-black ${deltaColor}`}>
                            {deltaSymbol}{Math.abs(p.recommended_price_delta_pct!).toFixed(1)}%
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[#94a3b8]">—</span>
                    )}
                  </td>

                  {/* Margin % */}
                  <td className={`px-4 py-2 text-right tabular-nums font-black ${marginColor(p.current_margin_pct)}`}>
                    {p.current_margin_pct !== null ? `%${p.current_margin_pct.toFixed(1)}` : '—'}
                  </td>

                  {/* Elasticity chip */}
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${elasticity.cls}`}>
                      {elasticity.label}
                    </span>
                  </td>

                  {/* Status badges */}
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      {p.is_underpriced && (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-warn-light text-warn-text">
                          Düşük Fiyat
                        </span>
                      )}
                      {p.is_low_margin && (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-neg-light text-neg-text">
                          Düşük Marj
                        </span>
                      )}
                      {!p.is_underpriced && !p.is_low_margin && (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-pos-light text-pos-text">
                          Normal
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-[#f1f5f9] text-[10px] text-[#94a3b8]">
        Tavsiye fiyat: %40 max gelir fiyatı + %40 max marj fiyatı + %20 max hacim fiyatı ağırlıklı ortalaması.
        Esneklik en az 3 farklı fiyat noktası gerektirmektedir.
      </div>
    </div>
  )
}
