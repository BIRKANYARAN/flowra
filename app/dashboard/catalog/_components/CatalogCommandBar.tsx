// ── CatalogCommandBar — Katalog İstihbarat Şeridi ────────────────────────────
//
// Server component — renders above CatalogClient with zero client JS.
// Surfaces margin health and catalog completeness gaps.
//
// Zones:
//   LEFT  — 4 KPI pills: Toplam Ürün · Fiyatlı · Maliyetli · Marj Kör Nokta
//   ALERT — Products with price but no cost data (margin blind spots)
//   INFO  — Average margin for TRY-priced products with stock cost
//
// Data strategy:
//   • products table: price completeness
//   • stock_lots: which products have FIFO cost data (open lots)
//   Avoids per-product RPC calls — O(1) queries not O(N).

import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { fmtCompact as fmt } from '@/lib/format'

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
}

export async function CatalogCommandBar({ companyId }: Props) {
  const supabase = createClient()

  // ── Parallel queries ────────────────────────────────────────────────────────
  const [productsRes, lotsRes] = await Promise.all([
    // All active products with price info
    supabase
      .from('products')
      .select('id, name, default_sale_price, default_sale_currency')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_active', true)
      .order('name'),

    // Products that have open stock lots (→ have FIFO cost data available)
    // We sum up cost to get a weighted average for TRY-lot products
    supabase
      .from('stock_lots')
      .select('product_id, qty_remaining, cost_price_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),
  ])

  const products = productsRes.data ?? []
  const lots     = lotsRes.data     ?? []

  if (products.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8fafc] border border-[#e8eaef] rounded text-xs text-[#94a3b8]">
        Henüz aktif ürün yok — katalog boş.{' '}
        <Link href="/dashboard/operations?tab=catalog" className="text-brand-light font-semibold hover:text-brand">
          Ürün Ekle →
        </Link>
      </div>
    )
  }

  // ── Build product-level cost index ──────────────────────────────────────────
  // Weighted average FIFO cost per product (TRY)
  const productCostMap = new Map<string, { totalQty: number; totalCostTRY: number }>()
  for (const lot of lots) {
    const pid = lot.product_id
    if (!pid) continue
    const qty  = Number(lot.qty_remaining ?? 0)
    const cost = Number((lot as { cost_price_try?: number | null }).cost_price_try ?? 0)
    if (qty <= 0) continue
    const prev = productCostMap.get(pid) ?? { totalQty: 0, totalCostTRY: 0 }
    productCostMap.set(pid, {
      totalQty:      prev.totalQty      + qty,
      totalCostTRY:  prev.totalCostTRY  + qty * cost,
    })
  }

  const productIdsWithCost = new Set(productCostMap.keys())

  // ── Aggregates ──────────────────────────────────────────────────────────────
  const totalProducts   = products.length
  const pricedProducts  = products.filter(p => p.default_sale_price != null && p.default_sale_price > 0)
  const costdProducts   = products.filter(p => productIdsWithCost.has(p.id))

  // Blind spots: has price but no cost data (can't compute margin)
  const blindSpots = pricedProducts.filter(p => !productIdsWithCost.has(p.id))

  // Margin analysis: TRY-priced products with cost data
  const margins: number[] = []
  const belowThreshold: { name: string; margin: number; price: number; cost: number }[] = []
  const MARGIN_FLOOR = 0.20 // 20% floor

  for (const p of pricedProducts) {
    if (p.default_sale_currency !== 'TRY') continue
    const costEntry = productCostMap.get(p.id)
    if (!costEntry || costEntry.totalQty === 0) continue
    const avgCost   = costEntry.totalCostTRY / costEntry.totalQty
    const price     = Number(p.default_sale_price)
    if (price <= 0) continue
    const margin    = (price - avgCost) / price
    margins.push(margin)
    if (margin < MARGIN_FLOOR) {
      belowThreshold.push({ name: p.name, margin, price, cost: avgCost })
    }
  }

  const avgMargin     = margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null
  const belowCount    = belowThreshold.length
  const uncoveredPct  = totalProducts > 0 ? (blindSpots.length / totalProducts) * 100 : 0

  return (
    <div className="space-y-2">

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Total products */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#e8eaef] rounded-xl shadow-soft">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Ürünler</span>
          <span className="text-sm font-black tabular-nums text-[#0f172a]">{totalProducts}</span>
          <span className="text-[9px] text-[#94a3b8]">aktif</span>
        </div>

        {/* Priced */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          pricedProducts.length === totalProducts
            ? 'bg-white border-[#e8eaef]'
            : 'bg-warn-light border-warn-light'
        }`}>
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Fiyatlı</span>
          <span className={`text-sm font-black tabular-nums ${
            pricedProducts.length === totalProducts ? 'text-[#0f172a]' : 'text-warn-text'
          }`}>{pricedProducts.length}/{totalProducts}</span>
        </div>

        {/* With cost data */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          costdProducts.length === totalProducts
            ? 'bg-white border-[#e8eaef]'
            : costdProducts.length === 0
            ? 'bg-[#f8fafc] border-[#e8eaef]'
            : 'bg-warn-light border-warn-light'
        }`}>
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Maliyetli</span>
          <span className={`text-sm font-black tabular-nums ${
            costdProducts.length === totalProducts ? 'text-[#0f172a]' :
            costdProducts.length === 0             ? 'text-[#94a3b8]' : 'text-warn-text'
          }`}>{costdProducts.length}/{totalProducts}</span>
          <span className="text-[9px] text-[#94a3b8]">stok lotlu</span>
        </div>

        {/* Average margin (TRY products only) */}
        {avgMargin !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
            avgMargin >= 0.35 ? 'bg-pos-light border-pos-light' :
            avgMargin >= 0.20 ? 'bg-warn-light border-warn-light'    :
                                'bg-neg-light border-neg-light'
          }`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#64748b]">Ort. Marj</span>
            <span className={`text-sm font-black tabular-nums ${
              avgMargin >= 0.35 ? 'text-pos-text' :
              avgMargin >= 0.20 ? 'text-warn-text'   : 'text-neg'
            }`}>
              %{(avgMargin * 100).toFixed(0)}
            </span>
            <span className="text-[9px] text-[#94a3b8]">{margins.length} TRY ürün</span>
          </div>
        )}

        {/* Link to simulation */}
        <Link href="/dashboard/planning?tab=unit-profit"
          className="ml-auto text-[10px] text-brand-light font-semibold hover:text-brand transition-colors shrink-0">
          Simülasyon →
        </Link>
      </div>

      {/* ── Below-margin alert ────────────────────────────────────────────── */}
      {belowCount > 0 && (
        <div className="bg-neg-light border border-neg-light rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-neg-light flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-neg-light rounded-full animate-pulse shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-neg-text">
              Düşük Marjlı Ürünler — %{Math.round(MARGIN_FLOOR * 100)} altında
            </span>
          </div>
          <div className="divide-y divide-red-100">
            {belowThreshold.slice(0, 3).map(p => (
              <div key={p.name} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-[#0f172a] truncate block">{p.name}</span>
                  <span className="text-[10px] text-neg font-semibold">
                    %{(p.margin * 100).toFixed(0)} marj
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black tabular-nums text-[#334155]">{fmt(p.price)}</div>
                  <div className="text-[10px] text-[#94a3b8]">maliyet {fmt(p.cost)}</div>
                </div>
              </div>
            ))}
            {belowCount > 3 && (
              <div className="px-3 py-1.5 text-[10px] text-neg font-semibold">
                +{belowCount - 3} ürün daha
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Blind spot notice ─────────────────────────────────────────────── */}
      {blindSpots.length > 0 && blindSpots.length <= 5 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warn-light border border-warn-light rounded">
          <span className="text-[10px] font-bold text-warn-text">
            {blindSpots.length} ürünün fiyatı var ama stok maliyeti bilinmiyor:
          </span>
          <span className="text-[10px] text-warn-text truncate">
            {blindSpots.slice(0, 3).map(p => p.name).join(', ')}
            {blindSpots.length > 3 ? ` +${blindSpots.length - 3} daha` : ''}
          </span>
          <Link href="/dashboard/operations?tab=stock"
            className="ml-auto text-[10px] font-semibold text-warn-text hover:text-warn-text shrink-0">
            Stok Ekle →
          </Link>
        </div>
      )}
      {blindSpots.length > 5 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warn-light border border-warn-light rounded">
          <span className="text-[10px] font-bold text-warn-text">
            {blindSpots.length} ürün için marj hesaplanamıyor (%{uncoveredPct.toFixed(0)} katalog kör nokta).
          </span>
          <Link href="/dashboard/operations?tab=stock"
            className="ml-auto text-[10px] font-semibold text-warn-text hover:text-warn-text shrink-0">
            Stok Girişi Yap →
          </Link>
        </div>
      )}

    </div>
  )
}
