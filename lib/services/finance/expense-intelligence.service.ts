// ── ExpenseIntelligenceService — Spending Efficiency & Category Intelligence ──
//
// Complements expense-anomaly.service.ts (which detects statistical outliers).
// This service focuses on:
//   - Spending efficiency ratios
//   - Category mix analysis
//   - Run-rate projections
//   - Savings opportunity identification
//   - Fixed vs variable expense split
//
// The class also retains the original category-trend static method used by the
// operations dashboard (ExpensesContent). New functionality is exposed both via
// pure exported functions and via the instance-method getReport (ExpenseEfficiencyReport).

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ══ Original category-trend types (used by operations dashboard) ══════════════

export const EXPENSE_TYPE_LABELS: Record<string, string> = {
  salary:            'Maaş',
  rent:              'Kira',
  software:          'Yazılım',
  marketing:         'Pazarlama',
  logistics:         'Lojistik',
  utilities:         'Faturalar',
  general:           'Genel Gider',
  operational:       'Operasyonel',
  tax:               'Vergi',
  interest:          'Faiz',
  other:             'Diğer',
  fixed:             'Sabit Gider',
  variable:          'Değişken Gider',
  capital:           'Sermaye',
  financial:         'Finansal',
  loan_repayment:    'Kredi Geri Ödemesi',
  partner_financing: 'Ortak Finansmanı',
  dividend:          'Kâr Payı',
  internal_transfer: 'İç Transfer',
}

function labelFor(expenseType: string): string {
  return EXPENSE_TYPE_LABELS[expenseType] ?? expenseType
}

export interface ExpenseCategoryTrend {
  expense_type: string
  label:        string

  // Current period
  current_try:             number
  current_pct_of_total:    number

  // Prior period
  prior_try:     number
  change_try:    number
  change_pct:    number | null
  trend:         'up' | 'down' | 'stable' | 'new'

  // 3-month rolling average
  rolling_avg_try:    number | null
  vs_rolling_avg_pct: number | null
}

export interface ExpenseIntelligenceReport {
  period_from: string
  period_to:   string

  total_expenses_try:  number
  prior_total_try:     number
  total_change_pct:    number | null

  categories: ExpenseCategoryTrend[]

  fastest_growing:     string | null
  fastest_growing_pct: number | null

  largest_category:     string
  largest_category_pct: number

  computed_at: string
}

interface LegacyExpenseRow {
  amount_try:   number | null
  expense_type: string | null
  expense_date: string | null
}

// ══ Expense Ratios (new pure functions) ═══════════════════════════════════════

/**
 * Compute expense-to-revenue ratio per category.
 * Returns null if revenue === 0.
 */
export function computeExpenseRevenueRatio(
  expenseAmount: number,
  revenue: number,
): number | null {
  if (revenue === 0) return null
  return expenseAmount / revenue
}

/**
 * Compute expense growth rate MoM.
 * Returns null if priorAmount === 0.
 */
export function computeExpenseGrowthRate(
  currentAmount: number,
  priorAmount: number,
): number | null {
  if (priorAmount === 0) return null
  return ((currentAmount - priorAmount) / priorAmount) * 100
}

/**
 * Compute run-rate: annualize a period's expenses.
 * runRate = amount / periodMonths * 12
 * Returns null if periodMonths === 0.
 */
export function computeExpenseRunRate(
  amount: number,
  periodMonths: number,
): number | null {
  if (periodMonths === 0) return null
  return (amount / periodMonths) * 12
}

/**
 * Compute cost per revenue unit (cost efficiency):
 * costPerRevUnit = totalExpenses / totalRevenue
 * Returns null if totalRevenue === 0.
 * Lower is better.
 */
export function computeCostPerRevenueUnit(
  totalExpenses: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return totalExpenses / totalRevenue
}

// ══ Fixed vs Variable Classification ═════════════════════════════════════════

const FIXED_CATEGORIES = new Set([
  'rent', 'salary', 'insurance', 'subscription', 'software', 'lease',
])

const VARIABLE_CATEGORIES = new Set([
  'logistics', 'shipping', 'marketing', 'sales', 'cogs', 'materials',
])

/**
 * Classify expense type as fixed, variable, or semi-variable.
 * FIXED: 'rent', 'salary', 'insurance', 'subscription', 'software', 'lease'
 * VARIABLE: 'logistics', 'shipping', 'marketing', 'sales', 'cogs', 'materials'
 * SEMI_VARIABLE: everything else, including null
 */
export function classifyExpenseNature(
  expenseType: string | null,
): 'fixed' | 'variable' | 'semi_variable' {
  if (expenseType === null) return 'semi_variable'
  const t = expenseType.toLowerCase().trim()
  if (FIXED_CATEGORIES.has(t)) return 'fixed'
  if (VARIABLE_CATEGORIES.has(t)) return 'variable'
  return 'semi_variable'
}

/**
 * Compute fixed cost ratio: fixedCosts / totalCosts * 100.
 * Returns null if totalCosts === 0.
 */
export function computeFixedCostRatio(
  fixedCosts: number,
  totalCosts: number,
): number | null {
  if (totalCosts === 0) return null
  return (fixedCosts / totalCosts) * 100
}

/**
 * Classify operating leverage from fixed cost ratio.
 * 'very_high': >= 70%
 * 'high': >= 50%
 * 'moderate': >= 30%
 * 'low': < 30%
 * 'insufficient_data': null
 */
export function classifyOperatingLeverage(
  fixedCostRatioPct: number | null,
): 'very_high' | 'high' | 'moderate' | 'low' | 'insufficient_data' {
  if (fixedCostRatioPct === null) return 'insufficient_data'
  if (fixedCostRatioPct >= 70) return 'very_high'
  if (fixedCostRatioPct >= 50) return 'high'
  if (fixedCostRatioPct >= 30) return 'moderate'
  return 'low'
}

// ══ Category Intelligence ═════════════════════════════════════════════════════

/**
 * Compute category concentration: largest_category / total * 100.
 * Returns null if total === 0 or array is empty.
 */
export function computeCategoryConcentration(
  categories: Array<{ amount: number }>,
): number | null {
  if (categories.length === 0) return null
  const total = categories.reduce((s, c) => s + c.amount, 0)
  if (total === 0) return null
  const max = Math.max(...categories.map(c => c.amount))
  return (max / total) * 100
}

/**
 * Detect category spending drift: categories where spending shifted by > threshold%.
 * threshold: default 20 (percent change).
 * New categories (prior = 0) are excluded.
 */
export function detectCategoryDrift(
  prior: Array<{ category: string; amount: number }>,
  current: Array<{ category: string; amount: number }>,
  thresholdPct = 20,
): Array<{
  category: string
  change_pct: number
  prior_amount: number
  current_amount: number
  direction: 'increased' | 'decreased'
}> {
  const priorMap   = new Map(prior.map(p => [p.category, p.amount]))
  const currentMap = new Map(current.map(c => [c.category, c.amount]))

  const allCategories = new Set([...priorMap.keys(), ...currentMap.keys()])
  const drifts: ReturnType<typeof detectCategoryDrift> = []

  for (const category of allCategories) {
    const priorAmt   = priorMap.get(category)   ?? 0
    const currentAmt = currentMap.get(category) ?? 0

    // Skip new categories (no prior baseline)
    if (priorAmt === 0) continue

    const changePct = ((currentAmt - priorAmt) / priorAmt) * 100

    if (Math.abs(changePct) > thresholdPct) {
      drifts.push({
        category,
        change_pct:     Math.round(changePct * 10) / 10,
        prior_amount:   priorAmt,
        current_amount: currentAmt,
        direction:      changePct > 0 ? 'increased' : 'decreased',
      })
    }
  }

  return drifts
}

/**
 * Compute savings opportunity: projected annual savings if category is reduced to benchmark.
 * benchmarkRatioPct: target category/revenue ratio (e.g. 5% for marketing)
 * Returns 0 if currentAmount <= benchmarkAmount or revenue is 0.
 */
export function computeSavingsOpportunity(
  categoryAmount: number,
  revenue: number,
  benchmarkRatioPct: number,
): number {
  if (revenue === 0) return 0
  const benchmarkAmount = (benchmarkRatioPct / 100) * revenue
  if (categoryAmount <= benchmarkAmount) return 0
  return (categoryAmount - benchmarkAmount) * 12
}

// ══ Spending Efficiency ═══════════════════════════════════════════════════════

/**
 * Compute expense velocity: avg daily spend = totalExpenses / periodDays.
 * Returns null if periodDays === 0.
 */
export function computeExpenseVelocity(
  totalExpenses: number,
  periodDays: number,
): number | null {
  if (periodDays === 0) return null
  return totalExpenses / periodDays
}

/**
 * Classify expense velocity trend.
 * 'accelerating': current > prior * 1.15
 * 'stable': current between prior * 0.85 and prior * 1.15 (inclusive)
 * 'decelerating': current < prior * 0.85
 * 'no_prior_data': priorVelocity is null
 */
export function classifyExpenseVelocityTrend(
  currentVelocity: number,
  priorVelocity: number | null,
): 'accelerating' | 'stable' | 'decelerating' | 'no_prior_data' {
  if (priorVelocity === null) return 'no_prior_data'
  if (currentVelocity > priorVelocity * 1.15) return 'accelerating'
  if (currentVelocity < priorVelocity * 0.85) return 'decelerating'
  return 'stable'
}

/**
 * Compute expense efficiency score (0-100).
 * - Cost per revenue unit: < 0.60 → 40pts; < 0.75 → 30pts; < 0.85 → 20pts; else 10pts
 * - Fixed cost ratio: < 30% → 30pts; < 50% → 20pts; < 70% → 10pts; else 5pts
 * - Category concentration: < 30% → 30pts; < 50% → 20pts; < 70% → 10pts; else 5pts
 * Returns null if all inputs are null.
 */
export function computeExpenseEfficiencyScore(
  costPerRevenueUnit: number | null,
  fixedCostRatioPct: number | null,
  categoryConcentrationPct: number | null,
): number | null {
  if (
    costPerRevenueUnit === null &&
    fixedCostRatioPct === null &&
    categoryConcentrationPct === null
  ) {
    return null
  }

  let score = 0

  if (costPerRevenueUnit !== null) {
    if (costPerRevenueUnit < 0.60) score += 40
    else if (costPerRevenueUnit < 0.75) score += 30
    else if (costPerRevenueUnit < 0.85) score += 20
    else score += 10
  }

  if (fixedCostRatioPct !== null) {
    if (fixedCostRatioPct < 30) score += 30
    else if (fixedCostRatioPct < 50) score += 20
    else if (fixedCostRatioPct < 70) score += 10
    else score += 5
  }

  if (categoryConcentrationPct !== null) {
    if (categoryConcentrationPct < 30) score += 30
    else if (categoryConcentrationPct < 50) score += 20
    else if (categoryConcentrationPct < 70) score += 10
    else score += 5
  }

  return score
}

/**
 * Classify expense efficiency.
 * 'excellent': >= 80
 * 'good': >= 60
 * 'moderate': >= 40
 * 'poor': < 40
 * 'insufficient_data': null
 */
export function classifyExpenseEfficiency(
  score: number | null,
): 'excellent' | 'good' | 'moderate' | 'poor' | 'insufficient_data' {
  if (score === null) return 'insufficient_data'
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'moderate'
  return 'poor'
}

/**
 * Generate Turkish expense intelligence narrative.
 */
export function generateExpenseIntelligenceNarrative(
  efficiency: ReturnType<typeof classifyExpenseEfficiency>,
  topCategory: string | null,
  topCategoryRatioPct: number | null,
  fixedCostRatioPct: number | null,
): string {
  const fixedStr = fixedCostRatioPct !== null
    ? ` Sabit gider oranı %${fixedCostRatioPct.toFixed(1)}.`
    : ''

  const topCatStr = topCategory && topCategoryRatioPct !== null
    ? ` En büyük gider kalemi "${topCategory}" (%${topCategoryRatioPct.toFixed(1)}).`
    : ''

  switch (efficiency) {
    case 'excellent':
      return `Gider verimliliği mükemmel seviyede.${topCatStr}${fixedStr} Maliyet yapısı sağlıklı ve sürdürülebilir görünüyor.`
    case 'good':
      return `Gider verimliliği iyi seviyede.${topCatStr}${fixedStr} Bazı kategorilerde iyileştirme fırsatları mevcut.`
    case 'moderate':
      return `Gider verimliliği orta seviyede.${topCatStr}${fixedStr} Maliyet yapısı gözden geçirilmeli ve tasarruf fırsatları araştırılmalı.`
    case 'poor':
      return `Gider verimliliği düşük seviyede.${topCatStr}${fixedStr} Acil maliyet optimizasyonu gerekiyor.`
    case 'insufficient_data':
      return 'Gider verimliliği hesaplanamadı. Yeterli veri bulunmuyor.'
  }
}

// ══ New Efficiency Report Interfaces ══════════════════════════════════════════

export interface CategoryBreakdown {
  category:             string
  amount:               number
  ratio_pct:            number | null
  revenue_ratio_pct:    number | null
  nature:               ReturnType<typeof classifyExpenseNature>
  run_rate_annual:      number | null
  prior_month_amount:   number | null
  growth_rate_pct:      number | null
}

export interface ExpenseEfficiencyReport {
  as_of_date:    string
  period_months: number

  total_expenses:        number
  total_revenue:         number
  cost_per_revenue_unit: number | null

  fixed_costs:          number
  variable_costs:       number
  semi_variable_costs:  number
  fixed_cost_ratio_pct: number | null
  operating_leverage:   ReturnType<typeof classifyOperatingLeverage>

  categories: CategoryBreakdown[]

  top_category:           string | null
  top_category_amount:    number
  top_category_ratio_pct: number | null

  current_month_velocity: number | null
  prior_month_velocity:   number | null
  velocity_trend:         ReturnType<typeof classifyExpenseVelocityTrend>

  category_drifts: ReturnType<typeof detectCategoryDrift>

  category_concentration_pct: number | null
  efficiency_score:            number | null
  efficiency:                  ReturnType<typeof classifyExpenseEfficiency>
  run_rate_annual:             number | null

  narrative: string
}

// ══ Internal DB row types ══════════════════════════════════════════════════════

interface NewExpenseRow {
  amount:       number | null
  expense_type: string | null
  expense_date: string | null
}

interface SaleRow {
  amount: number | null
}

// ══ Service class ══════════════════════════════════════════════════════════════

export class ExpenseIntelligenceService {

  constructor(private readonly supabase: AnyClient) {}

  // ── Instance method: new efficiency report ─────────────────────────────────

  async getReport(
    companyId: string,
    periodMonths = 3,
  ): Promise<ExpenseEfficiencyReport> {
    const today    = new Date()
    const asOfDate = today.toISOString().slice(0, 10)

    const periodStart = new Date(today)
    periodStart.setMonth(periodStart.getMonth() - periodMonths)
    const periodStartStr = periodStart.toISOString().slice(0, 10)

    const currentMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const currentMonthEnd   = asOfDate
    const currentMonthDays  = today.getDate()

    const priorMonthDate  = new Date(today)
    priorMonthDate.setMonth(priorMonthDate.getMonth() - 1)
    const priorMonthStart = `${priorMonthDate.getFullYear()}-${String(priorMonthDate.getMonth() + 1).padStart(2, '0')}-01`
    const priorMonthLastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    const priorMonthEnd   = priorMonthLastDay.toISOString().slice(0, 10)
    const priorMonthDays  = priorMonthLastDay.getDate()

    const [periodExpRes, currentMonthRes, priorMonthRes, revenueRes] = await Promise.all([
      this.supabase
        .from('expenses')
        .select('amount, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', periodStartStr)
        .lte('expense_date', asOfDate),

      this.supabase
        .from('expenses')
        .select('amount, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', currentMonthStart)
        .lte('expense_date', currentMonthEnd),

      this.supabase
        .from('expenses')
        .select('amount, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', priorMonthStart)
        .lte('expense_date', priorMonthEnd),

      this.supabase
        .from('sales')
        .select('amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', periodStartStr)
        .lte('created_at', asOfDate),
    ])

    const periodExpenses: NewExpenseRow[]  = (periodExpRes.data   ?? []) as NewExpenseRow[]
    const currentMonthExp: NewExpenseRow[] = (currentMonthRes.data ?? []) as NewExpenseRow[]
    const priorMonthExp: NewExpenseRow[]   = (priorMonthRes.data   ?? []) as NewExpenseRow[]
    const salesRows: SaleRow[]             = (revenueRes.data      ?? []) as SaleRow[]

    const totalRevenue  = salesRows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const totalExpenses = periodExpenses.reduce((s, r) => s + Number(r.amount ?? 0), 0)

    const categoryMap = new Map<string, number>()
    for (const row of periodExpenses) {
      const type = row.expense_type ?? 'other'
      categoryMap.set(type, (categoryMap.get(type) ?? 0) + Number(row.amount ?? 0))
    }

    const priorCategoryMap = new Map<string, number>()
    for (const row of priorMonthExp) {
      const type = row.expense_type ?? 'other'
      priorCategoryMap.set(type, (priorCategoryMap.get(type) ?? 0) + Number(row.amount ?? 0))
    }

    const categories: CategoryBreakdown[] = []
    let fixedCosts       = 0
    let variableCosts    = 0
    let semiVariableCosts = 0

    for (const [cat, amount] of categoryMap.entries()) {
      const nature          = classifyExpenseNature(cat)
      const ratioPct        = totalExpenses > 0 ? (amount / totalExpenses) * 100 : null
      const revenueRatioPct = totalRevenue  > 0 ? (amount / totalRevenue)  * 100 : null
      const runRateAnnual   = computeExpenseRunRate(amount, periodMonths)
      const priorAmt        = priorCategoryMap.get(cat) ?? null
      const growthRatePct   = priorAmt !== null
        ? computeExpenseGrowthRate(amount / periodMonths, priorAmt)
        : null

      categories.push({
        category:           cat,
        amount,
        ratio_pct:          ratioPct   !== null ? Math.round(ratioPct   * 10) / 10 : null,
        revenue_ratio_pct:  revenueRatioPct !== null ? Math.round(revenueRatioPct * 10) / 10 : null,
        nature,
        run_rate_annual:    runRateAnnual,
        prior_month_amount: priorAmt,
        growth_rate_pct:    growthRatePct !== null ? Math.round(growthRatePct * 10) / 10 : null,
      })

      if (nature === 'fixed')         fixedCosts        += amount
      else if (nature === 'variable') variableCosts     += amount
      else                            semiVariableCosts += amount
    }

    categories.sort((a, b) => b.amount - a.amount)

    const fixedCostRatioPct  = computeFixedCostRatio(fixedCosts, totalExpenses)
    const operatingLeverage  = classifyOperatingLeverage(fixedCostRatioPct)

    const topCat             = categories[0] ?? null
    const topCategory        = topCat?.category ?? null
    const topCategoryAmount  = topCat?.amount   ?? 0
    const topCategoryRatioPct = topCat?.ratio_pct ?? null

    const currentMonthTotal   = currentMonthExp.reduce((s, r) => s + Number(r.amount ?? 0), 0)
    const priorMonthTotal     = priorMonthExp.reduce((s, r) => s + Number(r.amount ?? 0), 0)

    const currentMonthVelocity = computeExpenseVelocity(currentMonthTotal, currentMonthDays)
    const priorMonthVelocity   = computeExpenseVelocity(priorMonthTotal, priorMonthDays)
    const velocityTrend        = classifyExpenseVelocityTrend(
      currentMonthVelocity ?? 0,
      priorMonthVelocity,
    )

    const currentMonthCatMap = new Map<string, number>()
    for (const row of currentMonthExp) {
      const type = row.expense_type ?? 'other'
      currentMonthCatMap.set(type, (currentMonthCatMap.get(type) ?? 0) + Number(row.amount ?? 0))
    }

    const priorArr   = Array.from(priorCategoryMap.entries()).map(([category, amount]) => ({ category, amount }))
    const currentArr = Array.from(currentMonthCatMap.entries()).map(([category, amount]) => ({ category, amount }))
    const categoryDrifts = detectCategoryDrift(priorArr, currentArr)

    const categoryConcentrationPct = computeCategoryConcentration(
      categories.map(c => ({ amount: c.amount })),
    )
    const costPerRevenueUnit  = computeCostPerRevenueUnit(totalExpenses, totalRevenue)
    const efficiencyScore     = computeExpenseEfficiencyScore(
      costPerRevenueUnit,
      fixedCostRatioPct,
      categoryConcentrationPct,
    )
    const efficiency          = classifyExpenseEfficiency(efficiencyScore)
    const runRateAnnual       = computeExpenseRunRate(totalExpenses, periodMonths)

    const narrative = generateExpenseIntelligenceNarrative(
      efficiency,
      topCategory,
      topCategoryRatioPct,
      fixedCostRatioPct !== null ? Math.round(fixedCostRatioPct * 10) / 10 : null,
    )

    return {
      as_of_date:    asOfDate,
      period_months: periodMonths,
      total_expenses:        totalExpenses,
      total_revenue:         totalRevenue,
      cost_per_revenue_unit: costPerRevenueUnit,
      fixed_costs:          fixedCosts,
      variable_costs:       variableCosts,
      semi_variable_costs:  semiVariableCosts,
      fixed_cost_ratio_pct: fixedCostRatioPct !== null ? Math.round(fixedCostRatioPct * 10) / 10 : null,
      operating_leverage:   operatingLeverage,
      categories,
      top_category:          topCategory,
      top_category_amount:   topCategoryAmount,
      top_category_ratio_pct: topCategoryRatioPct,
      current_month_velocity: currentMonthVelocity,
      prior_month_velocity:   priorMonthVelocity,
      velocity_trend:         velocityTrend,
      category_drifts: categoryDrifts,
      category_concentration_pct: categoryConcentrationPct !== null
        ? Math.round(categoryConcentrationPct * 10) / 10
        : null,
      efficiency_score: efficiencyScore,
      efficiency,
      run_rate_annual: runRateAnnual,
      narrative,
    }
  }

  // ── Static method: original category-trend report (used by operations dashboard) ──

  static computeTrend(current: number, prior: number): ExpenseCategoryTrend['trend'] {
    if (prior === 0 && current > 0) return 'new'
    if (prior === 0) return 'stable'
    const changePct = ((current - prior) / prior) * 100
    if (changePct > 5)  return 'up'
    if (changePct < -5) return 'down'
    return 'stable'
  }

  private static aggregateByType(rows: LegacyExpenseRow[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const row of rows) {
      const type = row.expense_type ?? 'other'
      map.set(type, (map.get(type) ?? 0) + Number(row.amount_try ?? 0))
    }
    return map
  }

  private static shiftPeriod(period: { from: string; to: string }): { from: string; to: string } {
    const fromDate = new Date(period.from)
    const toDate   = new Date(period.to)
    const daysSpan = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const priorTo   = new Date(fromDate.getTime() - 86400_000)
    const priorFrom = new Date(priorTo.getTime() - (daysSpan - 1) * 86400_000)

    return {
      from: priorFrom.toISOString().slice(0, 10),
      to:   priorTo.toISOString().slice(0, 10),
    }
  }

  private static rollingPeriod(period: { from: string; to: string }): { from: string; to: string } {
    const toDate   = new Date(period.to)
    const fromDate = new Date(toDate)
    fromDate.setMonth(fromDate.getMonth() - 3)
    fromDate.setDate(fromDate.getDate() + 1)
    return {
      from: fromDate.toISOString().slice(0, 10),
      to:   period.to,
    }
  }

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    period: { from: string; to: string },
  ): Promise<ExpenseIntelligenceReport> {
    const priorPeriod   = ExpenseIntelligenceService.shiftPeriod(period)
    const rollingPeriod = ExpenseIntelligenceService.rollingPeriod(period)

    const [currentRes, priorRes, rollingRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),

      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', priorPeriod.from)
        .lte('expense_date', priorPeriod.to),

      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', rollingPeriod.from)
        .lte('expense_date', rollingPeriod.to),
    ])

    const currentRows = (currentRes.data ?? []) as LegacyExpenseRow[]
    const priorRows   = (priorRes.data   ?? []) as LegacyExpenseRow[]
    const rollingRows = (rollingRes.data  ?? []) as LegacyExpenseRow[]

    const currentMap = ExpenseIntelligenceService.aggregateByType(currentRows)
    const priorMap   = ExpenseIntelligenceService.aggregateByType(priorRows)
    const rollingMap = ExpenseIntelligenceService.aggregateByType(rollingRows)

    const totalCurrent = Array.from(currentMap.values()).reduce((s, v) => s + v, 0)
    const totalPrior   = Array.from(priorMap.values()).reduce((s, v) => s + v, 0)

    const allTypes = new Set([...currentMap.keys(), ...priorMap.keys()])
    const categories: ExpenseCategoryTrend[] = []

    for (const type of allTypes) {
      const current = currentMap.get(type) ?? 0
      const prior   = priorMap.get(type)   ?? 0

      const changeTry = current - prior
      const changePct = prior > 0 ? ((changeTry / prior) * 100) : null

      const trend = ExpenseIntelligenceService.computeTrend(current, prior)

      const rollingTotal = rollingMap.get(type) ?? 0
      const rollingAvg   = rollingTotal > 0 ? rollingTotal / 3 : null
      const vsRollingPct = rollingAvg && rollingAvg > 0
        ? ((current - rollingAvg) / rollingAvg) * 100
        : null

      categories.push({
        expense_type:          type,
        label:                 labelFor(type),
        current_try:           current,
        current_pct_of_total:  totalCurrent > 0 ? (current / totalCurrent) * 100 : 0,
        prior_try:             prior,
        change_try:            changeTry,
        change_pct:            changePct !== null ? Math.round(changePct * 10) / 10 : null,
        trend,
        rolling_avg_try:       rollingAvg,
        vs_rolling_avg_pct:    vsRollingPct !== null ? Math.round(vsRollingPct * 10) / 10 : null,
      })
    }

    categories.sort((a, b) => b.current_try - a.current_try)

    const growing = categories
      .filter(c => c.change_pct !== null && c.change_pct > 0 && c.trend !== 'new')
      .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))

    const fastestGrowing    = growing[0]?.expense_type ?? null
    const fastestGrowingPct = growing[0]?.change_pct   ?? null

    const largestCategory    = categories[0]?.expense_type ?? ''
    const largestCategoryPct = categories[0]?.current_pct_of_total ?? 0

    const totalChangePct = totalPrior > 0
      ? Math.round(((totalCurrent - totalPrior) / totalPrior) * 100 * 10) / 10
      : null

    return {
      period_from:          period.from,
      period_to:            period.to,
      total_expenses_try:   totalCurrent,
      prior_total_try:      totalPrior,
      total_change_pct:     totalChangePct,
      categories,
      fastest_growing:      fastestGrowing,
      fastest_growing_pct:  fastestGrowingPct,
      largest_category:     largestCategory,
      largest_category_pct: Math.round(largestCategoryPct * 10) / 10,
      computed_at:          new Date().toISOString(),
    }
  }
}
