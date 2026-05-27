// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/price-optimization.service.ts
//
// Price Optimization Engine — data-driven pricing analysis per product.
//
// Computes per product:
//   - Price history: distinct prices, volumes, revenues, margins in last 12m
//   - Optimal prices: max revenue / max margin / max volume price points
//   - Recommended price: 40% max_revenue + 40% max_margin + 20% max_volume
//   - Price elasticity (simplified): % change in volume / % change in price
//   - Underpriced detection: current avg < max_margin × 0.90 or margin < 15%
//
// Pure helpers are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type PriceElasticity = 'elastic' | 'inelastic' | 'unknown'

export interface PricePoint {
  price_try: number
  units_sold: number
  revenue_try: number
  gross_margin_pct: number | null
  order_count: number
}

export interface ProductPricing {
  product_id: string
  product_name: string
  category?: string
  // Current state
  current_avg_price: number
  current_margin_pct: number | null
  fifo_cost_try: number | null   // latest known FIFO cost
  // Price history
  price_points: PricePoint[]     // distinct prices seen in last 12m
  // Optimization
  max_revenue_price: number | null
  max_margin_price: number | null
  max_volume_price: number | null
  recommended_price: number | null
  recommended_price_delta_pct: number | null  // % vs current avg
  // Elasticity
  elasticity: PriceElasticity
  elasticity_value: number | null   // the calculated ratio
  // Flags
  is_underpriced: boolean
  is_low_margin: boolean
  data_points: number    // number of sales records used
}

export interface PriceOptimizationReport {
  company_id: string
  analysis_months: number    // 12
  products: ProductPricing[]
  // Portfolio
  underpriced_count: number
  low_margin_count: number
  elastic_count: number
  avg_margin_pct: number | null
  potential_revenue_uplift: number   // sum of (recommended_price - current) × projected_units for underpriced
  computed_at: string
}

// ── Raw DB rows ────────────────────────────────────────────────────────────────

interface SaleItemRow {
  product_id:   string | null
  product_name: string
  unit_price:   number | null
  qty:          number | null
  line_total:   number | null
  sale_date:    string | null
}

interface StockLotRow {
  product_id:    string | null
  cost_price_try: number | null
  qty_remaining: number | null
}

interface ProductRow {
  id:       string
  name:     string
  category: string | null
}

// ── Pure exported helpers ──────────────────────────────────────────────────────

/**
 * Compute blended recommended price.
 * Weights: 40% max_revenue + 40% max_margin + 20% max_volume.
 * Null inputs are ignored — weight redistributed proportionally.
 */
export function computeRecommendedPrice(
  maxRevenuePrice: number | null,
  maxMarginPrice: number | null,
  maxVolumePrice: number | null,
): number | null {
  const candidates: Array<{ price: number; weight: number }> = []
  if (maxRevenuePrice !== null) candidates.push({ price: maxRevenuePrice, weight: 0.40 })
  if (maxMarginPrice  !== null) candidates.push({ price: maxMarginPrice,  weight: 0.40 })
  if (maxVolumePrice  !== null) candidates.push({ price: maxVolumePrice,  weight: 0.20 })

  if (candidates.length === 0) return null

  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)
  const blended = candidates.reduce((s, c) => s + c.price * (c.weight / totalWeight), 0)
  return blended
}

/**
 * Compute simplified price elasticity using linear regression slope.
 * Returns null if fewer than 2 distinct, valid price points.
 *
 * Method: pick the two extremes (lowest-price and highest-price points),
 * compute elasticity = (ΔQ/Q_mid) / (ΔP/P_mid).
 * Returns null if there are < 2 points or if price range is zero.
 */
export function computeElasticity(
  pricePoints: Array<{ price_try: number; units_sold: number }>,
): number | null {
  // Filter out zero or negative prices/units
  const valid = pricePoints.filter(p => p.price_try > 0 && p.units_sold >= 0)
  if (valid.length < 2) return null

  // Find min and max price points
  const sorted = [...valid].sort((a, b) => a.price_try - b.price_try)
  const low  = sorted[0]
  const high = sorted[sorted.length - 1]

  const deltaP = high.price_try - low.price_try
  const deltaQ = high.units_sold - low.units_sold

  if (deltaP === 0) return null

  const midP = (high.price_try + low.price_try) / 2
  const midQ = (high.units_sold + low.units_sold) / 2

  if (midQ === 0) return null

  // Point elasticity using midpoint method
  const elasticity = (deltaQ / midQ) / (deltaP / midP)
  return elasticity
}

/**
 * Classify elasticity value.
 * |elasticity| > 1 → elastic, |elasticity| ≤ 1 → inelastic, null → unknown.
 */
export function classifyElasticity(elasticityValue: number | null): PriceElasticity {
  if (elasticityValue === null) return 'unknown'
  return Math.abs(elasticityValue) > 1 ? 'elastic' : 'inelastic'
}

/**
 * Compute revenue uplift = (recommendedPrice - currentPrice) × projectedUnits.
 */
export function computeRevenueUplift(
  currentPrice: number,
  recommendedPrice: number,
  projectedUnits: number,
): number {
  return (recommendedPrice - currentPrice) * projectedUnits
}

// ── FIFO cost helper ───────────────────────────────────────────────────────────

function computeFifoCost(lots: StockLotRow[], productId: string): number | null {
  const productLots = lots.filter(l => String(l.product_id ?? '') === productId)
  let totalCost = 0
  let totalQty = 0
  for (const lot of productLots) {
    const qty  = Number(lot.qty_remaining ?? 0)
    const cost = Number(lot.cost_price_try ?? 0)
    if (qty > 0 && cost > 0) {
      totalCost += cost * qty
      totalQty  += qty
    }
  }
  return totalQty > 0 ? totalCost / totalQty : null
}

// ── Main service ───────────────────────────────────────────────────────────────

export class PriceOptimizationService {
  static async getReport(
    companyId: string,
    supabase: AnyClient,
  ): Promise<PriceOptimizationReport> {
    const now = new Date()
    const from = new Date(now)
    from.setMonth(from.getMonth() - 12)
    const fromStr = from.toISOString().slice(0, 10)

    // ── Fetch data ─────────────────────────────────────────────────────────────
    const [itemsRes, lotsRes, productsRes] = await Promise.all([
      supabase
        .from('sale_items')
        .select('product_id, product_name, unit_price, qty, line_total, sales!inner(sale_date, deleted_at, company_id)')
        .eq('company_id', companyId)
        .gte('sales.sale_date', fromStr)
        .is('sales.deleted_at', null)
        .eq('sales.company_id', companyId)
        .not('product_id', 'is', null),

      supabase
        .from('stock_lots')
        .select('product_id, cost_price_try, qty_remaining')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),

      supabase
        .from('products')
        .select('id, name, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('is_active', true),
    ])

    // Build product lookup
    const productMap = new Map<string, ProductRow>()
    for (const p of (productsRes.data ?? []) as ProductRow[]) {
      productMap.set(p.id, p)
    }

    const lots = (lotsRes.data ?? []) as StockLotRow[]

    // ── Group sale items by product × price ───────────────────────────────────
    // Map: productId → Map<priceRounded → { units, revenue, orderCount }>
    const byProduct = new Map<string, Map<number, { units: number; revenue: number; orders: number; saleDate: string }>>()
    // Also track sale items per product for avg price
    const productSaleItems = new Map<string, Array<{ price: number; qty: number; date: string }>>()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (itemsRes.data ?? []) as any[]) {
      const pid      = String(row.product_id ?? '')
      if (!pid) continue
      const unitPrice = Number(row.unit_price ?? 0)
      if (unitPrice <= 0) continue
      const qty       = Number(row.qty ?? 0)
      const lineTotal = Number(row.line_total ?? 0)
      const saleDate  = String(row.sales?.sale_date ?? row.sale_date ?? '')

      // Round price to 2dp for grouping
      const priceKey = Math.round(unitPrice * 100) / 100

      if (!byProduct.has(pid)) byProduct.set(pid, new Map())
      const priceMap = byProduct.get(pid)!
      const existing = priceMap.get(priceKey) ?? { units: 0, revenue: 0, orders: 0, saleDate }
      priceMap.set(priceKey, {
        units:   existing.units + qty,
        revenue: existing.revenue + lineTotal,
        orders:  existing.orders + 1,
        saleDate: existing.saleDate || saleDate,
      })

      if (!productSaleItems.has(pid)) productSaleItems.set(pid, [])
      productSaleItems.get(pid)!.push({ price: unitPrice, qty, date: saleDate })
    }

    // ── Build ProductPricing per product ──────────────────────────────────────
    const products: ProductPricing[] = []

    for (const [pid, priceMap] of byProduct.entries()) {
      // Look up product name/category — fallback to first sale item's product_name
      const productRow = productMap.get(pid)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItems = (itemsRes.data ?? []) as any[]
      const firstItem = rawItems.find(r => String(r.product_id ?? '') === pid)
      const productName = productRow?.name ?? (firstItem ? String(firstItem.product_name ?? '') : pid)
      const category    = productRow?.category ?? undefined

      const fifoCost = computeFifoCost(lots, pid)

      // Build price points
      const pricePoints: PricePoint[] = []
      for (const [price, { units, revenue, orders }] of priceMap.entries()) {
        const grossMarginPct = fifoCost !== null && fifoCost > 0 && price > 0
          ? ((price - fifoCost) / price) * 100
          : null
        pricePoints.push({
          price_try: price,
          units_sold: units,
          revenue_try: revenue,
          gross_margin_pct: grossMarginPct,
          order_count: orders,
        })
      }

      // Sort by price ascending for elasticity calc
      pricePoints.sort((a, b) => a.price_try - b.price_try)

      // Current avg price (weighted by qty)
      const saleItems = productSaleItems.get(pid) ?? []
      const totalQty = saleItems.reduce((s, i) => s + i.qty, 0)
      const weightedPrice = totalQty > 0
        ? saleItems.reduce((s, i) => s + i.price * i.qty, 0) / totalQty
        : pricePoints[0]?.price_try ?? 0
      const currentAvgPrice = weightedPrice

      // Current margin based on current avg price and FIFO cost
      const currentMarginPct = fifoCost !== null && fifoCost > 0 && currentAvgPrice > 0
        ? ((currentAvgPrice - fifoCost) / currentAvgPrice) * 100
        : null

      // Max revenue price
      const maxRevenuePP = pricePoints.reduce<PricePoint | null>((best, pp) =>
        best === null || pp.revenue_try > best.revenue_try ? pp : best, null)

      // Max margin price (highest gross_margin_pct among those with a valid margin)
      const withMargin = pricePoints.filter(pp => pp.gross_margin_pct !== null)
      const maxMarginPP = withMargin.reduce<PricePoint | null>((best, pp) =>
        best === null || (pp.gross_margin_pct! > best.gross_margin_pct!) ? pp : best, null)

      // Max volume price
      const maxVolumePP = pricePoints.reduce<PricePoint | null>((best, pp) =>
        best === null || pp.units_sold > best.units_sold ? pp : best, null)

      const maxRevenuePrice = maxRevenuePP?.price_try ?? null
      const maxMarginPrice  = maxMarginPP?.price_try  ?? null
      const maxVolumePrice  = maxVolumePP?.price_try  ?? null

      const recommendedPrice = computeRecommendedPrice(maxRevenuePrice, maxMarginPrice, maxVolumePrice)

      const recommendedPriceDeltaPct = recommendedPrice !== null && currentAvgPrice > 0
        ? ((recommendedPrice - currentAvgPrice) / currentAvgPrice) * 100
        : null

      // Elasticity
      const elasticityValue = pricePoints.length >= 3
        ? computeElasticity(pricePoints.map(pp => ({ price_try: pp.price_try, units_sold: pp.units_sold })))
        : null
      const elasticity = classifyElasticity(elasticityValue)

      // Flags
      const isUnderpriced = maxMarginPrice !== null
        ? currentAvgPrice < maxMarginPrice * 0.90
        : false
      const isLowMargin = currentMarginPct !== null ? currentMarginPct < 15 : false

      // Data points = total sale_items rows for this product
      const dataPoints = saleItems.length

      products.push({
        product_id:   pid,
        product_name: productName,
        category,
        current_avg_price:           currentAvgPrice,
        current_margin_pct:          currentMarginPct,
        fifo_cost_try:               fifoCost,
        price_points:                pricePoints,
        max_revenue_price:           maxRevenuePrice,
        max_margin_price:            maxMarginPrice,
        max_volume_price:            maxVolumePrice,
        recommended_price:           recommendedPrice,
        recommended_price_delta_pct: recommendedPriceDeltaPct,
        elasticity,
        elasticity_value:            elasticityValue,
        is_underpriced:              isUnderpriced,
        is_low_margin:               isLowMargin,
        data_points:                 dataPoints,
      })
    }

    // Sort by data_points desc
    products.sort((a, b) => b.data_points - a.data_points)

    // ── Portfolio summary ─────────────────────────────────────────────────────
    const underpricedCount = products.filter(p => p.is_underpriced).length
    const lowMarginCount   = products.filter(p => p.is_low_margin).length
    const elasticCount     = products.filter(p => p.elasticity === 'elastic').length

    const productsWithMargin = products.filter(p => p.current_margin_pct !== null)
    const avgMarginPct = productsWithMargin.length > 0
      ? productsWithMargin.reduce((s, p) => s + p.current_margin_pct!, 0) / productsWithMargin.length
      : null

    // Potential revenue uplift: sum over underpriced products
    let potentialRevenueUplift = 0
    for (const p of products) {
      if (!p.is_underpriced || p.recommended_price === null) continue
      // Use total units sold in period as projected units
      const projectedUnits = p.price_points.reduce((s, pp) => s + pp.units_sold, 0)
      potentialRevenueUplift += computeRevenueUplift(p.current_avg_price, p.recommended_price, projectedUnits)
    }

    return {
      company_id:               companyId,
      analysis_months:          12,
      products,
      underpriced_count:        underpricedCount,
      low_margin_count:         lowMarginCount,
      elastic_count:            elasticCount,
      avg_margin_pct:           avgMarginPct,
      potential_revenue_uplift: Math.max(0, potentialRevenueUplift),
      computed_at:              now.toISOString(),
    }
  }
}
