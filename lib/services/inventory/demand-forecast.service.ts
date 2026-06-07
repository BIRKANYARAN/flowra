// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/demand-forecast.service.ts
//
// Demand Forecasting & Inventory Optimization
//
// Pure helpers are exported for unit testing.
// DB logic is encapsulated in DemandForecastService class.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface ProductDemandForecast {
  product_id: string
  product_name: string
  current_stock_units: number
  avg_monthly_units: number       // trailing 3m avg
  forecasted_next_3m: number[]    // 3 monthly forecasts
  safety_stock_units: number
  reorder_point_units: number
  optimal_order_qty: number | null
  demand_trend: ReturnType<typeof computeDemandTrend>
  volatility: ReturnType<typeof classifyDemandVolatility>
  stockout_risk: ReturnType<typeof computeStockoutRisk>
  coverage_months: number | null
  needs_reorder: boolean          // current_stock <= reorder_point
}

export interface DemandForecastReport {
  company_id: string
  generated_at: string
  period_months: number
  products: ProductDemandForecast[]
  critical_stockout_count: number
  needs_reorder_count: number
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Simple N-period moving average of the last N values.
 * Returns null if values.length < periods.
 */
export function computeMovingAverage(values: number[], periods: number): number | null {
  if (values.length < periods) return null
  const slice = values.slice(values.length - periods)
  return slice.reduce((s, v) => s + v, 0) / periods
}

/**
 * Single exponential smoothing: S_t = alpha*x_t + (1-alpha)*S_{t-1}
 * Returns array same length as input.
 * First value = values[0].
 * alpha default: 0.3
 */
export function computeExponentialSmoothing(values: number[], alpha: number = 0.3): number[] {
  if (values.length === 0) return []
  const result: number[] = [values[0]]
  for (let i = 1; i < values.length; i++) {
    result.push(alpha * values[i] + (1 - alpha) * result[i - 1])
  }
  return result
}

/**
 * Given smoothed values, forecast next N periods.
 * trend multiplier = last / second-last (if available), else 1.0
 * Clamped between 0.7 and 1.3 (no wild extrapolation).
 * Returns array of length forecastPeriods.
 */
export function computeForecastedDemand(
  smoothedValues: number[],
  forecastPeriods: number,
): number[] {
  if (smoothedValues.length === 0) return Array(forecastPeriods).fill(0)

  const last = smoothedValues[smoothedValues.length - 1]
  let multiplier = 1.0

  if (smoothedValues.length >= 2) {
    const secondLast = smoothedValues[smoothedValues.length - 2]
    if (secondLast > 0) {
      const raw = last / secondLast
      multiplier = Math.min(1.3, Math.max(0.7, raw))
    }
  }

  const result: number[] = []
  for (let p = 1; p <= forecastPeriods; p++) {
    result.push(last * Math.pow(multiplier, p))
  }
  return result
}

/**
 * reorder_point = (avg_daily_demand * lead_time_days) + safety_stock
 * avg_daily_demand = monthly_units / 30
 */
export function computeReorderPoint(
  avgMonthlyUnits: number,
  leadTimeDays: number,
  safetyStockUnits: number,
): number {
  const avgDailyDemand = avgMonthlyUnits / 30
  return avgDailyDemand * leadTimeDays + safetyStockUnits
}

/**
 * Population std deviation.
 * Returns 0 if fewer than 2 values.
 */
export function computeStdDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Safety stock = z_score * std_dev * sqrt(lead_time_days)
 * z_score: 1.28 for 90%, 1.65 for 95%, 2.05 for 99% (default 95%)
 * Returns 0 if fewer than 2 historical values.
 */
export function computeSafetyStock(
  historicalMonthlyUnits: number[],
  leadTimeDays: number,
  serviceLevel: number = 0.95,
): number {
  if (historicalMonthlyUnits.length < 2) return 0

  let zScore: number
  if (serviceLevel >= 0.99) {
    zScore = 2.05
  } else if (serviceLevel >= 0.95) {
    zScore = 1.65
  } else {
    zScore = 1.28 // 90%
  }

  const stdDev = computeStdDeviation(historicalMonthlyUnits)
  return zScore * stdDev * Math.sqrt(leadTimeDays)
}

/**
 * cv = stdDev / mean (coefficient of variation)
 * Returns 'no_data' if mean <= 0
 * < 0.10: 'very_stable'
 * < 0.25: 'stable'
 * < 0.50: 'moderate'
 * < 0.75: 'volatile'
 * >= 0.75: 'highly_volatile'
 */
export function classifyDemandVolatility(
  historicalUnits: number[],
): 'very_stable' | 'stable' | 'moderate' | 'volatile' | 'highly_volatile' | 'no_data' {
  if (historicalUnits.length === 0) return 'no_data'
  const mean = historicalUnits.reduce((s, v) => s + v, 0) / historicalUnits.length
  if (mean <= 0) return 'no_data'

  const stdDev = computeStdDeviation(historicalUnits)
  const cv = stdDev / mean

  if (cv < 0.10) return 'very_stable'
  if (cv < 0.25) return 'stable'
  if (cv < 0.50) return 'moderate'
  if (cv < 0.75) return 'volatile'
  return 'highly_volatile'
}

/**
 * months_until_stockout = current_stock / avg_monthly_forecast
 * 'critical': < 1 month
 * 'high':     < 2 months
 * 'medium':   < 3 months
 * 'low':      >= 3 months
 * Returns 'no_data' if avg_monthly_forecast <= 0
 */
export function computeStockoutRisk(
  currentStock: number,
  forecastedDemand: number[],
): 'critical' | 'high' | 'medium' | 'low' | 'no_data' {
  if (forecastedDemand.length === 0) return 'no_data'
  const avgMonthlyForecast =
    forecastedDemand.reduce((s, v) => s + v, 0) / forecastedDemand.length
  if (avgMonthlyForecast <= 0) return 'no_data'

  const monthsUntilStockout = currentStock / avgMonthlyForecast
  if (monthsUntilStockout < 1) return 'critical'
  if (monthsUntilStockout < 2) return 'high'
  if (monthsUntilStockout < 3) return 'medium'
  return 'low'
}

/**
 * EOQ = sqrt(2 * D * S / H)
 * D = annualDemandUnits
 * S = orderCostTry (per order)
 * H = unitCostTry * holdingRateAnnual (default 0.25)
 * Returns null if H <= 0 or D <= 0
 */
export function computeOptimalOrderQuantity(
  annualDemandUnits: number,
  orderCostTry: number,
  unitCostTry: number,
  holdingRateAnnual: number = 0.25,
): number | null {
  const H = unitCostTry * holdingRateAnnual
  if (H <= 0 || annualDemandUnits <= 0) return null
  return Math.sqrt((2 * annualDemandUnits * orderCostTry) / H)
}

/**
 * Linear regression slope over monthly units.
 * positive slope / mean > 0.05: 'growing'
 * negative slope / mean < -0.05: 'declining'
 * else: 'stable'
 * insufficient_data: fewer than 3 points
 */
export function computeDemandTrend(
  monthlyUnits: number[],
): 'growing' | 'stable' | 'declining' | 'insufficient_data' {
  if (monthlyUnits.length < 3) return 'insufficient_data'

  const n = monthlyUnits.length
  const xMean = (n - 1) / 2
  const yMean = monthlyUnits.reduce((s, v) => s + v, 0) / n

  if (yMean <= 0) return 'stable'

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (monthlyUnits[i] - yMean)
    denominator += Math.pow(i - xMean, 2)
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const normalizedSlope = slope / yMean

  if (normalizedSlope > 0.05) return 'growing'
  if (normalizedSlope < -0.05) return 'declining'
  return 'stable'
}

/**
 * current_stock / avg_monthly_demand
 * Returns null if avg_monthly_demand <= 0
 */
export function computeInventoryCoverage(
  currentStockUnits: number,
  avgMonthlyDemand: number,
): number | null {
  if (avgMonthlyDemand <= 0) return null
  return currentStockUnits / avgMonthlyDemand
}

/**
 * Generate demand forecast narrative in Turkish.
 */
export function generateDemandForecastNarrative(
  productName: string,
  trend: ReturnType<typeof computeDemandTrend>,
  volatility: ReturnType<typeof classifyDemandVolatility>,
  stockoutRisk: ReturnType<typeof computeStockoutRisk>,
  coverageMonths: number | null,
): string {
  const trendLabel: Record<string, string> = {
    growing: 'artış eğiliminde',
    stable: 'stabil',
    declining: 'düşüş eğiliminde',
    insufficient_data: 'yetersiz veri',
  }

  const volatilityLabel: Record<string, string> = {
    very_stable: 'çok stabil',
    stable: 'stabil',
    moderate: 'orta düzeyde değişken',
    volatile: 'değişken',
    highly_volatile: 'yüksek değişken',
    no_data: 'veri yok',
  }

  const riskLabel: Record<string, string> = {
    critical: 'kritik',
    high: 'yüksek',
    medium: 'orta',
    low: 'düşük',
    no_data: 'veri yok',
  }

  const trendText = trendLabel[trend] ?? trend
  const volatilityText = volatilityLabel[volatility] ?? volatility
  const riskText = riskLabel[stockoutRisk] ?? stockoutRisk
  const coverageText =
    coverageMonths != null ? `${coverageMonths.toFixed(1)} aylık` : 'bilinmeyen'

  return (
    `${productName} için talep ${trendText} ve ${volatilityText} bir yapı gösteriyor. ` +
    `Stok tükenmesi riski ${riskText} seviyesinde olup mevcut stok ${coverageText} bir kapasiteye sahip.`
  )
}

// ── Service ───────────────────────────────────────────────────────────────────

export class DemandForecastService {
  constructor(private supabase: SupabaseClient) {}

  async getReport(
    companyId: string,
    periodMonths: number = 6,
  ): Promise<DemandForecastReport | null> {
    const generatedAt = new Date().toISOString()

    // ── Fetch data in parallel ────────────────────────────────────────────
    const [stockResult, salesResult, productsResult] = await Promise.allSettled([
      // 1. Current stock per product
      this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0),

      // 2. Sales by product by month
      this.supabase
        .from('sale_items')
        .select('product_id, qty, sales!inner(company_id, sale_date)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null),

      // 3. Products
      this.supabase
        .from('products')
        .select('id, name, cost_price')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const stockRows =
      stockResult.status === 'fulfilled' ? (stockResult.value.data ?? []) : []
    const salesRows =
      salesResult.status === 'fulfilled' ? (salesResult.value.data ?? []) : []
    const productRows =
      productsResult.status === 'fulfilled' ? (productsResult.value.data ?? []) : []

    // ── Build lookup maps ─────────────────────────────────────────────────
    const stockByProduct = new Map<string, number>()
    for (const row of stockRows as Array<{ product_id: string; qty_remaining: number }>) {
      stockByProduct.set(
        row.product_id,
        (stockByProduct.get(row.product_id) ?? 0) + row.qty_remaining,
      )
    }

    const productMap = new Map<string, { name: string; cost_price: number | null }>()
    for (const p of productRows as Array<{ id: string; name: string; cost_price: number | null }>) {
      productMap.set(p.id, { name: p.name, cost_price: p.cost_price })
    }

    // ── Aggregate monthly sales ───────────────────────────────────────────
    const monthlySalesByProduct = new Map<string, Map<string, number>>()
    for (const row of (salesRows as unknown) as Array<{
      product_id: string
      qty: number
      // Supabase returns joined rows as array in CJS context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sales: any
    }>) {
      const salesObj = Array.isArray(row.sales) ? row.sales[0] : row.sales
      if (!row.product_id || !salesObj?.sale_date) continue
      const month = (salesObj.sale_date as string).slice(0, 7)
      if (!monthlySalesByProduct.has(row.product_id)) {
        monthlySalesByProduct.set(row.product_id, new Map())
      }
      const monthMap = monthlySalesByProduct.get(row.product_id)!
      monthMap.set(month, (monthMap.get(month) ?? 0) + (row.qty ?? 0))
    }

    // ── Determine trailing months ─────────────────────────────────────────
    const today = new Date()
    const trailingMonths: string[] = []
    for (let i = 0; i < periodMonths; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      trailingMonths.unshift(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      )
    }

    // ── Build product forecasts ───────────────────────────────────────────
    const productIds = new Set([
      ...Array.from(stockByProduct.keys()),
      ...Array.from(monthlySalesByProduct.keys()),
    ])

    const products: ProductDemandForecast[] = []

    for (const productId of productIds) {
      const info = productMap.get(productId)
      if (!info) continue

      const currentStock = stockByProduct.get(productId) ?? 0
      const monthMap = monthlySalesByProduct.get(productId) ?? new Map<string, number>()
      const historicalUnits = trailingMonths.map(m => monthMap.get(m) ?? 0)

      // Trailing 3m avg
      const last3 = historicalUnits.slice(-3)
      const avg3m = last3.length > 0
        ? last3.reduce((s, v) => s + v, 0) / last3.length
        : 0

      // Exponential smoothing + forecast
      const smoothed = computeExponentialSmoothing(historicalUnits)
      const forecasted3m = computeForecastedDemand(smoothed, 3)

      // Safety stock (14 day lead time, 95% service level)
      const safetyStock = Math.ceil(computeSafetyStock(historicalUnits, 14, 0.95))

      // Reorder point
      const reorderPoint = computeReorderPoint(avg3m, 14, safetyStock)

      // EOQ
      const annualDemand = avg3m * 12
      const costPrice = info.cost_price ?? 0
      const eoq = computeOptimalOrderQuantity(annualDemand, 50, costPrice, 0.25)

      // Analysis
      const trend = computeDemandTrend(historicalUnits)
      const volatility = classifyDemandVolatility(historicalUnits)
      const stockoutRisk = computeStockoutRisk(currentStock, forecasted3m)
      const coverage = computeInventoryCoverage(currentStock, avg3m)

      products.push({
        product_id: productId,
        product_name: info.name,
        current_stock_units: currentStock,
        avg_monthly_units: Math.round(avg3m * 10) / 10,
        forecasted_next_3m: forecasted3m.map(v => Math.round(v * 10) / 10),
        safety_stock_units: safetyStock,
        reorder_point_units: Math.ceil(reorderPoint),
        optimal_order_qty: eoq != null ? Math.ceil(eoq) : null,
        demand_trend: trend,
        volatility,
        stockout_risk: stockoutRisk,
        coverage_months: coverage != null ? Math.round(coverage * 10) / 10 : null,
        needs_reorder: currentStock <= Math.ceil(reorderPoint),
      })
    }

    // Sort by stockout risk severity
    const riskOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, no_data: 4 }
    products.sort((a, b) => (riskOrder[a.stockout_risk] ?? 4) - (riskOrder[b.stockout_risk] ?? 4))

    return {
      company_id: companyId,
      generated_at: generatedAt,
      period_months: periodMonths,
      products,
      critical_stockout_count: products.filter(p => p.stockout_risk === 'critical').length,
      needs_reorder_count: products.filter(p => p.needs_reorder).length,
    }
  }
}
