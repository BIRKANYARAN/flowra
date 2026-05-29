// ── SalesVelocityTrendsService — Multi-Timeframe Sales Velocity Analysis ─────
// Computes daily/weekly/monthly sales velocity, trend direction, day-of-week
// performance, anomaly detection, and moving averages for Turkish SMEs.
//
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface DailyDataPoint {
  date: string              // YYYY-MM-DD
  revenue_try: number
  order_count: number
  avg_order_value: number   // revenue / order_count (0 if no orders)
}

export interface WeeklyDataPoint {
  week_start: string        // YYYY-MM-DD (Monday)
  week_end: string          // YYYY-MM-DD (Sunday)
  revenue_try: number
  order_count: number
  avg_order_value: number
  active_days: number       // days with at least 1 sale
}

export interface VelocityMetrics {
  daily_avg_revenue: number
  weekly_avg_revenue: number
  monthly_avg_revenue: number
  daily_avg_orders: number
  peak_day_revenue: number
  peak_day_date: string | null
  low_day_revenue: number         // lowest non-zero day
  coefficient_of_variation: number // daily revenue volatility
}

export interface SalesVelocityReport {
  analysis_window_days: number  // 90
  velocity: VelocityMetrics
  trend: ReturnType<typeof classifyVelocityTrend>
  trend_slope: number
  wow_growth_pct: number | null
  velocity_acceleration_pct: number | null
  consistency_score: number
  best_day_of_week: number   // 0-6
  best_day_name: string      // Turkish day name
  daily_data: DailyDataPoint[]
  weekly_data: WeeklyDataPoint[]
  moving_avg_7d: number[]
  anomaly_days: Array<{ date: string; revenue: number; z_score: number; is_positive: boolean }>
  dow_performance: Record<number, number>
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Aggregate raw sale records into a map of date → { revenue, count }.
 * Records with the same date are summed together.
 */
export function aggregateDailySales(
  sales: Array<{ sale_date: string; total: number }>,
): Map<string, { revenue: number; count: number }> {
  const map = new Map<string, { revenue: number; count: number }>()
  for (const s of sales) {
    const date = s.sale_date.slice(0, 10) // normalize to YYYY-MM-DD
    const existing = map.get(date)
    if (existing) {
      existing.revenue += s.total
      existing.count += 1
    } else {
      map.set(date, { revenue: s.total, count: 1 })
    }
  }
  return map
}

/**
 * Build a dense array of DailyDataPoints for [startDate, endDate] inclusive.
 * Days missing from salesMap get revenue=0, order_count=0, avg_order_value=0.
 */
export function buildDailyDataPoints(
  salesMap: Map<string, { revenue: number; count: number }>,
  startDate: string,
  endDate: string,
): DailyDataPoint[] {
  const points: DailyDataPoint[] = []
  const start = new Date(startDate)
  const end   = new Date(endDate)
  const cur   = new Date(start)

  while (cur <= end) {
    const date = cur.toISOString().slice(0, 10)
    const entry = salesMap.get(date)
    const revenue     = entry?.revenue ?? 0
    const order_count = entry?.count   ?? 0
    points.push({
      date,
      revenue_try: revenue,
      order_count,
      avg_order_value: order_count > 0 ? revenue / order_count : 0,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return points
}

/**
 * Compute the ISO week start (Monday) for a given YYYY-MM-DD date string.
 */
export function getIsoWeekStart(dateStr: string): string {
  const d = new Date(dateStr)
  // getDay(): 0=Sunday,1=Monday,...,6=Saturday
  const day = d.getDay()
  // diff to Monday: if day=0 (Sunday), go back 6; else day-1
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Aggregate daily data points into weekly buckets (ISO weeks, Monday start).
 */
export function aggregateToWeekly(daily: DailyDataPoint[]): WeeklyDataPoint[] {
  const weekMap = new Map<string, {
    week_start: string
    week_end: string
    revenue: number
    orders: number
    active_days: number
  }>()

  for (const point of daily) {
    const weekStart = getIsoWeekStart(point.date)
    // Week end = weekStart + 6 days
    const endD = new Date(weekStart)
    endD.setDate(endD.getDate() + 6)
    const weekEnd = endD.toISOString().slice(0, 10)

    const existing = weekMap.get(weekStart)
    if (existing) {
      existing.revenue    += point.revenue_try
      existing.orders     += point.order_count
      existing.active_days += point.order_count > 0 ? 1 : 0
    } else {
      weekMap.set(weekStart, {
        week_start: weekStart,
        week_end: weekEnd,
        revenue: point.revenue_try,
        orders: point.order_count,
        active_days: point.order_count > 0 ? 1 : 0,
      })
    }
  }

  return Array.from(weekMap.values())
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .map(w => ({
      week_start: w.week_start,
      week_end: w.week_end,
      revenue_try: w.revenue,
      order_count: w.orders,
      avg_order_value: w.orders > 0 ? w.revenue / w.orders : 0,
      active_days: w.active_days,
    }))
}

/**
 * Compute velocity metrics from daily data points.
 */
export function computeVelocityMetrics(daily: DailyDataPoint[]): VelocityMetrics {
  if (daily.length === 0) {
    return {
      daily_avg_revenue: 0,
      weekly_avg_revenue: 0,
      monthly_avg_revenue: 0,
      daily_avg_orders: 0,
      peak_day_revenue: 0,
      peak_day_date: null,
      low_day_revenue: 0,
      coefficient_of_variation: 0,
    }
  }

  const totalRevenue = daily.reduce((s, d) => s + d.revenue_try, 0)
  const totalOrders  = daily.reduce((s, d) => s + d.order_count, 0)
  const n = daily.length

  const dailyAvgRevenue  = totalRevenue / n
  const weeklyAvgRevenue = dailyAvgRevenue * 7
  const monthlyAvgRevenue = dailyAvgRevenue * 30
  const dailyAvgOrders = totalOrders / n

  // Peak day
  let peakRevenue = 0
  let peakDate: string | null = null
  for (const d of daily) {
    if (d.revenue_try > peakRevenue) {
      peakRevenue = d.revenue_try
      peakDate = d.date
    }
  }

  // Low non-zero day
  const nonZero = daily.filter(d => d.revenue_try > 0)
  let lowRevenue = 0
  if (nonZero.length > 0) {
    lowRevenue = nonZero.reduce((min, d) => Math.min(min, d.revenue_try), Infinity)
    if (lowRevenue === Infinity) lowRevenue = 0
  }

  // Coefficient of variation (stddev / mean)
  let cv = 0
  if (dailyAvgRevenue > 0) {
    const variance = daily.reduce((s, d) => {
      const diff = d.revenue_try - dailyAvgRevenue
      return s + diff * diff
    }, 0) / n
    const stddev = Math.sqrt(variance)
    cv = stddev / dailyAvgRevenue
  }

  return {
    daily_avg_revenue: dailyAvgRevenue,
    weekly_avg_revenue: weeklyAvgRevenue,
    monthly_avg_revenue: monthlyAvgRevenue,
    daily_avg_orders: dailyAvgOrders,
    peak_day_revenue: peakRevenue,
    peak_day_date: peakDate,
    low_day_revenue: lowRevenue,
    coefficient_of_variation: cv,
  }
}

/**
 * Compute simple moving average for revenue values.
 * First (window-1) values use average of available data (expanding window).
 * Returns same-length array.
 */
export function computeMovingAverage(values: number[], window: number): number[] {
  if (values.length === 0) return []
  const w = Math.max(1, window)
  return values.map((_, i) => {
    const start = Math.max(0, i - w + 1)
    const slice = values.slice(start, i + 1)
    return slice.reduce((s, v) => s + v, 0) / slice.length
  })
}

/**
 * Compute linear regression slope on last N points.
 * Returns slope per period (change in revenue per day).
 */
export function computeTrendSlope(values: number[], lastN = 7): number {
  if (values.length === 0) return 0
  const subset = values.slice(-Math.max(1, lastN))
  const n = subset.length
  if (n === 1) return 0

  // Ordinary least squares: y = a + b*x, return b
  const xMean = (n - 1) / 2
  const yMean = subset.reduce((s, v) => s + v, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const dx = i - xMean
    num += dx * (subset[i] - yMean)
    den += dx * dx
  }

  return den === 0 ? 0 : num / den
}

/**
 * Classify trend direction based on slope and mean revenue.
 * accelerating: slope >  5% of mean
 * growing:      slope >  0
 * stable:       |slope| <= 5% of mean
 * slowing:      slope <  0
 * declining:    slope < -5% of mean
 */
export function classifyVelocityTrend(
  slope: number,
  mean: number,
): 'accelerating' | 'growing' | 'stable' | 'slowing' | 'declining' {
  if (mean === 0) return 'stable'
  const threshold = mean * 0.05
  if (slope > threshold)   return 'accelerating'
  if (slope < -threshold)  return 'declining'
  if (slope > 0)           return 'growing'
  if (slope < 0)           return 'slowing'
  return 'stable'
}

/**
 * Compute average revenue per day of week from daily data points.
 * Returns Record<number, number> where 0=Monday, 6=Sunday.
 */
export function computeDayOfWeekPerformance(daily: DailyDataPoint[]): Record<number, number> {
  // Initialize accumulators: 0=Monday,...,6=Sunday
  const sums: Record<number, number>  = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }

  for (const point of daily) {
    const d = new Date(point.date)
    const jsDay = d.getDay() // 0=Sunday
    const isoDay = jsDay === 0 ? 6 : jsDay - 1 // 0=Monday,...,6=Sunday
    sums[isoDay]  += point.revenue_try
    counts[isoDay] += 1
  }

  const result: Record<number, number> = {}
  for (let i = 0; i < 7; i++) {
    result[i] = counts[i] > 0 ? sums[i] / counts[i] : 0
  }
  return result
}

/**
 * Find the best performing day of week (highest avg revenue).
 * Returns 0-6 (0=Monday).
 */
export function findBestDayOfWeek(dowPerformance: Record<number, number>): number {
  let best = 0
  let bestVal = -Infinity
  for (let i = 0; i < 7; i++) {
    const v = dowPerformance[i] ?? 0
    if (v > bestVal) {
      bestVal = v
      best = i
    }
  }
  return best
}

/**
 * Compute week-over-week growth rate: (lastWeek - prevWeek) / prevWeek × 100.
 * Returns null if fewer than 2 weeks of data.
 */
export function computeWowGrowth(weekly: WeeklyDataPoint[]): number | null {
  if (weekly.length < 2) return null
  const sorted = [...weekly].sort((a, b) => a.week_start.localeCompare(b.week_start))
  const last = sorted[sorted.length - 1]
  const prev = sorted[sorted.length - 2]
  if (prev.revenue_try === 0) return null
  return ((last.revenue_try - prev.revenue_try) / prev.revenue_try) * 100
}

/**
 * Compute average daily revenue for business days only (Mon-Fri, ISO 0-4).
 */
export function computeBusinessDayAvg(daily: DailyDataPoint[]): number {
  const bizDays = daily.filter(point => {
    const d = new Date(point.date)
    const jsDay = d.getDay() // 0=Sun, 6=Sat
    return jsDay >= 1 && jsDay <= 5 // Mon-Fri
  })
  if (bizDays.length === 0) return 0
  return bizDays.reduce((s, d) => s + d.revenue_try, 0) / bizDays.length
}

/**
 * Compute sales consistency score: % of days with any sales out of totalDays.
 * Returns 0-100.
 */
export function computeSalesConsistencyScore(
  daily: DailyDataPoint[],
  totalDays: number,
): number {
  if (totalDays === 0) return 0
  const activeDays = daily.filter(d => d.order_count > 0).length
  return (activeDays / totalDays) * 100
}

/**
 * Detect sales anomaly days: days where revenue > mean + 2×stddev OR < mean - 2×stddev.
 * Only considers days with non-zero revenue for the statistics base.
 */
export function detectAnomalyDays(
  daily: DailyDataPoint[],
): Array<{ date: string; revenue: number; z_score: number; is_positive: boolean }> {
  if (daily.length < 3) return []

  const revenues = daily.map(d => d.revenue_try)
  const n = revenues.length
  const mean = revenues.reduce((s, v) => s + v, 0) / n

  const variance = revenues.reduce((s, v) => {
    const diff = v - mean
    return s + diff * diff
  }, 0) / n
  const stddev = Math.sqrt(variance)

  if (stddev === 0) return []

  const anomalies: Array<{ date: string; revenue: number; z_score: number; is_positive: boolean }> = []
  for (const point of daily) {
    const z = (point.revenue_try - mean) / stddev
    if (Math.abs(z) > 2) {
      anomalies.push({
        date: point.date,
        revenue: point.revenue_try,
        z_score: Math.round(z * 100) / 100,
        is_positive: z > 0,
      })
    }
  }
  return anomalies
}

/**
 * Compute velocity acceleration: (last7DayAvg / prior7DayAvg - 1) × 100.
 * Returns null if fewer than 14 days of data.
 */
export function computeVelocityAcceleration(daily: DailyDataPoint[]): number | null {
  if (daily.length < 14) return null
  const last7  = daily.slice(-7)
  const prior7 = daily.slice(-14, -7)
  const last7Avg  = last7.reduce((s, d) => s + d.revenue_try, 0) / 7
  const prior7Avg = prior7.reduce((s, d) => s + d.revenue_try, 0) / 7
  if (prior7Avg === 0) return null
  return (last7Avg / prior7Avg - 1) * 100
}

// ── Turkish day names ─────────────────────────────────────────────────────────

const TR_DAY_NAMES: Record<number, string> = {
  0: 'Pazartesi',
  1: 'Salı',
  2: 'Çarşamba',
  3: 'Perşembe',
  4: 'Cuma',
  5: 'Cumartesi',
  6: 'Pazar',
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  sale_date: string | null
  total: number | null
}

// ── Service class ─────────────────────────────────────────────────────────────

export class SalesVelocityTrendsService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<SalesVelocityReport> {
    const WINDOW_DAYS = 90
    const endDate   = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - (WINDOW_DAYS - 1))

    const startStr = startDate.toISOString().slice(0, 10)
    const endStr   = endDate.toISOString().slice(0, 10)

    const { data: rows, error } = await this.supabase
      .from('sales')
      .select('sale_date, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', startStr)
      .lte('sale_date', endStr)
      .order('sale_date', { ascending: true })

    if (error) throw error

    const sales: RawSale[] = rows ?? []
    const validSales = sales
      .filter((s): s is { sale_date: string; total: number } =>
        s.sale_date !== null && s.total !== null,
      )
      .map(s => ({ sale_date: s.sale_date, total: s.total }))

    const salesMap  = aggregateDailySales(validSales)
    const daily     = buildDailyDataPoints(salesMap, startStr, endStr)
    const weekly    = aggregateToWeekly(daily).slice(-13)
    const velocity  = computeVelocityMetrics(daily)

    const revenues    = daily.map(d => d.revenue_try)
    const ma7d        = computeMovingAverage(revenues, 7)
    const slope       = computeTrendSlope(revenues, 7)
    const trend       = classifyVelocityTrend(slope, velocity.daily_avg_revenue)
    const wowGrowth   = computeWowGrowth(weekly)
    const accel       = computeVelocityAcceleration(daily)
    const consistency = computeSalesConsistencyScore(daily, WINDOW_DAYS)
    const dowPerf     = computeDayOfWeekPerformance(daily)
    const bestDow     = findBestDayOfWeek(dowPerf)
    const anomalies   = detectAnomalyDays(daily)

    return {
      analysis_window_days: WINDOW_DAYS,
      velocity,
      trend,
      trend_slope: slope,
      wow_growth_pct: wowGrowth,
      velocity_acceleration_pct: accel,
      consistency_score: consistency,
      best_day_of_week: bestDow,
      best_day_name: TR_DAY_NAMES[bestDow] ?? '',
      daily_data: daily,
      weekly_data: weekly,
      moving_avg_7d: ma7d,
      anomaly_days: anomalies,
      dow_performance: dowPerf,
    }
  }
}
