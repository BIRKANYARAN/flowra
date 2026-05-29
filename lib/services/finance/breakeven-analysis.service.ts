// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/breakeven-analysis.service.ts
//
// Breakeven Analysis Service
//
// Computes company-level and per-product breakeven points, safety margins,
// and operating leverage for cash flow planning.
//
// Pure exported functions (testable):
//   computeUnitContributionMargin      — selling price - variable cost per unit
//   computeContributionMarginRatio     — CM / selling price (as decimal)
//   computeBreakevenUnits              — fixed_costs / unit_CM (null if CM=0)
//   computeBreakevenRevenue            — fixed_costs / CMR (null if CMR=0)
//   computeMarginOfSafety              — current - breakeven (clamped at 0)
//   computeMarginOfSafetyPct           — MOS / current_revenue × 100
//   computeOperatingLeverage           — CM / EBIT (null if EBIT ≤ 0)
//   computeTargetRevenue               — (fixed + target_profit) / CMR
//   classifyMarginOfSafetyHealth       — excellent/good/adequate/thin/critical/below_breakeven
//   computeProductBreakeven            — full ProductBreakeven object
//   computeWeightedAvgCmr              — revenue-weighted CMR across products
//   computeDaysToBreakeven             — BEP / daily_revenue
//   classifyOperatingLeverageRisk      — high_risk/elevated/moderate/low/na
//
// Class: BreakevenAnalysisService
//   getReport(companyId): Promise<BreakevenAnalysisReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { classifyExpenseBehavior } from './cost-center.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BreakevenPoint {
  revenue_try: number
  units: number | null
  margin_of_safety_try: number
  margin_of_safety_pct: number
  operating_leverage: number
}

export interface ProductBreakeven {
  product_id: string
  product_name: string
  selling_price: number
  variable_cost: number
  unit_contribution_margin: number
  contribution_margin_pct: number
  breakeven_units: number | null
  breakeven_revenue: number | null
  current_units_sold: number
  current_revenue: number
  margin_of_safety_units: number | null
  is_above_breakeven: boolean
  allocated_fixed_cost: number
}

export interface BreakevenAnalysisReport {
  period: string
  analysis_days: number

  // Company-level
  fixed_costs_try: number
  variable_costs_try: number
  total_revenue_try: number
  contribution_margin_try: number
  contribution_margin_ratio: number
  contribution_margin_pct: number
  breakeven_revenue_try: number | null
  current_ebit_try: number
  margin_of_safety_try: number
  margin_of_safety_pct: number
  margin_of_safety_health: ReturnType<typeof classifyMarginOfSafetyHealth>
  operating_leverage: number | null
  operating_leverage_risk: ReturnType<typeof classifyOperatingLeverageRisk>
  days_to_breakeven: number | null

  // Targets
  revenue_for_10pct_profit: number | null
  revenue_for_20pct_profit: number | null

  // Per-product (top 10 by revenue)
  product_breakevenss: ProductBreakeven[]
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeUnitContributionMargin
 *
 * sellingPrice - variableCostPerUnit
 */
export function computeUnitContributionMargin(
  sellingPrice: number,
  variableCostPerUnit: number,
): number {
  return sellingPrice - variableCostPerUnit
}

/**
 * computeContributionMarginRatio
 *
 * contributionMargin / sellingPrice (as decimal, not %).
 * Returns 0 if sellingPrice = 0.
 */
export function computeContributionMarginRatio(
  contributionMargin: number,
  sellingPrice: number,
): number {
  if (sellingPrice === 0) return 0
  return contributionMargin / sellingPrice
}

/**
 * computeBreakevenUnits
 *
 * fixed_costs / unit_contribution_margin.
 * Returns null if unit_contribution_margin = 0.
 */
export function computeBreakevenUnits(
  fixedCosts: number,
  unitContributionMargin: number,
): number | null {
  if (unitContributionMargin === 0) return null
  return fixedCosts / unitContributionMargin
}

/**
 * computeBreakevenRevenue
 *
 * fixed_costs / contribution_margin_ratio.
 * Returns null if cmr = 0.
 */
export function computeBreakevenRevenue(
  fixedCosts: number,
  contributionMarginRatio: number,
): number | null {
  if (contributionMarginRatio === 0) return null
  return fixedCosts / contributionMarginRatio
}

/**
 * computeMarginOfSafety
 *
 * current_revenue - breakeven_revenue.
 * Returns 0 if breakeven > current (operating at loss).
 */
export function computeMarginOfSafety(
  currentRevenue: number,
  breakevenRevenue: number,
): number {
  const mos = currentRevenue - breakevenRevenue
  return mos < 0 ? 0 : mos
}

/**
 * computeMarginOfSafetyPct
 *
 * margin_of_safety / current_revenue × 100.
 * Returns 0 if no revenue.
 */
export function computeMarginOfSafetyPct(
  marginOfSafety: number,
  currentRevenue: number,
): number {
  if (currentRevenue === 0) return 0
  return (marginOfSafety / currentRevenue) * 100
}

/**
 * computeOperatingLeverage
 *
 * contribution_margin / ebit.
 * Returns null if ebit ≤ 0 (can't compute meaningful leverage when at loss).
 */
export function computeOperatingLeverage(
  contributionMargin: number,
  ebit: number,
): number | null {
  if (ebit <= 0) return null
  return contributionMargin / ebit
}

/**
 * computeTargetRevenue
 *
 * (fixed_costs + target_profit) / cmr.
 * Returns null if cmr = 0.
 */
export function computeTargetRevenue(
  fixedCosts: number,
  targetProfit: number,
  contributionMarginRatio: number,
): number | null {
  if (contributionMarginRatio === 0) return null
  return (fixedCosts + targetProfit) / contributionMarginRatio
}

/**
 * classifyMarginOfSafetyHealth
 *
 * excellent:       ≥ 40%
 * good:            ≥ 25%
 * adequate:        ≥ 15%
 * thin:            ≥ 5%
 * critical:        < 5% (near or at breakeven)
 * below_breakeven: margin of safety < 0
 */
export function classifyMarginOfSafetyHealth(
  marginOfSafetyPct: number,
): 'excellent' | 'good' | 'adequate' | 'thin' | 'critical' | 'below_breakeven' {
  if (marginOfSafetyPct < 0)  return 'below_breakeven'
  if (marginOfSafetyPct >= 40) return 'excellent'
  if (marginOfSafetyPct >= 25) return 'good'
  if (marginOfSafetyPct >= 15) return 'adequate'
  if (marginOfSafetyPct >= 5)  return 'thin'
  return 'critical'
}

/**
 * computeProductBreakeven
 *
 * Computes full ProductBreakeven object for a specific product.
 * fixed_cost_allocation: the portion of fixed costs allocated to this product.
 */
export function computeProductBreakeven(
  productId: string,
  productName: string,
  sellingPrice: number,
  variableCost: number,
  currentUnitsSold: number,
  allocatedFixedCost: number,
): ProductBreakeven {
  const unitCM   = computeUnitContributionMargin(sellingPrice, variableCost)
  const cmRatio  = computeContributionMarginRatio(unitCM, sellingPrice)
  const cmPct    = cmRatio * 100

  const bepUnits   = computeBreakevenUnits(allocatedFixedCost, unitCM)
  const currentRev = sellingPrice * currentUnitsSold
  const bepRevenue = bepUnits !== null ? bepUnits * sellingPrice : null

  const mosUnits = bepUnits !== null
    ? (currentUnitsSold - bepUnits < 0 ? 0 : currentUnitsSold - bepUnits)
    : null

  const isAboveBreakeven = bepUnits !== null
    ? currentUnitsSold >= bepUnits
    : currentRev > 0

  return {
    product_id:               productId,
    product_name:             productName,
    selling_price:            sellingPrice,
    variable_cost:            variableCost,
    unit_contribution_margin: unitCM,
    contribution_margin_pct:  cmPct,
    breakeven_units:          bepUnits,
    breakeven_revenue:        bepRevenue,
    current_units_sold:       currentUnitsSold,
    current_revenue:          currentRev,
    margin_of_safety_units:   mosUnits,
    is_above_breakeven:       isAboveBreakeven,
    allocated_fixed_cost:     allocatedFixedCost,
  }
}

/**
 * computeWeightedAvgCmr
 *
 * Revenue-weighted average contribution margin ratio across products.
 * Returns 0 if total revenue = 0.
 */
export function computeWeightedAvgCmr(
  products: Array<{ revenue: number; cm_ratio: number }>,
): number {
  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0)
  if (totalRevenue === 0) return 0
  const weightedSum = products.reduce((s, p) => s + p.revenue * p.cm_ratio, 0)
  return weightedSum / totalRevenue
}

/**
 * computeDaysToBreakeven
 *
 * breakeven_revenue / (current_revenue / analysis_days).
 * Returns null if daily_revenue = 0.
 */
export function computeDaysToBreakeven(
  breakevenRevenue: number,
  currentRevenue: number,
  analysisDays: number,
): number | null {
  if (analysisDays === 0) return null
  const dailyRevenue = currentRevenue / analysisDays
  if (dailyRevenue === 0) return null
  return breakevenRevenue / dailyRevenue
}

/**
 * classifyOperatingLeverageRisk
 *
 * high_risk: leverage > 5
 * elevated:  leverage > 3
 * moderate:  leverage > 2
 * low:       leverage ≤ 2
 * na:        null leverage (at/below breakeven)
 */
export function classifyOperatingLeverageRisk(
  operatingLeverage: number | null,
): 'high_risk' | 'elevated' | 'moderate' | 'low' | 'na' {
  if (operatingLeverage === null) return 'na'
  if (operatingLeverage > 5)     return 'high_risk'
  if (operatingLeverage > 3)     return 'elevated'
  if (operatingLeverage > 2)     return 'moderate'
  return 'low'
}

// ── Helper: current month range ───────────────────────────────────────────────

function currentMonthRange(): { from: string; to: string; period: string; days: number } {
  const now      = new Date()
  const year     = now.getFullYear()
  const month    = now.getMonth() + 1
  const from     = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay  = new Date(year, month, 0).getDate()
  const to       = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const period   = `${year}-${String(month).padStart(2, '0')}`
  return { from, to, period, days: lastDay }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class BreakevenAnalysisService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<BreakevenAnalysisReport> {
    const { from, to, period, days } = currentMonthRange()

    // Parallel fetches: expenses + sales + sale items
    const [expResult, salesResult, saleItemsResult] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),

      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('payment_status', 'eq', 'cancelled'),

      this.supabase
        .from('sale_items')
        .select('product_id, product_name, qty, unit_price, unit_cost')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', from)
        .lte('created_at', to),
    ])

    // ── Revenue ───────────────────────────────────────────────────────────────

    type SaleRow     = { total_try: number }
    type SaleItemRow = { product_id: string; product_name: string; qty: number; unit_price: number; unit_cost: number }
    type ExpRow      = { expense_type: string | null; amount_try: number }

    let totalRevenue = 0
    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data as SaleRow[]) {
        totalRevenue += Number(row.total_try ?? 0)
      }
    }

    // ── Expense classification ────────────────────────────────────────────────

    const expRows: ExpRow[] = expResult.status === 'fulfilled'
      ? ((expResult.value?.data ?? []) as ExpRow[])
      : []

    let fixedCosts        = 0
    let variableCosts     = 0
    let semiVariableCosts = 0

    for (const row of expRows) {
      const behavior = classifyExpenseBehavior(row.expense_type)
      const amount   = Number(row.amount_try ?? 0)
      switch (behavior) {
        case 'fixed':        fixedCosts        += amount; break
        case 'variable':     variableCosts     += amount; break
        case 'semi_variable': semiVariableCosts += amount; break
      }
    }

    // Semi-variable: split 50/50 between fixed and variable
    fixedCosts    += semiVariableCosts * 0.5
    variableCosts += semiVariableCosts * 0.5

    // If COGS data not available from expenses, estimate as 40% of revenue
    if (variableCosts === 0 && totalRevenue > 0) {
      variableCosts = totalRevenue * 0.4
    }

    // ── Company-level metrics ─────────────────────────────────────────────────

    const contributionMarginTry = totalRevenue - variableCosts
    const cmRatio = computeContributionMarginRatio(contributionMarginTry, totalRevenue)
    const cmPct   = cmRatio * 100

    const bepRevenue = computeBreakevenRevenue(fixedCosts, cmRatio)

    const ebit = totalRevenue - variableCosts - fixedCosts

    const mosTry = bepRevenue !== null
      ? computeMarginOfSafety(totalRevenue, bepRevenue)
      : 0

    // For MOS% classification, use signed value
    const signedMosPct = bepRevenue !== null && totalRevenue > 0
      ? ((totalRevenue - bepRevenue) / totalRevenue) * 100
      : 0

    const mosPct = computeMarginOfSafetyPct(mosTry, totalRevenue)

    const mosHealth = classifyMarginOfSafetyHealth(signedMosPct)

    const opLeverage = computeOperatingLeverage(contributionMarginTry, ebit)
    const opLeverageRisk = classifyOperatingLeverageRisk(opLeverage)

    const daysToBreakeven = bepRevenue !== null
      ? computeDaysToBreakeven(bepRevenue, totalRevenue, days)
      : null

    // Targets
    const target10pct = computeTargetRevenue(fixedCosts, totalRevenue * 0.10, cmRatio)
    const target20pct = computeTargetRevenue(fixedCosts, totalRevenue * 0.20, cmRatio)

    // ── Product breakeven ─────────────────────────────────────────────────────

    const saleItemRows: SaleItemRow[] = saleItemsResult.status === 'fulfilled'
      ? ((saleItemsResult.value?.data ?? []) as SaleItemRow[])
      : []

    // Aggregate by product_id
    const productMap = new Map<string, {
      product_id: string
      product_name: string
      total_qty: number
      total_revenue: number
      total_cost: number
    }>()

    for (const row of saleItemRows) {
      const pid  = String(row.product_id ?? 'unknown')
      const qty  = Number(row.qty ?? 0)
      const rev  = Number(row.unit_price ?? 0) * qty
      const cost = Number(row.unit_cost  ?? 0) * qty

      if (!productMap.has(pid)) {
        productMap.set(pid, {
          product_id:    pid,
          product_name:  String(row.product_name ?? pid),
          total_qty:     0,
          total_revenue: 0,
          total_cost:    0,
        })
      }
      const p = productMap.get(pid)!
      p.total_qty     += qty
      p.total_revenue += rev
      p.total_cost    += cost
    }

    // Sort by revenue, take top 10
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10)

    const totalProductRevenue = topProducts.reduce((s, p) => s + p.total_revenue, 0) || 1

    const productBreakevens: ProductBreakeven[] = topProducts.map(p => {
      const avgUnitPrice = p.total_qty > 0 ? p.total_revenue / p.total_qty : 0
      const avgUnitCost  = p.total_qty > 0 ? p.total_cost  / p.total_qty : 0
      // Allocate fixed costs proportionally to this product's revenue share
      const revenueShare = p.total_revenue / totalProductRevenue
      const allocatedFixed = fixedCosts * revenueShare

      return computeProductBreakeven(
        p.product_id,
        p.product_name,
        avgUnitPrice,
        avgUnitCost,
        p.total_qty,
        allocatedFixed,
      )
    })

    return {
      period,
      analysis_days: days,

      fixed_costs_try:          fixedCosts,
      variable_costs_try:       variableCosts,
      total_revenue_try:        totalRevenue,
      contribution_margin_try:  contributionMarginTry,
      contribution_margin_ratio: cmRatio,
      contribution_margin_pct:   cmPct,
      breakeven_revenue_try:    bepRevenue,
      current_ebit_try:         ebit,
      margin_of_safety_try:     mosTry,
      margin_of_safety_pct:     mosPct,
      margin_of_safety_health:  mosHealth,
      operating_leverage:       opLeverage,
      operating_leverage_risk:  opLeverageRisk,
      days_to_breakeven:        daysToBreakeven,

      revenue_for_10pct_profit: target10pct,
      revenue_for_20pct_profit: target20pct,

      product_breakevenss: productBreakevens,
    }
  }
}
