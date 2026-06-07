// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cash-forecast.service.ts
//
// 13-Week Rolling Cash Flow Forecast
//
// Projects weekly cash inflows and outflows for the next 13 weeks (one quarter)
// based on historical sales/expense averages, DSO/DPO metrics, and known
// upcoming obligations (e.g. loan repayments).
//
// Pure functions are exported for unit testing.
// CashForecastService wraps DB access.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnownObligation {
  week:   number   // 1-indexed week number (1–13)
  amount: number   // negative = cash out, positive = cash in
  label:  string
}

export interface WeeklyForecastRow {
  week:            number
  inflow:          number
  outflow:         number
  net:             number
  closing_cash:    number
  has_obligation:  boolean
  obligations:     Array<{ label: string; amount: number }>
}

export type CashHealthLevel = 'strong' | 'adequate' | 'tight' | 'critical' | 'negative'
export type ForecastConfidence = 'high' | 'medium' | 'low'

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Weekly expected collections based on average monthly sales and DSO.
 * Formula: avgMonthlySales * 7 / max(dso, 1)
 */
export function computeWeeklyCollectionRate(
  avgMonthlySales: number,
  dso: number,
): number {
  if (avgMonthlySales === 0) return 0
  return round2(avgMonthlySales * 7 / Math.max(dso, 1))
}

/**
 * Weekly expected payments based on average monthly expenses and DPO.
 * Formula: avgMonthlyExpenses * 7 / max(dpo, 1)
 */
export function computeWeeklyPaymentRate(
  avgMonthlyExpenses: number,
  dpo: number,
): number {
  if (avgMonthlyExpenses === 0) return 0
  return round2(avgMonthlyExpenses * 7 / Math.max(dpo, 1))
}

/**
 * Build a 13-week (default) rolling cash flow forecast.
 *
 * For each week w from 1 to `weeks`:
 *   - obligations for that week are split by sign into inflows (+) and outflows (-)
 *   - net = weeklyInflow + obligation_inflows - weeklyOutflow - obligation_outflows
 *   - closing_cash = prior closing_cash + net  (opening cash for w=1 is startCash)
 */
export function buildWeeklyForecast(
  startCash: number,
  weeklyInflow: number,
  weeklyOutflow: number,
  weeks = 13,
  knownObligations: KnownObligation[] = [],
): WeeklyForecastRow[] {
  const rows: WeeklyForecastRow[] = []
  let runningCash = startCash

  for (let w = 1; w <= weeks; w++) {
    const obligationsThisWeek = knownObligations.filter(o => o.week === w)

    let obligationInflows  = 0
    let obligationOutflows = 0
    for (const o of obligationsThisWeek) {
      if (o.amount >= 0) {
        obligationInflows += o.amount
      } else {
        obligationOutflows += Math.abs(o.amount)
      }
    }

    const totalInflow  = round2(weeklyInflow  + obligationInflows)
    const totalOutflow = round2(weeklyOutflow + obligationOutflows)
    const net          = round2(totalInflow   - totalOutflow)
    runningCash        = round2(runningCash   + net)

    rows.push({
      week:           w,
      inflow:         totalInflow,
      outflow:        totalOutflow,
      net,
      closing_cash:   runningCash,
      has_obligation: obligationsThisWeek.length > 0,
      obligations:    obligationsThisWeek.map(o => ({ label: o.label, amount: o.amount })),
    })
  }

  return rows
}

/**
 * Minimum cash buffer = weeklyOutflow * bufferWeeks (default 4 weeks).
 * Never negative.
 */
export function computeMinimumCashBuffer(
  weeklyOutflow: number,
  bufferWeeks = 4,
): number {
  return round2(Math.max(0, weeklyOutflow * bufferWeeks))
}

/**
 * Classify weekly cash health relative to minimum buffer.
 *
 *   negative: closingCash < 0
 *   critical: closingCash < minimumBuffer * 0.5
 *   tight:    closingCash < minimumBuffer
 *   adequate: closingCash < minimumBuffer * 2
 *   strong:   closingCash >= minimumBuffer * 2
 */
export function classifyWeeklyCashHealth(
  closingCash: number,
  minimumBuffer: number,
): CashHealthLevel {
  if (closingCash < 0)                       return 'negative'
  if (closingCash < minimumBuffer * 0.5)     return 'critical'
  if (closingCash < minimumBuffer)           return 'tight'
  if (closingCash < minimumBuffer * 2)       return 'adequate'
  return 'strong'
}

/**
 * Returns the first week number where closing_cash < 0.
 * Returns null if no such week exists in the forecast.
 */
export function findCashCrisisWeek(
  forecast: Array<{ week: number; closing_cash: number }>,
): number | null {
  for (const row of forecast) {
    if (row.closing_cash < 0) return row.week
  }
  return null
}

/**
 * Estimate forecast confidence based on data quality.
 *
 *   high:   >= 6 months of history AND both DSO and DPO are available
 *   medium: >= 3 months of history OR (< 6 months but at least one of DSO/DPO)
 *   low:    < 3 months or no DSO/DPO data
 */
export function computeForecastConfidence(
  historicalMonths: number,
  hasDsoData: boolean,
  hasDpoData: boolean,
): ForecastConfidence {
  if (historicalMonths >= 6 && hasDsoData && hasDpoData) return 'high'
  if (historicalMonths >= 3 || (historicalMonths > 0 && (hasDsoData || hasDpoData))) return 'medium'
  return 'low'
}

// ── Service ───────────────────────────────────────────────────────────────────

export interface CashForecastReport {
  forecast: WeeklyForecastRow[]
  summary: {
    start_cash:         number
    week_13_cash:       number
    min_cash_week:      number          // week number with minimum closing_cash
    min_cash_amount:    number
    crisis_week:        number | null
    minimum_buffer:     number
    confidence:         ForecastConfidence
  }
  inputs_used: {
    avg_weekly_inflow:   number
    avg_weekly_outflow:  number
    dso:                 number
    dpo:                 number
    historical_months:   number
  }
  known_obligations: KnownObligation[]
}

export class CashForecastService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<CashForecastReport> {
    const now   = new Date()
    const today = now.toISOString().slice(0, 10)

    // ── 13-week horizon date ─────────────────────────────────────────────────
    const week13End = new Date(now)
    week13End.setDate(week13End.getDate() + 91) // 13 × 7
    const week13EndStr = week13End.toISOString().slice(0, 10)

    // ── 3-month look-back ────────────────────────────────────────────────────
    const months3ago = new Date(now)
    months3ago.setMonth(months3ago.getMonth() - 3)
    const from3mo = months3ago.toISOString().slice(0, 10)

    // ── Parallel DB queries ──────────────────────────────────────────────────
    const [
      salesResult,
      expensesResult,
      cashSnapshotResult,
      loanTrancheResult,
    ] = await Promise.allSettled([
      // Sales last 3 months
      this.supabase
        .from('sales')
        .select('sale_date, total:total_try, payment_status, paid_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from3mo)
        .lte('sale_date', today),

      // Expenses last 3 months
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from3mo)
        .lte('expense_date', today),

      // Latest balance sheet snapshot for starting cash
      this.supabase
        .from('balance_sheet_snapshots')
        .select('cash_and_equivalents_try, snapshot_date')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Upcoming loan repayments within next 13 weeks
      this.supabase
        .from('partner_loan_tranches')
        // no due_date/outstanding_try columns — use expected_repayment_date; outstanding computed below
        .select('id, expected_repayment_date, principal_try, total_repaid_try, status, notes')
        .eq('company_id', companyId)
        .in('status', ['active', 'overdue'])
        .not('expected_repayment_date', 'is', null)
        .gte('expected_repayment_date', today)
        .lte('expected_repayment_date', week13EndStr)
        .order('expected_repayment_date', { ascending: true }),
    ])
    // NB: DPO is not derivable here — the expenses table has no payment-date
    // column (only expense_date + payment_status), so DPO uses a neutral default.

    const sales3mo      = salesResult.status      === 'fulfilled' ? (salesResult.value.data      ?? []) : []
    const expenses3mo   = expensesResult.status    === 'fulfilled' ? (expensesResult.value.data   ?? []) : []
    const cashSnapshot  = cashSnapshotResult.status === 'fulfilled' ? cashSnapshotResult.value.data : null
    const loanTranches  = loanTrancheResult.status  === 'fulfilled' ? (loanTrancheResult.value.data ?? []) : []

    // ── Starting cash ────────────────────────────────────────────────────────
    let startCash = cashSnapshot ? (Number(cashSnapshot.cash_and_equivalents_try) || 0) : 0

    // Fallback: estimate from last 30d net if no snapshot
    if (startCash === 0) {
      const days30ago = new Date(now)
      days30ago.setDate(days30ago.getDate() - 30)
      const from30d = days30ago.toISOString().slice(0, 10)

      let collections = 0
      for (const s of sales3mo.filter(s => (s.sale_date as string) >= from30d)) {
        if (s.payment_status === 'paid') collections += Number(s.total) || 0
        else if (s.payment_status === 'partial') collections += Number(s.total) * 0.5 || 0
      }
      const payments = expenses3mo
        .filter(e => (e.expense_date as string) >= from30d)
        .reduce((acc, e) => acc + (Number(e.amount_try) || 0), 0)
      startCash = round2(Math.max(0, collections - payments))
    }

    // ── Average monthly sales (3-month avg) ──────────────────────────────────
    const totalSales3mo    = sales3mo.reduce((s, r) => s + (Number(r.total) || 0), 0)
    const avgMonthlySales  = round2(totalSales3mo / 3)

    // ── Average monthly expenses (3-month avg) ────────────────────────────────
    const totalExpenses3mo  = expenses3mo.reduce((s, r) => s + (Number(r.amount_try) || 0), 0)
    const avgMonthlyExpenses = round2(totalExpenses3mo / 3)

    // ── Historical months (count distinct months in sales data) ──────────────
    const distinctMonths = new Set(
      sales3mo.map(s => (s.sale_date as string).slice(0, 7))
    )
    const historicalMonths = distinctMonths.size

    // ── DSO: avg days (today - sale_date) for outstanding sales ───────────────
    // payment_status enum = pending | partial | paid | overdue | cancelled (no 'unpaid')
    const unpaidSales = sales3mo.filter(
      s => s.payment_status === 'pending' || s.payment_status === 'partial' || s.payment_status === 'overdue'
    )
    let dso = 30 // default
    if (unpaidSales.length > 0) {
      const todayMs = new Date(today).getTime()
      const totalDays = unpaidSales.reduce((acc, s) => {
        const saleMs = new Date(s.sale_date as string).getTime()
        return acc + Math.max(0, (todayMs - saleMs) / 86_400_000)
      }, 0)
      dso = Math.max(1, Math.round(totalDays / unpaidSales.length))
    }

    // ── DPO: not derivable (expenses has no payment-date column) → neutral default
    const dpo = 30

    // ── Weekly rates ─────────────────────────────────────────────────────────
    const weeklyInflow  = computeWeeklyCollectionRate(avgMonthlySales, dso)
    const weeklyOutflow = computeWeeklyPaymentRate(avgMonthlyExpenses, dpo)

    // ── Known obligations: upcoming loan repayments ───────────────────────────
    const todayMs = new Date(today).getTime()
    const knownObligations: KnownObligation[] = loanTranches
      .map(t => {
        const dueMs    = new Date(t.expected_repayment_date as string).getTime()
        const daysDiff = Math.max(0, (dueMs - todayMs) / 86_400_000)
        const weekNum  = Math.min(13, Math.max(1, Math.ceil(daysDiff / 7)))
        const outstanding = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
        const amount   = -outstanding // outflow = negative
        const label    = (t.notes as string) || `Kredi geri ödemesi (${(t.expected_repayment_date as string).slice(0, 10)})`
        return { week: weekNum, amount, label }
      })
      .filter(o => o.amount !== 0)

    // ── Build 13-week forecast ────────────────────────────────────────────────
    const forecast = buildWeeklyForecast(
      startCash,
      weeklyInflow,
      weeklyOutflow,
      13,
      knownObligations,
    )

    // ── Summary ───────────────────────────────────────────────────────────────
    const week13Cash   = forecast[forecast.length - 1]?.closing_cash ?? startCash
    const minRow       = forecast.reduce((min, row) =>
      row.closing_cash < min.closing_cash ? row : min,
      forecast[0] ?? { week: 1, closing_cash: startCash },
    )
    const minimumBuffer = computeMinimumCashBuffer(weeklyOutflow)
    const crisisWeek    = findCashCrisisWeek(forecast)

    const hasDsoData = unpaidSales.length > 0
    const hasDpoData = false  // expenses has no payment-date column → no DPO signal
    const confidence = computeForecastConfidence(historicalMonths, hasDsoData, hasDpoData)

    return {
      forecast,
      summary: {
        start_cash:      startCash,
        week_13_cash:    week13Cash,
        min_cash_week:   minRow.week,
        min_cash_amount: minRow.closing_cash,
        crisis_week:     crisisWeek,
        minimum_buffer:  minimumBuffer,
        confidence,
      },
      inputs_used: {
        avg_weekly_inflow:  weeklyInflow,
        avg_weekly_outflow: weeklyOutflow,
        dso,
        dpo,
        historical_months:  historicalMonths,
      },
      known_obligations: knownObligations,
    }
  }
}
