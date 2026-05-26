// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/budget-variance.service.ts
//
// Budget vs Actuals variance analysis.
//
// Fetches last 12 months of actuals from expenses (expense_date) and
// sales (sale_date), then joins with monthly_budgets for same company/period.
//
// Pure helpers are exported for unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MonthlyVariance {
  year: number
  month: number
  label: string               // 'Ocak 2026'

  // Actuals (from sales/expenses)
  actual_revenue_try: number
  actual_expense_try: number
  actual_gross_profit_try: number

  // Budget (from monthly_budgets, null if not set)
  budget_revenue_try: number | null
  budget_expense_try: number | null
  budget_gross_profit_try: number | null

  // Variance (actual - budget), null if no budget
  revenue_variance_try: number | null
  expense_variance_try: number | null     // positive = over budget
  gross_profit_variance_try: number | null

  // Variance % ((actual - budget) / budget × 100)
  revenue_variance_pct: number | null
  expense_variance_pct: number | null
  gross_profit_variance_pct: number | null

  // Status
  revenue_status: 'on_track' | 'above' | 'below' | 'no_budget'
  expense_status: 'on_track' | 'on_budget' | 'over_budget' | 'under_budget' | 'no_budget'
}

export interface BudgetVarianceReport {
  months: MonthlyVariance[]     // up to 12 months, newest first
  has_any_budget: boolean       // whether any budget has been set at all
  ytd_revenue_actual: number
  ytd_revenue_budget: number | null
  ytd_expense_actual: number
  ytd_expense_budget: number | null
  ytd_gross_profit_actual: number
  ytd_gross_profit_budget: number | null
  ytd_revenue_variance_pct: number | null
  ytd_expense_variance_pct: number | null
  overall_status: 'on_track' | 'at_risk' | 'over_budget' | 'no_budget'
  // on_track: all months within ±10%
  // at_risk: any month >5% under revenue OR >5% over expense
  // over_budget: >15% over expense in any month
  // no_budget: no budget set
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** Format a month key 'YYYY-MM' → Turkish label e.g. 'Ocak 2026' */
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Build list of N calendar months ending with the current month, newest first. */
function buildMonthSlots(
  now: Date,
  count: number,
): Array<{ year: number; month: number; key: string; label: string }> {
  const slots = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key, label: monthLabel(year, month) })
  }
  return slots // newest first
}

/** First and last day of a month as YYYY-MM-DD strings */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Compute variance percentage: ((actual - budget) / budget) × 100
 * Returns null if budget is null, zero, or negative.
 */
export function computeVariancePct(actual: number, budget: number | null): number | null {
  if (budget === null || budget === 0) return null
  return round2(((actual - budget) / Math.abs(budget)) * 100)
}

/**
 * Compute revenue status based on actual vs budget.
 * above: actual > budget × 1.05
 * below: actual < budget × 0.95
 * on_track: otherwise
 * no_budget: budget is null
 */
export function computeRevenueStatus(
  actual: number,
  budget: number | null,
): MonthlyVariance['revenue_status'] {
  if (budget === null) return 'no_budget'
  if (actual > budget * 1.05) return 'above'
  if (actual < budget * 0.95) return 'below'
  return 'on_track'
}

/**
 * Compute expense status based on actual vs budget.
 * over_budget: actual > budget × 1.1
 * under_budget: actual < budget × 0.9
 * on_budget: otherwise
 * no_budget: budget is null
 */
export function computeExpenseStatus(
  actual: number,
  budget: number | null,
): MonthlyVariance['expense_status'] {
  if (budget === null) return 'no_budget'
  if (actual > budget * 1.1) return 'over_budget'
  if (actual < budget * 0.9) return 'under_budget'
  return 'on_budget'
}

/**
 * Compute overall budget status across all months.
 * no_budget: no months with budget set
 * over_budget: any month with expense actual > budget × 1.15
 * at_risk: any month with revenue actual < budget × 0.95 OR expense actual > budget × 1.05
 * on_track: all months within acceptable range
 */
export function computeOverallStatus(
  months: MonthlyVariance[],
): BudgetVarianceReport['overall_status'] {
  const budgetMonths = months.filter(
    m => m.budget_revenue_try !== null || m.budget_expense_try !== null,
  )
  if (budgetMonths.length === 0) return 'no_budget'

  for (const m of budgetMonths) {
    if (
      m.budget_expense_try !== null &&
      m.actual_expense_try > m.budget_expense_try * 1.15
    ) {
      return 'over_budget'
    }
  }

  for (const m of budgetMonths) {
    const revenueAtRisk =
      m.budget_revenue_try !== null &&
      m.actual_revenue_try < m.budget_revenue_try * 0.95
    const expenseAtRisk =
      m.budget_expense_try !== null &&
      m.actual_expense_try > m.budget_expense_try * 1.05
    if (revenueAtRisk || expenseAtRisk) return 'at_risk'
  }

  return 'on_track'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BudgetVarianceService {
  /**
   * Build a full BudgetVarianceReport for the given company.
   * Uses the last 12 months of actuals and any matching budget rows.
   * YTD = current calendar year months up to current month.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<BudgetVarianceReport> {
    const slots = buildMonthSlots(now, 12)

    // Window boundaries for fetching actuals
    const oldestSlot = slots[slots.length - 1]
    const newestSlot = slots[0]
    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to: windowTo } = monthRange(newestSlot.year, newestSlot.month)

    // ── Fetch actuals (expenses + sales) and budgets in parallel ──────────────
    const [expenseResult, salesResult, budgetResult] = await Promise.allSettled([
      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      supabase
        .from('monthly_budgets')
        .select('budget_year, budget_month, revenue_target_try, expense_target_try, gross_profit_target_try')
        .eq('company_id', companyId)
        .gte('budget_year', oldestSlot.year)
        .lte('budget_year', newestSlot.year),
    ])

    // ── Build per-month buckets ───────────────────────────────────────────────
    const expenseByMonth: Record<string, number> = {}
    const revenueByMonth: Record<string, number> = {}

    for (const slot of slots) {
      expenseByMonth[slot.key] = 0
      revenueByMonth[slot.key] = 0
    }

    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7)
        if (key in expenseByMonth) {
          expenseByMonth[key] = round2(expenseByMonth[key] + (Number(row.amount_try) || 0))
        }
      }
    }

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const key = (row.sale_date as string).slice(0, 7)
        if (key in revenueByMonth) {
          revenueByMonth[key] = round2(revenueByMonth[key] + (Number(row.total_try) || 0))
        }
      }
    }

    // ── Index budget rows by year-month key ───────────────────────────────────
    interface BudgetRow {
      revenue_target_try: number | null
      expense_target_try: number | null
      gross_profit_target_try: number | null
    }
    const budgetByMonth: Record<string, BudgetRow> = {}

    if (budgetResult.status === 'fulfilled' && budgetResult.value?.data) {
      for (const row of budgetResult.value.data) {
        const key = `${row.budget_year}-${String(row.budget_month).padStart(2, '0')}`
        budgetByMonth[key] = {
          revenue_target_try: row.revenue_target_try !== null ? Number(row.revenue_target_try) : null,
          expense_target_try: row.expense_target_try !== null ? Number(row.expense_target_try) : null,
          gross_profit_target_try:
            row.gross_profit_target_try !== null ? Number(row.gross_profit_target_try) : null,
        }
      }
    }

    // ── Build months array (newest first) ─────────────────────────────────────
    const months: MonthlyVariance[] = slots.map(slot => {
      const actual_revenue_try = revenueByMonth[slot.key] ?? 0
      const actual_expense_try = expenseByMonth[slot.key] ?? 0
      const actual_gross_profit_try = round2(actual_revenue_try - actual_expense_try)

      const budgetRow = budgetByMonth[slot.key] ?? null
      const budget_revenue_try = budgetRow?.revenue_target_try ?? null
      const budget_expense_try = budgetRow?.expense_target_try ?? null
      const budget_gross_profit_try = budgetRow?.gross_profit_target_try ?? null

      const revenue_variance_try =
        budget_revenue_try !== null
          ? round2(actual_revenue_try - budget_revenue_try)
          : null
      const expense_variance_try =
        budget_expense_try !== null
          ? round2(actual_expense_try - budget_expense_try)
          : null
      const gross_profit_variance_try =
        budget_gross_profit_try !== null
          ? round2(actual_gross_profit_try - budget_gross_profit_try)
          : null

      return {
        year: slot.year,
        month: slot.month,
        label: slot.label,
        actual_revenue_try,
        actual_expense_try,
        actual_gross_profit_try,
        budget_revenue_try,
        budget_expense_try,
        budget_gross_profit_try,
        revenue_variance_try,
        expense_variance_try,
        gross_profit_variance_try,
        revenue_variance_pct: computeVariancePct(actual_revenue_try, budget_revenue_try),
        expense_variance_pct: computeVariancePct(actual_expense_try, budget_expense_try),
        gross_profit_variance_pct: computeVariancePct(
          actual_gross_profit_try,
          budget_gross_profit_try,
        ),
        revenue_status: computeRevenueStatus(actual_revenue_try, budget_revenue_try),
        expense_status: computeExpenseStatus(actual_expense_try, budget_expense_try),
      }
    })

    // ── YTD (current calendar year up to current month) ───────────────────────
    const currentYear = now.getFullYear()
    const ytdMonths = months.filter(m => m.year === currentYear)

    const ytd_revenue_actual = round2(ytdMonths.reduce((s, m) => s + m.actual_revenue_try, 0))
    const ytd_expense_actual = round2(ytdMonths.reduce((s, m) => s + m.actual_expense_try, 0))
    const ytd_gross_profit_actual = round2(ytd_revenue_actual - ytd_expense_actual)

    const hasRevenueBudget = ytdMonths.some(m => m.budget_revenue_try !== null)
    const hasExpenseBudget = ytdMonths.some(m => m.budget_expense_try !== null)

    const ytd_revenue_budget = hasRevenueBudget
      ? round2(
          ytdMonths.reduce((s, m) => s + (m.budget_revenue_try ?? 0), 0),
        )
      : null
    const ytd_expense_budget = hasExpenseBudget
      ? round2(
          ytdMonths.reduce((s, m) => s + (m.budget_expense_try ?? 0), 0),
        )
      : null
    const ytd_gross_profit_budget =
      ytd_revenue_budget !== null && ytd_expense_budget !== null
        ? round2(ytd_revenue_budget - ytd_expense_budget)
        : null

    const has_any_budget = months.some(
      m => m.budget_revenue_try !== null || m.budget_expense_try !== null,
    )

    return {
      months,
      has_any_budget,
      ytd_revenue_actual,
      ytd_revenue_budget,
      ytd_expense_actual,
      ytd_expense_budget,
      ytd_gross_profit_actual,
      ytd_gross_profit_budget,
      ytd_revenue_variance_pct: computeVariancePct(ytd_revenue_actual, ytd_revenue_budget),
      ytd_expense_variance_pct: computeVariancePct(ytd_expense_actual, ytd_expense_budget),
      overall_status: computeOverallStatus(months),
    }
  }
}
