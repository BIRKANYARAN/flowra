// ── ConcentrationRiskService — Customer Concentration / HHI ──────────────────
// Measures revenue concentration risk using the Herfindahl-Hirschman Index.
// HHI = Σ(share²)  —  0-1 scale (not 0-10000).
// < 0.15 = low, 0.15-0.25 = moderate, >0.25 = high.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomerConcentration {
  customer_name:    string
  revenue_try:      number
  revenue_share_pct: number      // 0-100
  hhi_contribution: number       // share² (as 0-1 fraction)
  risk_label: 'dominant' | 'major' | 'significant' | 'minor'
  // dominant: >40%, major: 20-40%, significant: 10-20%, minor: <10%
}

export interface ConcentrationRiskReport {
  period_from: string
  period_to:   string

  hhi:        number                  // 0-1 scale
  hhi_status: 'low' | 'moderate' | 'high'

  total_revenue_try: number
  customer_count:    number
  top_3_share_pct:   number           // top 3 customers combined share

  customers: CustomerConcentration[]  // sorted by revenue_share desc

  // Risk flags
  has_dominant_customer: boolean      // any customer > 40%
  top_customer_share_pct: number
  top_customer_name: string | null

  computed_at: string
}

// ── Raw DB row ─────────────────────────────────────────────────────────────────

interface SaleRow {
  customer_name: string | null
  total_try:     number | null
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ConcentrationRiskService {
  // ── Pure functions (testable without DB) ───────────────────────────────────

  /** HHI = Σ(share²) for shares given as 0-1 fractions. */
  static computeHHI(shares: number[]): number {
    if (shares.length === 0) return 0
    return shares.reduce((sum, s) => sum + s * s, 0)
  }

  static getHhhStatus(hhi: number): 'low' | 'moderate' | 'high' {
    if (hhi < 0.15)  return 'low'
    if (hhi <= 0.25) return 'moderate'
    return 'high'
  }

  static getRiskLabel(sharePct: number): CustomerConcentration['risk_label'] {
    if (sharePct > 40) return 'dominant'
    if (sharePct > 20) return 'major'
    if (sharePct > 10) return 'significant'
    return 'minor'
  }

  // ── Main query ────────────────────────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    period: { from: string; to: string },
  ): Promise<ConcentrationRiskReport> {
    const { data, error } = await supabase
      .from('sales')
      .select('customer_name, total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', period.from)
      .lte('sale_date', period.to)

    if (error) throw new Error(`ConcentrationRiskService: ${error.message}`)

    const rows = (data ?? []) as SaleRow[]

    // Aggregate by customer
    const map = new Map<string, number>()
    for (const row of rows) {
      const name = row.customer_name?.trim() || 'Bilinmiyor'
      map.set(name, (map.get(name) ?? 0) + Number(row.total_try ?? 0))
    }

    const totalRevenue = Array.from(map.values()).reduce((s, v) => s + v, 0)

    // Build sorted list
    const sorted = Array.from(map.entries())
      .map(([name, rev]) => ({ name, rev }))
      .sort((a, b) => b.rev - a.rev)

    const customers: CustomerConcentration[] = sorted.map(({ name, rev }) => {
      const shareFraction = totalRevenue > 0 ? rev / totalRevenue : 0
      const sharePct      = shareFraction * 100
      return {
        customer_name:     name,
        revenue_try:       rev,
        revenue_share_pct: Math.round(sharePct * 100) / 100,
        hhi_contribution:  shareFraction * shareFraction,
        risk_label:        ConcentrationRiskService.getRiskLabel(sharePct),
      }
    })

    const shares = customers.map(c => c.revenue_share_pct / 100)
    const hhi    = ConcentrationRiskService.computeHHI(shares)

    const top3SharePct = customers
      .slice(0, 3)
      .reduce((s, c) => s + c.revenue_share_pct, 0)

    const topCustomer = customers[0] ?? null

    return {
      period_from:     period.from,
      period_to:       period.to,

      hhi:        Math.round(hhi * 10000) / 10000,
      hhi_status: ConcentrationRiskService.getHhhStatus(hhi),

      total_revenue_try: totalRevenue,
      customer_count:    customers.length,
      top_3_share_pct:   Math.round(top3SharePct * 100) / 100,

      customers,

      has_dominant_customer: topCustomer !== null && topCustomer.revenue_share_pct > 40,
      top_customer_share_pct: topCustomer?.revenue_share_pct ?? 0,
      top_customer_name:      topCustomer?.customer_name ?? null,

      computed_at: new Date().toISOString(),
    }
  }
}
