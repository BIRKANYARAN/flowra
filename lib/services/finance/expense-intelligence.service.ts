// ── ExpenseIntelligenceService — Expense Category Trend Analysis ──────────────
// Tracks monthly expense breakdown by expense_type with trend analysis.
// Compares current period to prior period and 3-month rolling average.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Labels ────────────────────────────────────────────────────────────────────

export const EXPENSE_TYPE_LABELS: Record<string, string> = {
  salary:            'Maaş',
  rent:              'Kira',
  software:          'Yazılım',
  marketing:         'Pazarlama',
  logistics:         'Lojistik',
  utilities:         'Faturalar',
  general:           'Genel Gider',
  operational:       'Operasyonel',
  tax:               'Vergi',
  interest:          'Faiz',
  other:             'Diğer',
  fixed:             'Sabit Gider',
  variable:          'Değişken Gider',
  capital:           'Sermaye',
  financial:         'Finansal',
  loan_repayment:    'Kredi Geri Ödemesi',
  partner_financing: 'Ortak Finansmanı',
  dividend:          'Kâr Payı',
  internal_transfer: 'İç Transfer',
}

function labelFor(expenseType: string): string {
  return EXPENSE_TYPE_LABELS[expenseType] ?? expenseType
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpenseCategoryTrend {
  expense_type: string
  label:        string

  // Current period
  current_try:        number
  current_pct_of_total: number  // share of total expenses

  // Prior period
  prior_try:     number
  change_try:    number           // current - prior
  change_pct:    number | null    // (current - prior) / prior × 100
  trend:         'up' | 'down' | 'stable' | 'new'

  // 3-month rolling average
  rolling_avg_try:    number | null
  vs_rolling_avg_pct: number | null  // how current month compares to rolling avg
}

export interface ExpenseIntelligenceReport {
  period_from: string
  period_to:   string

  total_expenses_try:  number
  prior_total_try:     number
  total_change_pct:    number | null

  categories: ExpenseCategoryTrend[]  // sorted by current_try desc

  // Fastest growing category
  fastest_growing:     string | null
  fastest_growing_pct: number | null

  // Largest category
  largest_category:     string
  largest_category_pct: number

  computed_at: string
}

// ── Raw DB row ─────────────────────────────────────────────────────────────────

interface ExpenseRow {
  amount_try:   number | null
  expense_type: string | null
  expense_date: string | null
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ExpenseIntelligenceService {
  // ── Pure functions ─────────────────────────────────────────────────────────

  static computeTrend(current: number, prior: number): ExpenseCategoryTrend['trend'] {
    if (prior === 0 && current > 0) return 'new'
    if (prior === 0) return 'stable'
    const changePct = ((current - prior) / prior) * 100
    if (changePct > 5)  return 'up'
    if (changePct < -5) return 'down'
    return 'stable'
  }

  // ── Helper: sum rows by expense_type ──────────────────────────────────────

  private static aggregateByType(rows: ExpenseRow[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const row of rows) {
      const type = row.expense_type ?? 'other'
      map.set(type, (map.get(type) ?? 0) + Number(row.amount_try ?? 0))
    }
    return map
  }

  // ── Prior period: same duration shifted back ───────────────────────────────

  private static shiftPeriod(period: { from: string; to: string }): { from: string; to: string } {
    const fromDate = new Date(period.from)
    const toDate   = new Date(period.to)
    const daysSpan = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    const priorTo   = new Date(fromDate.getTime() - 86400_000) // day before `from`
    const priorFrom = new Date(priorTo.getTime() - (daysSpan - 1) * 86400_000)

    return {
      from: priorFrom.toISOString().slice(0, 10),
      to:   priorTo.toISOString().slice(0, 10),
    }
  }

  // ── Rolling 3-month period: 3 months ending at period.to ──────────────────

  private static rollingPeriod(period: { from: string; to: string }): { from: string; to: string } {
    const toDate   = new Date(period.to)
    const fromDate = new Date(toDate)
    fromDate.setMonth(fromDate.getMonth() - 3)
    fromDate.setDate(fromDate.getDate() + 1)
    return {
      from: fromDate.toISOString().slice(0, 10),
      to:   period.to,
    }
  }

  // ── Main query ────────────────────────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    period: { from: string; to: string },
  ): Promise<ExpenseIntelligenceReport> {
    const priorPeriod   = ExpenseIntelligenceService.shiftPeriod(period)
    const rollingPeriod = ExpenseIntelligenceService.rollingPeriod(period)

    const [currentRes, priorRes, rollingRes] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),

      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', priorPeriod.from)
        .lte('expense_date', priorPeriod.to),

      supabase
        .from('expenses')
        .select('amount_try, expense_type, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', rollingPeriod.from)
        .lte('expense_date', rollingPeriod.to),
    ])

    const currentRows = (currentRes.data ?? []) as ExpenseRow[]
    const priorRows   = (priorRes.data   ?? []) as ExpenseRow[]
    const rollingRows = (rollingRes.data  ?? []) as ExpenseRow[]

    const currentMap = ExpenseIntelligenceService.aggregateByType(currentRows)
    const priorMap   = ExpenseIntelligenceService.aggregateByType(priorRows)
    const rollingMap = ExpenseIntelligenceService.aggregateByType(rollingRows)

    const totalCurrent = Array.from(currentMap.values()).reduce((s, v) => s + v, 0)
    const totalPrior   = Array.from(priorMap.values()).reduce((s, v) => s + v, 0)

    // Collect all expense types across current + prior
    const allTypes = new Set([...currentMap.keys(), ...priorMap.keys()])

    const categories: ExpenseCategoryTrend[] = []

    for (const type of allTypes) {
      const current = currentMap.get(type) ?? 0
      const prior   = priorMap.get(type)   ?? 0

      const changeTry = current - prior
      const changePct = prior > 0 ? ((changeTry / prior) * 100) : null

      const trend = ExpenseIntelligenceService.computeTrend(current, prior)

      // Rolling avg: sum of rolling 3-month / 3
      const rollingTotal = rollingMap.get(type) ?? 0
      const rollingAvg   = rollingTotal > 0 ? rollingTotal / 3 : null
      const vsRollingPct = rollingAvg && rollingAvg > 0
        ? ((current - rollingAvg) / rollingAvg) * 100
        : null

      categories.push({
        expense_type:       type,
        label:              labelFor(type),
        current_try:        current,
        current_pct_of_total: totalCurrent > 0 ? (current / totalCurrent) * 100 : 0,
        prior_try:          prior,
        change_try:         changeTry,
        change_pct:         changePct !== null ? Math.round(changePct * 10) / 10 : null,
        trend,
        rolling_avg_try:    rollingAvg,
        vs_rolling_avg_pct: vsRollingPct !== null ? Math.round(vsRollingPct * 10) / 10 : null,
      })
    }

    // Sort by current_try desc
    categories.sort((a, b) => b.current_try - a.current_try)

    // Fastest growing: highest positive change_pct among existing (not new) categories
    const growing = categories
      .filter(c => c.change_pct !== null && c.change_pct > 0 && c.trend !== 'new')
      .sort((a, b) => (b.change_pct ?? 0) - (a.change_pct ?? 0))

    const fastestGrowing    = growing[0]?.expense_type ?? null
    const fastestGrowingPct = growing[0]?.change_pct   ?? null

    const largestCategory    = categories[0]?.expense_type ?? ''
    const largestCategoryPct = categories[0]?.current_pct_of_total ?? 0

    const totalChangePct = totalPrior > 0
      ? Math.round(((totalCurrent - totalPrior) / totalPrior) * 100 * 10) / 10
      : null

    return {
      period_from:         period.from,
      period_to:           period.to,
      total_expenses_try:  totalCurrent,
      prior_total_try:     totalPrior,
      total_change_pct:    totalChangePct,
      categories,
      fastest_growing:     fastestGrowing,
      fastest_growing_pct: fastestGrowingPct,
      largest_category:    largestCategory,
      largest_category_pct: Math.round(largestCategoryPct * 10) / 10,
      computed_at:         new Date().toISOString(),
    }
  }
}
