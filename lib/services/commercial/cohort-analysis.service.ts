// ── CohortAnalysisService — Customer Revenue Cohort Analysis ──────────────────
// A cohort = all customers whose first purchase was in the same calendar month.
// Tracks how each cohort's revenue and retention evolve over subsequent months.
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CohortRow {
  cohort_month: string                      // 'YYYY-MM' — the month of first purchase
  cohort_label: string                      // 'Ocak 2026'
  cohort_size: number                       // unique customers in this cohort
  monthly_revenue: Record<string, number>   // key='YYYY-MM', value=revenue
  monthly_customers: Record<string, number> // key='YYYY-MM', value=active customer count
  retention_pct: Record<string, number>     // key='YYYY-MM', value=customers_active/cohort_size×100
}

export interface CohortSummary {
  avg_customer_lifetime_months: number | null
  avg_revenue_per_customer_first_month_try: number | null
  avg_revenue_per_customer_second_month_try: number | null
  best_cohort_month: string | null   // cohort with highest total revenue
  best_cohort_label: string | null
  avg_second_month_retention_pct: number | null
}

export interface CohortAnalysisReport {
  cohorts: CohortRow[]        // last 6 cohorts, newest first
  months_tracked: string[]    // sorted months that have any data
  summary: CohortSummary
  as_of_date: string
}

// ── Internal raw sale row ─────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total_try:     number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format 'YYYY-MM' → Turkish month label e.g. 'Ocak 2026' */
function monthLabel(ym: string): string {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year:  'numeric',
  })
}

/**
 * Derive a stable customer identity key from a raw sale row.
 * Priority: customer_id if present, otherwise customer_name, else 'Bilinmiyor'.
 */
function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

/**
 * groupByFirstMonth
 * Given flat sale records, returns a map of customer_key → cohort_month ('YYYY-MM').
 * The cohort_month is the earliest sale_month for that customer.
 */
export function groupByFirstMonth(
  sales: Array<{ customer_key: string; sale_month: string; total_try: number }>,
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const s of sales) {
    const existing = result[s.customer_key]
    if (!existing || s.sale_month < existing) {
      result[s.customer_key] = s.sale_month
    }
  }
  return result
}

/**
 * computeRetention
 * Returns customers_active / cohort_size × 100, clamped to 0 when cohort_size=0.
 */
export function computeRetention(activeCustomers: number, cohortSize: number): number {
  if (cohortSize === 0) return 0
  return (activeCustomers / cohortSize) * 100
}

/**
 * buildCohortRow
 * Builds a CohortRow for the given cohortMonth from the full flat sales list.
 * allSales items must have: customer_key, sale_month, total_try.
 */
export function buildCohortRow(
  cohortMonth: string,
  customerKeys: string[],
  allSales: Array<{ customer_key: string; sale_month: string; total_try: number }>,
): CohortRow {
  const cohortSet = new Set(customerKeys)
  const cohortSize = cohortSet.size

  const monthly_revenue:   Record<string, number> = {}
  const monthly_customers: Record<string, number> = {}
  const retention_pct:     Record<string, number> = {}

  // Collect only sales for this cohort's customers, in months >= cohort_month
  const relevantSales = allSales.filter(
    s => cohortSet.has(s.customer_key) && s.sale_month >= cohortMonth,
  )

  // Aggregate per month
  const monthCustomerSets = new Map<string, Set<string>>()
  const monthRevenue      = new Map<string, number>()

  for (const s of relevantSales) {
    const m = s.sale_month
    if (!monthCustomerSets.has(m)) monthCustomerSets.set(m, new Set())
    monthCustomerSets.get(m)!.add(s.customer_key)
    monthRevenue.set(m, (monthRevenue.get(m) ?? 0) + (s.total_try ?? 0))
  }

  for (const [m, customers] of monthCustomerSets.entries()) {
    monthly_revenue[m]   = monthRevenue.get(m) ?? 0
    monthly_customers[m] = customers.size
    retention_pct[m]     = computeRetention(customers.size, cohortSize)
  }

  return {
    cohort_month:      cohortMonth,
    cohort_label:      monthLabel(cohortMonth),
    cohort_size:       cohortSize,
    monthly_revenue,
    monthly_customers,
    retention_pct,
  }
}

// ── Additional Pure Helpers ───────────────────────────────────────────────────

const TURKISH_MONTH_ABBR: Record<number, string> = {
  1: 'Oca', 2: 'Şub', 3: 'Mar', 4: 'Nis', 5: 'May', 6: 'Haz',
  7: 'Tem', 8: 'Ağu', 9: 'Eyl', 10: 'Eki', 11: 'Kas', 12: 'Ara',
}

/**
 * Build a Turkish cohort label from a 'YYYY-MM' first-purchase month.
 * e.g. '2025-01' → 'Oca 2025 Kohortu'
 */
export function buildCohortLabel(firstPurchaseMonth: string): string {
  const [year, month] = firstPurchaseMonth.split('-').map(Number)
  const abbr = TURKISH_MONTH_ABBR[month] ?? firstPurchaseMonth
  return `${abbr} ${year} Kohortu`
}

/**
 * Extract the last observed retention rate per cohort from a retention matrix.
 * Each inner array is a cohort's retention values over time.
 * Returns the last non-undefined element of each row (or 0 if empty).
 */
export function extractRetentionDiagonal(cohorts: Array<Array<number>>): number[] {
  return cohorts.map(row => {
    if (row.length === 0) return 0
    return row[row.length - 1]
  })
}

/**
 * Classify cohort health based on average 3-month retention and trend slope.
 * strong:   avg > 60 AND slope > 0
 * stable:   avg > 40
 * declining: avg > 20 AND slope < 0
 * critical:  avg <= 20
 */
export function classifyCohortHealth(
  avg3mRetention: number,
  trendSlope: number,
): 'strong' | 'stable' | 'declining' | 'critical' {
  if (avg3mRetention > 60 && trendSlope > 0) return 'strong'
  if (avg3mRetention > 40) return 'stable'
  if (avg3mRetention > 20 && trendSlope < 0) return 'declining'
  return 'critical'
}

// ── Service ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class CohortAnalysisService {
  static async getReport(
    companyId: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<CohortAnalysisReport> {
    const today      = opts?.today ?? new Date().toISOString().slice(0, 10)
    const asOfDate   = today

    // Look back 9 months to seed cohort data
    const cutoffDate = (() => {
      const d = new Date(today)
      d.setMonth(d.getMonth() - 9)
      d.setDate(1)
      return d.toISOString().slice(0, 10)
    })()

    const { data, error } = await supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_proforma.is.null,is_proforma.eq.false')
      .gte('sale_date', cutoffDate)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CohortAnalysisService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    // Flatten to normalised flat sale records
    const flatSales: Array<{ customer_key: string; sale_month: string; total_try: number }> =
      rows
        .filter(r => r.sale_date)
        .map(r => ({
          customer_key: customerKey(r),
          sale_month:   (r.sale_date as string).slice(0, 7), // 'YYYY-MM'
          total_try:    Number(r.total_try ?? 0),
        }))

    // Map customer_key → cohort_month (first purchase month)
    const cohortMap = groupByFirstMonth(flatSales)

    // Group customers by their cohort_month
    const cohortCustomers = new Map<string, string[]>()
    for (const [ck, cm] of Object.entries(cohortMap)) {
      if (!cohortCustomers.has(cm)) cohortCustomers.set(cm, [])
      cohortCustomers.get(cm)!.push(ck)
    }

    // Sort cohort months descending, take last 6
    const allCohortMonths = Array.from(cohortCustomers.keys()).sort((a, b) => b.localeCompare(a))
    const selectedCohortMonths = allCohortMonths.slice(0, 6)

    // Build cohort rows
    const cohorts: CohortRow[] = selectedCohortMonths.map(cm =>
      buildCohortRow(cm, cohortCustomers.get(cm)!, flatSales),
    )

    // Collect all months that have any data across selected cohorts
    const allMonthsSet = new Set<string>()
    for (const cohort of cohorts) {
      for (const m of Object.keys(cohort.monthly_revenue)) {
        allMonthsSet.add(m)
      }
    }
    const months_tracked = Array.from(allMonthsSet).sort()

    // ── Summary ──────────────────────────────────────────────────────────────

    // Avg customer lifetime months: for each customer, count distinct months with sales
    const customerMonths = new Map<string, Set<string>>()
    for (const s of flatSales) {
      if (!customerMonths.has(s.customer_key)) customerMonths.set(s.customer_key, new Set())
      customerMonths.get(s.customer_key)!.add(s.sale_month)
    }
    const lifetimeCounts = Array.from(customerMonths.values()).map(ms => ms.size)
    const avg_customer_lifetime_months =
      lifetimeCounts.length > 0
        ? lifetimeCounts.reduce((a, b) => a + b, 0) / lifetimeCounts.length
        : null

    // Avg revenue per customer in M0 (cohort month) and M1 (second month)
    let m0Revenues: number[] = []
    let m1Revenues: number[] = []
    for (const cohort of cohorts) {
      const m0 = cohort.monthly_revenue[cohort.cohort_month]
      if (m0 !== undefined && cohort.cohort_size > 0) {
        m0Revenues.push(m0 / cohort.cohort_size)
      }
      // M1 = first month after cohort_month
      const [year, month] = cohort.cohort_month.split('-').map(Number)
      const nextDate = new Date(year, month, 1) // month is 0-indexed, so month = next month
      const m1Key = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
      const m1 = cohort.monthly_revenue[m1Key]
      if (m1 !== undefined && cohort.cohort_size > 0) {
        m1Revenues.push(m1 / cohort.cohort_size)
      }
    }

    const avg_revenue_per_customer_first_month_try =
      m0Revenues.length > 0 ? m0Revenues.reduce((a, b) => a + b, 0) / m0Revenues.length : null
    const avg_revenue_per_customer_second_month_try =
      m1Revenues.length > 0 ? m1Revenues.reduce((a, b) => a + b, 0) / m1Revenues.length : null

    // Best cohort = highest total revenue
    let best_cohort_month: string | null = null
    let best_cohort_label: string | null = null
    let bestTotal = -Infinity
    for (const cohort of cohorts) {
      const total = Object.values(cohort.monthly_revenue).reduce((a, b) => a + b, 0)
      if (total > bestTotal) {
        bestTotal            = total
        best_cohort_month    = cohort.cohort_month
        best_cohort_label    = cohort.cohort_label
      }
    }
    if (bestTotal <= 0) {
      best_cohort_month = null
      best_cohort_label = null
    }

    // Avg second-month retention
    let m1Retentions: number[] = []
    for (const cohort of cohorts) {
      const [year, month] = cohort.cohort_month.split('-').map(Number)
      const nextDate = new Date(year, month, 1)
      const m1Key = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`
      const ret = cohort.retention_pct[m1Key]
      if (ret !== undefined) {
        m1Retentions.push(ret)
      }
    }
    const avg_second_month_retention_pct =
      m1Retentions.length > 0
        ? m1Retentions.reduce((a, b) => a + b, 0) / m1Retentions.length
        : null

    return {
      cohorts,
      months_tracked,
      summary: {
        avg_customer_lifetime_months,
        avg_revenue_per_customer_first_month_try,
        avg_revenue_per_customer_second_month_try,
        best_cohort_month,
        best_cohort_label,
        avg_second_month_retention_pct,
      },
      as_of_date: asOfDate,
    }
  }
}
