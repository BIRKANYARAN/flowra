// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/expense-forecast.service.ts
//
// Expense Forecast — predict next month's expenses by category.
//
// Algorithm:
//   1. Fetch last 6 calendar months of expenses grouped by category.
//   2. For each category:
//        last_3m_avg  = mean of M-1, M-2, M-3
//        prior_3m_avg = mean of M-4, M-5, M-6
//        trend_pct    = (last_3m_avg - prior_3m_avg) / prior_3m_avg × 100
//        trend        = growing if >5%, declining if <-5%, stable otherwise
//        forecast     = last_3m_avg × (1 + trend_pct × 0.3)    (damped)
//        confidence   = high if CV < 15%, medium if CV < 35%, low otherwise
//   3. Recurring detection: same supplier_name in ≥4 of 6 months with CV < 10%.
//   4. Budget comparison: monthly_budgets for forecast month (if exists).
//   5. Turkish summary narrative.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type ForecastConfidence = 'high' | 'medium' | 'low'

export interface CategoryForecast {
  category: string
  category_label: string
  last_3m_avg: number
  forecast_next_month: number
  trend: 'growing' | 'stable' | 'declining'
  trend_pct: number
  confidence: ForecastConfidence
  recurring_amount: number
  variable_amount: number
  anomaly_flag: boolean
}

export interface ExpenseForecastReport {
  company_id: string
  forecast_month: string      // 'YYYY-MM'
  forecast_month_label: string
  categories: CategoryForecast[]
  total_forecast: number
  total_recurring: number
  total_variable: number
  confidence_overall: ForecastConfidence
  budget_total?: number
  budget_variance_pct?: number
  summary_line: string
  computed_at: string
}

// ── Category label map ────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  salary:               'Maaşlar',
  rent:                 'Kira',
  software:             'Yazılım & Abonelik',
  marketing:            'Pazarlama',
  logistics:            'Lojistik',
  utilities:            'Faturalar',
  operational:          'Operasyonel',
  general:              'Genel Gider',
  partner_loan_interest: 'Ortak Faizi',
  tax:                  'Vergi',
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** Format 'YYYY-MM' to Turkish long label e.g. 'Haziran 2026' */
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Build list of N calendar months ending at `now`, newest first. */
function buildMonthSlots(
  now: Date,
  count: number,
): Array<{ year: number; month: number; key: string; label: string }> {
  const slots = []
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key, label: monthLabel(year, month) })
  }
  return slots
}

/** First and last day of a month as YYYY-MM-DD strings. */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Advance a YYYY-MM key by +1 month. */
function nextMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m, 1) // m is already 0-indexed after +1
  const yr = d.getFullYear()
  const mo = d.getMonth() + 1
  return `${yr}-${String(mo).padStart(2, '0')}`
}

// ── Pure computation functions ────────────────────────────────────────────────

/**
 * Compute coefficient of variation: stddev / mean × 100.
 * Returns 0 when mean is 0.
 */
function coeffOfVariation(values: number[]): number {
  const n = values.length
  if (n === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n
  const stddev = Math.sqrt(variance)
  return (stddev / Math.abs(mean)) * 100
}

/**
 * Determine trend from trend_pct.
 * growing if > 5%, declining if < -5%, stable otherwise.
 */
export function computeCategoryTrend(trendPct: number): 'growing' | 'stable' | 'declining' {
  if (trendPct > 5) return 'growing'
  if (trendPct < -5) return 'declining'
  return 'stable'
}

/**
 * Detect whether a stream of monthly amounts represents a recurring expense.
 *
 * Rules:
 *   - At least 4 of the 6 monthly slots must be non-null (present)
 *   - CV of the non-null values must be < 10%
 *
 * @param monthlyAmounts  6 slots (oldest first), null = no expense that month
 * @param _vendorName     vendor identifier (currently unused but required for testability)
 */
export function detectRecurring(
  monthlyAmounts: (number | null)[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _vendorName: string,
): boolean {
  const present = monthlyAmounts.filter((v): v is number => v !== null && v > 0)
  if (present.length < 4) return false
  const cv = coeffOfVariation(present)
  return cv < 10
}

/**
 * Build a CategoryForecast from 6 months of totals (index 0 = oldest, 5 = most recent).
 *
 * @param category       category key
 * @param monthlyTotals  exactly 6 elements; 0 if no expense in that month
 * @param avg6m          6-month average (pre-computed for anomaly detection)
 */
export function buildCategoryForecast(
  category: string,
  monthlyTotals: number[],
  avg6m: number,
  recurringAmount: number,
): CategoryForecast {
  // Ensure we always have exactly 6 elements
  const totals = monthlyTotals.slice(0, 6)
  while (totals.length < 6) totals.unshift(0)

  // oldest at index 0, newest at index 5
  // last_3m: indices 3,4,5 (M-3, M-2, M-1)
  // prior_3m: indices 0,1,2 (M-6, M-5, M-4)
  const last3 = totals.slice(3, 6)
  const prior3 = totals.slice(0, 3)

  const last3Avg  = round2(last3.reduce((s, v) => s + v, 0) / 3)
  const prior3Avg = round2(prior3.reduce((s, v) => s + v, 0) / 3)

  const trendPct = prior3Avg === 0
    ? 0
    : round2(((last3Avg - prior3Avg) / prior3Avg) * 100)

  const trend = computeCategoryTrend(trendPct)

  // Damped forecast: last_3m_avg × (1 + trend_pct × 0.3)
  const forecast = round2(last3Avg * (1 + trendPct * 0.3 / 100))

  // Confidence via CV of all 6 months
  const cv = coeffOfVariation(totals)
  let confidence: ForecastConfidence
  if (cv < 15) confidence = 'high'
  else if (cv < 35) confidence = 'medium'
  else confidence = 'low'

  const variableAmount = round2(Math.max(0, forecast - recurringAmount))

  // anomaly_flag: forecast > 30% above 6m avg
  const anomalyFlag = avg6m > 0 && forecast > avg6m * 1.3

  return {
    category,
    category_label: CATEGORY_LABELS[category] ?? category,
    last_3m_avg: last3Avg,
    forecast_next_month: forecast,
    trend,
    trend_pct: trendPct,
    confidence,
    recurring_amount: recurringAmount,
    variable_amount: variableAmount,
    anomaly_flag: anomalyFlag,
  }
}

/**
 * Build the Turkish summary narrative line.
 */
export function buildSummaryLine(
  forecastMonthLabel: string,
  totalForecast: number,
  last3mAvgTotal: number,
): string {
  const diff = last3mAvgTotal === 0
    ? 0
    : round2(((totalForecast - last3mAvgTotal) / last3mAvgTotal) * 100)

  const absTotal = Math.abs(totalForecast)
  const amountStr = absTotal >= 1_000_000
    ? `₺${round2(absTotal / 1_000_000)}M`
    : absTotal >= 1_000
    ? `₺${Math.round(absTotal / 1_000)}K`
    : `₺${Math.round(absTotal)}`

  const direction = diff > 0 ? 'yüksek' : 'düşük'
  const absDiff = Math.abs(round2(diff))

  if (last3mAvgTotal === 0) {
    return `${forecastMonthLabel} için toplam ${amountStr} gider tahmin ediliyor.`
  }
  return `${forecastMonthLabel} için toplam ${amountStr} gider tahmin ediliyor — 3 aylık ortalamadan %${absDiff} ${direction}.`
}

// ── Service class ─────────────────────────────────────────────────────────────

export class ExpenseForecastService {

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<ExpenseForecastReport> {

    // Build 6 month slots ending at current month (newest first)
    const slots = buildMonthSlots(now, 6)  // newest = index 0
    const oldestSlot = slots[slots.length - 1]
    const newestSlot = slots[0]

    // Forecast month = next month after the most recent slot
    const forecastKey = nextMonthKey(newestSlot.key)
    const [forecastYear, forecastMonthNum] = forecastKey.split('-').map(Number)
    const forecastLabel = monthLabel(forecastYear, forecastMonthNum)

    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to: windowTo }     = monthRange(newestSlot.year, newestSlot.month)

    // ── Fetch expenses with category and supplier_name ────────────────────────
    const [expenseResult, budgetResult] = await Promise.allSettled([
      supabase
        .from('expenses')
        // expenses has no supplier_name — `title` is the payee/expense name (aliased)
        .select('expense_date, amount_try, category, supplier_name:title')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      supabase
        .from('monthly_budgets')
        .select('budget_year, budget_month, expense_target_try')
        .eq('company_id', companyId)
        .eq('budget_year', forecastYear)
        .eq('budget_month', forecastMonthNum)
        .maybeSingle(),
    ])

    // ── Build per-category-per-month buckets ─────────────────────────────────
    // categoryMonths[cat][monthKey] = total
    const categoryMonths: Record<string, Record<string, number>> = {}
    // supplierMonths[cat|supplier][monthKey] = amount
    const supplierAmounts: Record<string, Record<string, number[]>> = {}

    // Initialize all slots to 0 for all categories we'll discover
    const slotKeys = slots.map(s => s.key) // newest first → we'll reverse later

    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const monthKey = (row.expense_date as string).slice(0, 7)
        if (!slotKeys.includes(monthKey)) continue

        const cat: string = (row.category as string | null) ?? 'general'
        const amount = Number(row.amount_try) || 0
        const supplier: string = (row.supplier_name as string | null) ?? ''

        // Category totals
        if (!categoryMonths[cat]) categoryMonths[cat] = {}
        categoryMonths[cat][monthKey] = round2(
          (categoryMonths[cat][monthKey] ?? 0) + amount,
        )

        // Supplier-level amounts per month (for recurring detection)
        if (supplier) {
          const supKey = `${cat}||${supplier}`
          if (!supplierAmounts[supKey]) supplierAmounts[supKey] = {}
          if (!supplierAmounts[supKey][monthKey]) supplierAmounts[supKey][monthKey] = []
          supplierAmounts[supKey][monthKey].push(amount)
        }
      }
    }

    // ── Detect recurring per-category totals ─────────────────────────────────
    // For each category, sum recurring supplier amounts
    const categoryRecurring: Record<string, number> = {}

    for (const [supKey, monthData] of Object.entries(supplierAmounts)) {
      const [cat, supplier] = supKey.split('||')

      // Build ordered monthly amounts (oldest first, 6 slots)
      const orderedSlots = [...slotKeys].reverse() // oldest first
      const monthlyAmounts: (number | null)[] = orderedSlots.map(key => {
        const vals = monthData[key]
        if (!vals || vals.length === 0) return null
        return vals.reduce((s, v) => s + v, 0)
      })

      if (detectRecurring(monthlyAmounts, supplier)) {
        // Recurring: use average of non-null months
        const present = monthlyAmounts.filter((v): v is number => v !== null)
        const avgRecurring = present.reduce((s, v) => s + v, 0) / present.length
        categoryRecurring[cat] = round2((categoryRecurring[cat] ?? 0) + avgRecurring)
      }
    }

    // ── Build CategoryForecast for each discovered category ──────────────────
    const categories: CategoryForecast[] = []

    for (const [cat, monthData] of Object.entries(categoryMonths)) {
      // Build ordered totals oldest-first (6 slots)
      const orderedSlots = [...slotKeys].reverse()
      const monthlyTotals: number[] = orderedSlots.map(key => monthData[key] ?? 0)

      const avg6m = round2(monthlyTotals.reduce((s, v) => s + v, 0) / 6)
      const recurringAmt = round2(categoryRecurring[cat] ?? 0)

      const forecast = buildCategoryForecast(cat, monthlyTotals, avg6m, recurringAmt)
      categories.push(forecast)
    }

    // Sort by forecast amount descending
    categories.sort((a, b) => b.forecast_next_month - a.forecast_next_month)

    // ── Compute totals ────────────────────────────────────────────────────────
    const totalForecast  = round2(categories.reduce((s, c) => s + c.forecast_next_month, 0))
    const totalRecurring = round2(categories.reduce((s, c) => s + c.recurring_amount, 0))
    const totalVariable  = round2(categories.reduce((s, c) => s + c.variable_amount, 0))
    const last3mAvgTotal = round2(categories.reduce((s, c) => s + c.last_3m_avg, 0))

    // Overall confidence: weakest link
    const hasLow    = categories.some(c => c.confidence === 'low')
    const hasMedium = categories.some(c => c.confidence === 'medium')
    const confidenceOverall: ForecastConfidence = hasLow ? 'low' : hasMedium ? 'medium' : 'high'

    // ── Budget comparison ─────────────────────────────────────────────────────
    let budgetTotal: number | undefined
    let budgetVariancePct: number | undefined

    if (budgetResult.status === 'fulfilled' && budgetResult.value?.data) {
      const bRow = budgetResult.value.data
      const bt = Number(bRow.expense_target_try)
      if (!isNaN(bt) && bt > 0) {
        budgetTotal = bt
        budgetVariancePct = round2(((totalForecast - bt) / bt) * 100)
      }
    }

    const summaryLine = buildSummaryLine(forecastLabel, totalForecast, last3mAvgTotal)

    return {
      company_id: companyId,
      forecast_month: forecastKey,
      forecast_month_label: forecastLabel,
      categories,
      total_forecast: totalForecast,
      total_recurring: totalRecurring,
      total_variable: totalVariable,
      confidence_overall: confidenceOverall,
      ...(budgetTotal !== undefined && { budget_total: budgetTotal }),
      ...(budgetVariancePct !== undefined && { budget_variance_pct: budgetVariancePct }),
      summary_line: summaryLine,
      computed_at: new Date().toISOString(),
    }
  }
}
