// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/revenue-forecast-accuracy.service.ts
//
// Revenue Forecast Accuracy & Backtest Service
//
// Evaluates how accurate revenue forecasts are vs actuals using standard
// statistical accuracy metrics: MAPE, RMSE, Bias, Theil's U, Hit Rate.
//
// Since Flowra doesn't store explicit past forecasts, this service runs a
// "backtest": it takes the last N months of actual revenue and simulates
// what a 3-period SMA forecast would have predicted for each month, then
// computes accuracy metrics against the true actuals.
//
// Pure helpers are exported for unit testing (no DB required).
// RevenueForecastAccuracyService class handles DB-connected report generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ForecastAccuracyReport {
  company_id: string
  generated_at: string
  periods_analyzed: number

  // Accuracy metrics
  mape: number | null
  rmse: number | null
  bias: number | null
  theil_u: number | null
  hit_rate_pct: number

  // Classifications
  accuracy_class: ReturnType<typeof classifyForecastAccuracy>
  bias_class: ReturnType<typeof classifyForecastBias>

  // Comparison forecasts
  sma_mape: number | null   // SMA forecast MAPE (benchmark)
  naive_mape: number | null // Naïve forecast MAPE (baseline)

  // Summary
  avg_actual_try: number
  avg_forecast_try: number

  narrative: string
}

// ── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Compute absolute forecast error: |actual - forecast|
 */
export function computeForecastError(actual: number, forecast: number): number {
  return Math.abs(actual - forecast)
}

/**
 * Compute Absolute Percentage Error: |actual - forecast| / actual * 100
 * Returns null if actual === 0 (division by zero)
 */
export function computeAbsolutePercentageError(
  actual: number,
  forecast: number,
): number | null {
  if (actual === 0) return null
  return (Math.abs(actual - forecast) / Math.abs(actual)) * 100
}

/**
 * Compute Mean Absolute Percentage Error across N periods.
 * Ignores periods where actual === 0.
 * Returns null if arrays have different lengths or no valid periods.
 */
export function computeMape(
  actuals: number[],
  forecasts: number[],
): number | null {
  if (actuals.length !== forecasts.length) return null
  if (actuals.length === 0) return null

  const apes: number[] = []
  for (let i = 0; i < actuals.length; i++) {
    const ape = computeAbsolutePercentageError(actuals[i], forecasts[i])
    if (ape !== null) apes.push(ape)
  }

  if (apes.length === 0) return null
  return apes.reduce((sum, v) => sum + v, 0) / apes.length
}

/**
 * Compute Root Mean Squared Error.
 * sqrt(Σ(actual-forecast)² / n)
 * Returns null if arrays are empty or have different lengths.
 */
export function computeRmse(
  actuals: number[],
  forecasts: number[],
): number | null {
  if (actuals.length !== forecasts.length) return null
  if (actuals.length === 0) return null

  const mse =
    actuals.reduce((sum, a, i) => sum + Math.pow(a - forecasts[i], 2), 0) /
    actuals.length
  return Math.sqrt(mse)
}

/**
 * Compute Bias — average signed error: Σ(forecast - actual) / n
 * Positive bias = systematic over-forecast (optimistic)
 * Negative bias = systematic under-forecast (conservative)
 * Returns null if empty or different lengths.
 */
export function computeBias(
  actuals: number[],
  forecasts: number[],
): number | null {
  if (actuals.length !== forecasts.length) return null
  if (actuals.length === 0) return null

  const total = actuals.reduce(
    (sum, a, i) => sum + (forecasts[i] - a),
    0,
  )
  return total / actuals.length
}

/**
 * Classify forecast accuracy based on MAPE value.
 * null → 'no_data'
 * < 5   → 'excellent'
 * < 10  → 'good'
 * < 20  → 'fair'
 * < 35  → 'poor'
 * ≥ 35  → 'critical'
 */
export function classifyForecastAccuracy(
  mape: number | null,
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' | 'no_data' {
  if (mape === null) return 'no_data'
  if (mape < 5) return 'excellent'
  if (mape < 10) return 'good'
  if (mape < 20) return 'fair'
  if (mape < 35) return 'poor'
  return 'critical'
}

/**
 * Classify forecast bias.
 * null → 'no_data'
 * |bias/avg_actual| < 0.03 → 'unbiased'
 * bias > 0 → 'optimistic' (over-forecasting)
 * bias < 0 → 'conservative' (under-forecasting)
 * |bias/avg_actual| > 0.15 → prefix 'significantly_'
 */
export function classifyForecastBias(
  bias: number | null,
  avgActual: number,
):
  | 'unbiased'
  | 'optimistic'
  | 'conservative'
  | 'significantly_optimistic'
  | 'significantly_conservative'
  | 'no_data' {
  if (bias === null) return 'no_data'
  if (avgActual === 0) return 'no_data'

  const ratio = Math.abs(bias / avgActual)

  if (ratio < 0.03) return 'unbiased'

  const isSignificant = ratio > 0.15

  if (bias > 0) {
    return isSignificant ? 'significantly_optimistic' : 'optimistic'
  }
  return isSignificant ? 'significantly_conservative' : 'conservative'
}

/**
 * Compute Theil's U statistic: RMSE(model) / RMSE(naïve forecast)
 * Naïve forecast for period t = actual[t-1]
 * U < 1: model better than naïve
 * U = 1: same as naïve
 * U > 1: worse than naïve
 * Returns null if actuals.length < 2.
 */
export function computeTheilU(
  actuals: number[],
  forecasts: number[],
): number | null {
  if (actuals.length < 2) return null
  if (actuals.length !== forecasts.length) return null

  // Model RMSE (skip first period if needed — use all pairs)
  const modelRmse = computeRmse(actuals, forecasts)
  if (modelRmse === null) return null

  // Naïve RMSE: forecast[t] = actual[t-1], compare actuals[1..n] vs actuals[0..n-1]
  const naiveActuals = actuals.slice(1)
  const naiveForecasts = actuals.slice(0, -1)
  const naiveRmse = computeRmse(naiveActuals, naiveForecasts)

  if (naiveRmse === null || naiveRmse === 0) return null

  return modelRmse / naiveRmse
}

/**
 * Compute Hit Rate — % of periods where forecast is within thresholdPct% of actual.
 * Default threshold: 10%
 * Returns 0 if no actuals.
 */
export function computeHitRate(
  actuals: number[],
  forecasts: number[],
  thresholdPct: number = 10,
): number {
  if (actuals.length === 0) return 0
  if (actuals.length !== forecasts.length) return 0

  let hits = 0
  for (let i = 0; i < actuals.length; i++) {
    const actual = actuals[i]
    if (actual === 0) {
      // If actual is 0, check if forecast is also 0
      if (forecasts[i] === 0) hits++
      continue
    }
    const ape = computeAbsolutePercentageError(actual, forecasts[i])
    if (ape !== null && ape <= thresholdPct) hits++
  }
  return (hits / actuals.length) * 100
}

/**
 * Compute Simple Moving Average forecast.
 * Given historical values, generate forecastN ahead using 3-period SMA.
 * Returns array of forecastN values.
 */
export function computeSimpleMovingAvgForecast(
  history: number[],
  forecastN: number,
): number[] {
  if (history.length === 0 || forecastN <= 0) return []
  const period = 3
  const result: number[] = []
  const extended = [...history]

  for (let i = 0; i < forecastN; i++) {
    const window = extended.slice(-Math.min(period, extended.length))
    const avg = window.reduce((s, v) => s + v, 0) / window.length
    result.push(avg)
    extended.push(avg)
  }
  return result
}

/**
 * Compute Naïve forecast: next period = last period value (random walk baseline).
 * Returns array of forecastN values (all equal to last history value).
 */
export function computeNaiveForecast(
  history: number[],
  forecastN: number,
): number[] {
  if (history.length === 0 || forecastN <= 0) return []
  const lastValue = history[history.length - 1]
  return Array(forecastN).fill(lastValue)
}

/**
 * Generate a Turkish narrative summarizing forecast quality.
 */
export function generateForecastAccuracyNarrative(
  mape: number | null,
  accuracyClass: ReturnType<typeof classifyForecastAccuracy>,
  biasClass: ReturnType<typeof classifyForecastBias>,
  hitRate: number,
  periodsAnalyzed: number,
): string {
  if (accuracyClass === 'no_data' || mape === null) {
    return 'Tahmin doğruluğunu değerlendirmek için yeterli veri bulunmuyor.'
  }

  const accuracyLabels: Record<string, string> = {
    excellent: 'mükemmel',
    good: 'iyi',
    fair: 'orta',
    poor: 'zayıf',
    critical: 'kritik düzeyde düşük',
  }

  const biasLabels: Record<string, string> = {
    unbiased: 'Tahminler sistematik sapma göstermiyor.',
    optimistic: 'Tahminler hafif iyimser (gerçeğin üzerinde kalıyor).',
    conservative:
      'Tahminler hafif tutucu (gerçeğin altında kalıyor).',
    significantly_optimistic:
      'Tahminler belirgin şekilde iyimser; gerçekleşen değerlerin çok üzerinde.',
    significantly_conservative:
      'Tahminler belirgin şekilde tutucu; gerçekleşen değerlerin çok altında.',
    no_data: '',
  }

  const label = accuracyLabels[accuracyClass] ?? accuracyClass
  const biasNote = biasLabels[biasClass] ?? ''
  const mapeFormatted = mape.toFixed(1)
  const hitFormatted = hitRate.toFixed(0)

  let narrative =
    `Son ${periodsAnalyzed} dönem analiz edildi. ` +
    `Ortalama mutlak yüzde hata (MAPE) %${mapeFormatted} ile tahmin doğruluğu ${label} seviyesinde. ` +
    `Tahminlerin %${hitFormatted}'i gerçekleşmenin ±%%10 bandında kaldı.`

  if (biasNote) {
    narrative += ` ${biasNote}`
  }

  return narrative
}

// ── DB-connected Service ──────────────────────────────────────────────────────

export class RevenueForecastAccuracyService {
  constructor(private supabase: AnyClient) {}

  async getReport(
    companyId: string,
    lookbackMonths: number = 12,
  ): Promise<ForecastAccuracyReport | null> {
    // Fetch actual booked revenue from sales (there is no `transactions` table;
    // revenue = sales.total_try by sale_date).
    const { data: rows, error } = await this.supabase
      .from('sales')
      .select('total_try, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: true })

    if (error || !rows || rows.length === 0) return null

    // Aggregate by month
    const monthMap = new Map<string, number>()
    for (const row of rows) {
      if (!row.sale_date) continue
      const month = (row.sale_date as string).slice(0, 7) // YYYY-MM
      monthMap.set(month, (monthMap.get(month) ?? 0) + (Number(row.total_try) || 0))
    }

    // Sort months and take last lookbackMonths
    const sortedMonths = Array.from(monthMap.keys()).sort()
    const recentMonths = sortedMonths.slice(-lookbackMonths)
    const actuals = recentMonths.map((m) => monthMap.get(m) ?? 0)

    if (actuals.length < 4) return null // need at least 4 periods for meaningful backtest

    // Backtest: for each month from index 3 onwards, use SMA of prior 3 months as forecast
    const backtestActuals: number[] = []
    const smaForecasts: number[] = []
    const naiveForecasts: number[] = []

    for (let i = 3; i < actuals.length; i++) {
      const history = actuals.slice(0, i)
      backtestActuals.push(actuals[i])
      // SMA forecast: average of last 3 in history
      const smaWindow = history.slice(-3)
      smaForecasts.push(smaWindow.reduce((s, v) => s + v, 0) / smaWindow.length)
      // Naïve forecast: last value
      naiveForecasts.push(history[history.length - 1])
    }

    const periodsAnalyzed = backtestActuals.length
    const avgActual =
      periodsAnalyzed > 0
        ? backtestActuals.reduce((s, v) => s + v, 0) / periodsAnalyzed
        : 0
    const avgForecast =
      periodsAnalyzed > 0
        ? smaForecasts.reduce((s, v) => s + v, 0) / periodsAnalyzed
        : 0

    const mape = computeMape(backtestActuals, smaForecasts)
    const rmse = computeRmse(backtestActuals, smaForecasts)
    const bias = computeBias(backtestActuals, smaForecasts)
    const theilU = computeTheilU(backtestActuals, smaForecasts)
    const hitRate = computeHitRate(backtestActuals, smaForecasts, 10)

    const smaMape = mape // already SMA-based
    const naiveMape = computeMape(backtestActuals, naiveForecasts)

    const accuracyClass = classifyForecastAccuracy(mape)
    const biasClass = classifyForecastBias(bias, avgActual)

    const narrative = generateForecastAccuracyNarrative(
      mape,
      accuracyClass,
      biasClass,
      hitRate,
      periodsAnalyzed,
    )

    return {
      company_id: companyId,
      generated_at: new Date().toISOString(),
      periods_analyzed: periodsAnalyzed,
      mape,
      rmse,
      bias,
      theil_u: theilU,
      hit_rate_pct: hitRate,
      accuracy_class: accuracyClass,
      bias_class: biasClass,
      sma_mape: smaMape,
      naive_mape: naiveMape,
      avg_actual_try: avgActual,
      avg_forecast_try: avgForecast,
      narrative,
    }
  }
}
