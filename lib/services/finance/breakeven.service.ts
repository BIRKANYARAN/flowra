// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/breakeven.service.ts
//
// Break-Even Analysis — at what revenue does the company cover all costs?
//
// Cost classification (simplified):
//   Fixed:    salary, rent, software, utilities, general, operational
//   Variable: COGS (from FinanceService cost_try), logistics, marketing, tax
//
// Break-even formula:
//   BE Revenue = Fixed Costs / Contribution Margin Rate
//   CMR        = 1 - Variable Cost Rate
//   VCR        = Variable Costs / Revenue
//
// Margin of safety:
//   MOS% = (Actual Revenue - BE Revenue) / Actual Revenue × 100
//
// Target profit scenario (default 10% net margin):
//   Revenue needed = (Fixed Costs + Target Profit) / CMR
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import { FinanceService } from '@/lib/services/finance.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface BreakEvenAnalysis {
  period_from: string
  period_to:   string

  // Cost classification
  estimated_fixed_costs_try:    number
  estimated_variable_costs_try: number
  variable_cost_rate:           number  // variable_costs / revenue (0–1)

  // Contribution margin
  contribution_margin_try:  number   // revenue - variable_costs
  contribution_margin_rate: number   // 1 - variable_cost_rate

  // Break-even
  breakeven_revenue_try:    number        // fixed_costs / contribution_margin_rate
  breakeven_units_revenue:  number | null // null — unit price not tracked here

  // Current position
  actual_revenue_try:       number
  revenue_vs_breakeven_try: number   // actual - breakeven (positive = above)
  is_above_breakeven:       boolean
  margin_of_safety_pct:     number | null  // (actual - breakeven) / actual × 100

  // Target profit scenario (10% net margin)
  target_profit_inputs: {
    target_profit_try: number    // target = actual_revenue × 0.10
    revenue_needed_try: number   // = (fixed + target) / contribution_margin_rate
  }

  computed_at: string
}

// ── Expense classification ─────────────────────────────────────────────────────

const FIXED_EXPENSE_TYPES = new Set([
  'salary', 'rent', 'software', 'utilities', 'general', 'operational',
  'fixed', 'capital', 'financial', 'interest',
])

const VARIABLE_EXPENSE_TYPES = new Set([
  'logistics', 'marketing', 'tax', 'variable',
  'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer',
])

export class BreakEvenService {

  /**
   * Compute break-even analysis for a given period.
   */
  static async getAnalysis(
    companyId: string,
    uid: string,
    supabase: AnyClient,
    period: { from: string; to: string },
  ): Promise<BreakEvenAnalysis> {

    // ── 1. Get revenue and COGS from FinanceService ────────────────────────────
    let actual_revenue_try   = 0
    let cogs_try             = 0
    let expenses_total_try   = 0

    try {
      const summary = await FinanceService.getFinancialSummary(
        uid, companyId, period, undefined, undefined, supabase,
      )
      actual_revenue_try = round2(summary.revenue_try)
      cogs_try           = round2(summary.cost_try)
      expenses_total_try = round2(summary.expenses_total_try)
    } catch {
      actual_revenue_try = 0
      cogs_try           = 0
      expenses_total_try = 0
    }

    // ── 2. Fetch expense breakdown for fixed/variable classification ───────────
    let fixed_expenses_try    = 0
    let variable_expenses_try = 0

    try {
      const { data: expenseRows } = await supabase
        .from('expenses')
        .select('expense_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'cancelled')
        .gte('expense_date', period.from)
        .lte('expense_date', period.to)

      for (const row of (expenseRows ?? [])) {
        const amount = Number(row.amount_try) || 0
        const classification = BreakEvenService.classifyExpense(row.expense_type ?? 'other')
        if (classification === 'fixed') {
          fixed_expenses_try    += amount
        } else {
          variable_expenses_try += amount
        }
      }
      fixed_expenses_try    = round2(fixed_expenses_try)
      variable_expenses_try = round2(variable_expenses_try)
    } catch {
      // Fall back to 60/40 split of total expenses
      fixed_expenses_try    = round2(expenses_total_try * 0.6)
      variable_expenses_try = round2(expenses_total_try * 0.4)
    }

    // ── 3. COGS is always variable ─────────────────────────────────────────────
    const total_variable_costs = round2(cogs_try + variable_expenses_try)
    const total_fixed_costs    = fixed_expenses_try

    // ── 4. Contribution margin ─────────────────────────────────────────────────
    const contribution_margin_try = round2(actual_revenue_try - total_variable_costs)

    const variable_cost_rate = actual_revenue_try > 0
      ? round2(total_variable_costs / actual_revenue_try * 10000) / 10000
      : 0

    const contribution_margin_rate = round2((1 - variable_cost_rate) * 10000) / 10000

    // ── 5. Break-even revenue ─────────────────────────────────────────────────
    const breakeven_revenue_try = BreakEvenService.computeBreakeven(
      total_fixed_costs,
      contribution_margin_rate,
    )

    // ── 6. Current position ────────────────────────────────────────────────────
    const revenue_vs_breakeven_try = round2(actual_revenue_try - breakeven_revenue_try)
    const is_above_breakeven       = actual_revenue_try >= breakeven_revenue_try

    const margin_of_safety_pct = actual_revenue_try > 0
      ? round2((actual_revenue_try - breakeven_revenue_try) / actual_revenue_try * 100)
      : null

    // ── 7. Target profit scenario (10% net margin) ─────────────────────────────
    const target_profit_try   = round2(actual_revenue_try * 0.10)
    const revenue_needed_try  = contribution_margin_rate > 0
      ? round2((total_fixed_costs + target_profit_try) / contribution_margin_rate)
      : Infinity

    return {
      period_from:                  period.from,
      period_to:                    period.to,
      estimated_fixed_costs_try:    total_fixed_costs,
      estimated_variable_costs_try: total_variable_costs,
      variable_cost_rate,
      contribution_margin_try,
      contribution_margin_rate,
      breakeven_revenue_try,
      breakeven_units_revenue:      null,  // unit price not available here
      actual_revenue_try,
      revenue_vs_breakeven_try,
      is_above_breakeven,
      margin_of_safety_pct,
      target_profit_inputs: {
        target_profit_try,
        revenue_needed_try,
      },
      computed_at: new Date().toISOString(),
    }
  }

  // ── Pure helpers ─────────────────────────────────────────────────────────────

  /**
   * Classify an expense type as fixed or variable.
   */
  static classifyExpense(expenseType: string): 'fixed' | 'variable' {
    const lower = (expenseType ?? '').toLowerCase().trim()
    if (FIXED_EXPENSE_TYPES.has(lower)) return 'fixed'
    if (VARIABLE_EXPENSE_TYPES.has(lower)) return 'variable'
    // Default: treat unknown as fixed (conservative)
    return 'fixed'
  }

  /**
   * Pure: compute break-even revenue.
   * Returns Infinity if contributionMarginRate is 0 to avoid division by zero.
   */
  static computeBreakeven(fixedCosts: number, contributionMarginRate: number): number {
    if (contributionMarginRate <= 0) return Infinity
    return round2(fixedCosts / contributionMarginRate)
  }
}
