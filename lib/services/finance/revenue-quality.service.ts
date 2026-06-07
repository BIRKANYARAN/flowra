// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/revenue-quality.service.ts
//
// Revenue Quality Score Service
//
// Scores revenue on 5 dimensions (each 0-100):
//   1. Predictability      — coefficient of variation of monthly revenues
//   2. Diversification     — reverse HHI of customer concentration
//   3. Collection Eff.     — DSO score + overdue ratio (60/40 blend)
//   4. Recurring Revenue   — ratio of recurring customers
//   5. Margin Stability    — coefficient of variation of gross margin %
//
// Composite score: 25% predictability, 20% diversification,
//                  25% collection, 15% recurring, 15% margin stability
//
// Pure functions exported for testing.
// Class: RevenueQualityService.getReport(companyId) → RevenueQualityReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueQualityReport {
  composite_score:    number
  quality_class:      ReturnType<typeof classifyRevenueQuality>
  dimensions: {
    predictability:   number
    diversification:  number
    collection:       number
    recurring:        number
    margin_stability: number
  }
  weakest_dimension:  string
  growth_quality:     ReturnType<typeof classifyGrowthQuality>
  revenue_growth_pct: number | null
  analysis_months:    number
}

// ── DIMENSION 1: Revenue Predictability ───────────────────────────────────────

/**
 * Compute coefficient of variation (stddev / mean).
 * Returns 0 if mean is 0 or array is empty.
 */
export function computeCoeffientOfVariation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  const stddev   = Math.sqrt(variance)
  return stddev / mean
}

/**
 * Compute revenue predictability score (0-100).
 * Based on coefficient of variation of monthly revenues.
 * Returns 0 if fewer than 3 months of data.
 */
export function computePredictabilityScore(monthlyRevenues: number[]): number {
  if (monthlyRevenues.length < 3) return 0
  const cv    = computeCoeffientOfVariation(monthlyRevenues)
  const score = 100 - cv * 100
  return Math.max(0, Math.min(100, score))
}

// ── DIMENSION 2: Customer Diversification ─────────────────────────────────────

/**
 * Compute Herfindahl-Hirschman Index from a revenue map.
 * HHI = Σ (share_i)² where share_i = revenue_i / total_revenue.
 * Returns 0 if total is 0.
 */
export function computeHhiFromMap(revenues: Map<string, number>): number {
  if (revenues.size === 0) return 0
  const total = Array.from(revenues.values()).reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  let hhi = 0
  for (const rev of revenues.values()) {
    const share = rev / total
    hhi += share * share
  }
  return hhi
}

/**
 * Compute customer diversification score (0-100).
 * score = 100 × (1 - HHI), clamped [0, 100].
 * Single customer → score ≈ 0; many equal customers → score ≈ 100.
 */
export function computeDiversificationScore(
  customerRevenues: Map<string, number>,
): number {
  if (customerRevenues.size === 0) return 0
  const hhi   = computeHhiFromMap(customerRevenues)
  const score = 100 * (1 - hhi)
  return Math.max(0, Math.min(100, score))
}

// ── DIMENSION 3: Collection Efficiency ────────────────────────────────────────

/**
 * Score DSO (Days Sales Outstanding):
 * 30d → 100, 60d → 50, 90d+ → 0  (linear interpolation).
 */
export function scoreDso(dso_days: number): number {
  if (dso_days <= 30) return 100
  if (dso_days >= 90) return 0
  // Linear: 30→100, 90→0  slope = -100/60
  return 100 - ((dso_days - 30) / 60) * 100
}

/**
 * Score overdue ratio:
 * 0% → 100, 100% → 0  (linear).
 */
export function scoreOverdueRatio(overdue_pct: number): number {
  const clamped = Math.max(0, Math.min(100, overdue_pct))
  return 100 - clamped
}

/**
 * Compute collection efficiency score (0-100).
 * DSO score × 0.6 + overdue score × 0.4.
 */
export function computeCollectionEfficiencyScore(
  dso_days: number,
  overdue_ratio_pct: number,
): number {
  const dsoScore     = scoreDso(dso_days)
  const overdueScore = scoreOverdueRatio(overdue_ratio_pct)
  const score        = dsoScore * 0.6 + overdueScore * 0.4
  return Math.max(0, Math.min(100, score))
}

// ── DIMENSION 4: Recurring Revenue ────────────────────────────────────────────

/**
 * Compute recurring revenue score (0-100).
 * Passes through recurring_ratio_pct directly.
 * Returns 0 if null.
 */
export function computeRecurringRevenueScore(
  recurring_ratio_pct: number | null,
): number {
  if (recurring_ratio_pct === null) return 0
  return Math.max(0, Math.min(100, recurring_ratio_pct))
}

// ── DIMENSION 5: Margin Stability ─────────────────────────────────────────────

/**
 * Compute margin stability score (0-100).
 * Based on gross margin coefficient of variation.
 * Returns 50 if fewer than 3 data points (neutral / insufficient).
 */
export function computeMarginStabilityScore(
  monthlyGrossMargins: number[],
): number {
  if (monthlyGrossMargins.length < 3) return 50
  const cv    = computeCoeffientOfVariation(monthlyGrossMargins)
  const score = 100 - cv * 100
  return Math.max(0, Math.min(100, score))
}

// ── Composite Score ────────────────────────────────────────────────────────────

/**
 * Compute composite revenue quality score (0-100).
 * Weights: predictability 25%, diversification 20%, collection 25%,
 *          recurring 15%, margin stability 15%.
 */
export function computeRevenueQualityScore(
  predictabilityScore:   number,
  diversificationScore:  number,
  collectionScore:       number,
  recurringScore:        number,
  marginStabilityScore:  number,
): number {
  const score =
    predictabilityScore  * 0.25 +
    diversificationScore * 0.20 +
    collectionScore      * 0.25 +
    recurringScore       * 0.15 +
    marginStabilityScore * 0.15
  return Math.max(0, Math.min(100, score))
}

// ── Classification ─────────────────────────────────────────────────────────────

/**
 * Classify composite revenue quality score.
 * premium ≥ 80, strong ≥ 65, moderate ≥ 50, developing ≥ 35, fragile < 35.
 */
export function classifyRevenueQuality(
  score: number,
): 'premium' | 'strong' | 'moderate' | 'developing' | 'fragile' {
  if (score >= 80) return 'premium'
  if (score >= 65) return 'strong'
  if (score >= 50) return 'moderate'
  if (score >= 35) return 'developing'
  return 'fragile'
}

/**
 * Identify the weakest dimension (lowest score).
 */
export function identifyWeakestDimension(
  dimensions: {
    predictability:   number
    diversification:  number
    collection:       number
    recurring:        number
    margin_stability: number
  },
): keyof typeof dimensions {
  let weakest: keyof typeof dimensions = 'predictability'
  let minScore = dimensions.predictability

  const keys = Object.keys(dimensions) as Array<keyof typeof dimensions>
  for (const key of keys) {
    if (dimensions[key] < minScore) {
      minScore = dimensions[key]
      weakest  = key
    }
  }
  return weakest
}

/**
 * Classify growth quality given revenue growth and quality score change.
 *
 * quality_growth: growing AND quality improving
 * growth_only:    growing but quality degrading
 * quality_only:   not growing but quality improving
 * stagnant:       neither growing nor quality improving
 * declining:      revenue declining
 */
export function classifyGrowthQuality(
  revenueGrowthPct:   number,
  qualityScoreChange: number,
): 'quality_growth' | 'growth_only' | 'quality_only' | 'stagnant' | 'declining' {
  if (revenueGrowthPct < 0)  return 'declining'
  const growing        = revenueGrowthPct > 0
  const qualityGrowing = qualityScoreChange > 0

  if (growing && qualityGrowing)  return 'quality_growth'
  if (growing && !qualityGrowing) return 'growth_only'
  if (!growing && qualityGrowing) return 'quality_only'
  return 'stagnant'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface SaleRow {
  customer_id:    string | null
  customer_name:  string | null
  sale_date:      string
  total_try:      number | null
  amount_paid:    number | null
  due_date:       string | null
  payment_status: string | null
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7)   // "YYYY-MM"
}

function nMonthsAgo(n: number): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 10)
}

/** Build a Map<YYYY-MM, totalRevenue> for predictability computation */
function buildMonthlyRevenues(rows: SaleRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const mk  = monthKey(row.sale_date)
    const rev = Number(row.total_try ?? 0)
    map.set(mk, (map.get(mk) ?? 0) + rev)
  }
  return map
}

/** Build a Map<customerId, revenue> for diversification */
function buildCustomerRevenueMap(rows: SaleRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    const key = row.customer_id ?? row.customer_name ?? 'unknown'
    const rev = Number(row.total_try ?? 0)
    map.set(key, (map.get(key) ?? 0) + rev)
  }
  return map
}

/**
 * Compute DSO: average days from sale_date to today for unpaid/partial/overdue rows.
 * Returns 30 if no outstanding rows.
 */
function computeDso(rows: SaleRow[], today: Date): number {
  const outstanding = rows.filter(r =>
    r.payment_status === 'unpaid' ||
    r.payment_status === 'partial' ||
    r.payment_status === 'overdue',
  )
  if (outstanding.length === 0) return 30   // good default: no outstanding
  let totalDays = 0
  for (const row of outstanding) {
    const saleDate  = new Date(row.sale_date)
    const days      = (today.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24)
    totalDays += days
  }
  return totalDays / outstanding.length
}

/**
 * Compute overdue ratio: overdue amount / total receivables × 100.
 * Returns 0 if no receivables.
 */
function computeOverdueRatioPct(rows: SaleRow[]): number {
  const receivables = rows.filter(r =>
    r.payment_status === 'unpaid' ||
    r.payment_status === 'partial' ||
    r.payment_status === 'overdue',
  )
  if (receivables.length === 0) return 0

  let overdueAmt    = 0
  let totalReceivable = 0
  const today = new Date()

  for (const row of receivables) {
    const total     = Number(row.total_try ?? 0)
    const paid      = Number(row.amount_paid ?? 0)
    const remaining = total - paid
    totalReceivable += remaining

    const dueDate = row.due_date ? new Date(row.due_date) : new Date(row.sale_date)
    if (dueDate < today && remaining > 0) {
      overdueAmt += remaining
    }
  }

  if (totalReceivable === 0) return 0
  return (overdueAmt / totalReceivable) * 100
}

/**
 * Identify recurring customers: those with purchases in ≥3 of 6 months.
 * Returns recurring revenue / total revenue × 100.
 */
function computeRecurringRatio(rows: SaleRow[], allMonthKeys: string[]): number {
  // Count distinct months per customer
  const customerMonths = new Map<string, Set<string>>()
  for (const row of rows) {
    const key = row.customer_id ?? row.customer_name ?? 'unknown'
    if (!customerMonths.has(key)) customerMonths.set(key, new Set())
    customerMonths.get(key)!.add(monthKey(row.sale_date))
  }

  const recurringCustomers = new Set<string>()
  for (const [cid, months] of customerMonths.entries()) {
    if (months.size >= 3) recurringCustomers.add(cid)
  }

  if (recurringCustomers.size === 0) return 0

  let recurringRev = 0
  let totalRev     = 0
  for (const row of rows) {
    const key = row.customer_id ?? row.customer_name ?? 'unknown'
    const rev = Number(row.total_try ?? 0)
    totalRev += rev
    if (recurringCustomers.has(key)) recurringRev += rev
  }

  if (totalRev === 0) return 0
  return (recurringRev / totalRev) * 100
}

/**
 * Estimate monthly gross margins.
 * COGS estimate = 40% of revenue.
 * Gross margin % = (revenue - 0.4 × revenue) / revenue × 100 = 60 for all months
 * if no expense data. In practice we use the flat 40% COGS estimate.
 */
function computeMonthlyGrossMargins(
  monthlyRevenues: Map<string, number>,
): number[] {
  const margins: number[] = []
  for (const rev of monthlyRevenues.values()) {
    if (rev === 0) continue
    const cogs = rev * 0.40
    const gm   = ((rev - cogs) / rev) * 100
    margins.push(gm)
  }
  return margins
}

// ── Main service class ────────────────────────────────────────────────────────

export class RevenueQualityService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<RevenueQualityReport> {
    const fromDate = nMonthsAgo(6)
    const today    = new Date()

    const res = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total_try, amount_paid, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .in('payment_status', ['paid', 'partial', 'pending', 'overdue', 'confirmed'])
      .order('sale_date', { ascending: true })
      .limit(5000)

    const rows: SaleRow[] = (res.data ?? []).map((r: Record<string, unknown>) => ({
      customer_id:    r.customer_id    as string | null,
      customer_name:  r.customer_name  as string | null,
      sale_date:      String(r.sale_date ?? ''),
      total_try:      r.total_try      as number | null,
      amount_paid:    r.amount_paid    as number | null,
      due_date:       r.due_date       as string | null,
      payment_status: r.payment_status as string | null,
    }))

    // Build month keys for last 6 months (sorted)
    const monthlyRevenueMap = buildMonthlyRevenues(rows)
    const sortedMonthKeys   = Array.from(monthlyRevenueMap.keys()).sort()
    const monthlyRevArr     = sortedMonthKeys.map(k => monthlyRevenueMap.get(k)!)
    const analysisMths      = sortedMonthKeys.length

    // Compute dimensions
    const predictability  = computePredictabilityScore(monthlyRevArr)
    const diversification = computeDiversificationScore(buildCustomerRevenueMap(rows))
    const dso             = computeDso(rows, today)
    const overdueRatio    = computeOverdueRatioPct(rows)
    const collection      = computeCollectionEfficiencyScore(dso, overdueRatio)
    const recurringRatio  = computeRecurringRatio(rows, sortedMonthKeys)
    const recurring       = computeRecurringRevenueScore(recurringRatio)
    const margins         = computeMonthlyGrossMargins(monthlyRevenueMap)
    const margin_stability = computeMarginStabilityScore(margins)

    const dimensions = {
      predictability,
      diversification,
      collection,
      recurring,
      margin_stability,
    }

    const composite    = computeRevenueQualityScore(
      predictability,
      diversification,
      collection,
      recurring,
      margin_stability,
    )
    const quality_class      = classifyRevenueQuality(composite)
    const weakest_dimension  = identifyWeakestDimension(dimensions)

    // Revenue growth: first vs last month in the series
    let revenue_growth_pct: number | null = null
    if (sortedMonthKeys.length >= 2) {
      const firstRev = monthlyRevenueMap.get(sortedMonthKeys[0])!
      const lastRev  = monthlyRevenueMap.get(sortedMonthKeys[sortedMonthKeys.length - 1])!
      if (firstRev > 0) {
        revenue_growth_pct = ((lastRev - firstRev) / firstRev) * 100
      }
    }

    // Growth quality: we use 0 as quality score change (no prior period stored)
    const growth_quality = classifyGrowthQuality(
      revenue_growth_pct ?? 0,
      0,   // quality score change — requires prior period data, default neutral
    )

    return {
      composite_score:   Math.round(composite * 10) / 10,
      quality_class,
      dimensions: {
        predictability:   Math.round(predictability  * 10) / 10,
        diversification:  Math.round(diversification * 10) / 10,
        collection:       Math.round(collection      * 10) / 10,
        recurring:        Math.round(recurring        * 10) / 10,
        margin_stability: Math.round(margin_stability * 10) / 10,
      },
      weakest_dimension,
      growth_quality,
      revenue_growth_pct: revenue_growth_pct !== null
        ? Math.round(revenue_growth_pct * 10) / 10
        : null,
      analysis_months:   analysisMths,
    }
  }
}
