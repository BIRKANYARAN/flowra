// ── CustomerLtvService — Customer Lifetime Value (LTV) Analysis ───────────────
// RFM scoring, LTV estimation, churn risk, and customer segmentation.
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export type ChurnRisk = 'low' | 'medium' | 'high' | 'uncertain'
export type CustomerSegment = 'champions' | 'loyal' | 'at_risk' | 'new' | 'lost' | 'other'

export interface CustomerLtvProfile {
  customer_id: string | null
  customer_name: string
  // RFM
  recency_days: number
  frequency_12m: number
  monetary_12m: number
  r_score: number    // 1-5
  f_score: number    // 1-5
  m_score: number    // 1-5
  rfm_score: number  // r + f + m (3-15)
  // LTV
  avg_order_value: number
  estimated_ltv: number
  // Risk
  churn_risk: ChurnRisk
  segment: CustomerSegment
  // History
  first_order_date: string
  last_order_date: string
  total_revenue_all_time: number
  total_orders: number
}

export interface CustomerLtvReport {
  company_id: string
  as_of_date: string
  customers: CustomerLtvProfile[]    // sorted by estimated_ltv DESC
  // Segments
  champions: number
  loyal: number
  at_risk: number
  new_customers: number
  lost: number
  // Portfolio
  total_customers: number
  avg_ltv: number
  top_10_pct_revenue_share: number   // revenue concentration in top 10%
  high_churn_risk_count: number
  high_churn_risk_value: number      // sum of LTV for high-churn customers
  computed_at: string
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total:         number | null
}

// ── Pure scoring helpers (exported for tests) ─────────────────────────────────

/**
 * Recency score: days since last order → 1-5
 * <30d=5, 30-60d=4, 60-90d=3, 90-180d=2, >180d=1
 */
export function computeRScore(recencyDays: number): number {
  if (recencyDays < 30)  return 5
  if (recencyDays < 60)  return 4
  if (recencyDays < 90)  return 3
  if (recencyDays < 180) return 2
  return 1
}

/**
 * Frequency score: orders in last 12m → 1-5
 * ≥6=5, 4-5=4, 3=3, 2=2, 1=1, 0=0 (inactive)
 */
export function computeFScore(frequency: number): number {
  if (frequency <= 0) return 0
  if (frequency >= 6) return 5
  if (frequency >= 4) return 4
  if (frequency === 3) return 3
  if (frequency === 2) return 2
  return 1
}

/**
 * Monetary score: assign 1-5 based on quintile breaks.
 * quintileBreaks = [p20, p40, p60, p80] of the monetary distribution.
 */
export function computeMScore(monetary: number, quintileBreaks: number[]): number {
  if (quintileBreaks.length < 4) return 1
  if (monetary > quintileBreaks[3]) return 5
  if (monetary > quintileBreaks[2]) return 4
  if (monetary > quintileBreaks[1]) return 3
  if (monetary > quintileBreaks[0]) return 2
  return 1
}

/**
 * Segment assignment based on R, F, M scores.
 * Champions: R≥4, F≥4, M≥4
 * Loyal: F≥4, M≥3
 * At Risk: R≤2, F≥3 (was good, not ordering recently)
 * Lost: R=1, F≤2
 */
export function computeRfmSegment(r: number, f: number, m: number): CustomerSegment {
  if (r >= 4 && f >= 4 && m >= 4) return 'champions'
  if (r <= 2 && f >= 3)           return 'at_risk'    // check before loyal — recency overrides
  if (r === 1 && f <= 2)          return 'lost'
  if (f >= 4 && m >= 3)           return 'loyal'
  return 'other'
}

/**
 * Churn risk based on recency and frequency trend.
 * freq12m=1 → uncertain (first-time customer)
 * recency>90d + freq6m < priorFreq6m → high
 * recency 60-90d → medium
 * recency<60d → low
 */
export function computeChurnRisk(
  recencyDays: number,
  freq12m: number,
  freq6m: number,
  priorFreq6m: number,
): ChurnRisk {
  if (freq12m === 1) return 'uncertain'
  if (recencyDays > 90 && freq6m < priorFreq6m) return 'high'
  if (recencyDays >= 60 && recencyDays <= 90) return 'medium'
  if (recencyDays < 60) return 'low'
  return 'medium'
}

/**
 * Estimate customer LTV.
 * projected_lifespan = 24 months; 36 months if customerAgeMonths > 24.
 * estimated_ltv = avg_order_value * frequency12m * lifespan / 12
 */
export function estimateLtv(
  avgOrderValue: number,
  frequency12m: number,
  customerAgeMonths: number,
): number {
  if (avgOrderValue <= 0 || frequency12m <= 0) return 0
  const lifespan = customerAgeMonths > 24 ? 36 : 24
  return avgOrderValue * frequency12m * lifespan / 12
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Compute quintile break points (p20, p40, p60, p80) from a sorted array. */
function quintileBreaks(values: number[]): number[] {
  if (values.length === 0) return [0, 0, 0, 0]
  const sorted = [...values].sort((a, b) => a - b)
  const pct = (p: number) => {
    const idx = Math.floor((p / 100) * (sorted.length - 1))
    return sorted[idx]
  }
  return [pct(20), pct(40), pct(60), pct(80)]
}

/** Derive stable customer key for deduplication. */
function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CustomerLtvService {
  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<CustomerLtvReport> {
    const now     = new Date()
    const asOfDate = now.toISOString().slice(0, 10)

    // We need all-time data for total revenue / first order date,
    // but for RFM we focus on last 12 months.
    const { data, error } = await supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CustomerLtvService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    if (rows.length === 0) {
      return buildEmptyReport(companyId, asOfDate)
    }

    // Cutoff dates
    const cutoff12m = new Date(now)
    cutoff12m.setFullYear(cutoff12m.getFullYear() - 1)
    const cutoff6m = new Date(now)
    cutoff6m.setMonth(cutoff6m.getMonth() - 6)
    const prior6mStart = new Date(cutoff12m)

    // Group by customer key
    type CustomerAgg = {
      key: string
      customer_id: string | null
      customer_name: string
      orders: Array<{ date: Date; amount: number }>
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key  = customerKey(row)
      const date = new Date(row.sale_date)
      const amt  = Number(row.total ?? 0)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_id:   row.customer_id ?? null,
          customer_name: row.customer_name ?? 'Bilinmiyor',
          orders: [],
        })
      }
      aggMap.get(key)!.orders.push({ date, amount: amt })
    }

    // Compute per-customer metrics
    interface Metrics {
      key: string
      customer_id: string | null
      customer_name: string
      recency_days: number
      frequency_12m: number
      monetary_12m: number
      freq_6m: number
      freq_prior_6m: number
      first_order_date: string
      last_order_date: string
      total_revenue_all_time: number
      total_orders: number
      customer_age_months: number
    }

    const metricsList: Metrics[] = []

    for (const [, agg] of aggMap) {
      const { orders } = agg
      if (orders.length === 0) continue

      const firstDate = orders[0].date
      const lastDate  = orders[orders.length - 1].date
      const recencyMs = now.getTime() - lastDate.getTime()
      const recencyDays = Math.floor(recencyMs / (1000 * 60 * 60 * 24))

      const ageMs = now.getTime() - firstDate.getTime()
      const customerAgeMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44)

      const orders12m      = orders.filter(o => o.date >= cutoff12m)
      const orders6m       = orders.filter(o => o.date >= cutoff6m)
      const ordersPrior6m  = orders.filter(o => o.date >= prior6mStart && o.date < cutoff6m)

      const monetary12m = orders12m.reduce((s, o) => s + o.amount, 0)
      const totalRev    = orders.reduce((s, o) => s + o.amount, 0)

      metricsList.push({
        key: agg.key,
        customer_id:   agg.customer_id,
        customer_name: agg.customer_name,
        recency_days:  recencyDays,
        frequency_12m: orders12m.length,
        monetary_12m:  monetary12m,
        freq_6m:       orders6m.length,
        freq_prior_6m: ordersPrior6m.length,
        first_order_date:    firstDate.toISOString().slice(0, 10),
        last_order_date:     lastDate.toISOString().slice(0, 10),
        total_revenue_all_time: totalRev,
        total_orders:  orders.length,
        customer_age_months: customerAgeMonths,
      })
    }

    if (metricsList.length === 0) {
      return buildEmptyReport(companyId, asOfDate)
    }

    // Monetary quintile breaks for M score
    const monetary12mValues = metricsList.map(m => m.monetary_12m)
    const breaks = quintileBreaks(monetary12mValues)

    // Build profiles
    const profiles: CustomerLtvProfile[] = metricsList.map(m => {
      const rScore = computeRScore(m.recency_days)
      const fScore = computeFScore(m.frequency_12m)
      const mScore = computeMScore(m.monetary_12m, breaks)
      const rfmScore = rScore + fScore + mScore

      const freq12m = m.frequency_12m === 0 ? 1 : m.frequency_12m
      const avgOrderValue = m.monetary_12m > 0 ? m.monetary_12m / freq12m : 0
      const ltv = estimateLtv(avgOrderValue, m.frequency_12m, m.customer_age_months)

      // New customer: first order within 60 days
      const daysSinceFirst = (now.getTime() - new Date(m.first_order_date).getTime()) / (1000 * 60 * 60 * 24)
      const isNew = daysSinceFirst <= 60

      const churnRisk = computeChurnRisk(m.recency_days, m.frequency_12m, m.freq_6m, m.freq_prior_6m)

      let segment: CustomerSegment
      if (isNew && m.frequency_12m <= 1) {
        segment = 'new'
      } else {
        segment = computeRfmSegment(rScore, fScore, mScore)
      }

      return {
        customer_id:   m.customer_id,
        customer_name: m.customer_name,
        recency_days:  m.recency_days,
        frequency_12m: m.frequency_12m,
        monetary_12m:  m.monetary_12m,
        r_score: rScore,
        f_score: fScore,
        m_score: mScore,
        rfm_score: rfmScore,
        avg_order_value: avgOrderValue,
        estimated_ltv:   ltv,
        churn_risk: churnRisk,
        segment,
        first_order_date: m.first_order_date,
        last_order_date:  m.last_order_date,
        total_revenue_all_time: m.total_revenue_all_time,
        total_orders: m.total_orders,
      }
    })

    // Sort by LTV descending
    profiles.sort((a, b) => b.estimated_ltv - a.estimated_ltv)

    // Portfolio stats
    const totalCustomers = profiles.length
    const avgLtv = totalCustomers > 0
      ? profiles.reduce((s, p) => s + p.estimated_ltv, 0) / totalCustomers
      : 0

    // Top 10% revenue share (by LTV)
    const top10Count = Math.max(1, Math.ceil(totalCustomers * 0.1))
    const totalLtv   = profiles.reduce((s, p) => s + p.estimated_ltv, 0)
    const top10Ltv   = profiles.slice(0, top10Count).reduce((s, p) => s + p.estimated_ltv, 0)
    const top10Share = totalLtv > 0 ? (top10Ltv / totalLtv) * 100 : 0

    const highChurnProfiles = profiles.filter(p => p.churn_risk === 'high')

    return {
      company_id: companyId,
      as_of_date: asOfDate,
      customers: profiles,
      champions:     profiles.filter(p => p.segment === 'champions').length,
      loyal:         profiles.filter(p => p.segment === 'loyal').length,
      at_risk:       profiles.filter(p => p.segment === 'at_risk').length,
      new_customers: profiles.filter(p => p.segment === 'new').length,
      lost:          profiles.filter(p => p.segment === 'lost').length,
      total_customers:         totalCustomers,
      avg_ltv:                 avgLtv,
      top_10_pct_revenue_share: top10Share,
      high_churn_risk_count:   highChurnProfiles.length,
      high_churn_risk_value:   highChurnProfiles.reduce((s, p) => s + p.estimated_ltv, 0),
      computed_at: new Date().toISOString(),
    }
  }
}

// ── CLV pure helpers (exported for unit tests) ────────────────────────────────

/**
 * Average order value: totalRevenue / orderCount.
 * Returns null if orderCount === 0.
 */
export function computeAvgOrderValue(
  totalRevenue: number,
  orderCount: number,
): number | null {
  if (orderCount === 0) return null
  return totalRevenue / orderCount
}

/**
 * Purchase frequency: orders per month.
 * Returns null if customerLifespanMonths === 0.
 */
export function computePurchaseFrequency(
  orderCount: number,
  customerLifespanMonths: number,
): number | null {
  if (customerLifespanMonths === 0) return null
  return orderCount / customerLifespanMonths
}

/**
 * Customer lifespan in months between firstPurchaseDate and today (or provided today).
 * Uses: months = daysDiff / 30.44. Minimum 1 month.
 */
export function computeCustomerLifespan(
  firstPurchaseDate: string,
  lastPurchaseDate: string,
  today?: string,
): number {
  const todayStr = today ?? new Date().toISOString().slice(0, 10)
  const firstMs  = new Date(firstPurchaseDate).getTime()
  const todayMs  = new Date(todayStr).getTime()
  // Use today to measure lifespan from acquisition to now.
  // lastPurchaseDate is accepted but lifespan is first→today.
  void lastPurchaseDate
  const months = (todayMs - firstMs) / (1000 * 60 * 60 * 24 * 30.44)
  return Math.max(1, months)
}

/**
 * Simple CLV: avgOrderValue × purchaseFrequency × customerLifespanMonths.
 * Returns null if avgOrderValue or purchaseFrequency is null, or if lifespan <= 0.
 */
export function computeSimpleClv(
  avgOrderValue: number | null,
  purchaseFrequency: number | null,
  customerLifespanMonths: number,
): number | null {
  if (avgOrderValue === null || purchaseFrequency === null) return null
  if (customerLifespanMonths <= 0) return null
  return avgOrderValue * purchaseFrequency * customerLifespanMonths
}

/**
 * Margin-adjusted CLV: simpleClv × (grossMarginPct / 100).
 * Returns null if simpleClv is null.
 */
export function computeMarginAdjustedClv(
  simpleClv: number | null,
  grossMarginPct: number,
): number | null {
  if (simpleClv === null) return null
  return simpleClv * (grossMarginPct / 100)
}

export type CustomerValueClass =
  | 'champion'
  | 'loyal'
  | 'potential'
  | 'at_risk'
  | 'lost'
  | 'insufficient_data'

/**
 * Classify customer value based on CLV and percentile thresholds.
 * insufficient_data: clv null
 * champion: clv >= p80
 * loyal: clv >= p50
 * potential: clv >= p20
 * at_risk: clv > 0 but < p20
 * lost: clv === 0
 */
export function classifyCustomerValue(
  clv: number | null,
  percentileThresholds: { p80: number; p50: number; p20: number },
): CustomerValueClass {
  if (clv === null) return 'insufficient_data'
  if (clv >= percentileThresholds.p80) return 'champion'
  if (clv >= percentileThresholds.p50) return 'loyal'
  if (clv >= percentileThresholds.p20) return 'potential'
  if (clv > 0) return 'at_risk'
  return 'lost'
}

/**
 * Compute customer acquisition payback period in months.
 * = cac / (avgMonthlyRevenue × grossMarginPct / 100)
 * Returns null if avgMonthlyRevenue === 0 or grossMarginPct === 0.
 */
export function computeCustomerAcquisitionPayback(
  cac: number,
  avgMonthlyRevenue: number,
  grossMarginPct: number,
): number | null {
  if (avgMonthlyRevenue === 0 || grossMarginPct === 0) return null
  return cac / (avgMonthlyRevenue * (grossMarginPct / 100))
}

/**
 * CLV to CAC ratio: clv / cac.
 * Returns null if clv is null or cac === 0.
 * Benchmark: ratio >= 3 is healthy for B2B.
 */
export function computeClvToCacRatio(
  clv: number | null,
  cac: number,
): number | null {
  if (clv === null || cac === 0) return null
  return clv / cac
}

export type ClvCacHealth =
  | 'excellent'
  | 'healthy'
  | 'marginal'
  | 'unprofitable'
  | 'insufficient_data'

/**
 * Classify CLV/CAC health.
 * insufficient_data: null
 * excellent: >= 5
 * healthy: >= 3
 * marginal: >= 1
 * unprofitable: < 1
 */
export function classifyClvCacHealth(ratio: number | null): ClvCacHealth {
  if (ratio === null) return 'insufficient_data'
  if (ratio >= 5) return 'excellent'
  if (ratio >= 3) return 'healthy'
  if (ratio >= 1) return 'marginal'
  return 'unprofitable'
}

// ── Empty report helper ────────────────────────────────────────────────────────

function buildEmptyReport(companyId: string, asOfDate: string): CustomerLtvReport {
  return {
    company_id: companyId,
    as_of_date: asOfDate,
    customers: [],
    champions: 0,
    loyal: 0,
    at_risk: 0,
    new_customers: 0,
    lost: 0,
    total_customers: 0,
    avg_ltv: 0,
    top_10_pct_revenue_share: 0,
    high_churn_risk_count: 0,
    high_churn_risk_value: 0,
    computed_at: new Date().toISOString(),
  }
}
