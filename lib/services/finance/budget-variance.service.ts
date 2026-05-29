// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/budget-variance.service.ts
//
// Budget Variance Analysis — tracks actual vs budget performance across
// revenue, expense categories, and overall P&L with variance analysis.
//
// Pure helpers are exported for unit testing (no DB required).
// BudgetVarianceService class handles DB-connected report generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BudgetLine {
  category: string       // e.g. 'revenue', 'salary', 'rent', 'marketing', 'cogs', etc.
  budget_try: number
  actual_try: number
  variance_try: number   // actual - budget (positive = over-budget for expenses, positive = above for revenue)
  variance_pct: number   // (actual - budget) / budget × 100, returns 0 if budget = 0
  is_favorable: boolean  // true if outcome is good (revenue above budget OR expense below budget)
}

export interface BudgetPeriod {
  period: string         // YYYY-MM
  lines: BudgetLine[]
  total_budget_revenue: number
  total_actual_revenue: number
  total_budget_expenses: number
  total_actual_expenses: number
  budget_net_income: number   // budget_revenue - budget_expenses
  actual_net_income: number   // actual_revenue - actual_expenses
  net_income_variance_try: number
  net_income_variance_pct: number
  is_net_income_favorable: boolean
}

export interface BudgetVarianceReport {
  period: string           // current month YYYY-MM
  current_period: BudgetPeriod
  ytd: ReturnType<typeof computeYtdVariance>
  performance: ReturnType<typeof classifyBudgetPerformance>
  trend: ReturnType<typeof computeBudgetTrend>
  run_rate: ReturnType<typeof computeRunRate>
  largest_variance: BudgetLine | null
  over_budget_categories: BudgetLine[]
  is_using_derived_budget: boolean  // true if no explicit budget found

  // Legacy fields — kept for backward compatibility with BudgetTab.tsx
  months: MonthlyVariance[]
  has_any_budget: boolean
  overall_status: 'on_track' | 'at_risk' | 'over_budget' | 'no_budget'
  ytd_revenue_actual: number
  ytd_revenue_budget: number | null
  ytd_expense_actual: number
  ytd_expense_budget: number | null
  ytd_gross_profit_actual: number
  ytd_gross_profit_budget: number | null
  ytd_revenue_variance_pct: number | null
  ytd_expense_variance_pct: number | null
}

// ── Legacy types (kept for backward compatibility with BudgetTab.tsx) ────────

export interface MonthlyVariance {
  year: number
  month: number
  label: string

  actual_revenue_try: number
  actual_expense_try: number
  actual_gross_profit_try: number

  budget_revenue_try: number | null
  budget_expense_try: number | null
  budget_gross_profit_try: number | null

  revenue_variance_try: number | null
  expense_variance_try: number | null
  gross_profit_variance_try: number | null

  revenue_variance_pct: number | null
  expense_variance_pct: number | null
  gross_profit_variance_pct: number | null

  revenue_status: 'on_track' | 'above' | 'below' | 'no_budget'
  expense_status: 'on_track' | 'on_budget' | 'over_budget' | 'under_budget' | 'no_budget'
}

// ── Revenue category detection ────────────────────────────────────────────────

const REVENUE_CATEGORIES = new Set(['revenue', 'sales', 'income'])

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute variance: actual - budget
 */
export function computeVariance(actual: number, budget: number): number {
  return actual - budget
}

/**
 * Compute variance as percentage: (actual - budget) / budget × 100
 * Returns 0 if budget = 0.
 */
export function computeVariancePct(actual: number, budget: number): number {
  if (budget === 0) return 0
  return ((actual - budget) / Math.abs(budget)) * 100
}

/**
 * Determine if a variance is favorable.
 * For revenue categories: actual > budget (positive variance) → favorable
 * For expense categories: actual < budget (negative variance) → favorable
 */
export function isFavorableVariance(category: string, variance: number): boolean {
  const isRevenue = REVENUE_CATEGORIES.has(category.toLowerCase())
  if (isRevenue) {
    return variance >= 0
  }
  // expense: less spending is favorable
  return variance <= 0
}

/**
 * Build a single budget line from category, budget amount, and actual amount.
 */
export function buildBudgetLine(
  category: string,
  budgetTry: number,
  actualTry: number,
): BudgetLine {
  const variance_try = computeVariance(actualTry, budgetTry)
  const variance_pct = computeVariancePct(actualTry, budgetTry)
  const is_favorable = isFavorableVariance(category, variance_try)

  return {
    category,
    budget_try: budgetTry,
    actual_try: actualTry,
    variance_try,
    variance_pct,
    is_favorable,
  }
}

/**
 * Build a full budget period from arrays of budget/actual data.
 * Merges categories from both arrays — categories missing in one side default to 0.
 */
export function buildBudgetPeriod(
  period: string,
  budgetData: Array<{ category: string; amount_try: number }>,
  actualData: Array<{ category: string; amount_try: number }>,
): BudgetPeriod {
  // Index budget and actual by category
  const budgetMap: Record<string, number> = {}
  const actualMap: Record<string, number> = {}

  for (const b of budgetData) {
    budgetMap[b.category] = (budgetMap[b.category] ?? 0) + b.amount_try
  }
  for (const a of actualData) {
    actualMap[a.category] = (actualMap[a.category] ?? 0) + a.amount_try
  }

  // Union of all categories
  const allCategories = new Set([
    ...Object.keys(budgetMap),
    ...Object.keys(actualMap),
  ])

  const lines: BudgetLine[] = []
  for (const category of allCategories) {
    const bTry = budgetMap[category] ?? 0
    const aTry = actualMap[category] ?? 0
    lines.push(buildBudgetLine(category, bTry, aTry))
  }

  // Aggregate revenue and expense totals
  let total_budget_revenue = 0
  let total_actual_revenue = 0
  let total_budget_expenses = 0
  let total_actual_expenses = 0

  for (const line of lines) {
    if (REVENUE_CATEGORIES.has(line.category.toLowerCase())) {
      total_budget_revenue += line.budget_try
      total_actual_revenue += line.actual_try
    } else {
      total_budget_expenses += line.budget_try
      total_actual_expenses += line.actual_try
    }
  }

  const budget_net_income = total_budget_revenue - total_budget_expenses
  const actual_net_income = total_actual_revenue - total_actual_expenses
  const net_income_variance_try = computeVariance(actual_net_income, budget_net_income)
  const net_income_variance_pct = computeVariancePct(actual_net_income, budget_net_income)
  const is_net_income_favorable = actual_net_income >= budget_net_income

  return {
    period,
    lines,
    total_budget_revenue,
    total_actual_revenue,
    total_budget_expenses,
    total_actual_expenses,
    budget_net_income,
    actual_net_income,
    net_income_variance_try,
    net_income_variance_pct,
    is_net_income_favorable,
  }
}

/**
 * Compute YTD budget vs actual by aggregating across all given periods.
 */
export function computeYtdVariance(periods: BudgetPeriod[]): {
  ytd_budget_revenue: number
  ytd_actual_revenue: number
  ytd_budget_expenses: number
  ytd_actual_expenses: number
  ytd_revenue_variance_pct: number
  ytd_expense_variance_pct: number
  ytd_net_income_variance_pct: number
} {
  let ytd_budget_revenue = 0
  let ytd_actual_revenue = 0
  let ytd_budget_expenses = 0
  let ytd_actual_expenses = 0

  for (const p of periods) {
    ytd_budget_revenue += p.total_budget_revenue
    ytd_actual_revenue += p.total_actual_revenue
    ytd_budget_expenses += p.total_budget_expenses
    ytd_actual_expenses += p.total_actual_expenses
  }

  const ytd_budget_net = ytd_budget_revenue - ytd_budget_expenses
  const ytd_actual_net = ytd_actual_revenue - ytd_actual_expenses

  return {
    ytd_budget_revenue,
    ytd_actual_revenue,
    ytd_budget_expenses,
    ytd_actual_expenses,
    ytd_revenue_variance_pct: computeVariancePct(ytd_actual_revenue, ytd_budget_revenue),
    ytd_expense_variance_pct: computeVariancePct(ytd_actual_expenses, ytd_budget_expenses),
    ytd_net_income_variance_pct: computeVariancePct(ytd_actual_net, ytd_budget_net),
  }
}

/**
 * Find the budget line with the largest unfavorable variance (by absolute value).
 * Returns null if there are no unfavorable lines or lines is empty.
 */
export function findLargestVariance(lines: BudgetLine[]): BudgetLine | null {
  const unfavorable = lines.filter(l => !l.is_favorable)
  if (unfavorable.length === 0) return null

  let largest = unfavorable[0]
  for (let i = 1; i < unfavorable.length; i++) {
    if (Math.abs(unfavorable[i].variance_try) > Math.abs(largest.variance_try)) {
      largest = unfavorable[i]
    }
  }
  return largest
}

/**
 * Find categories that are more than thresholdPct% over budget (unfavorable).
 * Default threshold: 10%
 */
export function findOverBudgetCategories(
  lines: BudgetLine[],
  thresholdPct = 10,
): BudgetLine[] {
  return lines.filter(
    l => !l.is_favorable && Math.abs(l.variance_pct) > thresholdPct,
  )
}

/**
 * Classify overall budget performance based on actual vs budget net income.
 * excellent:        actual ≥ budget × 1.10
 * on_track:         actual ≥ budget × 0.95
 * slight_miss:      actual ≥ budget × 0.85
 * miss:             actual ≥ budget × 0.70
 * significant_miss: actual < budget × 0.70
 * no_budget:        budget net income = 0
 */
export function classifyBudgetPerformance(
  budgetNetIncome: number,
  actualNetIncome: number,
): 'excellent' | 'on_track' | 'slight_miss' | 'miss' | 'significant_miss' | 'no_budget' {
  if (budgetNetIncome === 0) return 'no_budget'
  if (actualNetIncome >= budgetNetIncome * 1.10) return 'excellent'
  if (actualNetIncome >= budgetNetIncome * 0.95) return 'on_track'
  if (actualNetIncome >= budgetNetIncome * 0.85) return 'slight_miss'
  if (actualNetIncome >= budgetNetIncome * 0.70) return 'miss'
  return 'significant_miss'
}

/**
 * Derive an implicit budget from prior period actuals by applying a growth rate.
 * Default growth rate: 5%
 */
export function deriveBudgetFromPrior(
  priorActuals: Array<{ category: string; amount_try: number }>,
  growthRatePct = 5,
): Array<{ category: string; amount_try: number }> {
  const multiplier = 1 + growthRatePct / 100
  return priorActuals.map(row => ({
    category: row.category,
    amount_try: row.amount_try * multiplier,
  }))
}

/**
 * Compute month-over-month budget attainment trend.
 * Compares net income variance_pct of last period vs first period.
 * improving:           last period variance_pct better than first by >5pp
 * declining:           last period variance_pct worse by >5pp
 * stable:              difference within 5pp
 * insufficient_data:   fewer than 2 periods
 */
export function computeBudgetTrend(
  periods: BudgetPeriod[],
): 'improving' | 'declining' | 'stable' | 'insufficient_data' {
  if (periods.length < 2) return 'insufficient_data'

  const first = periods[0]
  const last = periods[periods.length - 1]

  const firstPct = first.net_income_variance_pct
  const lastPct = last.net_income_variance_pct

  const diff = lastPct - firstPct

  if (diff > 5) return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

/**
 * Compute run rate: project full-year based on YTD actuals.
 * run_rate_revenue  = (ytd_actual_revenue / months_elapsed) × 12
 * run_rate_expenses = (ytd_actual_expenses / months_elapsed) × 12
 */
export function computeRunRate(
  ytdActualRevenue: number,
  ytdActualExpenses: number,
  monthsElapsed: number,
): { run_rate_revenue: number; run_rate_expenses: number; run_rate_net_income: number } {
  const safeMonths = monthsElapsed > 0 ? monthsElapsed : 1
  const run_rate_revenue = (ytdActualRevenue / safeMonths) * 12
  const run_rate_expenses = (ytdActualExpenses / safeMonths) * 12
  const run_rate_net_income = run_rate_revenue - run_rate_expenses
  return { run_rate_revenue, run_rate_expenses, run_rate_net_income }
}

// ── DB Service ────────────────────────────────────────────────────────────────

/** Expense categories tracked for budget analysis */
const EXPENSE_CATEGORIES = [
  'salary',
  'rent',
  'software',
  'marketing',
  'logistics',
  'general',
  'other',
]

/** First and last day of a month as YYYY-MM-DD strings */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

export class BudgetVarianceService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<BudgetVarianceReport> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const currentPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

    const { from: monthFrom, to: monthTo } = monthRange(currentYear, currentMonth)

    // Prior month for deriving budget
    const priorDate = new Date(currentYear, currentMonth - 2, 1)
    const priorYear = priorDate.getFullYear()
    const priorMonth = priorDate.getMonth() + 1
    const { from: priorFrom, to: priorTo } = monthRange(priorYear, priorMonth)

    // YTD start
    const ytdFrom = `${currentYear}-01-01`

    // ── Fetch in parallel ──────────────────────────────────────────────────────
    const [
      salesResult,
      expensesResult,
      budgetResult,
      priorSalesResult,
      priorExpensesResult,
      ytdSalesResult,
      ytdExpensesResult,
    ] = await Promise.allSettled([
      // Current month sales
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', monthFrom)
        .lte('sale_date', monthTo),

      // Current month expenses by category
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', monthFrom)
        .lte('expense_date', monthTo),

      // Try to fetch from company_budgets
      this.supabase
        .from('company_budgets')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .eq('period', currentPeriod),

      // Prior month sales (for derived budget)
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', priorFrom)
        .lte('sale_date', priorTo),

      // Prior month expenses by category (for derived budget)
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', priorFrom)
        .lte('expense_date', priorTo),

      // YTD sales
      this.supabase
        .from('sales')
        .select('total_try, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', monthTo),

      // YTD expenses
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', monthTo),
    ])

    // ── Actual revenue (current month) ─────────────────────────────────────────
    let actualRevenue = 0
    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        actualRevenue += Number(row.total_try) || 0
      }
    }

    // ── Actual expenses by category (current month) ────────────────────────────
    const actualExpenseMap: Record<string, number> = {}
    if (expensesResult.status === 'fulfilled' && expensesResult.value?.data) {
      for (const row of expensesResult.value.data) {
        const cat = (row.expense_type as string) || 'other'
        actualExpenseMap[cat] = (actualExpenseMap[cat] ?? 0) + (Number(row.amount_try) || 0)
      }
    }

    // COGS: from purchases or estimated at 40% of revenue if no purchase data
    if (!actualExpenseMap['cogs']) {
      actualExpenseMap['cogs'] = actualRevenue * 0.4
    }

    // ── Try explicit budget from company_budgets ────────────────────────────────
    let is_using_derived_budget = false
    let budgetData: Array<{ category: string; amount_try: number }> = []

    const budgetHasData =
      budgetResult.status === 'fulfilled' &&
      !budgetResult.value?.error &&
      Array.isArray(budgetResult.value?.data) &&
      budgetResult.value.data.length > 0

    if (budgetHasData && budgetResult.status === 'fulfilled') {
      budgetData = (budgetResult.value.data as Array<{ category: string; amount_try: number }>).map(
        r => ({ category: r.category, amount_try: Number(r.amount_try) || 0 }),
      )
    } else {
      // Fall back: derive budget from prior month actuals × 1.05
      is_using_derived_budget = true

      let priorRevenue = 0
      if (priorSalesResult.status === 'fulfilled' && priorSalesResult.value?.data) {
        for (const row of priorSalesResult.value.data) {
          priorRevenue += Number(row.total_try) || 0
        }
      }

      const priorExpenseMap: Record<string, number> = {}
      if (priorExpensesResult.status === 'fulfilled' && priorExpensesResult.value?.data) {
        for (const row of priorExpensesResult.value.data) {
          const cat = (row.expense_type as string) || 'other'
          priorExpenseMap[cat] = (priorExpenseMap[cat] ?? 0) + (Number(row.amount_try) || 0)
        }
      }

      const priorActuals: Array<{ category: string; amount_try: number }> = [
        { category: 'revenue', amount_try: priorRevenue },
        ...EXPENSE_CATEGORIES.map(cat => ({
          category: cat,
          amount_try: priorExpenseMap[cat] ?? 0,
        })),
        { category: 'cogs', amount_try: priorExpenseMap['cogs'] ?? priorRevenue * 0.4 },
      ]

      budgetData = deriveBudgetFromPrior(priorActuals, 5)
    }

    // ── Build actual data array ────────────────────────────────────────────────
    const actualData: Array<{ category: string; amount_try: number }> = [
      { category: 'revenue', amount_try: actualRevenue },
      ...Object.entries(actualExpenseMap).map(([cat, amt]) => ({
        category: cat,
        amount_try: amt,
      })),
    ]

    // ── Build current period ───────────────────────────────────────────────────
    const current_period = buildBudgetPeriod(currentPeriod, budgetData, actualData)

    // ── YTD data ───────────────────────────────────────────────────────────────
    let ytdRevenue = 0
    if (ytdSalesResult.status === 'fulfilled' && ytdSalesResult.value?.data) {
      for (const row of ytdSalesResult.value.data) {
        ytdRevenue += Number(row.total_try) || 0
      }
    }

    let ytdExpenses = 0
    if (ytdExpensesResult.status === 'fulfilled' && ytdExpensesResult.value?.data) {
      for (const row of ytdExpensesResult.value.data) {
        ytdExpenses += Number(row.amount_try) || 0
      }
    }

    const ytdBudgetRevenue = budgetData
      .filter(b => REVENUE_CATEGORIES.has(b.category.toLowerCase()))
      .reduce((s, b) => s + b.amount_try, 0) * currentMonth

    const ytdBudgetExpenses = budgetData
      .filter(b => !REVENUE_CATEGORIES.has(b.category.toLowerCase()))
      .reduce((s, b) => s + b.amount_try, 0) * currentMonth

    const ytdPeriods: BudgetPeriod[] = [
      {
        period: `${currentYear}-ytd`,
        lines: [],
        total_budget_revenue: ytdBudgetRevenue,
        total_actual_revenue: ytdRevenue,
        total_budget_expenses: ytdBudgetExpenses,
        total_actual_expenses: ytdExpenses,
        budget_net_income: ytdBudgetRevenue - ytdBudgetExpenses,
        actual_net_income: ytdRevenue - ytdExpenses,
        net_income_variance_try: computeVariance(
          ytdRevenue - ytdExpenses,
          ytdBudgetRevenue - ytdBudgetExpenses,
        ),
        net_income_variance_pct: computeVariancePct(
          ytdRevenue - ytdExpenses,
          ytdBudgetRevenue - ytdBudgetExpenses,
        ),
        is_net_income_favorable: ytdRevenue - ytdExpenses >= ytdBudgetRevenue - ytdBudgetExpenses,
      },
    ]

    const ytd = computeYtdVariance(ytdPeriods)

    // ── Run rate ───────────────────────────────────────────────────────────────
    const run_rate = computeRunRate(ytdRevenue, ytdExpenses, currentMonth)

    // ── Performance and trend ──────────────────────────────────────────────────
    const performance = classifyBudgetPerformance(
      current_period.budget_net_income,
      current_period.actual_net_income,
    )

    // Trend: we only have current period so use the single period
    const trend = computeBudgetTrend([current_period])

    // ── Legacy fields for BudgetTab.tsx backward compatibility ────────────────
    const ytdGrossProfit = ytdRevenue - ytdExpenses
    const ytdBudgetGrossProfit = ytdBudgetRevenue > 0 || ytdBudgetExpenses > 0
      ? ytdBudgetRevenue - ytdBudgetExpenses
      : null

    const has_any_budget = !is_using_derived_budget

    // overall_status: simplified from current period
    let overall_status: 'on_track' | 'at_risk' | 'over_budget' | 'no_budget' = 'no_budget'
    if (!is_using_derived_budget) {
      const expOverBudget = current_period.total_actual_expenses > current_period.total_budget_expenses * 1.15
      const expAtRisk = current_period.total_actual_expenses > current_period.total_budget_expenses * 1.05
      const revAtRisk = current_period.total_actual_revenue < current_period.total_budget_revenue * 0.95

      if (expOverBudget) overall_status = 'over_budget'
      else if (expAtRisk || revAtRisk) overall_status = 'at_risk'
      else overall_status = 'on_track'
    }

    // Build legacy months array (single month for now)
    const legacyMonth: MonthlyVariance = {
      year:  currentYear,
      month: currentMonth,
      label: new Date(currentYear, currentMonth - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
      actual_revenue_try: current_period.total_actual_revenue,
      actual_expense_try: current_period.total_actual_expenses,
      actual_gross_profit_try: current_period.actual_net_income,
      budget_revenue_try: is_using_derived_budget ? null : current_period.total_budget_revenue,
      budget_expense_try: is_using_derived_budget ? null : current_period.total_budget_expenses,
      budget_gross_profit_try: is_using_derived_budget ? null : current_period.budget_net_income,
      revenue_variance_try: is_using_derived_budget ? null : current_period.total_actual_revenue - current_period.total_budget_revenue,
      expense_variance_try: is_using_derived_budget ? null : current_period.total_actual_expenses - current_period.total_budget_expenses,
      gross_profit_variance_try: is_using_derived_budget ? null : current_period.actual_net_income - current_period.budget_net_income,
      revenue_variance_pct: is_using_derived_budget ? null : computeVariancePct(current_period.total_actual_revenue, current_period.total_budget_revenue),
      expense_variance_pct: is_using_derived_budget ? null : computeVariancePct(current_period.total_actual_expenses, current_period.total_budget_expenses),
      gross_profit_variance_pct: is_using_derived_budget ? null : computeVariancePct(current_period.actual_net_income, current_period.budget_net_income),
      revenue_status: is_using_derived_budget ? 'no_budget' : (
        current_period.total_actual_revenue > current_period.total_budget_revenue * 1.05 ? 'above' :
        current_period.total_actual_revenue < current_period.total_budget_revenue * 0.95 ? 'below' :
        'on_track'
      ),
      expense_status: is_using_derived_budget ? 'no_budget' : (
        current_period.total_actual_expenses > current_period.total_budget_expenses * 1.1 ? 'over_budget' :
        current_period.total_actual_expenses < current_period.total_budget_expenses * 0.9 ? 'under_budget' :
        'on_budget'
      ),
    }

    return {
      period: currentPeriod,
      current_period,
      ytd,
      performance,
      trend,
      run_rate,
      largest_variance: findLargestVariance(current_period.lines),
      over_budget_categories: findOverBudgetCategories(current_period.lines),
      is_using_derived_budget,

      // Legacy fields
      months: [legacyMonth],
      has_any_budget,
      overall_status,
      ytd_revenue_actual:     ytdRevenue,
      ytd_revenue_budget:     ytdBudgetRevenue > 0 ? ytdBudgetRevenue : null,
      ytd_expense_actual:     ytdExpenses,
      ytd_expense_budget:     ytdBudgetExpenses > 0 ? ytdBudgetExpenses : null,
      ytd_gross_profit_actual: ytdGrossProfit,
      ytd_gross_profit_budget: ytdBudgetGrossProfit,
      ytd_revenue_variance_pct: ytdBudgetRevenue > 0
        ? computeVariancePct(ytdRevenue, ytdBudgetRevenue)
        : null,
      ytd_expense_variance_pct: ytdBudgetExpenses > 0
        ? computeVariancePct(ytdExpenses, ytdBudgetExpenses)
        : null,
    }
  }
}
