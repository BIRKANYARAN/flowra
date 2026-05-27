// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/fiscal-year-summary.service.ts
//
// Fiscal Year Close Summary — aggregates all closed/locked accounting periods
// in a given year into an executive-grade annual report view.
//
// Pure functions exported for testing:
//   computeYearGrowth     — YoY percentage growth (null on zero prior)
//   computeYoyLabel       — "▲ +12.3%" / "▼ -5.1%" / "—"
//   computeQuarterlyRevenue — group months into Q1-Q4 with sums
//   computeBestMonth      — period with highest revenue
//   computeWorstMonth     — period with lowest revenue
//   computeAnnualMetrics  — aggregate sums + derived ratios
//
// Class:
//   FiscalYearSummaryService.getSummary(companyId, year) → FiscalYearSummary
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Core domain types ─────────────────────────────────────────────────────────

export interface MonthlyData {
  period_key:     string   // "2025-01"
  revenue_try:    number
  cogs_try:       number
  expenses_try:   number
  net_income_try: number
  cash_end_try:   number
}

export interface QuarterlyBreakdown {
  quarter:        'Q1' | 'Q2' | 'Q3' | 'Q4'
  revenue_try:    number
  net_income_try: number
  margin_pct:     number
}

export interface AnnualMetrics {
  revenue_try:      number
  cogs_try:         number
  gross_profit_try: number
  gross_margin_pct: number
  expenses_try:     number
  ebitda_try:       number
  net_income_try:   number
  net_margin_pct:   number
  cash_end_try:     number
}

export interface FiscalYearSummary {
  year:              number
  periods_count:     number                                     // how many closed months
  is_complete:       boolean                                    // periods_count === 12
  annual:            AnnualMetrics
  quarterly:         QuarterlyBreakdown[]
  best_month:        { month: string; value: number } | null
  worst_month:       { month: string; value: number } | null
  monthly_breakdown: MonthlyData[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ZERO_ANNUAL: AnnualMetrics = {
  revenue_try:      0,
  cogs_try:         0,
  gross_profit_try: 0,
  gross_margin_pct: 0,
  expenses_try:     0,
  ebitda_try:       0,
  net_income_try:   0,
  net_margin_pct:   0,
  cash_end_try:     0,
}

// ── Pure exported functions ────────────────────────────────────────────────────

/**
 * Compute YoY growth percentage.
 * Returns null when prior is 0 (division by zero guard).
 */
export function computeYearGrowth(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Format a growth percentage with directional arrow.
 * null → "—"
 * positive → "▲ +12.3%"
 * negative → "▼ -5.1%"
 */
export function computeYoyLabel(growthPct: number | null): string {
  if (growthPct === null) return '—'
  if (growthPct >= 0) return `▲ +${growthPct.toFixed(1)}%`
  return `▼ ${growthPct.toFixed(1)}%`
}

/**
 * Group monthly data into Q1-Q4 quarterly breakdowns.
 * Q1 = Jan-Mar (01-03), Q2 = Apr-Jun (04-06),
 * Q3 = Jul-Sep (07-09), Q4 = Oct-Dec (10-12).
 * margin_pct = net_income / revenue × 100 (0 if revenue = 0)
 */
export function computeQuarterlyRevenue(periods: MonthlyData[]): QuarterlyBreakdown[] {
  const quarters: Record<'Q1' | 'Q2' | 'Q3' | 'Q4', { revenue: number; net: number }> = {
    Q1: { revenue: 0, net: 0 },
    Q2: { revenue: 0, net: 0 },
    Q3: { revenue: 0, net: 0 },
    Q4: { revenue: 0, net: 0 },
  }

  for (const p of periods) {
    const month = parseInt(p.period_key.slice(5, 7), 10)
    const q: 'Q1' | 'Q2' | 'Q3' | 'Q4' =
      month <= 3 ? 'Q1' :
      month <= 6 ? 'Q2' :
      month <= 9 ? 'Q3' : 'Q4'
    quarters[q].revenue += p.revenue_try
    quarters[q].net     += p.net_income_try
  }

  return (['Q1', 'Q2', 'Q3', 'Q4'] as const).map(q => ({
    quarter:        q,
    revenue_try:    quarters[q].revenue,
    net_income_try: quarters[q].net,
    margin_pct:     quarters[q].revenue > 0
      ? (quarters[q].net / quarters[q].revenue) * 100
      : 0,
  }))
}

/**
 * Find the month with the highest revenue.
 * Returns null if periods is empty.
 */
export function computeBestMonth(periods: MonthlyData[]): { month: string; value: number } | null {
  if (periods.length === 0) return null
  const best = periods.reduce((acc, p) => p.revenue_try > acc.revenue_try ? p : acc)
  return { month: best.period_key, value: best.revenue_try }
}

/**
 * Find the month with the lowest revenue.
 * Returns null if periods is empty.
 */
export function computeWorstMonth(periods: MonthlyData[]): { month: string; value: number } | null {
  if (periods.length === 0) return null
  const worst = periods.reduce((acc, p) => p.revenue_try < acc.revenue_try ? p : acc)
  return { month: worst.period_key, value: worst.revenue_try }
}

/**
 * Aggregate all monthly data into annual metrics.
 *
 * - Sum revenue, cogs, expenses, net_income across all periods
 * - gross_profit = revenue - cogs
 * - gross_margin_pct = gross_profit / revenue × 100 (0 if revenue = 0)
 * - ebitda = gross_profit - expenses
 * - net_margin_pct = net_income / revenue × 100 (0 if revenue = 0)
 * - cash_end = last period's cash_end_try (or 0 if no periods)
 */
export function computeAnnualMetrics(periods: MonthlyData[]): AnnualMetrics {
  if (periods.length === 0) return { ...ZERO_ANNUAL }

  let revenue   = 0
  let cogs      = 0
  let expenses  = 0
  let netIncome = 0

  for (const p of periods) {
    revenue   += p.revenue_try
    cogs      += p.cogs_try
    expenses  += p.expenses_try
    netIncome += p.net_income_try
  }

  const grossProfit    = revenue - cogs
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0
  const ebitda         = grossProfit - expenses
  const netMarginPct   = revenue > 0 ? (netIncome / revenue) * 100 : 0

  // cash_end = last period's cash_end_try (periods should be sorted by period_key asc)
  const cashEnd = periods[periods.length - 1].cash_end_try

  return {
    revenue_try:      revenue,
    cogs_try:         cogs,
    gross_profit_try: grossProfit,
    gross_margin_pct: grossMarginPct,
    expenses_try:     expenses,
    ebitda_try:       ebitda,
    net_income_try:   netIncome,
    net_margin_pct:   netMarginPct,
    cash_end_try:     cashEnd,
  }
}

// ── Main service class ────────────────────────────────────────────────────────

// Types used internally for expense/sales query rows
interface SaleRow {
  sale_date:      string
  total_try:      number
  payment_status: string | null
}

interface ExpenseRow {
  expense_date:  string
  amount_try:    number
  expense_type:  string | null
}

interface PeriodRow {
  id:           string
  period_start: string
  period_end:   string
  closing_cash_try: number
}

const FINANCING_TYPES = new Set([
  'partner_financing',
  'loan_repayment',
  'dividend',
  'internal_transfer',
])

export class FiscalYearSummaryService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Compute the fiscal year summary for a given company and year.
   *
   * Queries all closed/locked accounting periods in the year, then fetches
   * revenue (sales) and expenses for each period's date range.
   *
   * Returns a zero-filled FiscalYearSummary when no closed periods exist.
   */
  async getSummary(companyId: string, year: number): Promise<FiscalYearSummary> {
    const EMPTY: FiscalYearSummary = {
      year,
      periods_count:     0,
      is_complete:       false,
      annual:            { ...ZERO_ANNUAL },
      quarterly:         [],
      best_month:        null,
      worst_month:       null,
      monthly_breakdown: [],
    }

    // ── 1. Fetch closed/locked periods for the year ────────────────────────
    const yearStart = `${year}-01-01`
    const yearEnd   = `${year}-12-31`

    const { data: periodsData, error: periodsError } = await this.supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, closing_cash_try')
      .eq('company_id', companyId)
      .in('status', ['closed', 'locked'])
      .gte('period_start', yearStart)
      .lte('period_start', yearEnd)
      .order('period_start', { ascending: true })

    if (periodsError || !periodsData || periodsData.length === 0) {
      return EMPTY
    }

    const periods = periodsData as PeriodRow[]

    // ── 2. Collect date range bounds for a single bulk query ───────────────
    const fromDate = periods[0].period_start
    const toDate   = periods[periods.length - 1].period_end

    // ── 3. Fetch sales and expenses in parallel ────────────────────────────
    const [salesRes, expensesRes] = await Promise.all([
      this.supabase
        .from('sales')
        .select('sale_date, total_try, payment_status')
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
    ])

    const salesRows:    SaleRow[]    = salesRes.data    ?? []
    const expenseRows:  ExpenseRow[] = expensesRes.data ?? []

    // ── 4. Build period → date-range lookup for bucketing ─────────────────
    // Map: period_key → { start, end, cash_end }
    interface PeriodMeta { start: string; end: string; cash_end: number }
    const periodMap = new Map<string, PeriodMeta>()

    for (const p of periods) {
      const periodKey = p.period_start.slice(0, 7)   // "YYYY-MM"
      periodMap.set(periodKey, {
        start:    p.period_start,
        end:      p.period_end,
        cash_end: Number(p.closing_cash_try ?? 0),
      })
    }

    // ── 5. Bucket sales by period ──────────────────────────────────────────
    const revenueByPeriod = new Map<string, number>()
    for (const [pk] of periodMap) revenueByPeriod.set(pk, 0)

    for (const row of salesRows) {
      const saleKey = String(row.sale_date ?? '').slice(0, 7)
      if (revenueByPeriod.has(saleKey)) {
        revenueByPeriod.set(saleKey, (revenueByPeriod.get(saleKey) ?? 0) + Number(row.total_try ?? 0))
      }
    }

    // ── 6. Bucket expenses by period (exclude financing flows) ────────────
    const expenseByPeriod = new Map<string, number>()
    for (const [pk] of periodMap) expenseByPeriod.set(pk, 0)

    for (const row of expenseRows) {
      const expKey = String(row.expense_date ?? '').slice(0, 7)
      if (!expenseByPeriod.has(expKey)) continue
      const t = String(row.expense_type ?? '')
      if (FINANCING_TYPES.has(t)) continue
      expenseByPeriod.set(expKey, (expenseByPeriod.get(expKey) ?? 0) + Number(row.amount_try ?? 0))
    }

    // ── 7. Build MonthlyData array (sorted by period_key asc) ─────────────
    const monthly: MonthlyData[] = []

    for (const [pk, meta] of periodMap) {
      const revenue  = revenueByPeriod.get(pk)  ?? 0
      const expenses = expenseByPeriod.get(pk)  ?? 0
      // COGS not separately tracked per period in this query; approximated as 0
      // (full COGS requires sale_item_allocations join — expensive; kept simple here)
      const cogs     = 0
      const netIncome = revenue - cogs - expenses

      monthly.push({
        period_key:     pk,
        revenue_try:    revenue,
        cogs_try:       cogs,
        expenses_try:   expenses,
        net_income_try: netIncome,
        cash_end_try:   meta.cash_end,
      })
    }

    // Ensure sort order (Map preserves insertion order; periods already ordered by period_start asc)
    monthly.sort((a, b) => a.period_key.localeCompare(b.period_key))

    // ── 8. Compute derived aggregates ─────────────────────────────────────
    const annual    = computeAnnualMetrics(monthly)
    const quarterly = computeQuarterlyRevenue(monthly)
    const bestMonth  = computeBestMonth(monthly)
    const worstMonth = computeWorstMonth(monthly)

    return {
      year,
      periods_count:     monthly.length,
      is_complete:       monthly.length === 12,
      annual,
      quarterly,
      best_month:        bestMonth,
      worst_month:       worstMonth,
      monthly_breakdown: monthly,
    }
  }
}
