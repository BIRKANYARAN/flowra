// ── SkuPerformanceService — SKU-level Performance Scoring ────────────────────
//
// Scores each product/SKU across four dimensions:
//   Revenue Contribution × Margin Efficiency × Velocity × Stock Efficiency
//
// Pure helpers are exported for unit testing.
// Uses FIFO cost from sale_item_allocations when available; falls back to
// unit_cost stored on sale_items.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SkuMetrics {
  product_id: string
  product_name: string
  sku_code: string | null
  revenue_try: number
  units_sold: number
  avg_selling_price: number         // revenue / units_sold
  gross_margin_try: number          // revenue - (units_sold × avg_cost)
  gross_margin_pct: number          // gross_margin_try / revenue × 100
  avg_cost_try: number              // weighted average FIFO cost
  revenue_contribution_pct: number  // this SKU / total revenue × 100
  units_velocity: number            // monthly rate (units_sold / days × 30)
  stock_coverage_days: number | null // current_stock / daily_sell_rate
  is_stockout: boolean
}

export interface SkuScore {
  product_id: string
  revenue_score: number    // revenue_contribution_pct × 4 (capped 100)
  margin_score: number     // gross_margin_pct (capped 100)
  velocity_score: number   // min(100, units_velocity × 10)
  composite_score: number  // revenue 35% + margin 35% + velocity 30%
  quadrant: 'star' | 'cash_cow' | 'question_mark' | 'dog'
  performance_tier: 'top' | 'core' | 'niche' | 'underperformer' | 'discontinued'
}

export interface SkuPerformanceReport {
  analysis_days: number
  total_skus: number
  total_revenue_try: number
  skus: Array<SkuMetrics & SkuScore>
  portfolio_balance_score: number
  pareto_sku_count: number
  stockout_risk_skus: string[]  // product_ids
  tier_distribution: {
    top: number
    core: number
    niche: number
    underperformer: number
    discontinued: number
  }
  top_sku_by_revenue: string | null    // product_name
  top_sku_by_margin: string | null     // product_name (highest margin %)
  highest_stockout_risk: string | null // product_name
}

// ── Internal DB row types ─────────────────────────────────────────────────────

interface SaleItemRow {
  product_id:   string | null
  product_name: string | null
  sku_code:     string | null
  list_price:   number | null
  qty:          number | null
  unit_price:   number | null
  unit_cost:    number | null
  line_total:   number | null
  sale_id:      string | null
}

interface AllocationRow {
  sale_id:        string | null
  product_id:     string | null
  qty_allocated:  number | null
  cost_price_try: number | null
}

interface StockLotRow {
  product_id:   string | null
  qty_remaining: number | null
  cost_price:   number | null
}

// ── Pure helpers (exported for unit testing) ──────────────────────────────────

/**
 * computeAvgSellingPrice
 * Returns average selling price. Returns 0 if units_sold = 0 (avoids NaN/Infinity).
 */
export function computeAvgSellingPrice(revenueTry: number, unitsSold: number): number {
  if (unitsSold === 0) return 0
  return revenueTry / unitsSold
}

/**
 * computeSkuGrossMarginPct
 * Returns gross margin %. Returns 0 if revenue = 0.
 */
export function computeSkuGrossMarginPct(revenueTry: number, totalCostTry: number): number {
  if (revenueTry === 0) return 0
  return ((revenueTry - totalCostTry) / revenueTry) * 100
}

/**
 * computeRevenueContributionPct
 * Returns this SKU's share of total revenue as a percentage.
 * Returns 0 if totalRevenue = 0.
 */
export function computeRevenueContributionPct(skuRevenue: number, totalRevenue: number): number {
  if (totalRevenue === 0) return 0
  return (skuRevenue / totalRevenue) * 100
}

/**
 * computeUnitsVelocity
 * Returns units sold per 30-day month (monthly rate).
 * Returns 0 if analysisDays = 0.
 */
export function computeUnitsVelocity(unitsSold: number, analysisDays: number): number {
  if (analysisDays === 0) return 0
  return (unitsSold / analysisDays) * 30
}

/**
 * computeStockCoverageDays
 * Returns how many days of stock remain at current sell rate.
 * Returns null if currentStock = 0 OR dailySellRate = 0.
 */
export function computeStockCoverageDays(
  currentStock: number,
  dailySellRate: number,
): number | null {
  if (currentStock === 0 || dailySellRate === 0) return null
  return currentStock / dailySellRate
}

/**
 * computeRevenueScore
 * Converts revenue contribution % to a 0–100 score (× 4, capped at 100).
 * e.g. 10% contribution → 40 score; 30% → 100 (capped).
 */
export function computeRevenueScore(contributionPct: number): number {
  return Math.min(100, contributionPct * 4)
}

/**
 * computeMarginScore
 * Returns gross margin % as the score, clamped to 0–100.
 */
export function computeMarginScore(grossMarginPct: number): number {
  return Math.min(100, Math.max(0, grossMarginPct))
}

/**
 * computeVelocityScore
 * Converts monthly velocity to a 0–100 score (× 10, capped at 100).
 * e.g. 5 units/month → 50; 15+ units/month → 100 (capped).
 */
export function computeVelocityScore(monthlyVelocity: number): number {
  return Math.min(100, monthlyVelocity * 10)
}

/**
 * computeSkuCompositeScore
 * Weighted average: revenue 35% + margin 35% + velocity 30%.
 */
export function computeSkuCompositeScore(
  revenueScore: number,
  marginScore: number,
  velocityScore: number,
): number {
  return revenueScore * 0.35 + marginScore * 0.35 + velocityScore * 0.30
}

/**
 * classifySkuQuadrant
 * BCG-style quadrant based on contribution and margin thresholds.
 * star:          contribution ≥ 10% AND margin ≥ 30%
 * cash_cow:      contribution ≥ 10% AND margin < 30%
 * question_mark: contribution < 10% AND margin ≥ 30%
 * dog:           contribution < 10% AND margin < 30%
 */
export function classifySkuQuadrant(
  contributionPct: number,
  grossMarginPct: number,
): SkuScore['quadrant'] {
  const highShare  = contributionPct >= 10
  const highMargin = grossMarginPct   >= 30
  if (highShare  && highMargin) return 'star'
  if (highShare  && !highMargin) return 'cash_cow'
  if (!highShare && highMargin) return 'question_mark'
  return 'dog'
}

/**
 * classifySkuPerformanceTier
 * top:             composite ≥ 75
 * core:            composite ≥ 50
 * niche:           composite ≥ 30 AND units_velocity > 0
 * underperformer:  composite ≥ 30 AND units_velocity = 0
 * discontinued:    composite < 30
 */
export function classifySkuPerformanceTier(
  compositeScore: number,
  unitsVelocity: number,
): SkuScore['performance_tier'] {
  if (compositeScore >= 75) return 'top'
  if (compositeScore >= 50) return 'core'
  if (compositeScore >= 30) return unitsVelocity > 0 ? 'niche' : 'underperformer'
  return 'discontinued'
}

/**
 * buildSkuScore
 * Builds a full SkuScore from SkuMetrics.
 */
export function buildSkuScore(metrics: SkuMetrics): SkuScore {
  const revenueScore  = computeRevenueScore(metrics.revenue_contribution_pct)
  const marginScore   = computeMarginScore(metrics.gross_margin_pct)
  const velocityScore = computeVelocityScore(metrics.units_velocity)
  const composite     = computeSkuCompositeScore(revenueScore, marginScore, velocityScore)

  return {
    product_id:       metrics.product_id,
    revenue_score:    revenueScore,
    margin_score:     marginScore,
    velocity_score:   velocityScore,
    composite_score:  composite,
    quadrant:         classifySkuQuadrant(metrics.revenue_contribution_pct, metrics.gross_margin_pct),
    performance_tier: classifySkuPerformanceTier(composite, metrics.units_velocity),
  }
}

/**
 * rankSkusByScore
 * Returns SKU scores sorted by composite_score descending.
 */
export function rankSkusByScore(scores: SkuScore[]): SkuScore[] {
  return [...scores].sort((a, b) => b.composite_score - a.composite_score)
}

/**
 * findParetoSkus
 * Returns the minimum set of SKUs that together account for `paretoThresholdPct`%
 * of total revenue (default 80%). SKUs are processed from highest to lowest revenue.
 */
export function findParetoSkus(
  metrics: SkuMetrics[],
  paretoThresholdPct = 80,
): SkuMetrics[] {
  if (metrics.length === 0) return []
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue_try, 0)
  if (totalRevenue === 0) return []

  const sorted = [...metrics].sort((a, b) => b.revenue_try - a.revenue_try)
  const threshold = totalRevenue * (paretoThresholdPct / 100)

  let cumulative = 0
  const pareto: SkuMetrics[] = []
  for (const sku of sorted) {
    pareto.push(sku)
    cumulative += sku.revenue_try
    if (cumulative >= threshold) break
  }
  return pareto
}

/**
 * computePortfolioBalanceScore
 * Uses Herfindahl–Hirschman Index (HHI) of revenue contributions.
 * score = 100 × (1 - HHI)
 * Single SKU → HHI ≈ 1 → score ≈ 0 (fully concentrated)
 * Equal distribution → HHI ≈ 0 → score ≈ 100 (perfectly balanced)
 */
export function computePortfolioBalanceScore(metrics: SkuMetrics[]): number {
  if (metrics.length === 0) return 0
  const totalRevenue = metrics.reduce((s, m) => s + m.revenue_try, 0)
  if (totalRevenue === 0) return 0

  const hhi = metrics.reduce((sum, m) => {
    const share = m.revenue_try / totalRevenue
    return sum + share * share
  }, 0)

  return 100 * (1 - hhi)
}

/**
 * identifyStockoutRisk
 * Returns SKUs that are already stocked out OR have coverage below the threshold.
 * Default threshold: 7 days.
 */
export function identifyStockoutRisk(
  metrics: SkuMetrics[],
  coverageDaysThreshold = 7,
): SkuMetrics[] {
  return metrics.filter(m => {
    if (m.is_stockout) return true
    if (m.stock_coverage_days !== null && m.stock_coverage_days < coverageDaysThreshold) return true
    return false
  })
}

/**
 * computePriceRealization
 * Returns avg_selling_price / list_price × 100.
 * Returns null if list_price is 0, null, or undefined.
 */
export function computePriceRealization(
  avgSellingPrice: number,
  listPrice: number | null,
): number | null {
  if (listPrice === null || listPrice === undefined || listPrice === 0) return null
  return (avgSellingPrice / listPrice) * 100
}

// ── Service ───────────────────────────────────────────────────────────────────

const ANALYSIS_DAYS = 90

function isoDateDaysBack(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export class SkuPerformanceService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<SkuPerformanceReport> {
    const today    = new Date().toISOString().slice(0, 10)
    const fromDate = isoDateDaysBack(ANALYSIS_DAYS)

    // ── 1. Sale items (last 90 days) with product info ────────────────────────
    let saleItems: SaleItemRow[] = []
    try {
      const { data, error } = await this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          qty,
          unit_price,
          unit_cost,
          line_total,
          sale_id,
          products(sku_code, list_price)
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', today)
        .not('product_id', 'is', null)

      if (!error && data) {
        saleItems = (data as Array<Record<string, unknown>>).map(r => {
          const prod = r['products'] as Record<string, unknown> | null
          return {
            product_id:   r['product_id']   as string | null,
            product_name: r['product_name'] as string | null,
            sku_code:     (prod?.['sku_code']  ?? null) as string | null,
            list_price:   prod?.['list_price'] != null ? Number(prod['list_price']) : null,
            qty:          Number(r['qty']        ?? 0),
            unit_price:   Number(r['unit_price'] ?? 0),
            unit_cost:    r['unit_cost'] != null ? Number(r['unit_cost']) : null,
            line_total:   Number(r['line_total'] ?? 0),
            sale_id:      r['sale_id'] as string | null,
          }
        })
      }
    } catch {
      saleItems = []
    }

    // ── 2. FIFO cost allocations ──────────────────────────────────────────────
    let allocations: AllocationRow[] = []
    try {
      const { data, error } = await this.supabase
        .from('sale_item_allocations')
        .select('sale_id, product_id, qty_allocated, cost_price_try')
        .eq('company_id', companyId)

      if (!error && data) {
        allocations = data as AllocationRow[]
      }
    } catch {
      allocations = []
    }

    // Allocation lookup: `${sale_id}__${product_id}` → total COGS
    const allocMap = new Map<string, number>()
    for (const a of allocations) {
      if (!a.sale_id || !a.product_id) continue
      const key = `${a.sale_id}__${a.product_id}`
      const prev = allocMap.get(key) ?? 0
      allocMap.set(key, prev + Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0))
    }

    // ── 3. Current stock from stock_lots ──────────────────────────────────────
    let stockLots: StockLotRow[] = []
    try {
      const { data, error } = await this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining, cost_price')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0)

      if (!error && data) {
        stockLots = data as StockLotRow[]
      }
    } catch {
      stockLots = []
    }

    // Stock summary per product: { totalQty, totalValue }
    interface StockSummary { qty: number; value: number }
    const stockMap = new Map<string, StockSummary>()
    for (const lot of stockLots) {
      if (!lot.product_id) continue
      const prev = stockMap.get(lot.product_id) ?? { qty: 0, value: 0 }
      const qty = Number(lot.qty_remaining ?? 0)
      const cost = Number(lot.cost_price ?? 0)
      stockMap.set(lot.product_id, {
        qty:   prev.qty   + qty,
        value: prev.value + qty * cost,
      })
    }

    // ── 4. Aggregate per product ──────────────────────────────────────────────

    interface ProductAccum {
      product_name: string
      sku_code:     string | null
      list_price:   number | null
      units_sold:   number
      revenue:      number
      total_cost:   number
      cost_units:   number // units that had cost data
    }

    const productMap = new Map<string, ProductAccum>()

    for (const item of saleItems) {
      const pid = item.product_id
      if (!pid) continue

      const pname     = item.product_name?.trim() || 'Bilinmeyen Ürün'
      const qty       = Number(item.qty ?? 0)
      const lineTotal = Number(item.line_total ?? 0) || Number(item.unit_price ?? 0) * qty

      // COGS: prefer FIFO allocation, fallback to unit_cost on sale_items
      let lineCost = 0
      const allocKey = `${item.sale_id}__${pid}`
      if (allocMap.has(allocKey)) {
        lineCost = allocMap.get(allocKey)!
      } else if (item.unit_cost != null) {
        lineCost = item.unit_cost * qty
      }

      const prev = productMap.get(pid) ?? {
        product_name: pname,
        sku_code:     item.sku_code,
        list_price:   item.list_price,
        units_sold:   0,
        revenue:      0,
        total_cost:   0,
        cost_units:   0,
      }

      productMap.set(pid, {
        product_name: pname,
        sku_code:     prev.sku_code ?? item.sku_code,
        list_price:   prev.list_price ?? item.list_price,
        units_sold:   prev.units_sold + qty,
        revenue:      prev.revenue    + lineTotal,
        total_cost:   prev.total_cost + lineCost,
        cost_units:   lineCost > 0 ? prev.cost_units + qty : prev.cost_units,
      })
    }

    // ── 5. Compute metrics per product ────────────────────────────────────────

    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0)

    const metricsArr: SkuMetrics[] = Array.from(productMap.entries()).map(([pid, p]) => {
      const avgSellingPrice = computeAvgSellingPrice(p.revenue, p.units_sold)
      const avgCost         = p.cost_units > 0 ? p.total_cost / p.cost_units : 0
      const grossMarginTry  = p.revenue - p.total_cost
      const grossMarginPct  = computeSkuGrossMarginPct(p.revenue, p.total_cost)
      const contributionPct = computeRevenueContributionPct(p.revenue, totalRevenue)
      const velocity        = computeUnitsVelocity(p.units_sold, ANALYSIS_DAYS)

      // Stock metrics
      const stock        = stockMap.get(pid)
      const currentStock = stock?.qty ?? 0
      const dailyRate    = p.units_sold / ANALYSIS_DAYS
      const coverage     = computeStockCoverageDays(currentStock, dailyRate)
      const isStockout   = currentStock === 0 && p.units_sold > 0

      return {
        product_id:               pid,
        product_name:             p.product_name,
        sku_code:                 p.sku_code,
        revenue_try:              p.revenue,
        units_sold:               p.units_sold,
        avg_selling_price:        avgSellingPrice,
        gross_margin_try:         grossMarginTry,
        gross_margin_pct:         grossMarginPct,
        avg_cost_try:             avgCost,
        revenue_contribution_pct: contributionPct,
        units_velocity:           velocity,
        stock_coverage_days:      coverage,
        is_stockout:              isStockout,
      }
    })

    // ── 6. Build scores and merge ─────────────────────────────────────────────

    const merged: Array<SkuMetrics & SkuScore> = metricsArr.map(m => ({
      ...m,
      ...buildSkuScore(m),
    }))

    // Sort by composite score descending
    merged.sort((a, b) => b.composite_score - a.composite_score)

    // ── 7. Portfolio-level stats ──────────────────────────────────────────────

    const portfolioBalance = computePortfolioBalanceScore(metricsArr)
    const paretoSkus       = findParetoSkus(metricsArr)
    const stockoutRisk     = identifyStockoutRisk(metricsArr)

    const tierDistribution = {
      top:            merged.filter(s => s.performance_tier === 'top').length,
      core:           merged.filter(s => s.performance_tier === 'core').length,
      niche:          merged.filter(s => s.performance_tier === 'niche').length,
      underperformer: merged.filter(s => s.performance_tier === 'underperformer').length,
      discontinued:   merged.filter(s => s.performance_tier === 'discontinued').length,
    }

    const topByRevenue = [...metricsArr].sort((a, b) => b.revenue_try - a.revenue_try)[0] ?? null
    const topByMargin  = [...metricsArr].sort((a, b) => b.gross_margin_pct - a.gross_margin_pct)[0] ?? null
    const highestRisk  = stockoutRisk.length > 0
      ? stockoutRisk.sort((a, b) => (a.stock_coverage_days ?? -1) - (b.stock_coverage_days ?? -1))[0]
      : null

    return {
      analysis_days:         ANALYSIS_DAYS,
      total_skus:            merged.length,
      total_revenue_try:     totalRevenue,
      skus:                  merged,
      portfolio_balance_score: portfolioBalance,
      pareto_sku_count:      paretoSkus.length,
      stockout_risk_skus:    stockoutRisk.map(m => m.product_id),
      tier_distribution:     tierDistribution,
      top_sku_by_revenue:    topByRevenue?.product_name ?? null,
      top_sku_by_margin:     topByMargin?.product_name  ?? null,
      highest_stockout_risk: highestRisk?.product_name  ?? null,
    }
  }
}
