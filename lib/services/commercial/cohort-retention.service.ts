// ── CohortRetentionService — Customer Cohort Retention & Churn Analysis ──────
// Groups customers by their first purchase month and tracks repeat purchase
// rates over time (up to 12 periods per cohort).
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CohortPeriodData {
  period_offset: number       // 0 = acquisition month, 1 = 1 month later, etc.
  active_customers: number
  retention_rate_pct: number
  revenue_try: number
}

export interface CustomerCohort {
  cohort_month: string         // "2024-07" — first purchase month
  cohort_label: string         // "Temmuz 2024"
  cohort_size: number          // unique customers in acquisition month
  periods: CohortPeriodData[]  // up to 12 periods
  avg_3m_retention_pct: number
  retention_health: 'strong' | 'good' | 'fair' | 'weak'
  total_revenue_try: number    // lifetime revenue from this cohort
  avg_revenue_per_customer: number
}

export interface CohortRetentionReport {
  generated_at: string
  cohorts: CustomerCohort[]    // last N cohorts (months), most recent first
  overall_avg_3m_retention_pct: number
  best_cohort_month: string | null
  worst_cohort_month: string | null
  overall_retention_health: 'strong' | 'good' | 'fair' | 'weak'
  churn_rate_pct: number       // 100 - overall_avg_3m_retention_pct
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total_try:     number | null
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute retention rate: active_in_period / cohort_size × 100.
 * Returns 0 if cohortSize is 0.
 */
export function computeRetentionRate(
  activeInPeriod: number,
  cohortSize: number,
): number {
  if (cohortSize === 0) return 0
  return (activeInPeriod / cohortSize) * 100
}

/**
 * Compute churn rate: 100 - retention_rate.
 */
export function computeChurnRate(retentionRate: number): number {
  return 100 - retentionRate
}

/**
 * Compute average cohort size across multiple cohorts.
 * Returns 0 if the array is empty.
 */
export function computeAvgCohortSize(cohorts: Array<{ size: number }>): number {
  if (cohorts.length === 0) return 0
  return cohorts.reduce((s, c) => s + c.size, 0) / cohorts.length
}

/**
 * Compute 3-month retention average for a cohort.
 * Uses periods at index 1, 2, 3 (period_offset 1, 2, 3).
 * If fewer than 3 periods exist beyond offset-0, averages the available ones.
 * Returns 0 if there are no periods beyond the acquisition month.
 */
export function computeAvg3mRetention(retentionByPeriod: number[]): number {
  // retentionByPeriod[0] = period offset 0 (always 100%)
  // We want avg of offsets 1, 2, 3
  const relevant = retentionByPeriod.slice(1, 4)
  if (relevant.length === 0) return 0
  return relevant.reduce((s, r) => s + r, 0) / relevant.length
}

/**
 * Classify retention health based on 3-month average.
 * ≥60%: 'strong' | 40-59%: 'good' | 20-39%: 'fair' | <20%: 'weak'
 */
export function classifyRetentionHealth(
  avg3mRetentionPct: number,
): 'strong' | 'good' | 'fair' | 'weak' {
  if (avg3mRetentionPct >= 60) return 'strong'
  if (avg3mRetentionPct >= 40) return 'good'
  if (avg3mRetentionPct >= 20) return 'fair'
  return 'weak'
}

/**
 * Compute an estimated customer lifetime value.
 *
 * Formula: avgOrderValue * ordersPerYear * (retentionRate/100) / (1 - retentionRate/100) * marginPct/100
 * Cap: if retentionRate >= 100, use multiplier 10 instead of the infinite geometric series.
 * Floor: if retentionRate <= 0, return 0.
 */
export function computeEstimatedLTV(
  avgOrderValue: number,
  ordersPerYear: number,
  retentionRate: number,  // 0-100
  marginPct: number,      // 0-100
): number {
  if (retentionRate <= 0) return 0
  const margin = marginPct / 100
  if (retentionRate >= 100) {
    return avgOrderValue * ordersPerYear * 10 * margin
  }
  const r = retentionRate / 100
  return avgOrderValue * ordersPerYear * (r / (1 - r)) * margin
}

/**
 * Compute a customer risk score in the range [0, 100].
 * Higher values indicate more risk.
 *
 * Weights:
 *   - Recency  (30%): daysSinceLastPurchase / 365, capped at 1
 *   - Overdue  (40%): min(1, overdueAmountTry / 100_000)
 *   - Behavior (30%): min(1, avgPaymentDelayDays / 90)
 */
export function computeCustomerRiskScore(
  daysSinceLastPurchase: number,
  overdueAmountTry: number,
  avgPaymentDelayDays: number,
): number {
  const recency  = Math.min(1, Math.max(0, daysSinceLastPurchase / 365))
  const overdue  = Math.min(1, Math.max(0, overdueAmountTry / 100_000))
  const behavior = Math.min(1, Math.max(0, avgPaymentDelayDays / 90))
  return recency * 30 + overdue * 40 + behavior * 30
}

/**
 * Classify a customer into one of five segments based on revenue, order count,
 * and retention rate.
 *
 * Rules (evaluated in order):
 *   champion  : revenueYtd > 500_000 AND retentionRate > 80
 *   loyal     : revenueYtd > 100_000 AND retentionRate > 60
 *   lost      : retentionRate < 20    (implies low engagement)
 *   new       : orderCount <= 2
 *   at_risk   : everything else
 */
export function classifyCustomerSegment(
  revenueYtd: number,
  orderCount: number,
  retentionRate: number,
): 'champion' | 'loyal' | 'at_risk' | 'lost' | 'new' {
  if (revenueYtd > 500_000 && retentionRate > 80) return 'champion'
  if (revenueYtd > 100_000 && retentionRate > 60) return 'loyal'
  if (retentionRate < 20) return 'lost'
  if (orderCount <= 2) return 'new'
  return 'at_risk'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Format 'YYYY-MM' → Turkish month label e.g. 'Temmuz 2024' */
function cohortMonthLabel(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Derive a stable customer identity key from a raw sale row.
 * Priority: customer_id → customer_name → skip (returns null for anonymous rows).
 */
function customerKey(row: RawSale): string | null {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return null
}

/** Offset a YYYY-MM by N months → YYYY-MM */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Today's YYYY-MM */
function currentYearMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CohortRetentionService {
  constructor(private readonly supabase: SupabaseClient) {}

  async getReport(
    companyId: string,
    lookbackMonths = 6,
  ): Promise<CohortRetentionReport> {
    const generatedAt = new Date().toISOString()

    // ── Fetch all sales (all-time) ─────────────────────────────────────────
    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CohortRetentionService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    // ── Map customer → all sale months + revenue ──────────────────────────
    // sale_month_map[customerKey][sale_month] = sum revenue
    const saleMonthMap = new Map<string, Map<string, number>>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      if (!key) continue

      const saleMonth = row.sale_date.slice(0, 7) // "YYYY-MM"
      const revenue = Number(row.total_try ?? 0)

      if (!saleMonthMap.has(key)) {
        saleMonthMap.set(key, new Map())
      }
      const monthMap = saleMonthMap.get(key)!
      monthMap.set(saleMonth, (monthMap.get(saleMonth) ?? 0) + revenue)
    }

    // ── Determine first purchase month per customer ───────────────────────
    // firstMonthMap[customerKey] = 'YYYY-MM'
    const firstMonthMap = new Map<string, string>()
    for (const [key, monthMap] of saleMonthMap) {
      const months = Array.from(monthMap.keys()).sort()
      if (months.length > 0) {
        firstMonthMap.set(key, months[0])
      }
    }

    // ── Determine cohort months: last N months ────────────────────────────
    const todayYM = currentYearMonth()
    const cohortMonths: string[] = []
    for (let i = 0; i < lookbackMonths; i++) {
      cohortMonths.push(addMonths(todayYM, -i))
    }
    // cohortMonths[0] = current month, cohortMonths[N-1] = oldest
    // We'll build cohorts in reverse order (oldest first for processing),
    // then reverse for "most recent first" output.

    // ── Build cohort map: cohort_month → Set<customerKey> ─────────────────
    const cohortCustomers = new Map<string, Set<string>>()
    for (const cm of cohortMonths) {
      cohortCustomers.set(cm, new Set())
    }

    for (const [key, firstMonth] of firstMonthMap) {
      if (cohortCustomers.has(firstMonth)) {
        cohortCustomers.get(firstMonth)!.add(key)
      }
    }

    // ── Build CustomerCohort objects ──────────────────────────────────────
    const MAX_PERIODS = 12

    const buildCohort = async (cohortMonth: string): Promise<CustomerCohort | null> => {
      const customerKeys = cohortCustomers.get(cohortMonth)
      if (!customerKeys || customerKeys.size === 0) return null

      const cohortSize = customerKeys.size
      const periods: CohortPeriodData[] = []
      let totalRevenue = 0

      for (let offset = 0; offset < MAX_PERIODS; offset++) {
        const periodMonth = addMonths(cohortMonth, offset)
        if (periodMonth > todayYM) break // don't project future

        let activeCustomers = 0
        let periodRevenue = 0

        for (const key of customerKeys) {
          const monthMap = saleMonthMap.get(key)
          if (!monthMap) continue
          const rev = monthMap.get(periodMonth)
          if (rev !== undefined) {
            activeCustomers++
            periodRevenue += rev
          }
        }

        const retentionRate = computeRetentionRate(activeCustomers, cohortSize)
        periods.push({
          period_offset: offset,
          active_customers: activeCustomers,
          retention_rate_pct: retentionRate,
          revenue_try: periodRevenue,
        })
        totalRevenue += periodRevenue
      }

      if (periods.length === 0) return null

      const retentionByPeriod = periods.map(p => p.retention_rate_pct)
      const avg3m = computeAvg3mRetention(retentionByPeriod)
      const health = classifyRetentionHealth(avg3m)
      const avgRevPerCustomer = cohortSize > 0 ? totalRevenue / cohortSize : 0

      return {
        cohort_month: cohortMonth,
        cohort_label: cohortMonthLabel(cohortMonth),
        cohort_size: cohortSize,
        periods,
        avg_3m_retention_pct: Math.round(avg3m * 10) / 10,
        retention_health: health,
        total_revenue_try: totalRevenue,
        avg_revenue_per_customer: Math.round(avgRevPerCustomer),
      }
    }

    // Build all cohorts in parallel
    const results = await Promise.allSettled(cohortMonths.map(cm => buildCohort(cm)))

    const cohorts: CustomerCohort[] = results
      .filter((r): r is PromiseFulfilledResult<CustomerCohort | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((c): c is CustomerCohort => c !== null)

    // Sort most recent first
    cohorts.sort((a, b) => b.cohort_month.localeCompare(a.cohort_month))

    if (cohorts.length === 0) {
      return buildEmptyReport(generatedAt)
    }

    // ── Overall stats ─────────────────────────────────────────────────────
    const overallAvg3m = cohorts.length > 0
      ? cohorts.reduce((s, c) => s + c.avg_3m_retention_pct, 0) / cohorts.length
      : 0

    // Best = highest avg_3m_retention_pct; worst = lowest (among non-trivial cohorts)
    const sortedBest = [...cohorts].sort((a, b) => b.avg_3m_retention_pct - a.avg_3m_retention_pct)
    const bestCohortMonth = sortedBest[0]?.cohort_month ?? null
    const worstCohortMonth = sortedBest[sortedBest.length - 1]?.cohort_month ?? null

    const overallHealth = classifyRetentionHealth(overallAvg3m)
    const churnRate = computeChurnRate(overallAvg3m)

    return {
      generated_at: generatedAt,
      cohorts,
      overall_avg_3m_retention_pct: Math.round(overallAvg3m * 10) / 10,
      best_cohort_month: bestCohortMonth !== worstCohortMonth ? bestCohortMonth : bestCohortMonth,
      worst_cohort_month: bestCohortMonth !== worstCohortMonth ? worstCohortMonth : null,
      overall_retention_health: overallHealth,
      churn_rate_pct: Math.round(churnRate * 10) / 10,
    }
  }
}

// ── Empty report helper ───────────────────────────────────────────────────────

function buildEmptyReport(generatedAt: string): CohortRetentionReport {
  return {
    generated_at: generatedAt,
    cohorts: [],
    overall_avg_3m_retention_pct: 0,
    best_cohort_month: null,
    worst_cohort_month: null,
    overall_retention_health: 'weak',
    churn_rate_pct: 100,
  }
}
