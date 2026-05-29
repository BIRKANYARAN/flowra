// ── ProductProfitabilityService — Per-Product P&L and Profitability Ranking ───
// Computes per-product P&L, contribution margin, and SKU-level profitability.
// Ranks products by revenue, margin, and classifies them into tiers.
//
// Pure helpers are exported for unit testing without a DB connection.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProductProfitabilityStats {
  product_id: string
  product_name: string
  category: string | null

  // Revenue & volume
  revenue: number
  units_sold: number
  transaction_count: number
  avg_selling_price: number | null

  // Cost & margin
  cogs: number
  avg_cost_per_unit: number | null
  gross_profit: number
  gross_margin_pct: number | null
  contribution_margin: number
  contribution_margin_ratio: number | null

  // Mix
  revenue_share: number | null    // % of total revenue
  volume_share: number | null     // % of total units
  margin_mix_index: number | null

  // Classification
  tier: ReturnType<typeof classifyProductTier>
  trend: ReturnType<typeof classifyProductTrend>

  // Prior period for trend (current month vs prior month)
  current_month_revenue: number
  prior_month_revenue: number | null
}

export interface ProductProfitabilityReport {
  as_of_date: string
  period_months: number         // e.g. 6 (last 6 months)
  product_count: number

  // Portfolio metrics
  portfolio_gross_margin_pct: number | null
  weighted_avg_margin_pct: number | null
  top5_revenue_concentration_pct: number | null

  // Products (sorted by revenue desc)
  products: ProductProfitabilityStats[]

  // Rankings
  top_by_revenue: ProductProfitabilityStats[]    // top 5
  top_by_margin: ProductProfitabilityStats[]     // top 5 by gross_margin_pct
  loss_leaders: ProductProfitabilityStats[]      // negative margin

  // Tier distribution
  tier_counts: {
    star: number
    hero: number
    workhorse: number
    low_margin: number
    loss_leader: number
    insufficient_data: number
  }

  narrative: string
}

// ── Internal types ────────────────────────────────────────────────────────────

interface RawSaleItem {
  sale_id: string
  product_id: string | null
  product_name: string | null
  category: string | null
  qty: number
  line_total_try: number
}

interface RawAllocation {
  sale_id: string
  product_id: string | null
  cost_price_try: number
  qty_allocated: number
}

// ── Margin Computation ────────────────────────────────────────────────────────

/**
 * Compute contribution margin: revenue - variable_costs.
 * variable_costs = COGS typically.
 */
export function computeContributionMargin(revenue: number, variableCosts: number): number {
  return revenue - variableCosts
}

/**
 * Compute contribution margin ratio (CMR): contribution_margin / revenue * 100.
 * Returns null if revenue === 0.
 */
export function computeContributionMarginRatio(
  contributionMargin: number,
  revenue: number,
): number | null {
  if (revenue === 0) return null
  return (contributionMargin / revenue) * 100
}

/**
 * Compute gross profit: revenue - cogs.
 */
export function computeGrossProfit(revenue: number, cogs: number): number {
  return revenue - cogs
}

/**
 * Compute gross margin percentage: gross_profit / revenue * 100.
 * Returns null if revenue === 0.
 */
export function computeGrossMarginPct(grossProfit: number, revenue: number): number | null {
  if (revenue === 0) return null
  return (grossProfit / revenue) * 100
}

/**
 * Compute average selling price: total_revenue / total_units.
 * Returns null if total_units === 0.
 */
export function computeAvgSellingPrice(
  totalRevenue: number,
  totalUnits: number,
): number | null {
  if (totalUnits === 0) return null
  return totalRevenue / totalUnits
}

/**
 * Compute average cost per unit: total_cogs / total_units.
 * Returns null if total_units === 0.
 */
export function computeAvgCostPerUnit(totalCogs: number, totalUnits: number): number | null {
  if (totalUnits === 0) return null
  return totalCogs / totalUnits
}

/**
 * Compute revenue per transaction: total_revenue / transaction_count.
 * Returns null if transaction_count === 0.
 */
export function computeRevenuePerTransaction(
  totalRevenue: number,
  transactionCount: number,
): number | null {
  if (transactionCount === 0) return null
  return totalRevenue / transactionCount
}

// ── Product Mix ───────────────────────────────────────────────────────────────

/**
 * Compute revenue share: product_revenue / total_revenue * 100.
 * Returns null if total_revenue === 0.
 */
export function computeRevenueShare(
  productRevenue: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (productRevenue / totalRevenue) * 100
}

/**
 * Compute volume share: product_units / total_units * 100.
 * Returns null if total_units === 0.
 */
export function computeVolumeShare(productUnits: number, totalUnits: number): number | null {
  if (totalUnits === 0) return null
  return (productUnits / totalUnits) * 100
}

/**
 * Compute margin mix index: (revenue_share - volume_share).
 * Positive = product contributes more revenue than volume (premium pricing).
 * Returns null if either is null.
 */
export function computeMarginMixIndex(
  revenueShare: number | null,
  volumeShare: number | null,
): number | null {
  if (revenueShare === null || volumeShare === null) return null
  return revenueShare - volumeShare
}

// ── Product Classification ────────────────────────────────────────────────────

/**
 * Classify product profitability tier.
 * 'star': grossMarginPct >= 40 AND revenueShare >= 10
 * 'hero': grossMarginPct >= 30 AND revenueShare >= 5
 * 'workhorse': grossMarginPct >= 15 AND revenueShare >= 1
 * 'low_margin': grossMarginPct >= 0 AND grossMarginPct < 15
 * 'loss_leader': grossMarginPct < 0 (selling below cost)
 * 'insufficient_data': grossMarginPct is null
 *
 * Priority order: star > hero > workhorse > low_margin > loss_leader > insufficient_data
 */
export function classifyProductTier(
  grossMarginPct: number | null,
  revenueShare: number | null,
): 'star' | 'hero' | 'workhorse' | 'low_margin' | 'loss_leader' | 'insufficient_data' {
  if (grossMarginPct === null) return 'insufficient_data'
  if (grossMarginPct < 0) return 'loss_leader'
  if (grossMarginPct >= 40 && revenueShare !== null && revenueShare >= 10) return 'star'
  if (grossMarginPct >= 30 && revenueShare !== null && revenueShare >= 5) return 'hero'
  if (grossMarginPct >= 15 && revenueShare !== null && revenueShare >= 1) return 'workhorse'
  return 'low_margin'
}

/**
 * Classify product trend (MoM revenue change).
 * 'growing': > +10%
 * 'stable': -10% to +10%
 * 'declining': -10% to -25%
 * 'rapidly_declining': < -25%
 * 'new_product': no prior month data (priorRevenue === null)
 * 'discontinued': currentRevenue === 0 AND priorRevenue > 0
 */
export function classifyProductTrend(
  currentRevenue: number,
  priorRevenue: number | null,
): 'growing' | 'stable' | 'declining' | 'rapidly_declining' | 'new_product' | 'discontinued' {
  if (priorRevenue === null) return 'new_product'
  if (currentRevenue === 0 && priorRevenue > 0) return 'discontinued'
  if (priorRevenue === 0) return 'new_product'
  const changePct = ((currentRevenue - priorRevenue) / priorRevenue) * 100
  if (changePct > 10) return 'growing'
  if (changePct >= -10) return 'stable'
  if (changePct >= -25) return 'declining'
  return 'rapidly_declining'
}

// ── Portfolio Analysis ────────────────────────────────────────────────────────

/**
 * Compute portfolio gross margin: total_gross_profit / total_revenue * 100.
 * Returns null if total_revenue === 0.
 */
export function computePortfolioGrossMargin(
  products: Array<{ revenue: number; cogs: number }>,
): number | null {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) return null
  const totalGrossProfit = products.reduce((s, p) => s + (p.revenue - p.cogs), 0)
  return (totalGrossProfit / totalRevenue) * 100
}

/**
 * Rank products by a given metric (descending by default).
 */
export function rankProductsByMetric<T>(
  products: T[],
  getMetric: (p: T) => number | null,
  ascending = false,
): T[] {
  return [...products].sort((a, b) => {
    const ma = getMetric(a)
    const mb = getMetric(b)
    // nulls go last
    if (ma === null && mb === null) return 0
    if (ma === null) return 1
    if (mb === null) return -1
    return ascending ? ma - mb : mb - ma
  })
}

/**
 * Compute weighted average margin (revenue-weighted).
 * Returns null if total revenue === 0.
 */
export function computeWeightedAvgMargin(
  products: Array<{ revenue: number; gross_margin_pct: number | null }>,
): number | null {
  const eligible = products.filter(p => p.gross_margin_pct !== null)
  const totalRevenue = eligible.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) return null
  const weightedSum = eligible.reduce((s, p) => s + p.revenue * p.gross_margin_pct!, 0)
  return weightedSum / totalRevenue
}

/**
 * Identify top N products by revenue (default N=5).
 */
export function getTopProductsByRevenue<T extends { revenue: number }>(
  products: T[],
  n = 5,
): T[] {
  return [...products].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

/**
 * Compute concentration: what % of revenue comes from top N products.
 * Returns null if total_revenue === 0.
 */
export function computeTopNConcentration(
  products: Array<{ revenue: number }>,
  n = 5,
): number | null {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) return null
  const topN = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, n)
  const topNRevenue = topN.reduce((s, p) => s + p.revenue, 0)
  return (topNRevenue / totalRevenue) * 100
}

/**
 * Generate Turkish profitability narrative.
 */
export function generateProductProfitabilityNarrative(
  productCount: number,
  portfolioMargin: number | null,
  starCount: number,
  lossLeaderCount: number,
): string {
  if (productCount === 0) return 'Analiz için yeterli ürün verisi bulunamadı.'
  if (portfolioMargin === null) return 'Portföy marj verisi hesaplanamadı.'
  if (lossLeaderCount > 0 && portfolioMargin < 10) {
    return `${lossLeaderCount} zarar eden ürün mevcut; portföy brüt marjı %${portfolioMargin.toFixed(1)} ile kritik düzeyde düşük.`
  }
  if (lossLeaderCount > 0) {
    return `${lossLeaderCount} ürün maliyetin altında satılıyor — fiyatlandırma stratejisi gözden geçirilmeli.`
  }
  if (starCount >= 3) {
    return `${starCount} yıldız ürün portföyü güçlü tutuyor — yüksek marjlı büyüme sürdürülebilir.`
  }
  if (portfolioMargin >= 30) {
    return `Portföy brüt marjı %${portfolioMargin.toFixed(1)} ile güçlü seyirde.`
  }
  if (portfolioMargin >= 15) {
    return `Portföy brüt marjı %${portfolioMargin.toFixed(1)} — iyileştirme fırsatları mevcut.`
  }
  return `Portföy brüt marjı %${portfolioMargin.toFixed(1)} ile zayıf — maliyet yapısı ve fiyatlandırma incelenmeli.`
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function periodStartDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function currentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function priorMonthRange(): { from: string; to: string } {
  const now = new Date()
  const priorMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year = priorMonth.getFullYear()
  const month = priorMonth.getMonth() + 1
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Product aggregation ───────────────────────────────────────────────────────

interface ProductAccum {
  product_id: string
  product_name: string
  category: string | null
  revenue: number
  units_sold: number
  sale_ids: Set<string>
  cogs: number
}

function buildProductMap(
  items: RawSaleItem[],
  allocMap: Map<string, number>,
): Map<string, ProductAccum> {
  const prodMap = new Map<string, ProductAccum>()

  for (const item of items) {
    const pid = item.product_id || `unknown_${item.product_name}`
    const pname = item.product_name?.trim() || 'Bilinmeyen Ürün'

    if (!prodMap.has(pid)) {
      prodMap.set(pid, {
        product_id: pid,
        product_name: pname,
        category: item.category,
        revenue: 0,
        units_sold: 0,
        sale_ids: new Set(),
        cogs: 0,
      })
    }

    const acc = prodMap.get(pid)!
    const qty = Number(item.qty ?? 0)
    const rev = Number(item.line_total_try ?? 0)

    acc.revenue += rev
    acc.units_sold += qty
    if (item.sale_id) acc.sale_ids.add(item.sale_id)

    // COGS from allocation
    const allocKey = `${item.sale_id}__${item.product_id}`
    const lineCogs = item.product_id && item.sale_id ? (allocMap.get(allocKey) ?? 0) : 0
    acc.cogs += lineCogs
  }

  // For products with no allocation data, use 60% revenue fallback
  for (const acc of prodMap.values()) {
    if (acc.cogs === 0 && acc.revenue > 0) {
      acc.cogs = acc.revenue * 0.6
    }
  }

  return prodMap
}

// ── Service class ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class ProductProfitabilityService {
  constructor(private readonly supabase: AnySupabase) {}

  async getReport(
    companyId: string,
    periodMonths = 6,
  ): Promise<ProductProfitabilityReport> {
    const asOfDate = new Date().toISOString().slice(0, 10)
    const fromDate = periodStartDate(periodMonths)
    const toDate = new Date().toISOString().slice(0, 10)
    const currentRange = currentMonthRange()
    const priorRange = priorMonthRange()

    // ── Fetch in parallel ─────────────────────────────────────────────────────
    const [itemsResult, allocResult, currentMonthResult, priorMonthResult] =
      await Promise.allSettled([
        this._fetchSaleItems(companyId, fromDate, toDate),
        this._fetchAllocations(companyId),
        this._fetchSaleItems(companyId, currentRange.from, currentRange.to),
        this._fetchSaleItems(companyId, priorRange.from, priorRange.to),
      ])

    const items = itemsResult.status === 'fulfilled' ? itemsResult.value : []
    const allocations = allocResult.status === 'fulfilled' ? allocResult.value : []
    const currentMonthItems =
      currentMonthResult.status === 'fulfilled' ? currentMonthResult.value : []
    const priorMonthItems =
      priorMonthResult.status === 'fulfilled' ? priorMonthResult.value : []

    // ── Build allocation lookup: sale_id__product_id → COGS ──────────────────
    const allocMap = new Map<string, number>()
    for (const a of allocations) {
      if (!a.sale_id || !a.product_id) continue
      const key = `${a.sale_id}__${a.product_id}`
      allocMap.set(
        key,
        (allocMap.get(key) ?? 0) +
          Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0),
      )
    }

    // ── Aggregate all-period products ─────────────────────────────────────────
    const prodMap = buildProductMap(items, allocMap)

    // ── Current + prior month maps for trend ─────────────────────────────────
    const currentMonthMap = buildProductMap(currentMonthItems, allocMap)
    const priorMonthMap = buildProductMap(priorMonthItems, allocMap)

    // ── Portfolio totals ──────────────────────────────────────────────────────
    const allAccums = Array.from(prodMap.values())
    const totalRevenue = allAccums.reduce((s, p) => s + p.revenue, 0)
    const totalUnits = allAccums.reduce((s, p) => s + p.units_sold, 0)

    // ── Build ProductProfitabilityStats ───────────────────────────────────────
    const products: ProductProfitabilityStats[] = allAccums.map(acc => {
      const gross_profit = computeGrossProfit(acc.revenue, acc.cogs)
      const gross_margin_pct = computeGrossMarginPct(gross_profit, acc.revenue)
      const contribution_margin = computeContributionMargin(acc.revenue, acc.cogs)
      const contribution_margin_ratio = computeContributionMarginRatio(
        contribution_margin,
        acc.revenue,
      )
      const avg_selling_price = computeAvgSellingPrice(acc.revenue, acc.units_sold)
      const avg_cost_per_unit = computeAvgCostPerUnit(acc.cogs, acc.units_sold)
      const transaction_count = acc.sale_ids.size
      const revenue_share = computeRevenueShare(acc.revenue, totalRevenue)
      const volume_share = computeVolumeShare(acc.units_sold, totalUnits)
      const margin_mix_index = computeMarginMixIndex(revenue_share, volume_share)
      const tier = classifyProductTier(gross_margin_pct, revenue_share)

      // Trend from current vs prior month
      const currentMonthAcc = currentMonthMap.get(acc.product_id)
      const priorMonthAcc = priorMonthMap.get(acc.product_id)
      const current_month_revenue = currentMonthAcc?.revenue ?? 0
      const prior_month_revenue = priorMonthAcc?.revenue ?? null
      const trend = classifyProductTrend(current_month_revenue, prior_month_revenue)

      return {
        product_id: acc.product_id,
        product_name: acc.product_name,
        category: acc.category,
        revenue: acc.revenue,
        units_sold: acc.units_sold,
        transaction_count,
        avg_selling_price,
        cogs: acc.cogs,
        avg_cost_per_unit,
        gross_profit,
        gross_margin_pct,
        contribution_margin,
        contribution_margin_ratio,
        revenue_share,
        volume_share,
        margin_mix_index,
        tier,
        trend,
        current_month_revenue,
        prior_month_revenue,
      }
    })

    // Sort by revenue desc
    products.sort((a, b) => b.revenue - a.revenue)

    // ── Portfolio metrics ─────────────────────────────────────────────────────
    const portfolio_gross_margin_pct = computePortfolioGrossMargin(
      products.map(p => ({ revenue: p.revenue, cogs: p.cogs })),
    )
    const weighted_avg_margin_pct = computeWeightedAvgMargin(
      products.map(p => ({ revenue: p.revenue, gross_margin_pct: p.gross_margin_pct })),
    )
    const top5_revenue_concentration_pct = computeTopNConcentration(
      products.map(p => ({ revenue: p.revenue })),
      5,
    )

    // ── Rankings ──────────────────────────────────────────────────────────────
    const top_by_revenue = getTopProductsByRevenue(products, 5)
    const top_by_margin = rankProductsByMetric(
      products,
      p => p.gross_margin_pct,
    ).slice(0, 5)
    const loss_leaders = products.filter(
      p => p.gross_margin_pct !== null && p.gross_margin_pct < 0,
    )

    // ── Tier distribution ─────────────────────────────────────────────────────
    const tier_counts = {
      star: 0,
      hero: 0,
      workhorse: 0,
      low_margin: 0,
      loss_leader: 0,
      insufficient_data: 0,
    }
    for (const p of products) {
      tier_counts[p.tier]++
    }

    const narrative = generateProductProfitabilityNarrative(
      products.length,
      portfolio_gross_margin_pct,
      tier_counts.star,
      tier_counts.loss_leader,
    )

    return {
      as_of_date: asOfDate,
      period_months: periodMonths,
      product_count: products.length,
      portfolio_gross_margin_pct,
      weighted_avg_margin_pct,
      top5_revenue_concentration_pct,
      products,
      top_by_revenue,
      top_by_margin,
      loss_leaders,
      tier_counts,
      narrative,
    }
  }

  private async _fetchSaleItems(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<RawSaleItem[]> {
    const { data, error } = await this.supabase
      .from('sale_items')
      .select(`
        sale_id,
        product_id,
        product_name,
        qty,
        line_total_try,
        products(category),
        sales!inner(
          id,
          company_id,
          deleted_at,
          is_proforma,
          sale_date
        )
      `)
      .eq('sales.company_id', companyId)
      .is('sales.deleted_at', null)
      .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
      .gte('sales.sale_date', fromDate)
      .lte('sales.sale_date', toDate)

    if (error || !data) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as Array<Record<string, any>>).map(r => ({
      sale_id:        String(r.sale_id ?? ''),
      product_id:     r.product_id ? String(r.product_id) : null,
      product_name:   r.product_name ? String(r.product_name) : null,
      category:       (r.products as Record<string, unknown> | null)?.category as string | null,
      qty:            Number(r.qty ?? 0),
      line_total_try: Number(r.line_total_try ?? 0),
    }))
  }

  private async _fetchAllocations(companyId: string): Promise<RawAllocation[]> {
    const { data, error } = await this.supabase
      .from('sale_item_allocations')
      .select('sale_id, product_id, cost_price_try, qty_allocated')
      .eq('company_id', companyId)

    if (error || !data) return []
    return data as RawAllocation[]
  }
}
