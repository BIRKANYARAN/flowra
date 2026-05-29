// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/payroll-analytics.service.ts
//
// Payroll & Compensation Analytics Service
//
// Tracks personnel costs (maaş/huzur hakkı/SGK) as % of revenue,
// benchmarks against Turkish SME norms, and provides headcount cost
// efficiency metrics.
//
// SGK rule (Turkish law): monthly SGK premiums are due by the 26th of the
// FOLLOWING month.
//
// Pure exported functions (testable):
//   computePersonnelCostRatio, classifyPersonnelCostEfficiency,
//   computeSgkEmployerContribution, computeNetSalaryFromGross,
//   computeGrossToNetRatio, computeTotalEmploymentCostMultiplier,
//   computeRevenuePerHeadcount, computePersonnelCostPerHead,
//   computePersonnelCostTrend, classifyPersonnelCostTrend
//
// Legacy exports (backward-compat):
//   computePayrollRatio, classifyPayrollRatio,
//   computePayrollGrowth, computeSalaryExpenseShare, estimateSgkContribution
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NEW: Pure computation functions — personnel cost analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Personnel cost ratio: total personnel cost / total revenue × 100.
 * Returns null if totalRevenue === 0.
 */
export function computePersonnelCostRatio(
  totalPersonnelCost: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (totalPersonnelCost / totalRevenue) * 100
}

/**
 * Classify personnel cost efficiency against Turkish SME benchmarks.
 * insufficient_data: null
 * excellent:  <= 15%
 * good:       <= 25%
 * acceptable: <= 35%
 * high:       <= 50%
 * excessive:  > 50%
 */
export function classifyPersonnelCostEfficiency(
  ratioPct: number | null,
): 'excellent' | 'good' | 'acceptable' | 'high' | 'excessive' | 'insufficient_data' {
  if (ratioPct === null) return 'insufficient_data'
  if (ratioPct <= 15) return 'excellent'
  if (ratioPct <= 25) return 'good'
  if (ratioPct <= 35) return 'acceptable'
  if (ratioPct <= 50) return 'high'
  return 'excessive'
}

/**
 * SGK employer contribution: grossSalary × sgkRate.
 * Default sgkRate = 0.2025 (20.25% Turkish employer SGK rate for 2025).
 * Never negative.
 */
export function computeSgkEmployerContribution(
  grossSalary: number,
  sgkRate = 0.2025,
): number {
  const result = grossSalary * sgkRate
  return Math.max(0, result)
}

/**
 * Net salary from gross.
 * net = grossSalary × (1 - incomeTaxRate - sgkEmployeeRate)
 * Clamped to [0, grossSalary].
 */
export function computeNetSalaryFromGross(
  grossSalary: number,
  incomeTaxRate = 0.15,
  sgkEmployeeRate = 0.14,
): number {
  const net = grossSalary * (1 - incomeTaxRate - sgkEmployeeRate)
  return Math.min(Math.max(net, 0), grossSalary)
}

/**
 * Gross-to-net ratio: (netSalary / grossSalary) × 100.
 * Returns null if grossSalary === 0.
 */
export function computeGrossToNetRatio(
  netSalary: number,
  grossSalary: number,
): number | null {
  if (grossSalary === 0) return null
  return (netSalary / grossSalary) * 100
}

/**
 * Total employment cost multiplier: 1 + sgkEmployerRate.
 * Total cost to company = grossSalary × multiplier.
 * Always >= 1.
 */
export function computeTotalEmploymentCostMultiplier(
  grossSalary: number,
  sgkEmployerRate = 0.2025,
): number {
  void grossSalary  // parameter available for future per-salary adjustments
  return Math.max(1, 1 + sgkEmployerRate)
}

/**
 * Revenue per headcount: totalRevenue / headcount.
 * Returns null if headcount === 0.
 */
export function computeRevenuePerHeadcount(
  totalRevenue: number,
  headcount: number,
): number | null {
  if (headcount === 0) return null
  return totalRevenue / headcount
}

/**
 * Personnel cost per headcount: totalPersonnelCost / headcount.
 * Returns null if headcount === 0.
 */
export function computePersonnelCostPerHead(
  totalPersonnelCost: number,
  headcount: number,
): number | null {
  if (headcount === 0) return null
  return totalPersonnelCost / headcount
}

/**
 * Month-over-month personnel cost trend (%).
 * ((currentMonthCost - priorMonthCost) / priorMonthCost) × 100.
 * Returns null if priorMonthCost === 0.
 */
export function computePersonnelCostTrend(
  currentMonthCost: number,
  priorMonthCost: number,
): number | null {
  if (priorMonthCost === 0) return null
  return ((currentMonthCost - priorMonthCost) / priorMonthCost) * 100
}

/**
 * Classify personnel cost trend direction.
 * insufficient_data: null
 * decreasing:      < -5%
 * stable:          -5% to +5%
 * growing:         +5% to +15%
 * rapidly_growing: > +15%
 */
export function classifyPersonnelCostTrend(
  changePct: number | null,
): 'decreasing' | 'stable' | 'growing' | 'rapidly_growing' | 'insufficient_data' {
  if (changePct === null) return 'insufficient_data'
  if (changePct < -5)  return 'decreasing'
  if (changePct <= 5)  return 'stable'
  if (changePct <= 15) return 'growing'
  return 'rapidly_growing'
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEGACY: Backward-compatible pure functions (used by existing client + tests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

// ── Re-export TR_MONTHS for convenience ───────────────────────────────────────
export { TR_MONTHS }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PayrollAnalyticsService — legacy monthly breakdown + new personnel cost report
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Personnel expense categories tracked
const PERSONNEL_CATEGORIES = new Set([
  'salary', 'maaş', 'personnel', 'personel',
  'sgk', 'huzur_hakki', 'huzur hakki', 'compensation', 'board_fee',
])

// SGK / huzur hakkı specific categories
const HUZUR_CATEGORIES = new Set(['huzur_hakki', 'huzur hakki', 'board_fee'])
const SGK_CATEGORIES   = new Set(['sgk'])

// Report shape returned by getReport
export interface PersonnelCostReport {
  current_month: {
    total_personnel_cost: number
    breakdown: {
      gross_salaries: number
      sgk_employer: number
      huzur_hakki: number
      other_personnel: number
    }
    revenue_this_month: number
    personnel_cost_ratio_pct: number | null
    efficiency: ReturnType<typeof classifyPersonnelCostEfficiency>
    cost_trend_pct: number | null
    trend_class: ReturnType<typeof classifyPersonnelCostTrend>
  }
  ytd: {
    total_personnel_cost: number
    avg_monthly_cost: number
    personnel_cost_ratio_pct: number | null
  }
  benchmarks: {
    excellent_threshold: 15
    good_threshold: 25
    acceptable_threshold: 35
    industry: 'Turkish SME'
  }
  sgk_reference: {
    employer_rate: number
    employee_rate: number
    min_wage_try: number
    typical_gross_to_net_pct: number
  }
}

export class PayrollAnalyticsService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Legacy method — returns month-by-month breakdown for the existing client.
   */
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

  /**
   * Get full personnel cost analytics report.
   * Includes current month breakdown, YTD, benchmarks, and SGK reference.
   */
  async getPersonnelReport(companyId: string): Promise<PersonnelCostReport> {
    const now          = new Date()
    const currentYear  = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // ── Date bounds ──────────────────────────────────────────────────────────
    const { from: currFrom, to: currTo } = monthRange(currentYear, currentMonth)

    // Prior month
    const priorDate   = new Date(currentYear, currentMonth - 2, 1)
    const priorYear   = priorDate.getFullYear()
    const priorMonth  = priorDate.getMonth() + 1
    const { from: priorFrom, to: priorTo } = monthRange(priorYear, priorMonth)

    // YTD: Jan 1 to today
    const ytdFrom = `${currentYear}-01-01`
    const ytdTo   = now.toISOString().slice(0, 10)

    // ── Fetch current month personnel expenses ───────────────────────────────
    const [currExpRes, priorExpRes, ytdExpRes, currSalesRes, ytdSalesRes] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', currFrom)
        .lte('expense_date', currTo),

      this.supabase
        .from('expenses')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', priorFrom)
        .lte('expense_date', priorTo),

      this.supabase
        .from('expenses')
        .select('category, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', ytdTo),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', currFrom)
        .lte('sale_date', currTo)
        .not('payment_status', 'eq', 'cancelled'),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo)
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Aggregate helpers ────────────────────────────────────────────────────
    function sumPersonnel(rows: Array<{ category: string | null; amount_try: number }>) {
      let grossSalaries    = 0
      let sgkEmployer      = 0
      let huzurHakki       = 0
      let otherPersonnel   = 0

      for (const row of rows) {
        const cat    = String(row.category ?? '').toLowerCase()
        const amount = Number(row.amount_try) || 0

        if (!PERSONNEL_CATEGORIES.has(cat)) continue

        if (SGK_CATEGORIES.has(cat)) {
          sgkEmployer += amount
        } else if (HUZUR_CATEGORIES.has(cat)) {
          huzurHakki += amount
        } else if (cat === 'salary' || cat === 'maaş' || cat === 'personnel' || cat === 'personel') {
          grossSalaries += amount
        } else {
          otherPersonnel += amount
        }
      }

      // If no explicit SGK rows, estimate from gross salaries
      if (sgkEmployer === 0 && grossSalaries > 0) {
        sgkEmployer = computeSgkEmployerContribution(grossSalaries)
      }

      const total = grossSalaries + sgkEmployer + huzurHakki + otherPersonnel
      return { total, grossSalaries, sgkEmployer, huzurHakki, otherPersonnel }
    }

    // Current month
    const currRows = currExpRes.status === 'fulfilled' ? (currExpRes.value?.data ?? []) : []
    const currData = sumPersonnel(currRows as Array<{ category: string | null; amount_try: number }>)

    // Prior month (for trend)
    const priorRows = priorExpRes.status === 'fulfilled' ? (priorExpRes.value?.data ?? []) : []
    const priorData = sumPersonnel(priorRows as Array<{ category: string | null; amount_try: number }>)

    // Current month revenue
    const currRevenue = currSalesRes.status === 'fulfilled'
      ? ((currSalesRes.value?.data ?? []) as Array<{ total_try: number }>)
          .reduce((s, r) => s + (Number(r.total_try) || 0), 0)
      : 0

    // YTD personnel cost
    const ytdRows = ytdExpRes.status === 'fulfilled' ? (ytdExpRes.value?.data ?? []) : []
    const ytdData = sumPersonnel(ytdRows as Array<{ category: string | null; amount_try: number }>)

    // YTD revenue
    const ytdRevenue = ytdSalesRes.status === 'fulfilled'
      ? ((ytdSalesRes.value?.data ?? []) as Array<{ total_try: number }>)
          .reduce((s, r) => s + (Number(r.total_try) || 0), 0)
      : 0

    // YTD average monthly cost (months elapsed so far this year)
    const monthsElapsed = currentMonth
    const avgMonthlyCost = monthsElapsed > 0 ? ytdData.total / monthsElapsed : 0

    // Ratios & trend
    const costRatioPct = computePersonnelCostRatio(currData.total, currRevenue)
    const trendPct     = computePersonnelCostTrend(currData.total, priorData.total)
    const ytdRatioPct  = computePersonnelCostRatio(ytdData.total, ytdRevenue)

    // Typical gross-to-net at minimum wage: 22104 gross → net = 22104 × (1 - 0.15 - 0.14)
    const minWageGross = 22104
    const minWageNet   = computeNetSalaryFromGross(minWageGross)
    const grossToNetPct = computeGrossToNetRatio(minWageNet, minWageGross) ?? 71

    return {
      current_month: {
        total_personnel_cost:      currData.total,
        breakdown: {
          gross_salaries:          currData.grossSalaries,
          sgk_employer:            currData.sgkEmployer,
          huzur_hakki:             currData.huzurHakki,
          other_personnel:         currData.otherPersonnel,
        },
        revenue_this_month:        currRevenue,
        personnel_cost_ratio_pct:  costRatioPct,
        efficiency:                classifyPersonnelCostEfficiency(costRatioPct),
        cost_trend_pct:            trendPct,
        trend_class:               classifyPersonnelCostTrend(trendPct),
      },
      ytd: {
        total_personnel_cost:      ytdData.total,
        avg_monthly_cost:          avgMonthlyCost,
        personnel_cost_ratio_pct:  ytdRatioPct,
      },
      benchmarks: {
        excellent_threshold:  15,
        good_threshold:       25,
        acceptable_threshold: 35,
        industry:             'Turkish SME',
      },
      sgk_reference: {
        employer_rate:            0.2025,
        employee_rate:            0.14,
        min_wage_try:             minWageGross,
        typical_gross_to_net_pct: Math.round(grossToNetPct),
      },
    }
  }
}
