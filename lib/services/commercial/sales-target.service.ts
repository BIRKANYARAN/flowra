// ── SalesTargetService — Sales Target Tracking & Pacing Analysis ─────────────
// Computes attainment, pacing, run-rate projections, and YTD summaries for
// Turkish SME sales target monitoring.
//
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface TargetPeriod {
  year: number
  month: number          // 1-12
  revenue_target: number
  unit_target: number | null
  deal_target: number | null  // number of deals/sales
}

export interface TargetActual {
  year_month: string     // YYYY-MM
  target_revenue: number | null
  actual_revenue: number
  target_units: number | null
  actual_units: number
  target_deals: number | null
  actual_deals: number
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute attainment percentage: actual / target × 100.
 * Returns null if target is null or target === 0.
 */
export function computeAttainmentPct(actual: number, target: number | null): number | null {
  if (target === null || target === 0) return null
  return (actual / target) * 100
}

/**
 * Compute revenue pace for the current month.
 * Pace = (actualToDate / dayOfMonth) × daysInMonth
 * Pace attainment = pace / targetMonthly × 100
 * Returns null if targetMonthly null or 0 or dayOfMonth === 0.
 */
export function computeRevenuePace(
  actualToDate: number,
  targetMonthly: number | null,
  dayOfMonth: number,       // current day (1-31)
  daysInMonth: number,      // total days in month
): number | null {
  if (targetMonthly === null || targetMonthly === 0 || dayOfMonth === 0) return null
  const pace = (actualToDate / dayOfMonth) * daysInMonth
  return (pace / targetMonthly) * 100
}

/**
 * Compute required daily revenue to hit monthly target.
 * (targetMonthly - actualToDate) / remainingDays
 * Returns null if targetMonthly is null.
 * Returns 0 if remainingDays === 0 and already on-track (or over-target).
 * Returns 0 if already over target.
 */
export function computeRequiredDailyRevenue(
  targetMonthly: number | null,
  actualToDate: number,
  remainingDays: number,
): number | null {
  if (targetMonthly === null) return null
  const gap = targetMonthly - actualToDate
  if (gap <= 0) return 0
  if (remainingDays === 0) return 0
  return gap / remainingDays
}

/**
 * Classify attainment percentage into a performance level.
 * no_target:  null
 * exceeded:   >= 105%
 * on_track:   >= 90%
 * at_risk:    >= 70%
 * behind:     >= 50%
 * critical:   < 50%
 */
export function classifyAttainment(
  attainmentPct: number | null,
): 'exceeded' | 'on_track' | 'at_risk' | 'behind' | 'critical' | 'no_target' {
  if (attainmentPct === null) return 'no_target'
  if (attainmentPct >= 105) return 'exceeded'
  if (attainmentPct >= 90)  return 'on_track'
  if (attainmentPct >= 70)  return 'at_risk'
  if (attainmentPct >= 50)  return 'behind'
  return 'critical'
}

/**
 * Compute variance to target: actual - target.
 * Returns null if target is null.
 */
export function computeVarianceToTarget(actual: number, target: number | null): number | null {
  if (target === null) return null
  return actual - target
}

/**
 * Compute growth versus prior year: (current - prior) / prior × 100.
 * Returns null if prior is null or 0.
 */
export function computeGrowthVsPriorYear(
  currentRevenue: number,
  priorYearRevenue: number | null,
): number | null {
  if (priorYearRevenue === null || priorYearRevenue === 0) return null
  return ((currentRevenue - priorYearRevenue) / priorYearRevenue) * 100
}

/**
 * Join target periods with actuals map, sorted chronologically.
 * Keys in actuals without a target get null target fields.
 */
export function buildMonthlyTargetActuals(
  targets: TargetPeriod[],
  actuals: Map<string, { revenue: number; units: number; deals: number }>,
): TargetActual[] {
  const result = new Map<string, TargetActual>()

  // Add all target months
  for (const t of targets) {
    const ym = `${t.year}-${String(t.month).padStart(2, '0')}`
    const actual = actuals.get(ym)
    result.set(ym, {
      year_month:     ym,
      target_revenue: t.revenue_target,
      actual_revenue: actual?.revenue ?? 0,
      target_units:   t.unit_target,
      actual_units:   actual?.units ?? 0,
      target_deals:   t.deal_target,
      actual_deals:   actual?.deals ?? 0,
    })
  }

  // Add actual months with no target
  for (const [ym, actual] of actuals) {
    if (!result.has(ym)) {
      result.set(ym, {
        year_month:     ym,
        target_revenue: null,
        actual_revenue: actual.revenue,
        target_units:   null,
        actual_units:   actual.units,
        target_deals:   null,
        actual_deals:   actual.deals,
      })
    }
  }

  // Sort chronologically
  return Array.from(result.values()).sort((a, b) =>
    a.year_month.localeCompare(b.year_month),
  )
}

/**
 * Compute YTD summary up to and including currentYearMonth.
 */
export function computeYtdSummary(
  targetActuals: TargetActual[],
  currentYearMonth: string,  // YYYY-MM
): {
  ytd_actual_revenue: number
  ytd_target_revenue: number | null
  ytd_attainment_pct: number | null
  ytd_variance: number | null
  months_exceeded: number
  months_on_track: number
  months_behind: number
} {
  const filtered = targetActuals.filter(ta => ta.year_month <= currentYearMonth)

  let ytdActual  = 0
  let ytdTarget: number | null = null
  let monthsExceeded = 0
  let monthsOnTrack  = 0
  let monthsBehind   = 0

  for (const ta of filtered) {
    ytdActual += ta.actual_revenue
    if (ta.target_revenue !== null) {
      ytdTarget = (ytdTarget ?? 0) + ta.target_revenue
    }

    const pct = computeAttainmentPct(ta.actual_revenue, ta.target_revenue)
    const status = classifyAttainment(pct)
    if (status === 'exceeded')                          monthsExceeded++
    else if (status === 'on_track')                     monthsOnTrack++
    else if (status === 'at_risk' || status === 'behind' || status === 'critical') monthsBehind++
  }

  const ytdAttainment = computeAttainmentPct(ytdActual, ytdTarget)
  const ytdVariance   = computeVarianceToTarget(ytdActual, ytdTarget)

  return {
    ytd_actual_revenue: ytdActual,
    ytd_target_revenue: ytdTarget,
    ytd_attainment_pct: ytdAttainment,
    ytd_variance:       ytdVariance,
    months_exceeded:    monthsExceeded,
    months_on_track:    monthsOnTrack,
    months_behind:      monthsBehind,
  }
}

/**
 * Compute run-rate projection based on YTD actuals.
 * monthly_run_rate = ytdActualRevenue / monthsElapsed (0 if elapsed=0)
 * annualized_projection = monthly_run_rate × 12
 */
export function computeRunRateProjection(
  ytdActualRevenue: number,
  monthsElapsed: number,
  targetFullYear: number | null,
): {
  monthly_run_rate: number
  annualized_projection: number
  vs_full_year_target_pct: number | null
} {
  const monthlyRunRate = monthsElapsed === 0 ? 0 : ytdActualRevenue / monthsElapsed
  const annualizedProjection = monthlyRunRate * 12
  const vsTarget = computeAttainmentPct(annualizedProjection, targetFullYear)

  return {
    monthly_run_rate:        monthlyRunRate,
    annualized_projection:   annualizedProjection,
    vs_full_year_target_pct: vsTarget,
  }
}

/**
 * Classify YTD performance level.
 * no_target:       null attainment
 * outperforming:   >= 105%
 * on_track:        >= 90%
 * slightly_behind: >= 75%
 * behind:          >= 50%
 * critical:        < 50%
 */
export function classifyYtdPerformance(
  ytdAttainmentPct: number | null,
  monthsElapsed: number,
  trend: 'improving' | 'stable' | 'declining' | null,
): 'outperforming' | 'on_track' | 'slightly_behind' | 'behind' | 'critical' | 'no_target' {
  if (ytdAttainmentPct === null) return 'no_target'
  if (ytdAttainmentPct >= 105) return 'outperforming'
  if (ytdAttainmentPct >= 90)  return 'on_track'
  if (ytdAttainmentPct >= 75)  return 'slightly_behind'
  if (ytdAttainmentPct >= 50)  return 'behind'
  return 'critical'
}

/**
 * Find the month with the highest actual_revenue.
 * Returns null if targetActuals is empty.
 */
export function computeBestMonth(targetActuals: TargetActual[]): TargetActual | null {
  if (targetActuals.length === 0) return null
  return targetActuals.reduce((best, curr) =>
    curr.actual_revenue > best.actual_revenue ? curr : best,
  )
}

/**
 * Find the month with the lowest actual_revenue (only months with actual_revenue > 0).
 * Returns null if no months have data.
 */
export function computeWorstMonth(targetActuals: TargetActual[]): TargetActual | null {
  const withData = targetActuals.filter(ta => ta.actual_revenue > 0)
  if (withData.length === 0) return null
  return withData.reduce((worst, curr) =>
    curr.actual_revenue < worst.actual_revenue ? curr : worst,
  )
}

/**
 * Count consecutive months from most recent where attainment >= 100%.
 * Returns 0 if no months above target or no targets.
 */
export function computeConsecutiveAboveTarget(targetActuals: TargetActual[]): number {
  const sorted = [...targetActuals].sort((a, b) =>
    b.year_month.localeCompare(a.year_month),
  )

  let count = 0
  for (const ta of sorted) {
    if (ta.target_revenue === null || ta.target_revenue === 0) break
    const pct = (ta.actual_revenue / ta.target_revenue) * 100
    if (pct >= 100) {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * Generate a deterministic Turkish narrative for performance.
 */
export function generateTargetNarrative(
  performance: ReturnType<typeof classifyYtdPerformance>,
  ytdAttainmentPct: number | null,
  consecutiveAbove: number,
  monthsElapsed: number,
): string {
  switch (performance) {
    case 'outperforming':
      return 'YTD performansı hedeflerin üzerinde — başarılı bir dönem.'
    case 'on_track':
      return 'Satış hedeflerine büyük ölçüde ulaşılıyor — izleme devam etmeli.'
    case 'slightly_behind':
      return 'Hafif geride kalınıyor — kalan dönemde telafi edilebilir düzeyde.'
    case 'behind':
      return 'Hedeflerin belirgin şekilde gerisinde — aksiyona gerek var.'
    case 'critical':
      return 'Kritik: Satış hedeflerine ulaşmak için ivedi müdahale gerekiyor.'
    case 'no_target':
    default:
      return 'Satış hedefi tanımlanmamış — performans değerlendirmesi mümkün değil.'
  }
}

// ── SalesTargetReport ─────────────────────────────────────────────────────────

export interface SalesTargetReport {
  current_year: number
  current_month: number
  monthly_target_actuals: TargetActual[]
  ytd_summary: ReturnType<typeof computeYtdSummary>
  run_rate_projection: ReturnType<typeof computeRunRateProjection>
  current_month_attainment_pct: number | null
  current_month_status: ReturnType<typeof classifyAttainment>
  ytd_performance: ReturnType<typeof classifyYtdPerformance>
  consecutive_above_target: number
  best_month: TargetActual | null
  worst_month: TargetActual | null
  required_daily_revenue: number | null
  narrative: string
  has_targets: boolean
}

// ── Internal raw types ────────────────────────────────────────────────────────

interface RawTarget {
  year: number
  month: number
  revenue_target: number
  unit_target: number | null
  deal_target: number | null
}

interface RawSale {
  sale_date: string | null
  total: number | null
  quantity: number | null
}

// ── Service class ─────────────────────────────────────────────────────────────

export class SalesTargetService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<SalesTargetReport> {
    const now          = new Date()
    const currentYear  = now.getFullYear()
    const currentMonth = now.getMonth() + 1  // 1-12
    const currentYM    = `${currentYear}-${String(currentMonth).padStart(2, '0')}`

    // Days in current month / current day
    const daysInMonth  = new Date(currentYear, currentMonth, 0).getDate()
    const dayOfMonth   = now.getDate()
    const remainingDays = daysInMonth - dayOfMonth

    // ── Fetch data ─────────────────────────────────────────────────────────────

    const [targetsResult, salesResult] = await Promise.allSettled([
      this.supabase
        .from('sales_targets')
        .select('year, month, revenue_target, unit_target, deal_target')
        .eq('company_id', companyId)
        .eq('year', currentYear)
        .order('month', { ascending: true }),

      this.supabase
        .from('sales')
        .select('sale_date, total, quantity')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', `${currentYear}-01-01`)
        .lte('sale_date', `${currentYear}-12-31`),
    ])

    // ── Process targets (gracefully handle missing table) ─────────────────────

    let rawTargets: RawTarget[] = []
    if (targetsResult.status === 'fulfilled' && !targetsResult.value.error) {
      rawTargets = (targetsResult.value.data ?? []) as RawTarget[]
    }

    const targets: TargetPeriod[] = rawTargets.map(r => ({
      year:           r.year,
      month:          r.month,
      revenue_target: r.revenue_target ?? 0,
      unit_target:    r.unit_target,
      deal_target:    r.deal_target,
    }))

    const hasTargets = targets.length > 0

    // ── Process actuals ────────────────────────────────────────────────────────

    const rawSales: RawSale[] =
      salesResult.status === 'fulfilled' && !salesResult.value.error
        ? (salesResult.value.data ?? [])
        : []

    // Group by YYYY-MM: revenue, unit count, deal count
    const actualsMap = new Map<string, { revenue: number; units: number; deals: number }>()
    for (const s of rawSales) {
      if (!s.sale_date) continue
      const ym = s.sale_date.slice(0, 7)  // YYYY-MM
      const existing = actualsMap.get(ym)
      const revenue  = s.total    ?? 0
      const units    = s.quantity ?? 0
      if (existing) {
        existing.revenue += revenue
        existing.units   += units
        existing.deals   += 1
      } else {
        actualsMap.set(ym, { revenue, units, deals: 1 })
      }
    }

    // ── Build monthly target/actuals ──────────────────────────────────────────

    const monthlyTargetActuals = buildMonthlyTargetActuals(targets, actualsMap)

    // ── Current month ─────────────────────────────────────────────────────────

    const currentMonthRow = monthlyTargetActuals.find(ta => ta.year_month === currentYM)
    const currentMonthAttainment = computeAttainmentPct(
      currentMonthRow?.actual_revenue ?? 0,
      currentMonthRow?.target_revenue ?? null,
    )
    const currentMonthStatus = classifyAttainment(currentMonthAttainment)

    // ── YTD summary (up to and including current month) ────────────────────────

    const ytdSummary = computeYtdSummary(monthlyTargetActuals, currentYM)

    // ── Months elapsed (count distinct months up to current) ──────────────────

    const monthsElapsed = monthlyTargetActuals.filter(
      ta => ta.year_month <= currentYM && ta.actual_revenue > 0,
    ).length

    // ── Full-year target (sum of all monthly targets) ─────────────────────────

    const fullYearTarget = hasTargets
      ? targets.reduce((s, t) => s + t.revenue_target, 0)
      : null

    // ── Run-rate projection ───────────────────────────────────────────────────

    const runRateProjection = computeRunRateProjection(
      ytdSummary.ytd_actual_revenue,
      monthsElapsed,
      fullYearTarget,
    )

    // ── YTD performance classification ────────────────────────────────────────

    const ytdPerformance = classifyYtdPerformance(
      ytdSummary.ytd_attainment_pct,
      monthsElapsed,
      null,
    )

    // ── Consecutive above target ──────────────────────────────────────────────

    const consecutiveAbove = computeConsecutiveAboveTarget(
      monthlyTargetActuals.filter(ta => ta.year_month <= currentYM),
    )

    // ── Best / worst months ───────────────────────────────────────────────────

    const relevantMonths = monthlyTargetActuals.filter(ta => ta.year_month <= currentYM)
    const bestMonth  = computeBestMonth(relevantMonths)
    const worstMonth = computeWorstMonth(relevantMonths)

    // ── Required daily revenue ────────────────────────────────────────────────

    const requiredDailyRevenue = computeRequiredDailyRevenue(
      currentMonthRow?.target_revenue ?? null,
      currentMonthRow?.actual_revenue ?? 0,
      remainingDays,
    )

    // ── Narrative ─────────────────────────────────────────────────────────────

    const narrative = generateTargetNarrative(
      ytdPerformance,
      ytdSummary.ytd_attainment_pct,
      consecutiveAbove,
      monthsElapsed,
    )

    return {
      current_year:                currentYear,
      current_month:               currentMonth,
      monthly_target_actuals:      monthlyTargetActuals,
      ytd_summary:                 ytdSummary,
      run_rate_projection:         runRateProjection,
      current_month_attainment_pct: currentMonthAttainment,
      current_month_status:        currentMonthStatus,
      ytd_performance:             ytdPerformance,
      consecutive_above_target:    consecutiveAbove,
      best_month:                  bestMonth,
      worst_month:                 worstMonth,
      required_daily_revenue:      requiredDailyRevenue,
      narrative,
      has_targets:                 hasTargets,
    }
  }
}
