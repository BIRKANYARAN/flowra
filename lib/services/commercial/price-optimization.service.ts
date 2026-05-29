// ── PriceOptimizationService — Discount & Price Analytics ────────────────────
// Analyses per-product discount rates, price realization, revenue lost to
// discounts, price consistency, and optimal price recommendations.
//
// Pure helpers are exported for unit testing without a DB connection.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute discount rate from a sale item.
 * Returns null if listPrice <= 0.
 * Formula: (listPrice - actualPrice) / listPrice × 100
 */
export function computeDiscountRate(
  listPrice: number,
  actualPrice: number,
): number | null {
  if (listPrice <= 0) return null
  return ((listPrice - actualPrice) / listPrice) * 100
}

/**
 * Classify discount level.
 */
export function classifyDiscountLevel(
  discountPct: number | null,
): 'no_discount' | 'minimal' | 'standard' | 'heavy' | 'excessive' | 'insufficient_data' {
  if (discountPct === null) return 'insufficient_data'
  if (discountPct <= 0) return 'no_discount'
  if (discountPct <= 5) return 'minimal'
  if (discountPct <= 15) return 'standard'
  if (discountPct <= 30) return 'heavy'
  return 'excessive'
}

/**
 * Compute revenue-weighted average discount rate across sale items.
 * Weight = qty × actualPrice.
 * Returns null if total revenue = 0.
 */
export function computeAvgDiscountRate(
  items: Array<{ list_price: number; actual_price: number; qty: number }>,
): number | null {
  let weightedSum = 0
  let totalRevenue = 0
  for (const item of items) {
    const rev = item.qty * item.actual_price
    const dr = computeDiscountRate(item.list_price, item.actual_price)
    if (dr !== null) {
      weightedSum += dr * rev
    }
    totalRevenue += rev
  }
  if (totalRevenue === 0) return null
  return weightedSum / totalRevenue
}

/**
 * Compute discount frequency: % of items where actualPrice < listPrice.
 * Returns null if items.length === 0.
 */
export function computeDiscountFrequency(
  items: Array<{ list_price: number; actual_price: number }>,
): number | null {
  if (items.length === 0) return null
  const discounted = items.filter(i => i.actual_price < i.list_price).length
  return (discounted / items.length) * 100
}

/**
 * Compute revenue lost to discounts.
 * Σ (listPrice - actualPrice) × qty, per-item clamped to >= 0.
 */
export function computeRevenueLostToDiscounts(
  items: Array<{ list_price: number; actual_price: number; qty: number }>,
): number {
  return items.reduce((sum, item) => {
    const lost = (item.list_price - item.actual_price) * item.qty
    return sum + Math.max(0, lost)
  }, 0)
}

/**
 * Compute price realization rate: actualRevenue / fullPriceRevenue × 100.
 * Returns null if fullPriceRevenue = 0.
 */
export function computePriceRealizationRate(
  items: Array<{ list_price: number; actual_price: number; qty: number }>,
): number | null {
  const fullPriceRevenue = items.reduce((s, i) => s + i.list_price * i.qty, 0)
  if (fullPriceRevenue === 0) return null
  const actualRevenue = items.reduce((s, i) => s + i.actual_price * i.qty, 0)
  return (actualRevenue / fullPriceRevenue) * 100
}

/**
 * Classify price realization health.
 */
export function classifyPriceRealization(
  ratePct: number | null,
): 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'insufficient_data' {
  if (ratePct === null) return 'insufficient_data'
  if (ratePct >= 97) return 'excellent'
  if (ratePct >= 92) return 'good'
  if (ratePct >= 85) return 'moderate'
  if (ratePct >= 75) return 'poor'
  return 'critical'
}

/**
 * Find the modal price (most common selling price).
 * Returns null if prices is empty. First wins on tie.
 */
export function computeModalPrice(prices: number[]): number | null {
  if (prices.length === 0) return null
  const freq = new Map<number, number>()
  for (const p of prices) {
    freq.set(p, (freq.get(p) ?? 0) + 1)
  }
  let modal: number | null = null
  let maxFreq = 0
  for (const [price, count] of freq.entries()) {
    if (count > maxFreq) {
      maxFreq = count
      modal = price
    }
  }
  return modal
}

/**
 * Compute price coefficient of variation: stddev / mean.
 * Returns null if prices.length < 2 or mean = 0.
 */
export function computePriceCoefficientOfVariation(prices: number[]): number | null {
  if (prices.length < 2) return null
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length
  if (mean === 0) return null
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length
  const stddev = Math.sqrt(variance)
  return stddev / mean
}

/**
 * Classify price consistency based on coefficient of variation.
 */
export function classifyPriceConsistency(
  cv: number | null,
): 'very_consistent' | 'consistent' | 'moderate_variation' | 'high_variation' | 'erratic' | 'insufficient_data' {
  if (cv === null) return 'insufficient_data'
  if (cv <= 0.05) return 'very_consistent'
  if (cv <= 0.10) return 'consistent'
  if (cv <= 0.20) return 'moderate_variation'
  if (cv <= 0.35) return 'high_variation'
  return 'erratic'
}

/**
 * Compute minimum viable price floor.
 * listPrice × (1 - minMarginPct/100); cannot be negative.
 */
export function computeMinViablePrice(
  listPrice: number,
  minMarginPct = 10,
): number {
  return Math.max(0, listPrice * (1 - minMarginPct / 100))
}

/**
 * Detect below-floor sales: items where actualPrice < minViablePrice.
 */
export function detectBelowFloorSales<T extends { actual_price: number; list_price: number }>(
  items: T[],
  minMarginPct = 10,
): T[] {
  return items.filter(item => item.actual_price < computeMinViablePrice(item.list_price, minMarginPct))
}

/**
 * Compute optimal price recommendation based on historical data.
 *   maintain_list: avgDiscount <= 5%
 *   standardize_discount: avgDiscount 5–20%
 *   reduce_list: avgDiscount > 20%
 */
export function computeOptimalPriceRecommendation(
  listPrice: number,
  avgActualPrice: number | null,
  modalPrice: number | null,
  avgDiscountPct: number | null,
): {
  recommended_price: number
  strategy: 'maintain_list' | 'standardize_discount' | 'reduce_list'
  rationale: string
} {
  if (avgDiscountPct === null || avgDiscountPct <= 5) {
    return {
      recommended_price: listPrice,
      strategy: 'maintain_list',
      rationale: 'Ortalama iskonto %5 veya altında — liste fiyatı korunmalı.',
    }
  }

  if (avgDiscountPct <= 20) {
    const recommended = listPrice * (1 - avgDiscountPct / 100)
    return {
      recommended_price: recommended,
      strategy: 'standardize_discount',
      rationale: `Ortalama iskonto %${avgDiscountPct.toFixed(1)} — iskonto fiyatlandırılarak standartlaştırılmalı.`,
    }
  }

  // avgDiscount > 20%: reduce list price
  const fallback = avgActualPrice ?? listPrice
  const recommended = modalPrice !== null
    ? Math.max(modalPrice, fallback)
    : fallback
  return {
    recommended_price: recommended,
    strategy: 'reduce_list',
    rationale: `Ortalama iskonto %${avgDiscountPct.toFixed(1)} — liste fiyatı gerçek satış düzeyine indirilmeli.`,
  }
}

/**
 * Generate Turkish narrative summary for price optimization report.
 */
export function generatePriceOptimizationNarrative(params: {
  avgDiscountPct: number | null
  priceRealizationPct: number | null
  revenueLostToDiscounts: number
  belowFloorCount: number
  priceConsistency: ReturnType<typeof classifyPriceConsistency>
}): string {
  const { avgDiscountPct, priceRealizationPct, revenueLostToDiscounts, belowFloorCount, priceConsistency } = params

  if (avgDiscountPct === null && priceRealizationPct === null) {
    return 'Fiyat optimizasyonu için yeterli satış verisi bulunamadı.'
  }

  const parts: string[] = []

  if (avgDiscountPct !== null) {
    if (avgDiscountPct > 20) {
      parts.push(`Ortalama iskonto oranı %${avgDiscountPct.toFixed(1)} ile yüksek seviyede — fiyatlandırma politikası gözden geçirilmeli.`)
    } else if (avgDiscountPct > 5) {
      parts.push(`Ortalama iskonto %${avgDiscountPct.toFixed(1)} ile kabul edilebilir aralıkta.`)
    } else {
      parts.push(`İskonto oranı %${avgDiscountPct.toFixed(1)} ile düşük — liste fiyatları piyasaya uygun.`)
    }
  }

  if (priceRealizationPct !== null) {
    if (priceRealizationPct >= 97) {
      parts.push(`Fiyat gerçekleşme oranı %${priceRealizationPct.toFixed(1)} ile mükemmel seviyede.`)
    } else if (priceRealizationPct < 75) {
      parts.push(`Fiyat gerçekleşme oranı %${priceRealizationPct.toFixed(1)} ile kritik düzeyde düşük.`)
    }
  }

  if (revenueLostToDiscounts > 0) {
    parts.push(`İskontolar nedeniyle toplam ${revenueLostToDiscounts.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL gelir kaybı yaşandı.`)
  }

  if (belowFloorCount > 0) {
    parts.push(`${belowFloorCount} satış minimum kârlılık eşiğinin altında gerçekleşti — acil inceleme gerekli.`)
  }

  if (priceConsistency === 'erratic' || priceConsistency === 'high_variation') {
    parts.push('Fiyat tutarlılığı zayıf — fiyat politikası standartlaştırılmalı.')
  }

  return parts.length > 0 ? parts.join(' ') : 'Fiyatlandırma performansı genel olarak kabul edilebilir düzeyde.'
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface PriceOptimizationReport {
  avg_discount_rate_pct: number | null
  discount_frequency_pct: number | null
  revenue_lost_to_discounts_try: number
  price_realization_rate_pct: number | null
  price_realization_health: ReturnType<typeof classifyPriceRealization>
  per_product: Array<{
    product_id: string
    product_name: string
    list_price: number
    avg_actual_price: number
    modal_price: number | null
    avg_discount_pct: number | null
    discount_level: ReturnType<typeof classifyDiscountLevel>
    price_cv: number | null
    price_consistency: ReturnType<typeof classifyPriceConsistency>
    revenue_lost_try: number
    below_floor_count: number
    recommendation: ReturnType<typeof computeOptimalPriceRecommendation>
    total_units_sold: number
    total_revenue_try: number
  }>
  below_floor_sales_count: number
  narrative: string
  period_months: number
}

// ── Internal types ────────────────────────────────────────────────────────────

interface RawSaleItem {
  product_id: string | null
  product_name: string | null
  list_price: number
  actual_price: number
  qty: number
  line_total_try: number
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function periodStartDate(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

// ── Empty report ──────────────────────────────────────────────────────────────

function emptyReport(periodMonths: number): PriceOptimizationReport {
  return {
    avg_discount_rate_pct: null,
    discount_frequency_pct: null,
    revenue_lost_to_discounts_try: 0,
    price_realization_rate_pct: null,
    price_realization_health: 'insufficient_data',
    per_product: [],
    below_floor_sales_count: 0,
    narrative: 'Fiyat optimizasyonu için yeterli satış verisi bulunamadı.',
    period_months: periodMonths,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class PriceOptimizationService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string, periodMonths = 6): Promise<PriceOptimizationReport> {
    const fromDate = periodStartDate(periodMonths)

    // ── Fetch sale_items joined with sales (for date filter) and products ──────
    const [itemsResult, productsResult] = await Promise.allSettled([
      this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          price,
          discount_percent,
          quantity,
          line_total_try,
          sales!inner(
            company_id,
            deleted_at,
            is_proforma,
            sale_date
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate),

      this.supabase
        .from('products')
        .select('id, name, price')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    if (itemsResult.status === 'rejected') return emptyReport(periodMonths)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawRows: any[] = itemsResult.value.data ?? []
    if (rawRows.length === 0) return emptyReport(periodMonths)

    // Build product price lookup from products table
    const productPriceMap = new Map<string, { name: string; price: number }>()
    if (productsResult.status === 'fulfilled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (productsResult.value.data ?? []) as any[]) {
        if (p.id) productPriceMap.set(String(p.id), { name: String(p.name ?? ''), price: Number(p.price ?? 0) })
      }
    }

    // ── Normalise rows → RawSaleItem ──────────────────────────────────────────
    const items: RawSaleItem[] = rawRows.map(r => {
      // list_price: sale_items.price (the list/catalogue price)
      const listPrice = Number(r.price ?? 0)
      // actual_price: list_price × (1 - discount_percent/100)
      const discountPct = Number(r.discount_percent ?? 0)
      const actualPrice = listPrice * (1 - discountPct / 100)
      return {
        product_id:     r.product_id ? String(r.product_id) : null,
        product_name:   r.product_name ? String(r.product_name) : null,
        list_price:     listPrice,
        actual_price:   actualPrice,
        qty:            Number(r.quantity ?? 0),
        line_total_try: Number(r.line_total_try ?? 0),
      }
    })

    // ── Group by product ──────────────────────────────────────────────────────
    type ProductBucket = {
      product_id: string
      product_name: string
      list_price: number    // use first (or catalogue) list price
      items: RawSaleItem[]
    }
    const buckets = new Map<string, ProductBucket>()

    for (const item of items) {
      const pid = item.product_id ?? `unnamed_${item.product_name}`
      const pname = item.product_name?.trim() ||
        productPriceMap.get(item.product_id ?? '')?.name ||
        'Bilinmeyen Ürün'

      if (!buckets.has(pid)) {
        const cataloguePrice = item.product_id
          ? (productPriceMap.get(item.product_id)?.price ?? item.list_price)
          : item.list_price
        buckets.set(pid, {
          product_id: pid,
          product_name: pname,
          list_price: cataloguePrice > 0 ? cataloguePrice : item.list_price,
          items: [],
        })
      }
      buckets.get(pid)!.items.push(item)
    }

    // ── Build per-product stats ───────────────────────────────────────────────
    const perProduct: PriceOptimizationReport['per_product'] = []

    for (const bucket of buckets.values()) {
      const { product_id, product_name, list_price, items: pItems } = bucket

      const totalUnits = pItems.reduce((s, i) => s + i.qty, 0)
      const totalRevenue = pItems.reduce((s, i) => s + i.line_total_try, 0)

      // avg_actual_price (unit-weighted)
      const avgActualPrice = totalUnits > 0
        ? pItems.reduce((s, i) => s + i.actual_price * i.qty, 0) / totalUnits
        : (pItems[0]?.actual_price ?? 0)

      // modal price from actual prices (per-item, not qty-weighted)
      const allActualPrices = pItems.map(i => i.actual_price)
      const modalPrice = computeModalPrice(allActualPrices)

      // avg discount pct (revenue-weighted)
      const discountItems = pItems.map(i => ({
        list_price: list_price > 0 ? list_price : i.list_price,
        actual_price: i.actual_price,
        qty: i.qty,
      }))
      const avgDiscountPct = computeAvgDiscountRate(discountItems)

      const discountLevel = classifyDiscountLevel(avgDiscountPct)

      // price CV
      const priceCv = computePriceCoefficientOfVariation(allActualPrices)
      const priceConsistency = classifyPriceConsistency(priceCv)

      // revenue lost
      const revenueLostTry = computeRevenueLostToDiscounts(
        pItems.map(i => ({
          list_price: list_price > 0 ? list_price : i.list_price,
          actual_price: i.actual_price,
          qty: i.qty,
        })),
      )

      // below floor
      const belowFloorItems = detectBelowFloorSales(
        pItems.map(i => ({
          ...i,
          list_price: list_price > 0 ? list_price : i.list_price,
        })),
      )
      const belowFloorCount = belowFloorItems.length

      // recommendation
      const recommendation = computeOptimalPriceRecommendation(
        list_price > 0 ? list_price : avgActualPrice,
        avgActualPrice,
        modalPrice,
        avgDiscountPct,
      )

      perProduct.push({
        product_id,
        product_name,
        list_price,
        avg_actual_price: avgActualPrice,
        modal_price: modalPrice,
        avg_discount_pct: avgDiscountPct,
        discount_level: discountLevel,
        price_cv: priceCv,
        price_consistency: priceConsistency,
        revenue_lost_try: revenueLostTry,
        below_floor_count: belowFloorCount,
        recommendation,
        total_units_sold: totalUnits,
        total_revenue_try: totalRevenue,
      })
    }

    // Sort by total_revenue_try desc
    perProduct.sort((a, b) => b.total_revenue_try - a.total_revenue_try)

    // ── Portfolio metrics ─────────────────────────────────────────────────────
    const allDiscountItems = items.map(i => ({
      list_price: i.list_price,
      actual_price: i.actual_price,
      qty: i.qty,
    }))

    const avgDiscountRatePct = computeAvgDiscountRate(allDiscountItems)
    const discountFrequencyPct = computeDiscountFrequency(
      items.map(i => ({ list_price: i.list_price, actual_price: i.actual_price })),
    )
    const revenueLostToDiscountsTry = computeRevenueLostToDiscounts(allDiscountItems)
    const priceRealizationRatePct = computePriceRealizationRate(allDiscountItems)
    const priceRealizationHealth = classifyPriceRealization(priceRealizationRatePct)

    const belowFloorSalesCount = perProduct.reduce((s, p) => s + p.below_floor_count, 0)

    // Overall price consistency (CV across all actual prices)
    const allPrices = items.map(i => i.actual_price)
    const overallCv = computePriceCoefficientOfVariation(allPrices)
    const overallConsistency = classifyPriceConsistency(overallCv)

    const narrative = generatePriceOptimizationNarrative({
      avgDiscountPct: avgDiscountRatePct,
      priceRealizationPct: priceRealizationRatePct,
      revenueLostToDiscounts: revenueLostToDiscountsTry,
      belowFloorCount: belowFloorSalesCount,
      priceConsistency: overallConsistency,
    })

    return {
      avg_discount_rate_pct: avgDiscountRatePct,
      discount_frequency_pct: discountFrequencyPct,
      revenue_lost_to_discounts_try: revenueLostToDiscountsTry,
      price_realization_rate_pct: priceRealizationRatePct,
      price_realization_health: priceRealizationHealth,
      per_product: perProduct,
      below_floor_sales_count: belowFloorSalesCount,
      narrative,
      period_months: periodMonths,
    }
  }
}

// ── Additional pure helpers (used by tests and UI) ────────────────────────────

/**
 * Compute blended recommended price from three price targets.
 * Weights: maxRevenuePrice=0.40, maxMarginPrice=0.40, maxVolumePrice=0.20.
 * Null inputs are skipped and weights are redistributed proportionally.
 * Returns null if all three inputs are null.
 */
export function computeRecommendedPrice(
  maxRevenuePrice: number | null,
  maxMarginPrice:  number | null,
  maxVolumePrice:  number | null,
): number | null {
  const candidates: Array<{ value: number; weight: number }> = []
  if (maxRevenuePrice !== null) candidates.push({ value: maxRevenuePrice, weight: 0.40 })
  if (maxMarginPrice  !== null) candidates.push({ value: maxMarginPrice,  weight: 0.40 })
  if (maxVolumePrice  !== null) candidates.push({ value: maxVolumePrice,  weight: 0.20 })
  if (candidates.length === 0) return null
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)
  const weightedSum  = candidates.reduce((s, c) => s + c.value * c.weight, 0)
  return weightedSum / totalWeight
}

/**
 * Compute price elasticity of demand using midpoint method.
 * Uses the lowest and highest price points in the dataset.
 * Filters out points with price_try = 0.
 * Returns null if fewer than 2 valid points or price range = 0.
 */
export function computeElasticity(
  points: Array<{ price_try: number; units_sold: number }>,
): number | null {
  const valid = points.filter(p => p.price_try > 0)
  if (valid.length < 2) return null

  const sorted  = [...valid].sort((a, b) => a.price_try - b.price_try)
  const low     = sorted[0]
  const high    = sorted[sorted.length - 1]

  const deltaP  = high.price_try   - low.price_try
  const deltaQ  = high.units_sold  - low.units_sold
  const midP    = (high.price_try   + low.price_try)   / 2
  const midQ    = (high.units_sold  + low.units_sold)  / 2

  if (deltaP === 0 || midP === 0 || midQ === 0) return null

  return (deltaQ / midQ) / (deltaP / midP)
}

/**
 * Classify price elasticity of demand.
 * elastic: |e| > 1 (demand is sensitive to price)
 * inelastic: |e| <= 1 (demand is insensitive to price)
 * unknown: null input
 */
export function classifyElasticity(
  e: number | null,
): 'elastic' | 'inelastic' | 'unknown' {
  if (e === null) return 'unknown'
  return Math.abs(e) > 1 ? 'elastic' : 'inelastic'
}

/**
 * Compute potential revenue uplift from a price change.
 * = (recommendedPrice - currentPrice) × units
 * Can be negative (price decrease) or positive (price increase).
 */
export function computeRevenueUplift(
  currentPrice:     number,
  recommendedPrice: number,
  units:            number,
): number {
  return (recommendedPrice - currentPrice) * units
}
