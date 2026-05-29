// ── CompetitivePricingService — Internal Pricing Intelligence ────────────────
// Analyses Flowra's own pricing relative to internal benchmarks using
// historical price variance across customer segments, time periods, channels.
//
// Pure helpers are exported for unit testing without a DB connection.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProductPricingAnalysis {
  product_id: string
  product_name: string
  current_avg_price: number
  historical_avg_price: number
  price_position_index: number | null
  position_class: ReturnType<typeof classifyPricePosition>
  price_dispersion: number
  dispersion_class: ReturnType<typeof classifyPriceDispersion>
  elasticity: number | null
  elasticity_class: ReturnType<typeof classifyElasticity>
  optimal_price: number
  revenue_impact_try: number
  price_trend_slope: number | null
  trend_class: ReturnType<typeof classifyPriceTrend>
  pricing_score: number
  score_class: ReturnType<typeof classifyPricingScore>
  narrative: string
}

export interface CompetitivePricingReport {
  company_id: string
  generated_at: string
  period_months: number
  products: ProductPricingAnalysis[]
  avg_portfolio_score: number
  premium_product_count: number
  discount_product_count: number
  high_dispersion_count: number
}

// ── Internal raw types ────────────────────────────────────────────────────────

interface RawPriceRow {
  product_id: string
  product_name: string | null
  month: string
  avg_price: number
  total_units: number
  annual_revenue: number
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute Price Position Index: how current avg price compares to 12-month history.
 * Formula: (current - historical) / historical
 * Returns null if historical <= 0.
 */
export function computePricePositionIndex(
  currentAvgPrice: number,
  historicalAvgPrice: number,
): number | null {
  if (historicalAvgPrice <= 0) return null
  return (currentAvgPrice - historicalAvgPrice) / historicalAvgPrice
}

/**
 * Classify price position based on index.
 * null → 'no_data'
 * > 0.10: 'premium'
 * > 0.03: 'slightly_premium'
 * >= -0.03: 'market_rate'
 * >= -0.10: 'slightly_discount'
 * < -0.10: 'discount'
 */
export function classifyPricePosition(
  index: number | null,
): 'premium' | 'slightly_premium' | 'market_rate' | 'slightly_discount' | 'discount' | 'no_data' {
  if (index === null) return 'no_data'
  if (index > 0.10) return 'premium'
  if (index > 0.03) return 'slightly_premium'
  if (index >= -0.03) return 'market_rate'
  if (index >= -0.10) return 'slightly_discount'
  return 'discount'
}

/**
 * Compute standard deviation of transaction prices for a product.
 * High dispersion = inconsistent pricing.
 * Returns 0 for empty or single-element arrays.
 */
export function computePriceDispersion(prices: number[]): number {
  if (prices.length === 0) return 0
  if (prices.length === 1) return 0
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length
  return Math.sqrt(variance)
}

/**
 * Classify price dispersion using coefficient of variation.
 * cv = stdDev / mean
 * null/empty/mean≤0 → 'no_data'
 * cv < 0.03: 'tight'
 * cv < 0.08: 'normal'
 * cv < 0.15: 'loose'
 * >= 0.15: 'erratic'
 */
export function classifyPriceDispersion(
  prices: number[],
): 'tight' | 'normal' | 'loose' | 'erratic' | 'no_data' {
  if (!prices || prices.length === 0) return 'no_data'
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length
  if (mean <= 0) return 'no_data'
  const stdDev = computePriceDispersion(prices)
  const cv = stdDev / mean
  if (cv < 0.03) return 'tight'
  if (cv < 0.08) return 'normal'
  if (cv < 0.15) return 'loose'
  return 'erratic'
}

/**
 * Compute price elasticity from historical period data using midpoint formula.
 * e = ((Q2-Q1)/((Q2+Q1)/2)) / ((P2-P1)/((P2+P1)/2))
 * Averages across all consecutive period pairs.
 * Returns null if insufficient data (<2 pairs) or no price variation.
 */
export function computePriceElasticityFromHistory(
  periods: Array<{ avg_price: number; total_units: number }>,
): number | null {
  if (!periods || periods.length < 2) return null

  const elasticities: number[] = []

  for (let i = 1; i < periods.length; i++) {
    const p1 = periods[i - 1].avg_price
    const p2 = periods[i].avg_price
    const q1 = periods[i - 1].total_units
    const q2 = periods[i].total_units

    const pMid = (p1 + p2) / 2
    const qMid = (q1 + q2) / 2

    if (pMid === 0 || qMid === 0) continue

    const pChange = (p2 - p1) / pMid
    const qChange = (q2 - q1) / qMid

    if (pChange === 0) continue

    elasticities.push(qChange / pChange)
  }

  if (elasticities.length === 0) return null
  return elasticities.reduce((s, e) => s + e, 0) / elasticities.length
}

/**
 * Classify elasticity.
 * null → 'unknown'
 * |e| > 1: 'elastic'
 * |e| <= 1: 'inelastic'
 */
export function classifyElasticity(
  elasticity: number | null,
): 'elastic' | 'inelastic' | 'unknown' {
  if (elasticity === null) return 'unknown'
  return Math.abs(elasticity) > 1 ? 'elastic' : 'inelastic'
}

/**
 * Compute optimal price point based on elasticity.
 * elastic → current * 0.95 (reduce 5% to gain volume)
 * inelastic → current * 1.05 (raise 5%, minimal volume loss)
 * unknown → current (no change)
 */
export function computeOptimalPricePoint(
  currentPrice: number,
  elasticity: ReturnType<typeof classifyElasticity>,
): number {
  if (elasticity === 'elastic') return currentPrice * 0.95
  if (elasticity === 'inelastic') return currentPrice * 1.05
  return currentPrice
}

/**
 * Compute estimated revenue impact from price adjustment.
 * Formula: (optimal_price - current_price) / current_price * annual_revenue
 */
export function computeRevenueImpact(
  currentPrice: number,
  optimalPrice: number,
  annualRevenue: number,
): number {
  if (currentPrice <= 0) return 0
  return ((optimalPrice - currentPrice) / currentPrice) * annualRevenue
}

/**
 * Compute price segment gap: difference between highest and lowest avg transaction price.
 * Returns 0 if only one price point or empty.
 */
export function computePriceSegmentGap(prices: number[]): number {
  if (!prices || prices.length <= 1) return 0
  return Math.max(...prices) - Math.min(...prices)
}

/**
 * Compute linear regression slope on monthly avg prices.
 * Positive: prices trending up; negative: trending down.
 * Returns null if fewer than 3 data points.
 */
export function computePriceTrend(monthlyPrices: number[]): number | null {
  if (!monthlyPrices || monthlyPrices.length < 3) return null

  const n = monthlyPrices.length
  const xMean = (n - 1) / 2
  const yMean = monthlyPrices.reduce((s, p) => s + p, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (monthlyPrices[i] - yMean)
    denominator += (i - xMean) ** 2
  }

  if (denominator === 0) return null
  return numerator / denominator
}

/**
 * Classify price trend.
 * null → 'no_data'
 * slope/avg > 0.02: 'increasing' (>2% monthly growth)
 * slope/avg < -0.02: 'decreasing'
 * else: 'stable'
 */
export function classifyPriceTrend(
  slope: number | null,
  avgPrice: number,
): 'increasing' | 'stable' | 'decreasing' | 'no_data' {
  if (slope === null) return 'no_data'
  if (avgPrice <= 0) return 'no_data'
  const normalised = slope / avgPrice
  if (normalised > 0.02) return 'increasing'
  if (normalised < -0.02) return 'decreasing'
  return 'stable'
}

/**
 * Compute composite pricing score (0–100).
 * Dispersion (35%): tight=100, normal=75, loose=40, erratic=0, no_data=50
 * Position  (35%): premium=90, slightly_premium=90, market_rate=70,
 *                  slightly_discount=40, discount=0, no_data=50
 * Trend     (30%): increasing=90, stable=70, decreasing=30, no_data=50
 */
export function computePricingScore(
  dispersionClass: ReturnType<typeof classifyPriceDispersion>,
  positionClass: ReturnType<typeof classifyPricePosition>,
  trendClass: ReturnType<typeof classifyPriceTrend>,
): number {
  const dispersionScore: Record<string, number> = {
    tight: 100,
    normal: 75,
    loose: 40,
    erratic: 0,
    no_data: 50,
  }
  const positionScore: Record<string, number> = {
    premium: 90,
    slightly_premium: 90,
    market_rate: 70,
    slightly_discount: 40,
    discount: 0,
    no_data: 50,
  }
  const trendScore: Record<string, number> = {
    increasing: 90,
    stable: 70,
    decreasing: 30,
    no_data: 50,
  }

  const d = dispersionScore[dispersionClass] ?? 50
  const p = positionScore[positionClass] ?? 50
  const t = trendScore[trendClass] ?? 50

  return d * 0.35 + p * 0.35 + t * 0.30
}

/**
 * Classify composite pricing score.
 * >= 75: 'strong'
 * >= 55: 'fair'
 * >= 35: 'weak'
 * < 35: 'critical'
 */
export function classifyPricingScore(
  score: number,
): 'strong' | 'fair' | 'weak' | 'critical' {
  if (score >= 75) return 'strong'
  if (score >= 55) return 'fair'
  if (score >= 35) return 'weak'
  return 'critical'
}

/**
 * Generate Turkish narrative for pricing analysis.
 */
export function generatePricingNarrative(
  productName: string,
  positionClass: ReturnType<typeof classifyPricePosition>,
  elasticity: ReturnType<typeof classifyElasticity>,
  pricingScore: number,
  revenueImpact: number,
): string {
  const positionText: Record<string, string> = {
    premium: 'tarihsel ortalamaya kıyasla premium fiyatlandırma',
    slightly_premium: 'tarihsel ortalamaya kıyasla hafif yüksek fiyatlandırma',
    market_rate: 'tarihsel ortalamayla uyumlu fiyatlandırma',
    slightly_discount: 'tarihsel ortalamaya kıyasla hafif indirimli fiyatlandırma',
    discount: 'tarihsel ortalamaya kıyasla belirgin indirimli fiyatlandırma',
    no_data: 'fiyat karşılaştırması için yetersiz veri',
  }

  const elasticityText: Record<string, string> = {
    elastic: 'fiyata duyarlı (esnek talep)',
    inelastic: 'fiyata az duyarlı (esnek olmayan talep)',
    unknown: 'talep esnekliği bilinmiyor',
  }

  const scoreLabel = classifyPricingScore(pricingScore)
  const scoreLabelText: Record<string, string> = {
    strong: 'güçlü',
    fair: 'orta',
    weak: 'zayıf',
    critical: 'kritik',
  }

  const impactSign = revenueImpact >= 0 ? '+' : ''
  const impactFormatted = `${impactSign}${Math.round(revenueImpact).toLocaleString('tr-TR')} TL`

  return (
    `${productName}: ${positionText[positionClass]}, talep ${elasticityText[elasticity]}. ` +
    `Fiyatlandırma skoru ${pricingScore.toFixed(0)}/100 (${scoreLabelText[scoreLabel]}). ` +
    `Önerilen fiyat ayarlamasının tahmini yıllık gelir etkisi: ${impactFormatted}.`
  )
}

// ── DB Service ────────────────────────────────────────────────────────────────

export class CompetitivePricingService {
  constructor(private supabase: SupabaseClient) {}

  async getReport(
    companyId: string,
    periodMonths = 12,
  ): Promise<CompetitivePricingReport | null> {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - periodMonths)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // Fetch monthly price data per product
    const { data: rows, error } = await this.supabase
      .from('sale_items')
      .select(`
        product_id,
        product_name,
        unit_price,
        quantity,
        sales!inner(sale_date, total_try, company_id)
      `)
      .eq('sales.company_id', companyId)
      .gte('sales.sale_date', cutoffStr)
      .not('product_id', 'is', null)
      .not('unit_price', 'is', null)
      .gt('unit_price', 0)

    if (error || !rows || rows.length === 0) return null

    // Aggregate by product_id + month
    const productMap = new Map<string, {
      product_name: string
      byMonth: Map<string, { prices: number[]; units: number; revenue: number }>
      allPrices: number[]
    }>()

    for (const row of rows as any[]) {
      const pid = row.product_id as string
      const pname = (row.product_name as string | null) ?? pid
      const price = Number(row.unit_price)
      const qty = Number(row.quantity ?? 1)
      const saleDate: string = row.sales?.sale_date ?? ''
      const month = saleDate.slice(0, 7) // "YYYY-MM"
      const revenue = price * qty

      if (!productMap.has(pid)) {
        productMap.set(pid, { product_name: pname, byMonth: new Map(), allPrices: [] })
      }
      const prod = productMap.get(pid)!
      prod.allPrices.push(price)
      if (!prod.byMonth.has(month)) {
        prod.byMonth.set(month, { prices: [], units: 0, revenue: 0 })
      }
      const m = prod.byMonth.get(month)!
      m.prices.push(price)
      m.units += qty
      m.revenue += revenue
    }

    const analyses = await Promise.allSettled(
      Array.from(productMap.entries()).map(async ([pid, pdata]) => {
        const sortedMonths = Array.from(pdata.byMonth.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        )

        const monthlyAvgPrices = sortedMonths.map(([, m]) => {
          const avg = m.prices.reduce((s, p) => s + p, 0) / m.prices.length
          return avg
        })

        const periods = sortedMonths.map(([, m]) => ({
          avg_price: m.prices.reduce((s, p) => s + p, 0) / m.prices.length,
          total_units: m.units,
        }))

        const annualRevenue = sortedMonths.reduce((s, [, m]) => s + m.revenue, 0)

        // Current avg = most recent month; historical = all months avg
        const currentAvgPrice =
          periods.length > 0 ? periods[periods.length - 1].avg_price : 0
        const historicalAvgPrice =
          periods.length > 0
            ? periods.reduce((s, p) => s + p.avg_price, 0) / periods.length
            : 0

        const pricePositionIndex = computePricePositionIndex(currentAvgPrice, historicalAvgPrice)
        const positionClass = classifyPricePosition(pricePositionIndex)

        const priceDispersion = computePriceDispersion(pdata.allPrices)
        const dispersionClass = classifyPriceDispersion(pdata.allPrices)

        const elasticity = computePriceElasticityFromHistory(periods)
        const elasticityClass = classifyElasticity(elasticity)

        const optimalPrice = computeOptimalPricePoint(currentAvgPrice, elasticityClass)
        const revenueImpact = computeRevenueImpact(currentAvgPrice, optimalPrice, annualRevenue)

        const priceTrendSlope = computePriceTrend(monthlyAvgPrices)
        const trendClass = classifyPriceTrend(priceTrendSlope, historicalAvgPrice)

        const pricingScore = computePricingScore(dispersionClass, positionClass, trendClass)
        const scoreClass = classifyPricingScore(pricingScore)

        const narrative = generatePricingNarrative(
          pdata.product_name,
          positionClass,
          elasticityClass,
          pricingScore,
          revenueImpact,
        )

        return {
          product_id: pid,
          product_name: pdata.product_name,
          current_avg_price: currentAvgPrice,
          historical_avg_price: historicalAvgPrice,
          price_position_index: pricePositionIndex,
          position_class: positionClass,
          price_dispersion: priceDispersion,
          dispersion_class: dispersionClass,
          elasticity,
          elasticity_class: elasticityClass,
          optimal_price: optimalPrice,
          revenue_impact_try: revenueImpact,
          price_trend_slope: priceTrendSlope,
          trend_class: trendClass,
          pricing_score: pricingScore,
          score_class: scoreClass,
          narrative,
        } satisfies ProductPricingAnalysis
      }),
    )

    const products = analyses
      .filter((r): r is PromiseFulfilledResult<ProductPricingAnalysis> => r.status === 'fulfilled')
      .map((r) => r.value)
      .sort((a, b) => b.pricing_score - a.pricing_score)

    if (products.length === 0) return null

    const avgPortfolioScore =
      products.reduce((s, p) => s + p.pricing_score, 0) / products.length

    const premiumProductCount = products.filter(
      (p) => p.position_class === 'premium' || p.position_class === 'slightly_premium',
    ).length

    const discountProductCount = products.filter(
      (p) => p.position_class === 'discount' || p.position_class === 'slightly_discount',
    ).length

    const highDispersionCount = products.filter(
      (p) => p.dispersion_class === 'loose' || p.dispersion_class === 'erratic',
    ).length

    return {
      company_id: companyId,
      generated_at: new Date().toISOString(),
      period_months: periodMonths,
      products,
      avg_portfolio_score: avgPortfolioScore,
      premium_product_count: premiumProductCount,
      discount_product_count: discountProductCount,
      high_dispersion_count: highDispersionCount,
    }
  }
}
