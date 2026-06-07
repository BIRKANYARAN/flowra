// ── CategoryPerformanceService — Product Category Sales Performance Analysis ──
// Analyzes sales performance at the product category level.
// Includes growth, margin, mix shift, and HHI concentration analysis.
//
// Pure helpers are exported for unit testing without a DB connection.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CategoryMetrics {
  category_id: string | null
  category_name: string
  revenue_try: number
  units_sold: number
  deal_count: number
  avg_order_value: number       // revenue / deal_count, 0 if none
  avg_unit_price: number        // revenue / units_sold, 0 if none
  gross_margin_try: number
  gross_margin_pct: number | null  // gross_margin / revenue × 100
  revenue_share_pct: number     // this category / total revenue × 100
  unit_share_pct: number        // this category's units / total units × 100
}

export interface CategoryGrowth {
  category_id: string | null
  category_name: string
  current_revenue: number
  prior_revenue: number
  revenue_growth_pct: number | null  // null if prior = 0
  current_margin_pct: number | null
  prior_margin_pct: number | null
  margin_change_pp: number | null    // percentage points
}

export interface CategoryPerformanceReport {
  current_period: string           // YYYY-MM (current month)
  prior_period: string             // YYYY-MM (same month prior year)
  categories: CategoryMetrics[]    // sorted by revenue DESC
  category_growths: CategoryGrowth[]
  mix_shifts: ReturnType<typeof detectMixShift>
  portfolio_hhi: number
  concentration_level: ReturnType<typeof classifyCategoryConcentration>
  portfolio_growth_pct: number | null
  weighted_avg_margin_pct: number | null
  growth_momentum: ReturnType<typeof classifyCategoryGrowthMomentum>
  fastest_growing: CategoryGrowth | null
  slowest_growing: CategoryGrowth | null
  top_category: CategoryMetrics | null
  narrative: string
  total_revenue_try: number
  total_units: number
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

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute average order value: revenue / dealCount.
 * Returns 0 if dealCount === 0.
 */
export function computeAvgOrderValue(revenue: number, dealCount: number): number {
  if (dealCount === 0) return 0
  return revenue / dealCount
}

/**
 * Compute average unit price: revenue / units.
 * Returns 0 if units === 0.
 */
export function computeAvgUnitPrice(revenue: number, units: number): number {
  if (units === 0) return 0
  return revenue / units
}

/**
 * Compute gross margin percentage: grossMargin / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeGrossMarginPct(grossMargin: number, revenue: number): number | null {
  if (revenue === 0) return null
  return (grossMargin / revenue) * 100
}

/**
 * Compute revenue share: categoryRevenue / totalRevenue × 100.
 * Returns 0 if totalRevenue === 0.
 */
export function computeRevenueShare(categoryRevenue: number, totalRevenue: number): number {
  if (totalRevenue === 0) return 0
  return (categoryRevenue / totalRevenue) * 100
}

/**
 * Compute revenue growth: (current - prior) / prior × 100.
 * Returns null if prior === 0.
 */
export function computeRevenueGrowth(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / prior) * 100
}

/**
 * Compute margin change in percentage points: currentMarginPct - priorMarginPct.
 * Returns null if either is null.
 */
export function computeMarginChangePp(
  currentMarginPct: number | null,
  priorMarginPct: number | null,
): number | null {
  if (currentMarginPct === null || priorMarginPct === null) return null
  return currentMarginPct - priorMarginPct
}

/**
 * Compute category HHI based on revenue_share_pct: Σ(share/100)².
 * Range 0 to 1. Returns 0 if empty.
 */
export function computeCategoryHhi(categories: CategoryMetrics[]): number {
  if (categories.length === 0) return 0
  return categories.reduce((sum, c) => sum + Math.pow(c.revenue_share_pct / 100, 2), 0)
}

/**
 * Classify category concentration based on HHI value.
 * diversified: hhi < 0.15
 * moderate: hhi < 0.25
 * concentrated: hhi < 0.50
 * highly_concentrated: >= 0.50
 */
export function classifyCategoryConcentration(
  hhi: number,
): 'diversified' | 'moderate' | 'concentrated' | 'highly_concentrated' {
  if (hhi < 0.15) return 'diversified'
  if (hhi < 0.25) return 'moderate'
  if (hhi < 0.50) return 'concentrated'
  return 'highly_concentrated'
}

/**
 * Rank categories by revenue_try descending.
 */
export function rankCategoriesByRevenue(categories: CategoryMetrics[]): CategoryMetrics[] {
  return [...categories].sort((a, b) => b.revenue_try - a.revenue_try)
}

/**
 * Find the fastest growing category (highest non-null revenue_growth_pct).
 * Returns null if empty or all growth values are null.
 */
export function findFastestGrowingCategory(growths: CategoryGrowth[]): CategoryGrowth | null {
  const withGrowth = growths.filter(g => g.revenue_growth_pct !== null)
  if (withGrowth.length === 0) return null
  return withGrowth.reduce((best, g) =>
    g.revenue_growth_pct! > best.revenue_growth_pct! ? g : best,
  )
}

/**
 * Find the slowest growing category (lowest non-null revenue_growth_pct, can be most negative).
 * Returns null if empty or all growth values are null.
 */
export function findSlowestGrowingCategory(growths: CategoryGrowth[]): CategoryGrowth | null {
  const withGrowth = growths.filter(g => g.revenue_growth_pct !== null)
  if (withGrowth.length === 0) return null
  return withGrowth.reduce((worst, g) =>
    g.revenue_growth_pct! < worst.revenue_growth_pct! ? g : worst,
  )
}

/**
 * Compute portfolio growth rate: (current - prior) / prior × 100.
 * Returns null if prior === 0.
 */
export function computePortfolioGrowthRate(
  currentTotalRevenue: number,
  priorTotalRevenue: number,
): number | null {
  if (priorTotalRevenue === 0) return null
  return ((currentTotalRevenue - priorTotalRevenue) / priorTotalRevenue) * 100
}

/**
 * Detect mix shifts between current and prior periods (matched by category_name).
 * gaining: share_change_pp > 1pp
 * losing: share_change_pp < -1pp
 * stable: within ±1pp
 */
export function detectMixShift(
  current: CategoryMetrics[],
  prior: CategoryMetrics[],
): Array<{
  category_name: string
  current_share_pct: number
  prior_share_pct: number
  share_change_pp: number
  shift_type: 'gaining' | 'losing' | 'stable'
}> {
  const priorMap = new Map<string, number>()
  for (const p of prior) {
    priorMap.set(p.category_name, p.revenue_share_pct)
  }

  const result: Array<{
    category_name: string
    current_share_pct: number
    prior_share_pct: number
    share_change_pp: number
    shift_type: 'gaining' | 'losing' | 'stable'
  }> = []

  for (const c of current) {
    const priorShare = priorMap.get(c.category_name) ?? 0
    const change = c.revenue_share_pct - priorShare
    let shift_type: 'gaining' | 'losing' | 'stable'
    if (change > 1) shift_type = 'gaining'
    else if (change < -1) shift_type = 'losing'
    else shift_type = 'stable'

    result.push({
      category_name: c.category_name,
      current_share_pct: c.revenue_share_pct,
      prior_share_pct: priorShare,
      share_change_pp: change,
      shift_type,
    })
  }

  return result
}

/**
 * Compute weighted average margin: Σ(gross_margin_try) / Σ(revenue_try) × 100.
 * Returns null if total revenue === 0.
 */
export function computeWeightedAvgMargin(categories: CategoryMetrics[]): number | null {
  const totalRevenue = categories.reduce((s, c) => s + c.revenue_try, 0)
  if (totalRevenue === 0) return null
  const totalMargin = categories.reduce((s, c) => s + c.gross_margin_try, 0)
  return (totalMargin / totalRevenue) * 100
}

/**
 * Classify category growth momentum.
 * insufficient_data: null portfolio growth
 * declining: portfolioGrowthPct < 0
 * weak: portfolioGrowthPct < 5
 * moderate: portfolioGrowthPct < 15 OR categoriesAbovePortfolio / total < 0.5
 * strong_narrow: >= 15% but < 50% of categories above portfolio
 * strong_broad: >= 15% AND >= 50% of categories above portfolio
 */
export function classifyCategoryGrowthMomentum(
  portfolioGrowthPct: number | null,
  categoriesAbovePortfolio: number,
  totalCategories: number,
): 'strong_broad' | 'strong_narrow' | 'moderate' | 'weak' | 'declining' | 'insufficient_data' {
  if (portfolioGrowthPct === null) return 'insufficient_data'
  if (portfolioGrowthPct < 0) return 'declining'
  if (portfolioGrowthPct < 5) return 'weak'
  // portfolioGrowthPct >= 5
  if (portfolioGrowthPct < 15) return 'moderate'
  // portfolioGrowthPct >= 15
  const aboveRatio = totalCategories > 0 ? categoriesAbovePortfolio / totalCategories : 0
  if (aboveRatio >= 0.5) return 'strong_broad'
  return 'strong_narrow'
}

/**
 * Generate a deterministic Turkish narrative describing the portfolio state.
 */
export function generateCategoryNarrative(
  momentum: ReturnType<typeof classifyCategoryGrowthMomentum>,
  concentration: ReturnType<typeof classifyCategoryConcentration>,
  topCategory: CategoryMetrics | null,
  portfolioGrowthPct: number | null,
): string {
  switch (momentum) {
    case 'strong_broad':
      return 'Ürün kategorilerinde geniş tabanlı büyüme — portföy dengeli.'
    case 'strong_narrow':
      return 'Büyüme belirli kategorilerde yoğunlaşmış — çeşitlendirme önerilir.'
    case 'moderate':
      return 'Kategoriler ılımlı büyüme seyrediyor.'
    case 'weak':
      return 'Kategori büyümesi zayıf — ürün stratejisi gözden geçirilmeli.'
    case 'declining':
      return 'Kategori gelirleri düşüşte — öncelikli dikkat gerekiyor.'
    case 'insufficient_data':
      return 'Karşılaştırmalı kategori verisi yetersiz.'
  }
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function currentYearMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function yearMonthRange(ym: string): { from: string; to: string } {
  const [year, month] = ym.split('-').map(Number)
  const from = `${ym}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${ym}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function priorYearMonth(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return `${year - 1}-${String(month).padStart(2, '0')}`
}

// ── Category aggregation ──────────────────────────────────────────────────────

interface CategoryAccum {
  category_id: string | null
  category_name: string
  revenue_try: number
  units_sold: number
  sale_ids: Set<string>
  gross_margin_try: number
}

function buildCategoryMap(
  items: RawSaleItem[],
  allocMap: Map<string, number>,
): Map<string, CategoryAccum> {
  const catMap = new Map<string, CategoryAccum>()

  for (const item of items) {
    const catName = item.category?.trim() || 'Kategorisiz'
    const catId = item.category || null

    if (!catMap.has(catName)) {
      catMap.set(catName, {
        category_id: catId,
        category_name: catName,
        revenue_try: 0,
        units_sold: 0,
        sale_ids: new Set(),
        gross_margin_try: 0,
      })
    }

    const acc = catMap.get(catName)!
    const qty = Number(item.qty ?? 0)
    const rev = Number(item.line_total_try ?? 0)

    acc.revenue_try += rev
    acc.units_sold += qty
    if (item.sale_id) acc.sale_ids.add(item.sale_id)

    // COGS from allocation
    const allocKey = `${item.sale_id}__${item.product_id}`
    const cogs = item.product_id && item.sale_id ? (allocMap.get(allocKey) ?? 0) : 0
    acc.gross_margin_try += rev - cogs
  }

  return catMap
}

function toCategoryMetrics(
  accum: CategoryAccum,
  totalRevenue: number,
  totalUnits: number,
): CategoryMetrics {
  const { category_id, category_name, revenue_try, units_sold, sale_ids, gross_margin_try } = accum
  const deal_count = sale_ids.size
  return {
    category_id,
    category_name,
    revenue_try,
    units_sold,
    deal_count,
    avg_order_value: computeAvgOrderValue(revenue_try, deal_count),
    avg_unit_price: computeAvgUnitPrice(revenue_try, units_sold),
    gross_margin_try,
    gross_margin_pct: computeGrossMarginPct(gross_margin_try, revenue_try),
    revenue_share_pct: computeRevenueShare(revenue_try, totalRevenue),
    unit_share_pct: computeRevenueShare(units_sold, totalUnits),
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class CategoryPerformanceService {
  constructor(private readonly supabase: AnySupabase) {}

  async getReport(companyId: string): Promise<CategoryPerformanceReport> {
    const currentPeriod = currentYearMonth()
    const priorPeriod = priorYearMonth(currentPeriod)
    const currentRange = yearMonthRange(currentPeriod)
    const priorRange = yearMonthRange(priorPeriod)

    // ── Fetch sale items + allocations in parallel ────────────────────────────
    const [currentItemsResult, priorItemsResult, allocResult] = await Promise.allSettled([
      this._fetchSaleItems(companyId, currentRange.from, currentRange.to),
      this._fetchSaleItems(companyId, priorRange.from, priorRange.to),
      this._fetchAllocations(companyId),
    ])

    const currentItems = currentItemsResult.status === 'fulfilled' ? currentItemsResult.value : []
    const priorItems = priorItemsResult.status === 'fulfilled' ? priorItemsResult.value : []
    const allocations = allocResult.status === 'fulfilled' ? allocResult.value : []

    // ── Build allocation lookup: sale_id__product_id → COGS ──────────────────
    const allocMap = new Map<string, number>()
    for (const a of allocations) {
      if (!a.sale_id || !a.product_id) continue
      const key = `${a.sale_id}__${a.product_id}`
      allocMap.set(key, (allocMap.get(key) ?? 0) + Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0))
    }

    // ── Aggregate current period ──────────────────────────────────────────────
    const currentCatMap = buildCategoryMap(currentItems, allocMap)
    const currentTotalRevenue = Array.from(currentCatMap.values()).reduce((s, c) => s + c.revenue_try, 0)
    const currentTotalUnits = Array.from(currentCatMap.values()).reduce((s, c) => s + c.units_sold, 0)

    const categories: CategoryMetrics[] = rankCategoriesByRevenue(
      Array.from(currentCatMap.values()).map(acc =>
        toCategoryMetrics(acc, currentTotalRevenue, currentTotalUnits),
      ),
    )

    // ── Aggregate prior period ────────────────────────────────────────────────
    const priorCatMap = buildCategoryMap(priorItems, allocMap)
    const priorTotalRevenue = Array.from(priorCatMap.values()).reduce((s, c) => s + c.revenue_try, 0)
    const priorTotalUnits = Array.from(priorCatMap.values()).reduce((s, c) => s + c.units_sold, 0)

    const priorCategories: CategoryMetrics[] = Array.from(priorCatMap.values()).map(acc =>
      toCategoryMetrics(acc, priorTotalRevenue, priorTotalUnits),
    )

    // ── Category growths ──────────────────────────────────────────────────────
    const priorByName = new Map<string, CategoryMetrics>()
    for (const p of priorCategories) priorByName.set(p.category_name, p)

    const category_growths: CategoryGrowth[] = categories.map(c => {
      const prior = priorByName.get(c.category_name)
      const priorRevenue = prior?.revenue_try ?? 0
      const priorMarginPct = prior?.gross_margin_pct ?? null
      return {
        category_id: c.category_id,
        category_name: c.category_name,
        current_revenue: c.revenue_try,
        prior_revenue: priorRevenue,
        revenue_growth_pct: computeRevenueGrowth(c.revenue_try, priorRevenue),
        current_margin_pct: c.gross_margin_pct,
        prior_margin_pct: priorMarginPct,
        margin_change_pp: computeMarginChangePp(c.gross_margin_pct, priorMarginPct),
      }
    })

    // ── Portfolio metrics ─────────────────────────────────────────────────────
    const portfolio_hhi = computeCategoryHhi(categories)
    const concentration_level = classifyCategoryConcentration(portfolio_hhi)
    const portfolio_growth_pct = computePortfolioGrowthRate(currentTotalRevenue, priorTotalRevenue)
    const weighted_avg_margin_pct = computeWeightedAvgMargin(categories)
    const mix_shifts = detectMixShift(categories, priorCategories)
    const fastest_growing = findFastestGrowingCategory(category_growths)
    const slowest_growing = findSlowestGrowingCategory(category_growths)
    const top_category = categories.length > 0 ? categories[0] : null

    // ── Growth momentum ───────────────────────────────────────────────────────
    const categoriesAbovePortfolio = portfolio_growth_pct !== null
      ? category_growths.filter(
          g => g.revenue_growth_pct !== null && g.revenue_growth_pct > portfolio_growth_pct,
        ).length
      : 0

    const growth_momentum = classifyCategoryGrowthMomentum(
      portfolio_growth_pct,
      categoriesAbovePortfolio,
      categories.length,
    )

    const narrative = generateCategoryNarrative(
      growth_momentum,
      concentration_level,
      top_category,
      portfolio_growth_pct,
    )

    return {
      current_period: currentPeriod,
      prior_period: priorPeriod,
      categories,
      category_growths,
      mix_shifts,
      portfolio_hhi,
      concentration_level,
      portfolio_growth_pct,
      weighted_avg_margin_pct,
      growth_momentum,
      fastest_growing,
      slowest_growing,
      top_category,
      narrative,
      total_revenue_try: currentTotalRevenue,
      total_units: currentTotalUnits,
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
          sale_date
        )
      `)
      .eq('sales.company_id', companyId)
      .is('sales.deleted_at', null)
      .gte('sales.sale_date', fromDate)
      .lte('sales.sale_date', toDate)

    if (error || !data) return []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as Array<Record<string, any>>).map(r => ({
      sale_id:       String(r.sale_id ?? ''),
      product_id:    r.product_id ? String(r.product_id) : null,
      product_name:  r.product_name ? String(r.product_name) : null,
      category:      (r.products as Record<string, unknown> | null)?.category as string | null,
      qty:           Number(r.qty ?? 0),
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
