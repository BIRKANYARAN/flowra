// ── CustomerConcentrationService — HHI-based revenue concentration analysis ──
// Computes Herfindahl-Hirschman Index (HHI) to quantify customer revenue
// concentration risk. High dependence on a single customer is a major risk.
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConcentrationLevel =
  | 'unconcentrated'
  | 'moderate'
  | 'concentrated'
  | 'highly_concentrated'

export type CustomerTier = 'tier1' | 'tier2' | 'tier3' | 'tier4'

export interface CustomerConcentrationEntry {
  customer_id: string | null
  customer_name: string
  revenue_try: number
  revenue_share_pct: number
  cumulative_share_pct: number   // running cumulative from top
  order_count: number
  tier: CustomerTier
  in_pareto_80: boolean          // contributes to the top-80% group
}

export interface MonthlyHhi {
  month: string    // 'YYYY-MM'
  label: string
  hhi: number
  level: ConcentrationLevel
}

export interface CustomerConcentrationReport {
  company_id: string
  period_months: number   // 12
  // Overall concentration
  hhi: number
  level: ConcentrationLevel
  // Concentration metrics
  top1_share_pct: number
  top3_share_pct: number
  top5_share_pct: number
  pareto_customer_count: number   // customers making up 80% of revenue
  total_customers: number
  at_risk_try: number             // top customer's revenue (risk if lost)
  // Customer list
  customers: CustomerConcentrationEntry[]   // sorted by revenue DESC
  // Tier counts
  tier1_count: number
  tier2_count: number
  tier3_count: number
  tier4_count: number
  // Trend
  monthly_hhi: MonthlyHhi[]
  hhi_trend: 'improving' | 'worsening' | 'stable' | 'insufficient'
  computed_at: string
}

// ── Raw DB rows ────────────────────────────────────────────────────────────────

interface SaleRow {
  customer_id:   string | null
  customer_name: string | null
  total:         number | null
  sale_date:     string | null
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Compute HHI from percentage shares (0–100 scale).
 * HHI = Σ(share_pct²) — naturally gives 0–10000 range.
 */
export function computeHHI(revenueShares: number[]): number {
  if (revenueShares.length === 0) return 0
  return revenueShares.reduce((sum, s) => sum + s * s, 0)
}

/**
 * Classify HHI into concentration levels.
 * <1500 unconcentrated, 1500–2500 moderate, >2500 highly concentrated
 * (we split >2500 into concentrated and highly_concentrated at 4000)
 */
export function classifyConcentration(hhi: number): ConcentrationLevel {
  if (hhi < 1500) return 'unconcentrated'
  if (hhi < 2500) return 'moderate'
  if (hhi < 4000) return 'concentrated'
  return 'highly_concentrated'
}

/**
 * Classify a customer into a tier based on their revenue share %.
 * Tier 1 (>20%), Tier 2 (5–20%), Tier 3 (1–5%), Tier 4 (<1%)
 */
export function classifyCustomerTier(revenueSharePct: number): CustomerTier {
  if (revenueSharePct > 20) return 'tier1'
  if (revenueSharePct >= 5)  return 'tier2'
  if (revenueSharePct >= 1)  return 'tier3'
  return 'tier4'
}

/**
 * Determine the HHI trend from monthly history.
 * improving: last 3m avg HHI < prior 3m avg by >100
 * worsening: last 3m avg HHI > prior 3m avg by >100
 * stable: difference <=100
 * insufficient: <6 months of data
 */
export function computeHhiTrend(
  monthlyHhis: MonthlyHhi[],
): 'improving' | 'worsening' | 'stable' | 'insufficient' {
  if (monthlyHhis.length < 6) return 'insufficient'

  const sorted = [...monthlyHhis].sort((a, b) => a.month.localeCompare(b.month))
  const last6 = sorted.slice(-6)
  const prior3 = last6.slice(0, 3)
  const last3  = last6.slice(3)

  const avgPrior = prior3.reduce((s, m) => s + m.hhi, 0) / 3
  const avgLast  = last3.reduce((s, m)  => s + m.hhi, 0) / 3
  const diff = avgLast - avgPrior   // positive = worsening (HHI went up)

  if (diff < -100) return 'improving'
  if (diff > 100)  return 'worsening'
  return 'stable'
}

// ── Month label helper ────────────────────────────────────────────────────────

function toMonthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-')
  const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
                  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const m = parseInt(month, 10) - 1
  return `${months[m]} ${year}`
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CustomerConcentrationService {
  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
  ): Promise<CustomerConcentrationReport> {
    const now   = new Date()
    const from12 = new Date(now)
    from12.setMonth(from12.getMonth() - 12)
    const fromDate = from12.toISOString().slice(0, 10)
    const toDate   = now.toISOString().slice(0, 10)

    // Fetch sales for last 12 months
    const { data: rows, error } = await supabase
      .from('sales')
      .select('customer_id, customer_name, total:total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)

    if (error) throw new Error(error.message)

    const sales = (rows ?? []) as SaleRow[]

    // ── Aggregate by customer ────────────────────────────────────────────────
    interface CustomerAgg {
      customer_id:   string | null
      customer_name: string
      revenue_try:   number
      order_count:   number
    }

    const customerMap = new Map<string, CustomerAgg>()
    for (const s of sales) {
      const name = s.customer_name ?? 'Bilinmiyor'
      const key  = s.customer_id ?? name   // use id if present, else name
      const existing = customerMap.get(key)
      if (existing) {
        existing.revenue_try += Number(s.total ?? 0)
        existing.order_count += 1
      } else {
        customerMap.set(key, {
          customer_id:   s.customer_id,
          customer_name: name,
          revenue_try:   Number(s.total ?? 0),
          order_count:   1,
        })
      }
    }

    const customerList = Array.from(customerMap.values())
      .sort((a, b) => b.revenue_try - a.revenue_try)

    const totalRevenue = customerList.reduce((s, c) => s + c.revenue_try, 0)
    const totalCustomers = customerList.length

    if (totalCustomers === 0 || totalRevenue === 0) {
      return {
        company_id: companyId,
        period_months: 12,
        hhi: 0,
        level: 'unconcentrated',
        top1_share_pct: 0,
        top3_share_pct: 0,
        top5_share_pct: 0,
        pareto_customer_count: 0,
        total_customers: 0,
        at_risk_try: 0,
        customers: [],
        tier1_count: 0,
        tier2_count: 0,
        tier3_count: 0,
        tier4_count: 0,
        monthly_hhi: [],
        hhi_trend: 'insufficient',
        computed_at: now.toISOString(),
      }
    }

    // ── Build customer entries ───────────────────────────────────────────────
    const shares: number[] = []
    const entries: CustomerConcentrationEntry[] = []
    let cumulative = 0

    for (const c of customerList) {
      const sharePct = (c.revenue_try / totalRevenue) * 100
      cumulative += sharePct
      shares.push(sharePct)
      entries.push({
        customer_id:          c.customer_id,
        customer_name:        c.customer_name,
        revenue_try:          c.revenue_try,
        revenue_share_pct:    sharePct,
        cumulative_share_pct: cumulative,
        order_count:          c.order_count,
        tier:                 classifyCustomerTier(sharePct),
        in_pareto_80:         false,  // set below
      })
    }

    // Mark pareto 80%
    let running = 0
    let paretoCount = 0
    for (const entry of entries) {
      if (running < 80) {
        entry.in_pareto_80 = true
        paretoCount++
      }
      running += entry.revenue_share_pct
    }

    // ── Overall HHI ─────────────────────────────────────────────────────────
    const hhi   = computeHHI(shares)
    const level = classifyConcentration(hhi)

    // ── Top N shares ────────────────────────────────────────────────────────
    const top1Share = entries[0]?.revenue_share_pct ?? 0
    const top3Share = entries.slice(0, 3).reduce((s, e) => s + e.revenue_share_pct, 0)
    const top5Share = entries.slice(0, 5).reduce((s, e) => s + e.revenue_share_pct, 0)

    // ── Tier counts ─────────────────────────────────────────────────────────
    const tier1Count = entries.filter(e => e.tier === 'tier1').length
    const tier2Count = entries.filter(e => e.tier === 'tier2').length
    const tier3Count = entries.filter(e => e.tier === 'tier3').length
    const tier4Count = entries.filter(e => e.tier === 'tier4').length

    // ── Monthly HHI (last 6 months) ─────────────────────────────────────────
    // Build per-month customer revenue maps
    const monthMap = new Map<string, Map<string, number>>()
    for (const s of sales) {
      if (!s.sale_date) continue
      const month = s.sale_date.slice(0, 7)  // 'YYYY-MM'
      const key   = s.customer_id ?? (s.customer_name ?? 'Bilinmiyor')
      if (!monthMap.has(month)) monthMap.set(month, new Map())
      const mMap = monthMap.get(month)!
      mMap.set(key, (mMap.get(key) ?? 0) + Number(s.total ?? 0))
    }

    // Get last 6 months
    const monthlyHhi: MonthlyHhi[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const mMap = monthMap.get(ym)
      if (mMap) {
        const monthRev = Array.from(mMap.values()).reduce((s, v) => s + v, 0)
        const monthShares = monthRev > 0
          ? Array.from(mMap.values()).map(v => (v / monthRev) * 100)
          : []
        const mHhi = computeHHI(monthShares)
        monthlyHhi.push({
          month: ym,
          label: toMonthLabel(ym),
          hhi:   mHhi,
          level: classifyConcentration(mHhi),
        })
      }
    }

    const hhiTrend = computeHhiTrend(monthlyHhi)

    return {
      company_id:            companyId,
      period_months:         12,
      hhi,
      level,
      top1_share_pct:        top1Share,
      top3_share_pct:        top3Share,
      top5_share_pct:        top5Share,
      pareto_customer_count: paretoCount,
      total_customers:       totalCustomers,
      at_risk_try:           entries[0]?.revenue_try ?? 0,
      customers:             entries,
      tier1_count:           tier1Count,
      tier2_count:           tier2Count,
      tier3_count:           tier3Count,
      tier4_count:           tier4Count,
      monthly_hhi:           monthlyHhi,
      hhi_trend:             hhiTrend,
      computed_at:           now.toISOString(),
    }
  }
}
