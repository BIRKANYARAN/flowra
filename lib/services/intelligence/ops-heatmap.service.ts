// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/ops-heatmap.service.ts
//
// Operational KPI Heatmap — 13-week × 7-day grid showing daily revenue,
// orders, collections, expenses, and net cash flow patterns.
//
// OPS Command Center view: when is the business busy, when are sales low,
// which days have high expense activity.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface DayData {
  date: string            // 'YYYY-MM-DD'
  day_of_week: number     // 0=Mon, 6=Sun
  week_number: number     // 0-12 (relative week)
  revenue: number
  orders: number
  collections: number
  expenses: number
  net_cash: number
  revenue_intensity: number   // 0-100 relative to max day in period
  orders_intensity: number
}

export interface WeekSummary {
  week_start: string
  week_label: string      // 'H1' through 'H13'
  total_revenue: number
  total_orders: number
  total_collections: number
  total_expenses: number
  net_cash: number
  best_day: string        // date of highest revenue
  worst_day: string | null // date of zero revenue (if any)
}

export interface OpsHeatmapReport {
  company_id: string
  from_date: string
  to_date: string         // today
  days: DayData[]
  weeks: WeekSummary[]
  // Stats
  best_day_revenue: number
  best_day_date: string
  avg_daily_revenue: number
  avg_daily_orders: number
  zero_revenue_days: number    // days with no sales
  weekend_vs_weekday_ratio: number  // avg weekend revenue / avg weekday
  // Day-of-week patterns
  dow_revenue_avg: number[]    // [Mon_avg, Tue_avg, ..., Sun_avg]
  dow_orders_avg: number[]
  best_dow: number             // 0-6, highest avg revenue day
  worst_dow: number            // 0-6, lowest avg revenue day
  computed_at: string
}

// ── Pure exported helpers ─────────────────────────────────────────────────────

/**
 * Compute intensity score 0-100 relative to maxValue.
 * Returns 0 when maxValue is 0 (guard against division by zero).
 */
export function computeIntensity(value: number, maxValue: number): number {
  if (maxValue === 0) return 0
  return Math.min(100, Math.max(0, (value / maxValue) * 100))
}

/**
 * Compute 0-based week number for a date relative to a start date.
 * Both dates in 'YYYY-MM-DD' format.
 * Week 0 = same week as startDate (days 0-6).
 */
export function computeWeekNumber(date: string, startDate: string): number {
  const msPerDay = 86_400_000
  const start = new Date(startDate).getTime()
  const d     = new Date(date).getTime()
  const diffDays = Math.round((d - start) / msPerDay)
  return Math.floor(diffDays / 7)
}

/**
 * Compute ISO-style day-of-week index (0=Monday … 6=Sunday).
 */
export function computeDowIndex(dateStr: string): number {
  const day = new Date(dateStr).getDay() // 0=Sun, 1=Mon … 6=Sat
  return day === 0 ? 6 : day - 1        // convert to Mon=0 … Sun=6
}

/**
 * Compute average revenue for a specific day-of-week across the period.
 * Returns 0 if no days match.
 */
export function computeDowAvg(days: DayData[], targetDow: number): number {
  const matching = days.filter(d => d.day_of_week === targetDow)
  if (matching.length === 0) return 0
  const total = matching.reduce((s, d) => s + d.revenue, 0)
  return total / matching.length
}

/**
 * Find the index of the highest value in an array.
 * Returns 0 if array is empty.
 */
export function findBestDow(dowAvgs: number[]): number {
  if (dowAvgs.length === 0) return 0
  let best = 0
  for (let i = 1; i < dowAvgs.length; i++) {
    if (dowAvgs[i] > dowAvgs[best]) best = i
  }
  return best
}

/**
 * Compute weekend (Sat=5, Sun=6) avg revenue divided by weekday avg.
 * Returns 1.0 when there are no weekday days (guard).
 */
export function computeWeekendRatio(days: DayData[]): number {
  const weekends = days.filter(d => d.day_of_week >= 5)
  const weekdays = days.filter(d => d.day_of_week < 5)

  if (weekdays.length === 0) return 1.0

  const weekendAvg = weekends.length > 0
    ? weekends.reduce((s, d) => s + d.revenue, 0) / weekends.length
    : 0
  const weekdayAvg = weekdays.reduce((s, d) => s + d.revenue, 0) / weekdays.length

  if (weekdayAvg === 0) return 1.0
  return weekendAvg / weekdayAvg
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function padDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function buildDateRange(fromDate: string, toDate: string): string[] {
  const dates: string[] = []
  const cursor = new Date(fromDate)
  const end    = new Date(toDate)
  while (cursor <= end) {
    dates.push(padDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function buildWeekSummaries(days: DayData[]): WeekSummary[] {
  if (days.length === 0) return []

  const byWeek = new Map<number, DayData[]>()
  for (const d of days) {
    const arr = byWeek.get(d.week_number) ?? []
    arr.push(d)
    byWeek.set(d.week_number, arr)
  }

  const summaries: WeekSummary[] = []

  for (const [weekNum, wDays] of Array.from(byWeek.entries()).sort(([a], [b]) => a - b)) {
    const sortedDays = [...wDays].sort((a, b) => a.date.localeCompare(b.date))
    const weekStart  = sortedDays[0].date

    const bestDay  = sortedDays.reduce((best, d) => d.revenue > best.revenue ? d : best, sortedDays[0])
    const zeroDays = sortedDays.filter(d => d.revenue === 0)

    summaries.push({
      week_start:        weekStart,
      week_label:        `H${weekNum + 1}`,
      total_revenue:     wDays.reduce((s, d) => s + d.revenue, 0),
      total_orders:      wDays.reduce((s, d) => s + d.orders, 0),
      total_collections: wDays.reduce((s, d) => s + d.collections, 0),
      total_expenses:    wDays.reduce((s, d) => s + d.expenses, 0),
      net_cash:          wDays.reduce((s, d) => s + d.net_cash, 0),
      best_day:          bestDay.date,
      worst_day:         zeroDays.length > 0 ? zeroDays[0].date : null,
    })
  }

  return summaries
}

// ── Service class ─────────────────────────────────────────────────────────────

export class OpsHeatmapService {
  static async getReport(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<OpsHeatmapReport> {
    const toDate   = padDate(new Date())
    const fromMs   = Date.now() - 90 * 86_400_000
    const fromDate = padDate(new Date(fromMs))

    // ── Fetch sales for revenue, orders, collections ──────────────────────────
    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('sale_date, total_try:total, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', fromDate)
        .lte('sale_date', toDate),

      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate),
    ])

    type SaleRow    = { sale_date: string; total_try: number; paid_amount: number | null }
    type ExpenseRow = { expense_date: string; amount_try: number }

    const salesRows:    SaleRow[]    = (salesRes.data    ?? []) as SaleRow[]
    const expenseRows:  ExpenseRow[] = (expensesRes.data ?? []) as ExpenseRow[]

    // ── Aggregate by date ─────────────────────────────────────────────────────
    const revenueByDate:     Map<string, number> = new Map()
    const ordersByDate:      Map<string, number> = new Map()
    const collectionsByDate: Map<string, number> = new Map()

    for (const row of salesRows) {
      const d = row.sale_date
      revenueByDate.set(d,     (revenueByDate.get(d)     ?? 0) + (row.total_try   ?? 0))
      ordersByDate.set(d,      (ordersByDate.get(d)      ?? 0) + 1)
      collectionsByDate.set(d, (collectionsByDate.get(d) ?? 0) + (row.paid_amount ?? 0))
    }

    const expensesByDate: Map<string, number> = new Map()
    for (const row of expenseRows) {
      const d = row.expense_date
      expensesByDate.set(d, (expensesByDate.get(d) ?? 0) + (row.amount_try ?? 0))
    }

    // ── Build day data for every date in range ────────────────────────────────
    const allDates = buildDateRange(fromDate, toDate)
    const maxRevenue = Math.max(0, ...Array.from(revenueByDate.values()))
    const maxOrders  = Math.max(0, ...Array.from(ordersByDate.values()))

    const days: DayData[] = allDates.map(date => {
      const revenue     = revenueByDate.get(date)     ?? 0
      const orders      = ordersByDate.get(date)      ?? 0
      const collections = collectionsByDate.get(date) ?? 0
      const expenses    = expensesByDate.get(date)    ?? 0

      return {
        date,
        day_of_week:        computeDowIndex(date),
        week_number:        computeWeekNumber(date, fromDate),
        revenue,
        orders,
        collections,
        expenses,
        net_cash:           collections - expenses,
        revenue_intensity:  computeIntensity(revenue, maxRevenue),
        orders_intensity:   computeIntensity(orders,  maxOrders),
      }
    })

    // ── Compute week summaries ────────────────────────────────────────────────
    const weeks = buildWeekSummaries(days)

    // ── Compute stats ─────────────────────────────────────────────────────────
    const daysWithRevenue = days.filter(d => d.revenue > 0)
    const bestDay         = days.reduce(
      (best, d) => d.revenue > best.revenue ? d : best,
      days[0] ?? { date: fromDate, revenue: 0 }
    )

    const totalRevenue = days.reduce((s, d) => s + d.revenue, 0)
    const totalOrders  = days.reduce((s, d) => s + d.orders,  0)
    const dayCount     = days.length

    const dow_revenue_avg: number[] = Array.from({ length: 7 }, (_, i) => computeDowAvg(days, i))
    const dow_orders_avg:  number[] = Array.from({ length: 7 }, (_, i) => {
      const matching = days.filter(d => d.day_of_week === i)
      if (matching.length === 0) return 0
      return matching.reduce((s, d) => s + d.orders, 0) / matching.length
    })

    const best_dow  = findBestDow(dow_revenue_avg)
    const worst_dow = dow_revenue_avg.reduce(
      (worst, v, i) => v < dow_revenue_avg[worst] ? i : worst,
      0
    )

    return {
      company_id:              companyId,
      from_date:               fromDate,
      to_date:                 toDate,
      days,
      weeks,
      best_day_revenue:        bestDay.revenue,
      best_day_date:           bestDay.date,
      avg_daily_revenue:       dayCount > 0 ? totalRevenue / dayCount : 0,
      avg_daily_orders:        dayCount > 0 ? totalOrders  / dayCount : 0,
      zero_revenue_days:       dayCount - daysWithRevenue.length,
      weekend_vs_weekday_ratio: computeWeekendRatio(days),
      dow_revenue_avg,
      dow_orders_avg,
      best_dow,
      worst_dow,
      computed_at: new Date().toISOString(),
    }
  }
}
