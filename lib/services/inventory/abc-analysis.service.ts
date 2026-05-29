// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/abc-analysis.service.ts
//
// ABC (Pareto) inventory classification service.
//
// Tiers:
//   A: products whose cumulative revenue pct ≤ 80%  (vital few — top 80% revenue)
//   B: cumulative pct ≤ 95%                         (middle tier)
//   C: cumulative pct > 95%                         (trivial many)
//
// Inventory efficiency:
//   stock_value_try / revenue_contribution_try × 100
//   <50   → under_invested  (stockout risk)
//   50–100 → optimal
//   100–200 → over_invested
//   >200   → excessive
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProductAbcProfile {
  product_id: string
  product_name: string
  sku: string | null

  revenue_try: number
  revenue_share_pct: number
  cumulative_revenue_pct: number
  abc_tier: 'A' | 'B' | 'C'
  abc_score: number

  units_sold: number
  avg_unit_price_try: number

  current_stock_qty: number
  stock_value_try: number           // qty × entry_cost_try (FIFO lot)
  inventory_efficiency_pct: number | null
  efficiency_class: 'under_invested' | 'optimal' | 'over_invested' | 'excessive' | 'unknown'
}

export interface AbcAnalysisReport {
  analysis_period_months: number
  total_products: number
  total_revenue_try: number

  a_count: number
  b_count: number
  c_count: number

  a_revenue_pct: number
  b_revenue_pct: number
  c_revenue_pct: number

  products: ProductAbcProfile[]     // sorted by revenue_share_pct desc

  a_products: ProductAbcProfile[]
  b_products: ProductAbcProfile[]
  c_products: ProductAbcProfile[]

  over_invested_a_products: ProductAbcProfile[]   // A tier + excessive inventory
  under_invested_a_products: ProductAbcProfile[]  // A tier + under_invested

  recommendations: string[]         // Turkish action bullets
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

/**
 * Assign ABC tier based on cumulative revenue percentage.
 * A: cumulativeRevenuePct ≤ 80
 * B: cumulativeRevenuePct ≤ 95
 * C: cumulativeRevenuePct > 95
 */
export function assignAbcTier(cumulativeRevenuePct: number): 'A' | 'B' | 'C' {
  if (cumulativeRevenuePct <= 80) return 'A'
  if (cumulativeRevenuePct <= 95) return 'B'
  return 'C'
}

/**
 * Compute revenue concentration: top N products as % of total.
 * sortedRevenues must be in descending order.
 * Returns 0 if the array is empty or total is 0.
 */
export function computeTopNRevenuePct(sortedRevenues: number[], n: number): number {
  if (sortedRevenues.length === 0) return 0
  const total = sortedRevenues.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  const topN  = sortedRevenues.slice(0, n).reduce((s, v) => s + v, 0)
  return (topN / total) * 100
}

/**
 * Map ABC tier to a numeric score: A=100, B=60, C=20.
 */
export function abcTierToScore(tier: 'A' | 'B' | 'C'): number {
  switch (tier) {
    case 'A': return 100
    case 'B': return 60
    case 'C': return 20
  }
}

/**
 * Compute inventory investment efficiency:
 *   value = (stockValueTry / revenueContributionTry) × 100
 *
 * Returns null when revenueContributionTry is 0 (cannot divide).
 */
export function computeInventoryEfficiency(
  stockValueTry: number,
  revenueContributionTry: number,
): number | null {
  if (revenueContributionTry === 0) return null
  return (stockValueTry / revenueContributionTry) * 100
}

/**
 * Classify inventory efficiency percentage.
 * null / unknown → 'unknown'
 * <50            → 'under_invested'
 * 50–100         → 'optimal'
 * 100–200        → 'over_invested'
 * >200           → 'excessive'
 */
export function classifyInventoryEfficiency(
  efficiencyPct: number | null,
): 'under_invested' | 'optimal' | 'over_invested' | 'excessive' | 'unknown' {
  if (efficiencyPct === null) return 'unknown'
  if (efficiencyPct < 50)    return 'under_invested'
  if (efficiencyPct <= 100)  return 'optimal'
  if (efficiencyPct <= 200)  return 'over_invested'
  return 'excessive'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isoDateMonthsBack(today: string, months: number): string {
  const d = new Date(today + 'T00:00:00')
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

function buildRecommendations(report: Omit<AbcAnalysisReport, 'recommendations'>): string[] {
  const recs: string[] = []

  if (report.a_count === 0) {
    recs.push('Satış verisi yetersiz — ABC analizi için en az bir satış kaydı gereklidir.')
    return recs
  }

  const aRevPct = report.a_revenue_pct
  recs.push(
    `A sınıfı ${report.a_count} ürün toplam gelirin %${aRevPct.toFixed(1)}'ini oluşturuyor — ` +
    `bu ürünlere öncelikli stok ve satış desteği sağlayın.`,
  )

  if (report.over_invested_a_products.length > 0) {
    const names = report.over_invested_a_products.slice(0, 3).map(p => p.product_name).join(', ')
    recs.push(
      `A sınıfı ürünlerde fazla stok yatırımı tespit edildi (${names}${report.over_invested_a_products.length > 3 ? ' ve diğerleri' : ''}). ` +
      `Stok seviyelerini optimize edin, fazla stoğu eritin.`,
    )
  }

  if (report.under_invested_a_products.length > 0) {
    const names = report.under_invested_a_products.slice(0, 3).map(p => p.product_name).join(', ')
    recs.push(
      `A sınıfı ürünlerde stok yetersizliği riski var (${names}${report.under_invested_a_products.length > 3 ? ' ve diğerleri' : ''}). ` +
      `Stokout önlemek için sipariş verin.`,
    )
  }

  if (report.c_count > 0) {
    const cRevPct = report.c_revenue_pct
    recs.push(
      `C sınıfı ${report.c_count} ürün toplam gelirin yalnızca %${cRevPct.toFixed(1)}'ini sağlıyor. ` +
      `Bu ürünler için stok yatırımını minimize edin veya katalogdan çıkarmayı değerlendirin.`,
    )
  }

  if (report.b_count > 0) {
    recs.push(
      `B sınıfı ${report.b_count} ürün izleme altında tutun — satış trendleri A'ya terfi etmeye uygun olanları gösterir.`,
    )
  }

  return recs
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AbcAnalysisService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string, periodMonths = 12): Promise<AbcAnalysisReport> {
    const today    = new Date().toISOString().slice(0, 10)
    const fromDate = isoDateMonthsBack(today, periodMonths)

    // ── Parallel fetches ──────────────────────────────────────────────────────

    const [saleItemsRes, lotsRes, productsRes] = await Promise.all([
      // Sale items for the period
      this.supabase
        .from('sale_items')
        .select('product_id, product_name, qty, line_total, sales!inner(sale_date, company_id, deleted_at, is_proforma)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', today),

      // Current stock lots (active)
      this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining, cost_price, cost_fx_rate, cost_price_try')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null),

      // Product catalog (for name + SKU)
      this.supabase
        .from('products')
        .select('id, name, sku')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    // ── Build lookup maps ─────────────────────────────────────────────────────

    interface ProductRow { id: string; name: string; sku: string | null }
    const productMap = new Map<string, ProductRow>()
    for (const p of (productsRes.data ?? []) as ProductRow[]) {
      productMap.set(p.id, p)
    }

    // Aggregate sale items: product_id → { revenue, units, name }
    interface SaleAccum { revenue: number; units: number; name: string }
    const salesMap = new Map<string, SaleAccum>()

    for (const item of (saleItemsRes.data ?? []) as Array<{
      product_id: string | null
      product_name: string | null
      qty: number | null
      line_total: number | null
    }>) {
      if (!item.product_id) continue
      const prev = salesMap.get(item.product_id) ?? { revenue: 0, units: 0, name: item.product_name ?? 'Bilinmeyen Ürün' }
      salesMap.set(item.product_id, {
        revenue: prev.revenue + Number(item.line_total ?? 0),
        units:   prev.units   + Number(item.qty ?? 0),
        name:    prev.name || (item.product_name ?? 'Bilinmeyen Ürün'),
      })
    }

    // Aggregate stock lots: product_id → { totalQty, totalValue }
    interface StockAccum { totalQty: number; totalValue: number }
    const stockMap = new Map<string, StockAccum>()

    for (const lot of (lotsRes.data ?? []) as Array<{
      product_id: string
      qty_remaining: number | null
      cost_price: number | null
      cost_fx_rate: number | null
      cost_price_try: number | null
    }>) {
      const perUnit =
        lot.cost_price_try != null && lot.cost_price_try > 0
          ? lot.cost_price_try
          : Number(lot.cost_price ?? 0) * (Number(lot.cost_fx_rate ?? 1) || 1)

      const qty  = Number(lot.qty_remaining ?? 0)
      const prev = stockMap.get(lot.product_id) ?? { totalQty: 0, totalValue: 0 }
      stockMap.set(lot.product_id, {
        totalQty:   prev.totalQty   + qty,
        totalValue: prev.totalValue + qty * perUnit,
      })
    }

    // ── Compute total revenue ─────────────────────────────────────────────────

    const totalRevenue = Array.from(salesMap.values()).reduce((s, v) => s + v.revenue, 0)

    if (totalRevenue === 0) {
      // No sales data — return empty report
      return {
        analysis_period_months: periodMonths,
        total_products: 0,
        total_revenue_try: 0,
        a_count: 0, b_count: 0, c_count: 0,
        a_revenue_pct: 0, b_revenue_pct: 0, c_revenue_pct: 0,
        products: [],
        a_products: [], b_products: [], c_products: [],
        over_invested_a_products: [],
        under_invested_a_products: [],
        recommendations: ['Satış verisi bulunamadı — ABC analizi için satış kaydı girin.'],
      }
    }

    // ── Sort products by revenue desc ─────────────────────────────────────────

    const sorted = Array.from(salesMap.entries())
      .map(([pid, s]) => ({ pid, ...s }))
      .sort((a, b) => b.revenue - a.revenue)

    // ── Assign tiers with cumulative pct ─────────────────────────────────────

    let cumulative = 0
    const profiles: ProductAbcProfile[] = []

    for (const entry of sorted) {
      const product  = productMap.get(entry.pid)
      const stock    = stockMap.get(entry.pid) ?? { totalQty: 0, totalValue: 0 }

      const revShare  = (entry.revenue / totalRevenue) * 100
      cumulative     += revShare

      const tier      = assignAbcTier(cumulative)
      const score     = abcTierToScore(tier)
      const avgPrice  = entry.units > 0 ? entry.revenue / entry.units : 0
      const effPct    = computeInventoryEfficiency(stock.totalValue, entry.revenue)
      const effClass  = classifyInventoryEfficiency(effPct)

      profiles.push({
        product_id:               entry.pid,
        product_name:             product?.name ?? entry.name,
        sku:                      product?.sku ?? null,
        revenue_try:              entry.revenue,
        revenue_share_pct:        revShare,
        cumulative_revenue_pct:   cumulative,
        abc_tier:                 tier,
        abc_score:                score,
        units_sold:               entry.units,
        avg_unit_price_try:       avgPrice,
        current_stock_qty:        stock.totalQty,
        stock_value_try:          stock.totalValue,
        inventory_efficiency_pct: effPct,
        efficiency_class:         effClass,
      })
    }

    // ── Segment ───────────────────────────────────────────────────────────────

    const aProducts = profiles.filter(p => p.abc_tier === 'A')
    const bProducts = profiles.filter(p => p.abc_tier === 'B')
    const cProducts = profiles.filter(p => p.abc_tier === 'C')

    const aRevenue  = aProducts.reduce((s, p) => s + p.revenue_try, 0)
    const bRevenue  = bProducts.reduce((s, p) => s + p.revenue_try, 0)
    const cRevenue  = cProducts.reduce((s, p) => s + p.revenue_try, 0)

    const overInvestedA  = aProducts.filter(p => p.efficiency_class === 'excessive')
    const underInvestedA = aProducts.filter(p => p.efficiency_class === 'under_invested')

    const partial: Omit<AbcAnalysisReport, 'recommendations'> = {
      analysis_period_months: periodMonths,
      total_products:         profiles.length,
      total_revenue_try:      totalRevenue,
      a_count:                aProducts.length,
      b_count:                bProducts.length,
      c_count:                cProducts.length,
      a_revenue_pct:          totalRevenue > 0 ? (aRevenue / totalRevenue) * 100 : 0,
      b_revenue_pct:          totalRevenue > 0 ? (bRevenue / totalRevenue) * 100 : 0,
      c_revenue_pct:          totalRevenue > 0 ? (cRevenue / totalRevenue) * 100 : 0,
      products:               profiles,
      a_products:             aProducts,
      b_products:             bProducts,
      c_products:             cProducts,
      over_invested_a_products:  overInvestedA,
      under_invested_a_products: underInvestedA,
    }

    return { ...partial, recommendations: buildRecommendations(partial) }
  }
}
