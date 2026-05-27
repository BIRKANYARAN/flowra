// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/financial-trends.service.ts
//
// Financial Trend Report — 12-month KPI trend lines with momentum scoring.
//
// Queries:
//   revenue     — sum(sales.total_try) per month (not proformas, not deleted)
//   expense     — sum(expenses.amount_try) per month (not deleted)
//   gross_profit — revenue - expense
//   net_income  — same as gross_profit (no tax adjustment)
//   receivables — sum(total_try - paid_amount) outstanding at month-end
//   cash_position — from balance_sheet_snapshots if available, else null
//
// Momentum scoring:
//   Compare slope of last 3 months vs prior 3 months (months 7-9 from start)
//   accelerating: recent_slope > prior_slope + 10% of |prior_slope|
//   decelerating: recent_slope < prior_slope - 10% of |prior_slope|
//   volatile: coefficient of variation > 40%
//   steady: otherwise
//   insufficient: < 6 data points
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TrendPoint {
  month: string   // 'YYYY-MM'
  label: string   // 'Oca 26' (short Turkish)
  value: number
}

export interface KpiTrend {
  kpi_key: string
  label: string
  unit: 'try' | 'pct' | 'months' | 'count'
  points: TrendPoint[]        // 12 months, oldest first
  current_value: number | null
  min_value: number
  max_value: number
  avg_value: number
  momentum: 'accelerating' | 'steady' | 'decelerating' | 'volatile' | 'insufficient'
  trend_line: Array<{ month: string; trend_value: number }>
}

export interface FinancialTrendsReport {
  trends: {
    revenue: KpiTrend
    expense: KpiTrend
    gross_profit: KpiTrend
    net_income: KpiTrend
    receivables: KpiTrend
    cash_position: KpiTrend
  }
  summary: {
    revenue_momentum: KpiTrend['momentum']
    profit_momentum: KpiTrend['momentum']
    overall_trend_label: string
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Short Turkish month names (0-indexed: 0 = 'Oca', 11 = 'Ara').
 */
export const SHORT_MONTH_LABELS: string[] = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

/**
 * Build a short Turkish month label like 'Oca 26'.
 * monthNum is 1-indexed (1=January).
 */
function shortMonthLabel(year: number, monthNum: number): string {
  return `${SHORT_MONTH_LABELS[monthNum - 1]} ${String(year).slice(-2)}`
}

/**
 * Compute linear regression trend values for an array of numbers.
 * Uses least-squares fit: y = a + b×x where x is 0, 1, 2, ..., n-1.
 * Returns an array of the same length with fitted values.
 * Returns empty array for empty input, and the same single value for length 1.
 */
export function computeLinearRegression(values: number[]): number[] {
  const n = values.length
  if (n === 0) return []
  if (n === 1) return [values[0]]

  // x values: 0, 1, 2, ..., n-1
  const xMean = (n - 1) / 2
  const yMean = values.reduce((s, v) => s + v, 0) / n

  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    numerator   += dx * (values[i] - yMean)
    denominator += dx * dx
  }

  const b = denominator === 0 ? 0 : numerator / denominator
  const a = yMean - b * xMean

  return values.map((_, i) => round2(a + b * i))
}

/**
 * Compute coefficient of variation: stddev / mean × 100.
 * Returns 0 when mean is 0 (avoids division by zero).
 */
export function computeCoeffOfVariation(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)
  return round2((stddev / Math.abs(mean)) * 100)
}

/**
 * Compute momentum for a KPI trend.
 * Requires >= 9 data points for slope comparison; >= 6 for volatile check.
 *
 * Logic:
 *   recent slope = avg change over last 3 months (index 9-11)
 *   prior slope  = avg change over prior 3 months (index 6-8)
 *   accelerating: recent_slope > prior_slope + 10% of |prior_slope|
 *   decelerating: recent_slope < prior_slope - 10% of |prior_slope|
 *   volatile: CV > 40%
 *   steady: otherwise
 *   insufficient: < 6 data points
 */
export function computeMomentum(points: TrendPoint[]): KpiTrend['momentum'] {
  const validPoints = points.filter(p => p.value !== null && !isNaN(p.value))
  if (validPoints.length < 6) return 'insufficient'

  const values = validPoints.map(p => p.value)

  // Volatile check first — uses all available points
  const cv = computeCoeffOfVariation(values)
  if (cv > 40) return 'volatile'

  // Need at least 9 points for slope comparison
  if (validPoints.length < 9) return 'steady'

  // Recent slope: average of differences in last 3 months (indices n-3 to n-1)
  const n = values.length
  const recentDiffs: number[] = []
  for (let i = n - 2; i >= n - 3 && i >= 1; i--) {
    recentDiffs.push(values[i + 1] - values[i])
  }
  const recentSlope = recentDiffs.length > 0
    ? recentDiffs.reduce((s, v) => s + v, 0) / recentDiffs.length
    : 0

  // Prior slope: average of differences in months at indices (n-6) to (n-4)
  const priorDiffs: number[] = []
  for (let i = n - 5; i >= n - 6 && i >= 1; i--) {
    priorDiffs.push(values[i + 1] - values[i])
  }
  const priorSlope = priorDiffs.length > 0
    ? priorDiffs.reduce((s, v) => s + v, 0) / priorDiffs.length
    : 0

  const threshold = Math.abs(priorSlope) * 0.1

  if (recentSlope > priorSlope + threshold) return 'accelerating'
  if (recentSlope < priorSlope - threshold) return 'decelerating'
  return 'steady'
}

// ── Internal builder ──────────────────────────────────────────────────────────

function buildKpiTrend(
  kpiKey: string,
  label: string,
  unit: KpiTrend['unit'],
  monthKeys: string[],         // 12 YYYY-MM keys, oldest first
  valuesByMonth: Map<string, number | null>,
): KpiTrend {
  const points: TrendPoint[] = monthKeys.map(ym => {
    const [year, mon] = ym.split('-').map(Number)
    return {
      month: ym,
      label: shortMonthLabel(year, mon),
      value: valuesByMonth.get(ym) ?? 0,
    }
  })

  const numericValues = points.map(p => p.value)
  const nonNullSource = monthKeys
    .map(ym => valuesByMonth.get(ym))
    .filter((v): v is number => v !== null && v !== undefined)

  const min_value = nonNullSource.length > 0 ? Math.min(...nonNullSource) : 0
  const max_value = nonNullSource.length > 0 ? Math.max(...nonNullSource) : 0
  const avg_value = nonNullSource.length > 0
    ? round2(nonNullSource.reduce((s, v) => s + v, 0) / nonNullSource.length)
    : 0

  // current_value: last non-null entry
  let current_value: number | null = null
  for (let i = monthKeys.length - 1; i >= 0; i--) {
    const v = valuesByMonth.get(monthKeys[i])
    if (v !== null && v !== undefined) {
      current_value = v
      break
    }
  }

  const trendValues = computeLinearRegression(numericValues)
  const trend_line = monthKeys.map((ym, i) => ({
    month: ym,
    trend_value: trendValues[i] ?? 0,
  }))

  const momentum = computeMomentum(points)

  return {
    kpi_key: kpiKey,
    label,
    unit,
    points,
    current_value,
    min_value,
    max_value,
    avg_value,
    momentum,
    trend_line,
  }
}

// ── Turkish overall label ──────────────────────────────────────────────────────

function buildOverallTrendLabel(
  revMomentum: KpiTrend['momentum'],
  profitMomentum: KpiTrend['momentum'],
): string {
  const momentumLabel = (m: KpiTrend['momentum'], subject: string): string => {
    switch (m) {
      case 'accelerating':  return `${subject} hızlanıyor`
      case 'decelerating':  return `${subject} yavaşlıyor`
      case 'volatile':      return `${subject} dalgalı`
      case 'steady':        return `${subject} istikrarlı`
      case 'insufficient':  return `${subject} yetersiz veri`
    }
  }

  const revLabel    = momentumLabel(revMomentum, 'Gelir')
  const profitLabel = momentumLabel(profitMomentum, 'karlılık')
  return `${revLabel}, ${profitLabel}`
}

// ── Service ────────────────────────────────────────────────────────────────────

export class FinancialTrendsService {

  /**
   * Build a FinancialTrendsReport for the given company using the last 12 months.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<FinancialTrendsReport> {
    // ── Build 12 YYYY-MM keys, oldest first ────────────────────────────────────
    const monthKeys: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthKeys.push(ym)
    }

    const windowFrom = `${monthKeys[0]}-01`
    const lastMonth  = monthKeys[monthKeys.length - 1]
    const [ly, lm]   = lastMonth.split('-').map(Number)
    const lastDay    = new Date(ly, lm, 0)  // last day of last month
    const windowTo   = lastDay.toISOString().slice(0, 10)

    // ── Parallel data fetch ─────────────────────────────────────────────────────
    const [salesRes, expensesRes, receivablesRes, balanceRes] = await Promise.allSettled([
      // Sales — monthly revenue
      supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      // Expenses — monthly expense
      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Receivables — all outstanding balances (used for month-end snapshot)
      supabase
        .from('sales')
        .select('sale_date, total_try, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('sale_date', windowTo),

      // Balance sheet snapshots — cash position
      supabase
        .from('balance_sheet_snapshots')
        .select('snapshot_date, cash_and_equivalents_try')
        .eq('company_id', companyId)
        .gte('snapshot_date', windowFrom)
        .lte('snapshot_date', windowTo)
        .order('snapshot_date', { ascending: true }),
    ])

    // ── Aggregate: revenue and expense by month ────────────────────────────────
    const revenueByMonth:  Map<string, number> = new Map()
    const expenseByMonth:  Map<string, number> = new Map()

    // Initialize all months to 0
    for (const ym of monthKeys) {
      revenueByMonth.set(ym, 0)
      expenseByMonth.set(ym, 0)
    }

    if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
      for (const row of salesRes.value.data) {
        if (!row.sale_date) continue
        const ym = (row.sale_date as string).slice(0, 7)
        if (revenueByMonth.has(ym)) {
          revenueByMonth.set(ym, round2((revenueByMonth.get(ym) ?? 0) + (Number(row.total_try) || 0)))
        }
      }
    }

    if (expensesRes.status === 'fulfilled' && expensesRes.value?.data) {
      for (const row of expensesRes.value.data) {
        if (!row.expense_date) continue
        const ym = (row.expense_date as string).slice(0, 7)
        if (expenseByMonth.has(ym)) {
          expenseByMonth.set(ym, round2((expenseByMonth.get(ym) ?? 0) + (Number(row.amount_try) || 0)))
        }
      }
    }

    // ── Gross profit and net income by month ───────────────────────────────────
    const grossProfitByMonth: Map<string, number> = new Map()
    const netIncomeByMonth:   Map<string, number> = new Map()
    for (const ym of monthKeys) {
      const rev = revenueByMonth.get(ym) ?? 0
      const exp = expenseByMonth.get(ym) ?? 0
      grossProfitByMonth.set(ym, round2(rev - exp))
      netIncomeByMonth.set(ym, round2(rev - exp))
    }

    // ── Receivables — month-end outstanding balances ───────────────────────────
    // For each month-end, sum all sales where outstanding balance > 0 up to that date.
    // We group by the sale month to get a rolling picture.
    const receivablesByMonth: Map<string, number> = new Map()
    for (const ym of monthKeys) {
      receivablesByMonth.set(ym, 0)
    }

    if (receivablesRes.status === 'fulfilled' && receivablesRes.value?.data) {
      // Build per-month-end outstanding: for each month-end, sum all open
      // receivables (sale_date <= month-end, outstanding > 0).
      for (const ym of monthKeys) {
        const [y, m] = ym.split('-').map(Number)
        const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10)

        let total = 0
        for (const row of receivablesRes.value.data) {
          if (!row.sale_date) continue
          if ((row.sale_date as string) > monthEnd) continue
          const outstanding = (Number(row.total_try) || 0) - (Number(row.paid_amount) || 0)
          if (outstanding > 0) total = round2(total + outstanding)
        }
        receivablesByMonth.set(ym, total)
      }
    }

    // ── Cash position — from balance_sheet_snapshots ───────────────────────────
    // For each month, use the latest snapshot in that month (if any).
    const cashByMonth: Map<string, number | null> = new Map()
    for (const ym of monthKeys) {
      cashByMonth.set(ym, null)  // null = no data for this month
    }

    if (balanceRes.status === 'fulfilled' && balanceRes.value?.data) {
      // Group by month, take latest snapshot per month
      const latestCashPerMonth: Map<string, { date: string; cash: number }> = new Map()
      for (const row of balanceRes.value.data) {
        if (!row.snapshot_date) continue
        const ym   = (row.snapshot_date as string).slice(0, 7)
        const cash = Number(row.cash_and_equivalents_try) || 0
        const existing = latestCashPerMonth.get(ym)
        if (!existing || (row.snapshot_date as string) > existing.date) {
          latestCashPerMonth.set(ym, { date: row.snapshot_date as string, cash })
        }
      }
      for (const [ym, { cash }] of latestCashPerMonth) {
        if (cashByMonth.has(ym)) {
          cashByMonth.set(ym, cash)
        }
      }
    }

    // For trend building, convert null cash to 0 so sparklines still render,
    // but keep track of whether any data existed for current_value purposes.
    const cashForTrend: Map<string, number> = new Map()
    for (const ym of monthKeys) {
      cashForTrend.set(ym, cashByMonth.get(ym) ?? 0)
    }

    // ── Build KPI trends ───────────────────────────────────────────────────────
    const revenue     = buildKpiTrend('revenue',      'Gelir',              'try', monthKeys, revenueByMonth)
    const expense     = buildKpiTrend('expense',      'Gider',              'try', monthKeys, expenseByMonth)
    const grossProfit = buildKpiTrend('gross_profit', 'Brüt Kâr',           'try', monthKeys, grossProfitByMonth)
    const netIncome   = buildKpiTrend('net_income',   'Net Kâr',            'try', monthKeys, netIncomeByMonth)
    const receivables = buildKpiTrend('receivables',  'Alacaklar',          'try', monthKeys, receivablesByMonth)

    // For cash_position, pass null-aware map so current_value reflects availability
    const cashPositionRaw: Map<string, number | null> = new Map()
    for (const ym of monthKeys) {
      cashPositionRaw.set(ym, cashByMonth.get(ym) ?? null)
    }
    const cashPosition = buildKpiTrend('cash_position', 'Nakit Pozisyonu', 'try', monthKeys, cashForTrend)
    // Override current_value to null if no snapshot exists for latest month
    const latestCash = cashByMonth.get(monthKeys[monthKeys.length - 1])
    cashPosition.current_value = latestCash !== undefined ? latestCash : null

    // ── Summary ────────────────────────────────────────────────────────────────
    const revenue_momentum = revenue.momentum
    const profit_momentum  = grossProfit.momentum
    const overall_trend_label = buildOverallTrendLabel(revenue_momentum, profit_momentum)

    return {
      trends: {
        revenue,
        expense,
        gross_profit: grossProfit,
        net_income:   netIncome,
        receivables,
        cash_position: cashPosition,
      },
      summary: {
        revenue_momentum,
        profit_momentum,
        overall_trend_label,
      },
    }
  }
}
