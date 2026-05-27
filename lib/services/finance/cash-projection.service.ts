// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/cash-projection.service.ts
//
// 90-Day Cash Flow Projection (13 weeks).
//
// Combines:
//   - Known committed inflows  (unpaid/partial sales with due dates)
//   - Known committed outflows (unpaid/partial expenses with due dates)
//   - Statistical pattern      (12-week avg of historical collections/payments)
//   - Loan repayments          (partner_loan_tranches with expected_repayment_date)
//   - Opening cash             (approximate: sum paid sales − sum paid expenses, 6 months)
//
// Column map (verified against supabase/flowra_install.sql + lib/db/schema.ts):
//   sales:   total_try:total, amount_paid:paid_amount, payment_status, due_date,
//            sale_date, paid_at
//   expenses: amount_try, payment_status, expense_date, due_date
//   partner_loan_tranches: principal_try, total_repaid_try, expected_repayment_date, status
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface ProjectionWeek {
  week_start: string           // 'YYYY-MM-DD' (Monday)
  week_label: string           // 'H1' .. 'H13'
  inflow_committed: number
  inflow_estimated: number
  outflow_committed: number
  outflow_estimated: number
  net_cash_flow: number
  cumulative_cash: number
  confidence: 'high' | 'medium' | 'low'
}

export interface CashProjectionReport {
  company_id: string
  as_of_date: string
  opening_cash: number
  weeks: ProjectionWeek[]
  total_committed_inflow: number
  total_estimated_inflow: number
  total_committed_outflow: number
  total_estimated_outflow: number
  projected_closing_cash: number
  negative_cash_weeks: number[]
  lowest_cash_point: number
  lowest_cash_week: number
  critical_threshold_try: number
  is_below_critical: boolean
  computed_at: string
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Returns the Monday of the ISO week containing the given date string.
 * Week starts are used as canonical keys for bucketing.
 */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay() // 0=Sun, 1=Mon, ... 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow // adjust to Monday
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diff)
  return monday.toISOString().slice(0, 10)
}

/**
 * Returns next Monday from (but not including) today.
 */
export function nextMonday(today: string): string {
  const d = new Date(today + 'T00:00:00Z')
  const dow = d.getUTCDay()
  const daysUntilMonday = dow === 0 ? 1 : 8 - dow
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + daysUntilMonday)
  return monday.toISOString().slice(0, 10)
}

/**
 * Adds `weeks` ISO weeks (7 days each) to a date string.
 */
export function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

/**
 * Assigns a date (YYYY-MM-DD) to the index (0-based) of the 13-week window.
 * Returns -1 if the date falls before week 0 or after week 12.
 *
 * @param dateStr    - the date to assign
 * @param weekStarts - array of 13 Monday dates (YYYY-MM-DD)
 */
export function assignToWeek(dateStr: string, weekStarts: string[]): number {
  for (let i = weekStarts.length - 1; i >= 0; i--) {
    if (dateStr >= weekStarts[i]) return i
  }
  return -1 // before first week
}

/**
 * Returns 'H1' .. 'H13' for week indices 0 .. 12.
 */
export function computeWeekLabel(index: number): string {
  return `H${index + 1}`
}

/**
 * Builds weekly average inflow/outflow from historical records.
 *
 * @param records   - list of { date: string; amount: number }
 * @param today     - YYYY-MM-DD reference date
 * @param weeks     - how many weeks back to average (default 12)
 * @returns weekly average amount (0 if no data)
 */
export function buildWeeklyPattern(
  records: Array<{ date: string; amount: number }>,
  today: string,
  weeks = 12,
): number {
  if (records.length === 0) return 0
  const cutoff = new Date(today + 'T00:00:00Z')
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  let sum = 0
  for (const r of records) {
    if (r.date >= cutoffStr && r.date <= today) {
      sum += r.amount
    }
  }
  return sum / weeks
}

/**
 * Computes confidence level for a week.
 *   high   — ≥70% of total cash activity is committed (known)
 *   medium — ≥30% and <70%
 *   low    — <30%
 */
export function computeConfidence(
  committedInflow: number,
  estimatedInflow: number,
  committedOutflow: number,
  estimatedOutflow: number,
): 'high' | 'medium' | 'low' {
  const totalCommitted = committedInflow + committedOutflow
  const totalEstimated = estimatedInflow + estimatedOutflow
  const total = totalCommitted + totalEstimated
  if (total === 0) return 'high' // empty week = nothing to worry about
  const committedPct = totalCommitted / total
  if (committedPct >= 0.7) return 'high'
  if (committedPct >= 0.3) return 'medium'
  return 'low'
}

/**
 * Returns indices (0-based) of weeks where cumulative cash goes negative.
 */
export function detectNegativeCashWeeks(weeks: Array<{ cumulative_cash: number }>): number[] {
  return weeks.reduce<number[]>((acc, w, i) => {
    if (w.cumulative_cash < 0) acc.push(i)
    return acc
  }, [])
}

// ── Private helpers ───────────────────────────────────────────────────────────

function r2(v: number): number {
  return Math.round(v * 100) / 100
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CashProjectionService {
  /**
   * Builds a 90-day (13-week) cash flow projection.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<CashProjectionReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    // ── 1. Opening cash (approximate) ────────────────────────────────────────
    //    SUM(sales.amount_paid) - SUM(expenses.amount_try WHERE status='paid') last 6mo
    const sixMonthsAgo = (() => {
      const d = new Date(today + 'T00:00:00Z')
      d.setUTCMonth(d.getUTCMonth() - 6)
      return d.toISOString().slice(0, 10)
    })()

    const [salesPaidRes, expPaidRes] = await Promise.all([
      supabase
        .from('sales')
        .select('amount_paid:paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('sale_date', sixMonthsAgo),
      supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('expense_date', sixMonthsAgo),
    ])

    const salesPaidRows  = salesPaidRes.data  ?? []
    const expPaidRows    = expPaidRes.data     ?? []

    const totalSalesPaid = salesPaidRows.reduce((s: number, r: { amount_paid: number | null }) => s + (Number(r.amount_paid) || 0), 0)
    const totalExpPaid   = expPaidRows.reduce((s: number, r: { amount_try: number | null }) => s + (Number(r.amount_try) || 0), 0)
    const openingCash    = r2(totalSalesPaid - totalExpPaid)

    // ── 2. Build week window ──────────────────────────────────────────────────
    const firstMonday = nextMonday(today)
    const weekStarts: string[] = Array.from({ length: 13 }, (_, i) => addWeeks(firstMonday, i))

    // ── 3. Fetch receivables pipeline (unpaid + partial sales) ────────────────
    const { data: receivableRows } = await supabase
      .from('sales')
      .select('id, total_try:total, amount_paid:paid_amount, payment_status, due_date, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['unpaid', 'partial', 'overdue'])

    // ── 4. Fetch payables pipeline (unpaid/partial expenses) ─────────────────
    const { data: payableRows } = await supabase
      .from('expenses')
      .select('id, amount_try, payment_status, due_date, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['unpaid', 'pending', 'partial'])

    // ── 5. Fetch loan repayments ──────────────────────────────────────────────
    const { data: loanRows } = await supabase
      .from('partner_loan_tranches')
      .select('id, principal_try, total_repaid_try, expected_repayment_date, status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('status', ['active', 'pending'])
      .not('expected_repayment_date', 'is', null)

    // ── 6. Fetch historical payment data for statistical pattern ─────────────
    const twelveWeeksAgo = addWeeks(today, -12)

    const [histSalesRes, histExpRes] = await Promise.all([
      supabase
        .from('sales')
        .select('paid_at, amount_paid:paid_amount, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('sale_date', twelveWeeksAgo),
      supabase
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('expense_date', twelveWeeksAgo),
    ])

    const histSalesRows = histSalesRes.data ?? []
    const histExpRows   = histExpRes.data   ?? []

    // Build historical pattern records
    const histInflowRecords = histSalesRows.map((r: { paid_at?: string | null; sale_date?: string | null; amount_paid: number | null }) => ({
      date:   (r.paid_at ?? r.sale_date ?? today).slice(0, 10),
      amount: Number(r.amount_paid) || 0,
    }))
    const histOutflowRecords = histExpRows.map((r: { expense_date?: string | null; amount_try: number | null }) => ({
      date:   (r.expense_date ?? today).slice(0, 10),
      amount: Number(r.amount_try) || 0,
    }))

    const weeklyInflowAvg   = buildWeeklyPattern(histInflowRecords,  today, 12)
    const weeklyOutflowAvg  = buildWeeklyPattern(histOutflowRecords, today, 12)

    // ── 7. Bucket committed flows into weeks ──────────────────────────────────
    const committedInflows:  number[] = new Array(13).fill(0)
    const committedOutflows: number[] = new Array(13).fill(0)

    // Receivables
    for (const row of (receivableRows ?? [])) {
      const outstanding = Math.max(0, (Number(row.total_try) || 0) - (Number(row.amount_paid) || 0))
      if (outstanding <= 0) continue
      // Due date: use due_date if set, else sale_date + 14 days
      const dueDate = row.due_date
        ? (row.due_date as string).slice(0, 10)
        : addDays((row.sale_date as string | null ?? today), 14)
      const weekIdx = assignToWeek(dueDate, weekStarts)
      if (weekIdx >= 0 && weekIdx < 13) {
        committedInflows[weekIdx] += outstanding
      }
    }

    // Payables
    for (const row of (payableRows ?? [])) {
      const amt = Number(row.amount_try) || 0
      if (amt <= 0) continue
      const dueDate = row.due_date
        ? (row.due_date as string).slice(0, 10)
        : addDays((row.expense_date as string | null ?? today), 7)
      const weekIdx = assignToWeek(dueDate, weekStarts)
      if (weekIdx >= 0 && weekIdx < 13) {
        committedOutflows[weekIdx] += amt
      }
    }

    // Loan repayments
    for (const row of (loanRows ?? [])) {
      const remaining = Math.max(0, (Number(row.principal_try) || 0) - (Number(row.total_repaid_try) || 0))
      if (remaining <= 0) continue
      const repayDate = (row.expected_repayment_date as string).slice(0, 10)
      const weekIdx   = assignToWeek(repayDate, weekStarts)
      if (weekIdx >= 0 && weekIdx < 13) {
        committedOutflows[weekIdx] += remaining
      }
    }

    // ── 8. Build week records ─────────────────────────────────────────────────
    const weeks: ProjectionWeek[] = []
    let cumulative = openingCash
    const avgWeeklyExpenses = weeklyOutflowAvg

    for (let i = 0; i < 13; i++) {
      const inflow_committed  = r2(committedInflows[i])
      const outflow_committed = r2(committedOutflows[i])
      const inflow_estimated  = r2(weeklyInflowAvg)
      const outflow_estimated = r2(weeklyOutflowAvg)

      const net_cash_flow = r2(
        inflow_committed + inflow_estimated - outflow_committed - outflow_estimated,
      )
      cumulative = r2(cumulative + net_cash_flow)

      weeks.push({
        week_start:         weekStarts[i],
        week_label:         computeWeekLabel(i),
        inflow_committed,
        inflow_estimated,
        outflow_committed,
        outflow_estimated,
        net_cash_flow,
        cumulative_cash:    cumulative,
        confidence:         computeConfidence(
          inflow_committed, inflow_estimated,
          outflow_committed, outflow_estimated,
        ),
      })
    }

    // ── 9. Summaries ──────────────────────────────────────────────────────────
    const total_committed_inflow   = r2(weeks.reduce((s, w) => s + w.inflow_committed,  0))
    const total_estimated_inflow   = r2(weeks.reduce((s, w) => s + w.inflow_estimated,  0))
    const total_committed_outflow  = r2(weeks.reduce((s, w) => s + w.outflow_committed, 0))
    const total_estimated_outflow  = r2(weeks.reduce((s, w) => s + w.outflow_estimated, 0))
    const projected_closing_cash   = weeks[12].cumulative_cash

    // ── 10. Risk analysis ─────────────────────────────────────────────────────
    const negative_cash_weeks = detectNegativeCashWeeks(weeks)

    const lowestCash = Math.min(...weeks.map(w => w.cumulative_cash))
    const lowest_cash_point = r2(lowestCash)
    const lowest_cash_week  = weeks.findIndex(w => w.cumulative_cash === lowestCash)

    const critical_threshold_try = r2(avgWeeklyExpenses * 2)
    const is_below_critical      = lowest_cash_point < critical_threshold_try

    return {
      company_id:              companyId,
      as_of_date:              today,
      opening_cash:            openingCash,
      weeks,
      total_committed_inflow,
      total_estimated_inflow,
      total_committed_outflow,
      total_estimated_outflow,
      projected_closing_cash,
      negative_cash_weeks,
      lowest_cash_point,
      lowest_cash_week:       Math.max(0, lowest_cash_week),
      critical_threshold_try,
      is_below_critical,
      computed_at:            new Date().toISOString(),
    }
  }
}
