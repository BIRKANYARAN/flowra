// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/period-comparison.service.ts
//
// Period Performance Comparison — MoM, YoY, and YTD financial comparison.
//
// Pure functions exported for testing:
//   computeChangePct         — safe % change (0 if prior = 0)
//   computeChangeAbsolute    — current - prior
//   classifySignificance     — material / moderate / minor
//   isFavorableMetricChange  — higher revenue/profit = good; higher expense ratio = bad
//   buildMetricComparison    — construct full MetricComparison
//   buildPeriodMetrics       — construct PeriodMetrics from raw values
//   determineOverallTrend    — improving / stable / declining
//   generateComparisonHeadline — Turkish headline string
//   identifyKeyDriver        — Turkish key driver sentence
//   buildPeriodComparison    — full PeriodComparison
//   computeTrendStreak       — consecutive improving / declining months
//   computeCmgr              — compound monthly growth rate
//   findBestMonth            — highest revenue month
//   findWorstMonth           — lowest revenue month
//
// Class: PeriodComparisonService
//   getReport(companyId) → PeriodComparisonReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface PeriodMetrics {
  period: string                    // YYYY-MM or "YTD-YYYY"
  revenue_try: number
  expenses_try: number
  gross_profit_try: number          // revenue - cogs (cogs estimated at 40% revenue if not available)
  ebitda_try: number                // revenue - opex (excl. COGS)
  net_income_try: number            // revenue - expenses
  gross_margin_pct: number
  net_margin_pct: number
  expense_ratio_pct: number
  avg_monthly_revenue: number       // for YTD: revenue / months; for single month: same as revenue
  order_count: number
  avg_order_value: number
}

export interface MetricComparison {
  metric_name: string
  label: string                     // Turkish label
  current_value: number
  prior_value: number
  change_absolute: number           // current - prior
  change_pct: number                // (current - prior) / prior × 100 (0 if prior = 0)
  is_favorable: boolean
  significance: 'material' | 'moderate' | 'minor'
}

export interface PeriodComparison {
  comparison_type: 'mom' | 'yoy' | 'ytd'
  current_period: PeriodMetrics
  prior_period: PeriodMetrics
  comparisons: MetricComparison[]
  overall_trend: 'improving' | 'stable' | 'declining'
  headline: string
  key_driver: string
}

export interface PeriodComparisonReport {
  current_month: string             // YYYY-MM
  mom_comparison: PeriodComparison
  yoy_comparison: PeriodComparison | null
  ytd_comparison: PeriodComparison | null
  monthly_series: PeriodMetrics[]
  trend_streak: number
  cmgr_pct: number | null
  best_month: PeriodMetrics | null
  worst_month: PeriodMetrics | null
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute percentage change from prior to current.
 * Returns 0 if prior = 0 to avoid Infinity/NaN.
 */
export function computeChangePct(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Compute absolute change from prior to current.
 */
export function computeChangeAbsolute(current: number, prior: number): number {
  return current - prior
}

/**
 * Classify the significance of a change percentage.
 * material: |changePct| > 10%
 * moderate: |changePct| > 3%
 * minor:    ≤ 3%
 */
export function classifySignificance(changePct: number): MetricComparison['significance'] {
  const abs = Math.abs(changePct)
  if (abs > 10) return 'material'
  if (abs > 3)  return 'moderate'
  return 'minor'
}

/**
 * Determine if a metric change is favorable.
 * Favorable metrics (higher = better): revenue, gross_profit, ebitda, net_income,
 *   gross_margin_pct, net_margin_pct, avg_order_value, order_count, avg_monthly_revenue
 * Unfavorable metrics (lower = better): expenses, expense_ratio
 */
export function isFavorableMetricChange(
  metricName: string,
  changePct: number,
): boolean {
  const unfavorable = new Set(['expenses_try', 'expense_ratio_pct', 'expenses', 'expense_ratio'])
  const isUnfavorable = unfavorable.has(metricName)
  return isUnfavorable ? changePct < 0 : changePct > 0
}

/**
 * Build a MetricComparison for a specific metric.
 */
export function buildMetricComparison(
  metricName: string,
  label: string,
  currentValue: number,
  priorValue: number,
): MetricComparison {
  const change_absolute = computeChangeAbsolute(currentValue, priorValue)
  const change_pct      = computeChangePct(currentValue, priorValue)
  const significance    = classifySignificance(change_pct)
  const is_favorable    = isFavorableMetricChange(metricName, change_pct)

  return {
    metric_name:     metricName,
    label,
    current_value:   currentValue,
    prior_value:     priorValue,
    change_absolute,
    change_pct,
    is_favorable,
    significance,
  }
}

/**
 * Build PeriodMetrics from raw data.
 * If cogsEstimate is not provided, it is estimated at 40% of revenue.
 * monthsInPeriod defaults to 1 (single month).
 */
export function buildPeriodMetrics(
  period: string,
  revenue: number,
  expenses: number,
  orderCount: number,
  cogsEstimate?: number,
  monthsInPeriod?: number,
): PeriodMetrics {
  const months   = monthsInPeriod ?? 1
  const cogs     = cogsEstimate ?? revenue * 0.4
  const opex     = expenses - cogs                    // opex = expenses excl. COGS
  const gross_profit = revenue - cogs
  const ebitda       = revenue - opex                 // revenue - (expenses - cogs) = revenue - expenses + cogs
  const net_income   = revenue - expenses

  const gross_margin_pct  = revenue > 0 ? (gross_profit / revenue) * 100 : 0
  const net_margin_pct    = revenue > 0 ? (net_income   / revenue) * 100 : 0
  const expense_ratio_pct = revenue > 0 ? (expenses     / revenue) * 100 : 0

  const avg_monthly_revenue = months > 0 ? revenue / months : revenue
  const avg_order_value     = orderCount > 0 ? revenue / orderCount : 0

  return {
    period,
    revenue_try:          revenue,
    expenses_try:         expenses,
    gross_profit_try:     gross_profit,
    ebitda_try:           ebitda,
    net_income_try:       net_income,
    gross_margin_pct,
    net_margin_pct,
    expense_ratio_pct,
    avg_monthly_revenue,
    order_count:          orderCount,
    avg_order_value,
  }
}

/**
 * Determine overall trend by comparing current vs prior metrics.
 * improving: revenue up AND net_margin improved
 * declining: revenue down OR net_margin degraded > 5pp
 * stable: otherwise
 */
export function determineOverallTrend(
  currentMetrics: PeriodMetrics,
  priorMetrics: PeriodMetrics,
): PeriodComparison['overall_trend'] {
  const revenueUp      = currentMetrics.revenue_try > priorMetrics.revenue_try
  const revenueDown    = currentMetrics.revenue_try < priorMetrics.revenue_try
  const marginChange   = currentMetrics.net_margin_pct - priorMetrics.net_margin_pct
  const marginImproved = marginChange > 0
  const marginDegraded = marginChange < -5

  if (revenueUp && marginImproved) return 'improving'
  if (revenueDown || marginDegraded) return 'declining'
  return 'stable'
}

/**
 * Generate a Turkish comparison headline summarising the key movements.
 */
export function generateComparisonHeadline(
  comparisonType: 'mom' | 'yoy' | 'ytd',
  currentMetrics: PeriodMetrics,
  priorMetrics: PeriodMetrics,
): string {
  const revChangePct    = computeChangePct(currentMetrics.revenue_try, priorMetrics.revenue_try)
  const marginCurrent   = currentMetrics.net_margin_pct
  const marginPrior     = priorMetrics.net_margin_pct

  const periodLabel: Record<string, string> = {
    mom: 'geçen aya göre',
    yoy: 'geçen yılın aynı dönemine göre',
    ytd: 'geçen yılın aynı dönemine göre (YTD)',
  }
  const label = periodLabel[comparisonType]

  const revDirection = revChangePct > 0 ? 'büyüme' : revChangePct < 0 ? 'düşüş' : 'değişim yok'
  const absPct       = Math.abs(revChangePct).toFixed(1)

  if (priorMetrics.revenue_try === 0) {
    return `${label.charAt(0).toUpperCase() + label.slice(1)} karşılaştırma için önceki dönem verisi mevcut değil.`
  }

  const marginPart = marginPrior !== 0
    ? `, marj %${marginPrior.toFixed(0)}'den %${marginCurrent.toFixed(0)}'e ${marginCurrent >= marginPrior ? 'çıktı' : 'geriledi'}`
    : ''

  return `${label.charAt(0).toUpperCase() + label.slice(1)} %${absPct} ${revDirection}${marginPart}.`
}

/**
 * Identify the Turkish key driver sentence from a list of comparisons.
 * Finds the most material (highest |change_pct|) comparison.
 */
export function identifyKeyDriver(comparisons: MetricComparison[]): string {
  if (comparisons.length === 0) return 'Karşılaştırma verisi mevcut değil.'

  const sorted = [...comparisons].sort(
    (a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct),
  )
  const top = sorted[0]

  const direction = top.change_pct > 0 ? 'artışı' : 'düşüşü'
  const absPct    = Math.abs(top.change_pct).toFixed(1)
  const favorable = top.is_favorable ? 'olumlu' : 'olumsuz'

  return `Ana etken: ${top.label} %${absPct} ${direction} (${favorable} etki).`
}

/**
 * Build a full PeriodComparison from two PeriodMetrics.
 */
export function buildPeriodComparison(
  comparisonType: 'mom' | 'yoy' | 'ytd',
  current: PeriodMetrics,
  prior: PeriodMetrics,
): PeriodComparison {
  const metricDefs: Array<{ name: string; label: string; cur: number; prr: number }> = [
    { name: 'revenue_try',       label: 'Ciro',             cur: current.revenue_try,       prr: prior.revenue_try },
    { name: 'expenses_try',      label: 'Giderler',          cur: current.expenses_try,      prr: prior.expenses_try },
    { name: 'gross_profit_try',  label: 'Brüt Kâr',         cur: current.gross_profit_try,  prr: prior.gross_profit_try },
    { name: 'net_income_try',    label: 'Net Gelir',         cur: current.net_income_try,    prr: prior.net_income_try },
    { name: 'gross_margin_pct',  label: 'Brüt Marj (%)',    cur: current.gross_margin_pct,  prr: prior.gross_margin_pct },
    { name: 'expense_ratio_pct', label: 'Gider Oranı (%)',  cur: current.expense_ratio_pct, prr: prior.expense_ratio_pct },
  ]

  const comparisons = metricDefs.map(m =>
    buildMetricComparison(m.name, m.label, m.cur, m.prr),
  )

  const overall_trend = determineOverallTrend(current, prior)
  const headline      = generateComparisonHeadline(comparisonType, current, prior)
  const key_driver    = identifyKeyDriver(comparisons)

  return {
    comparison_type: comparisonType,
    current_period:  current,
    prior_period:    prior,
    comparisons,
    overall_trend,
    headline,
    key_driver,
  }
}

/**
 * Compute trend streak across a monthly series.
 * Returns positive count = consecutive improving months (end of series),
 * negative count = consecutive declining months, 0 = mixed.
 */
export function computeTrendStreak(monthlySeries: PeriodMetrics[]): number {
  if (monthlySeries.length < 2) return 0

  let streak = 0

  // Walk from end to start
  for (let i = monthlySeries.length - 1; i >= 1; i--) {
    const cur  = monthlySeries[i]
    const prev = monthlySeries[i - 1]
    const improving = cur.revenue_try > prev.revenue_try

    if (streak === 0) {
      streak = improving ? 1 : -1
    } else if (streak > 0 && improving) {
      streak++
    } else if (streak < 0 && !improving) {
      streak--
    } else {
      break
    }
  }

  return streak
}

/**
 * Compute compound monthly growth rate (CMGR).
 * CMGR = (last/first)^(1/n) - 1 where n = months - 1.
 * Returns null if first = 0 or n < 1.
 */
export function computeCmgr(
  firstMonthRevenue: number,
  lastMonthRevenue: number,
  months: number,
): number | null {
  const n = months - 1
  if (firstMonthRevenue === 0 || n < 1) return null
  return (Math.pow(lastMonthRevenue / firstMonthRevenue, 1 / n) - 1) * 100
}

/**
 * Find the month with the highest revenue from a series.
 * Returns null if series is empty.
 */
export function findBestMonth(metrics: PeriodMetrics[]): PeriodMetrics | null {
  if (metrics.length === 0) return null
  return metrics.reduce((best, m) => (m.revenue_try > best.revenue_try ? m : best))
}

/**
 * Find the month with the lowest revenue from a series.
 * Returns null if series is empty.
 */
export function findWorstMonth(metrics: PeriodMetrics[]): PeriodMetrics | null {
  if (metrics.length === 0) return null
  return metrics.reduce((worst, m) => (m.revenue_try < worst.revenue_try ? m : worst))
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Format YYYY-MM string from year + month number */
function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Add months to a YYYY-MM string, returns new YYYY-MM string */
function addMonths(periodKey: string, delta: number): string {
  const [y, m] = periodKey.split('-').map(Number)
  const date = new Date(y, m - 1 + delta, 1)
  return formatMonthKey(date.getFullYear(), date.getMonth() + 1)
}

/** Subtract one year from a YYYY-MM string */
function subtractYear(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  return formatMonthKey(y - 1, m)
}

/** Get date range for a YYYY-MM period key */
function monthDateRange(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${periodKey}-01`,
    to:   `${periodKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Fetch revenue, expenses, and order count for a date range */
async function fetchPeriodData(
  companyId: string,
  supabase: AnyClient,
  from: string,
  to: string,
): Promise<{ revenue: number; expenses: number; orderCount: number }> {
  const [salesRes, expensesRes] = await Promise.allSettled([
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),

    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),
  ])

  let revenue    = 0
  let expenses   = 0
  let orderCount = 0

  if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
    for (const row of salesRes.value.data) {
      revenue += Number(row.total_try) || 0
      orderCount++
    }
  }

  if (expensesRes.status === 'fulfilled' && expensesRes.value?.data) {
    for (const row of expensesRes.value.data) {
      expenses += Number(row.amount_try) || 0
    }
  }

  return { revenue, expenses, orderCount }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class PeriodComparisonService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<PeriodComparisonReport> {
    const now          = new Date()
    const currentMonth = formatMonthKey(now.getFullYear(), now.getMonth() + 1)

    // Build list of 13 months: last 12 + same month last year (for YoY)
    const last12Months: string[] = []
    for (let i = 11; i >= 0; i--) {
      last12Months.push(addMonths(currentMonth, -i))
    }
    const sameMonthPriorYear = subtractYear(currentMonth)

    // Fetch all needed periods in parallel
    const allPeriods = Array.from(new Set([...last12Months, sameMonthPriorYear]))

    const periodDataMap = new Map<string, { revenue: number; expenses: number; orderCount: number }>()

    await Promise.all(
      allPeriods.map(async (pk) => {
        const range = monthDateRange(pk)
        const data  = await fetchPeriodData(companyId, this.supabase, range.from, range.to)
        periodDataMap.set(pk, data)
      }),
    )

    // Build monthly series (last 12 months)
    const monthly_series: PeriodMetrics[] = last12Months.map((pk) => {
      const d = periodDataMap.get(pk) ?? { revenue: 0, expenses: 0, orderCount: 0 }
      return buildPeriodMetrics(pk, d.revenue, d.expenses, d.orderCount)
    })

    // Current and prior month
    const currentMonthData = periodDataMap.get(currentMonth) ?? { revenue: 0, expenses: 0, orderCount: 0 }
    const priorMonthKey    = addMonths(currentMonth, -1)
    const priorMonthData   = periodDataMap.get(priorMonthKey) ?? { revenue: 0, expenses: 0, orderCount: 0 }

    const currentMetrics = buildPeriodMetrics(currentMonth, currentMonthData.revenue, currentMonthData.expenses, currentMonthData.orderCount)
    const priorMoMMetrics = buildPeriodMetrics(priorMonthKey, priorMonthData.revenue, priorMonthData.expenses, priorMonthData.orderCount)

    // MoM comparison
    const mom_comparison = buildPeriodComparison('mom', currentMetrics, priorMoMMetrics)

    // YoY comparison (same month last year)
    let yoy_comparison: PeriodComparison | null = null
    const priorYearData = periodDataMap.get(sameMonthPriorYear) ?? { revenue: 0, expenses: 0, orderCount: 0 }
    const priorYearMetrics = buildPeriodMetrics(sameMonthPriorYear, priorYearData.revenue, priorYearData.expenses, priorYearData.orderCount)
    // Only include if there's any data from prior year
    if (priorYearData.revenue > 0 || priorYearData.expenses > 0) {
      yoy_comparison = buildPeriodComparison('yoy', currentMetrics, priorYearMetrics)
    }

    // YTD comparison
    let ytd_comparison: PeriodComparison | null = null
    const currentYearMonth = now.getMonth() + 1 // 1-based month

    if (currentYearMonth > 1) {
      // Current YTD: Jan through current month
      const currentYear     = now.getFullYear()
      const priorYear       = currentYear - 1
      let currentYtdRevenue = 0
      let currentYtdExpenses = 0
      let currentYtdOrders  = 0
      let priorYtdRevenue   = 0
      let priorYtdExpenses  = 0
      let priorYtdOrders    = 0

      for (let m = 1; m <= currentYearMonth; m++) {
        const curKey  = formatMonthKey(currentYear, m)
        const priorKey = formatMonthKey(priorYear, m)

        const curData   = periodDataMap.get(curKey) ?? { revenue: 0, expenses: 0, orderCount: 0 }
        // We may not have fetched prior year months other than same month; fetch inline if missing
        let priorData   = periodDataMap.get(priorKey)
        if (!priorData) {
          const range = monthDateRange(priorKey)
          priorData   = await fetchPeriodData(companyId, this.supabase, range.from, range.to)
          periodDataMap.set(priorKey, priorData)
        }

        currentYtdRevenue  += curData.revenue
        currentYtdExpenses += curData.expenses
        currentYtdOrders   += curData.orderCount
        priorYtdRevenue    += priorData.revenue
        priorYtdExpenses   += priorData.expenses
        priorYtdOrders     += priorData.orderCount
      }

      const currentYtdKey = `YTD-${currentYear}`
      const priorYtdKey   = `YTD-${priorYear}`

      const currentYtdMetrics = buildPeriodMetrics(
        currentYtdKey,
        currentYtdRevenue,
        currentYtdExpenses,
        currentYtdOrders,
        undefined,
        currentYearMonth,
      )
      const priorYtdMetrics = buildPeriodMetrics(
        priorYtdKey,
        priorYtdRevenue,
        priorYtdExpenses,
        priorYtdOrders,
        undefined,
        currentYearMonth,
      )

      ytd_comparison = buildPeriodComparison('ytd', currentYtdMetrics, priorYtdMetrics)
    }

    // Trend streak and CMGR
    const trend_streak = computeTrendStreak(monthly_series)
    const cmgr_raw     = computeCmgr(
      monthly_series[0]?.revenue_try ?? 0,
      monthly_series[monthly_series.length - 1]?.revenue_try ?? 0,
      monthly_series.length,
    )
    const cmgr_pct   = cmgr_raw
    const best_month  = findBestMonth(monthly_series)
    const worst_month = findWorstMonth(monthly_series)

    return {
      current_month: currentMonth,
      mom_comparison,
      yoy_comparison,
      ytd_comparison,
      monthly_series,
      trend_streak,
      cmgr_pct,
      best_month,
      worst_month,
    }
  }
}
