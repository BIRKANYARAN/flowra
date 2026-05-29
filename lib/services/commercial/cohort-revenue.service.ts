// ── CohortRevenueService — Monthly Customer Cohort Revenue Analysis ────────────
// Groups customers by their first purchase month and tracks revenue retention
// over subsequent months (revenue-basis rather than count-basis).
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CohortCell {
  cohort_month: string
  period_offset: number    // 0, 1, 2, ... months since first purchase
  calendar_month: string   // YYYY-MM — actual month of activity
  customer_count: number
  revenue_try: number
  retention_pct: number    // revenue_try / month_0_revenue × 100, base 100 for month 0
}

export interface CohortRow {
  cohort_month: string
  cohort_size: number       // customers who bought in month 0
  month_0_revenue: number
  cells: CohortCell[]       // sorted by period_offset
  avg_ltv_3m: number        // sum of revenue across first 3 months / cohort_size
  avg_ltv_6m: number        // sum of revenue across first 6 months / cohort_size
  retention_3m_pct: number | null  // retention at month 3 (revenue/month_0*100), null if not available
  retention_6m_pct: number | null
}

export interface CohortSummary {
  avg_month_1_retention_pct: number | null
  avg_month_3_retention_pct: number | null
  best_cohort: string | null    // cohort_month with highest 3m retention
  worst_cohort: string | null   // cohort_month with lowest 3m retention (only if ≥2 cohorts)
  total_cohorts: number
  avg_cohort_size: number
}

export interface HeatmapCell {
  cohort_month: string
  period_offset: number
  retention_pct: number | null  // null if no data for that period
  revenue_try: number
}

export interface CohortRevenueReport {
  cohort_rows: CohortRow[]
  summary: CohortSummary
  cohort_health: ReturnType<typeof classifyCohortHealth>
  cohort_trend: ReturnType<typeof computeCohortTrend>
  heatmap: HeatmapCell[]
  analysis_window_months: number  // how many months analyzed (max 12)
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  revenue_try:   number | null
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Given a flat list of sales rows, identify first purchase month per customer.
 * Returns a Map: customer_key → cohort_month (YYYY-MM).
 */
export function buildCustomerCohorts(
  sales: Array<{ customer_key: string; sale_month: string }>,
): Map<string, string> {
  const result = new Map<string, string>()

  for (const row of sales) {
    const existing = result.get(row.customer_key)
    if (!existing || row.sale_month < existing) {
      result.set(row.customer_key, row.sale_month)
    }
  }

  return result
}

/**
 * Given cohort map + monthly revenue per customer, build revenue matrix.
 * monthlyRevenue: Map<customer_key, Map<YYYY-MM, revenue>>
 */
export function buildCohortMatrix(
  cohortMap: Map<string, string>,
  monthlyRevenue: Map<string, Map<string, number>>,
  analysisMonths: string[],  // ordered YYYY-MM list of months to analyze
): CohortRow[] {
  if (analysisMonths.length === 0) return []

  // Group customers by cohort month
  const cohortCustomers = new Map<string, Set<string>>()
  for (const [customerKey, cohortMonth] of cohortMap) {
    if (!cohortCustomers.has(cohortMonth)) {
      cohortCustomers.set(cohortMonth, new Set())
    }
    cohortCustomers.get(cohortMonth)!.add(customerKey)
  }

  const rows: CohortRow[] = []

  for (const [cohortMonth, customerKeys] of cohortCustomers) {
    // Only process cohorts that fall within analysisMonths
    if (!analysisMonths.includes(cohortMonth)) continue

    const cohortSize = customerKeys.size
    const cohortIdx = analysisMonths.indexOf(cohortMonth)

    const cells: CohortCell[] = []

    for (let offset = 0; offset < analysisMonths.length - cohortIdx; offset++) {
      const calendarMonth = analysisMonths[cohortIdx + offset]
      if (!calendarMonth) break

      let customerCount = 0
      let revenue = 0

      for (const key of customerKeys) {
        const custRevMap = monthlyRevenue.get(key)
        if (!custRevMap) continue
        const rev = custRevMap.get(calendarMonth)
        if (rev !== undefined && rev > 0) {
          customerCount++
          revenue += rev
        }
      }

      cells.push({
        cohort_month: cohortMonth,
        period_offset: offset,
        calendar_month: calendarMonth,
        customer_count: customerCount,
        revenue_try: revenue,
        retention_pct: 0, // will be filled below
      })
    }

    if (cells.length === 0) continue

    const month0Revenue = cells[0]?.revenue_try ?? 0

    // Fill retention_pct
    for (const cell of cells) {
      cell.retention_pct = computeCohortRetention(month0Revenue, cell.revenue_try)
    }
    // Month 0 is always 100% by convention
    if (cells[0]) cells[0].retention_pct = 100

    const row: CohortRow = {
      cohort_month: cohortMonth,
      cohort_size: cohortSize,
      month_0_revenue: month0Revenue,
      cells: cells.sort((a, b) => a.period_offset - b.period_offset),
      avg_ltv_3m: computeAvgLtv({ cohort_month: cohortMonth, cohort_size: cohortSize, month_0_revenue: month0Revenue, cells, avg_ltv_3m: 0, avg_ltv_6m: 0, retention_3m_pct: null, retention_6m_pct: null }, 3),
      avg_ltv_6m: computeAvgLtv({ cohort_month: cohortMonth, cohort_size: cohortSize, month_0_revenue: month0Revenue, cells, avg_ltv_3m: 0, avg_ltv_6m: 0, retention_3m_pct: null, retention_6m_pct: null }, 6),
      retention_3m_pct: null,
      retention_6m_pct: null,
    }

    // Fill retention at month 3 and 6
    const cell3 = cells.find(c => c.period_offset === 3)
    const cell6 = cells.find(c => c.period_offset === 6)
    row.retention_3m_pct = cell3 !== undefined && month0Revenue > 0
      ? computeCohortRetention(month0Revenue, cell3.revenue_try)
      : null
    row.retention_6m_pct = cell6 !== undefined && month0Revenue > 0
      ? computeCohortRetention(month0Revenue, cell6.revenue_try)
      : null

    rows.push(row)
  }

  // Sort by cohort_month ascending
  return rows.sort((a, b) => a.cohort_month.localeCompare(b.cohort_month))
}

/**
 * Compute retention percentage (revenue basis).
 * Returns 0 if month0Revenue is 0.
 * Capped at 200% to handle re-activation spikes.
 */
export function computeCohortRetention(
  month0Revenue: number,
  currentRevenue: number,
): number {
  if (month0Revenue === 0) return 0
  const pct = (currentRevenue / month0Revenue) * 100
  return Math.min(pct, 200)
}

/**
 * Compute average LTV for a cohort up to N months (period offsets 0 to N-1).
 */
export function computeAvgLtv(cohortRow: CohortRow, months: number): number {
  if (cohortRow.cohort_size === 0) return 0
  const relevantCells = cohortRow.cells.filter(c => c.period_offset < months)
  const totalRevenue = relevantCells.reduce((sum, c) => sum + c.revenue_try, 0)
  return totalRevenue / cohortRow.cohort_size
}

/**
 * Find the cohort with the highest 3-month retention.
 * Returns cohort_month string or null if no data.
 */
export function findBestCohort(rows: CohortRow[]): string | null {
  const withData = rows.filter(r => r.retention_3m_pct !== null)
  if (withData.length === 0) return null
  return withData.reduce((best, r) =>
    (r.retention_3m_pct! > best.retention_3m_pct! ? r : best)
  ).cohort_month
}

/**
 * Find the cohort with the lowest 3-month retention.
 * Needs ≥2 cohorts with 3m data to be meaningful.
 * Returns null if fewer than 2 cohorts have data.
 */
export function findWorstCohort(rows: CohortRow[]): string | null {
  const withData = rows.filter(r => r.retention_3m_pct !== null)
  if (withData.length < 2) return null
  return withData.reduce((worst, r) =>
    (r.retention_3m_pct! < worst.retention_3m_pct! ? r : worst)
  ).cohort_month
}

/**
 * Summarize across all cohort rows.
 */
export function buildCohortSummary(rows: CohortRow[]): CohortSummary {
  if (rows.length === 0) {
    return {
      avg_month_1_retention_pct: null,
      avg_month_3_retention_pct: null,
      best_cohort: null,
      worst_cohort: null,
      total_cohorts: 0,
      avg_cohort_size: 0,
    }
  }

  // Avg month 1 retention
  const month1Rows = rows.filter(r => {
    const cell = r.cells.find(c => c.period_offset === 1)
    return cell !== undefined && r.month_0_revenue > 0
  })
  const avg_month_1_retention_pct = month1Rows.length > 0
    ? month1Rows.reduce((sum, r) => {
        const cell = r.cells.find(c => c.period_offset === 1)!
        return sum + computeCohortRetention(r.month_0_revenue, cell.revenue_try)
      }, 0) / month1Rows.length
    : null

  // Avg month 3 retention
  const month3Rows = rows.filter(r => r.retention_3m_pct !== null)
  const avg_month_3_retention_pct = month3Rows.length > 0
    ? month3Rows.reduce((sum, r) => sum + r.retention_3m_pct!, 0) / month3Rows.length
    : null

  const avg_cohort_size = rows.reduce((sum, r) => sum + r.cohort_size, 0) / rows.length

  return {
    avg_month_1_retention_pct,
    avg_month_3_retention_pct,
    best_cohort: findBestCohort(rows),
    worst_cohort: findWorstCohort(rows),
    total_cohorts: rows.length,
    avg_cohort_size,
  }
}

/**
 * Classify cohort health based on 3m retention average.
 * excellent: ≥60% | good: ≥40% | moderate: ≥20% | weak: ≥10% | poor: <10%
 * insufficient_data: null input
 */
export function classifyCohortHealth(
  avg3mRetentionPct: number | null,
): 'excellent' | 'good' | 'moderate' | 'weak' | 'poor' | 'insufficient_data' {
  if (avg3mRetentionPct === null) return 'insufficient_data'
  if (avg3mRetentionPct >= 60) return 'excellent'
  if (avg3mRetentionPct >= 40) return 'good'
  if (avg3mRetentionPct >= 20) return 'moderate'
  if (avg3mRetentionPct >= 10) return 'weak'
  return 'poor'
}

/**
 * Compute month-over-month cohort revenue trend (is last cohort better than avg?).
 * improving: latest cohort month_0_revenue > avg × 1.1
 * declining:  latest cohort month_0_revenue < avg × 0.9
 * stable: within ±10%
 * insufficient_data: < 2 cohorts
 */
export function computeCohortTrend(
  rows: CohortRow[],
): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
  if (rows.length < 2) return 'insufficient_data'

  const sorted = [...rows].sort((a, b) => a.cohort_month.localeCompare(b.cohort_month))
  const latest = sorted[sorted.length - 1]
  const avg = sorted.reduce((sum, r) => sum + r.month_0_revenue, 0) / sorted.length

  if (avg === 0) return 'insufficient_data'

  const ratio = latest.month_0_revenue / avg
  if (ratio > 1.1) return 'improving'
  if (ratio < 0.9) return 'declining'
  return 'stable'
}

/**
 * Generate heatmap data suitable for rendering.
 * Returns retention_pct values for each cohort×offset cell.
 * maxOffset limits the number of columns.
 */
export function buildCohortHeatmap(rows: CohortRow[], maxOffset: number): HeatmapCell[] {
  const result: HeatmapCell[] = []

  for (const row of rows) {
    for (let offset = 0; offset <= maxOffset; offset++) {
      const cell = row.cells.find(c => c.period_offset === offset)
      result.push({
        cohort_month: row.cohort_month,
        period_offset: offset,
        retention_pct: cell !== undefined ? cell.retention_pct : null,
        revenue_try: cell?.revenue_try ?? 0,
      })
    }
  }

  return result
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Offset a YYYY-MM by N months → YYYY-MM */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Generate a list of YYYY-MM strings from start to end (inclusive) */
function monthRange(startYM: string, endYM: string): string[] {
  const months: string[] = []
  let current = startYM
  while (current <= endYM) {
    months.push(current)
    current = addMonths(current, 1)
  }
  return months
}

/** Derive stable customer key from a raw sale row */
function buildCustomerKey(row: RawSale): string | null {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return null
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CohortRevenueService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<CohortRevenueReport> {
    // Determine 12-month window
    const now = new Date()
    const endYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const startYM = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`

    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, revenue_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', `${startYM}-01`)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CohortRevenueService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    // Build monthly revenue map per customer
    const monthlyRevenue = new Map<string, Map<string, number>>()
    const salesForCohort: Array<{ customer_key: string; sale_month: string }> = []

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = buildCustomerKey(row)
      if (!key) continue

      const saleMonth = row.sale_date.slice(0, 7)
      const rev = Number(row.revenue_try ?? 0)

      if (!monthlyRevenue.has(key)) {
        monthlyRevenue.set(key, new Map())
      }
      const custMap = monthlyRevenue.get(key)!
      custMap.set(saleMonth, (custMap.get(saleMonth) ?? 0) + rev)
      salesForCohort.push({ customer_key: key, sale_month: saleMonth })
    }

    // Build cohort map
    const cohortMap = buildCustomerCohorts(salesForCohort)

    // Build analysis month list
    const analysisMonths = monthRange(startYM, endYM)

    // Build cohort matrix
    const cohortRows = buildCohortMatrix(cohortMap, monthlyRevenue, analysisMonths)

    // Build summary
    const summary = buildCohortSummary(cohortRows)

    // Classify health & trend
    const cohortHealth = classifyCohortHealth(summary.avg_month_3_retention_pct)
    const cohortTrend = computeCohortTrend(cohortRows)

    // Build heatmap (max 11 offsets — 12 months total)
    const heatmap = buildCohortHeatmap(cohortRows, 11)

    return {
      cohort_rows: cohortRows,
      summary,
      cohort_health: cohortHealth,
      cohort_trend: cohortTrend,
      heatmap,
      analysis_window_months: analysisMonths.length,
    }
  }
}
