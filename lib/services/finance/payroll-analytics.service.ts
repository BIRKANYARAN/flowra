// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/payroll-analytics.service.ts
//
// Payroll Analytics Service — tracks salary expense trends, payroll-to-revenue
// ratio, SGK compliance timeline, and headcount cost efficiency.
//
// SGK rule (Turkish law): monthly SGK premiums are due by the 26th of the
// FOLLOWING month.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface MonthlyPayrollData {
  month_key: string       // "2025-01"
  month_label: string
  salary_try: number
  revenue_try: number
  total_expenses_try: number
  payroll_ratio_pct: number | null
  payroll_growth_pct: number | null
  salary_expense_share_pct: number
  estimated_sgk_try: number
}

export interface PayrollAnalyticsReport {
  period_months: number             // analysis window
  current_month_salary_try: number
  current_payroll_ratio_pct: number | null
  payroll_ratio_status: 'lean' | 'healthy' | 'elevated' | 'high' | 'unknown'
  ytd_salary_try: number
  ytd_sgk_estimate_try: number
  avg_monthly_salary_try: number
  salary_trend: 'increasing' | 'stable' | 'decreasing' | 'insufficient_data'
  monthly_data: MonthlyPayrollData[]
  next_sgk_due_date: string | null    // next SGK payment deadline
  salary_as_largest_expense: boolean  // true if salary > any other expense_type this month
}

// ── Turkish month labels ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

// ── Pure helper: build month range ────────────────────────────────────────────

function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Pure exported functions ────────────────────────────────────────────────────

/**
 * Compute payroll ratio: salary_expenses / total_revenue × 100.
 * Returns null if total_revenue = 0.
 */
export function computePayrollRatio(
  salaryExpensesTry: number,
  totalRevenueTry: number,
): number | null {
  if (totalRevenueTry === 0) return null
  return (salaryExpensesTry / totalRevenueTry) * 100
}

/**
 * Classify payroll ratio health.
 * <20%: 'lean'  |  20–35%: 'healthy'  |  35–50%: 'elevated'  |  >50%: 'high'
 * null: 'unknown'
 */
export function classifyPayrollRatio(
  ratioPct: number | null,
): 'lean' | 'healthy' | 'elevated' | 'high' | 'unknown' {
  if (ratioPct === null) return 'unknown'
  if (ratioPct < 20)  return 'lean'
  if (ratioPct < 35)  return 'healthy'
  if (ratioPct <= 50) return 'elevated'
  return 'high'
}

/**
 * Compute month-over-month payroll growth.
 * Returns null if priorTry = 0.
 */
export function computePayrollGrowth(
  currentTry: number,
  priorTry: number,
): number | null {
  if (priorTry === 0) return null
  return ((currentTry - priorTry) / priorTry) * 100
}

/**
 * Compute salary as % of total expenses.
 * Returns 0 if totalExpensesTry = 0.
 */
export function computeSalaryExpenseShare(
  salaryTry: number,
  totalExpensesTry: number,
): number {
  if (totalExpensesTry === 0) return 0
  return (salaryTry / totalExpensesTry) * 100
}

/**
 * Compute estimated SGK employer contribution: salary_gross × 0.205
 * This is a benchmarking estimate (~20.5% employer portion), NOT a precise calculation.
 */
export function estimateSgkContribution(salaryGrossTry: number): number {
  return salaryGrossTry * 0.205
}

// ── SGK deadline helper ────────────────────────────────────────────────────────

/**
 * Determine next SGK payment deadline.
 * Turkish SGK monthly payment is due by the 26th of the following month.
 * Returns the next upcoming 26th (current month +1, or next month +1 if past 26th).
 */
function computeNextSgkDueDate(today: Date): string {
  const year  = today.getFullYear()
  const month = today.getMonth() + 1 // 1-based

  // SGK for the current month is due on the 26th of next month
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const candidate = new Date(Date.UTC(nextYear, nextMonth - 1, 26))

  // If we're already past the 26th of next month (which won't happen for current+1),
  // advance another month — but generally current+1 26th is always in the future
  // unless today > 26th of next month (impossible for a reasonable now)
  return `${candidate.getUTCFullYear()}-${String(candidate.getUTCMonth() + 1).padStart(2, '0')}-26`
}

// ── Salary trend classification ────────────────────────────────────────────────

function classifySalaryTrend(
  monthlyData: number[],
): 'increasing' | 'stable' | 'decreasing' | 'insufficient_data' {
  const nonZero = monthlyData.filter(v => v > 0)
  if (nonZero.length < 3) return 'insufficient_data'

  // Compare last 3 months average vs prior 3 months average
  const last3  = monthlyData.slice(-3)
  const prior3 = monthlyData.slice(-6, -3)

  const last3Avg  = last3.reduce((s, v) => s + v, 0) / last3.length
  const prior3Avg = prior3.length > 0
    ? prior3.reduce((s, v) => s + v, 0) / prior3.length
    : 0

  if (prior3Avg === 0) return 'insufficient_data'

  const changePct = ((last3Avg - prior3Avg) / prior3Avg) * 100

  if (changePct > 5)   return 'increasing'
  if (changePct < -5)  return 'decreasing'
  return 'stable'
}

// ── Service class ──────────────────────────────────────────────────────────────

export class PayrollAnalyticsService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    periodMonths = 12,
  ): Promise<PayrollAnalyticsReport> {
    const now     = new Date()
    const today   = now

    // Build month slots: newest first
    const slots: Array<{ year: number; month: number; key: string; label: string }> = []
    for (let i = 0; i < periodMonths; i++) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const year  = d.getFullYear()
      const month = d.getMonth() + 1
      const key   = `${year}-${String(month).padStart(2, '0')}`
      slots.push({ year, month, key, label: monthLabel(year, month) })
    }

    const oldestSlot = slots[slots.length - 1]
    const newestSlot = slots[0]
    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to:   windowTo   } = monthRange(newestSlot.year, newestSlot.month)

    // ── Queries ─────────────────────────────────────────────────────────────

    const [salaryResult, revenueResult, allExpenseResult, expenseCatResult] = await Promise.allSettled([
      // Salary expenses (category = 'salary')
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .eq('category', 'salary')
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Revenue per month from sales
      this.supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      // Total expenses per month (all categories)
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Current month expenses by category (to check if salary is largest)
      this.supabase
        .from('expenses')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', monthRange(newestSlot.year, newestSlot.month).from)
        .lte('expense_date', monthRange(newestSlot.year, newestSlot.month).to),
    ])

    // ── Aggregate by month key ────────────────────────────────────────────

    const salaryByMonth   = new Map<string, number>()
    const revenueByMonth  = new Map<string, number>()
    const expensesByMonth = new Map<string, number>()

    if (salaryResult.status === 'fulfilled' && salaryResult.value?.data) {
      for (const row of salaryResult.value.data) {
        if (!row.expense_date) continue
        const mk  = (row.expense_date as string).slice(0, 7)
        salaryByMonth.set(mk, (salaryByMonth.get(mk) ?? 0) + (Number(row.amount_try) || 0))
      }
    }

    if (revenueResult.status === 'fulfilled' && revenueResult.value?.data) {
      for (const row of revenueResult.value.data) {
        if (!row.sale_date) continue
        const mk = (row.sale_date as string).slice(0, 7)
        revenueByMonth.set(mk, (revenueByMonth.get(mk) ?? 0) + (Number(row.total_try) || 0))
      }
    }

    if (allExpenseResult.status === 'fulfilled' && allExpenseResult.value?.data) {
      for (const row of allExpenseResult.value.data) {
        if (!row.expense_date) continue
        const mk = (row.expense_date as string).slice(0, 7)
        expensesByMonth.set(mk, (expensesByMonth.get(mk) ?? 0) + (Number(row.amount_try) || 0))
      }
    }

    // ── Check if salary is largest expense category this month ────────────

    let salaryAsLargestExpense = false
    if (expenseCatResult.status === 'fulfilled' && expenseCatResult.value?.data) {
      const catTotals = new Map<string, number>()
      for (const row of expenseCatResult.value.data) {
        const cat = (row.category as string | null) ?? 'other'
        catTotals.set(cat, (catTotals.get(cat) ?? 0) + (Number(row.amount_try) || 0))
      }
      const salaryTotal = catTotals.get('salary') ?? 0
      if (salaryTotal > 0) {
        const maxOther = Math.max(
          ...Array.from(catTotals.entries())
            .filter(([k]) => k !== 'salary')
            .map(([, v]) => v),
          0,
        )
        salaryAsLargestExpense = salaryTotal >= maxOther
      }
    }

    // ── Build monthly data (oldest first for calculations) ─────────────────

    const slotsChronological = [...slots].reverse() // oldest first
    const monthlyData: MonthlyPayrollData[] = []
    let priorSalary: number | null = null

    for (const slot of slotsChronological) {
      const salary        = salaryByMonth.get(slot.key)   ?? 0
      const revenue       = revenueByMonth.get(slot.key)  ?? 0
      const totalExpenses = expensesByMonth.get(slot.key) ?? 0

      const payrollRatioPct       = computePayrollRatio(salary, revenue)
      const payrollGrowthPct      = priorSalary !== null
        ? computePayrollGrowth(salary, priorSalary)
        : null
      const salaryExpenseSharePct = computeSalaryExpenseShare(salary, totalExpenses)
      const estimatedSgkTry       = estimateSgkContribution(salary)

      monthlyData.push({
        month_key:               slot.key,
        month_label:             slot.label,
        salary_try:              salary,
        revenue_try:             revenue,
        total_expenses_try:      totalExpenses,
        payroll_ratio_pct:       payrollRatioPct,
        payroll_growth_pct:      payrollGrowthPct,
        salary_expense_share_pct: salaryExpenseSharePct,
        estimated_sgk_try:       estimatedSgkTry,
      })

      priorSalary = salary
    }

    // ── Aggregate KPIs ────────────────────────────────────────────────────

    const currentYear = now.getFullYear()
    const ytdMonths   = monthlyData.filter(m => m.month_key.startsWith(`${currentYear}-`))

    const ytdSalaryTry     = ytdMonths.reduce((s, m) => s + m.salary_try, 0)
    const ytdSgkEstimate   = ytdMonths.reduce((s, m) => s + m.estimated_sgk_try, 0)
    const nonZeroSalary    = monthlyData.filter(m => m.salary_try > 0)
    const avgMonthlySalary = nonZeroSalary.length > 0
      ? nonZeroSalary.reduce((s, m) => s + m.salary_try, 0) / nonZeroSalary.length
      : 0

    // Current month = most recent slot
    const currentData      = monthlyData[monthlyData.length - 1]
    const currentSalary    = currentData?.salary_try ?? 0
    const currentRevenue   = currentData?.revenue_try ?? 0
    const currentRatioPct  = computePayrollRatio(currentSalary, currentRevenue)

    // Salary trend (from chronological monthly amounts)
    const salaryAmounts  = monthlyData.map(m => m.salary_try)
    const salaryTrend    = classifySalaryTrend(salaryAmounts)

    // Next SGK due date
    const hasSalaryData    = monthlyData.some(m => m.salary_try > 0)
    const nextSgkDueDate   = hasSalaryData ? computeNextSgkDueDate(today) : null

    // Return monthly data newest-first (matching slot order)
    const monthlyDataNewestFirst = [...monthlyData].reverse()

    return {
      period_months:               periodMonths,
      current_month_salary_try:    currentSalary,
      current_payroll_ratio_pct:   currentRatioPct,
      payroll_ratio_status:        classifyPayrollRatio(currentRatioPct),
      ytd_salary_try:              ytdSalaryTry,
      ytd_sgk_estimate_try:        ytdSgkEstimate,
      avg_monthly_salary_try:      avgMonthlySalary,
      salary_trend:                salaryTrend,
      monthly_data:                monthlyDataNewestFirst,
      next_sgk_due_date:           nextSgkDueDate,
      salary_as_largest_expense:   salaryAsLargestExpense,
    }
  }
}

// ── Re-export TR_MONTHS for convenience ───────────────────────────────────────
export { TR_MONTHS }
