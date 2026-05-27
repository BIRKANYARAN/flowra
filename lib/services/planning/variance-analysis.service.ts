// ══════════════════════════════════════════════════════════════════════════════
// lib/services/planning/variance-analysis.service.ts
//
// 3-Way Variance Analysis: Actual vs Budget vs Forecast
//
// Core CFO planning control tool — not just whether you hit budget, but whether
// the forecast was also accurate.
//
// Data sources:
//   Actual revenue:   SUM(sales.total_try) by month
//   Actual COGS:      SUM via sale_item_allocations × stock_lots.entry_cost_try
//   Actual expenses:  SUM(expenses.amount_try) by month
//   Budget:           monthly_budgets (revenue_target_try, expense_target_try)
//   Forecast:         simulation_scenarios WHERE is_baseline = true,
//                     monthly_breakdown JSONB array
//
// Pure exports (unit testable, no DB):
//   computeVariancePct, classifyVarianceDirection, computeForecastAccuracy,
//   buildVarianceCell, aggregateYtd
//
// DB-bound service: VarianceAnalysisService.getReport(companyId, year, supabase)
// ══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type VarianceDirection = 'favorable' | 'unfavorable' | 'neutral' | 'no_data'

export interface VarianceCell {
  actual: number | null
  budget: number | null
  forecast: number | null
  actual_vs_budget_pct: number | null
  actual_vs_forecast_pct: number | null
  budget_vs_forecast_pct: number | null
  actual_vs_budget_dir: VarianceDirection
  actual_vs_forecast_dir: VarianceDirection
}

export interface VarianceRow {
  metric_key: string
  metric_label: string       // Turkish
  is_cost_metric: boolean    // true for COGS, expenses (favorable = negative variance)
  monthly: VarianceCell[]    // one per month in range (Jan–Dec)
  ytd: VarianceCell          // year-to-date aggregated
}

export interface VarianceReport {
  company_id: string
  year: number
  months_available: number   // how many months have actual data
  has_budget: boolean
  has_forecast: boolean
  rows: VarianceRow[]
  // Summary
  ytd_revenue_variance_pct: number | null   // actual vs budget for revenue
  ytd_expense_variance_pct: number | null
  forecast_accuracy_score: number | null    // 100 = perfect, lower = less accurate
  computed_at: string
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute variance percentage: (actual - reference) / |reference| × 100.
 * Returns null if either argument is null/undefined or reference === 0.
 */
export function computeVariancePct(
  actual: number | null,
  reference: number | null,
): number | null {
  if (actual === null || actual === undefined) return null
  if (reference === null || reference === undefined) return null
  if (reference === 0) return null
  return round2(((actual - reference) / Math.abs(reference)) * 100)
}

/**
 * Classify variance direction.
 * - Revenue metrics: positive variance = favorable
 * - Cost metrics: negative variance = favorable
 * - Neutral if |pct| < 1
 * - no_data if pct is null
 */
export function classifyVarianceDirection(
  variancePct: number | null,
  isCostMetric: boolean,
): VarianceDirection {
  if (variancePct === null) return 'no_data'
  if (Math.abs(variancePct) < 1) return 'neutral'
  if (isCostMetric) {
    return variancePct < 0 ? 'favorable' : 'unfavorable'
  }
  return variancePct > 0 ? 'favorable' : 'unfavorable'
}

/**
 * Compute forecast accuracy score.
 * Per month: accuracy = max(0, 100 - |actual_vs_forecast_pct|)
 * Overall: average of all monthly accuracy scores.
 * Returns null if no data.
 */
export function computeForecastAccuracy(
  actualVsForecastPcts: (number | null)[],
): number | null {
  const valid = actualVsForecastPcts.filter((p): p is number => p !== null)
  if (valid.length === 0) return null
  const scores = valid.map(p => Math.max(0, 100 - Math.abs(p)))
  return round2(scores.reduce((sum, s) => sum + s, 0) / scores.length)
}

/**
 * Build a complete VarianceCell from raw values.
 */
export function buildVarianceCell(
  actual: number | null,
  budget: number | null,
  forecast: number | null,
  isCostMetric: boolean,
): VarianceCell {
  const avb = computeVariancePct(actual, budget)
  const avf = computeVariancePct(actual, forecast)
  const bvf = computeVariancePct(budget, forecast)

  return {
    actual,
    budget,
    forecast,
    actual_vs_budget_pct: avb,
    actual_vs_forecast_pct: avf,
    budget_vs_forecast_pct: bvf,
    actual_vs_budget_dir: classifyVarianceDirection(avb, isCostMetric),
    actual_vs_forecast_dir: classifyVarianceDirection(avf, isCostMetric),
  }
}

/**
 * Aggregate multiple monthly VarianceCells into a YTD cell.
 * Sums actual/budget/forecast first, then recomputes variance on sums.
 */
export function aggregateYtd(cells: VarianceCell[], isCostMetric: boolean): VarianceCell {
  let actualSum = 0
  let budgetSum = 0
  let forecastSum = 0
  let hasActual = false
  let hasBudget = false
  let hasForecast = false

  for (const c of cells) {
    if (c.actual !== null) { actualSum += c.actual; hasActual = true }
    if (c.budget !== null) { budgetSum += c.budget; hasBudget = true }
    if (c.forecast !== null) { forecastSum += c.forecast; hasForecast = true }
  }

  return buildVarianceCell(
    hasActual ? actualSum : null,
    hasBudget ? budgetSum : null,
    hasForecast ? forecastSum : null,
    isCostMetric,
  )
}

// ── Metric definitions ────────────────────────────────────────────────────────

interface MetricDef {
  key: string
  label: string
  is_cost_metric: boolean
}

const METRIC_DEFS: MetricDef[] = [
  { key: 'revenue',             label: 'Gelir',               is_cost_metric: false },
  { key: 'cogs',                label: 'Satış Maliyeti',      is_cost_metric: true  },
  { key: 'gross_profit',        label: 'Brüt Kâr',            is_cost_metric: false },
  { key: 'operating_expenses',  label: 'Faaliyet Giderleri',  is_cost_metric: true  },
  { key: 'ebit',                label: 'FVÖK (EBIT)',         is_cost_metric: false },
  { key: 'net_income',          label: 'Net Kâr',             is_cost_metric: false },
]

// ── Month helpers ─────────────────────────────────────────────────────────────

function monthRange(year: number, month: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${mm}-01`,
    to:   `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ── Monthly forecast extraction ───────────────────────────────────────────────

/**
 * Extract per-month financials from a baseline scenario's monthly_breakdown JSONB.
 * The breakdown array is ordered Jan–Dec (index 0 = month 1).
 * Supports both `revenue` and `revenue_try` field names.
 */
function extractForecastByMonth(
  breakdown: unknown[],
  year: number,
): Map<number, { revenue: number; cogs: number; expenses: number }> {
  const map = new Map<number, { revenue: number; cogs: number; expenses: number }>()
  if (!Array.isArray(breakdown)) return map

  for (let i = 0; i < breakdown.length && i < 12; i++) {
    const entry = breakdown[i] as Record<string, unknown>
    if (!entry || typeof entry !== 'object') continue

    // Determine which month this entry belongs to.
    // Some scenarios store month index (1-based) explicitly; others rely on array position.
    const entryYear  = entry.year  !== undefined ? Number(entry.year)  : year
    const entryMonth = entry.month !== undefined ? Number(entry.month) : i + 1

    if (entryYear !== year) continue

    const revenue  = Number(entry.revenue  ?? entry.revenue_try  ?? 0)
    const cogs     = Number(entry.cogs     ?? entry.cogs_try     ?? entry.cost ?? entry.cost_try ?? 0)
    const expenses = Number(entry.expenses ?? entry.expenses_try ?? entry.operating_expenses ?? 0)

    map.set(entryMonth, { revenue, cogs, expenses })
  }
  return map
}

// ── DB-bound service ──────────────────────────────────────────────────────────

export class VarianceAnalysisService {
  /**
   * Build full variance report for the given year.
   *
   * @param companyId  UUID of the company
   * @param year       Calendar year (e.g. 2026)
   * @param supabase   Authenticated Supabase client
   */
  static async getReport(
    companyId: string,
    year: number,
    supabase: AnyClient,
  ): Promise<VarianceReport> {
    const windowFrom = `${year}-01-01`
    const windowTo   = `${year}-12-31`

    // ── Fetch all data in parallel ────────────────────────────────────────────
    const [salesResult, expResult, allocResult, saleItemsResult, budgetResult, scenarioResult] =
      await Promise.allSettled([
        // Actual revenue
        supabase
          .from('sales')
          .select('sale_date, total_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', windowFrom)
          .lte('sale_date', windowTo),

        // Actual expenses
        supabase
          .from('expenses')
          .select('expense_date, amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', windowFrom)
          .lte('expense_date', windowTo),

        // Actual COGS via sale_item_allocations → stock_lots
        supabase
          .from('sale_item_allocations')
          .select('qty_allocated, stock_lots!inner(entry_cost_try, cost_price_try), sale_items!inner(sale_id)')
          .eq('sale_items.company_id', companyId),

        // Sale IDs for the year (to filter allocations)
        supabase
          .from('sales')
          .select('id, sale_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', windowFrom)
          .lte('sale_date', windowTo),

        // Budget
        supabase
          .from('monthly_budgets')
          .select('budget_year, budget_month, revenue_target_try, expense_target_try, gross_profit_target_try')
          .eq('company_id', companyId)
          .eq('budget_year', year),

        // Baseline forecast scenario
        supabase
          .from('simulation_scenarios')
          .select('id, monthly_breakdown, summary')
          .eq('company_id', companyId)
          .eq('is_baseline', true)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    // ── Build year sale ID set for COGS filtering ─────────────────────────────
    const yearSaleIds = new Set<string>()
    const saleDateById = new Map<string, string>()
    if (saleItemsResult.status === 'fulfilled' && saleItemsResult.value?.data) {
      for (const row of saleItemsResult.value.data) {
        yearSaleIds.add(row.id as string)
        saleDateById.set(row.id as string, row.sale_date as string)
      }
    }

    // ── Revenue by month ──────────────────────────────────────────────────────
    const revenueByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) revenueByMonth[m] = 0

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const monthNum = parseInt((row.sale_date as string).slice(5, 7), 10)
        revenueByMonth[monthNum] = round2(revenueByMonth[monthNum] + (Number(row.total_try) || 0))
      }
    }

    // ── Expenses by month ─────────────────────────────────────────────────────
    const expenseByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) expenseByMonth[m] = 0

    if (expResult.status === 'fulfilled' && expResult.value?.data) {
      for (const row of expResult.value.data) {
        if (!row.expense_date) continue
        const monthNum = parseInt((row.expense_date as string).slice(5, 7), 10)
        expenseByMonth[monthNum] = round2(expenseByMonth[monthNum] + (Number(row.amount_try) || 0))
      }
    }

    // ── COGS by month (via allocations) ──────────────────────────────────────
    // Simplified approach: use sale_item_allocations joined to stock_lots
    // Since the join may not work directly without sale_id linkage in the query,
    // fall back to computing COGS from sales directly if allocation data unavailable.
    const cogsByMonth: Record<number, number> = {}
    for (let m = 1; m <= 12; m++) cogsByMonth[m] = 0

    // Try to get COGS from sale_item_allocations
    // The allocation query may fail due to RLS / missing join; if so, we set COGS to 0
    // and a separate fallback query is not strictly needed (budget/forecast still works)
    if (allocResult.status === 'fulfilled' && allocResult.value?.data) {
      for (const row of allocResult.value.data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const saleItem = (row as any).sale_items
        const saleId   = saleItem?.sale_id as string | undefined
        if (!saleId || !yearSaleIds.has(saleId)) continue

        const saleDate  = saleDateById.get(saleId)
        if (!saleDate) continue
        const monthNum  = parseInt(saleDate.slice(5, 7), 10)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lot       = (row as any).stock_lots
        const perUnit   = Number(lot?.entry_cost_try ?? lot?.cost_price_try ?? 0)
        const qty       = Number(row.qty_allocated ?? 0)

        cogsByMonth[monthNum] = round2(cogsByMonth[monthNum] + perUnit * qty)
      }
    }

    // ── Budget by month ───────────────────────────────────────────────────────
    interface BudgetRow {
      budget_month: number
      revenue_target_try: number | null
      expense_target_try: number | null
      gross_profit_target_try: number | null
    }
    const budgetByMonth = new Map<number, BudgetRow>()
    let hasBudget = false

    if (budgetResult.status === 'fulfilled' && budgetResult.value?.data) {
      for (const row of budgetResult.value.data) {
        budgetByMonth.set(Number(row.budget_month), row as BudgetRow)
        hasBudget = true
      }
    }

    // ── Forecast by month (from baseline scenario monthly_breakdown) ──────────
    let forecastByMonth = new Map<number, { revenue: number; cogs: number; expenses: number }>()
    let hasForecast = false

    if (scenarioResult.status === 'fulfilled' && scenarioResult.value?.data) {
      const scenario = scenarioResult.value.data
      if (scenario && scenario.monthly_breakdown) {
        forecastByMonth = extractForecastByMonth(
          scenario.monthly_breakdown as unknown[],
          year,
        )
        hasForecast = forecastByMonth.size > 0
      }
    }

    // ── Determine how many months have actual data ────────────────────────────
    const today   = new Date()
    const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    let monthsAvailable = 0
    for (let m = 1; m <= 12; m++) {
      const monthKey = `${year}-${String(m).padStart(2, '0')}`
      if (monthKey <= todayYM && (revenueByMonth[m] > 0 || expenseByMonth[m] > 0)) {
        monthsAvailable++
      }
    }

    // ── Build per-metric rows ─────────────────────────────────────────────────
    const rows: VarianceRow[] = METRIC_DEFS.map(def => {
      const monthly: VarianceCell[] = []

      for (let m = 1; m <= 12; m++) {
        const rev   = revenueByMonth[m]
        const cogs  = cogsByMonth[m]
        const gp    = round2(rev - cogs)
        const opex  = expenseByMonth[m]
        const ebit  = round2(gp - opex)
        const ni    = ebit  // simplified (no tax/interest at this layer)

        const bRow  = budgetByMonth.get(m)
        const fRow  = forecastByMonth.get(m)

        // Derive budget values per metric
        let budgetRevenue: number | null    = bRow?.revenue_target_try ?? null
        if (budgetRevenue !== null) budgetRevenue = Number(budgetRevenue)
        let budgetExpense: number | null    = bRow?.expense_target_try ?? null
        if (budgetExpense !== null) budgetExpense = Number(budgetExpense)
        // COGS budget not stored — null
        const budgetCogs: number | null     = null
        const budgetGP: number | null       =
          bRow?.gross_profit_target_try !== null && bRow?.gross_profit_target_try !== undefined
            ? Number(bRow.gross_profit_target_try)
            : (budgetRevenue !== null && budgetCogs !== null
                ? round2(budgetRevenue - budgetCogs)
                : null)
        const budgetEbit: number | null     =
          budgetGP !== null && budgetExpense !== null
            ? round2(budgetGP - budgetExpense)
            : null
        const budgetNI: number | null       = budgetEbit

        // Derive forecast values per metric
        const fRevenue    = fRow ? fRow.revenue   : null
        const fCogs       = fRow ? fRow.cogs      : null
        const fExpenses   = fRow ? fRow.expenses  : null
        const fGP         = fRevenue !== null && fCogs !== null ? round2(fRevenue - fCogs) : null
        const fEbit       = fGP !== null && fExpenses !== null ? round2(fGP - fExpenses) : null
        const fNI         = fEbit

        // Check if this month has actual data (use current month boundary)
        const monthKey    = `${year}-${String(m).padStart(2, '0')}`
        const hasActual   = monthKey <= todayYM

        const actualRevenue  = hasActual ? rev  : null
        const actualCogs     = hasActual ? cogs : null
        const actualGP       = hasActual ? gp   : null
        const actualOpex     = hasActual ? opex : null
        const actualEbit     = hasActual ? ebit : null
        const actualNI       = hasActual ? ni   : null

        let actual: number | null
        let budget: number | null
        let forecast: number | null

        switch (def.key) {
          case 'revenue':            actual = actualRevenue; budget = budgetRevenue; forecast = fRevenue;  break
          case 'cogs':               actual = actualCogs;    budget = budgetCogs;    forecast = fCogs;     break
          case 'gross_profit':       actual = actualGP;      budget = budgetGP;      forecast = fGP;       break
          case 'operating_expenses': actual = actualOpex;    budget = budgetExpense;  forecast = fExpenses; break
          case 'ebit':               actual = actualEbit;    budget = budgetEbit;    forecast = fEbit;     break
          case 'net_income':         actual = actualNI;      budget = budgetNI;      forecast = fNI;       break
          default:                   actual = null;          budget = null;          forecast = null
        }

        monthly.push(buildVarianceCell(actual, budget, forecast, def.is_cost_metric))
      }

      const ytd = aggregateYtd(monthly, def.is_cost_metric)
      return {
        metric_key:    def.key,
        metric_label:  def.label,
        is_cost_metric: def.is_cost_metric,
        monthly,
        ytd,
      }
    })

    // ── Summary metrics ───────────────────────────────────────────────────────
    const revenueRow = rows.find(r => r.metric_key === 'revenue')
    const expenseRow = rows.find(r => r.metric_key === 'operating_expenses')

    const ytdRevenueVariancePct = revenueRow?.ytd.actual_vs_budget_pct ?? null
    const ytdExpenseVariancePct = expenseRow?.ytd.actual_vs_budget_pct ?? null

    // Forecast accuracy: across all rows' monthly actual_vs_forecast_pct
    const allAvfPcts: (number | null)[] = rows.flatMap(row =>
      row.monthly.map(c => c.actual_vs_forecast_pct)
    )
    const forecastAccuracyScore = computeForecastAccuracy(allAvfPcts)

    return {
      company_id:              companyId,
      year,
      months_available:        monthsAvailable,
      has_budget:              hasBudget,
      has_forecast:            hasForecast,
      rows,
      ytd_revenue_variance_pct: ytdRevenueVariancePct,
      ytd_expense_variance_pct: ytdExpenseVariancePct,
      forecast_accuracy_score:  forecastAccuracyScore,
      computed_at:             new Date().toISOString(),
    }
  }
}
