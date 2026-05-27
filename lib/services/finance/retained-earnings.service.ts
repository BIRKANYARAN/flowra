// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/retained-earnings.service.ts
//
// Retained Earnings Rollforward Statement
//
// Shows equity movement period by period:
//   Opening → +Net Income → −Legal Reserve (TTK 519) → −Dividends → −Compensation → =Closing
//
// Pure exports (testable without DB):
//   computePeriodLegalReserve
//   computeClosingBalance
//   isAccumulatedDeficit
//   computeEquityCoverageRatio
//   buildRollforwardLine
//
// Class:
//   RetainedEarningsService.getStatement(companyId, year?) → RetainedEarningsStatement
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Domain types ──────────────────────────────────────────────────────────────

export interface RetainedEarningsLine {
  period_key:        string   // "2025-01" or "2025" for annual
  period_label:      string   // "Ocak 2025" or "2025 Yılı"
  opening_try:       number
  net_income_try:    number
  legal_reserve_try: number   // deducted (TTK 519 allocation)
  dividends_try:     number   // deducted
  compensation_try:  number   // deducted (huzur hakkı treated as equity deduction)
  adjustments_try:   number   // other (positive = increases RE)
  closing_try:       number
  is_deficit:        boolean
}

export interface RetainedEarningsStatement {
  company_id:                string
  generated_at:              string
  paid_in_capital_try:       number
  current_legal_reserves_try: number
  lines:                     RetainedEarningsLine[]   // chronological
  opening_total:             number   // first line's opening
  closing_total:             number   // last line's closing
  total_net_income:          number   // Σ net_income across all lines
  total_dividends:           number
  total_legal_reserves:      number
  equity_coverage_ratio:     number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Ocak',  '02': 'Şubat',   '03': 'Mart',
  '04': 'Nisan', '05': 'Mayıs',   '06': 'Haziran',
  '07': 'Temmuz','08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',  '11': 'Kasım',   '12': 'Aralık',
}

function periodLabel(periodKey: string): string {
  // "2025-01" → "Ocak 2025", "2025" → "2025 Yılı"
  if (/^\d{4}$/.test(periodKey)) return `${periodKey} Yılı`
  const [year, mm] = periodKey.split('-')
  const monthName = MONTH_LABELS[mm] ?? mm
  return `${monthName} ${year}`
}

// ── Pure exported functions ────────────────────────────────────────────────────

/**
 * Compute TTK 519 legal reserve for a single period.
 * Allocates min(netIncome × 0.05, max(0, paidInCapital × 0.20 − existingReserves)).
 * Returns 0 if netIncome <= 0.
 */
export function computePeriodLegalReserve(
  netIncomeTry: number,
  paidInCapitalTry: number,
  existingReservesTry: number,
): number {
  if (netIncomeTry <= 0) return 0
  const cap     = round2(Math.max(0, paidInCapitalTry * 0.20 - existingReservesTry))
  if (cap <= 0) return 0
  const proposed = round2(netIncomeTry * 0.05)
  return round2(Math.min(proposed, cap))
}

/**
 * Compute closing balance:
 *   opening + netIncome - legalReserve - dividends - compensation + adjustments
 */
export function computeClosingBalance(
  openingTry: number,
  netIncomeTry: number,
  legalReserveTry: number,
  dividendsTry: number,
  compensationTry: number,
  adjustmentsTry: number,
): number {
  return round2(openingTry + netIncomeTry - legalReserveTry - dividendsTry - compensationTry + adjustmentsTry)
}

/**
 * Check if retained earnings are negative (accumulated deficit).
 */
export function isAccumulatedDeficit(closingTry: number): boolean {
  return closingTry < 0
}

/**
 * Compute equity coverage ratio: closing / totalLiabilities.
 * Returns null if totalLiabilities = 0 (avoid division by zero).
 */
export function computeEquityCoverageRatio(
  closingTry: number,
  totalLiabilitiesTry: number,
): number | null {
  if (totalLiabilitiesTry === 0) return null
  return round2(closingTry / totalLiabilitiesTry)
}

/**
 * Build a single rollforward period line from raw inputs.
 * Computes legal_reserve, closing, and is_deficit automatically.
 */
export function buildRollforwardLine(
  periodKey: string,
  opening: number,
  netIncome: number,
  legalReserve: number,
  dividends: number,
  compensation: number,
  adjustments: number,
): RetainedEarningsLine {
  const closing = computeClosingBalance(opening, netIncome, legalReserve, dividends, compensation, adjustments)
  return {
    period_key:        periodKey,
    period_label:      periodLabel(periodKey),
    opening_try:       round2(opening),
    net_income_try:    round2(netIncome),
    legal_reserve_try: round2(legalReserve),
    dividends_try:     round2(dividends),
    compensation_try:  round2(compensation),
    adjustments_try:   round2(adjustments),
    closing_try:       closing,
    is_deficit:        isAccumulatedDeficit(closing),
  }
}

// ── Internal query types ──────────────────────────────────────────────────────

interface PeriodRow {
  id:           string
  period_start: string
  period_end:   string
  closing_cash_try: number
}

interface SaleRow {
  sale_date: string
  total_try: number
}

interface ExpenseRow {
  expense_date: string
  amount_try:   number
  expense_type: string | null
}

interface FinanceEventRow {
  event_type:  string
  amount_try:  number
  event_date:  string
  partner_id:  string
}

const FINANCING_TYPES = new Set([
  'partner_financing', 'loan_repayment', 'dividend', 'internal_transfer',
])

// ── Service class ─────────────────────────────────────────────────────────────

export class RetainedEarningsService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Build the retained earnings rollforward statement.
   *
   * @param companyId  company UUID
   * @param year       optional year filter; omit for all-time
   */
  async getStatement(
    companyId: string,
    year?: number,
  ): Promise<RetainedEarningsStatement> {
    // ── 1. Fetch closed/locked accounting periods ──────────────────────────────
    let periodsQuery = this.supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, closing_cash_try')
      .eq('company_id', companyId)
      .in('status', ['closed', 'locked'])
      .order('period_start', { ascending: true })

    if (year) {
      periodsQuery = periodsQuery
        .gte('period_start', `${year}-01-01`)
        .lte('period_start', `${year}-12-31`)
    }

    const { data: periodsData, error: periodsError } = await periodsQuery

    if (periodsError || !periodsData || periodsData.length === 0) {
      return this.emptyStatement(companyId)
    }

    const periods = periodsData as PeriodRow[]
    const fromDate = periods[0].period_start
    const toDate   = periods[periods.length - 1].period_end

    // ── 2. Paid-in capital from partner_capital_commitments ───────────────────
    let paidInCapital = 0
    try {
      const { data: capData } = await this.supabase
        .from('partner_capital_commitments')
        .select('paid_amount_try')
        .eq('company_id', companyId)
      paidInCapital = ((capData ?? []) as Array<{ paid_amount_try: unknown }>)
        .reduce((s, r) => s + Number(r.paid_amount_try ?? 0), 0)
      paidInCapital = round2(paidInCapital)
    } catch { paidInCapital = 0 }

    // ── 3. Existing legal reserves (GL account 542) ───────────────────────────
    let currentLegalReserves = 0
    try {
      const { data: reserveData } = await this.supabase
        .from('journal_entry_lines')
        .select('debit_try, credit_try')
        .eq('company_id', companyId)
        .eq('account_code', '542')
      currentLegalReserves = ((reserveData ?? []) as Array<{ debit_try: unknown; credit_try: unknown }>)
        .reduce((s, r) => s + Number(r.credit_try ?? 0) - Number(r.debit_try ?? 0), 0)
      currentLegalReserves = round2(currentLegalReserves)
    } catch { currentLegalReserves = 0 }

    // ── 4. Fetch sales and expenses in parallel ───────────────────────────────
    const [salesRes, expensesRes, eventsRes] = await Promise.all([
      this.supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', fromDate)
        .lte('sale_date', toDate)
        .not('payment_status', 'eq', 'cancelled'),

      this.supabase
        .from('expenses')
        .select('expense_date, amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate),

      this.supabase
        .from('partner_finance_events')
        .select('event_type, amount_try, event_date, partner_id')
        .eq('company_id', companyId)
        .in('event_type', ['DIVIDEND_DECLARED', 'COMPENSATION_PAYMENT'])
        .gte('event_date', fromDate)
        .lte('event_date', toDate),
    ])

    const salesRows:   SaleRow[]         = salesRes.data    ?? []
    const expenseRows: ExpenseRow[]       = expensesRes.data ?? []
    const eventRows:   FinanceEventRow[]  = eventsRes.data   ?? []

    // ── 5. Build period lookup map ────────────────────────────────────────────
    interface PeriodMeta { start: string; end: string }
    const periodMap = new Map<string, PeriodMeta>()
    for (const p of periods) {
      const pk = p.period_start.slice(0, 7)
      periodMap.set(pk, { start: p.period_start, end: p.period_end })
    }

    // ── 6. Bucket revenue per period ─────────────────────────────────────────
    const revenueByPeriod = new Map<string, number>()
    for (const [pk] of periodMap) revenueByPeriod.set(pk, 0)
    for (const row of salesRows) {
      const pk = String(row.sale_date ?? '').slice(0, 7)
      if (revenueByPeriod.has(pk))
        revenueByPeriod.set(pk, (revenueByPeriod.get(pk) ?? 0) + Number(row.total_try ?? 0))
    }

    // ── 7. Bucket expenses per period (exclude financing flows) ───────────────
    const expenseByPeriod = new Map<string, number>()
    for (const [pk] of periodMap) expenseByPeriod.set(pk, 0)
    for (const row of expenseRows) {
      const pk = String(row.expense_date ?? '').slice(0, 7)
      if (!expenseByPeriod.has(pk)) continue
      if (FINANCING_TYPES.has(String(row.expense_type ?? ''))) continue
      expenseByPeriod.set(pk, (expenseByPeriod.get(pk) ?? 0) + Number(row.amount_try ?? 0))
    }

    // ── 8. Bucket dividends and compensation per period ───────────────────────
    const dividendsByPeriod     = new Map<string, number>()
    const compensationByPeriod  = new Map<string, number>()
    for (const [pk] of periodMap) {
      dividendsByPeriod.set(pk, 0)
      compensationByPeriod.set(pk, 0)
    }
    for (const ev of eventRows) {
      const pk = String(ev.event_date ?? '').slice(0, 7)
      const amt = Number(ev.amount_try ?? 0)
      if (ev.event_type === 'DIVIDEND_DECLARED') {
        if (dividendsByPeriod.has(pk))
          dividendsByPeriod.set(pk, (dividendsByPeriod.get(pk) ?? 0) + amt)
      } else if (ev.event_type === 'COMPENSATION_PAYMENT') {
        if (compensationByPeriod.has(pk))
          compensationByPeriod.set(pk, (compensationByPeriod.get(pk) ?? 0) + amt)
      }
    }

    // ── 9. Build rollforward lines with cumulative legal reserve tracking ─────
    const lines: RetainedEarningsLine[] = []
    let runningOpening        = 0  // first period starts at 0
    let runningReserves       = 0  // tracks prior reserves for TTK 519 cap

    const sortedPeriods = [...periodMap.keys()].sort()

    for (const pk of sortedPeriods) {
      const revenue      = revenueByPeriod.get(pk)     ?? 0
      const expenses     = expenseByPeriod.get(pk)     ?? 0
      const netIncome    = round2(revenue - expenses)
      const dividends    = round2(dividendsByPeriod.get(pk)    ?? 0)
      const compensation = round2(compensationByPeriod.get(pk) ?? 0)
      const adjustments  = 0

      // Legal reserve uses running total of prior period reserves
      const legalReserve = computePeriodLegalReserve(netIncome, paidInCapital, runningReserves)

      const line = buildRollforwardLine(pk, runningOpening, netIncome, legalReserve, dividends, compensation, adjustments)
      lines.push(line)

      // Advance for next period
      runningOpening  = line.closing_try
      runningReserves = round2(runningReserves + legalReserve)
    }

    // ── 10. Compute statement-level aggregates ────────────────────────────────
    const openingTotal        = lines.length > 0 ? lines[0].opening_try : 0
    const closingTotal        = lines.length > 0 ? lines[lines.length - 1].closing_try : 0
    const totalNetIncome      = round2(lines.reduce((s, l) => s + l.net_income_try, 0))
    const totalDividends      = round2(lines.reduce((s, l) => s + l.dividends_try, 0))
    const totalLegalReserves  = round2(lines.reduce((s, l) => s + l.legal_reserve_try, 0))

    // ── 11. Equity coverage ratio — need total liabilities ────────────────────
    let totalLiabilities = 0
    try {
      // Rough liability estimate: sum of partner loan tranches
      const { data: loanData } = await this.supabase
        .from('partner_loan_tranches')
        .select('outstanding_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('status', 'repaid')
      totalLiabilities = ((loanData ?? []) as Array<{ outstanding_try: unknown }>)
        .reduce((s, r) => s + Number(r.outstanding_try ?? 0), 0)
      totalLiabilities = round2(totalLiabilities)
    } catch { totalLiabilities = 0 }

    const equityCoverageRatio = computeEquityCoverageRatio(closingTotal, totalLiabilities)

    return {
      company_id:                companyId,
      generated_at:              new Date().toISOString(),
      paid_in_capital_try:       paidInCapital,
      current_legal_reserves_try: currentLegalReserves,
      lines,
      opening_total:             openingTotal,
      closing_total:             closingTotal,
      total_net_income:          totalNetIncome,
      total_dividends:           totalDividends,
      total_legal_reserves:      totalLegalReserves,
      equity_coverage_ratio:     equityCoverageRatio,
    }
  }

  private emptyStatement(companyId: string): RetainedEarningsStatement {
    return {
      company_id:                companyId,
      generated_at:              new Date().toISOString(),
      paid_in_capital_try:       0,
      current_legal_reserves_try: 0,
      lines:                     [],
      opening_total:             0,
      closing_total:             0,
      total_net_income:          0,
      total_dividends:           0,
      total_legal_reserves:      0,
      equity_coverage_ratio:     null,
    }
  }
}
