// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/period-comparison.service.ts
//
// Period-over-Period Comparison — Year-over-Year (YoY) and Month-over-Month
// (MoM) financial comparison.
//
// Rules:
//   • getMonthComparison: compares specified month vs same month prior year (YoY)
//   • getYearComparison: compares specified year vs prior year
//   • Revenue = sum(sales.total_try), Expense = sum(expenses.amount_try)
//   • Gross profit = revenue − expense (simplified, no COGS separation)
//   • Net income = gross profit (consistent simplification)
//   • Margins = null when revenue = 0
//   • change_pct = null when prior = 0
//   • direction: up if change_pct > 1%, down if < -1%, flat otherwise
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface PeriodMetrics {
  period_label: string              // 'Mayıs 2026' or '2025'
  period_type: 'month' | 'year'
  revenue_try: number
  expense_try: number
  gross_profit_try: number
  net_income_try: number
  gross_margin_pct: number | null   // gross_profit / revenue × 100
  net_margin_pct: number | null     // net_income / revenue × 100
  expense_ratio_pct: number | null  // expense / revenue × 100
}

export interface MetricComparison {
  metric: string
  label: string                     // Turkish label
  current_value: number
  prior_value: number
  change_try: number                // current - prior
  change_pct: number | null         // (current - prior) / |prior| × 100 (null if prior = 0)
  direction: 'up' | 'down' | 'flat'
  is_positive: boolean              // up=positive for revenue/profit, down=positive for expenses
}

export interface PeriodComparisonReport {
  current: PeriodMetrics
  prior: PeriodMetrics
  comparisons: MetricComparison[]   // revenue, expense, gross_profit, net_income, margins
  summary_line: string
  comparison_type: 'yoy' | 'mom'
}

// ── Pure helper functions (exported) ─────────────────────────────────────────

/**
 * Compute percentage change from prior to current.
 * Returns null if prior = 0 to avoid division by zero.
 */
export function computeChangePct(current: number, prior: number): number | null {
  if (prior === 0) return null
  return ((current - prior) / Math.abs(prior)) * 100
}

/**
 * Determine direction from change percentage.
 * up if > 1%, down if < -1%, flat otherwise.
 */
export function computeDirection(changePct: number | null): MetricComparison['direction'] {
  if (changePct === null) return 'flat'
  if (changePct > 1)  return 'up'
  if (changePct < -1) return 'down'
  return 'flat'
}

/**
 * Compute margin percentage (numerator / denominator × 100).
 * Returns null if denominator = 0.
 */
export function computeMarginPct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null
  return (numerator / denominator) * 100
}

/**
 * Build a Turkish summary sentence from comparisons.
 * Focuses on revenue and net income direction.
 */
export function buildSummaryLine(
  comparisons: MetricComparison[],
  type: 'yoy' | 'mom',
): string {
  const period = type === 'yoy' ? 'geçen yıla kıyasla' : 'geçen aya kıyasla'

  const revComp = comparisons.find(c => c.metric === 'revenue')
  const netComp = comparisons.find(c => c.metric === 'net_income')

  const parts: string[] = []

  if (revComp) {
    const pct = revComp.change_pct
    if (pct === null || revComp.prior_value === 0) {
      parts.push(`Gelir ${period} karşılaştırılamadı (önceki dönem sıfır)`)
    } else {
      const absPct = Math.abs(pct).toFixed(1)
      if (revComp.direction === 'up') {
        parts.push(`Gelir ${period} %${absPct} arttı`)
      } else if (revComp.direction === 'down') {
        parts.push(`Gelir ${period} %${absPct} düştü`)
      } else {
        parts.push(`Gelir ${period} yatay seyretti`)
      }
    }
  }

  if (netComp) {
    const pct = netComp.change_pct
    if (pct !== null && netComp.prior_value !== 0) {
      const absPct = Math.abs(pct).toFixed(1)
      if (netComp.direction === 'up') {
        parts.push(`net kâr %${absPct} yükseldi`)
      } else if (netComp.direction === 'down') {
        parts.push(`net kâr %${absPct} geriledi`)
      } else {
        parts.push(`net kâr yatay kaldı`)
      }
    }
  }

  if (parts.length === 0) return 'Dönem karşılaştırması için yeterli veri yok.'
  return parts.join('; ') + '.'
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Turkish month label e.g. 'Mayıs 2026' */
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Date range for a calendar month */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Date range for a full calendar year */
function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** Fetch revenue + expense totals for a date range */
async function fetchPeriodTotals(
  companyId: string,
  supabase: AnyClient,
  from: string,
  to: string,
): Promise<{ revenue: number; expense: number }> {
  const [salesResult, expenseResult] = await Promise.allSettled([
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),

    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),
  ])

  let revenue = 0
  let expense = 0

  if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
    for (const row of salesResult.value.data) {
      revenue += Number(row.total_try) || 0
    }
  }

  if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
    for (const row of expenseResult.value.data) {
      expense += Number(row.amount_try) || 0
    }
  }

  return { revenue, expense }
}

/** Build PeriodMetrics from raw revenue + expense values */
function buildPeriodMetrics(
  periodLabel: string,
  periodType: 'month' | 'year',
  revenue: number,
  expense: number,
): PeriodMetrics {
  const grossProfit = revenue - expense
  const netIncome   = grossProfit // simplified: no COGS separation

  return {
    period_label:     periodLabel,
    period_type:      periodType,
    revenue_try:      revenue,
    expense_try:      expense,
    gross_profit_try: grossProfit,
    net_income_try:   netIncome,
    gross_margin_pct:  computeMarginPct(grossProfit, revenue),
    net_margin_pct:    computeMarginPct(netIncome, revenue),
    expense_ratio_pct: computeMarginPct(expense, revenue),
  }
}

/** Build MetricComparison array from current and prior PeriodMetrics */
function buildComparisons(current: PeriodMetrics, prior: PeriodMetrics): MetricComparison[] {
  const pairs: Array<{ metric: string; label: string; cur: number; prr: number; isPositiveWhenUp: boolean }> = [
    { metric: 'revenue',      label: 'Ciro',        cur: current.revenue_try,      prr: prior.revenue_try,      isPositiveWhenUp: true  },
    { metric: 'expense',      label: 'Giderler',    cur: current.expense_try,      prr: prior.expense_try,      isPositiveWhenUp: false },
    { metric: 'gross_profit', label: 'Brüt Kâr',    cur: current.gross_profit_try, prr: prior.gross_profit_try, isPositiveWhenUp: true  },
    { metric: 'net_income',   label: 'Net Gelir',   cur: current.net_income_try,   prr: prior.net_income_try,   isPositiveWhenUp: true  },
  ]

  // Add margin comparisons (using raw pct values as numbers)
  const marginPairs: Array<{ metric: string; label: string; cur: number | null; prr: number | null; isPositiveWhenUp: boolean }> = [
    { metric: 'gross_margin',  label: 'Brüt Marj (%)',  cur: current.gross_margin_pct,  prr: prior.gross_margin_pct,  isPositiveWhenUp: true  },
    { metric: 'net_margin',    label: 'Net Marj (%)',    cur: current.net_margin_pct,    prr: prior.net_margin_pct,    isPositiveWhenUp: true  },
    { metric: 'expense_ratio', label: 'Gider Oranı (%)', cur: current.expense_ratio_pct, prr: prior.expense_ratio_pct, isPositiveWhenUp: false },
  ]

  const result: MetricComparison[] = []

  for (const p of pairs) {
    const changeTry = p.cur - p.prr
    const changePct = computeChangePct(p.cur, p.prr)
    const direction = computeDirection(changePct)
    result.push({
      metric:        p.metric,
      label:         p.label,
      current_value: p.cur,
      prior_value:   p.prr,
      change_try:    changeTry,
      change_pct:    changePct,
      direction,
      is_positive:   p.isPositiveWhenUp ? direction === 'up' : direction === 'down',
    })
  }

  for (const p of marginPairs) {
    const cur = p.cur ?? 0
    const prr = p.prr ?? 0
    const changeTry = cur - prr
    const changePct = computeChangePct(cur, prr)
    const direction = computeDirection(changePct)
    result.push({
      metric:        p.metric,
      label:         p.label,
      current_value: cur,
      prior_value:   prr,
      change_try:    changeTry,
      change_pct:    changePct,
      direction,
      is_positive:   p.isPositiveWhenUp ? direction === 'up' : direction === 'down',
    })
  }

  return result
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PeriodComparisonService {

  /**
   * Compare a specific month vs. the same month in the prior year (YoY).
   * e.g. getMonthComparison(id, 2026, 5, supabase) → May 2026 vs May 2025
   */
  static async getMonthComparison(
    companyId: string,
    year: number,
    month: number,
    supabase: AnyClient,
  ): Promise<PeriodComparisonReport> {
    const currentRange = monthRange(year, month)
    const priorRange   = monthRange(year - 1, month)

    const [currentTotals, priorTotals] = await Promise.all([
      fetchPeriodTotals(companyId, supabase, currentRange.from, currentRange.to),
      fetchPeriodTotals(companyId, supabase, priorRange.from, priorRange.to),
    ])

    const current = buildPeriodMetrics(monthLabel(year, month),          'month', currentTotals.revenue, currentTotals.expense)
    const prior   = buildPeriodMetrics(monthLabel(year - 1, month),      'month', priorTotals.revenue,   priorTotals.expense)

    const comparisons  = buildComparisons(current, prior)
    const summary_line = buildSummaryLine(comparisons, 'yoy')

    return { current, prior, comparisons, summary_line, comparison_type: 'yoy' }
  }

  /**
   * Compare a specific year vs. the prior year (YoY annual).
   * e.g. getYearComparison(id, 2025, supabase) → 2025 vs 2024
   */
  static async getYearComparison(
    companyId: string,
    year: number,
    supabase: AnyClient,
  ): Promise<PeriodComparisonReport> {
    const currentRange = yearRange(year)
    const priorRange   = yearRange(year - 1)

    const [currentTotals, priorTotals] = await Promise.all([
      fetchPeriodTotals(companyId, supabase, currentRange.from, currentRange.to),
      fetchPeriodTotals(companyId, supabase, priorRange.from, priorRange.to),
    ])

    const current = buildPeriodMetrics(String(year),      'year', currentTotals.revenue, currentTotals.expense)
    const prior   = buildPeriodMetrics(String(year - 1),  'year', priorTotals.revenue,   priorTotals.expense)

    const comparisons  = buildComparisons(current, prior)
    const summary_line = buildSummaryLine(comparisons, 'yoy')

    return { current, prior, comparisons, summary_line, comparison_type: 'yoy' }
  }
}
