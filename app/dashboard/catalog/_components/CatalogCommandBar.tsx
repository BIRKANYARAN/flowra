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
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-400">
        Henüz aktif ürün yok — katalog boş.{' '}
        <Link href="/dashboard/products" className="text-primary-600 font-semibold hover:text-primary-700">
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
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-100 rounded">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Ürünler</span>
          <span className="text-sm font-black tabular-nums text-gray-900">{totalProducts}</span>
          <span className="text-[9px] text-gray-400">aktif</span>
        </div>

        {/* Priced */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          pricedProducts.length === totalProducts
            ? 'bg-white border-gray-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Fiyatlı</span>
          <span className={`text-sm font-black tabular-nums ${
            pricedProducts.length === totalProducts ? 'text-gray-900' : 'text-amber-700'
          }`}>{pricedProducts.length}/{totalProducts}</span>
        </div>

        {/* With cost data */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
          costdProducts.length === totalProducts
            ? 'bg-white border-gray-200'
            : costdProducts.length === 0
            ? 'bg-gray-50 border-gray-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Maliyetli</span>
          <span className={`text-sm font-black tabular-nums ${
            costdProducts.length === totalProducts ? 'text-gray-900' :
            costdProducts.length === 0             ? 'text-gray-400' : 'text-amber-700'
          }`}>{costdProducts.length}/{totalProducts}</span>
          <span className="text-[9px] text-gray-400">stok lotlu</span>
        </div>

        {/* Average margin (TRY products only) */}
        {avgMargin !== null && (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded border ${
            avgMargin >= 0.35 ? 'bg-emerald-50 border-emerald-200' :
            avgMargin >= 0.20 ? 'bg-amber-50 border-amber-200'    :
                                'bg-red-50 border-red-200'
          }`}>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Ort. Marj</span>
            <span className={`text-sm font-black tabular-nums ${
              avgMargin >= 0.35 ? 'text-emerald-700' :
              avgMargin >= 0.20 ? 'text-amber-700'   : 'text-red-600'
            }`}>
              %{(avgMargin * 100).toFixed(0)}
            </span>
            <span className="text-[9px] text-gray-400">{margins.length} TRY ürün</span>
          </div>
        )}

        {/* Link to simulation */}
        <Link href="/dashboard/planning?tab=unit-profit"
          className="ml-auto text-[10px] text-primary-600 font-semibold hover:text-primary-700 transition-colors shrink-0">
          Simülasyon →
        </Link>
      </div>

      {/* ── Below-margin alert ────────────────────────────────────────────── */}
      {belowCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-red-100 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shrink-0" />
            <span className="text-[9px] font-black uppercase tracking-widest text-red-700">
              Düşük Marjlı Ürünler — %{Math.round(MARGIN_FLOOR * 100)} altında
            </span>
          </div>
          <div className="divide-y divide-red-100">
            {belowThreshold.slice(0, 3).map(p => (
              <div key={p.name} className="px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold text-gray-900 truncate block">{p.name}</span>
                  <span className="text-[10px] text-red-600 font-semibold">
                    %{(p.margin * 100).toFixed(0)} marj
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-black tabular-nums text-gray-700">{fmt(p.price)}</div>
                  <div className="text-[10px] text-gray-400">maliyet {fmt(p.cost)}</div>
                </div>
              </div>
            ))}
            {belowCount > 3 && (
              <div className="px-3 py-1.5 text-[10px] text-red-600 font-semibold">
                +{belowCount - 3} ürün daha
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Blind spot notice ─────────────────────────────────────────────── */}
      {blindSpots.length > 0 && blindSpots.length <= 5 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded">
          <span className="text-[10px] font-bold text-amber-700">
            {blindSpots.length} ürünün fiyatı var ama stok maliyeti bilinmiyor:
          </span>
          <span className="text-[10px] text-amber-600 truncate">
            {blindSpots.slice(0, 3).map(p => p.name).join(', ')}
            {blindSpots.length > 3 ? ` +${blindSpots.length - 3} daha` : ''}
          </span>
          <Link href="/dashboard/stocks"
            className="ml-auto text-[10px] font-semibold text-amber-700 hover:text-amber-800 shrink-0">
            Stok Ekle →
          </Link>
        </div>
      )}
      {blindSpots.length > 5 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded">
          <span className="text-[10px] font-bold text-amber-700">
            {blindSpots.length} ürün için marj hesaplanamıyor (%{uncoveredPct.toFixed(0)} katalog kör nokta).
          </span>
          <Link href="/dashboard/stocks"
            className="ml-auto text-[10px] font-semibold text-amber-700 hover:text-amber-800 shrink-0">
            Stok Girişi Yap →
          </Link>
        </div>
      )}

    </div>
  )
}
