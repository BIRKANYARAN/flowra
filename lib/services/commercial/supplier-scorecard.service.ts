// ── SupplierScorecardService — comprehensive supplier evaluation ───────────────
// Evaluates suppliers across purchase volume, payment behavior, price stability,
// relationship tenure, and dependency risk. Pure computation — no side effects
// beyond the DB query.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupplierMetrics {
  supplier_key: string             // derived key (name-based or id-based)
  supplier_name: string
  total_purchases_try: number      // total spend with this supplier
  purchase_count: number           // number of purchase orders
  avg_order_value: number          // total / count
  months_active: number            // months with at least 1 purchase
  first_purchase_month: string     // YYYY-MM
  last_purchase_month: string      // YYYY-MM
  avg_payment_delay_days: number   // avg days from purchase to payment
  on_time_payment_rate: number     // % of payments made by due date
  price_variance_pct: number       // coefficient of variation of unit prices
  purchase_concentration_pct: number  // this supplier / total purchases × 100
}

export interface SupplierScore {
  supplier_key: string
  supplier_name: string

  // 5 dimension scores (0–100 each)
  volume_score: number              // based on purchase_concentration_pct
  relationship_score: number        // based on months_active and tenure
  payment_reliability_score: number // OUR payment reliability to them
  price_stability_score: number     // 100 - (price_variance × 2), clamped
  dependency_risk_score: number     // inverse: low score = high dependency risk

  composite_score: number           // weighted average of the 5 dimensions
  supplier_tier: 'strategic' | 'preferred' | 'standard' | 'occasional' | 'at_risk'
  dependency_level: 'critical' | 'high' | 'moderate' | 'low'
}

export interface SupplierScorecardReport {
  analysis_window_months: number
  total_purchases_try: number
  portfolio_summary: ReturnType<typeof computeSupplierPortfolioSummary>
  diversification: ReturnType<typeof classifySupplierDiversification>
  suppliers: Array<SupplierMetrics & SupplierScore>
}

// ── Raw row types ─────────────────────────────────────────────────────────────

interface PurchaseRow {
  supplier_name?: string | null
  total?: number | null
  total_try?: number | null
  amount?: number | null
  purchase_date?: string | null
  created_at?: string | null
  payment_date?: string | null
  due_date?: string | null
  status?: string | null
}

interface ExpenseRow {
  vendor_name?: string | null
  description?: string | null
  amount?: number | null
  expense_date?: string | null
  created_at?: string | null
  payment_date?: string | null
  due_date?: string | null
  payment_status?: string | null
  expense_type?: string | null
}

interface PurchaseItemRow {
  supplier_name?: string | null
  unit_price?: number | null
  price?: number | null
}

// ── Pure exported scoring functions ──────────────────────────────────────────

/**
 * Compute volume score based on spend share.
 * > 30% → 50 (high volume but high dependency)
 * > 15% → 75
 * > 5%  → 90
 * ≤ 5%  → 100
 */
export function computeVolumeScore(concentrationPct: number): number {
  if (concentrationPct > 30) return 50
  if (concentrationPct > 15) return 75
  if (concentrationPct > 5)  return 90
  return 100
}

/**
 * Compute relationship score based on months active.
 * ≥ 24 months → 100
 * ≥ 12 months → 80
 * ≥ 6 months  → 60
 * ≥ 3 months  → 40
 * < 3 months  → 20
 */
export function computeRelationshipScore(monthsActive: number): number {
  if (monthsActive >= 24) return 100
  if (monthsActive >= 12) return 80
  if (monthsActive >= 6)  return 60
  if (monthsActive >= 3)  return 40
  return 20
}

/**
 * Compute payment reliability score (our payment behaviour toward them).
 * 100%    → 100
 * ≥ 90%   → 85
 * ≥ 75%   → 65
 * ≥ 50%   → 40
 * < 50%   → 20
 */
export function computePaymentReliabilityScore(onTimeRate: number): number {
  if (onTimeRate >= 100) return 100
  if (onTimeRate >= 90)  return 85
  if (onTimeRate >= 75)  return 65
  if (onTimeRate >= 50)  return 40
  return 20
}

/**
 * Compute price stability score.
 * score = 100 − (cv_pct × 2), clamped to [0, 100].
 */
export function computePriceStabilityScore(priceVariancePct: number): number {
  const raw = 100 - priceVariancePct * 2
  return Math.max(0, Math.min(100, raw))
}

/**
 * Compute dependency risk score (inverse of concentration).
 * concentration > 50% → 10  (critical dependency)
 * concentration > 30% → 30  (high dependency)
 * concentration > 15% → 60  (moderate)
 * concentration > 5%  → 80  (low)
 * ≤ 5%                → 100 (minimal)
 */
export function computeDependencyRiskScore(concentrationPct: number): number {
  if (concentrationPct > 50) return 10
  if (concentrationPct > 30) return 30
  if (concentrationPct > 15) return 60
  if (concentrationPct > 5)  return 80
  return 100
}

/**
 * Compute composite score with weights:
 *   volume 20% + relationship 25% + payment 25% + price 20% + dependency_risk 10%
 */
export function computeSupplierCompositeScore(
  volumeScore: number,
  relationshipScore: number,
  paymentReliabilityScore: number,
  priceStabilityScore: number,
  dependencyRiskScore: number,
): number {
  const raw =
    volumeScore           * 0.20 +
    relationshipScore     * 0.25 +
    paymentReliabilityScore * 0.25 +
    priceStabilityScore   * 0.20 +
    dependencyRiskScore   * 0.10
  return Math.round(raw * 100) / 100
}

/**
 * Classify supplier tier based on composite score and context.
 *
 * strategic:  composite ≥ 80 AND concentration > 15%
 * preferred:  composite ≥ 65
 * standard:   composite ≥ 45
 * occasional: composite ≥ 25 AND months_active < 6
 * at_risk:    composite < 45 OR payment_reliability_score < 40
 */
export function classifySupplierTier(
  compositeScore: number,
  concentrationPct: number,
  monthsActive: number,
  paymentReliabilityScore: number,
): SupplierScore['supplier_tier'] {
  // at_risk is checked first — it can override any other classification
  if (compositeScore < 45 || paymentReliabilityScore < 40) return 'at_risk'
  if (compositeScore >= 80 && concentrationPct > 15) return 'strategic'
  if (compositeScore >= 65) return 'preferred'
  if (compositeScore >= 45) {
    if (monthsActive < 6) return 'occasional'
    return 'standard'
  }
  // compositeScore >= 25 but not ≥ 45 (already caught by at_risk above when < 45)
  // This branch handles 25 ≤ composite < 45 with good payment — edge case
  if (compositeScore >= 25 && monthsActive < 6) return 'occasional'
  return 'standard'
}

/**
 * Classify dependency level based on concentration.
 * critical: > 50%
 * high:     > 30%
 * moderate: > 15%
 * low:      ≤ 15%
 */
export function classifyDependencyLevel(
  concentrationPct: number,
): SupplierScore['dependency_level'] {
  if (concentrationPct > 50) return 'critical'
  if (concentrationPct > 30) return 'high'
  if (concentrationPct > 15) return 'moderate'
  return 'low'
}

/**
 * Build a full SupplierScore from SupplierMetrics.
 */
export function buildSupplierScore(metrics: SupplierMetrics): SupplierScore {
  const volumeScore             = computeVolumeScore(metrics.purchase_concentration_pct)
  const relationshipScore       = computeRelationshipScore(metrics.months_active)
  const paymentReliabilityScore = computePaymentReliabilityScore(metrics.on_time_payment_rate)
  const priceStabilityScore     = computePriceStabilityScore(metrics.price_variance_pct)
  const dependencyRiskScore     = computeDependencyRiskScore(metrics.purchase_concentration_pct)

  const composite_score = computeSupplierCompositeScore(
    volumeScore,
    relationshipScore,
    paymentReliabilityScore,
    priceStabilityScore,
    dependencyRiskScore,
  )

  return {
    supplier_key: metrics.supplier_key,
    supplier_name: metrics.supplier_name,
    volume_score: volumeScore,
    relationship_score: relationshipScore,
    payment_reliability_score: paymentReliabilityScore,
    price_stability_score: priceStabilityScore,
    dependency_risk_score: dependencyRiskScore,
    composite_score,
    supplier_tier: classifySupplierTier(
      composite_score,
      metrics.purchase_concentration_pct,
      metrics.months_active,
      paymentReliabilityScore,
    ),
    dependency_level: classifyDependencyLevel(metrics.purchase_concentration_pct),
  }
}

/**
 * Compute Herfindahl-Hirschman Index of supplier concentration.
 * Each element of supplierConcentrations is a percentage (0–100).
 * Returns a value in [0, 1].
 */
export function computeSupplierHhi(supplierConcentrations: number[]): number {
  if (supplierConcentrations.length === 0) return 0
  const hhi = supplierConcentrations.reduce((sum, c) => {
    const share = c / 100
    return sum + share * share
  }, 0)
  return Math.round(hhi * 10000) / 10000
}

/**
 * Compute portfolio supplier health summary.
 */
export function computeSupplierPortfolioSummary(scores: SupplierScore[]): {
  total_suppliers: number
  strategic_count: number
  preferred_count: number
  standard_count: number
  occasional_count: number
  at_risk_count: number
  critical_dependency_count: number
  portfolio_hhi: number
  top_supplier_name: string | null
  top_supplier_concentration_pct: number | null
} {
  if (scores.length === 0) {
    return {
      total_suppliers: 0,
      strategic_count: 0,
      preferred_count: 0,
      standard_count: 0,
      occasional_count: 0,
      at_risk_count: 0,
      critical_dependency_count: 0,
      portfolio_hhi: 0,
      top_supplier_name: null,
      top_supplier_concentration_pct: null,
    }
  }

  const strategic_count          = scores.filter(s => s.supplier_tier === 'strategic').length
  const preferred_count          = scores.filter(s => s.supplier_tier === 'preferred').length
  const standard_count           = scores.filter(s => s.supplier_tier === 'standard').length
  const occasional_count         = scores.filter(s => s.supplier_tier === 'occasional').length
  const at_risk_count            = scores.filter(s => s.supplier_tier === 'at_risk').length
  const critical_dependency_count = scores.filter(s => s.dependency_level === 'critical').length

  // We need concentration data — it lives in the metrics but SupplierScore itself doesn't
  // carry it. We derive HHI from composite_score proxy by assuming scores carry dependency_level.
  // The service passes merged objects; for standalone usage with just SupplierScore we use
  // dependency_risk_score to approximate: we cannot compute HHI from SupplierScore alone.
  // The service will pass SupplierMetrics & SupplierScore merged objects; but this function
  // takes SupplierScore[]. We return 0 for HHI since concentration is not in SupplierScore.
  // Callers that need HHI should call computeSupplierHhi directly.
  const portfolio_hhi = 0

  // Top supplier is not determinable from SupplierScore alone (no concentration field).
  return {
    total_suppliers: scores.length,
    strategic_count,
    preferred_count,
    standard_count,
    occasional_count,
    at_risk_count,
    critical_dependency_count,
    portfolio_hhi,
    top_supplier_name: null,
    top_supplier_concentration_pct: null,
  }
}

/**
 * Variant that accepts merged SupplierMetrics & SupplierScore objects.
 * Provides accurate HHI and top-supplier data.
 */
export function computeSupplierPortfolioSummaryFromMerged(
  merged: Array<SupplierMetrics & SupplierScore>,
): ReturnType<typeof computeSupplierPortfolioSummary> {
  if (merged.length === 0) {
    return computeSupplierPortfolioSummary([])
  }

  const scores   = merged as SupplierScore[]
  const base     = computeSupplierPortfolioSummary(scores)

  const concentrations = merged.map(m => m.purchase_concentration_pct)
  const portfolio_hhi  = computeSupplierHhi(concentrations)

  const top = merged.reduce((best, m) =>
    m.purchase_concentration_pct > best.purchase_concentration_pct ? m : best,
  )

  return {
    ...base,
    portfolio_hhi,
    top_supplier_name: top.supplier_name,
    top_supplier_concentration_pct: top.purchase_concentration_pct,
  }
}

/**
 * Classify portfolio diversification health based on HHI.
 * concentrated: HHI > 0.5
 * moderate:     HHI > 0.25
 * diversified:  HHI ≤ 0.25
 */
export function classifySupplierDiversification(
  hhi: number,
): 'concentrated' | 'moderate' | 'diversified' {
  if (hhi > 0.5)  return 'concentrated'
  if (hhi > 0.25) return 'moderate'
  return 'diversified'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7) // YYYY-MM
}

function distinctMonths(dates: string[]): string[] {
  return [...new Set(dates.map(d => toYearMonth(d)))]
}

function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  if (mean === 0) return 0
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  const stddev = Math.sqrt(variance)
  return Math.round((stddev / mean) * 10000) / 100 // as percentage
}

function resolveAmount(row: PurchaseRow): number {
  return row.total_try ?? row.total ?? row.amount ?? 0
}

function resolveDate(row: PurchaseRow): string | null {
  return row.purchase_date ?? row.created_at ?? null
}

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '_')
}

// ── Aggregation from raw rows ─────────────────────────────────────────────────

interface AggregatedSupplier {
  supplier_key: string
  supplier_name: string
  total: number
  dates: string[]
  on_time_count: number
  late_count: number
  payment_delays: number[]
  prices: number[]
}

function aggregatePurchaseRows(
  rows: PurchaseRow[],
  acc: Map<string, AggregatedSupplier>,
): void {
  for (const row of rows) {
    const name = row.supplier_name?.trim() || null
    if (!name) continue

    const key    = normalizeKey(name)
    const amount = resolveAmount(row)
    const date   = resolveDate(row)
    if (!date) continue

    let entry = acc.get(key)
    if (!entry) {
      entry = {
        supplier_key: key,
        supplier_name: name,
        total: 0,
        dates: [],
        on_time_count: 0,
        late_count: 0,
        payment_delays: [],
        prices: [],
      }
      acc.set(key, entry)
    }

    entry.total += amount
    entry.dates.push(date)

    // Payment timing analysis
    if (row.payment_date && row.purchase_date) {
      const delay = Math.round(
        (new Date(row.payment_date).getTime() - new Date(row.purchase_date).getTime()) /
          86_400_000,
      )
      entry.payment_delays.push(Math.max(0, delay))

      if (row.due_date) {
        if (row.payment_date <= row.due_date) entry.on_time_count++
        else entry.late_count++
      }
    }
  }
}

function aggregateExpenseRows(
  rows: ExpenseRow[],
  acc: Map<string, AggregatedSupplier>,
): void {
  for (const row of rows) {
    const name = row.vendor_name?.trim() || row.description?.trim() || null
    if (!name) continue

    const key    = normalizeKey(name)
    const amount = row.amount ?? 0
    const date   = row.expense_date ?? row.created_at ?? null
    if (!date) continue

    let entry = acc.get(key)
    if (!entry) {
      entry = {
        supplier_key: key,
        supplier_name: name,
        total: 0,
        dates: [],
        on_time_count: 0,
        late_count: 0,
        payment_delays: [],
        prices: [],
      }
      acc.set(key, entry)
    }

    entry.total += amount
    entry.dates.push(date)

    // Payment timing
    if (row.payment_date && row.expense_date) {
      const delay = Math.round(
        (new Date(row.payment_date).getTime() - new Date(row.expense_date).getTime()) /
          86_400_000,
      )
      entry.payment_delays.push(Math.max(0, delay))

      if (row.due_date) {
        if (row.payment_date <= row.due_date) entry.on_time_count++
        else entry.late_count++
      }
    }
  }
}

function buildMetricsFromAggregated(
  agg: AggregatedSupplier,
  totalPurchases: number,
  priceMap: Map<string, number[]>,
): SupplierMetrics {
  const months    = distinctMonths(agg.dates)
  const sortedDates = [...agg.dates].sort()
  const firstMonth  = toYearMonth(sortedDates[0])
  const lastMonth   = toYearMonth(sortedDates[sortedDates.length - 1])

  const avgDelay =
    agg.payment_delays.length > 0
      ? Math.round(
          (agg.payment_delays.reduce((s, d) => s + d, 0) / agg.payment_delays.length) * 100,
        ) / 100
      : 0

  const totalPaymentChecks = agg.on_time_count + agg.late_count
  const onTimeRate =
    totalPaymentChecks > 0
      ? Math.round((agg.on_time_count / totalPaymentChecks) * 10000) / 100
      : 100 // assume on-time when no data

  const supplierPrices = priceMap.get(agg.supplier_key) ?? []
  const priceVariancePct = coefficientOfVariation(supplierPrices)

  const concentrationPct =
    totalPurchases > 0
      ? Math.round((agg.total / totalPurchases) * 10000) / 100
      : 0

  return {
    supplier_key: agg.supplier_key,
    supplier_name: agg.supplier_name,
    total_purchases_try: Math.round(agg.total * 100) / 100,
    purchase_count: agg.dates.length,
    avg_order_value:
      agg.dates.length > 0 ? Math.round((agg.total / agg.dates.length) * 100) / 100 : 0,
    months_active: months.length,
    first_purchase_month: firstMonth,
    last_purchase_month: lastMonth,
    avg_payment_delay_days: avgDelay,
    on_time_payment_rate: onTimeRate,
    price_variance_pct: priceVariancePct,
    purchase_concentration_pct: concentrationPct,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class SupplierScorecardService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<SupplierScorecardReport> {
    const today  = new Date().toISOString().slice(0, 10)
    const sixMonthsAgo = new Date(new Date(today).getTime() - 6 * 30 * 86_400_000)
      .toISOString()
      .slice(0, 10)

    const acc = new Map<string, AggregatedSupplier>()

    // ── 1. Try `purchases` table ──────────────────────────────────────────────
    try {
      const { data: purchaseRows, error } = await this.supabase
        .from('purchases')
        .select(
          'supplier_name, total, total_try, amount, purchase_date, created_at, payment_date, due_date, status',
        )
        .eq('company_id', companyId)
        .gte('purchase_date', sixMonthsAgo)
        .order('purchase_date', { ascending: false })

      if (!error && purchaseRows) {
        aggregatePurchaseRows(purchaseRows as PurchaseRow[], acc)
      }
    } catch {
      // table may not exist — skip
    }

    // ── 2. Try `expenses` table for supplier-type expenses ───────────────────
    try {
      const { data: expenseRows, error } = await this.supabase
        .from('expenses')
        .select(
          'vendor_name, description, amount, expense_date, created_at, payment_date, due_date, payment_status, expense_type',
        )
        .eq('company_id', companyId)
        .in('expense_type', ['materials', 'purchases', 'purchase', 'material', 'supplier'])
        .gte('expense_date', sixMonthsAgo)
        .order('expense_date', { ascending: false })

      if (!error && expenseRows) {
        aggregateExpenseRows(expenseRows as ExpenseRow[], acc)
      }
    } catch {
      // table may not exist — skip
    }

    // ── 3. Try `purchase_items` for price variance ────────────────────────────
    const priceMap = new Map<string, number[]>()
    try {
      const { data: itemRows, error } = await this.supabase
        .from('purchase_items')
        .select('supplier_name, unit_price, price')
        .eq('company_id', companyId)

      if (!error && itemRows) {
        for (const row of itemRows as PurchaseItemRow[]) {
          const name = row.supplier_name?.trim() || null
          if (!name) continue
          const key   = normalizeKey(name)
          const price = row.unit_price ?? row.price ?? null
          if (price === null) continue
          const existing = priceMap.get(key) ?? []
          existing.push(price)
          priceMap.set(key, existing)
        }
      }
    } catch {
      // table may not exist — skip
    }

    // ── 4. Build metrics and scores ───────────────────────────────────────────
    const totalPurchases = [...acc.values()].reduce((s, a) => s + a.total, 0)

    const merged: Array<SupplierMetrics & SupplierScore> = []
    for (const agg of acc.values()) {
      const metrics = buildMetricsFromAggregated(agg, totalPurchases, priceMap)
      const score   = buildSupplierScore(metrics)
      merged.push({ ...metrics, ...score })
    }

    // Sort by composite score descending
    merged.sort((a, b) => b.composite_score - a.composite_score)

    const portfolio_summary = computeSupplierPortfolioSummaryFromMerged(merged)
    const diversification   = classifySupplierDiversification(portfolio_summary.portfolio_hhi)

    return {
      analysis_window_months: 6,
      total_purchases_try: Math.round(totalPurchases * 100) / 100,
      portfolio_summary,
      diversification,
      suppliers: merged,
    }
  }
}
