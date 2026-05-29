// ── RevenueConcentrationService — Revenue Concentration Risk Analysis ─────────
// Analyses how dependent a company is on a small number of revenue sources.
// Uses Herfindahl-Hirschman Index (HHI) and Pareto/top-N concentration metrics.
//
// Pure helpers are exported for unit testing without DB.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConcentrationEntity {
  entity_key: string
  entity_name: string
  revenue_try: number
  revenue_pct: number       // share of total (0-100)
  is_pareto_80: boolean     // in the Pareto 80% set
}

export interface ConcentrationAnalysis {
  dimension: 'customer' | 'product' | 'category'
  total_revenue_try: number
  entity_count: number
  top_1_pct: number          // single largest entity's share
  top_3_pct: number          // combined share of top 3
  top_5_pct: number          // combined share of top 5
  pareto_80_count: number    // how many entities make up 80% of revenue
  hhi: number                // Herfindahl-Hirschman Index (0-1)
  risk_score: number         // 0-100 (100 = most concentrated/risky)
  entities: ConcentrationEntity[]  // sorted by revenue desc
}

export interface RevenueConcentrationReport {
  analysis_period: string    // YYYY-MM

  customer_concentration: ConcentrationAnalysis
  product_concentration: ConcentrationAnalysis | null   // null if no product data

  overall_risk_level: ReturnType<typeof classifyConcentrationRisk>
  concentration_trend: ReturnType<typeof compareConcentrationTrend>
  revenue_resilience_score: number

  concentration_threats: ConcentrationEntity[]   // customers > 20% share
  safe_revenue_try: number    // revenue remaining if top customer churns
  annual_at_risk_try: number

  narrative: string           // Turkish narrative
}

// ── Raw DB rows ───────────────────────────────────────────────────────────────

interface SaleRow {
  customer_id:   string | null
  customer_name: string | null
  product_name:  string | null
  total:         number | null
  sale_date:     string | null
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Compute HHI from a list of revenue shares (as percentages 0-100).
 * HHI = Σ (share/100)² = Σ share_decimal²
 * Returns a value in 0-1 range.
 */
export function computeHhi(revenuePcts: number[]): number {
  if (revenuePcts.length === 0) return 0
  return revenuePcts.reduce((sum, pct) => {
    const decimal = pct / 100
    return sum + decimal * decimal
  }, 0)
}

/**
 * Compute concentration risk score from HHI (0-100).
 * score = min(100, HHI × 200) — amplified to make small concentrations visible.
 */
export function computeConcentrationRiskScore(hhi: number): number {
  return Math.min(100, hhi * 200)
}

/**
 * Classify concentration risk level based on HHI.
 * critical: HHI > 0.5
 * high: HHI > 0.25
 * moderate: HHI > 0.15
 * low: HHI > 0.08
 * diversified: HHI ≤ 0.08
 */
export function classifyConcentrationRisk(
  hhi: number,
): 'critical' | 'high' | 'moderate' | 'low' | 'diversified' {
  if (hhi > 0.5)  return 'critical'
  if (hhi > 0.25) return 'high'
  if (hhi > 0.15) return 'moderate'
  if (hhi > 0.08) return 'low'
  return 'diversified'
}

/**
 * Compute cumulative Pareto: how many entities are needed to reach threshold% of total revenue.
 * revenuePcts must be sorted descending.
 * Returns 0 for empty input.
 */
export function computeParetoCount(
  revenuePcts: number[],
  threshold = 80,
): number {
  if (revenuePcts.length === 0) return 0
  let cumulative = 0
  let count = 0
  for (const pct of revenuePcts) {
    cumulative += pct
    count++
    if (cumulative >= threshold) return count
  }
  return count
}

/**
 * Compute top-N combined revenue percentage.
 * If N > array length, uses the full array.
 */
export function computeTopNPct(revenuePcts: number[], n: number): number {
  return revenuePcts.slice(0, n).reduce((sum, p) => sum + p, 0)
}

/**
 * Compute customer churn revenue impact.
 * What % of revenue is at risk if top customer churns? = top_1_pct.
 */
export function computeChurnImpact(revenuePcts: number[]): number {
  if (revenuePcts.length === 0) return 0
  return revenuePcts[0]
}

/**
 * Compute revenue resilience score (inverse of concentration).
 * resilience = 100 - risk_score
 */
export function computeRevenueResilience(concentrationRiskScore: number): number {
  return 100 - concentrationRiskScore
}

/**
 * Find customers above a dangerous threshold.
 * Default threshold is 20% of revenue.
 */
export function identifyConcentrationThreats(
  entities: ConcentrationEntity[],
  thresholdPct = 20,
): ConcentrationEntity[] {
  return entities.filter(e => e.revenue_pct > thresholdPct)
}

/**
 * Build a full ConcentrationAnalysis from raw entity revenue data.
 * Entities are sorted by revenue descending.
 */
export function buildConcentrationAnalysis(
  dimension: ConcentrationAnalysis['dimension'],
  entityRevenues: Array<{ entity_key: string; entity_name: string; revenue_try: number }>,
): ConcentrationAnalysis {
  if (entityRevenues.length === 0) {
    return {
      dimension,
      total_revenue_try: 0,
      entity_count: 0,
      top_1_pct: 0,
      top_3_pct: 0,
      top_5_pct: 0,
      pareto_80_count: 0,
      hhi: 0,
      risk_score: 0,
      entities: [],
    }
  }

  const sorted = [...entityRevenues].sort((a, b) => b.revenue_try - a.revenue_try)
  const totalRevenue = sorted.reduce((s, e) => s + e.revenue_try, 0)

  const revenuePcts: number[] = totalRevenue > 0
    ? sorted.map(e => (e.revenue_try / totalRevenue) * 100)
    : sorted.map(() => 0)

  const hhi = computeHhi(revenuePcts)
  const riskScore = computeConcentrationRiskScore(hhi)
  const pareto80Count = computeParetoCount(revenuePcts, 80)

  // Build entities with pareto flag
  let cumulative = 0
  let paretoReached = false
  const entities: ConcentrationEntity[] = sorted.map((e, i) => {
    const pct = revenuePcts[i]
    const isPareto = !paretoReached
    cumulative += pct
    if (cumulative >= 80) paretoReached = true
    return {
      entity_key: e.entity_key,
      entity_name: e.entity_name,
      revenue_try: e.revenue_try,
      revenue_pct: pct,
      is_pareto_80: isPareto,
    }
  })

  return {
    dimension,
    total_revenue_try: totalRevenue,
    entity_count: sorted.length,
    top_1_pct: computeTopNPct(revenuePcts, 1),
    top_3_pct: computeTopNPct(revenuePcts, 3),
    top_5_pct: computeTopNPct(revenuePcts, 5),
    pareto_80_count: pareto80Count,
    hhi,
    risk_score: riskScore,
    entities,
  }
}

/**
 * Compare concentration risk over time.
 * improving: HHI < prior × 0.95
 * worsening: HHI > prior × 1.05
 * stable: within ±5%
 * insufficient_data: no prior data
 */
export function compareConcentrationTrend(
  currentHhi: number,
  priorHhi: number | null,
): 'improving' | 'stable' | 'worsening' | 'insufficient_data' {
  if (priorHhi === null) return 'insufficient_data'
  if (priorHhi === 0) return 'stable'
  const ratio = currentHhi / priorHhi
  if (ratio < 0.95) return 'improving'
  if (ratio > 1.05) return 'worsening'
  return 'stable'
}

/**
 * Compute "safe revenue": how much revenue would remain if top entity churns.
 * safe = total × (1 - topEntityRevenuePct / 100)
 */
export function computeSafeRevenue(
  totalRevenue: number,
  topEntityRevenuePct: number,
): number {
  return totalRevenue * (1 - topEntityRevenuePct / 100)
}

/**
 * Generate Turkish risk narrative for concentration level.
 */
export function generateConcentrationNarrative(
  riskLevel: ReturnType<typeof classifyConcentrationRisk>,
  top1Pct: number,
  top3Pct: number,
): string {
  const top1Fmt  = top1Pct.toFixed(0)
  const top3Fmt  = top3Pct.toFixed(0)
  switch (riskLevel) {
    case 'critical':
      return `Tek müşteri şirket gelirinizin %${top1Fmt}'ini oluşturuyor. Acil müşteri çeşitlendirme gerekiyor.`
    case 'high':
      return `Top 3 müşteri gelirinizin %${top3Fmt}'ini oluşturuyor. Risk dağıtımına odaklanın.`
    case 'moderate':
      return `Müşteri tabanı orta düzeyde yoğunlaşmış. Yeni müşteri edinimi önerilir.`
    case 'low':
      return `Gelir kaynakları makul düzeyde çeşitlendirilmiş.`
    case 'diversified':
      return `Sağlıklı müşteri çeşitliliği mevcut.`
  }
}

/**
 * Compute annual revenue at risk from concentration.
 * at_risk = top_entity_monthly_revenue × 12
 */
export function computeAnnualRevenueAtRisk(
  topEntityMonthlyRevenue: number,
): number {
  return topEntityMonthlyRevenue * 12
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RevenueConcentrationService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<RevenueConcentrationReport> {
    const now = new Date()
    // Analysis period = last 3 months
    const from3m = new Date(now)
    from3m.setMonth(from3m.getMonth() - 3)
    const fromDate = from3m.toISOString().slice(0, 10)
    const toDate   = now.toISOString().slice(0, 10)

    const analysisPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const { data: rows, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, product_name, total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)

    if (error) throw new Error(error.message)

    const sales = (rows ?? []) as SaleRow[]

    // ── Aggregate by customer ──────────────────────────────────────────────────
    const customerMap = new Map<string, { entity_key: string; entity_name: string; revenue_try: number }>()
    const productMap  = new Map<string, { entity_key: string; entity_name: string; revenue_try: number }>()

    for (const s of sales) {
      const rev = Number(s.total ?? 0)
      if (rev <= 0) continue

      // Customer aggregation
      const custName = s.customer_name ?? 'Bilinmiyor'
      const custKey  = s.customer_id ?? custName
      const existing = customerMap.get(custKey)
      if (existing) {
        existing.revenue_try += rev
      } else {
        customerMap.set(custKey, { entity_key: custKey, entity_name: custName, revenue_try: rev })
      }

      // Product aggregation
      if (s.product_name) {
        const prodKey  = s.product_name
        const prodEntry = productMap.get(prodKey)
        if (prodEntry) {
          prodEntry.revenue_try += rev
        } else {
          productMap.set(prodKey, { entity_key: prodKey, entity_name: s.product_name, revenue_try: rev })
        }
      }
    }

    const customerRevenues = Array.from(customerMap.values())
    const productRevenues  = Array.from(productMap.values())

    // ── Build analyses ─────────────────────────────────────────────────────────
    const customerConcentration = buildConcentrationAnalysis('customer', customerRevenues)
    const productConcentration  = productRevenues.length > 0
      ? buildConcentrationAnalysis('product', productRevenues)
      : null

    // ── Risk level & trend (single-period: no prior HHI available in this query)
    const overallRiskLevel      = classifyConcentrationRisk(customerConcentration.hhi)
    const concentrationTrend    = compareConcentrationTrend(customerConcentration.hhi, null)
    const resilienceScore       = computeRevenueResilience(customerConcentration.risk_score)

    // ── Concentration threats
    const concentrationThreats  = identifyConcentrationThreats(customerConcentration.entities, 20)

    // ── Safe revenue
    const top1Pct     = customerConcentration.top_1_pct
    const safeRevenue = computeSafeRevenue(customerConcentration.total_revenue_try, top1Pct)

    // ── Annual at risk: estimate top entity monthly revenue = total / 3 months
    const topEntityMonthlyRevenue = customerConcentration.entities.length > 0
      ? customerConcentration.entities[0].revenue_try / 3
      : 0
    const annualAtRisk = computeAnnualRevenueAtRisk(topEntityMonthlyRevenue)

    // ── Narrative
    const narrative = generateConcentrationNarrative(
      overallRiskLevel,
      top1Pct,
      customerConcentration.top_3_pct,
    )

    return {
      analysis_period:           analysisPeriod,
      customer_concentration:    customerConcentration,
      product_concentration:     productConcentration,
      overall_risk_level:        overallRiskLevel,
      concentration_trend:       concentrationTrend,
      revenue_resilience_score:  resilienceScore,
      concentration_threats:     concentrationThreats,
      safe_revenue_try:          safeRevenue,
      annual_at_risk_try:        annualAtRisk,
      narrative,
    }
  }
}
