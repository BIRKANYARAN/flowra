// ══════════════════════════════════════════════════════════════════════════════
// lib/services/planning/forecast-accuracy.service.ts
//
// Revenue Forecast Accuracy & Variance Analysis
//
// Compares baseline scenario forecasts against actual sales revenue, computing
// MAPE, bias, hit rate, and improvement trend across the last 12 months.
//
// Data sources:
//   Forecast: simulation_scenarios WHERE is_baseline = true,
//             monthly_breakdown JSONB array (each entry: month, revenue_try)
//   Actuals:  SUM(sales.total_try) grouped by YYYY-MM
//
// Pure exports (unit testable, no DB):
//   computeForecastError, computeMape, computeBias,
//   classifyForecastAccuracy, classifyForecastBias,
//   computeMonthlyForecastVariance, computeForecastImprovementTrend,
//   computeHitRate
//
// DB-bound service: ForecastAccuracyService.getReport(companyId)
// ══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type ForecastAccuracyClass =
  | 'excellent'
  | 'good'
  | 'acceptable'
  | 'poor'
  | 'unreliable'
  | 'insufficient_data'

export type ForecastBiasClass =
  | 'unbiased'
  | 'over_forecast'
  | 'under_forecast'
  | 'insufficient_data'

export type ForecastImprovementTrend =
  | 'improving'
  | 'stable'
  | 'deteriorating'
  | 'insufficient_data'

export interface MonthlyVarianceEntry {
  month: string
  forecast: number
  actual: number
  error: number
  error_pct: number | null
  is_over_forecast: boolean
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Returns forecast - actual.
 * Positive = overforecast, negative = underforecast.
 */
export function computeForecastError(
  forecast: number,
  actual: number,
): number {
  return forecast - actual
}

/**
 * Mean Absolute Percentage Error = (1/n) × Σ |forecast[i] - actual[i]| / |actual[i]| × 100
 * Skips pairs where actual[i] === 0 (division by zero).
 * Returns null if no valid pairs.
 * Result is a percentage (0–100+).
 */
export function computeMape(
  forecasts: number[],
  actuals: number[],
): number | null {
  if (forecasts.length === 0 || forecasts.length !== actuals.length) return null

  let sum = 0
  let count = 0

  for (let i = 0; i < forecasts.length; i++) {
    const actual   = actuals[i]
    const forecast = forecasts[i]
    if (actual === 0) continue
    sum += Math.abs(forecast - actual) / Math.abs(actual)
    count++
  }

  if (count === 0) return null
  return (sum / count) * 100
}

/**
 * Mean Forecast Error = (1/n) × Σ (forecast[i] - actual[i])
 * Returns null if arrays are empty or different lengths.
 * Positive = systematic overforecasting, negative = underforecasting.
 */
export function computeBias(
  forecasts: number[],
  actuals: number[],
): number | null {
  if (
    forecasts.length === 0 ||
    actuals.length === 0 ||
    forecasts.length !== actuals.length
  ) {
    return null
  }

  let sum = 0
  for (let i = 0; i < forecasts.length; i++) {
    sum += forecasts[i] - actuals[i]
  }
  return sum / forecasts.length
}

/**
 * Classify forecast accuracy from MAPE percentage.
 *   insufficient_data: null
 *   excellent:  <= 5%
 *   good:       <= 10%
 *   acceptable: <= 20%
 *   poor:       <= 30%
 *   unreliable: > 30%
 */
export function classifyForecastAccuracy(
  mapePct: number | null,
): ForecastAccuracyClass {
  if (mapePct === null) return 'insufficient_data'
  if (mapePct <= 5)  return 'excellent'
  if (mapePct <= 10) return 'good'
  if (mapePct <= 20) return 'acceptable'
  if (mapePct <= 30) return 'poor'
  return 'unreliable'
}

/**
 * Classify forecast bias using normalized bias.
 *   insufficient_data: bias is null or avgActual === 0
 *   normalizedBias = (bias / avgActual) × 100
 *   over_forecast:   normalizedBias > 5%
 *   under_forecast:  normalizedBias < -5%
 *   unbiased:        -5% to 5%
 */
export function classifyForecastBias(
  bias: number | null,
  avgActual: number,
): ForecastBiasClass {
  if (bias === null || avgActual === 0) return 'insufficient_data'
  const normalizedBias = (bias / avgActual) * 100
  if (normalizedBias > 5)  return 'over_forecast'
  if (normalizedBias < -5) return 'under_forecast'
  return 'unbiased'
}

/**
 * Compute per-month forecast vs actual variance.
 */
export function computeMonthlyForecastVariance(
  months: Array<{
    month: string
    forecast: number
    actual: number
  }>,
): MonthlyVarianceEntry[] {
  return months.map(({ month, forecast, actual }) => {
    const error         = computeForecastError(forecast, actual)
    const error_pct     = actual === 0 ? null : (error / Math.abs(actual)) * 100
    const is_over_forecast = error > 0

    return {
      month,
      forecast,
      actual,
      error,
      error_pct,
      is_over_forecast,
    }
  })
}

/**
 * Compute whether forecast accuracy is improving or deteriorating over time.
 * Split into first half and second half of provided months.
 * Compares average absolute error_pct (ignoring nulls).
 *   insufficient_data: < 4 months with non-null error_pct
 *   improving:      second half avg < first half avg × 0.9
 *   deteriorating:  second half avg > first half avg × 1.1
 *   stable:         else
 */
export function computeForecastImprovementTrend(
  monthlyVariances: Array<{ error_pct: number | null }>,
): ForecastImprovementTrend {
  const valid = monthlyVariances
    .map(v => v.error_pct)
    .filter((v): v is number => v !== null)

  if (valid.length < 4) return 'insufficient_data'

  const mid       = Math.floor(valid.length / 2)
  const firstHalf = valid.slice(0, mid)
  const secondHalf = valid.slice(mid)

  const avgFirst  = firstHalf.reduce((s, v) => s + Math.abs(v), 0) / firstHalf.length
  const avgSecond = secondHalf.reduce((s, v) => s + Math.abs(v), 0) / secondHalf.length

  if (avgSecond < avgFirst * 0.9)  return 'improving'
  if (avgSecond > avgFirst * 1.1)  return 'deteriorating'
  return 'stable'
}

/**
 * Returns % of months where |error_pct| <= tolerance (default 10%).
 * Returns null if no non-null entries.
 */
export function computeHitRate(
  monthlyVariances: Array<{ error_pct: number | null }>,
  tolerancePct: number = 10,
): number | null {
  const valid = monthlyVariances
    .map(v => v.error_pct)
    .filter((v): v is number => v !== null)

  if (valid.length === 0) return null

  const hits = valid.filter(v => Math.abs(v) <= tolerancePct).length
  return (hits / valid.length) * 100
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

// ── DB-bound service ──────────────────────────────────────────────────────────

export class ForecastAccuracyService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    last_12_months: {
      mape_pct: number | null
      bias: number | null
      accuracy_class: ForecastAccuracyClass
      bias_class: ForecastBiasClass
      hit_rate_pct: number | null
      improvement_trend: ForecastImprovementTrend
    }
    monthly_variances: MonthlyVarianceEntry[]
    summary: {
      best_month: string | null
      worst_month: string | null
      total_forecast: number
      total_actual: number
      total_error: number
    }
  }> {
    const monthKeys = lastNMonthKeys(12)
    const windowFrom = `${monthKeys[0]}-01`
    const lastKey    = monthKeys[monthKeys.length - 1]
    const [lastYear, lastMonth] = lastKey.split('-').map(Number)
    const lastDay    = new Date(lastYear, lastMonth, 0).getDate()
    const windowTo   = `${lastKey}-${String(lastDay).padStart(2, '0')}`

    // ── Fetch in parallel ─────────────────────────────────────────────────────
    const [scenarioResult, salesResult] = await Promise.allSettled([
      // Baseline forecast scenario
      this.supabase
        .from('simulation_scenarios')
        .select('id, monthly_breakdown')
        .eq('company_id', companyId)
        .eq('is_baseline', true)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Actual revenue grouped by month
      this.supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo)
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Extract baseline scenario ─────────────────────────────────────────────
    const scenarioRow =
      scenarioResult.status === 'fulfilled' && scenarioResult.value?.data
        ? scenarioResult.value.data
        : null

    // No baseline → empty report
    if (!scenarioRow) {
      return {
        last_12_months: {
          mape_pct:           null,
          bias:               null,
          accuracy_class:     'insufficient_data',
          bias_class:         'insufficient_data',
          hit_rate_pct:       null,
          improvement_trend:  'insufficient_data',
        },
        monthly_variances: [],
        summary: {
          best_month:      null,
          worst_month:     null,
          total_forecast:  0,
          total_actual:    0,
          total_error:     0,
        },
      }
    }

    // ── Build forecast map from monthly_breakdown ─────────────────────────────
    type BreakdownEntry = {
      month?: string
      revenue_try?: number
      revenue?: number
      net_income?: number
      net_try?: number
    }
    const forecastByMonth = new Map<string, number>()
    const breakdown = (scenarioRow.monthly_breakdown ?? []) as BreakdownEntry[]
    for (const entry of breakdown) {
      if (!entry.month) continue
      // Normalize month key to YYYY-MM (may be stored as YYYY-MM-DD)
      const monthKey = entry.month.slice(0, 7)
      const revenue  =
        Number(entry.revenue_try ?? entry.revenue ?? entry.net_income ?? entry.net_try ?? 0)
      forecastByMonth.set(monthKey, revenue)
    }

    // ── Build actual revenue map from sales ───────────────────────────────────
    const actualByMonth = new Map<string, number>()
    for (const key of monthKeys) actualByMonth.set(key, 0)

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const monthKey = (row.sale_date as string).slice(0, 7)
        if (actualByMonth.has(monthKey)) {
          actualByMonth.set(monthKey, (actualByMonth.get(monthKey) ?? 0) + Number(row.total_try ?? 0))
        }
      }
    }

    // ── Build matched month pairs ─────────────────────────────────────────────
    const matchedMonths: Array<{ month: string; forecast: number; actual: number }> = []
    for (const key of monthKeys) {
      if (!forecastByMonth.has(key)) continue
      matchedMonths.push({
        month:    key,
        forecast: forecastByMonth.get(key) ?? 0,
        actual:   actualByMonth.get(key)   ?? 0,
      })
    }

    if (matchedMonths.length === 0) {
      return {
        last_12_months: {
          mape_pct:           null,
          bias:               null,
          accuracy_class:     'insufficient_data',
          bias_class:         'insufficient_data',
          hit_rate_pct:       null,
          improvement_trend:  'insufficient_data',
        },
        monthly_variances: [],
        summary: {
          best_month:      null,
          worst_month:     null,
          total_forecast:  0,
          total_actual:    0,
          total_error:     0,
        },
      }
    }

    // ── Compute stats ─────────────────────────────────────────────────────────
    const forecastArr = matchedMonths.map(m => m.forecast)
    const actualArr   = matchedMonths.map(m => m.actual)

    const mape_pct         = computeMape(forecastArr, actualArr)
    const bias             = computeBias(forecastArr, actualArr)
    const monthlyVariances = computeMonthlyForecastVariance(matchedMonths)
    const hit_rate_pct     = computeHitRate(monthlyVariances)
    const improvement_trend = computeForecastImprovementTrend(monthlyVariances)

    const avgActual =
      actualArr.length > 0
        ? actualArr.reduce((s, v) => s + v, 0) / actualArr.length
        : 0

    const accuracy_class = classifyForecastAccuracy(mape_pct)
    const bias_class     = classifyForecastBias(bias, avgActual)

    // ── Summary ───────────────────────────────────────────────────────────────
    let bestMonth:  string | null = null
    let worstMonth: string | null = null
    let bestAbs  = Infinity
    let worstAbs = -Infinity

    for (const v of monthlyVariances) {
      if (v.error_pct === null) continue
      const abs = Math.abs(v.error_pct)
      if (abs < bestAbs)  { bestAbs  = abs;  bestMonth  = v.month }
      if (abs > worstAbs) { worstAbs = abs;  worstMonth = v.month }
    }

    const total_forecast = forecastArr.reduce((s, v) => s + v, 0)
    const total_actual   = actualArr.reduce((s, v) => s + v, 0)
    const total_error    = total_forecast - total_actual

    return {
      last_12_months: {
        mape_pct,
        bias,
        accuracy_class,
        bias_class,
        hit_rate_pct,
        improvement_trend,
      },
      monthly_variances: monthlyVariances,
      summary: {
        best_month:      bestMonth,
        worst_month:     worstMonth,
        total_forecast,
        total_actual,
        total_error,
      },
    }
  }
}
