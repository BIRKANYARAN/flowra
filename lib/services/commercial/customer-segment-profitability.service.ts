// ── CustomerSegmentProfitabilityService — Profitability by Customer Type ────────
//
// Computes revenue, COGS, gross margin, and profit contribution broken down
// by customer segment (enterprise / mid_market / small / one_time / new)
// for Turkish SMEs.
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export type CustomerSegment =
  | 'enterprise'   // large customers (top 20% by revenue)
  | 'mid_market'   // medium customers
  | 'small'        // small customers
  | 'one_time'     // only 1 purchase ever
  | 'new'          // first purchase within last 30 days

// ── Pure helpers (exported for tests) ─────────────────────────────────────────

/**
 * classifyCustomerSize
 * Classifies a customer into large / medium / small based on percentile thresholds.
 * large:  totalRevenue >= p80Threshold
 * medium: totalRevenue >= p50Threshold (and < p80Threshold)
 * small:  totalRevenue < p50Threshold
 */
export function classifyCustomerSize(
  totalRevenue: number,
  p80Threshold: number,
  p50Threshold: number,
): 'large' | 'medium' | 'small' {
  if (totalRevenue >= p80Threshold) return 'large'
  if (totalRevenue >= p50Threshold) return 'medium'
  return 'small'
}

/**
 * computeSegmentMargin
 * Gross margin %: (segmentRevenue - segmentCogs) / segmentRevenue × 100
 * Returns null if segmentRevenue === 0.
 */
export function computeSegmentMargin(
  segmentRevenue: number,
  segmentCogs: number,
): number | null {
  if (segmentRevenue === 0) return null
  return ((segmentRevenue - segmentCogs) / segmentRevenue) * 100
}

/**
 * computeSegmentContributionPct
 * Returns segmentRevenue / totalRevenue × 100.
 * Returns null if totalRevenue === 0.
 */
export function computeSegmentContributionPct(
  segmentRevenue: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (segmentRevenue / totalRevenue) * 100
}

/**
 * computeRevenueConcentration80
 * How many customers account for 80% of total revenue (Pareto).
 * Sorts customers descending by revenue, accumulates until 80% reached.
 * Returns total count if all customers needed.
 */
export function computeRevenueConcentration80(
  customers: Array<{ revenue: number }>,
): number {
  if (customers.length === 0) return 0

  const sorted = [...customers].sort((a, b) => b.revenue - a.revenue)
  const total = sorted.reduce((s, c) => s + c.revenue, 0)

  if (total <= 0) return customers.length

  const target = total * 0.8
  let cumulative = 0

  for (let i = 0; i < sorted.length; i++) {
    cumulative += sorted[i].revenue
    if (cumulative >= target) return i + 1
  }

  return customers.length
}

/**
 * computeSegmentGrowthRate
 * (current - prior) / prior × 100.
 * Returns null if prior === 0.
 */
export function computeSegmentGrowthRate(
  currentRevenue: number,
  priorRevenue: number,
): number | null {
  if (priorRevenue === 0) return null
  return ((currentRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100
}

/**
 * computeCustomerProfitabilityIndex
 * Score 0-100 combining margin, payment speed, and order frequency.
 *
 * margin_component:    null → 50; else clamp(grossMarginPct × 2, 0, 100) × 0.50
 * payment_component:   paymentSpeedScore × 0.30
 * frequency_component: min(100, orderFrequency × 20) × 0.20
 *
 * Returns null if grossMarginPct is null AND paymentSpeedScore === 0.
 * Result is rounded to 1 decimal.
 */
export function computeCustomerProfitabilityIndex(
  grossMarginPct: number | null,
  paymentSpeedScore: number,
  orderFrequency: number,
): number | null {
  if (grossMarginPct === null && paymentSpeedScore === 0) return null

  const marginComponent = grossMarginPct === null
    ? 50 * 0.50
    : Math.max(0, Math.min(100, grossMarginPct * 2)) * 0.50

  const paymentComponent = paymentSpeedScore * 0.30

  const frequencyComponent = Math.min(100, orderFrequency * 20) * 0.20

  const score = marginComponent + paymentComponent + frequencyComponent
  return Math.round(score * 10) / 10
}

/**
 * identifyUnprofitableSegments
 * Returns array of segment names where margin_pct < minAcceptableMarginPct or null.
 * Default minAcceptableMarginPct = 10.
 */
export function identifyUnprofitableSegments(
  segments: Array<{
    name: string
    margin_pct: number | null
    revenue: number
  }>,
  minAcceptableMarginPct = 10,
): string[] {
  return segments
    .filter(s => s.margin_pct === null || s.margin_pct < minAcceptableMarginPct)
    .map(s => s.name)
}

// ── Internal types ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

interface RawSale {
  id:            string | null
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total:         number | null
}

interface RawSaleItem {
  sale_id:    string | null
  qty:        number | null
  unit_cost:  number | null
  line_total: number | null
}

interface CustomerAgg {
  key:            string
  customer_id:    string | null
  customer_name:  string
  firstDate:      string
  lastDate:       string
  orderCount:     number
  totalRevenue:   number
  estimatedCogs:  number
}

// Derive a stable customer key for deduplication
function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

// Compute percentile value from a sorted ascending array
function percentileValue(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor((pct / 100) * (sorted.length - 1))
  return sorted[idx]
}

// ── SegmentProfitabilityService ───────────────────────────────────────────────

export interface CustomerSegmentRow {
  segment: CustomerSegment
  customer_count: number
  revenue: number
  estimated_cogs: number
  gross_margin: number
  gross_margin_pct: number | null
  contribution_pct: number | null
  avg_order_value: number | null
  growth_rate_pct: number | null
}

export interface CustomerSegmentReport {
  segments: CustomerSegmentRow[]
  revenue_concentration: {
    customers_for_80pct: number
    total_customers: number
    pareto_ratio: number | null
  }
  unprofitable_segments: string[]
  summary: {
    most_profitable_segment: CustomerSegment | null
    fastest_growing_segment: CustomerSegment | null
    highest_revenue_segment: CustomerSegment | null
    total_revenue: number
  }
}

export class CustomerSegmentProfitabilityService {
  constructor(private supabase: AnySupabase) {}

  async getReport(companyId: string): Promise<CustomerSegmentReport> {
    const now = new Date()

    // Date cutoffs
    const cutoff12m = new Date(now)
    cutoff12m.setFullYear(cutoff12m.getFullYear() - 1)
    const cutoff30d = new Date(now)
    cutoff30d.setDate(cutoff30d.getDate() - 30)

    // Current month bounds (for growth comparison)
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const priorMonthStart   = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const priorMonthEnd     = new Date(now.getFullYear(), now.getMonth(), 0)

    const currentFrom = currentMonthStart.toISOString().slice(0, 10)
    const priorFrom   = priorMonthStart.toISOString().slice(0, 10)
    const priorTo     = priorMonthEnd.toISOString().slice(0, 10)

    // ── 1. Fetch all sales in the last 12 months ──────────────────────────────
    let sales: RawSale[] = []
    try {
      const { data, error } = await this.supabase
        .from('sales')
        .select('id, customer_id, customer_name, sale_date, total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', cutoff12m.toISOString().slice(0, 10))
        .order('sale_date', { ascending: true })

      if (!error && data) {
        sales = (data as Array<Record<string, unknown>>).map(r => ({
          id:            r.id as string | null,
          customer_id:   r.customer_id as string | null,
          customer_name: r.customer_name as string | null,
          sale_date:     r.sale_date as string | null,
          total:         Number(r.total ?? 0),
        }))
      }
    } catch {
      sales = []
    }

    // ── 2. Fetch sale_items for COGS estimation ───────────────────────────────
    let saleItems: RawSaleItem[] = []
    try {
      const saleIds = sales.map(s => s.id).filter(Boolean) as string[]
      if (saleIds.length > 0) {
        const { data, error } = await this.supabase
          .from('sale_items')
          .select('sale_id, qty, unit_cost, line_total')
          .in('sale_id', saleIds)

        if (!error && data) {
          saleItems = (data as Array<Record<string, unknown>>).map(r => ({
            sale_id:    r.sale_id as string | null,
            qty:        Number(r.qty ?? 1),
            unit_cost:  r.unit_cost !== null && r.unit_cost !== undefined
              ? Number(r.unit_cost)
              : null,
            line_total: Number(r.line_total ?? 0),
          }))
        }
      }
    } catch {
      saleItems = []
    }

    // Build COGS lookup: sale_id → COGS
    const cogsMap = new Map<string, number>()
    let hasAnyCostData = false
    for (const item of saleItems) {
      if (!item.sale_id) continue
      if (item.unit_cost !== null && item.unit_cost > 0) {
        hasAnyCostData = true
        const prev = cogsMap.get(item.sale_id) ?? 0
        cogsMap.set(item.sale_id, prev + (item.qty ?? 0) * item.unit_cost)
      }
    }

    // ── 3. Aggregate per customer ─────────────────────────────────────────────
    const aggMap = new Map<string, CustomerAgg>()

    for (const row of sales) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      const amount = Number(row.total ?? 0)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_id:   row.customer_id ?? null,
          customer_name: row.customer_name ?? 'Bilinmiyor',
          firstDate:     row.sale_date,
          lastDate:      row.sale_date,
          orderCount:    0,
          totalRevenue:  0,
          estimatedCogs: 0,
        })
      }

      const agg = aggMap.get(key)!
      agg.orderCount  += 1
      agg.totalRevenue += amount

      // COGS from sale_items or 60% fallback
      const saleId = row.id ?? ''
      const cogs = hasAnyCostData && saleId && cogsMap.has(saleId)
        ? cogsMap.get(saleId)!
        : amount * 0.6

      agg.estimatedCogs += cogs

      if (row.sale_date < agg.firstDate) agg.firstDate = row.sale_date
      if (row.sale_date > agg.lastDate)  agg.lastDate  = row.sale_date
    }

    const allCustomers = Array.from(aggMap.values())

    if (allCustomers.length === 0) {
      return buildEmptyReport()
    }

    // ── 4. Compute size percentile thresholds ─────────────────────────────────
    const revenues = [...allCustomers].map(c => c.totalRevenue).sort((a, b) => a - b)
    const p80 = percentileValue(revenues, 80)
    const p50 = percentileValue(revenues, 50)

    // ── 5. Classify each customer into a segment ──────────────────────────────
    //    Priority: one_time and new override size classification
    const cutoff12mStr = cutoff12m.toISOString().slice(0, 10)
    const cutoff30dStr = cutoff30d.toISOString().slice(0, 10)

    const classifiedCustomers: Array<CustomerAgg & { segment: CustomerSegment }> =
      allCustomers.map(c => {
        let segment: CustomerSegment

        // one_time: only 1 purchase in last 12 months
        if (c.orderCount === 1) {
          segment = 'one_time'
        }
        // new: first purchase within last 30 days
        else if (c.firstDate >= cutoff30dStr) {
          segment = 'new'
        }
        else {
          // Size-based classification
          const size = classifyCustomerSize(c.totalRevenue, p80, p50)
          if (size === 'large')  segment = 'enterprise'
          else if (size === 'medium') segment = 'mid_market'
          else segment = 'small'
        }

        return { ...c, segment }
      })

    // ── 6. Build segment revenue for prior month (growth) ─────────────────────
    const priorRevenueBySegment = new Map<string, number>()
    // We need sales in prior month grouped by customer to assign segments
    const currentRevenueByKey = new Map<string, number>()
    const priorRevenueByKey   = new Map<string, number>()

    for (const row of sales) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      const amount = Number(row.total ?? 0)

      if (row.sale_date >= currentFrom) {
        currentRevenueByKey.set(key, (currentRevenueByKey.get(key) ?? 0) + amount)
      }
      if (row.sale_date >= priorFrom && row.sale_date <= priorTo) {
        priorRevenueByKey.set(key, (priorRevenueByKey.get(key) ?? 0) + amount)
      }
    }

    // Map segment → prior revenue
    for (const c of classifiedCustomers) {
      const seg = c.segment
      const priorRev = priorRevenueByKey.get(c.key) ?? 0
      priorRevenueBySegment.set(seg, (priorRevenueBySegment.get(seg) ?? 0) + priorRev)
    }

    // Map segment → current month revenue
    const currentRevenueBySegment = new Map<string, number>()
    for (const c of classifiedCustomers) {
      const seg = c.segment
      const curRev = currentRevenueByKey.get(c.key) ?? 0
      currentRevenueBySegment.set(seg, (currentRevenueBySegment.get(seg) ?? 0) + curRev)
    }

    // ── 7. Aggregate by segment ───────────────────────────────────────────────
    type SegAgg = {
      revenue:       number
      estimatedCogs: number
      orderCount:    number
      customerCount: number
    }

    const segAggMap = new Map<CustomerSegment, SegAgg>()
    const ALL_SEGMENTS: CustomerSegment[] = ['enterprise', 'mid_market', 'small', 'one_time', 'new']

    for (const seg of ALL_SEGMENTS) {
      segAggMap.set(seg, { revenue: 0, estimatedCogs: 0, orderCount: 0, customerCount: 0 })
    }

    for (const c of classifiedCustomers) {
      const acc = segAggMap.get(c.segment)!
      acc.revenue       += c.totalRevenue
      acc.estimatedCogs += c.estimatedCogs
      acc.orderCount    += c.orderCount
      acc.customerCount += 1
    }

    const totalRevenue = allCustomers.reduce((s, c) => s + c.totalRevenue, 0)

    // ── 8. Build segment rows ─────────────────────────────────────────────────
    const segments: CustomerSegmentRow[] = ALL_SEGMENTS.map(seg => {
      const acc         = segAggMap.get(seg)!
      const grossMargin = acc.revenue - acc.estimatedCogs
      const marginPct   = computeSegmentMargin(acc.revenue, acc.estimatedCogs)
      const contribPct  = computeSegmentContributionPct(acc.revenue, totalRevenue)
      const avgOV       = acc.orderCount > 0 ? acc.revenue / acc.orderCount : null

      const curRev  = currentRevenueBySegment.get(seg) ?? 0
      const priorRev = priorRevenueBySegment.get(seg) ?? 0
      const growthPct = computeSegmentGrowthRate(curRev, priorRev)

      return {
        segment:          seg,
        customer_count:   acc.customerCount,
        revenue:          acc.revenue,
        estimated_cogs:   acc.estimatedCogs,
        gross_margin:     grossMargin,
        gross_margin_pct: marginPct,
        contribution_pct: contribPct,
        avg_order_value:  avgOV,
        growth_rate_pct:  growthPct,
      }
    })

    // ── 9. Revenue concentration (Pareto) ─────────────────────────────────────
    const customersForPareto = allCustomers.map(c => ({ revenue: c.totalRevenue }))
    const customersFor80Pct = computeRevenueConcentration80(customersForPareto)
    const totalCustomers    = allCustomers.length
    const paretoRatio       = totalCustomers > 0
      ? (customersFor80Pct / totalCustomers) * 100
      : null

    // ── 10. Unprofitable segments ─────────────────────────────────────────────
    const unprofitableSegments = identifyUnprofitableSegments(
      segments.map(s => ({
        name:       s.segment,
        margin_pct: s.gross_margin_pct,
        revenue:    s.revenue,
      })),
    )

    // ── 11. Summary ───────────────────────────────────────────────────────────
    const activeSegments = segments.filter(s => s.revenue > 0)

    const mostProfitable = activeSegments.length > 0
      ? activeSegments.reduce((best, s) => {
          const bm = best.gross_margin_pct ?? -Infinity
          const sm = s.gross_margin_pct ?? -Infinity
          return sm > bm ? s : best
        }).segment
      : null

    const fastestGrowing = activeSegments.filter(s => s.growth_rate_pct !== null).length > 0
      ? activeSegments
          .filter(s => s.growth_rate_pct !== null)
          .reduce((best, s) => (s.growth_rate_pct! > best.growth_rate_pct! ? s : best))
          .segment
      : null

    const highestRevenue = activeSegments.length > 0
      ? activeSegments.reduce((best, s) => (s.revenue > best.revenue ? s : best)).segment
      : null

    return {
      segments,
      revenue_concentration: {
        customers_for_80pct: customersFor80Pct,
        total_customers:     totalCustomers,
        pareto_ratio:        paretoRatio,
      },
      unprofitable_segments: unprofitableSegments,
      summary: {
        most_profitable_segment: mostProfitable,
        fastest_growing_segment: fastestGrowing,
        highest_revenue_segment: highestRevenue,
        total_revenue:           totalRevenue,
      },
    }
  }
}

// ── Empty report ──────────────────────────────────────────────────────────────

function buildEmptyReport(): CustomerSegmentReport {
  const ALL_SEGMENTS: CustomerSegment[] = ['enterprise', 'mid_market', 'small', 'one_time', 'new']

  return {
    segments: ALL_SEGMENTS.map(seg => ({
      segment:          seg,
      customer_count:   0,
      revenue:          0,
      estimated_cogs:   0,
      gross_margin:     0,
      gross_margin_pct: null,
      contribution_pct: null,
      avg_order_value:  null,
      growth_rate_pct:  null,
    })),
    revenue_concentration: {
      customers_for_80pct: 0,
      total_customers:     0,
      pareto_ratio:        null,
    },
    unprofitable_segments: [],
    summary: {
      most_profitable_segment: null,
      fastest_growing_segment: null,
      highest_revenue_segment: null,
      total_revenue:           0,
    },
  }
}
