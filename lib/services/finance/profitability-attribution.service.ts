// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/profitability-attribution.service.ts
//
// Profitability Attribution Analysis
//
// Decomposes profit by channel, time period, and product category to help
// Turkish SME owners understand which dimensions drive or drag profitability.
//
// Pure functions exported for testing:
//   computeAttributionShare
//   computeAttributionMarginLift
//   computeParetoAttribution
//   computeTimeSeriesAttribution
//   computeAttributionGini
//   identifyProfitDragDimensions
//
// Class: ProfitabilityAttributionService
//   getReport(companyId)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttributionDimension = 'product_category' | 'month' | 'customer_size' | 'payment_method'

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeAttributionShare
 *
 * Returns dimensionRevenue / totalRevenue × 100.
 * null if totalRevenue === 0.
 */
export function computeAttributionShare(
  dimensionRevenue: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (dimensionRevenue / totalRevenue) * 100
}

/**
 * computeAttributionMarginLift
 *
 * Returns dimensionMarginPct - totalMarginPct.
 * Positive = this dimension is above-average margin (favorable).
 * Negative = below average (drag).
 * null if either is null.
 */
export function computeAttributionMarginLift(
  dimensionMarginPct: number | null,
  totalMarginPct: number | null,
): number | null {
  if (dimensionMarginPct === null || totalMarginPct === null) return null
  return dimensionMarginPct - totalMarginPct
}

/**
 * computeParetoAttribution
 *
 * Sort by margin descending.
 * Compute cumulative margin percentage as running total.
 * is_pareto_80 = true if cumulative margin up to this item <= 80%.
 * revenue_pct and margin_pct as % of total.
 */
export function computeParetoAttribution(
  dimensions: Array<{ name: string; revenue: number; margin: number }>,
): Array<{
  name: string
  revenue: number
  margin: number
  revenue_pct: number
  margin_pct: number | null
  cumulative_revenue_pct: number
  is_pareto_80: boolean
}> {
  if (dimensions.length === 0) return []

  const totalRevenue = dimensions.reduce((s, d) => s + d.revenue, 0)
  const totalMargin  = dimensions.reduce((s, d) => s + d.margin,  0)

  // Sort by margin descending
  const sorted = [...dimensions].sort((a, b) => b.margin - a.margin)

  let cumulativeMargin  = 0
  let cumulativeRevenue = 0

  return sorted.map(d => {
    cumulativeMargin  += d.margin
    cumulativeRevenue += d.revenue

    const revenue_pct          = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0
    const margin_pct           = totalMargin  !== 0 ? (d.margin  / totalMargin)  * 100 : null
    const cumulative_margin_pct = totalMargin !== 0
      ? (cumulativeMargin / totalMargin) * 100
      : 0
    const cumulative_revenue_pct = totalRevenue > 0
      ? (cumulativeRevenue / totalRevenue) * 100
      : 0

    // is_pareto_80: this item is in the top group whose cumulative margin <= 80%
    // We use a "running cumulative BEFORE this item <= 80%" logic, meaning we
    // include an item if adding it brings us to or past 80% of margin.
    const prior_cumulative = totalMargin !== 0
      ? ((cumulativeMargin - d.margin) / totalMargin) * 100
      : 0
    const is_pareto_80 = prior_cumulative < 80

    return {
      name: d.name,
      revenue: d.revenue,
      margin: d.margin,
      revenue_pct,
      margin_pct,
      cumulative_revenue_pct,
      is_pareto_80,
    }
  })
}

/**
 * computeTimeSeriesAttribution
 *
 * Computes per-month statistics including:
 * - margin_pct (gross_margin / revenue × 100)
 * - revenue_mom_pct  (vs prior month, null for first)
 * - margin_mom_pct   (margin % change vs prior month, null for first)
 * - is_peak_month    (highest margin month)
 * - is_trough_month  (lowest margin month)
 */
export function computeTimeSeriesAttribution(
  months: Array<{
    month: string       // 'YYYY-MM'
    revenue: number
    gross_margin: number
  }>,
): Array<{
  month: string
  revenue: number
  gross_margin: number
  margin_pct: number | null
  revenue_mom_pct: number | null
  margin_mom_pct: number | null
  is_peak_month: boolean
  is_trough_month: boolean
}> {
  if (months.length === 0) return []

  // Compute margin_pct per month
  const withMargin = months.map(m => ({
    ...m,
    margin_pct: m.revenue > 0 ? (m.gross_margin / m.revenue) * 100 : null,
  }))

  // Find peak and trough based on margin_pct (only months with valid margin_pct)
  const validMargins = withMargin.filter(m => m.margin_pct !== null)
  let peakMonthStr:   string | null = null
  let troughMonthStr: string | null = null

  if (validMargins.length > 0) {
    const peak   = validMargins.reduce((best, m) => (m.margin_pct! > best.margin_pct! ? m : best))
    const trough = validMargins.reduce((worst, m) => (m.margin_pct! < worst.margin_pct! ? m : worst))
    peakMonthStr   = peak.month
    troughMonthStr = trough.month
  }

  return withMargin.map((m, i) => {
    const prior = i > 0 ? withMargin[i - 1] : null

    const revenue_mom_pct = prior !== null && prior.revenue > 0
      ? ((m.revenue - prior.revenue) / prior.revenue) * 100
      : null

    let margin_mom_pct: number | null = null
    if (prior !== null && prior.margin_pct !== null && m.margin_pct !== null) {
      margin_mom_pct = m.margin_pct - prior.margin_pct
    }

    return {
      month: m.month,
      revenue: m.revenue,
      gross_margin: m.gross_margin,
      margin_pct: m.margin_pct,
      revenue_mom_pct,
      margin_mom_pct,
      is_peak_month:   m.month === peakMonthStr,
      is_trough_month: m.month === troughMonthStr,
    }
  })
}

/**
 * computeAttributionGini
 *
 * Gini coefficient for attribution concentration (0 = equal, 1 = all in one).
 * null if < 2 values or total = 0.
 *
 * Formula:
 *   Sort ascending.
 *   Gini = (2 × Σ(i × values[i]) / (n × Σ values[i])) - (n+1)/n
 *   where i is 1-indexed rank position.
 *   Result clamped to [0, 1].
 */
export function computeAttributionGini(values: number[]): number | null {
  if (values.length < 2) return null

  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return null

  // Sort ascending
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length

  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i]   // 1-indexed
  }

  const gini = (2 * weightedSum) / (n * total) - (n + 1) / n

  // Clamp to [0, 1]
  return Math.min(1, Math.max(0, gini))
}

/**
 * identifyProfitDragDimensions
 *
 * Returns dimensions that are:
 *   1. Above significanceThreshold (default 5%) revenue share AND
 *   2. margin_pct is null OR margin_pct < totalMarginPct - 5 (meaningful drag)
 *
 * Sorted by drag_magnitude descending.
 */
export function identifyProfitDragDimensions(
  dimensions: Array<{
    name: string
    margin_pct: number | null
    revenue: number
  }>,
  totalMarginPct: number | null,
  significanceThreshold = 5,
): Array<{
  name: string
  margin_pct: number | null
  revenue: number
  revenue_pct: number | null
  drag_magnitude: number | null
}> {
  const totalRevenue = dimensions.reduce((s, d) => s + d.revenue, 0)

  const results = dimensions
    .map(d => {
      const revenue_pct = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : null

      // drag_magnitude = totalMarginPct - dimensionMarginPct (positive = drag)
      const drag_magnitude =
        totalMarginPct !== null && d.margin_pct !== null
          ? totalMarginPct - d.margin_pct
          : null

      return {
        name: d.name,
        margin_pct: d.margin_pct,
        revenue: d.revenue,
        revenue_pct,
        drag_magnitude,
      }
    })
    .filter(d => {
      // Must be above significance threshold
      if (d.revenue_pct === null || d.revenue_pct < significanceThreshold) return false

      // Null margin → include as drag (unknown profitability)
      if (d.margin_pct === null) return true

      // Must be meaningfully below total margin (by more than 5 percentage points)
      if (totalMarginPct === null) return false
      return d.margin_pct < totalMarginPct - 5
    })

  // Sort by drag_magnitude descending (nulls last)
  return results.sort((a, b) => {
    if (a.drag_magnitude === null && b.drag_magnitude === null) return 0
    if (a.drag_magnitude === null) return 1
    if (b.drag_magnitude === null) return -1
    return b.drag_magnitude - a.drag_magnitude
  })
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function last12MonthBounds(): { from: string; to: string } {
  const now   = new Date()
  const toStr = now.toISOString().slice(0, 10)

  const fromDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const fromStr  = fromDate.toISOString().slice(0, 10)

  return { from: fromStr, to: toStr }
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class ProfitabilityAttributionService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    by_category: ReturnType<typeof computeParetoAttribution>
    by_month: ReturnType<typeof computeTimeSeriesAttribution>
    overall_margin_pct: number | null
    gini_by_category: number | null
    profit_drags: ReturnType<typeof identifyProfitDragDimensions>
    summary: {
      pareto_80_category_count: number
      total_categories: number
      best_month: string | null
      worst_month: string | null
      margin_volatility_pct: number | null
    }
  }> {
    const { from, to } = last12MonthBounds()

    // ── 1. Fetch sales + sale_items + products grouped by category ─────────────
    interface CategoryAccum {
      name: string
      revenue: number
      cogs: number
    }

    const categoryMap = new Map<string, CategoryAccum>()
    let totalRevenue = 0
    let totalCogs    = 0

    try {
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          qty,
          total_try,
          unit_cost,
          products(
            id,
            category
          ),
          sales!inner(
            sale_date,
            deleted_at,
            company_id,
            payment_status
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', from)
        .lte('sales.sale_date', to)
        .not('sales.payment_status', 'eq', 'cancelled')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (data ?? []) as Array<Record<string, any>>) {
        const qty       = Number(row.qty       ?? 0)
        const revenue   = Number(row.total_try ?? 0)
        const unitCost  = Number(row.unit_cost ?? 0)
        const prod      = row.products as Record<string, unknown> | null
        const category  = String(prod?.category ?? 'Diğer')

        const cogs = unitCost > 0 ? unitCost * qty : revenue * 0.60

        totalRevenue += revenue
        totalCogs    += cogs

        const existing = categoryMap.get(category)
        if (existing) {
          existing.revenue += revenue
          existing.cogs    += cogs
        } else {
          categoryMap.set(category, { name: category, revenue, cogs })
        }
      }
    } catch {
      // Graceful fallback — proceed with empty map
    }

    // ── 2. Fetch monthly revenue + COGS via expenses estimate ─────────────────
    interface MonthAccum {
      revenue: number
      cogs: number
    }

    const monthMap = new Map<string, MonthAccum>()

    try {
      const { data } = await this.supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('payment_status', 'eq', 'cancelled')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (data ?? []) as Array<Record<string, any>>) {
        const dateStr = String(row.sale_date ?? '')
        const month   = dateStr.slice(0, 7)   // 'YYYY-MM'
        if (month.length !== 7) continue

        const revenue = Number(row.total_try ?? 0)

        const existing = monthMap.get(month)
        if (existing) {
          existing.revenue += revenue
        } else {
          monthMap.set(month, { revenue, cogs: 0 })
        }
      }
    } catch {
      // Graceful fallback
    }

    // ── 3. Fetch monthly COGS via sale_items ──────────────────────────────────
    try {
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          qty,
          total_try,
          unit_cost,
          sales!inner(
            sale_date,
            deleted_at,
            company_id,
            payment_status
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', from)
        .lte('sales.sale_date', to)
        .not('sales.payment_status', 'eq', 'cancelled')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of (data ?? []) as Array<Record<string, any>>) {
        const sale    = row.sales as Record<string, unknown> | null
        const dateStr = String(sale?.sale_date ?? '')
        const month   = dateStr.slice(0, 7)
        if (month.length !== 7) continue

        const qty      = Number(row.qty       ?? 0)
        const revenue  = Number(row.total_try ?? 0)
        const unitCost = Number(row.unit_cost ?? 0)
        const cogs     = unitCost > 0 ? unitCost * qty : revenue * 0.60

        const existing = monthMap.get(month)
        if (existing) {
          existing.cogs += cogs
        }
      }
    } catch {
      // Graceful fallback
    }

    // ── 4. Compute overall margin ─────────────────────────────────────────────
    const totalGrossMargin = totalRevenue - totalCogs
    const overall_margin_pct = totalRevenue > 0
      ? (totalGrossMargin / totalRevenue) * 100
      : null

    // ── 5. Build by_category Pareto ───────────────────────────────────────────
    const categoryDimensions = Array.from(categoryMap.values()).map(c => ({
      name:    c.name,
      revenue: c.revenue,
      margin:  c.revenue - c.cogs,
    }))

    const by_category = computeParetoAttribution(categoryDimensions)

    // ── 6. Build by_month time series ─────────────────────────────────────────
    const monthKeys = Array.from(monthMap.keys()).sort()
    const monthSeries = monthKeys.map(month => {
      const m = monthMap.get(month)!
      return {
        month,
        revenue:      m.revenue,
        gross_margin: m.revenue - m.cogs,
      }
    })

    const by_month = computeTimeSeriesAttribution(monthSeries)

    // ── 7. Gini by category ───────────────────────────────────────────────────
    const categoryMargins = categoryDimensions.map(c => c.margin)
    const gini_by_category = computeAttributionGini(categoryMargins)

    // ── 8. Profit drags ───────────────────────────────────────────────────────
    const categoryForDrags = by_category.map(c => ({
      name:       c.name,
      margin_pct: c.revenue > 0 ? (c.margin / c.revenue) * 100 : null,
      revenue:    c.revenue,
    }))

    const profit_drags = identifyProfitDragDimensions(categoryForDrags, overall_margin_pct)

    // ── 9. Summary ────────────────────────────────────────────────────────────
    const pareto_80_category_count = by_category.filter(c => c.is_pareto_80).length
    const total_categories         = by_category.length

    const best_month  = by_month.find(m => m.is_peak_month)?.month   ?? null
    const worst_month = by_month.find(m => m.is_trough_month)?.month ?? null

    const validMonthMargins = by_month
      .map(m => m.margin_pct)
      .filter((v): v is number => v !== null)

    const margin_volatility_pct = stdDev(validMonthMargins)

    return {
      by_category,
      by_month,
      overall_margin_pct,
      gini_by_category,
      profit_drags,
      summary: {
        pareto_80_category_count,
        total_categories,
        best_month,
        worst_month,
        margin_volatility_pct,
      },
    }
  }
}
