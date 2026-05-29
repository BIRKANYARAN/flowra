// ── CustomerLtvEnhancedService — Enhanced Customer Lifetime Value Analysis ────
// Multiple calculation methods: historical, predictive, margin-adjusted.
// Customer segment analysis with churn probability and CLV tier classification.
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerLtvInputs {
  customer_id: string
  customer_name: string
  total_revenue: number
  total_orders: number
  first_order_date: string           // YYYY-MM-DD
  last_order_date: string            // YYYY-MM-DD
  avg_order_value: number
  order_frequency_per_year: number   // orders per year
  gross_margin_pct: number | null    // 0-100
  is_active: boolean                 // ordered in last 90 days
  days_since_last_order: number
}

export interface LtvEstimate {
  customer_id: string
  historical_ltv: number             // actual revenue to date
  projected_ltv_3yr: number          // 3-year projection
  projected_ltv_5yr: number          // 5-year projection
  margin_adjusted_ltv: number        // projected × margin%
  churn_probability: number          // 0-1
  expected_remaining_value: number   // projected × (1 - churn_probability)
  ltv_segment: 'champion' | 'loyal' | 'potential' | 'at_risk' | 'lost'
  clv_tier: 'platinum' | 'gold' | 'silver' | 'bronze'
}

export interface CustomerLtvEnhancedReport {
  as_of_date: string
  customer_estimates: LtvEstimate[]
  portfolio_stats: ReturnType<typeof computePortfolioLtvStats>
  retention_rate: number | null
  avg_order_value_portfolio: number | null
  top_customers_by_ltv: LtvEstimate[]     // top 10 by projected_5yr
  at_risk_customers: LtvEstimate[]        // ltv_segment = 'at_risk' or 'lost'
  champion_customers: LtvEstimate[]
  narrative: string
  customer_count: number
}

// ── Internal raw types ────────────────────────────────────────────────────────

interface RawSaleRow {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total:         number | null
}

interface RawMarginRow {
  customer_id: string | null
  margin_pct:  number | null
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Compute tenure in years between firstOrderDate and asOfDate.
 * Minimum 0.01 to avoid division by zero.
 */
export function computeCustomerTenureYears(
  firstOrderDate: string,
  asOfDate: string,
): number {
  const firstMs = new Date(firstOrderDate).getTime()
  const asOfMs  = new Date(asOfDate).getTime()
  const days = (asOfMs - firstMs) / (1000 * 60 * 60 * 24)
  return Math.max(0.01, days / 365.25)
}

/**
 * Compute average order frequency (orders per year).
 * Returns 0 if tenureYears === 0.
 */
export function computeAvgOrderFrequency(
  totalOrders: number,
  tenureYears: number,
): number {
  if (tenureYears === 0) return 0
  return totalOrders / tenureYears
}

/**
 * Historical LTV: actual revenue to date.
 * Direct pass-through for clarity.
 */
export function computeHistoricalLtv(totalRevenue: number): number {
  return totalRevenue
}

/**
 * Projected LTV using geometric series (annuity formula).
 * = AOV × freq × retention × (1 - retention^projectionYears) / (1 - retention)
 * If retention === 1: AOV × freq × projectionYears
 * Returns 0 if AOV or freq <= 0.
 */
export function computeProjectedLtv(
  avgOrderValue: number,
  orderFrequencyPerYear: number,
  projectionYears: number,
  annualRetentionRate: number,  // 0-1, e.g. 0.85
): number {
  if (avgOrderValue <= 0 || orderFrequencyPerYear <= 0) return 0

  if (annualRetentionRate === 1) {
    return avgOrderValue * orderFrequencyPerYear * projectionYears
  }

  const r = annualRetentionRate
  const n = projectionYears
  const series = r * (1 - Math.pow(r, n)) / (1 - r)
  return avgOrderValue * orderFrequencyPerYear * series
}

/**
 * Margin-adjusted LTV.
 * Returns projectedLtv × (grossMarginPct / 100).
 * Returns projectedLtv unchanged if grossMarginPct is null.
 */
export function computeMarginAdjustedLtv(
  projectedLtv: number,
  grossMarginPct: number | null,
): number {
  if (grossMarginPct === null) return projectedLtv
  return projectedLtv * (grossMarginPct / 100)
}

/**
 * Compute churn probability based on recency vs expected order interval.
 * ratio = daysSinceLastOrder / avgOrderIntervalDays
 *   <= 1.0: 0.05
 *   <= 1.5: 0.15
 *   <= 2.0: 0.35
 *   <= 3.0: 0.60
 *   <= 5.0: 0.80
 *   >  5.0: 0.95
 * Returns 0.5 if avgOrderIntervalDays === 0.
 */
export function computeChurnProbability(
  daysSinceLastOrder: number,
  avgOrderIntervalDays: number,  // 365 / orderFrequency
): number {
  if (avgOrderIntervalDays === 0) return 0.5
  const ratio = daysSinceLastOrder / avgOrderIntervalDays
  if (ratio <= 1.0) return 0.05
  if (ratio <= 1.5) return 0.15
  if (ratio <= 2.0) return 0.35
  if (ratio <= 3.0) return 0.60
  if (ratio <= 5.0) return 0.80
  return 0.95
}

/**
 * Expected remaining value = projectedLtv × (1 - churnProbability).
 */
export function computeExpectedRemainingValue(
  projectedLtv: number,
  churnProbability: number,
): number {
  return projectedLtv * (1 - churnProbability)
}

/**
 * Classify LTV segment with priority ordering:
 * lost > at_risk > champion > loyal > potential
 */
export function classifyLtvSegment(
  churnProbability: number,
  orderFrequencyPerYear: number,
  historicalLtv: number,
  avgLtvForPortfolio: number,
): LtvEstimate['ltv_segment'] {
  if (churnProbability >= 0.80) return 'lost'
  if (churnProbability >= 0.50) return 'at_risk'
  if (orderFrequencyPerYear >= 4 && historicalLtv >= avgLtvForPortfolio * 1.5) return 'champion'
  if (orderFrequencyPerYear >= 2 || historicalLtv >= avgLtvForPortfolio) return 'loyal'
  return 'potential'
}

/**
 * Classify CLV tier based on 5-year projected LTV thresholds.
 */
export function classifyClvTier(
  projectedLtv5yr: number,
  thresholds: {
    platinum: number  // e.g. 500000
    gold: number      // e.g. 150000
    silver: number    // e.g. 50000
  },
): LtvEstimate['clv_tier'] {
  if (projectedLtv5yr >= thresholds.platinum) return 'platinum'
  if (projectedLtv5yr >= thresholds.gold)     return 'gold'
  if (projectedLtv5yr >= thresholds.silver)   return 'silver'
  return 'bronze'
}

/**
 * Compute portfolio-level LTV statistics.
 */
export function computePortfolioLtvStats(estimates: LtvEstimate[]): {
  total_projected_5yr: number
  avg_projected_5yr: number
  median_projected_5yr: number
  total_expected_remaining: number
  champion_count: number
  at_risk_value: number   // sum of expected_remaining for at_risk + lost
} {
  if (estimates.length === 0) {
    return {
      total_projected_5yr: 0,
      avg_projected_5yr: 0,
      median_projected_5yr: 0,
      total_expected_remaining: 0,
      champion_count: 0,
      at_risk_value: 0,
    }
  }

  const total_projected_5yr = estimates.reduce((s, e) => s + e.projected_ltv_5yr, 0)
  const avg_projected_5yr   = total_projected_5yr / estimates.length

  const sorted = [...estimates].sort((a, b) => a.projected_ltv_5yr - b.projected_ltv_5yr)
  const mid = Math.floor(sorted.length / 2)
  const median_projected_5yr =
    sorted.length % 2 === 0
      ? (sorted[mid - 1].projected_ltv_5yr + sorted[mid].projected_ltv_5yr) / 2
      : sorted[mid].projected_ltv_5yr

  const total_expected_remaining = estimates.reduce((s, e) => s + e.expected_remaining_value, 0)
  const champion_count = estimates.filter(e => e.ltv_segment === 'champion').length
  const at_risk_value  = estimates
    .filter(e => e.ltv_segment === 'at_risk' || e.ltv_segment === 'lost')
    .reduce((s, e) => s + e.expected_remaining_value, 0)

  return {
    total_projected_5yr,
    avg_projected_5yr,
    median_projected_5yr,
    total_expected_remaining,
    champion_count,
    at_risk_value,
  }
}

/**
 * Compute annual retention rate from customer overlap data.
 * Returns null if customersLastYear === 0.
 * Clamps result to [0, 1].
 */
export function computeRetentionRateFromData(
  customersLastYear: number,
  customersRetainedThisYear: number,
): number | null {
  if (customersLastYear === 0) return null
  const rate = customersRetainedThisYear / customersLastYear
  return Math.min(1, Math.max(0, rate))
}

/**
 * Build default CLV tier thresholds relative to average projected LTV.
 * platinum: avg × 5, gold: avg × 2, silver: avg × 0.5
 */
export function buildDefaultClvThresholds(avgProjectedLtv: number): {
  platinum: number
  gold: number
  silver: number
} {
  return {
    platinum: avgProjectedLtv * 5,
    gold:     avgProjectedLtv * 2,
    silver:   avgProjectedLtv * 0.5,
  }
}

/**
 * Generate Turkish deterministic narrative for the LTV portfolio.
 */
export function generateLtvNarrative(
  portfolioStats: ReturnType<typeof computePortfolioLtvStats>,
  championCount: number,
  atRiskCustomers: number,
  totalCustomers: number,
): string {
  const TRY_FMT = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 })

  const fmtTRY = (n: number): string => {
    const abs = Math.abs(n)
    if (abs >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `₺${(n / 1_000).toFixed(0)}B`
    return `₺${TRY_FMT.format(Math.round(n))}`
  }

  const totalVal = fmtTRY(portfolioStats.total_projected_5yr)

  let text = `Müşteri portföyünün 5 yıllık beklenen değeri ${totalVal} TL.`

  if (championCount > 0) {
    text += ` ${championCount} şampiyon müşteri toplam değerin önemli bölümünü oluşturuyor.`
  }

  if (totalCustomers > 0 && atRiskCustomers > totalCustomers * 0.3) {
    text += ` Müşteri kaybı riski yüksek — ${atRiskCustomers} müşteri risk altında.`
  }

  return text
}

// ── Service class ──────────────────────────────────────────────────────────────

export class CustomerLtvEnhancedService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<CustomerLtvEnhancedReport> {
    const now       = new Date()
    const asOfDate  = now.toISOString().slice(0, 10)

    // Date boundaries
    const cutoff24m = new Date(now)
    cutoff24m.setFullYear(cutoff24m.getFullYear() - 2)
    const cutoff24mStr = cutoff24m.toISOString().slice(0, 10)

    const cutoff1yr = new Date(now)
    cutoff1yr.setFullYear(cutoff1yr.getFullYear() - 1)
    const cutoff1yrStr = cutoff1yr.toISOString().slice(0, 10)

    // Fetch sales and margin data in parallel
    const [salesResult, marginResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('customer_id, customer_name, sale_date, total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .or('is_proforma.is.null,is_proforma.eq.false')
        .gte('sale_date', cutoff24mStr)
        .order('sale_date', { ascending: true }),
      this.supabase
        .from('sale_item_allocations')
        .select('customer_id, margin_pct')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    if (salesResult.status === 'rejected') {
      throw new Error(`CustomerLtvEnhancedService: sales query failed — ${salesResult.reason}`)
    }
    if (salesResult.value.error) {
      throw new Error(`CustomerLtvEnhancedService: ${salesResult.value.error.message}`)
    }

    const salesRows  = (salesResult.value.data ?? []) as RawSaleRow[]
    const marginRows = marginResult.status === 'fulfilled' && !marginResult.value.error
      ? (marginResult.value.data ?? []) as RawMarginRow[]
      : []

    if (salesRows.length === 0) {
      return this.buildEmptyReport(asOfDate)
    }

    // ── Aggregate sales by customer ───────────────────────────────────────────

    type CustomerAgg = {
      customer_id: string
      customer_name: string
      totalRevenue: number
      orderCount: number
      firstDate: Date
      lastDate: Date
      orders: Date[]
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of salesRows) {
      if (!row.sale_date) continue
      const cid  = row.customer_id ?? `name:${row.customer_name ?? 'Bilinmiyor'}`
      const name = row.customer_name ?? 'Bilinmiyor'
      const date = new Date(row.sale_date)
      const amt  = Number(row.total ?? 0)

      if (!aggMap.has(cid)) {
        aggMap.set(cid, {
          customer_id:   cid,
          customer_name: name,
          totalRevenue: 0,
          orderCount: 0,
          firstDate: date,
          lastDate: date,
          orders: [],
        })
      }

      const agg = aggMap.get(cid)!
      agg.totalRevenue += amt
      agg.orderCount   += 1
      if (date < agg.firstDate) agg.firstDate = date
      if (date > agg.lastDate)  agg.lastDate  = date
      agg.orders.push(date)
    }

    // ── Build margin lookup by customer ───────────────────────────────────────

    const marginByCid = new Map<string, number[]>()
    for (const row of marginRows) {
      if (!row.customer_id || row.margin_pct === null) continue
      if (!marginByCid.has(row.customer_id)) marginByCid.set(row.customer_id, [])
      marginByCid.get(row.customer_id)!.push(row.margin_pct)
    }

    const avgMarginForCid = (cid: string): number | null => {
      const vals = marginByCid.get(cid)
      if (!vals || vals.length === 0) return null
      return vals.reduce((s, v) => s + v, 0) / vals.length
    }

    // ── Compute average portfolio LTV (for classification) ────────────────────

    const allHistoricalLtvs = [...aggMap.values()].map(a => a.totalRevenue)
    const avgPortfolioLtv   = allHistoricalLtvs.length > 0
      ? allHistoricalLtvs.reduce((s, v) => s + v, 0) / allHistoricalLtvs.length
      : 0

    // ── Compute retention rate ────────────────────────────────────────────────

    const customersLastYearSet  = new Set<string>()
    const customersThisYearSet  = new Set<string>()

    for (const [cid, agg] of aggMap) {
      const ordersLastYear = agg.orders.filter(
        d => d >= cutoff1yr && d < new Date(asOfDate)
      )
      const ordersPriorYear = agg.orders.filter(
        d => d >= cutoff24m && d < cutoff1yr
      )
      if (ordersPriorYear.length > 0) customersLastYearSet.add(cid)
      if (ordersLastYear.length > 0)  customersThisYearSet.add(cid)
    }

    const retained = [...customersLastYearSet].filter(cid => customersThisYearSet.has(cid)).length
    const retentionRate = computeRetentionRateFromData(customersLastYearSet.size, retained)

    // Default retention for projection (fallback 0.80 if no data)
    const projectionRetention = retentionRate ?? 0.80

    // ── Build per-customer LTV estimates ─────────────────────────────────────

    // Build avg LTV placeholder (use historical for now, thresholds updated after)
    const estimates: LtvEstimate[] = []

    for (const [cid, agg] of aggMap) {
      const tenureYears = computeCustomerTenureYears(
        agg.firstDate.toISOString().slice(0, 10),
        asOfDate,
      )
      const freq = computeAvgOrderFrequency(agg.orderCount, tenureYears)
      const aov  = agg.orderCount > 0 ? agg.totalRevenue / agg.orderCount : 0

      const historicalLtv   = computeHistoricalLtv(agg.totalRevenue)
      const projected3yr    = computeProjectedLtv(aov, freq, 3, projectionRetention)
      const projected5yr    = computeProjectedLtv(aov, freq, 5, projectionRetention)
      const grossMarginPct  = avgMarginForCid(cid)
      const marginAdjLtv    = computeMarginAdjustedLtv(projected5yr, grossMarginPct)

      const daysSinceLast   = Math.floor(
        (new Date(asOfDate).getTime() - agg.lastDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      const avgIntervalDays = freq > 0 ? 365 / freq : 0
      const churnProb       = computeChurnProbability(daysSinceLast, avgIntervalDays)
      const expectedRemVal  = computeExpectedRemainingValue(projected5yr, churnProb)

      const ltvSegment = classifyLtvSegment(churnProb, freq, historicalLtv, avgPortfolioLtv)

      // CLV tier computed after we know avg projected 5yr (placeholder 'bronze', updated below)
      estimates.push({
        customer_id: cid,
        historical_ltv:          historicalLtv,
        projected_ltv_3yr:       projected3yr,
        projected_ltv_5yr:       projected5yr,
        margin_adjusted_ltv:     marginAdjLtv,
        churn_probability:       churnProb,
        expected_remaining_value: expectedRemVal,
        ltv_segment:             ltvSegment,
        clv_tier:                'bronze',  // updated below
      })
    }

    // ── Apply CLV tier thresholds ─────────────────────────────────────────────

    const avgProjected5yr = estimates.length > 0
      ? estimates.reduce((s, e) => s + e.projected_ltv_5yr, 0) / estimates.length
      : 0
    const thresholds = buildDefaultClvThresholds(avgProjected5yr)

    for (const est of estimates) {
      est.clv_tier = classifyClvTier(est.projected_ltv_5yr, thresholds)
    }

    // ── Sort + filter ─────────────────────────────────────────────────────────

    estimates.sort((a, b) => b.projected_ltv_5yr - a.projected_ltv_5yr)

    const portfolioStats      = computePortfolioLtvStats(estimates)
    const topCustomers        = estimates.slice(0, 10)
    const atRiskCustomers     = estimates.filter(e => e.ltv_segment === 'at_risk' || e.ltv_segment === 'lost')
    const championCustomers   = estimates.filter(e => e.ltv_segment === 'champion')

    const avgOvPortfolio = estimates.length > 0
      ? estimates.reduce((s, e) => s + e.historical_ltv, 0) /
        estimates.reduce((s, a) => {
          const agg = aggMap.get(a.customer_id)
          return s + (agg ? agg.orderCount : 0)
        }, 0)
      : null

    const narrative = generateLtvNarrative(
      portfolioStats,
      portfolioStats.champion_count,
      atRiskCustomers.length,
      estimates.length,
    )

    return {
      as_of_date: asOfDate,
      customer_estimates: estimates,
      portfolio_stats: portfolioStats,
      retention_rate: retentionRate,
      avg_order_value_portfolio: isFinite(avgOvPortfolio ?? NaN) ? avgOvPortfolio : null,
      top_customers_by_ltv: topCustomers,
      at_risk_customers:    atRiskCustomers,
      champion_customers:   championCustomers,
      narrative,
      customer_count: estimates.length,
    }
  }

  private buildEmptyReport(asOfDate: string): CustomerLtvEnhancedReport {
    const emptyStats = computePortfolioLtvStats([])
    return {
      as_of_date: asOfDate,
      customer_estimates: [],
      portfolio_stats: emptyStats,
      retention_rate: null,
      avg_order_value_portfolio: null,
      top_customers_by_ltv: [],
      at_risk_customers: [],
      champion_customers: [],
      narrative: 'Yeterli müşteri verisi bulunamadı.',
      customer_count: 0,
    }
  }
}
