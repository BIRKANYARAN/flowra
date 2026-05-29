// ─────────────────────────────────────────────────────────────────────────────
// lib/services/commercial/revenue-forecast.service.ts
//
// Revenue Forecast Service — 3/6/12-month revenue forecasts using:
//   • Moving averages (simple, weighted, exponential)
//   • Trend analysis (linear regression, MoM growth, CMGR)
//   • Seasonal adjustments
//   • Confidence intervals
//
// DB: sales table (sale_date, total, company_id, is_proforma, deleted_at)
// All monetary values in TRY.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Report shape ──────────────────────────────────────────────────────────────

export interface RevenueForecastReport {
  as_of_date: string
  history_months: number              // how many months of history used
  current_month: string               // YYYY-MM

  // Historical (last 6 months, oldest first)
  historical_monthly: Array<{
    month: string                     // YYYY-MM
    revenue: number
  }>

  // 3-month forecast
  forecast_3m: Array<{
    month: string
    base: number
    optimistic: number
    pessimistic: number
    confidence_interval: { lower: number; upper: number }
  }>

  // 6-month forecast
  forecast_6m: Array<{
    month: string
    base: number
    optimistic: number
    pessimistic: number
  }>

  // Trend metrics
  trend_slope: number | null          // monthly revenue change
  r_squared: number | null
  cmgr: number | null                 // compound monthly growth rate

  // Quality
  forecast_confidence: ReturnType<typeof classifyForecastConfidence>

  // Totals
  forecast_3m_total_base: number
  forecast_6m_total_base: number

  narrative: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Return mean of array; 0 if empty. */
function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

/** Return population stddev of array; 0 if fewer than 2 elements. */
function stddev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

/** Add n months to a YYYY-MM string */
function addMonths(yyyyMM: string, n: number): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Moving Average ────────────────────────────────────────────────────────────

/**
 * Compute simple moving average of the last N values.
 * Returns null if fewer than N values available.
 */
export function computeSimpleMovingAverage(values: number[], n: number): number | null {
  if (values.length < n) return null
  const window = values.slice(values.length - n)
  return r2(window.reduce((s, v) => s + v, 0) / n)
}

/**
 * Compute weighted moving average (most recent has highest weight).
 * Weights are 1, 2, 3, ..., n (linear, with n being most recent).
 * Returns null if values.length < n.
 */
export function computeWeightedMovingAverage(values: number[], n: number): number | null {
  if (values.length < n) return null
  const window = values.slice(values.length - n)
  let weightedSum = 0
  let totalWeight = 0
  for (let i = 0; i < n; i++) {
    const weight = i + 1  // 1 for oldest, n for most recent
    weightedSum += window[i] * weight
    totalWeight += weight
  }
  return r2(weightedSum / totalWeight)
}

/**
 * Compute exponential moving average (EMA).
 * alpha: smoothing factor (0-1). Default 0.3 (higher = more reactive to recent data).
 * EMA[0] = values[0]
 * EMA[i] = alpha * values[i] + (1 - alpha) * EMA[i-1]
 * Returns null if values is empty.
 */
export function computeExponentialMovingAverage(values: number[], alpha: number = 0.3): number | null {
  if (values.length === 0) return null
  let ema = values[0]
  for (let i = 1; i < values.length; i++) {
    ema = alpha * values[i] + (1 - alpha) * ema
  }
  return r2(ema)
}

// ── Trend Extraction ──────────────────────────────────────────────────────────

/**
 * Compute linear trend slope using least-squares regression.
 * Returns slope (revenue per month change) and r_squared.
 * Returns null if fewer than 2 non-zero values.
 */
export function computeRevenueTrendSlope(
  monthlyRevenues: number[],
): { slope: number; r_squared: number } | null {
  const nonZero = monthlyRevenues.filter(v => v !== 0)
  if (nonZero.length < 2) return null

  const n = monthlyRevenues.length
  const xMean = (n - 1) / 2
  const yMean = monthlyRevenues.reduce((s, v) => s + v, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    numerator += dx * (monthlyRevenues[i] - yMean)
    denominator += dx * dx
  }

  const slope = denominator === 0 ? 0 : numerator / denominator
  const intercept = yMean - slope * xMean

  // Compute R²
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    ssTot += (monthlyRevenues[i] - yMean) ** 2
    ssRes += (monthlyRevenues[i] - (intercept + slope * i)) ** 2
  }

  const r_squared = ssTot === 0 ? 1.0 : Math.max(0, 1 - ssRes / ssTot)

  return { slope: r2(slope), r_squared: r2(r_squared) }
}

/**
 * Compute month-over-month growth rates (as decimals, not pct).
 * Returns empty array if fewer than 2 values.
 * Skips pairs where prior === 0.
 */
export function computeMomGrowthRates(monthlyRevenues: number[]): number[] {
  if (monthlyRevenues.length < 2) return []
  const rates: number[] = []
  for (let i = 1; i < monthlyRevenues.length; i++) {
    const prior = monthlyRevenues[i - 1]
    if (prior === 0) continue
    rates.push(r2((monthlyRevenues[i] - prior) / prior))
  }
  return rates
}

/**
 * Compute compound monthly growth rate (CMGR).
 * CMGR = (lastValue / firstValue)^(1/(n-1)) - 1
 * Returns null if firstValue <= 0 or n < 2.
 */
export function computeCmgr(firstValue: number, lastValue: number, n: number): number | null {
  if (firstValue <= 0 || n < 2) return null
  return r2((lastValue / firstValue) ** (1 / (n - 1)) - 1)
}

// ── Seasonal Adjustment ───────────────────────────────────────────────────────

/**
 * Compute seasonal indices from historical monthly data.
 * For each calendar month (1-12), compute ratio of month average to overall average.
 * seasonalIndex[m] = avgRevenue_month_m / overallAvgRevenue
 * Returns map of month (1-12) → seasonal index.
 * Returns empty map if insufficient data.
 *
 * Needs at least 12 months of data with month assignments.
 */
export function computeSeasonalIndices(
  monthlyData: Array<{ year: number; month: number; revenue: number }>,
): Map<number, number> {
  const result = new Map<number, number>()
  if (monthlyData.length < 12) return result

  const overallAvg = mean(monthlyData.map(d => d.revenue))
  if (overallAvg === 0) return result

  // Group by calendar month
  const byMonth = new Map<number, number[]>()
  for (const d of monthlyData) {
    if (!byMonth.has(d.month)) byMonth.set(d.month, [])
    byMonth.get(d.month)!.push(d.revenue)
  }

  for (const [month, revenues] of byMonth.entries()) {
    const avg = mean(revenues)
    result.set(month, r2(avg / overallAvg))
  }

  return result
}

/**
 * Apply seasonal adjustment to a forecast value.
 * adjustedForecast = baseForecast * seasonalIndex (default 1.0 if no index).
 */
export function applySeasonalAdjustment(
  baseForecast: number,
  seasonalIndex: number,
): number {
  return r2(baseForecast * seasonalIndex)
}

// ── Confidence Intervals ──────────────────────────────────────────────────────

/**
 * Compute forecast confidence interval based on historical volatility.
 * Uses stddev of monthly revenues to set interval width.
 * width = stddev * zScore (default zScore 1.28 = 80% CI).
 * Returns: { lower: max(0, forecast - width), upper: forecast + width }
 */
export function computeForecastConfidenceInterval(
  forecast: number,
  historicalRevenues: number[],
  zScore: number = 1.28,
): { lower: number; upper: number } {
  const sd = stddev(historicalRevenues)
  const width = sd * zScore
  return {
    lower: r2(Math.max(0, forecast - width)),
    upper: r2(forecast + width),
  }
}

// ── Forecast Generation ───────────────────────────────────────────────────────

/**
 * Generate N-month forecast using weighted moving average + trend extrapolation.
 * algorithm:
 *   baseEstimate = computeWeightedMovingAverage(history, min(6, history.length))
 *   trendAdjustment = slope × monthOffset (from trend regression)
 *   forecast[i] = baseEstimate + slope * i
 *   Floored at 0.
 *
 * Returns array of N forecast values.
 * Returns empty array if history has fewer than 2 values.
 */
export function generateMonthlyForecast(
  history: number[],
  months: number,
): number[] {
  if (history.length < 2) return []

  const windowSize = Math.min(6, history.length)
  const baseEstimate = computeWeightedMovingAverage(history, windowSize)
  if (baseEstimate === null) return []

  const trendResult = computeRevenueTrendSlope(history)
  const slope = trendResult ? trendResult.slope : 0

  const result: number[] = []
  for (let i = 1; i <= months; i++) {
    result.push(r2(Math.max(0, baseEstimate + slope * i)))
  }
  return result
}

/**
 * Generate 3 scenario forecasts: base, optimistic (+20%), pessimistic (-20%).
 */
export function generateScenarioForecasts(
  history: number[],
  months: number,
): {
  base: number[]
  optimistic: number[]
  pessimistic: number[]
} {
  const base = generateMonthlyForecast(history, months)
  return {
    base,
    optimistic: base.map(v => r2(v * 1.2)),
    pessimistic: base.map(v => r2(v * 0.8)),
  }
}

// ── Forecast Quality ──────────────────────────────────────────────────────────

/**
 * Classify forecast confidence based on data quality and trend stability.
 * 'high': historyMonths >= 12 AND r_squared >= 0.7
 * 'medium': historyMonths >= 6 AND r_squared >= 0.4
 * 'low': historyMonths >= 3
 * 'insufficient': historyMonths < 3
 */
export function classifyForecastConfidence(
  historyMonths: number,
  rSquared: number | null,
): 'high' | 'medium' | 'low' | 'insufficient' {
  if (historyMonths < 3) return 'insufficient'
  if (historyMonths >= 12 && rSquared !== null && rSquared >= 0.7) return 'high'
  if (historyMonths >= 6 && rSquared !== null && rSquared >= 0.4) return 'medium'
  return 'low'
}

/**
 * Compute forecast accuracy (MAPE - Mean Absolute Percentage Error) for backtesting.
 * Compare forecasted vs actual for a hold-out period.
 * MAPE = mean(|actual - forecast| / actual * 100)
 * Returns null if any actual === 0.
 */
export function computeMape(
  actuals: number[],
  forecasts: number[],
): number | null {
  if (actuals.length === 0 || actuals.length !== forecasts.length) return null
  for (const a of actuals) {
    if (a === 0) return null
  }
  const apes = actuals.map((a, i) => Math.abs(a - forecasts[i]) / a * 100)
  return r2(mean(apes))
}

/**
 * Classify forecast accuracy from MAPE.
 * 'excellent': MAPE < 5%
 * 'good': MAPE < 10%
 * 'acceptable': MAPE < 20%
 * 'poor': MAPE >= 20%
 * Returns 'no_data' if null.
 */
export function classifyForecastAccuracy(
  mape: number | null,
): 'excellent' | 'good' | 'acceptable' | 'poor' | 'no_data' {
  if (mape === null) return 'no_data'
  if (mape < 5) return 'excellent'
  if (mape < 10) return 'good'
  if (mape < 20) return 'acceptable'
  return 'poor'
}

/**
 * Generate Turkish revenue forecast narrative.
 */
export function generateForecastNarrative(
  confidence: ReturnType<typeof classifyForecastConfidence>,
  nextMonthForecast: number,
  currentMonthActual: number,
  trend: 'growing' | 'stable' | 'declining',
): string {
  const fmt = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })
  const forecastStr = `₺${fmt.format(Math.round(nextMonthForecast))}`

  const confidenceLabel: Record<typeof confidence, string> = {
    high: 'yüksek güvenilirlikle',
    medium: 'orta güvenilirlikle',
    low: 'düşük güvenilirlikle',
    insufficient: 'yetersiz veri nedeniyle sınırlı güvenilirlikle',
  }

  const trendLabel: Record<typeof trend, string> = {
    growing: 'büyüme trendi devam ediyor',
    stable: 'gelirler istikrarlı seyrediyor',
    declining: 'düşüş trendi gözlemleniyor',
  }

  const confStr = confidenceLabel[confidence]
  const trendStr = trendLabel[trend]

  if (confidence === 'insufficient') {
    return `Gelecek ay gelir tahmini ${confStr} ${forecastStr} olarak hesaplandı. Daha güvenilir tahminler için en az 3 aylık veri gereklidir.`
  }

  if (currentMonthActual > 0) {
    const diff = nextMonthForecast - currentMonthActual
    const pct = (diff / currentMonthActual) * 100
    const sign = pct >= 0 ? '+' : ''
    return `Gelecek ay ${forecastStr} gelir bekleniyor (${sign}${pct.toFixed(1)}%); ${trendStr}, tahmin ${confStr} yapılmıştır.`
  }

  return `Gelecek ay ${forecastStr} gelir öngörülüyor; ${trendStr}, tahmin ${confStr} yapılmıştır.`
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RevenueForecastService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    historyMonths: number = 12,
  ): Promise<RevenueForecastReport> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonthNum = now.getMonth() + 1
    const currentMonth = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`

    // Build list of history month keys (oldest first)
    const historyKeys: string[] = []
    for (let i = historyMonths; i >= 1; i--) {
      historyKeys.push(addMonths(currentMonth, -i))
    }

    const fromDate = historyKeys[0] + '-01'
    // Last day of month before current
    const prevMonthEnd = new Date(currentYear, currentMonthNum - 1, 0)
    const toDate = `${prevMonthEnd.getFullYear()}-${String(prevMonthEnd.getMonth() + 1).padStart(2, '0')}-${String(prevMonthEnd.getDate()).padStart(2, '0')}`

    // Fetch sales grouped by month
    const { data: salesData } = await this.supabase
      .from('sales')
      .select('sale_date, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('is_proforma', false)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)

    // Aggregate by YYYY-MM
    const revenueByMonth = new Map<string, number>()
    for (const key of historyKeys) revenueByMonth.set(key, 0)

    for (const row of (salesData ?? [])) {
      if (!row.sale_date) continue
      const ym = (row.sale_date as string).slice(0, 7)
      if (revenueByMonth.has(ym)) {
        revenueByMonth.set(ym, r2((revenueByMonth.get(ym) ?? 0) + (Number(row.total) || 0)))
      }
    }

    const historyValues = historyKeys.map(ym => revenueByMonth.get(ym) ?? 0)
    const actualHistoryMonths = historyValues.filter(v => v > 0).length

    // Trend analysis
    const trendResult = computeRevenueTrendSlope(historyValues)
    const trend_slope = trendResult?.slope ?? null
    const r_squared = trendResult?.r_squared ?? null

    // CMGR from first to last value
    const first = historyValues[0]
    const last = historyValues[historyValues.length - 1]
    const cmgr = computeCmgr(first, last, historyValues.length)

    // Generate forecasts
    const scenarios3m = generateScenarioForecasts(historyValues, 3)
    const scenarios6m = generateScenarioForecasts(historyValues, 6)

    // Build forecast_3m with confidence intervals
    const forecast_3m = scenarios3m.base.map((base, i) => {
      const month = addMonths(currentMonth, i + 1)
      return {
        month,
        base,
        optimistic: scenarios3m.optimistic[i],
        pessimistic: scenarios3m.pessimistic[i],
        confidence_interval: computeForecastConfidenceInterval(base, historyValues),
      }
    })

    // Build forecast_6m
    const forecast_6m = scenarios6m.base.map((base, i) => ({
      month: addMonths(currentMonth, i + 1),
      base,
      optimistic: scenarios6m.optimistic[i],
      pessimistic: scenarios6m.pessimistic[i],
    }))

    // Historical last 6 months
    const last6Keys = historyKeys.slice(-6)
    const historical_monthly = last6Keys.map(month => ({
      month,
      revenue: revenueByMonth.get(month) ?? 0,
    }))

    // Forecast confidence
    const forecast_confidence = classifyForecastConfidence(
      actualHistoryMonths > 0 ? actualHistoryMonths : historyMonths,
      r_squared,
    )

    // Totals
    const forecast_3m_total_base = r2(forecast_3m.reduce((s, m) => s + m.base, 0))
    const forecast_6m_total_base = r2(forecast_6m.reduce((s, m) => s + m.base, 0))

    // Determine trend direction for narrative
    const momRates = computeMomGrowthRates(historyValues.slice(-6))
    const avgMom = momRates.length > 0 ? mean(momRates) : 0
    const trendDirection: 'growing' | 'stable' | 'declining' =
      avgMom > 0.02 ? 'growing' : avgMom < -0.02 ? 'declining' : 'stable'

    // Current month actual (last history month value is used as proxy)
    const currentMonthActual = historyValues[historyValues.length - 1] ?? 0
    const nextMonthForecast = forecast_3m[0]?.base ?? 0

    const narrative = generateForecastNarrative(
      forecast_confidence,
      nextMonthForecast,
      currentMonthActual,
      trendDirection,
    )

    return {
      as_of_date: now.toISOString().slice(0, 10),
      history_months: historyValues.filter(v => v > 0).length,
      current_month: currentMonth,
      historical_monthly,
      forecast_3m,
      forecast_6m,
      trend_slope,
      r_squared,
      cmgr,
      forecast_confidence,
      forecast_3m_total_base,
      forecast_6m_total_base,
      narrative,
    }
  }
}
