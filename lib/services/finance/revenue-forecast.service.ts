// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/revenue-forecast.service.ts
//
// Revenue Forecast — 3-month forward forecast using three blended methods:
//   1. Trend Extrapolation  — linear regression on last 6 months
//   2. Seasonal Adjustment  — seasonal indices from SeasonalityService
//   3. Pipeline-based       — proformas in 'sent'/'approved' status × win rate
//
// Blending weights:
//   High R² (≥0.7) + strong/moderate seasonal  → trend 40% + seasonal 40% + pipeline 20%
//   High R² (≥0.7) + weak/insufficient seasonal → trend 60% + pipeline 40%
//   Low R² (<0.7)                               → pipeline 50% + trend 30% + seasonal 20%
//   No pipeline: redistribute weight to trend + seasonal equally
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 }              from '@/lib/calc'
import { SeasonalityService }  from '@/lib/services/finance/seasonality.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export type ForecastMethod = 'trend' | 'seasonal' | 'pipeline' | 'blended'

export interface ForecastMonthResult {
  month:   string   // 'YYYY-MM'
  label:   string   // 'Haz 2026'
  // Per method
  trend_forecast:    number | null
  seasonal_forecast: number | null
  pipeline_forecast: number | null
  // Blended
  blended_forecast:  number
  confidence_low:    number   // blended × 0.80
  confidence_high:   number   // blended × 1.20
  // Actuals (null for future months)
  actual?: number
}

export interface RevenueForecastReport {
  company_id:   string
  base_period:  string    // last month with full data, e.g. '2026-05'
  forecast_months: ForecastMonthResult[]   // next 3 months
  // Model quality
  trend_slope:        number   // monthly revenue change in TRY from regression
  trend_r_squared:    number   // 0-1 fit quality
  seasonal_strength:  'strong' | 'moderate' | 'weak' | 'insufficient'
  active_pipeline_try: number  // current proforma pipeline value
  win_rate_pct:        number  // historical win rate used
  // Summary
  total_3m_forecast: number
  vs_last_3m_pct:    number    // % change vs actual last 3 months
  summary_line:      string   // Turkish narrative
  computed_at:       string
}

// ── Short Turkish month labels ─────────────────────────────────────────────────

const SHORT_TR_MONTHS: string[] = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

const FULL_TR_MONTHS: string[] = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

export function monthLabel(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  return `${FULL_TR_MONTHS[m - 1]} ${y}`
}

// ── Pure computation helpers ───────────────────────────────────────────────────

/**
 * Compute a linear forecast by fitting y = a + b×x over historical values
 * and extrapolating `monthsAhead` steps beyond the last observed point.
 *
 * Returns null when fewer than 2 data points are provided.
 */
export function computeLinearForecast(
  historicalValues: number[],
  monthsAhead: number,
): number | null {
  const n = historicalValues.length
  if (n < 2) return null

  const xMean = (n - 1) / 2
  const yMean = historicalValues.reduce((s, v) => s + v, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    numerator   += dx * (historicalValues[i] - yMean)
    denominator += dx * dx
  }

  const b = denominator === 0 ? 0 : numerator / denominator
  const a = yMean - b * xMean

  // x for next point = n - 1 + monthsAhead (continuing the sequence)
  const xNext = (n - 1) + monthsAhead
  return round2(a + b * xNext)
}

/**
 * Compute R-squared (coefficient of determination).
 *
 * r_squared = 1 - SS_res / SS_tot
 *   SS_res = Σ(actual - predicted)²
 *   SS_tot = Σ(actual - mean)²
 *
 * Returns 1.0 when SS_tot = 0 (constant series — perfect fit by convention).
 * Input arrays must be same length; returns 0 for empty input.
 */
export function computeRSquared(actuals: number[], predicted: number[]): number {
  const n = actuals.length
  if (n === 0 || n !== predicted.length) return 0

  const mean = actuals.reduce((s, v) => s + v, 0) / n

  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    ssTot += (actuals[i] - mean) ** 2
    ssRes += (actuals[i] - predicted[i]) ** 2
  }

  if (ssTot === 0) return 1.0  // constant series — perfect fit
  return round2(Math.max(0, 1 - ssRes / ssTot))
}

/**
 * Blend trend, seasonal, and pipeline forecasts using weighted average.
 *
 * Weight selection:
 *   rSquared >= 0.7 + strong/moderate seasonal → 40% trend + 40% seasonal + 20% pipeline
 *   rSquared >= 0.7 + weak/insufficient        → 60% trend + 40% pipeline
 *   rSquared <  0.7                            → 30% trend + 20% seasonal + 50% pipeline
 *   If pipeline is null/0: redistribute its weight equally to remaining methods.
 */
export function computeBlendedForecast(
  trend:           number | null,
  seasonal:        number | null,
  pipeline:        number | null,
  rSquared:        number,
  seasonalStrength: string,
): number {
  const strongSeasonal = seasonalStrength === 'strong' || seasonalStrength === 'moderate'
  const hasPipeline    = pipeline !== null && pipeline > 0

  // Determine base weights
  let wTrend    = 0
  let wSeasonal = 0
  let wPipeline = 0

  if (rSquared >= 0.7 && strongSeasonal) {
    wTrend    = 0.40
    wSeasonal = 0.40
    wPipeline = 0.20
  } else if (rSquared >= 0.7) {
    wTrend    = 0.60
    wSeasonal = 0
    wPipeline = 0.40
  } else {
    wTrend    = 0.30
    wSeasonal = 0.20
    wPipeline = 0.50
  }

  // If no pipeline, redistribute pipeline weight equally to available methods
  if (!hasPipeline) {
    const hasTrend    = trend !== null
    const hasSeasonAl = seasonal !== null
    const available   = [hasTrend, hasSeasonAl].filter(Boolean).length

    if (available > 0) {
      const redistrib = wPipeline / available
      if (hasTrend)    wTrend    += redistrib
      if (hasSeasonAl) wSeasonal += redistrib
    }
    wPipeline = 0
  }

  // Also handle null seasonal
  if (seasonal === null) {
    const hasTrend    = trend !== null
    const hasPip      = hasPipeline
    const available   = [hasTrend, hasPip].filter(Boolean).length
    if (available > 0) {
      const redistrib = wSeasonal / available
      if (hasTrend) wTrend    += redistrib
      if (hasPip)   wPipeline += redistrib
    }
    wSeasonal = 0
  }

  // If trend is null too, fall back to any available
  if (trend === null) {
    const hasPip      = hasPipeline && wPipeline > 0
    const hasSea      = seasonal !== null && wSeasonal > 0
    const available   = [hasPip, hasSea].filter(Boolean).length
    if (available > 0) {
      const redistrib = wTrend / available
      if (hasPip) wPipeline += redistrib
      if (hasSea) wSeasonal += redistrib
    }
    wTrend = 0
  }

  // Normalize weights to sum to 1.0
  const total = wTrend + wSeasonal + wPipeline
  if (total === 0) return 0

  let blended = 0
  if (trend    !== null) blended += (wTrend    / total) * trend
  if (seasonal !== null) blended += (wSeasonal / total) * seasonal
  if (hasPipeline)       blended += (wPipeline / total) * (pipeline ?? 0)

  return round2(Math.max(0, blended))
}

/**
 * Compute 80%–120% confidence interval around a blended forecast.
 */
export function computeConfidenceInterval(blended: number): { low: number; high: number } {
  return {
    low:  round2(blended * 0.80),
    high: round2(blended * 1.20),
  }
}

/**
 * Build a Turkish summary line for the forecast.
 */
export function buildSummaryLine(
  total3m: number,
  vsLast3mPct: number,
  basePeriod: string,
): string {
  const [y, m] = basePeriod.split('-').map(Number)
  const baseLabel = `${SHORT_TR_MONTHS[m - 1]} ${y}`

  const direction = vsLast3mPct >= 0 ? 'artış' : 'düşüş'
  const sign      = vsLast3mPct >= 0 ? '+' : ''
  const pctStr    = `${sign}${vsLast3mPct.toFixed(1)}%`
  const formatted = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(total3m)

  return `${baseLabel} sonrası 3 aylık toplam gelir tahmini ₺${formatted} — geçen 3 aya göre ${pctStr} ${direction} bekleniyor.`
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Offset a YYYY-MM string by n months forward. */
function addMonths(yyyyMM: string, n: number): string {
  const [y, m] = yyyyMM.split('-').map(Number)
  const date   = new Date(y, m - 1 + n, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// ── Service ────────────────────────────────────────────────────────────────────

export class RevenueForecastService {

  static async getReport(
    companyId: string,
    supabase:  AnyClient,
    now:       Date = new Date(),
  ): Promise<RevenueForecastReport> {
    // base_period = last complete month (before current)
    const basePeriod = (() => {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

    // ── Build 6-month history for trend ──────────────────────────────────────────
    const hist6Keys: string[] = []
    for (let i = 6; i >= 1; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      hist6Keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    // Build 24-month history for last-3-month comparison
    const hist3Keys: string[] = []
    for (let i = 3; i >= 1; i--) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      hist3Keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const windowFrom = hist6Keys[0] + '-01'
    const windowTo   = basePeriod  + '-' + new Date(
      parseInt(basePeriod.split('-')[0], 10),
      parseInt(basePeriod.split('-')[1], 10),
      0,
    ).getDate()

    // ── Parallel fetches ─────────────────────────────────────────────────────────
    const [
      salesRes,
      seasonalityReport,
      proformaRes,
      allProformaRes,
    ] = await Promise.allSettled([
      // Recent sales for trend calculation
      supabase
        .from('sales')
        .select('sale_date, total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      // Seasonality
      SeasonalityService.getReport(companyId, supabase, now),

      // Active pipeline: proformas in sent or approved status
      supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try')
        .eq('company_id', companyId)
        .in('status', ['sent', 'approved']),

      // All decided proformas (converted + rejected + expired) for win rate
      supabase
        .from('proformas')
        .select('id, status')
        .eq('company_id', companyId)
        .in('status', ['converted', 'rejected', 'expired']),
    ])

    // ── Aggregate sales by month ──────────────────────────────────────────────────
    const revenueByMonth: Map<string, number> = new Map()
    for (const ym of hist6Keys) revenueByMonth.set(ym, 0)

    if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
      for (const row of salesRes.value.data) {
        if (!row.sale_date) continue
        const ym = (row.sale_date as string).slice(0, 7)
        if (revenueByMonth.has(ym)) {
          revenueByMonth.set(ym, round2((revenueByMonth.get(ym) ?? 0) + (Number(row.total_try) || 0)))
        }
      }
    }

    const hist6Values = hist6Keys.map(ym => revenueByMonth.get(ym) ?? 0)

    // ── Trend model ───────────────────────────────────────────────────────────────
    // Linear regression on 6 months → predict months 7, 8, 9
    const xMean = (hist6Values.length - 1) / 2
    const yMean = hist6Values.reduce((s, v) => s + v, 0) / hist6Values.length
    let num = 0; let den = 0
    for (let i = 0; i < hist6Values.length; i++) {
      const dx = i - xMean
      num += dx * (hist6Values[i] - yMean)
      den += dx * dx
    }
    const slope = den === 0 ? 0 : num / den
    const intercept = yMean - slope * xMean

    // R-squared on 6 historical points
    const trendFitted = hist6Values.map((_, i) => intercept + slope * i)
    const trend_r_squared = computeRSquared(hist6Values, trendFitted)
    const trend_slope     = round2(slope)

    // ── Seasonal model ────────────────────────────────────────────────────────────
    const seasonalReport = seasonalityReport.status === 'fulfilled'
      ? seasonalityReport.value
      : null

    // Map seasonality_strength to our type
    const rawStrength = seasonalReport?.seasonality_strength ?? 'insufficient_data'
    const seasonal_strength: RevenueForecastReport['seasonal_strength'] =
      rawStrength === 'insufficient_data' ? 'insufficient' : rawStrength

    // Build seasonal forecast per month using average + seasonal index adjustment
    const overallMonthlyAvg = seasonalReport?.overall_monthly_avg_try ?? 0

    // ── Pipeline model ────────────────────────────────────────────────────────────
    let active_pipeline_try = 0
    if (proformaRes.status === 'fulfilled' && proformaRes.value?.data) {
      for (const p of proformaRes.value.data as Array<{
        total: number | null; currency: string | null; fx_try: number | null
      }>) {
        const tryVal = (p.currency ?? 'TRY') === 'TRY'
          ? Number(p.total ?? 0)
          : Number(p.total ?? 0) * (Number(p.fx_try) || 1)
        active_pipeline_try = round2(active_pipeline_try + tryVal)
      }
    }

    // Win rate from historical decided proformas
    let convertedCount = 0
    let decidedCount   = 0
    if (allProformaRes.status === 'fulfilled' && allProformaRes.value?.data) {
      for (const p of allProformaRes.value.data as Array<{ status: string | null }>) {
        const s = p.status ?? ''
        decidedCount++
        if (s === 'converted') convertedCount++
      }
    }
    const win_rate_pct = decidedCount > 0
      ? round2((convertedCount / decidedCount) * 100)
      : 33  // fallback: 33% if no history

    // Pipeline forecast per month: evenly distribute expected wins over 3 months
    const pipelineExpected = active_pipeline_try * (win_rate_pct / 100)
    const pipelinePerMonth = round2(pipelineExpected / 3)

    // ── Last 3 months actual for comparison ───────────────────────────────────────
    const last3mActual = hist3Keys.reduce((s, ym) => s + (revenueByMonth.get(ym) ?? 0), 0)

    // ── Build 3 forecast months ───────────────────────────────────────────────────
    const forecast_months: ForecastMonthResult[] = []

    for (let i = 1; i <= 3; i++) {
      const ym    = addMonths(basePeriod, i)
      const label = monthLabel(ym)
      const [, mm] = ym.split('-').map(Number)

      // Trend forecast: extrapolate from n=6 data points
      const trend_forecast = computeLinearForecast(hist6Values, i)

      // Seasonal forecast: use seasonal index for this calendar month × recent avg
      let seasonal_forecast: number | null = null
      if (seasonalReport && overallMonthlyAvg > 0) {
        const monthData = seasonalReport.monthly_data.find(d => d.month_number === mm)
        if (monthData && monthData.data_points > 0) {
          seasonal_forecast = round2(overallMonthlyAvg * (monthData.seasonal_index / 100))
        }
      }

      // Pipeline forecast
      const pipeline_forecast = active_pipeline_try > 0 ? pipelinePerMonth : null

      const blended_forecast = computeBlendedForecast(
        trend_forecast,
        seasonal_forecast,
        pipeline_forecast,
        trend_r_squared,
        seasonal_strength,
      )

      const ci = computeConfidenceInterval(blended_forecast)

      forecast_months.push({
        month:   ym,
        label,
        trend_forecast,
        seasonal_forecast,
        pipeline_forecast,
        blended_forecast,
        confidence_low:  ci.low,
        confidence_high: ci.high,
      })
    }

    const total_3m_forecast = round2(forecast_months.reduce((s, m) => s + m.blended_forecast, 0))
    const vs_last_3m_pct    = last3mActual > 0
      ? round2(((total_3m_forecast - last3mActual) / last3mActual) * 100)
      : 0

    const summary_line = buildSummaryLine(total_3m_forecast, vs_last_3m_pct, basePeriod)

    return {
      company_id:   companyId,
      base_period:  basePeriod,
      forecast_months,
      trend_slope,
      trend_r_squared,
      seasonal_strength,
      active_pipeline_try,
      win_rate_pct,
      total_3m_forecast,
      vs_last_3m_pct,
      summary_line,
      computed_at: new Date().toISOString(),
    }
  }
}
