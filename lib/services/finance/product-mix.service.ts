// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/product-mix.service.ts
//
// Product Mix Profitability Analysis
//
// Computes per-SKU contribution margin, classifies products using a modified
// BCG matrix (star / cash_cow / question_mark / dog), measures mix shift impact
// on overall profitability, and calculates product concentration risk (HHI).
//
// Pure functions exported for testing:
//   computeProductContributionMargin
//   computeProductContributionMarginRatio
//   classifyProductQuadrant
//   computeWeightedAverageMargin
//   computeMixShiftEffect
//   computeProductConcentrationRisk
//   rankProductsByProfit
//
// Class: ProductMixService
//   getReport(companyId)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductQuadrant = 'star' | 'cash_cow' | 'question_mark' | 'dog'

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeProductContributionMargin
 *
 * Revenue minus variable costs (COGS + direct variable costs).
 * May be negative for loss-making products.
 */
export function computeProductContributionMargin(
  revenue: number,
  variableCosts: number,
): number {
  return revenue - variableCosts
}

/**
 * computeProductContributionMarginRatio
 *
 * Returns (revenue - variableCosts) / revenue × 100.
 * null if revenue === 0 (cannot divide).
 */
export function computeProductContributionMarginRatio(
  revenue: number,
  variableCosts: number,
): number | null {
  if (revenue === 0) return null
  return ((revenue - variableCosts) / revenue) * 100
}

/**
 * classifyProductQuadrant
 *
 * Modified BCG matrix using revenue share as growth proxy and CM ratio as
 * profitability indicator.
 *
 * star:          revenuePct >= 20 AND margin >= 30
 * cash_cow:      revenuePct >= 20 AND margin < 30
 * question_mark: revenuePct < 20  AND margin >= 30  (high margin, low volume)
 * dog:           revenuePct < 20  AND margin < 30   (low margin, low volume)
 * null margin → dog (conservative)
 */
export function classifyProductQuadrant(
  revenuePctOfTotal: number,
  marginRatioPct: number | null,
): ProductQuadrant {
  if (marginRatioPct === null) return 'dog'

  const highRevenue = revenuePctOfTotal >= 20
  const highMargin  = marginRatioPct >= 30

  if (highRevenue && highMargin)  return 'star'
  if (highRevenue && !highMargin) return 'cash_cow'
  if (!highRevenue && highMargin) return 'question_mark'
  return 'dog'
}

/**
 * computeWeightedAverageMargin
 *
 * Revenue-weighted average CM ratio across all products.
 * Products with null margin_ratio_pct are skipped.
 * Returns null if no valid products or total revenue = 0.
 */
export function computeWeightedAverageMargin(
  products: Array<{
    revenue: number
    margin_ratio_pct: number | null
  }>,
): number | null {
  const valid = products.filter(p => p.margin_ratio_pct !== null)
  if (valid.length === 0) return null

  const totalRevenue = valid.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) return null

  const weightedSum = valid.reduce(
    (s, p) => s + p.revenue * (p.margin_ratio_pct as number),
    0,
  )
  return weightedSum / totalRevenue
}

/**
 * computeMixShiftEffect
 *
 * Measures the profit impact from changing product mix between two periods.
 *
 * For each product present in both current and prior mix:
 *   mix_delta = currentRevenuePct - priorRevenuePct
 *   effect    = (mix_delta / 100) × totalCurrentRevenue × (margin / 100)
 *
 * Products only in one period contribute 0 to mix shift.
 * Sum all effects.
 */
export function computeMixShiftEffect(
  priorMix: Array<{ product_id: string; revenue_pct: number; margin_ratio_pct: number | null }>,
  currentMix: Array<{ product_id: string; revenue_pct: number; margin_ratio_pct: number | null }>,
  totalCurrentRevenue: number,
): number {
  const priorMap = new Map<string, { revenue_pct: number; margin_ratio_pct: number | null }>()
  for (const p of priorMix) {
    priorMap.set(p.product_id, { revenue_pct: p.revenue_pct, margin_ratio_pct: p.margin_ratio_pct })
  }

  let total = 0
  for (const current of currentMix) {
    const prior = priorMap.get(current.product_id)
    if (!prior) continue                          // only in current → 0
    if (current.margin_ratio_pct === null) continue

    const mixDelta = current.revenue_pct - prior.revenue_pct
    const effect   = (mixDelta / 100) * totalCurrentRevenue * (current.margin_ratio_pct / 100)
    total += effect
  }

  return total
}

/**
 * computeProductConcentrationRisk
 *
 * Herfindahl-Hirschman Index (HHI): sum of squared market share percentages.
 * Range: 0–10,000.
 *
 * is_concentrated: HHI > 2500 OR top product share > 50%.
 */
export function computeProductConcentrationRisk(
  products: Array<{ product_id: string; revenue: number }>,
): {
  hhi: number
  top_product_share: number | null
  is_concentrated: boolean
} {
  if (products.length === 0) {
    return { hhi: 0, top_product_share: null, is_concentrated: false }
  }

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) {
    return { hhi: 0, top_product_share: null, is_concentrated: false }
  }

  let hhi = 0
  let maxShare = 0
  for (const p of products) {
    const sharePct = (p.revenue / totalRevenue) * 100
    hhi += sharePct * sharePct
    if (sharePct > maxShare) maxShare = sharePct
  }

  const top_product_share = maxShare
  const is_concentrated   = hhi > 2500 || top_product_share > 50

  return { hhi, top_product_share, is_concentrated }
}

/**
 * rankProductsByProfit
 *
 * Sorts products by contribution_margin descending. Assigns rank = 1-indexed position.
 */
export function rankProductsByProfit(
  products: Array<{
    product_id: string
    product_name: string
    revenue: number
    contribution_margin: number
    margin_ratio_pct: number | null
    quadrant: ProductQuadrant
  }>,
): Array<{
  rank: number
  product_id: string
  product_name: string
  revenue: number
  contribution_margin: number
  margin_ratio_pct: number | null
  quadrant: ProductQuadrant
}> {
  return [...products]
    .sort((a, b) => b.contribution_margin - a.contribution_margin)
    .map((p, i) => ({ rank: i + 1, ...p }))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function currentMonthBounds(): { from: string; to: string } {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = now.getMonth() + 1
  const ms  = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${ms}-01`,
    to:   `${ms}-${String(lastDay).padStart(2, '0')}`,
  }
}

function priorMonthBounds(): { from: string; to: string } {
  const now = new Date()
  const d   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const y   = d.getFullYear()
  const m   = d.getMonth() + 1
  const ms  = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${ms}-01`,
    to:   `${ms}-${String(lastDay).padStart(2, '0')}`,
  }
}

interface ProductAccum {
  product_id:    string
  product_name:  string
  revenue:       number
  variable_costs: number
}

// ── Service class ─────────────────────────────────────────────────────────────

export class ProductMixService {
  constructor(private supabase: AnyClient) {}

  /**
   * Fetch product-level revenue and variable cost data for the given date range.
   */
  private async fetchPeriodProducts(
    companyId: string,
    from: string,
    to: string,
  ): Promise<Map<string, ProductAccum>> {
    const accum = new Map<string, ProductAccum>()

    try {
      // Fetch sale_items joined with sales; join products for name
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          qty,
          total_try,
          unit_cost,
          sales!inner(
            sale_date,
            deleted_at,
            company_id,
            is_proforma
          ),
          products(
            id,
            name
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', from)
        .lte('sales.sale_date', to)

      if (!data) return accum

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of data as Array<Record<string, any>>) {
        const pid     = String(row.product_id ?? '')
        if (!pid) continue

        const qty         = Number(row.qty        ?? 0)
        const revenue     = Number(row.total_try  ?? 0)
        const unitCost    = Number(row.unit_cost   ?? 0)
        const prod        = row.products as Record<string, unknown> | null
        const productName = String(
          row.product_name ?? prod?.name ?? pid,
        )

        // Variable costs: unit_cost × qty if unit_cost available, else 60% estimate
        const varCosts = unitCost > 0
          ? unitCost * qty
          : revenue * 0.60

        const existing = accum.get(pid)
        if (existing) {
          existing.revenue        += revenue
          existing.variable_costs += varCosts
        } else {
          accum.set(pid, {
            product_id:     pid,
            product_name:   productName,
            revenue,
            variable_costs: varCosts,
          })
        }
      }
    } catch {
      // Graceful fallback — return whatever was accumulated
    }

    return accum
  }

  async getReport(companyId: string): Promise<{
    products: ReturnType<typeof rankProductsByProfit>
    quadrant_distribution: {
      star: number
      cash_cow: number
      question_mark: number
      dog: number
    }
    weighted_avg_margin_pct: number | null
    mix_shift_effect: number
    concentration_risk: ReturnType<typeof computeProductConcentrationRisk>
    total_revenue: number
    total_contribution_margin: number
    summary: {
      star_revenue_pct: number
      dog_revenue_pct: number
    }
  }> {
    const currentBounds = currentMonthBounds()
    const priorBounds   = priorMonthBounds()

    const [currentData, priorData] = await Promise.allSettled([
      this.fetchPeriodProducts(companyId, currentBounds.from, currentBounds.to),
      this.fetchPeriodProducts(companyId, priorBounds.from,   priorBounds.to),
    ])

    const current = currentData.status === 'fulfilled' ? currentData.value : new Map<string, ProductAccum>()
    const prior   = priorData.status   === 'fulfilled' ? priorData.value   : new Map<string, ProductAccum>()

    // ── Totals ─────────────────────────────────────────────────────────────────

    const totalRevenue = Array.from(current.values()).reduce((s, p) => s + p.revenue, 0)

    // ── Build product profiles ─────────────────────────────────────────────────

    const rawProducts = Array.from(current.values()).map(p => {
      const cm         = computeProductContributionMargin(p.revenue, p.variable_costs)
      const cmRatio    = computeProductContributionMarginRatio(p.revenue, p.variable_costs)
      const revPct     = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0
      const quadrant   = classifyProductQuadrant(revPct, cmRatio)
      return {
        product_id:          p.product_id,
        product_name:        p.product_name,
        revenue:             p.revenue,
        contribution_margin: cm,
        margin_ratio_pct:    cmRatio,
        quadrant,
      }
    })

    const products = rankProductsByProfit(rawProducts)

    // ── Quadrant distribution ──────────────────────────────────────────────────

    const quadrant_distribution = {
      star:          products.filter(p => p.quadrant === 'star').length,
      cash_cow:      products.filter(p => p.quadrant === 'cash_cow').length,
      question_mark: products.filter(p => p.quadrant === 'question_mark').length,
      dog:           products.filter(p => p.quadrant === 'dog').length,
    }

    // ── Weighted average margin ────────────────────────────────────────────────

    const weighted_avg_margin_pct = computeWeightedAverageMargin(
      rawProducts.map(p => ({ revenue: p.revenue, margin_ratio_pct: p.margin_ratio_pct })),
    )

    // ── Mix shift vs prior month ───────────────────────────────────────────────

    const priorTotalRevenue = Array.from(prior.values()).reduce((s, p) => s + p.revenue, 0)

    const currentMixForShift = rawProducts.map(p => ({
      product_id:      p.product_id,
      revenue_pct:     totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0,
      margin_ratio_pct: p.margin_ratio_pct,
    }))

    const priorMixForShift = Array.from(prior.values()).map(p => ({
      product_id:      p.product_id,
      revenue_pct:     priorTotalRevenue > 0 ? (p.revenue / priorTotalRevenue) * 100 : 0,
      margin_ratio_pct: computeProductContributionMarginRatio(p.revenue, p.variable_costs),
    }))

    const mix_shift_effect = priorMixForShift.length > 0
      ? computeMixShiftEffect(priorMixForShift, currentMixForShift, totalRevenue)
      : 0

    // ── Concentration risk ─────────────────────────────────────────────────────

    const concentration_risk = computeProductConcentrationRisk(
      rawProducts.map(p => ({ product_id: p.product_id, revenue: p.revenue })),
    )

    // ── Total CM ───────────────────────────────────────────────────────────────

    const total_contribution_margin = rawProducts.reduce((s, p) => s + p.contribution_margin, 0)

    // ── Summary ────────────────────────────────────────────────────────────────

    const starRevenue = rawProducts
      .filter(p => p.quadrant === 'star')
      .reduce((s, p) => s + p.revenue, 0)
    const dogRevenue  = rawProducts
      .filter(p => p.quadrant === 'dog')
      .reduce((s, p) => s + p.revenue, 0)

    const summary = {
      star_revenue_pct: totalRevenue > 0 ? (starRevenue / totalRevenue) * 100 : 0,
      dog_revenue_pct:  totalRevenue > 0 ? (dogRevenue  / totalRevenue) * 100 : 0,
    }

    return {
      products,
      quadrant_distribution,
      weighted_avg_margin_pct,
      mix_shift_effect,
      concentration_risk,
      total_revenue:             totalRevenue,
      total_contribution_margin,
      summary,
    }
  }
}
