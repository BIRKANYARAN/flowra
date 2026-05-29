// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cashflow-forecast.service.ts
//
// Cash Flow Forecasting Service — deterministic 13-week (90-day) rolling forecast.
//
// Queries last 3 months of data to estimate:
//   - avg monthly revenue + collection rate (from sales)
//   - avg monthly expenses (from expenses)
//   - current cash balance (from balance_sheet_snapshots)
//   - monthly loan repayments (from partner_loan_tranches)
//   - tax context (from partner_finance_events)
//
// All monetary values in TRY, rounded to integers in report.
// Week starts are Mondays (ISO week standard).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single weekly forecast bucket */
export interface WeeklyBucket {
  week_start: string      // YYYY-MM-DD (Monday)
  week_end: string        // YYYY-MM-DD (Sunday)
  week_number: number     // 1-13
  expected_inflows: number
  expected_outflows: number
  net_cashflow: number
  cumulative_cash: number
  is_negative: boolean
}

/** Per-category inflow or outflow breakdown */
export interface CashFlowCategory {
  category: string
  expected_amount: number
  probability: number             // 0-1
  risk_adjusted_amount: number    // expected_amount × probability
}

export interface CashFlowForecastReport {
  current_cash_estimate: number | null
  weekly_buckets: WeeklyBucket[]
  summary: ReturnType<typeof computeForecastSummary>
  liquidity_outlook: ReturnType<typeof classifyLiquidityOutlook>
  inflow_categories: CashFlowCategory[]
  outflow_categories: CashFlowCategory[]
  breakeven_weekly_revenue: number
  narrative: string
  data_quality: 'full' | 'partial' | 'estimated'
}

// ── Date utilities ────────────────────────────────────────────────────────────

/**
 * Returns the Monday of the week containing date (ISO week start).
 */
export function getIsoWeekStart(date: Date): Date {
  const d = new Date(date)
  // getDay(): 0=Sun, 1=Mon, ..., 6=Sat
  const day = d.getDay()
  // days since last Monday: if Sunday (0) → 6, else day - 1
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Format a Date as YYYY-MM-DD */
function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Build `weeks` weekly date ranges starting from next Monday.
 * Returns array of { week_start, week_end, week_number }.
 */
export function buildWeekBuckets(
  startDate: Date,
  weeks: number,
): Array<{ week_start: string; week_end: string; week_number: number }> {
  // Find the Monday of the current week, then advance to next Monday
  const currentWeekMonday = getIsoWeekStart(startDate)
  const nextMonday = new Date(currentWeekMonday)
  nextMonday.setDate(nextMonday.getDate() + 7)

  const buckets: Array<{ week_start: string; week_end: string; week_number: number }> = []
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(nextMonday)
    weekStart.setDate(weekStart.getDate() + i * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    buckets.push({
      week_start: toIsoDate(weekStart),
      week_end: toIsoDate(weekEnd),
      week_number: i + 1,
    })
  }
  return buckets
}

// ── Pure computation functions ────────────────────────────────────────────────

/**
 * Compute risk-adjusted amount: amount × probability, rounded to 2 decimal places.
 */
export function computeRiskAdjustedAmount(amount: number, probability: number): number {
  return round2(amount * probability)
}

/**
 * Apply growth factor to a base amount.
 * baseAmount × (1 + growthRate/52 × weekNumber), clamped to 0.
 */
export function applyGrowthFactor(
  baseAmount: number,
  growthRate: number,
  weekNumber: number,
): number {
  const result = baseAmount * (1 + (growthRate / 52) * weekNumber)
  return Math.max(0, round2(result))
}

/**
 * Compute weekly inflow categories.
 *
 * Categories:
 *   regular_collections: avgMonthlyRevenue/4.33 × collectionRate per week
 *   overdue_recovery:    overdueReceivables × expectedRecoveryRate / 13 per week
 */
export function computeWeeklyInflows(
  avgMonthlyRevenue: number,
  collectionRate: number,
  overdueReceivables: number,
  expectedRecoveryRate: number,
): CashFlowCategory[] {
  const weeklyRevenue = avgMonthlyRevenue / 4.33
  const regularAmount = round2(weeklyRevenue)
  const regularRisk = round2(weeklyRevenue * collectionRate)

  const overdueWeekly = round2(overdueReceivables * expectedRecoveryRate / 13)

  return [
    {
      category: 'regular_collections',
      expected_amount: regularAmount,
      probability: collectionRate,
      risk_adjusted_amount: regularRisk,
    },
    {
      category: 'overdue_recovery',
      expected_amount: overdueWeekly,
      probability: expectedRecoveryRate,
      risk_adjusted_amount: round2(overdueWeekly * expectedRecoveryRate),
    },
  ]
}

/**
 * Compute weekly outflow categories.
 *
 * Categories:
 *   operating_expenses: avgMonthlyExpenses/4.33 per week (probability 0.95)
 *   debt_service:       monthlyLoanRepayments/4.33 per week (probability 1.0)
 *   capex:              plannedCapex/13 per week (probability 0.70)
 *   tax_payments:       taxPaymentThisQuarter/13 per week (probability 1.0) or 0 if none
 */
export function computeWeeklyOutflows(
  avgMonthlyExpenses: number,
  monthlyLoanRepayments: number,
  plannedCapex: number,
  taxPaymentThisQuarter: number,
): CashFlowCategory[] {
  const opexWeekly = round2(avgMonthlyExpenses / 4.33)
  const debtWeekly = round2(monthlyLoanRepayments / 4.33)
  const capexWeekly = round2(plannedCapex / 13)
  const taxWeekly = round2(taxPaymentThisQuarter / 13)

  return [
    {
      category: 'operating_expenses',
      expected_amount: opexWeekly,
      probability: 0.95,
      risk_adjusted_amount: computeRiskAdjustedAmount(opexWeekly, 0.95),
    },
    {
      category: 'debt_service',
      expected_amount: debtWeekly,
      probability: 1.0,
      risk_adjusted_amount: computeRiskAdjustedAmount(debtWeekly, 1.0),
    },
    {
      category: 'capex',
      expected_amount: capexWeekly,
      probability: 0.70,
      risk_adjusted_amount: computeRiskAdjustedAmount(capexWeekly, 0.70),
    },
    {
      category: 'tax_payments',
      expected_amount: taxWeekly,
      probability: 1.0,
      risk_adjusted_amount: computeRiskAdjustedAmount(taxWeekly, 1.0),
    },
  ]
}

/**
 * Build 13 weekly buckets with running cumulative_cash.
 * is_negative: cumulative_cash < 0
 */
export function buildWeeklyForecast(
  currentCash: number,
  weeklyInflows: number,
  weeklyOutflows: number,
  weeks: number,
): WeeklyBucket[] {
  const bucketDates = buildWeekBuckets(new Date(), weeks)
  let cumulative = currentCash
  const result: WeeklyBucket[] = []

  for (let i = 0; i < weeks; i++) {
    const net = round2(weeklyInflows - weeklyOutflows)
    cumulative = round2(cumulative + net)
    const dates = bucketDates[i]
    result.push({
      week_start: dates.week_start,
      week_end: dates.week_end,
      week_number: dates.week_number,
      expected_inflows: round2(weeklyInflows),
      expected_outflows: round2(weeklyOutflows),
      net_cashflow: net,
      cumulative_cash: cumulative,
      is_negative: cumulative < 0,
    })
  }
  return result
}

/**
 * Compute summary statistics across all weekly buckets.
 */
export function computeForecastSummary(buckets: WeeklyBucket[]): {
  total_inflows: number
  total_outflows: number
  net_position_change: number
  weeks_positive: number
  weeks_negative: number
  first_negative_week: number | null
  worst_week_net: number
  best_week_net: number
  min_cumulative_cash: number
  max_cumulative_cash: number
} {
  if (buckets.length === 0) {
    return {
      total_inflows: 0,
      total_outflows: 0,
      net_position_change: 0,
      weeks_positive: 0,
      weeks_negative: 0,
      first_negative_week: null,
      worst_week_net: 0,
      best_week_net: 0,
      min_cumulative_cash: 0,
      max_cumulative_cash: 0,
    }
  }

  let total_inflows = 0
  let total_outflows = 0
  let weeks_positive = 0
  let weeks_negative = 0
  let first_negative_week: number | null = null
  let worst_week_net = buckets[0].net_cashflow
  let best_week_net = buckets[0].net_cashflow
  let min_cumulative_cash = buckets[0].cumulative_cash
  let max_cumulative_cash = buckets[0].cumulative_cash

  for (const bucket of buckets) {
    total_inflows = round2(total_inflows + bucket.expected_inflows)
    total_outflows = round2(total_outflows + bucket.expected_outflows)

    if (bucket.is_negative) {
      weeks_negative++
      if (first_negative_week === null) {
        first_negative_week = bucket.week_number
      }
    } else {
      weeks_positive++
    }

    if (bucket.net_cashflow < worst_week_net) worst_week_net = bucket.net_cashflow
    if (bucket.net_cashflow > best_week_net) best_week_net = bucket.net_cashflow
    if (bucket.cumulative_cash < min_cumulative_cash) min_cumulative_cash = bucket.cumulative_cash
    if (bucket.cumulative_cash > max_cumulative_cash) max_cumulative_cash = bucket.cumulative_cash
  }

  const net_position_change = round2(total_inflows - total_outflows)

  return {
    total_inflows,
    total_outflows,
    net_position_change,
    weeks_positive,
    weeks_negative,
    first_negative_week,
    worst_week_net,
    best_week_net,
    min_cumulative_cash,
    max_cumulative_cash,
  }
}

/**
 * Classify liquidity outlook based on forecast data.
 *
 * strong:   no negative weeks AND minCumulative >= currentCash × 0.5
 * stable:   no negative weeks
 * cautious: firstNegativeWeek > 8
 * at_risk:  firstNegativeWeek > 4
 * critical: firstNegativeWeek <= 4 or minCumulativeCash < 0
 */
export function classifyLiquidityOutlook(
  firstNegativeWeek: number | null,
  minCumulativeCash: number,
  currentCash: number,
): 'strong' | 'stable' | 'cautious' | 'at_risk' | 'critical' {
  if (firstNegativeWeek === null) {
    // No negative weeks
    if (minCumulativeCash >= currentCash * 0.5) return 'strong'
    return 'stable'
  }
  if (minCumulativeCash < 0) return 'critical'
  if (firstNegativeWeek <= 4) return 'critical'
  if (firstNegativeWeek <= 8) return 'at_risk'
  return 'cautious'
}

/**
 * Compute the weekly revenue needed to break even.
 * weeklyOutflows / collectionRate (null-safe: if collectionRate <= 0 return weeklyOutflows)
 */
export function computeBreakevenWeeklyRevenue(
  weeklyOutflows: number,
  collectionRate: number,
): number {
  if (collectionRate <= 0) return weeklyOutflows
  return round2(weeklyOutflows / collectionRate)
}

/**
 * Generate a deterministic Turkish forecast narrative.
 */
export function generateForecastNarrative(
  currentCash: number,
  outlook: ReturnType<typeof classifyLiquidityOutlook>,
  summary: ReturnType<typeof computeForecastSummary>,
  mrrApprox: number,
): string {
  void currentCash
  void mrrApprox
  switch (outlook) {
    case 'strong':
      return 'Nakit pozisyonu güçlü — 13 haftalık projeksiyonda negatif hafta bulunmuyor.'
    case 'stable':
      return 'Nakit akışı dengede — önümüzdeki 13 haftada pozitif kalmaya devam ediyor.'
    case 'cautious':
      return `Dikkat önerilir — ${summary.first_negative_week}. haftada nakit sıkışması olabilir.`
    case 'at_risk':
      return `Risk altında — ${summary.first_negative_week}. haftada nakit yetersizliği bekleniyor.`
    case 'critical':
      return 'Kritik — önümüzdeki 4 haftada nakit açığı riski yüksek.'
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CashFlowForecastService {
  constructor(private readonly supabase: AnyClient) {}

  async getForecast(companyId: string): Promise<CashFlowForecastReport> {
    const now = new Date()
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const fromDate = toIsoDate(threeMonthsAgo)
    const toDate = toIsoDate(now)

    // ── Parallel data fetches ──────────────────────────────────────────────────
    const [salesResult, expensesResult, cashResult, loanResult, taxResult] =
      await Promise.allSettled([
        // 1. Sales last 3 months (for avg revenue + collection rate)
        this.supabase
          .from('sales')
          .select('sale_date, total_try, paid_amount_try, status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', fromDate)
          .lte('sale_date', toDate),

        // 2. Expenses last 3 months
        this.supabase
          .from('expenses')
          .select('expense_date, amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', fromDate)
          .lte('expense_date', toDate),

        // 3. Latest cash balance from balance_sheet_snapshots
        this.supabase
          .from('balance_sheet_snapshots')
          .select('snapshot_date, cash_and_equivalents_try')
          .eq('company_id', companyId)
          .order('snapshot_date', { ascending: false })
          .limit(1),

        // 4. Monthly loan repayments from partner_loan_tranches
        this.supabase
          .from('partner_loan_tranches')
          .select('monthly_repayment_try, status')
          .eq('company_id', companyId)
          .eq('status', 'active'),

        // 5. Tax context from partner_finance_events
        this.supabase
          .from('partner_finance_events')
          .select('event_type, amount_try, due_date')
          .eq('company_id', companyId)
          .eq('event_type', 'tax_payment')
          .gte('due_date', toIsoDate(now))
          .lte('due_date', toIsoDate(new Date(now.getFullYear(), now.getMonth() + 3, 0))),
      ])

    // ── Process sales data ─────────────────────────────────────────────────────
    let totalSalesRevenue = 0
    let totalPaidSalesRevenue = 0
    let salesMonthCount = 3 // assume 3 months window

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        totalSalesRevenue = round2(totalSalesRevenue + (Number(row.total_try) || 0))
        // Count paid amounts (fully or partially paid)
        const paid = Number(row.paid_amount_try) || 0
        totalPaidSalesRevenue = round2(totalPaidSalesRevenue + paid)
      }
    }

    const avgMonthlyRevenue = salesMonthCount > 0
      ? round2(totalSalesRevenue / salesMonthCount)
      : 0
    const collectionRate = totalSalesRevenue > 0
      ? Math.min(1, round2(totalPaidSalesRevenue / totalSalesRevenue))
      : 0.85 // default assumption

    // ── Process expenses data ──────────────────────────────────────────────────
    let totalExpenses = 0

    if (expensesResult.status === 'fulfilled' && expensesResult.value?.data) {
      for (const row of expensesResult.value.data) {
        totalExpenses = round2(totalExpenses + (Number(row.amount_try) || 0))
      }
    }

    const avgMonthlyExpenses = round2(totalExpenses / 3)

    // ── Process cash balance ───────────────────────────────────────────────────
    let currentCash: number | null = null
    let dataQuality: 'full' | 'partial' | 'estimated' = 'estimated'

    if (cashResult.status === 'fulfilled' && cashResult.value?.data && cashResult.value.data.length > 0) {
      const latest = cashResult.value.data[0]
      const cashVal = Number(latest.cash_and_equivalents_try)
      if (Number.isFinite(cashVal)) {
        currentCash = cashVal
        dataQuality = 'full'
      }
    }

    // If no cash snapshot, estimate from GL (partial)
    if (currentCash === null && avgMonthlyRevenue > 0) {
      currentCash = round2(avgMonthlyRevenue * 0.5) // rough estimate
      dataQuality = 'partial'
    }

    const effectiveCash = currentCash ?? 0

    // ── Process loan repayments ────────────────────────────────────────────────
    let monthlyLoanRepayments = 0

    if (loanResult.status === 'fulfilled' && loanResult.value?.data) {
      for (const row of loanResult.value.data) {
        monthlyLoanRepayments = round2(
          monthlyLoanRepayments + (Number(row.monthly_repayment_try) || 0),
        )
      }
    }

    // ── Process tax payments ───────────────────────────────────────────────────
    let taxPaymentThisQuarter = 0

    if (taxResult.status === 'fulfilled' && taxResult.value?.data) {
      for (const row of taxResult.value.data) {
        taxPaymentThisQuarter = round2(
          taxPaymentThisQuarter + (Number(row.amount_try) || 0),
        )
      }
    }

    // ── Build forecast ─────────────────────────────────────────────────────────
    const inflowCategories = computeWeeklyInflows(
      avgMonthlyRevenue,
      collectionRate,
      0,  // overdueReceivables — not queried separately in this implementation
      0.3, // expectedRecoveryRate — default
    )

    const outflowCategories = computeWeeklyOutflows(
      avgMonthlyExpenses,
      monthlyLoanRepayments,
      0,  // plannedCapex — not tracked separately
      taxPaymentThisQuarter,
    )

    // Aggregate weekly totals using risk-adjusted amounts
    const weeklyInflows = round2(
      inflowCategories.reduce((s, c) => s + c.risk_adjusted_amount, 0),
    )
    const weeklyOutflows = round2(
      outflowCategories.reduce((s, c) => s + c.risk_adjusted_amount, 0),
    )

    const weeklyBuckets = buildWeeklyForecast(effectiveCash, weeklyInflows, weeklyOutflows, 13)
    const summary = computeForecastSummary(weeklyBuckets)

    const outlook = classifyLiquidityOutlook(
      summary.first_negative_week,
      summary.min_cumulative_cash,
      effectiveCash,
    )

    const breakeven = computeBreakevenWeeklyRevenue(weeklyOutflows, collectionRate)
    const narrative = generateForecastNarrative(
      effectiveCash,
      outlook,
      summary,
      avgMonthlyRevenue,
    )

    return {
      current_cash_estimate: currentCash,
      weekly_buckets: weeklyBuckets,
      summary,
      liquidity_outlook: outlook,
      inflow_categories: inflowCategories,
      outflow_categories: outflowCategories,
      breakeven_weekly_revenue: breakeven,
      narrative,
      data_quality: dataQuality,
    }
  }
}
