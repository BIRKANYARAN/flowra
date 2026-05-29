// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cost-center.service.ts
//
// Cost Center Analysis & Expense Intelligence
//
// Classifies expenses into fixed/variable/semi-variable, computes breakeven
// metrics, contribution margin, cost concentration index, and cost structure
// health classification.
//
// Pure exported functions (testable):
//   classifyExpenseBehavior         — map expense_type → CostBehavior
//   computeFixedCostRatio           — fixed / total × 100
//   computeVariableCostRatio        — variable / revenue × 100
//   computeContributionMargin       — revenue - variableCosts
//   computeContributionMarginRatio  — CM / revenue × 100
//   computeBreakevenRevenue         — fixedCosts / CMR%
//   computeMarginOfSafety           — (actual - breakeven) / actual × 100
//   computeOperatingLeverageRatio   — CM / EBIT (DOL)
//   computeCostConcentrationIndex   — HHI × 10000
//   classifyCostStructureHealth     — flexible/balanced/rigid/fragile/insufficient_data
//
// Class: CostCenterService
//   getReport(companyId): Promise<CostCenterReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Cost behavior type ────────────────────────────────────────────────────────

export type CostBehavior = 'fixed' | 'variable' | 'semi_variable'

// ── Expense type → behavior mapping ──────────────────────────────────────────

export const EXPENSE_TYPE_TO_BEHAVIOR: Record<string, CostBehavior> = {
  // Fixed costs (don't change with volume)
  'rent':         'fixed',
  'kira':         'fixed',
  'salary':       'fixed',
  'maaş':         'fixed',
  'software':     'fixed',
  'yazılım':      'fixed',
  'insurance':    'fixed',
  'sigorta':      'fixed',
  'depreciation': 'fixed',
  'amortisman':   'fixed',

  // Variable costs (change with volume)
  'cogs':         'variable',
  'logistics':    'variable',
  'lojistik':     'variable',
  'shipping':     'variable',
  'kargo':        'variable',
  'commission':   'variable',
  'komisyon':     'variable',

  // Semi-variable (mixed)
  'utilities':    'semi_variable',
  'elektrik':     'semi_variable',
  'marketing':    'semi_variable',
  'pazarlama':    'semi_variable',
  'maintenance':  'semi_variable',
  'bakim':        'semi_variable',
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * classifyExpenseBehavior
 *
 * Look up expenseType in EXPENSE_TYPE_TO_BEHAVIOR (case-insensitive).
 * Returns 'semi_variable' if not found.
 */
export function classifyExpenseBehavior(
  expenseType: string | null,
): CostBehavior {
  if (!expenseType) return 'semi_variable'
  const key = expenseType.toLowerCase().trim()
  return EXPENSE_TYPE_TO_BEHAVIOR[key] ?? 'semi_variable'
}

/**
 * computeFixedCostRatio
 *
 * fixedCosts / totalCosts × 100.
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
 * computeVariableCostRatio
 *
 * variableCosts / totalRevenue × 100.
 * Returns null if totalRevenue === 0.
 */
export function computeVariableCostRatio(
  variableCosts: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (variableCosts / totalRevenue) * 100
}

/**
 * computeContributionMargin
 *
 * revenue - variableCosts.
 * Positive: profitable above variable costs; negative: loss.
 */
export function computeContributionMargin(
  revenue: number,
  variableCosts: number,
): number {
  return revenue - variableCosts
}

/**
 * computeContributionMarginRatio
 *
 * (revenue - variableCosts) / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeContributionMarginRatio(
  revenue: number,
  variableCosts: number,
): number | null {
  if (revenue === 0) return null
  return ((revenue - variableCosts) / revenue) * 100
}

/**
 * computeBreakevenRevenue
 *
 * fixedCosts / (contributionMarginRatioPct / 100).
 * Returns null if contributionMarginRatioPct is null or 0.
 */
export function computeBreakevenRevenue(
  fixedCosts: number,
  contributionMarginRatioPct: number | null,
): number | null {
  if (contributionMarginRatioPct === null || contributionMarginRatioPct === 0) return null
  return fixedCosts / (contributionMarginRatioPct / 100)
}

/**
 * computeMarginOfSafety
 *
 * (actualRevenue - breakevenRevenue) / actualRevenue × 100.
 * Returns null if breakevenRevenue is null or actualRevenue === 0.
 * Negative means operating below breakeven.
 */
export function computeMarginOfSafety(
  actualRevenue: number,
  breakevenRevenue: number | null,
): number | null {
  if (breakevenRevenue === null) return null
  if (actualRevenue === 0) return null
  return ((actualRevenue - breakevenRevenue) / actualRevenue) * 100
}

/**
 * computeOperatingLeverageRatio
 *
 * Degree of Operating Leverage = contributionMargin / ebit.
 * Returns null if ebit === 0. Can be negative.
 */
export function computeOperatingLeverageRatio(
  contributionMargin: number,
  ebit: number,
): number | null {
  if (ebit === 0) return null
  return contributionMargin / ebit
}

/**
 * computeCostConcentrationIndex
 *
 * Herfindahl-Hirschman Index for cost concentration:
 *   Σ (category_share²) × 10000
 * category_share = category.amount / total_amount (0–1)
 * Returns 0 if total_amount === 0 or categories is empty.
 *
 * Interpretation:
 *   < 1500  — diversified
 *   1500–2500 — moderate concentration
 *   > 2500  — highly concentrated
 */
export function computeCostConcentrationIndex(
  categories: Array<{ name: string; amount: number }>,
): number {
  if (categories.length === 0) return 0
  const totalAmount = categories.reduce((s, c) => s + c.amount, 0)
  if (totalAmount === 0) return 0

  const hhi = categories.reduce((sum, c) => {
    const share = c.amount / totalAmount
    return sum + share * share
  }, 0)

  return hhi * 10000
}

/**
 * classifyCostStructureHealth
 *
 * insufficient_data: both null
 * fragile:           marginOfSafety <= 0 (at or below breakeven)
 * rigid:             fixedCostRatio > 70 AND marginOfSafety < 20
 * flexible:          fixedCostRatio < 40 AND marginOfSafety > 40
 * balanced:          else
 */
export function classifyCostStructureHealth(
  fixedCostRatioPct: number | null,
  marginOfSafetyPct: number | null,
): 'flexible' | 'balanced' | 'rigid' | 'fragile' | 'insufficient_data' {
  if (fixedCostRatioPct === null && marginOfSafetyPct === null) return 'insufficient_data'

  if (marginOfSafetyPct !== null && marginOfSafetyPct <= 0) return 'fragile'

  if (
    fixedCostRatioPct !== null && fixedCostRatioPct > 70 &&
    marginOfSafetyPct !== null && marginOfSafetyPct < 20
  ) {
    return 'rigid'
  }

  if (
    fixedCostRatioPct !== null && fixedCostRatioPct < 40 &&
    marginOfSafetyPct !== null && marginOfSafetyPct > 40
  ) {
    return 'flexible'
  }

  return 'balanced'
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface CostCenterReport {
  current_month: {
    total_expenses:                  number
    fixed_costs:                     number
    variable_costs:                  number
    semi_variable_costs:             number
    fixed_cost_ratio_pct:            number | null
    variable_cost_ratio_pct:         number | null
    contribution_margin:             number
    contribution_margin_ratio_pct:   number | null
    breakeven_revenue:               number | null
    margin_of_safety_pct:            number | null
    operating_leverage_ratio:        number | null
    cost_structure: ReturnType<typeof classifyCostStructureHealth>
  }
  expense_categories: Array<{
    category:        string
    amount:          number
    pct_of_total:    number
    behavior:        CostBehavior
    mom_change_pct:  number | null
  }>
  concentration_index: number
  summary: {
    revenue:                  number
    ebit:                     number
    breakeven_coverage_pct:   number | null
  }
}

// ── Helper: current month range ───────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string } {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const from  = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to    = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function priorMonthRange(): { from: string; to: string } {
  const now    = new Date()
  const prior  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year   = prior.getFullYear()
  const month  = prior.getMonth() + 1
  const from   = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to     = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CostCenterService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<CostCenterReport> {
    const curr  = currentMonthRange()
    const prior = priorMonthRange()

    // Parallel: expenses (current + prior) + revenue (current)
    const [currExpResult, priorExpResult, revenueResult] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', curr.from)
        .lte('expense_date', curr.to),

      this.supabase
        .from('expenses')
        .select('expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', prior.from)
        .lte('expense_date', prior.to),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', curr.from)
        .lte('sale_date', curr.to)
        .not('payment_status', 'eq', 'cancelled'),
    ])

    // ── Aggregate current month expenses by expense_type ──────────────────────

    type ExpRow = { expense_type: string | null; amount_try: number }

    const currExpRows: ExpRow[] = currExpResult.status === 'fulfilled'
      ? ((currExpResult.value?.data ?? []) as ExpRow[])
      : []

    const priorExpRows: ExpRow[] = priorExpResult.status === 'fulfilled'
      ? ((priorExpResult.value?.data ?? []) as ExpRow[])
      : []

    // Group current by expense_type
    const currByType = new Map<string, number>()
    for (const row of currExpRows) {
      const key = String(row.expense_type ?? 'other').toLowerCase()
      currByType.set(key, (currByType.get(key) ?? 0) + Number(row.amount_try ?? 0))
    }

    // Group prior by expense_type
    const priorByType = new Map<string, number>()
    for (const row of priorExpRows) {
      const key = String(row.expense_type ?? 'other').toLowerCase()
      priorByType.set(key, (priorByType.get(key) ?? 0) + Number(row.amount_try ?? 0))
    }

    // ── Revenue ───────────────────────────────────────────────────────────────

    let revenue = 0
    if (revenueResult.status === 'fulfilled' && revenueResult.value?.data) {
      for (const row of revenueResult.value.data as Array<{ total_try: number }>) {
        revenue += Number(row.total_try ?? 0)
      }
    }

    // ── Classify costs by behavior ────────────────────────────────────────────

    let fixedCosts        = 0
    let variableCosts     = 0
    let semiVariableCosts = 0
    let totalExpenses     = 0

    const categoryList: Array<{
      category:       string
      amount:         number
      behavior:       CostBehavior
      mom_change_pct: number | null
    }> = []

    for (const [expType, amount] of currByType.entries()) {
      const behavior = classifyExpenseBehavior(expType)
      const priorAmt = priorByType.get(expType) ?? 0
      const momChangePct = priorAmt > 0
        ? ((amount - priorAmt) / priorAmt) * 100
        : null

      totalExpenses += amount

      switch (behavior) {
        case 'fixed':        fixedCosts        += amount; break
        case 'variable':     variableCosts     += amount; break
        case 'semi_variable': semiVariableCosts += amount; break
      }

      categoryList.push({ category: expType, amount, behavior, mom_change_pct: momChangePct })
    }

    // Sort by amount descending
    categoryList.sort((a, b) => b.amount - a.amount)

    // Build expense_categories with pct_of_total
    const expenseCategories = categoryList.map(c => ({
      category:       c.category,
      amount:         c.amount,
      pct_of_total:   totalExpenses > 0 ? (c.amount / totalExpenses) * 100 : 0,
      behavior:       c.behavior,
      mom_change_pct: c.mom_change_pct,
    }))

    // ── Derived metrics ───────────────────────────────────────────────────────

    const fixedCostRatioPct          = computeFixedCostRatio(fixedCosts, totalExpenses)
    const variableCostRatioPct       = computeVariableCostRatio(variableCosts, revenue)
    const contributionMargin         = computeContributionMargin(revenue, variableCosts)
    const contributionMarginRatioPct = computeContributionMarginRatio(revenue, variableCosts)
    const breakevenRevenue           = computeBreakevenRevenue(fixedCosts, contributionMarginRatioPct)
    const marginOfSafetyPct          = computeMarginOfSafety(revenue, breakevenRevenue)

    // EBIT estimate: revenue - COGS (≈ variableCosts for this module) - fixed/semi overhead
    const cogsEstimate = revenue > 0 ? variableCosts : 0
    const opexEstimate = fixedCosts + semiVariableCosts
    const ebit         = revenue - cogsEstimate - opexEstimate

    const operatingLeverageRatio     = computeOperatingLeverageRatio(contributionMargin, ebit)
    const costStructure              = classifyCostStructureHealth(fixedCostRatioPct, marginOfSafetyPct)

    // ── Concentration index ───────────────────────────────────────────────────

    const concentrationIndex = computeCostConcentrationIndex(
      categoryList.map(c => ({ name: c.category, amount: c.amount })),
    )

    // ── Breakeven coverage ────────────────────────────────────────────────────

    const breakevenCoveragePct = breakevenRevenue !== null && breakevenRevenue > 0
      ? (revenue / breakevenRevenue) * 100
      : null

    return {
      current_month: {
        total_expenses:                 totalExpenses,
        fixed_costs:                    fixedCosts,
        variable_costs:                 variableCosts,
        semi_variable_costs:            semiVariableCosts,
        fixed_cost_ratio_pct:           fixedCostRatioPct,
        variable_cost_ratio_pct:        variableCostRatioPct,
        contribution_margin:            contributionMargin,
        contribution_margin_ratio_pct:  contributionMarginRatioPct,
        breakeven_revenue:              breakevenRevenue,
        margin_of_safety_pct:           marginOfSafetyPct,
        operating_leverage_ratio:       operatingLeverageRatio,
        cost_structure:                 costStructure,
      },
      expense_categories: expenseCategories,
      concentration_index: concentrationIndex,
      summary: {
        revenue,
        ebit,
        breakeven_coverage_pct: breakevenCoveragePct,
      },
    }
  }
}
