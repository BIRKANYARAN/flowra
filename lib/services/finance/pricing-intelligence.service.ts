// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/pricing-intelligence.service.ts
//
// Pricing Intelligence — Discount Discipline & Price Realization Analysis
//
// Helps Turkish SMEs understand their pricing health, margin erosion, and
// discount discipline.
//
// Pure functions exported for testing:
//   computeEffectivePrice         — revenue / qty; null if qty = 0
//   computeDiscountRate           — % discount vs list price; null if listPrice = 0
//   classifyDiscountDiscipline    — disciplined | moderate | aggressive | distressed
//   computePriceRealization       — actual / list revenue × 100; null if listRevenue = 0
//   computePriceVariance          — % change vs prior avg price; null if priorAvgPrice = 0
//   classifyPricingPressure       — 5-tier pressure classification
//   computeSkuPricingHealth       — per-SKU discount & realization metrics
//
// Class: PricingIntelligenceService
//   getReport(companyId)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeEffectivePrice
 *
 * Returns revenue / quantity. null if quantity === 0.
 */
export function computeEffectivePrice(
  revenue: number,
  quantity: number,
): number | null {
  if (quantity === 0) return null
  return revenue / quantity
}

/**
 * computeDiscountRate
 *
 * Returns ((listPrice - effectivePrice) / listPrice) * 100.
 * null if listPrice === 0.
 * Result is clamped to [0, 100].
 */
export function computeDiscountRate(
  listPrice: number,
  effectivePrice: number,
): number | null {
  if (listPrice === 0) return null
  const raw = ((listPrice - effectivePrice) / listPrice) * 100
  return Math.min(100, Math.max(0, raw))
}

/**
 * classifyDiscountDiscipline
 *
 * disciplined: < 5%
 * moderate:    5–15%
 * aggressive:  15–30%
 * distressed:  >= 30%
 */
export function classifyDiscountDiscipline(
  avgDiscountPct: number,
): 'disciplined' | 'moderate' | 'aggressive' | 'distressed' {
  if (avgDiscountPct < 5)  return 'disciplined'
  if (avgDiscountPct < 15) return 'moderate'
  if (avgDiscountPct < 30) return 'aggressive'
  return 'distressed'
}

/**
 * computePriceRealization
 *
 * Returns (actualRevenue / listRevenue) * 100.
 * null if listRevenue === 0.
 */
export function computePriceRealization(
  actualRevenue: number,
  listRevenue: number,
): number | null {
  if (listRevenue === 0) return null
  return (actualRevenue / listRevenue) * 100
}

/**
 * computePriceVariance
 *
 * Returns ((currentAvgPrice - priorAvgPrice) / priorAvgPrice) * 100.
 * null if priorAvgPrice === 0.
 */
export function computePriceVariance(
  currentAvgPrice: number,
  priorAvgPrice: number,
): number | null {
  if (priorAvgPrice === 0) return null
  return ((currentAvgPrice - priorAvgPrice) / priorAvgPrice) * 100
}

/**
 * classifyPricingPressure
 *
 * insufficient_data : both inputs are null
 * under_pressure    : discountRate >= 25 AND (priceVariance <= -5 OR priceVariance null)
 * compressing       : priceVariance < -5 OR discountRate >= 20
 * expanding         : priceVariance > 5
 * stable            : priceVariance >= -5 AND priceVariance <= 5 AND discountRate < 15
 * else              : stable
 */
export function classifyPricingPressure(
  priceVariancePct: number | null,
  discountRatePct: number | null,
): 'expanding' | 'stable' | 'compressing' | 'under_pressure' | 'insufficient_data' {
  if (priceVariancePct === null && discountRatePct === null) return 'insufficient_data'

  // under_pressure: high discount + declining (or unknown) prices
  if (
    discountRatePct !== null &&
    discountRatePct >= 25 &&
    (priceVariancePct === null || priceVariancePct <= -5)
  ) {
    return 'under_pressure'
  }

  // compressing: price declining significantly OR heavy discounting
  if (
    (priceVariancePct !== null && priceVariancePct < -5) ||
    (discountRatePct !== null && discountRatePct >= 20)
  ) {
    return 'compressing'
  }

  // expanding: prices rising
  if (priceVariancePct !== null && priceVariancePct > 5) return 'expanding'

  // stable: prices roughly flat and discounts moderate
  if (
    priceVariancePct !== null &&
    priceVariancePct >= -5 &&
    priceVariancePct <= 5 &&
    (discountRatePct === null || discountRatePct < 15)
  ) {
    return 'stable'
  }

  return 'stable'
}

// ── SKU health ────────────────────────────────────────────────────────────────

export interface SkuPricingInput {
  product_id:       string
  product_name:     string
  qty_sold:         number
  revenue:          number
  list_price_total: number  // qty * list_price
}

export interface SkuPricingHealth {
  product_id:           string
  product_name:         string
  effective_price:      number | null
  discount_rate_pct:    number | null
  price_realization_pct: number | null
  discipline:           'disciplined' | 'moderate' | 'aggressive' | 'distressed' | null
}

/**
 * computeSkuPricingHealth
 *
 * For each item: computes effective price, discount rate vs list,
 * price realization, and discipline classification.
 * discipline = null if effective_price or discount_rate is null.
 */
export function computeSkuPricingHealth(
  items: SkuPricingInput[],
): SkuPricingHealth[] {
  return items.map(item => {
    const effective_price = computeEffectivePrice(item.revenue, item.qty_sold)

    // avg list price per unit
    const avgListPrice = item.qty_sold > 0 ? item.list_price_total / item.qty_sold : 0

    const discount_rate_pct =
      effective_price !== null
        ? computeDiscountRate(avgListPrice, effective_price)
        : null

    const price_realization_pct = computePriceRealization(
      item.revenue,
      item.list_price_total,
    )

    const discipline =
      discount_rate_pct !== null
        ? classifyDiscountDiscipline(discount_rate_pct)
        : null

    return {
      product_id:           item.product_id,
      product_name:         item.product_name,
      effective_price,
      discount_rate_pct,
      price_realization_pct,
      discipline,
    }
  })
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function currentMonthBounds(): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const monthStr = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${monthStr}-01`,
    to:   `${monthStr}-${String(lastDay).padStart(2, '0')}`,
  }
}

function priorMonthBounds(): { from: string; to: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const monthStr = `${y}-${String(m).padStart(2, '0')}`
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${monthStr}-01`,
    to:   `${monthStr}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ── Internal period data types ─────────────────────────────────────────────────

interface PeriodData {
  totalRevenue:    number
  totalQty:        number
  totalListRev:    number
  skuMap: Map<string, {
    product_id:    string
    product_name:  string
    qty:           number
    revenue:       number
    listRevenue:   number
  }>
}

// ── Service class ─────────────────────────────────────────────────────────────

export class PricingIntelligenceService {
  constructor(private supabase: AnyClient) {}

  /**
   * Fetch sale_items joined with sales and products for the given date range.
   * Returns aggregated pricing metrics.
   */
  private async fetchPeriodData(
    companyId: string,
    from: string,
    to: string,
  ): Promise<PeriodData> {
    const result: PeriodData = {
      totalRevenue:  0,
      totalQty:      0,
      totalListRev:  0,
      skuMap:        new Map(),
    }

    try {
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          qty,
          total_try,
          sales!inner(
            sale_date,
            deleted_at,
            company_id,
            payment_status
          ),
          products(
            id,
            name,
            default_sale_price,
            catalog_price
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .neq('sales.payment_status', 'cancelled')
        .gte('sales.sale_date', from)
        .lte('sales.sale_date', to)

      if (!data) return result

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const row of data as Array<Record<string, any>>) {
        const qty        = Number(row.qty       ?? 0)
        const revenue    = Number(row.total_try ?? 0)
        const productId  = String(row.product_id ?? '')
        const productName = String(row.product_name ?? row.products?.name ?? productId)

        // Determine list price: prefer default_sale_price, fall back to catalog_price
        const prod = row.products as Record<string, unknown> | null
        const listUnitPrice = prod
          ? Number(prod.default_sale_price ?? prod.catalog_price ?? 0)
          : 0
        const lineListRev = qty * listUnitPrice

        result.totalRevenue += revenue
        result.totalQty     += qty
        result.totalListRev += lineListRev

        const existing = result.skuMap.get(productId)
        if (existing) {
          existing.qty         += qty
          existing.revenue     += revenue
          existing.listRevenue += lineListRev
        } else {
          result.skuMap.set(productId, {
            product_id:  productId,
            product_name: productName,
            qty,
            revenue,
            listRevenue: lineListRev,
          })
        }
      }
    } catch {
      // Graceful fallback: return empty data
    }

    return result
  }

  async getReport(companyId: string): Promise<{
    current_period: {
      avg_discount_pct:     number | null
      price_realization_pct: number | null
      discount_discipline:  ReturnType<typeof classifyDiscountDiscipline> | null
      pricing_pressure:     ReturnType<typeof classifyPricingPressure>
      price_variance_pct:   number | null
    }
    sku_pricing:       SkuPricingHealth[]
    top_discounted_skus: Array<{ product_name: string; discount_rate_pct: number }>
    summary: {
      total_list_revenue:   number
      total_actual_revenue: number
      total_discount_amount: number
      sku_count:            number
    }
  }> {
    const currentBounds = currentMonthBounds()
    const priorBounds   = priorMonthBounds()

    const [currentResult, priorResult] = await Promise.allSettled([
      this.fetchPeriodData(companyId, currentBounds.from, currentBounds.to),
      this.fetchPeriodData(companyId, priorBounds.from,   priorBounds.to),
    ])

    const current = currentResult.status === 'fulfilled' ? currentResult.value : {
      totalRevenue: 0, totalQty: 0, totalListRev: 0, skuMap: new Map(),
    }
    const prior = priorResult.status === 'fulfilled' ? priorResult.value : {
      totalRevenue: 0, totalQty: 0, totalListRev: 0, skuMap: new Map(),
    }

    // ── Aggregate discount metrics ─────────────────────────────────────────────

    const avg_discount_pct =
      current.totalListRev > 0
        ? ((current.totalListRev - current.totalRevenue) / current.totalListRev) * 100
        : null

    const price_realization_pct = computePriceRealization(
      current.totalRevenue,
      current.totalListRev,
    )

    const discount_discipline =
      avg_discount_pct !== null
        ? classifyDiscountDiscipline(avg_discount_pct)
        : null

    // ── Price variance (current avg vs prior avg) ──────────────────────────────

    const currentAvgPrice = current.totalQty > 0
      ? current.totalRevenue / current.totalQty
      : 0
    const priorAvgPrice = prior.totalQty > 0
      ? prior.totalRevenue / prior.totalQty
      : 0

    const price_variance_pct = computePriceVariance(currentAvgPrice, priorAvgPrice)

    const pricing_pressure = classifyPricingPressure(
      price_variance_pct,
      avg_discount_pct,
    )

    // ── SKU health ─────────────────────────────────────────────────────────────

    const skuInputs: SkuPricingInput[] = Array.from(current.skuMap.values()).map(s => ({
      product_id:       s.product_id,
      product_name:     s.product_name,
      qty_sold:         s.qty,
      revenue:          s.revenue,
      list_price_total: s.listRevenue,
    }))

    const sku_pricing = computeSkuPricingHealth(skuInputs)

    // ── Top 5 discounted SKUs (descending by discount %) ──────────────────────

    const top_discounted_skus = sku_pricing
      .filter(s => s.discount_rate_pct !== null)
      .sort((a, b) => (b.discount_rate_pct ?? 0) - (a.discount_rate_pct ?? 0))
      .slice(0, 5)
      .map(s => ({
        product_name:    s.product_name,
        discount_rate_pct: s.discount_rate_pct as number,
      }))

    // ── Summary ───────────────────────────────────────────────────────────────

    const summary = {
      total_list_revenue:    current.totalListRev,
      total_actual_revenue:  current.totalRevenue,
      total_discount_amount: Math.max(0, current.totalListRev - current.totalRevenue),
      sku_count:             current.skuMap.size,
    }

    return {
      current_period: {
        avg_discount_pct,
        price_realization_pct,
        discount_discipline,
        pricing_pressure,
        price_variance_pct,
      },
      sku_pricing,
      top_discounted_skus,
      summary,
    }
  }
}
