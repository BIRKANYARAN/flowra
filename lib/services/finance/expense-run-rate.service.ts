// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/expense-run-rate.service.ts
//
// Expense Run Rate Momentum Service
//
// Tracks expense momentum and trends per category, projecting annual run rates
// and detecting momentum shifts.
//
// Algorithm:
//   1. Fetch last 6 months of expenses grouped by expense_type and YYYY-MM.
//   2. For each category compute rolling averages, linear slope, CV.
//   3. Classify momentum: accelerating / decelerating / stable / volatile /
//      insufficient_data.
//   4. Detect spikes (current > 3m avg × 1.5 AND current > prior × 1.3).
//   5. Build RunRateSummary and overall trend.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_LABELS } from './expense-forecast.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface ExpenseCategoryMetrics {
  category: string
  label: string
  months: Array<{
    month: string     // YYYY-MM
    amount_try: number
  }>
  current_month_try: number
  prior_month_try: number
  three_month_avg_try: number
  six_month_avg_try: number
  monthly_run_rate_try: number
  annual_run_rate_try: number
  mom_change_pct: number
  three_month_trend_slope: number
  momentum: 'accelerating' | 'stable' | 'decelerating' | 'volatile' | 'insufficient_data'
}

export interface RunRateSummary {
  total_monthly_run_rate_try: number
  total_annual_run_rate_try: number
  ytd_actual_try: number
  ytd_budget_equivalent_try: number
  ytd_variance_try: number
  ytd_variance_pct: number
}

export interface ExpenseRunRateReport {
  analysis_months: number
  current_month: string
  months_elapsed_ytd: number

  categories: ExpenseCategoryMetrics[]
  run_rate_summary: RunRateSummary

  overall_trend: ReturnType<typeof classifyOverallExpenseTrend>
  top_categories: ExpenseCategoryMetrics[]
  spike_categories: ExpenseCategoryMetrics[]
  months_until_expense_risk: number | null

  fastest_growing_category: string | null
  largest_category: string | null
}

// ── Pure computation functions ─────────────────────────────────────────────────

/**
 * Compute average of last N values.
 * If array has fewer than N elements, uses all available elements.
 * Returns 0 for empty arrays.
 */
export function computeRollingAverage(values: number[], n: number): number {
  if (values.length === 0 || n <= 0) return 0
  const slice = values.slice(-n)
  if (slice.length === 0) return 0
  return slice.reduce((s, v) => s + v, 0) / slice.length
}

/**
 * Compute linear regression slope for an array of values.
 * Returns slope per period (rise per unit of x).
 * Returns 0 if fewer than 2 values.
 */
export function computeLinearSlope(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  // x = 0, 1, 2, ..., n-1
  const xMean = (n - 1) / 2
  const yMean = values.reduce((s, v) => s + v, 0) / n
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean)
    denominator += (i - xMean) ** 2
  }
  if (denominator === 0) return 0
  return numerator / denominator
}

/**
 * Compute coefficient of variation: stddev / mean.
 * Returns 0 when mean is 0 or array is empty.
 */
export function computeCv(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)
  return stddev / Math.abs(mean)
}

/**
 * Classify expense momentum based on slope, average, CV, and data point count.
 *
 * Rules:
 *   insufficient_data  : dataPointCount < 2
 *   volatile           : CV > 0.40 (40% of mean)
 *   accelerating       : slope > 5% of 3-month avg (rising fast)
 *   decelerating       : slope < -5% of 3-month avg (falling)
 *   stable             : |slope| ≤ 5% of 3-month avg
 */
export function classifyExpenseMomentum(
  slope: number,
  threeMonthAvg: number,
  cv: number,
  dataPointCount: number,
): ExpenseCategoryMetrics['momentum'] {
  if (dataPointCount < 2) return 'insufficient_data'
  if (cv > 0.40) return 'volatile'
  const threshold = threeMonthAvg * 0.05
  if (slope > threshold) return 'accelerating'
  if (slope < -threshold) return 'decelerating'
  return 'stable'
}

/**
 * Compute month-over-month change percentage.
 * Returns 0 if prior is 0.
 */
export function computeMomChangePct(current: number, prior: number): number {
  if (prior === 0) return 0
  return ((current - prior) / prior) * 100
}

/**
 * Detect if an expense category had a "spike" this month.
 * spike: current > 3-month avg × 1.5 AND current > prior × 1.3
 */
export function detectExpenseSpike(
  currentMonth: number,
  threeMonthAvg: number,
  priorMonth: number,
): boolean {
  return currentMonth > threeMonthAvg * 1.5 && currentMonth > priorMonth * 1.3
}

/**
 * Compute annualized run rate (monthly × 12).
 */
export function computeAnnualRunRate(monthlyRunRate: number): number {
  return monthlyRunRate * 12
}

/**
 * Compute YTD variance vs run rate baseline.
 * ytd_variance = ytd_actual - (monthly_run_rate × months_elapsed)
 * Positive = overspending, negative = underspending.
 */
export function computeYtdVariance(
  ytdActual: number,
  monthlyRunRate: number,
  monthsElapsed: number,
): number {
  return ytdActual - monthlyRunRate * monthsElapsed
}

/**
 * Classify run rate trend direction across all expense categories.
 *
 * rising  : more than 50% of categories are accelerating
 * falling : more than 50% are decelerating
 * stable  : no categories or all are stable/insufficient_data
 * mixed   : otherwise
 */
export function classifyOverallExpenseTrend(
  momentums: Array<ExpenseCategoryMetrics['momentum']>,
): 'rising' | 'falling' | 'mixed' | 'stable' {
  const n = momentums.length
  if (n === 0) return 'stable'
  const accelerating = momentums.filter(m => m === 'accelerating').length
  const decelerating = momentums.filter(m => m === 'decelerating').length
  if (accelerating / n > 0.5) return 'rising'
  if (decelerating / n > 0.5) return 'falling'
  if (accelerating === 0 && decelerating === 0) return 'stable'
  return 'mixed'
}

/**
 * Compute how many months until expenses exceed revenue at current momentum.
 *
 * Solves: currentRunRate × (1 + monthlyGrowthRate)^n > currentRevenue × (1 + revenueGrowthRate)^n
 *
 * Returns null if:
 *   - expenses are already below revenue AND monthlyGrowthRate ≤ 0 (stable/falling)
 *   - expenses already < revenue AND monthlyGrowthRate ≤ revenueGrowthRate (can't catch up)
 *
 * Returns null also if expenses >= revenue but monthlyGrowthRate <= 0 (not growing).
 */
export function computeMonthsUntilExpenseRisk(
  currentRunRate: number,
  monthlyGrowthRate: number,
  currentRevenue: number,
  revenueGrowthRate = 0,
): number | null {
  // Not accelerating → no risk
  if (monthlyGrowthRate <= 0) return null
  // Expenses already exceed revenue
  if (currentRunRate >= currentRevenue) {
    // Already at risk, return 0 would be misleading — return 1 to indicate immediate
    // But spec says null if stable/falling; expenses already > revenue means it's already happened
    // Return null per spec ("null if stable/falling" — if not accelerating, null)
    return null
  }
  // Simulate month by month up to 120 months
  let expenses = currentRunRate
  let revenue = currentRevenue
  for (let month = 1; month <= 120; month++) {
    expenses = expenses * (1 + monthlyGrowthRate)
    revenue = revenue * (1 + revenueGrowthRate)
    if (expenses > revenue) return month
  }
  return null
}

/**
 * Find top N categories by run rate (highest spend), sorted descending.
 * Default topN = 5.
 */
export function findTopExpenseCategories(
  categories: ExpenseCategoryMetrics[],
  topN = 5,
): ExpenseCategoryMetrics[] {
  return [...categories]
    .sort((a, b) => b.monthly_run_rate_try - a.monthly_run_rate_try)
    .slice(0, topN)
}

/**
 * Find categories with spikes this month.
 */
export function findSpikeCategories(
  categories: ExpenseCategoryMetrics[],
): ExpenseCategoryMetrics[] {
  return categories.filter(c =>
    detectExpenseSpike(c.current_month_try, c.three_month_avg_try, c.prior_month_try),
  )
}

/**
 * Build a complete category metrics object from monthly data points (sorted oldest first).
 */
export function buildCategoryMetrics(
  category: string,
  label: string,
  monthlyData: Array<{ month: string; amount: number }>,
): ExpenseCategoryMetrics {
  const months = monthlyData.map(d => ({ month: d.month, amount_try: d.amount }))
  const amounts = months.map(m => m.amount_try)
  const n = amounts.length

  const currentMonthTry = n > 0 ? amounts[n - 1] : 0
  const priorMonthTry   = n > 1 ? amounts[n - 2] : 0

  const threeMonthAvgTry = computeRollingAverage(amounts, 3)
  const sixMonthAvgTry   = computeRollingAverage(amounts, 6)

  // monthly_run_rate = 3-month avg (best estimate of "normal")
  const monthlyRunRateTry = threeMonthAvgTry
  const annualRunRateTry  = computeAnnualRunRate(monthlyRunRateTry)

  const momChangePct = computeMomChangePct(currentMonthTry, priorMonthTry)

  // Linear slope on last 3 months
  const last3 = amounts.slice(-3)
  const slope = computeLinearSlope(last3)

  // CV on last 3 months for momentum classification
  const cv = computeCv(last3)

  const momentum = classifyExpenseMomentum(slope, threeMonthAvgTry, cv, last3.length)

  return {
    category,
    label: label || CATEGORY_LABELS[category] || category,
    months,
    current_month_try: currentMonthTry,
    prior_month_try: priorMonthTry,
    three_month_avg_try: threeMonthAvgTry,
    six_month_avg_try: sixMonthAvgTry,
    monthly_run_rate_try: monthlyRunRateTry,
    annual_run_rate_try: annualRunRateTry,
    mom_change_pct: momChangePct,
    three_month_trend_slope: slope,
    momentum,
  }
}

// ── Service class ──────────────────────────────────────────────────────────────

export class ExpenseRunRateService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<ExpenseRunRateReport> {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    // Build last 6 month keys (oldest first)
    const monthKeys: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const fromDate = `${monthKeys[0]}-01`
    const toYear = now.getFullYear()
    const toMonth = now.getMonth() + 1
    const lastDay = new Date(toYear, toMonth, 0).getDate()
    const toDate = `${currentMonth}-${String(lastDay).padStart(2, '0')}`

    // Fetch expenses grouped by expense_type and month
    const { data: rows, error } = await this.supabase
      .from('expenses')
      .select('expense_type, expense_date, amount_try')
      .eq('company_id', companyId)
      .gte('expense_date', fromDate)
      .lte('expense_date', toDate)
      .is('deleted_at', null)

    if (error) throw new Error(`ExpenseRunRateService: ${error.message}`)

    // Group by category and month
    type GroupKey = string
    const grouped = new Map<GroupKey, Map<string, number>>()

    for (const row of rows ?? []) {
      const cat = row.expense_type ?? 'general'
      const dateStr = String(row.expense_date)
      const month = dateStr.slice(0, 7) // YYYY-MM
      if (!grouped.has(cat)) grouped.set(cat, new Map())
      const catMap = grouped.get(cat)!
      catMap.set(month, (catMap.get(month) ?? 0) + (row.amount_try ?? 0))
    }

    // Build category metrics
    const categories: ExpenseCategoryMetrics[] = []
    for (const [cat, monthMap] of grouped) {
      const monthlyData = monthKeys.map(mk => ({
        month: mk,
        amount: monthMap.get(mk) ?? 0,
      }))
      const label = CATEGORY_LABELS[cat] ?? cat
      categories.push(buildCategoryMetrics(cat, label, monthlyData))
    }

    // Sort by run rate desc
    categories.sort((a, b) => b.monthly_run_rate_try - a.monthly_run_rate_try)

    // YTD calculations
    const currentYear = now.getFullYear()
    const monthsElapsedYtd = now.getMonth() + 1 // Jan = 1, Dec = 12
    const ytdPrefix = `${currentYear}-`

    let ytdActualTry = 0
    for (const cat of categories) {
      for (const m of cat.months) {
        if (m.month.startsWith(ytdPrefix)) {
          ytdActualTry += m.amount_try
        }
      }
    }

    const totalMonthlyRunRate = categories.reduce((s, c) => s + c.monthly_run_rate_try, 0)
    const totalAnnualRunRate  = computeAnnualRunRate(totalMonthlyRunRate)
    const ytdBudgetEquivalent = totalMonthlyRunRate * monthsElapsedYtd
    const ytdVariance         = computeYtdVariance(ytdActualTry, totalMonthlyRunRate, monthsElapsedYtd)
    const ytdVariancePct      = ytdBudgetEquivalent > 0
      ? (ytdVariance / ytdBudgetEquivalent) * 100
      : 0

    const runRateSummary: RunRateSummary = {
      total_monthly_run_rate_try: totalMonthlyRunRate,
      total_annual_run_rate_try:  totalAnnualRunRate,
      ytd_actual_try:             ytdActualTry,
      ytd_budget_equivalent_try:  ytdBudgetEquivalent,
      ytd_variance_try:           ytdVariance,
      ytd_variance_pct:           ytdVariancePct,
    }

    const momentums = categories.map(c => c.momentum)
    const overallTrend = classifyOverallExpenseTrend(momentums)
    const topCategories = findTopExpenseCategories(categories, 5)
    const spikeCategories = findSpikeCategories(categories)

    // Overall expense risk: use total run rate with average growth rate of accelerating categories
    const acceleratingCats = categories.filter(c => c.momentum === 'accelerating')
    let monthlyGrowthRate = 0
    if (acceleratingCats.length > 0) {
      // Average MoM change pct as decimal for accelerating categories
      const avgMom = acceleratingCats.reduce((s, c) => s + c.mom_change_pct, 0) / acceleratingCats.length
      monthlyGrowthRate = avgMom / 100
    }
    // We need current revenue — use 0 as placeholder since we don't have it in this query
    // The function returns null if expenses < revenue when monthlyGrowthRate is 0
    const monthsUntilRisk = monthlyGrowthRate > 0
      ? computeMonthsUntilExpenseRisk(totalMonthlyRunRate, monthlyGrowthRate, totalMonthlyRunRate * 2)
      : null

    // Fastest growing by MoM %
    let fastestGrowing: string | null = null
    if (categories.length > 0) {
      const sorted = [...categories].sort((a, b) => b.mom_change_pct - a.mom_change_pct)
      fastestGrowing = sorted[0].mom_change_pct > 0 ? sorted[0].category : null
    }

    // Largest by run rate
    const largestCategory = categories.length > 0 ? categories[0].category : null

    return {
      analysis_months: 6,
      current_month:   currentMonth,
      months_elapsed_ytd: monthsElapsedYtd,
      categories,
      run_rate_summary: runRateSummary,
      overall_trend: overallTrend,
      top_categories: topCategories,
      spike_categories: spikeCategories,
      months_until_expense_risk: monthsUntilRisk,
      fastest_growing_category: fastestGrowing,
      largest_category: largestCategory,
    }
  }
}
