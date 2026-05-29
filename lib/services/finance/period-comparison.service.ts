// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/period-comparison.service.ts
//
// Period-over-Period Financial Comparison — MoM, YoY, rolling-window analysis,
// CMGR, seasonality indexing, run rate, and Turkish narrative generation.
//
// Pure helpers are exported for unit testing (no DB required).
// PeriodComparisonService class handles DB-connected report generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Legacy interfaces (kept for backward compatibility) ───────────────────────

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

// ── New report interface (Batch-36) ───────────────────────────────────────────

export interface PeriodComparisonReport {
  // Legacy fields retained for backward compatibility with OverviewTab.tsx
  mom_comparison?: PeriodComparison | null
  yoy_comparison?: PeriodComparison | null
  ytd_comparison?: PeriodComparison | null
  monthly_series_legacy?: PeriodMetrics[]
  trend_streak?: number
  cmgr_pct?: number | null
  best_month?: PeriodMetrics | null
  worst_month?: PeriodMetrics | null

  current_period: {
    label: string       // e.g. "Mayıs 2025"
    revenue_try: number
    expenses_try: number
    gross_profit_try: number
    net_profit_try: number
    gross_margin_pct: number | null
    net_margin_pct: number | null
  }
  prior_period: {
    label: string
    revenue_try: number
    expenses_try: number
    gross_profit_try: number
    net_profit_try: number
    gross_margin_pct: number | null
    net_margin_pct: number | null
  }
  changes: {
    revenue_change_pct: number | null
    expense_change_pct: number | null
    profit_change_pct: number | null
    gross_margin_change_ppt: number | null  // percentage points
    growth_direction: ReturnType<typeof classifyGrowthDirection>
    trend_momentum: ReturnType<typeof classifyTrendMomentum>
  }
  rolling_3m: {
    avg_revenue: number | null
    total_revenue: number | null
  }
  run_rate: number | null
  cmgr_3m: number | null
  monthly_series: Array<{
    period: string     // YYYY-MM
    revenue_try: number
    expenses_try: number
    net_profit_try: number
    mom_revenue_change_pct: number | null
  }>
  narrative: string
}

// ── Pure functions (spec-required) ───────────────────────────────────────────

/**
 * Compute absolute change between two periods.
 * Returns current - prior (can be negative).
 */
export function computeAbsoluteChange(current: number, prior: number): number {
  return current - prior
}

/**
 * Compute percentage change between two periods.
 * Returns null if prior = 0.
 * Formula: (current - prior) / |prior| × 100
 */
export function computePercentageChange(
  current: number,
  prior: number,
): number | null {
  if (prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Classify growth direction based on percentage change.
 * strong_growth:       > 20%
 * growth:              > 5%
 * flat:                >= -5%
 * decline:             >= -20%
 * strong_decline:      < -20%
 * insufficient_data:   null input
 */
export function classifyGrowthDirection(
  changePct: number | null,
): 'strong_growth' | 'growth' | 'flat' | 'decline' | 'strong_decline' | 'insufficient_data' {
  if (changePct === null) return 'insufficient_data'
  if (changePct > 20) return 'strong_growth'
  if (changePct > 5) return 'growth'
  if (changePct >= -5) return 'flat'
  if (changePct >= -20) return 'decline'
  return 'strong_decline'
}

/**
 * Compute compound monthly growth rate (CMGR) over N months.
 * Returns null if firstValue <= 0 or months <= 0.
 * Formula: (lastValue / firstValue)^(1/months) - 1  (as fraction)
 */
export function computeCmgr(
  firstValue: number,
  lastValue: number,
  months: number,
): number | null {
  if (firstValue <= 0 || months <= 1) return null
  return Math.pow(lastValue / firstValue, 1 / months) - 1
}

/**
 * Compute Year-over-Year (YoY) percentage change.
 * Returns null if priorYearValue = 0.
 */
export function computeYoyChange(
  currentYearValue: number,
  priorYearValue: number,
): number | null {
  return computePercentageChange(currentYearValue, priorYearValue)
}

/**
 * Compute Month-over-Month (MoM) percentage change.
 * Returns null if priorMonthValue = 0.
 */
export function computeMomChange(
  currentMonthValue: number,
  priorMonthValue: number,
): number | null {
  return computePercentageChange(currentMonthValue, priorMonthValue)
}

/**
 * Compute rolling 3-month average.
 * Returns null if values.length < 3.
 * Uses the last 3 values in the array.
 */
export function computeRolling3mAvg(values: number[]): number | null {
  if (values.length < 3) return null
  const last3 = values.slice(-3)
  return (last3[0] + last3[1] + last3[2]) / 3
}

/**
 * Compute rolling 3-month total.
 * Returns null if values.length < 3.
 * Uses the last 3 values in the array.
 */
export function computeRolling3mTotal(values: number[]): number | null {
  if (values.length < 3) return null
  const last3 = values.slice(-3)
  return last3[0] + last3[1] + last3[2]
}

/**
 * Compute trend acceleration: current growth minus prior growth.
 * Returns null if either input is null.
 * Positive = accelerating, negative = decelerating.
 */
export function computeTrendAcceleration(
  currentGrowthPct: number | null,
  priorGrowthPct: number | null,
): number | null {
  if (currentGrowthPct === null || priorGrowthPct === null) return null
  return currentGrowthPct - priorGrowthPct
}

/**
 * Classify trend momentum based on acceleration.
 * accelerating:      > 5% acceleration
 * steady:            >= -5%
 * decelerating:      >= -15%
 * reversing:         < -15% (was growing, now declining)
 * insufficient_data: null
 */
export function classifyTrendMomentum(
  acceleration: number | null,
): 'accelerating' | 'steady' | 'decelerating' | 'reversing' | 'insufficient_data' {
  if (acceleration === null) return 'insufficient_data'
  if (acceleration > 5) return 'accelerating'
  if (acceleration >= -5) return 'steady'
  if (acceleration >= -15) return 'decelerating'
  return 'reversing'
}

/**
 * Compute seasonality index for each month.
 * monthlyValues: Record<'MM', number[]> — key is zero-padded month (01-12),
 *   values are all historical observations for that month.
 * Returns a Record<'MM', number> where each entry = avg_for_month / overall_avg.
 * Months with no data get index 1.0.
 * Returns empty object if no data at all.
 */
export function computeSeasonalityIndex(
  monthlyValues: Record<string, number[]>,
): Record<string, number> {
  const result: Record<string, number> = {}

  // Collect all values to compute overall average
  const allValues: number[] = []
  for (const vals of Object.values(monthlyValues)) {
    for (const v of vals) {
      allValues.push(v)
    }
  }

  if (allValues.length === 0) return result

  const overallAvg = allValues.reduce((s, v) => s + v, 0) / allValues.length

  if (overallAvg === 0) {
    // All zeros: every index is 1.0
    for (const key of Object.keys(monthlyValues)) {
      result[key] = 1.0
    }
    return result
  }

  for (const [month, vals] of Object.entries(monthlyValues)) {
    if (vals.length === 0) {
      result[month] = 1.0
    } else {
      const monthAvg = vals.reduce((s, v) => s + v, 0) / vals.length
      result[month] = monthAvg / overallAvg
    }
  }

  return result
}

/**
 * Compute revenue run rate (annualized).
 * Returns null if periodMonths <= 0.
 * Formula: periodRevenue / periodMonths × 12
 */
export function computeRunRate(
  periodRevenue: number,
  periodMonths: number,
): number | null {
  if (periodMonths <= 0) return null
  return (periodRevenue / periodMonths) * 12
}

/**
 * Classify run rate vs annual target.
 * no_target:           annualTarget <= 0 or runRate null
 * exceeding:           runRate >= annualTarget × 1.05
 * on_track:            runRate >= annualTarget × 0.90
 * below:               runRate >= annualTarget × 0.70
 * significantly_below: runRate < annualTarget × 0.70
 */
export function classifyRunRateVsTarget(
  runRate: number | null,
  annualTarget: number,
): 'exceeding' | 'on_track' | 'below' | 'significantly_below' | 'no_target' {
  if (annualTarget <= 0 || runRate === null) return 'no_target'
  if (runRate >= annualTarget * 1.05) return 'exceeding'
  if (runRate >= annualTarget * 0.90) return 'on_track'
  if (runRate >= annualTarget * 0.70) return 'below'
  return 'significantly_below'
}

/**
 * Compute gross margin trend across periods.
 * gross_margin_pct = (revenue - cogs) / revenue × 100; null if revenue = 0
 * mom_change_ppt   = current_gross_margin_pct - prior_gross_margin_pct (in pp); null for first
 */
export function computeGrossMarginTrend(
  periods: Array<{ revenue: number; cogs: number }>,
): Array<{ gross_margin_pct: number | null; mom_change_ppt: number | null }> {
  if (periods.length === 0) return []

  const margins: Array<number | null> = periods.map(p => {
    if (p.revenue === 0) return null
    return ((p.revenue - p.cogs) / p.revenue) * 100
  })

  return margins.map((gm, i) => ({
    gross_margin_pct: gm,
    mom_change_ppt:
      i === 0
        ? null
        : gm === null || margins[i - 1] === null
          ? null
          : gm - (margins[i - 1] as number),
  }))
}

/**
 * Generate Turkish narrative for period comparison.
 * E.g. "Gelir geçen aya göre %X artış/azalış gösterdi. Net kâr ₺Y."
 */
export function generatePeriodComparisonNarrative(params: {
  revenueChangePct: number | null
  expenseChangePct: number | null
  profitChangePct: number | null
  growthDirection: ReturnType<typeof classifyGrowthDirection>
  currentRevenue: number
  currentProfit: number
}): string {
  const {
    revenueChangePct,
    expenseChangePct,
    profitChangePct,
    currentRevenue,
    currentProfit,
  } = params

  const parts: string[] = []

  // Revenue narrative
  if (revenueChangePct !== null) {
    const absPct = Math.abs(revenueChangePct).toFixed(1)
    const direction = revenueChangePct >= 0 ? 'artış' : 'azalış'
    parts.push(`Gelir geçen aya göre %${absPct} ${direction} gösterdi.`)
  } else {
    parts.push(
      `Gelir: ₺${currentRevenue.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}.`,
    )
  }

  // Expense narrative
  if (expenseChangePct !== null) {
    const absPct = Math.abs(expenseChangePct).toFixed(1)
    const direction = expenseChangePct >= 0 ? 'arttı' : 'azaldı'
    parts.push(`Giderler %${absPct} ${direction}.`)
  }

  // Profit narrative
  if (profitChangePct !== null) {
    const absPct = Math.abs(profitChangePct).toFixed(1)
    const direction = profitChangePct >= 0 ? 'artış' : 'azalış'
    parts.push(`Kâr %${absPct} ${direction} ile`)
  }

  parts.push(
    `Net kâr ₺${currentProfit.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}.`,
  )

  return parts.join(' ').trim()
}

// ── Legacy pure functions (kept for backward compatibility) ───────────────────

/**
 * Compute percentage change from prior to current.
 * Returns 0 if prior = 0 to avoid Infinity/NaN.
 * @deprecated Use computePercentageChange (returns null for 0 prior).
 */
export function computeChangePct(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Compute absolute change from prior to current.
 * @deprecated Use computeAbsoluteChange.
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
  const opex     = expenses - cogs
  const gross_profit = revenue - cogs
  const ebitda       = revenue - opex
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
 * Generate a Turkish comparison headline.
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
    { name: 'revenue_try',       label: 'Ciro',            cur: current.revenue_try,       prr: prior.revenue_try },
    { name: 'expenses_try',      label: 'Giderler',         cur: current.expenses_try,      prr: prior.expenses_try },
    { name: 'gross_profit_try',  label: 'Brüt Kâr',        cur: current.gross_profit_try,  prr: prior.gross_profit_try },
    { name: 'net_income_try',    label: 'Net Gelir',        cur: current.net_income_try,    prr: prior.net_income_try },
    { name: 'gross_margin_pct',  label: 'Brüt Marj (%)',   cur: current.gross_margin_pct,  prr: prior.gross_margin_pct },
    { name: 'expense_ratio_pct', label: 'Gider Oranı (%)', cur: current.expense_ratio_pct, prr: prior.expense_ratio_pct },
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

/** Format a YYYY-MM string as Turkish month label, e.g. "Mayıs 2025" */
function formatTurkishMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

/** Compute gross margin % — simplified (no COGS available → 100%) */
function simpleGrossMarginPct(revenue: number): number | null {
  if (revenue === 0) return null
  return 100
}

/** Compute net margin % */
function simpleNetMarginPct(revenue: number, netProfit: number): number | null {
  if (revenue === 0) return null
  return (netProfit / revenue) * 100
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

  /**
   * Get the period comparison report.
   * @param companyId  Company UUID
   * @param months     Number of months to include in the rolling window (default 6, max 24)
   */
  async getReport(
    companyId: string,
    months = 6,
  ): Promise<PeriodComparisonReport> {
    const safeMonths = Math.max(1, Math.min(24, months))
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentPeriodKey = formatMonthKey(currentYear, currentMonth)

    // Build ordered list of YYYY-MM keys for the window
    const periodKeys: string[] = []
    for (let i = safeMonths - 1; i >= 0; i--) {
      periodKeys.push(addMonths(currentPeriodKey, -i))
    }

    // We also need one month before the window for the first MoM change
    const preMoMKey = addMonths(periodKeys[0], -1)
    const allKeys = [preMoMKey, ...periodKeys]

    // Fetch all needed sales + expenses in one date range query
    const windowStart = `${allKeys[0]}-01`
    const { to: windowEnd } = monthDateRange(allKeys[allKeys.length - 1])

    const [salesResult, expensesResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('total_try, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowStart)
        .lte('sale_date', windowEnd),

      this.supabase
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowStart)
        .lte('expense_date', windowEnd),
    ])

    // Aggregate by YYYY-MM
    const revenueByMonth: Record<string, number> = {}
    const expensesByMonth: Record<string, number> = {}

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const period = (row.sale_date as string).substring(0, 7)
        revenueByMonth[period] = (revenueByMonth[period] ?? 0) + (Number(row.total_try) || 0)
      }
    }

    if (expensesResult.status === 'fulfilled' && expensesResult.value?.data) {
      for (const row of expensesResult.value.data) {
        if (!row.expense_date) continue
        const period = (row.expense_date as string).substring(0, 7)
        expensesByMonth[period] = (expensesByMonth[period] ?? 0) + (Number(row.amount_try) || 0)
      }
    }

    // Build monthly_series for the requested window
    const monthly_series: PeriodComparisonReport['monthly_series'] = periodKeys.map(
      (period, idx) => {
        const revenue_try = revenueByMonth[period] ?? 0
        const expenses_try = expensesByMonth[period] ?? 0
        const net_profit_try = revenue_try - expenses_try

        let mom_revenue_change_pct: number | null = null
        const priorKey = idx === 0 ? preMoMKey : periodKeys[idx - 1]
        const priorRevenue = revenueByMonth[priorKey] ?? 0
        mom_revenue_change_pct = computeMomChange(revenue_try, priorRevenue)

        return { period, revenue_try, expenses_try, net_profit_try, mom_revenue_change_pct }
      },
    )

    // Current and prior periods
    const curPeriodKey   = periodKeys[periodKeys.length - 1]
    const priorPeriodKey = periodKeys[periodKeys.length - 2] ?? preMoMKey

    const curRevenue  = revenueByMonth[curPeriodKey] ?? 0
    const curExpenses = expensesByMonth[curPeriodKey] ?? 0
    const curNetProfit = curRevenue - curExpenses

    const priorRevenue  = revenueByMonth[priorPeriodKey] ?? 0
    const priorExpenses = expensesByMonth[priorPeriodKey] ?? 0
    const priorNetProfit = priorRevenue - priorExpenses

    const current_period: PeriodComparisonReport['current_period'] = {
      label:            formatTurkishMonthLabel(curPeriodKey),
      revenue_try:      curRevenue,
      expenses_try:     curExpenses,
      gross_profit_try: curRevenue,   // simplified: no COGS
      net_profit_try:   curNetProfit,
      gross_margin_pct: simpleGrossMarginPct(curRevenue),
      net_margin_pct:   simpleNetMarginPct(curRevenue, curNetProfit),
    }

    const prior_period: PeriodComparisonReport['prior_period'] = {
      label:            formatTurkishMonthLabel(priorPeriodKey),
      revenue_try:      priorRevenue,
      expenses_try:     priorExpenses,
      gross_profit_try: priorRevenue, // simplified: no COGS
      net_profit_try:   priorNetProfit,
      gross_margin_pct: simpleGrossMarginPct(priorRevenue),
      net_margin_pct:   simpleNetMarginPct(priorRevenue, priorNetProfit),
    }

    // Changes
    const revenue_change_pct = computeMomChange(curRevenue, priorRevenue)
    const expense_change_pct = computeMomChange(curExpenses, priorExpenses)
    const profit_change_pct  = computeMomChange(curNetProfit, priorNetProfit)

    const curGmPct   = current_period.gross_margin_pct
    const priorGmPct = prior_period.gross_margin_pct
    const gross_margin_change_ppt =
      curGmPct !== null && priorGmPct !== null ? curGmPct - priorGmPct : null

    const growth_direction = classifyGrowthDirection(revenue_change_pct)

    // Trend momentum: compare last two MoM values in series
    const lastMom  = monthly_series[monthly_series.length - 1]?.mom_revenue_change_pct ?? null
    const priorMom = monthly_series[monthly_series.length - 2]?.mom_revenue_change_pct ?? null
    const acceleration = computeTrendAcceleration(lastMom, priorMom)
    const trend_momentum = classifyTrendMomentum(acceleration)

    // Rolling 3m
    const revenueValues = monthly_series.map(s => s.revenue_try)
    const avg_revenue   = computeRolling3mAvg(revenueValues)
    const total_revenue = computeRolling3mTotal(revenueValues)

    // Run rate (current month × 12)
    const run_rate = computeRunRate(curRevenue, 1)

    // CMGR over last 3 months (need 4 data points)
    let cmgr_3m: number | null = null
    if (monthly_series.length >= 4) {
      const firstRevenue = monthly_series[monthly_series.length - 4].revenue_try
      cmgr_3m = computeCmgr(firstRevenue, curRevenue, 3)
    }

    // Narrative
    const narrative = generatePeriodComparisonNarrative({
      revenueChangePct: revenue_change_pct,
      expenseChangePct: expense_change_pct,
      profitChangePct:  profit_change_pct,
      growthDirection:  growth_direction,
      currentRevenue:   curRevenue,
      currentProfit:    curNetProfit,
    })

    return {
      current_period,
      prior_period,
      changes: {
        revenue_change_pct,
        expense_change_pct,
        profit_change_pct,
        gross_margin_change_ppt,
        growth_direction,
        trend_momentum,
      },
      rolling_3m: { avg_revenue, total_revenue },
      run_rate,
      cmgr_3m,
      monthly_series,
      narrative,
    }
  }
}
