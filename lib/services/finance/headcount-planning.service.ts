// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/headcount-planning.service.ts
//
// Headcount Cost Planning Service
//
// Models the true cost of hiring (gross salary + employer taxes) and projects
// total headcount cost scenarios for Turkish SME planning purposes.
//
// Turkish payroll constants (2025):
//   SGK İşveren Payı         : 20.25% of gross salary
//   SGK İşçi Payı            : 14.0%  of gross salary
//   Gelir Vergisi (simplified): 15.0%  effective rate
//   İşsizlik İşveren         : 2.0%   of gross salary
//
// Pure exported functions (testable without DB):
//   computeEmployerSgk, computeEmployerUnemploymentInsurance,
//   computeTotalEmployerCost, computeEmployeeNetSalary,
//   buildEmployeeCostBreakdown, computeHeadcountCost,
//   computeMinViableSalary, generateHeadcountScenarios,
//   computeRevenuePerHead, classifyHeadcountEfficiency,
//   computeNewHireCost, projectHeadcountCostForward,
//   computeBreakevenHeadcount
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Default rate constants ─────────────────────────────────────────────────────

const DEFAULT_EMPLOYER_SGK_RATE_PCT       = 20.25
const DEFAULT_EMPLOYER_UNEMPLOYMENT_PCT   = 2.0
const DEFAULT_EMPLOYEE_SGK_RATE_PCT       = 14.0
const DEFAULT_INCOME_TAX_RATE_PCT         = 15.0
const DEFAULT_EMPLOYER_MULTIPLIER         = 1.2225   // 1 + 0.2025 + 0.02
const DEFAULT_BENCHMARK_COST_RATIO_PCT    = 25.0
const DEFAULT_MONTHLY_GROWTH_RATE_PCT     = 0.5

// ── Public types ───────────────────────────────────────────────────────────────

export interface EmployeeCostBreakdown {
  gross_salary_try: number
  employer_sgk_try: number            // gross × 20.25%
  employer_unemployment_try: number   // gross × 2.0%
  total_employer_cost_try: number     // gross + employer_sgk + unemployment
  employee_sgk_try: number            // gross × 14.0%
  income_tax_try: number              // gross × 15.0% (simplified)
  net_salary_try: number              // gross - employee_sgk - income_tax
  employer_cost_multiplier: number    // total_employer_cost / gross (≈ 1.2225)
}

export interface HeadcountScenario {
  name: string                        // Turkish scenario name
  headcount: number
  avg_gross_salary_try: number
  monthly_cost_try: number            // total_employer_cost × headcount
  annual_cost_try: number             // monthly × 12
  monthly_net_payroll_try: number     // net_salary × headcount
  revenue_per_head_try: number | null // revenue / headcount (null if no revenue data)
  cost_as_pct_revenue: number | null  // monthly_cost / monthly_revenue × 100
  is_sustainable: boolean             // cost_as_pct_revenue ≤ 25% (Turkish SME benchmark)
}

export interface HeadcountPlanningReport {
  current_headcount: number
  avg_gross_salary_try: number
  current_monthly_cost_try: number
  current_annual_cost_try: number
  current_cost_ratio_pct: number | null
  efficiency: ReturnType<typeof classifyHeadcountEfficiency> | null

  scenarios: HeadcountScenario[]
  cost_breakdown: EmployeeCostBreakdown  // per-employee breakdown

  breakeven_headcount: number | null  // max staff revenue can support at benchmark
  revenue_per_head: number | null

  six_month_projection: Array<{
    month: number
    headcount: number
    monthly_cost_try: number
  }>
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure computation functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Compute employer SGK contribution.
 * Default rate: 20.25%
 */
export function computeEmployerSgk(
  grossSalary: number,
  ratePct: number = DEFAULT_EMPLOYER_SGK_RATE_PCT,
): number {
  return Math.max(0, grossSalary * (ratePct / 100))
}

/**
 * Compute employer unemployment insurance.
 * Default rate: 2.0%
 */
export function computeEmployerUnemploymentInsurance(
  grossSalary: number,
  ratePct: number = DEFAULT_EMPLOYER_UNEMPLOYMENT_PCT,
): number {
  return Math.max(0, grossSalary * (ratePct / 100))
}

/**
 * Compute total employer cost per employee.
 * total = gross + employer_sgk + employer_unemployment
 */
export function computeTotalEmployerCost(
  grossSalary: number,
  employerSgkRatePct: number = DEFAULT_EMPLOYER_SGK_RATE_PCT,
  unemploymentRatePct: number = DEFAULT_EMPLOYER_UNEMPLOYMENT_PCT,
): number {
  const sgk         = computeEmployerSgk(grossSalary, employerSgkRatePct)
  const unemployment = computeEmployerUnemploymentInsurance(grossSalary, unemploymentRatePct)
  return grossSalary + sgk + unemployment
}

/**
 * Compute employee net salary.
 * net = gross × (1 - sgkEmployeePct/100 - incomeTaxPct/100)
 * Clamped to [0, gross].
 */
export function computeEmployeeNetSalary(
  grossSalary: number,
  employeeSgkRatePct: number = DEFAULT_EMPLOYEE_SGK_RATE_PCT,
  incomeTaxRatePct: number = DEFAULT_INCOME_TAX_RATE_PCT,
): number {
  const deductionRate = (employeeSgkRatePct + incomeTaxRatePct) / 100
  const net = grossSalary * (1 - deductionRate)
  return Math.min(Math.max(net, 0), grossSalary)
}

/**
 * Build full cost breakdown for one employee.
 */
export function buildEmployeeCostBreakdown(
  grossSalary: number,
  employerSgkRatePct: number = DEFAULT_EMPLOYER_SGK_RATE_PCT,
  unemploymentRatePct: number = DEFAULT_EMPLOYER_UNEMPLOYMENT_PCT,
  employeeSgkRatePct: number = DEFAULT_EMPLOYEE_SGK_RATE_PCT,
  incomeTaxRatePct: number = DEFAULT_INCOME_TAX_RATE_PCT,
): EmployeeCostBreakdown {
  const employer_sgk_try          = computeEmployerSgk(grossSalary, employerSgkRatePct)
  const employer_unemployment_try = computeEmployerUnemploymentInsurance(grossSalary, unemploymentRatePct)
  const total_employer_cost_try   = grossSalary + employer_sgk_try + employer_unemployment_try
  const employee_sgk_try          = Math.max(0, grossSalary * (employeeSgkRatePct / 100))
  const income_tax_try            = Math.max(0, grossSalary * (incomeTaxRatePct / 100))
  const net_salary_try            = computeEmployeeNetSalary(grossSalary, employeeSgkRatePct, incomeTaxRatePct)
  const employer_cost_multiplier  = grossSalary > 0 ? total_employer_cost_try / grossSalary : DEFAULT_EMPLOYER_MULTIPLIER

  return {
    gross_salary_try: grossSalary,
    employer_sgk_try,
    employer_unemployment_try,
    total_employer_cost_try,
    employee_sgk_try,
    income_tax_try,
    net_salary_try,
    employer_cost_multiplier,
  }
}

/**
 * Compute total headcount cost for N employees at given avg salary.
 * Returns: total_employer_cost × headcount
 */
export function computeHeadcountCost(
  headcount: number,
  avgGrossSalary: number,
): number {
  if (headcount <= 0) return 0
  return computeTotalEmployerCost(avgGrossSalary) * headcount
}

/**
 * Compute minimum viable salary for a role given revenue and target cost ratio.
 * min_salary = (revenue × targetCostRatio%) / headcount / employerMultiplier
 */
export function computeMinViableSalary(
  monthlyRevenue: number,
  headcount: number,
  targetCostRatioPct: number,
  employerMultiplier: number = DEFAULT_EMPLOYER_MULTIPLIER,
): number {
  if (headcount <= 0 || employerMultiplier <= 0) return 0
  const maxTotalCost = monthlyRevenue * (targetCostRatioPct / 100)
  const maxCostPerHead = maxTotalCost / headcount
  return maxCostPerHead / employerMultiplier
}

/**
 * Compute revenue per head.
 * Returns null if headcount = 0.
 */
export function computeRevenuePerHead(
  monthlyRevenue: number,
  headcount: number,
): number | null {
  if (headcount === 0) return null
  return monthlyRevenue / headcount
}

/**
 * Classify headcount cost efficiency (Turkish SME benchmarks).
 * Personnel cost as % of revenue:
 *   excellent:  ≤ 15%
 *   good:       ≤ 25%
 *   acceptable: ≤ 35%
 *   high:       ≤ 50%
 *   excessive:  > 50%
 */
export function classifyHeadcountEfficiency(
  costAsRevenueRatioPct: number,
): 'excellent' | 'good' | 'acceptable' | 'high' | 'excessive' {
  if (costAsRevenueRatioPct <= 15) return 'excellent'
  if (costAsRevenueRatioPct <= 25) return 'good'
  if (costAsRevenueRatioPct <= 35) return 'acceptable'
  if (costAsRevenueRatioPct <= 50) return 'high'
  return 'excessive'
}

/**
 * Generate headcount scenarios: current, +1, +2, +3, -1
 */
export function generateHeadcountScenarios(
  currentHeadcount: number,
  avgGrossSalary: number,
  monthlyRevenue: number | null,
): HeadcountScenario[] {
  const deltas = [-1, 0, 1, 2, 3]

  return deltas.map(delta => {
    const headcount = Math.max(0, currentHeadcount + delta)

    let name: string
    if (delta === 0)       name = 'Mevcut Kadro'
    else if (delta === -1) name = '1 Çıkarma'
    else if (delta === 1)  name = '+1 İşe Alım'
    else if (delta === 2)  name = '+2 İşe Alım'
    else                   name = `+${delta} İşe Alım`

    const breakdown              = buildEmployeeCostBreakdown(avgGrossSalary)
    const monthly_cost_try       = breakdown.total_employer_cost_try * headcount
    const annual_cost_try        = monthly_cost_try * 12
    const monthly_net_payroll_try = breakdown.net_salary_try * headcount

    const revenue_per_head_try = monthlyRevenue !== null
      ? computeRevenuePerHead(monthlyRevenue, headcount)
      : null

    const cost_as_pct_revenue = monthlyRevenue !== null && monthlyRevenue > 0 && headcount > 0
      ? (monthly_cost_try / monthlyRevenue) * 100
      : null

    const is_sustainable = cost_as_pct_revenue !== null
      ? cost_as_pct_revenue <= DEFAULT_BENCHMARK_COST_RATIO_PCT
      : false

    return {
      name,
      headcount,
      avg_gross_salary_try:    avgGrossSalary,
      monthly_cost_try,
      annual_cost_try,
      monthly_net_payroll_try,
      revenue_per_head_try,
      cost_as_pct_revenue,
      is_sustainable,
    }
  })
}

/**
 * Compute cost of a single new hire (total employer cost per month).
 * hiringCostMultiplier: e.g. 1.5 = first month includes 0.5× extra for onboarding.
 * Default: 1.0
 */
export function computeNewHireCost(
  grossSalary: number,
  hiringCostMultiplier: number = 1.0,
): number {
  const baseCost = computeTotalEmployerCost(grossSalary)
  return baseCost * hiringCostMultiplier
}

/**
 * Project headcount cost forward N months with salary growth.
 * Each month: prev_salary × (1 + monthlyGrowthRatePct/100)
 * Optional: plannedHiresPerMonth adds headcount each month.
 */
export function projectHeadcountCostForward(
  initialHeadcount: number,
  initialAvgGross: number,
  months: number,
  monthlyGrowthRatePct: number = DEFAULT_MONTHLY_GROWTH_RATE_PCT,
  plannedHiresPerMonth: number = 0,
): Array<{
  month: number
  headcount: number
  avg_gross_try: number
  monthly_employer_cost_try: number
}> {
  const results = []
  let headcount = Math.max(0, initialHeadcount)
  let avgGross  = Math.max(0, initialAvgGross)
  const growthFactor = 1 + (monthlyGrowthRatePct / 100)

  for (let month = 1; month <= months; month++) {
    if (month > 1) {
      avgGross  = avgGross * growthFactor
      headcount = headcount + Math.max(0, plannedHiresPerMonth)
    }

    const monthly_employer_cost_try = computeTotalEmployerCost(avgGross) * headcount

    results.push({
      month,
      headcount,
      avg_gross_try: avgGross,
      monthly_employer_cost_try,
    })
  }

  return results
}

/**
 * Compute breakeven headcount (max employees that revenue supports at benchmark ratio).
 * breakeven = floor((revenue × benchmarkRatio%) / (avgGross × employerMultiplier))
 */
export function computeBreakevenHeadcount(
  monthlyRevenue: number,
  avgGrossSalary: number,
  benchmarkCostRatioPct: number = DEFAULT_BENCHMARK_COST_RATIO_PCT,
): number {
  if (avgGrossSalary <= 0) return 0
  const maxTotalCost       = monthlyRevenue * (benchmarkCostRatioPct / 100)
  const costPerEmployee    = computeTotalEmployerCost(avgGrossSalary)
  if (costPerEmployee <= 0) return 0
  return Math.floor(maxTotalCost / costPerEmployee)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HeadcountPlanningService
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class HeadcountPlanningService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<HeadcountPlanningReport> {
    const now          = new Date()
    const currentYear  = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // Build 3-month window (salary estimation)
    const months: Array<{ from: string; to: string }> = []
    for (let i = 0; i < 3; i++) {
      const d    = new Date(currentYear, currentMonth - 1 - i, 1)
      const y    = d.getFullYear()
      const m    = d.getMonth() + 1
      const from = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      months.push({ from, to })
    }

    const windowFrom = months[months.length - 1].from
    const windowTo   = months[0].to

    // Current month date range
    const currFrom = months[0].from
    const currTo   = months[0].to

    const [salaryResult, revenueResult] = await Promise.allSettled([
      // Salary expenses for last 3 months
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try, description')
        .eq('company_id', companyId)
        .eq('category', 'salary')
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Current month revenue
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', currFrom)
        .lte('sale_date', currTo)
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Aggregate salary data ─────────────────────────────────────────────────

    const salaryRows: Array<{ expense_date: string; amount_try: number }> =
      salaryResult.status === 'fulfilled' ? (salaryResult.value?.data ?? []) : []

    // Total salary per month key
    const salaryByMonth = new Map<string, number>()
    for (const row of salaryRows) {
      if (!row.expense_date) continue
      const mk = (row.expense_date as string).slice(0, 7)
      salaryByMonth.set(mk, (salaryByMonth.get(mk) ?? 0) + (Number(row.amount_try) || 0))
    }

    // Average monthly salary (last 3 months non-zero)
    const nonZeroMonths = Array.from(salaryByMonth.values()).filter(v => v > 0)
    const avgMonthlySalaryTotal = nonZeroMonths.length > 0
      ? nonZeroMonths.reduce((s, v) => s + v, 0) / nonZeroMonths.length
      : 0

    // Estimate headcount from salary total.
    // Heuristic: divide by estimated avg gross of 25,000 TRY if we can't determine it.
    // Use 3× the average monthly total as headcount estimate, assuming 1 salary entry ≈ 1 person.
    // Count distinct salary entries (each row = one employee's monthly salary, estimate).
    // Better approach: count rows in a single month as proxy for headcount.
    const currMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
    const currSalaryRowCount = salaryRows.filter(r =>
      r.expense_date && (r.expense_date as string).startsWith(currMonthKey)
    ).length

    // If we have no row count, fall back to 1 if we have salary data
    const estimatedHeadcount = currSalaryRowCount > 0
      ? currSalaryRowCount
      : nonZeroMonths.length > 0 ? 1 : 0

    const currMonthlySalary = salaryByMonth.get(currMonthKey) ?? avgMonthlySalaryTotal

    // Estimate avg gross salary: total salary / headcount
    const avgGrossSalary = estimatedHeadcount > 0
      ? currMonthlySalary / estimatedHeadcount
      : 25_000  // default assumption for Turkish SME

    // ── Revenue ──────────────────────────────────────────────────────────────

    const revenueRows: Array<{ total_try: number }> =
      revenueResult.status === 'fulfilled' ? (revenueResult.value?.data ?? []) : []
    const monthlyRevenue = revenueRows.reduce((s, r) => s + (Number(r.total_try) || 0), 0)

    // ── Build report ──────────────────────────────────────────────────────────

    const headcount            = estimatedHeadcount
    const breakdown            = buildEmployeeCostBreakdown(avgGrossSalary)
    const monthly_cost         = breakdown.total_employer_cost_try * headcount
    const annual_cost          = monthly_cost * 12
    const currentCostRatioPct  = monthlyRevenue > 0 && headcount > 0
      ? (monthly_cost / monthlyRevenue) * 100
      : null
    const efficiency           = currentCostRatioPct !== null
      ? classifyHeadcountEfficiency(currentCostRatioPct)
      : null
    const revenuePerHead       = computeRevenuePerHead(monthlyRevenue, headcount)

    const scenarios = generateHeadcountScenarios(
      headcount,
      avgGrossSalary,
      monthlyRevenue > 0 ? monthlyRevenue : null,
    )

    const breakevenHeadcount = monthlyRevenue > 0 && avgGrossSalary > 0
      ? computeBreakevenHeadcount(monthlyRevenue, avgGrossSalary)
      : null

    const sixMonthRaw = projectHeadcountCostForward(headcount, avgGrossSalary, 6)
    const six_month_projection = sixMonthRaw.map(m => ({
      month: m.month,
      headcount: m.headcount,
      monthly_cost_try: m.monthly_employer_cost_try,
    }))

    return {
      current_headcount:        headcount,
      avg_gross_salary_try:     avgGrossSalary,
      current_monthly_cost_try: monthly_cost,
      current_annual_cost_try:  annual_cost,
      current_cost_ratio_pct:   currentCostRatioPct,
      efficiency,
      scenarios,
      cost_breakdown:           breakdown,
      breakeven_headcount:      breakevenHeadcount,
      revenue_per_head:         revenuePerHead,
      six_month_projection,
    }
  }
}
