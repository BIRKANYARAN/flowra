// ══════════════════════════════════════════════════════════════════════════════
// lib/services/planning/budget-tracker.service.ts
//
// Monthly Budget vs Actuals Tracker
//
// Compares actual revenue and expense figures against budget targets stored in
// the monthly_budgets table. Generates variance alerts and budget health scores.
//
// Data sources:
//   Budget targets: monthly_budgets (revenue_target_try, expense_target_try)
//   Actual revenue: SUM(sales.total_try) for the period
//   Actual expenses: SUM(expenses.amount_try) by category for the period
//
// Pure exports (unit testable, no DB):
//   computeBudgetVariance, computeBudgetVariancePct, classifyBudgetAdherence,
//   computeBudgetHealthScore, computeBudgetPacing
//
// DB-bound service: BudgetTrackerService.getReport(companyId, periodKey?)
// ══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type BudgetAdherence =
  | 'on_target'
  | 'favorable'
  | 'strongly_favorable'
  | 'at_risk'
  | 'off_track'
  | 'no_budget'

export type BudgetHealthGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface BudgetLineItem {
  category: string           // 'revenue' | expense_type
  metric_type: 'revenue' | 'expense'
  budget_try: number
  actual_try: number
  variance_try: number
  variance_pct: number | null
  adherence: BudgetAdherence
  ytd_actual_try: number
  ytd_budget_try: number
  ytd_pacing_pct: number | null
}

export interface MonthlyBudgetReport {
  period_key: string
  period_label: string
  has_budget_data: boolean
  budget_health_score: number
  budget_health_grade: BudgetHealthGrade
  line_items: BudgetLineItem[]
  revenue_adherence: BudgetLineItem | null
  total_expense_variance_try: number
  off_track_items: BudgetLineItem[]
  at_risk_items: BudgetLineItem[]
  narrative: string
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute budget variance: actual - budget
 */
export function computeBudgetVariance(
  actualTry: number,
  budgetTry: number,
): number {
  return round2(actualTry - budgetTry)
}

/**
 * Compute budget variance percent: (actual - budget) / budget × 100
 * Returns null if budget = 0
 */
export function computeBudgetVariancePct(
  actualTry: number,
  budgetTry: number,
): number | null {
  if (budgetTry === 0) return null
  return round2(((actualTry - budgetTry) / budgetTry) * 100)
}

/**
 * Classify budget adherence.
 *
 * Direction logic:
 *   Revenue: over budget (positive variance) = favorable
 *   Expense: over budget (positive variance) = unfavorable
 *
 * Thresholds:
 *   |variance_pct| ≤ 5%      → 'on_target'
 *   favorable  5–15%         → 'favorable'
 *   favorable  >15%          → 'strongly_favorable'
 *   unfavorable 5–15%        → 'at_risk'
 *   unfavorable >15%         → 'off_track'
 *   variancePct is null      → 'no_budget'
 */
export function classifyBudgetAdherence(
  variancePct: number | null,
  metricType: 'revenue' | 'expense',
): BudgetAdherence {
  if (variancePct === null) return 'no_budget'

  const abs = Math.abs(variancePct)

  if (abs <= 5) return 'on_target'

  // For revenue: positive variance is favorable
  // For expense: negative variance is favorable
  const isFavorable =
    metricType === 'revenue' ? variancePct > 0 : variancePct < 0

  if (isFavorable) {
    return abs > 15 ? 'strongly_favorable' : 'favorable'
  } else {
    return abs > 15 ? 'off_track' : 'at_risk'
  }
}

/**
 * Compute budget health score 0–100.
 *
 * Start at 100.
 * Deductions:
 *   off_track:         -20 each
 *   at_risk:           -10 each
 * Bonuses:
 *   strongly_favorable: +5 each
 *
 * Clamp to [0, 100].
 */
export function computeBudgetHealthScore(
  adherenceItems: Array<BudgetAdherence>,
): number {
  let score = 100

  for (const item of adherenceItems) {
    if (item === 'off_track') score -= 20
    else if (item === 'at_risk') score -= 10
    else if (item === 'strongly_favorable') score += 5
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Compute YTD budget pacing:
 *   actual_ytd / (budget_monthly × months_elapsed) × 100
 *
 * Returns null if budget = 0 or months = 0.
 */
export function computeBudgetPacing(
  actualYtdTry: number,
  monthlyBudgetTry: number,
  monthsElapsed: number,
): number | null {
  if (monthlyBudgetTry === 0 || monthsElapsed === 0) return null
  const expected = monthlyBudgetTry * monthsElapsed
  return round2((actualYtdTry / expected) * 100)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function gradeFromScore(score: number): BudgetHealthGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

function currentPeriodKey(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function periodLabel(periodKey: string): string {
  const MONTH_NAMES_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ]
  const [yearStr, monthStr] = periodKey.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return periodKey
  return `${MONTH_NAMES_TR[month - 1]} ${year}`
}

// ── DB-bound service ──────────────────────────────────────────────────────────

export class BudgetTrackerService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Build the monthly budget report for a given period.
   *
   * @param companyId  UUID of the company
   * @param periodKey  'YYYY-MM' string; defaults to current month
   */
  async getReport(
    companyId: string,
    periodKey?: string,
  ): Promise<MonthlyBudgetReport> {
    const pk = periodKey ?? currentPeriodKey()
    const [yearStr, monthStr] = pk.split('-')
    const year  = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)

    // Date range for the period
    const lastDay = new Date(year, month, 0).getDate()
    const mm = String(month).padStart(2, '0')
    const periodFrom = `${year}-${mm}-01`
    const periodTo   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

    // YTD range: Jan 1 → end of period month
    const ytdFrom = `${year}-01-01`
    const ytdTo   = periodTo

    // Determine months elapsed (Jan = 1, so month itself is months elapsed)
    const monthsElapsed = month

    // ── Fetch in parallel ─────────────────────────────────────────────────────
    const [
      budgetResult,
      revenueResult,
      expenseResult,
      ytdRevenueResult,
      ytdExpenseResult,
    ] = await Promise.allSettled([
      // Budget for the period
      this.supabase
        .from('monthly_budgets')
        .select('revenue_target_try, expense_target_try')
        .eq('company_id', companyId)
        .eq('budget_year', year)
        .eq('budget_month', month)
        .maybeSingle(),

      // Actual revenue for the period
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', periodFrom)
        .lte('sale_date', periodTo),

      // Actual expenses by category for the period
      this.supabase
        .from('expenses')
        .select('amount_try, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', periodFrom)
        .lte('expense_date', periodTo),

      // YTD revenue
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo),

      // YTD expenses
      this.supabase
        .from('expenses')
        .select('amount_try, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', ytdTo),
    ])

    // ── Extract budget data ───────────────────────────────────────────────────
    const budgetRow =
      budgetResult.status === 'fulfilled' && budgetResult.value?.data
        ? budgetResult.value.data
        : null

    const hasBudgetData = budgetRow !== null

    if (!hasBudgetData) {
      return {
        period_key:              pk,
        period_label:            periodLabel(pk),
        has_budget_data:         false,
        budget_health_score:     50,
        budget_health_grade:     'D',
        line_items:              [],
        revenue_adherence:       null,
        total_expense_variance_try: 0,
        off_track_items:         [],
        at_risk_items:           [],
        narrative:               'Bu dönem için bütçe verisi bulunmuyor.',
      }
    }

    const revenueBudget = Number(budgetRow.revenue_target_try ?? 0)
    const expenseBudget = Number(budgetRow.expense_target_try ?? 0)

    // ── Compute actual revenue ────────────────────────────────────────────────
    let actualRevenue = 0
    if (revenueResult.status === 'fulfilled' && revenueResult.value?.data) {
      for (const row of revenueResult.value.data) {
        actualRevenue = round2(actualRevenue + (Number(row.total_try) || 0))
      }
    }

    // ── Compute actual expenses by category ──────────────────────────────────
    const expenseByCategory = new Map<string, number>()
    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        const cat = (row.category as string | null) ?? 'other'
        expenseByCategory.set(cat, round2((expenseByCategory.get(cat) ?? 0) + (Number(row.amount_try) || 0)))
      }
    }
    const actualTotalExpense = Array.from(expenseByCategory.values()).reduce((s, v) => round2(s + v), 0)

    // ── YTD actuals ───────────────────────────────────────────────────────────
    let ytdRevenue = 0
    if (ytdRevenueResult.status === 'fulfilled' && ytdRevenueResult.value?.data) {
      for (const row of ytdRevenueResult.value.data) {
        ytdRevenue = round2(ytdRevenue + (Number(row.total_try) || 0))
      }
    }

    let ytdTotalExpense = 0
    const ytdExpenseByCategory = new Map<string, number>()
    if (ytdExpenseResult.status === 'fulfilled' && ytdExpenseResult.value?.data) {
      for (const row of ytdExpenseResult.value.data) {
        const cat = (row.category as string | null) ?? 'other'
        ytdExpenseByCategory.set(cat, round2((ytdExpenseByCategory.get(cat) ?? 0) + (Number(row.amount_try) || 0)))
        ytdTotalExpense = round2(ytdTotalExpense + (Number(row.amount_try) || 0))
      }
    }

    // ── Build line items ──────────────────────────────────────────────────────
    const lineItems: BudgetLineItem[] = []

    // Revenue line item
    const revVarianceTry = computeBudgetVariance(actualRevenue, revenueBudget)
    const revVariancePct = computeBudgetVariancePct(actualRevenue, revenueBudget)
    const revAdherence   = classifyBudgetAdherence(revVariancePct, 'revenue')
    const revYtdPacing   = computeBudgetPacing(ytdRevenue, revenueBudget, monthsElapsed)

    const revLineItem: BudgetLineItem = {
      category:        'revenue',
      metric_type:     'revenue',
      budget_try:      revenueBudget,
      actual_try:      actualRevenue,
      variance_try:    revVarianceTry,
      variance_pct:    revVariancePct,
      adherence:       revAdherence,
      ytd_actual_try:  ytdRevenue,
      ytd_budget_try:  round2(revenueBudget * monthsElapsed),
      ytd_pacing_pct:  revYtdPacing,
    }
    lineItems.push(revLineItem)

    // Expense line items by category
    // Use budget total for expense; split proportionally or just use total budget for total
    // If expense categories exist, add each as a line item
    if (expenseByCategory.size > 0) {
      // Per-category expense — no per-category budget (budget is total), so budget_try = 0 → no_budget per category
      // But include total expense as an aggregate line item using expenseBudget
      for (const [cat, actualCat] of expenseByCategory.entries()) {
        const catVarianceTry = computeBudgetVariance(actualCat, 0) // no per-category budget
        const catYtdActual   = ytdExpenseByCategory.get(cat) ?? 0
        lineItems.push({
          category:        cat,
          metric_type:     'expense',
          budget_try:      0,
          actual_try:      actualCat,
          variance_try:    catVarianceTry,
          variance_pct:    null,
          adherence:       'no_budget',
          ytd_actual_try:  catYtdActual,
          ytd_budget_try:  0,
          ytd_pacing_pct:  null,
        })
      }
    }

    // Total expense line item with the budget
    const expVarianceTry = computeBudgetVariance(actualTotalExpense, expenseBudget)
    const expVariancePct = computeBudgetVariancePct(actualTotalExpense, expenseBudget)
    const expAdherence   = classifyBudgetAdherence(expVariancePct, 'expense')
    const expYtdPacing   = computeBudgetPacing(ytdTotalExpense, expenseBudget, monthsElapsed)

    const totalExpLineItem: BudgetLineItem = {
      category:        'total_expense',
      metric_type:     'expense',
      budget_try:      expenseBudget,
      actual_try:      actualTotalExpense,
      variance_try:    expVarianceTry,
      variance_pct:    expVariancePct,
      adherence:       expAdherence,
      ytd_actual_try:  ytdTotalExpense,
      ytd_budget_try:  round2(expenseBudget * monthsElapsed),
      ytd_pacing_pct:  expYtdPacing,
    }
    lineItems.push(totalExpLineItem)

    // ── Health score ──────────────────────────────────────────────────────────
    // Only include items that have a budget to score
    const scoredAdherences = lineItems
      .filter(i => i.adherence !== 'no_budget')
      .map(i => i.adherence)

    const healthScore = computeBudgetHealthScore(scoredAdherences)
    const healthGrade = gradeFromScore(healthScore)

    // ── Classify items ────────────────────────────────────────────────────────
    const offTrackItems = lineItems.filter(i => i.adherence === 'off_track')
    const atRiskItems   = lineItems.filter(i => i.adherence === 'at_risk')

    // ── Narrative ─────────────────────────────────────────────────────────────
    const isHealthy = healthScore >= 70
    const underCount = offTrackItems.length + atRiskItems.length
    const overCount = lineItems.filter(
      i => i.adherence === 'favorable' || i.adherence === 'strongly_favorable',
    ).length

    const narrative = `Bütçe takibi ${isHealthy ? 'sağlıklı' : 'riskli'} — ${underCount} kalem hedefin altında, ${overCount} kalem hedefin üstünde`

    return {
      period_key:                 pk,
      period_label:               periodLabel(pk),
      has_budget_data:            true,
      budget_health_score:        healthScore,
      budget_health_grade:        healthGrade,
      line_items:                 lineItems,
      revenue_adherence:          revLineItem,
      total_expense_variance_try: expVarianceTry,
      off_track_items:            offTrackItems,
      at_risk_items:              atRiskItems,
      narrative,
    }
  }
}
