// ── RiskAdjustedRevenueService — Expected Collections View ───────────────────
// Computes risk-adjusted revenue by weighting outstanding receivables by
// collection probability, separating reliable from at-risk revenue.
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface ReceivableItem {
  sale_id: string
  customer_id: string
  customer_name: string
  invoice_total: number
  paid_amount: number
  outstanding: number
  days_overdue: number               // negative = not yet due
  collection_probability: number
  risk_adjusted_value: number
  at_risk_amount: number
  payment_risk: ReturnType<typeof classifyCustomerPaymentRisk>
}

export interface CustomerRiskSummary {
  customer_id: string
  customer_name: string
  total_outstanding: number
  total_risk_adjusted: number
  total_at_risk: number
  weighted_probability: number | null
  payment_risk: ReturnType<typeof classifyCustomerPaymentRisk>
  invoice_count: number
}

export interface RiskAdjustedRevenueReport {
  as_of_date: string

  // Totals
  total_invoiced_ytd: number
  total_collected_ytd: number
  total_outstanding: number
  total_risk_adjusted: number
  total_at_risk: number

  // Quality
  revenue_quality_ratio: number | null
  revenue_quality: ReturnType<typeof classifyRevenueQuality>
  weighted_collection_probability: number | null
  effective_revenue_ytd: number
  revenue_realization_gap: number

  // Scenarios
  collection_scenarios: { best: number; base: number; worst: number }

  // Customer breakdown
  customer_summaries: CustomerRiskSummary[]    // sorted by total_outstanding desc
  top_at_risk_customers: CustomerRiskSummary[] // top 5 by at_risk_amount

  // Concentration
  receivables_concentration_pct: number | null // share of largest customer

  narrative: string
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  id: string
  customer_id: string | null
  customer_name: string | null
  total: number | null
  paid_amount: number | null
  payment_status: string | null
  due_date: string | null
  sale_date: string | null
}

// ── Collection Probability ────────────────────────────────────────────────────

/**
 * Compute collection probability based on days overdue.
 * These are expected-value probabilities for Turkish B2B:
 *   current (not yet due): 0.95
 *   overdue 1-30 days:     0.85
 *   overdue 31-60 days:    0.70
 *   overdue 61-90 days:    0.50
 *   overdue 91-180 days:   0.30
 *   overdue 181+ days:     0.10
 * daysOverdue: negative = not yet due, 0 = due today, positive = overdue
 */
export function computeCollectionProbability(daysOverdue: number): number {
  if (daysOverdue <= 0)   return 0.95
  if (daysOverdue <= 30)  return 0.85
  if (daysOverdue <= 60)  return 0.70
  if (daysOverdue <= 90)  return 0.50
  if (daysOverdue <= 180) return 0.30
  return 0.10
}

/**
 * Compute risk-adjusted value: outstandingAmount * collectionProbability.
 */
export function computeRiskAdjustedValue(
  outstandingAmount: number,
  collectionProbability: number,
): number {
  return outstandingAmount * collectionProbability
}

/**
 * Compute at-risk amount: outstandingAmount * (1 - collectionProbability).
 */
export function computeAtRiskAmount(
  outstandingAmount: number,
  collectionProbability: number,
): number {
  return outstandingAmount * (1 - collectionProbability)
}

/**
 * Compute weighted average collection probability across a portfolio.
 * Returns null if totalOutstanding === 0.
 */
export function computeWeightedCollectionProbability(
  items: Array<{ outstanding: number; collection_probability: number }>,
): number | null {
  const totalOutstanding = items.reduce((sum, i) => sum + i.outstanding, 0)
  if (totalOutstanding === 0) return null

  const weightedSum = items.reduce(
    (sum, i) => sum + i.outstanding * i.collection_probability,
    0,
  )
  return weightedSum / totalOutstanding
}

// ── Revenue Quality ───────────────────────────────────────────────────────────

/**
 * Compute revenue quality ratio: collected_revenue / total_invoiced * 100.
 * collected_revenue = sum of paid_amount
 * total_invoiced = sum of total
 * Returns null if total_invoiced === 0.
 */
export function computeRevenueQualityRatio(
  collectedRevenue: number,
  totalInvoiced: number,
): number | null {
  if (totalInvoiced === 0) return null
  return (collectedRevenue / totalInvoiced) * 100
}

/**
 * Classify revenue quality.
 * 'excellent': >= 95%
 * 'good': >= 85%
 * 'moderate': >= 70%
 * 'poor': >= 50%
 * 'critical': < 50%
 * 'insufficient_data': null
 */
export function classifyRevenueQuality(
  ratioPct: number | null,
): 'excellent' | 'good' | 'moderate' | 'poor' | 'critical' | 'insufficient_data' {
  if (ratioPct === null) return 'insufficient_data'
  if (ratioPct >= 95) return 'excellent'
  if (ratioPct >= 85) return 'good'
  if (ratioPct >= 70) return 'moderate'
  if (ratioPct >= 50) return 'poor'
  return 'critical'
}

/**
 * Compute effective revenue: collected + (outstanding × weighted_probability).
 * This is the expected total realization from all invoicing activity.
 */
export function computeEffectiveRevenue(
  collectedRevenue: number,
  outstandingRiskAdjusted: number,
): number {
  return collectedRevenue + outstandingRiskAdjusted
}

/**
 * Compute revenue realization gap: totalInvoiced - effectiveRevenue.
 * Positive = revenue that may not be realized (at risk).
 */
export function computeRevenueRealizationGap(
  totalInvoiced: number,
  effectiveRevenue: number,
): number {
  return totalInvoiced - effectiveRevenue
}

// ── Customer-Level Risk ───────────────────────────────────────────────────────

/**
 * Classify customer payment risk based on their weighted collection probability.
 * 'safe': probability >= 0.90
 * 'watch': probability >= 0.75
 * 'concerned': probability >= 0.50
 * 'at_risk': probability < 0.50
 * 'no_outstanding': outstandingBalance === 0
 */
export function classifyCustomerPaymentRisk(
  weightedProbability: number | null,
  outstandingBalance: number,
): 'safe' | 'watch' | 'concerned' | 'at_risk' | 'no_outstanding' {
  if (outstandingBalance === 0) return 'no_outstanding'
  if (weightedProbability === null) return 'no_outstanding'
  if (weightedProbability >= 0.90) return 'safe'
  if (weightedProbability >= 0.75) return 'watch'
  if (weightedProbability >= 0.50) return 'concerned'
  return 'at_risk'
}

/**
 * Compute customer concentration risk in receivables.
 * Returns the share of total outstanding held by the single largest customer.
 * Returns null if totalOutstanding === 0.
 */
export function computeReceivablesConcentration(
  customers: Array<{ outstanding: number }>,
): number | null {
  const totalOutstanding = customers.reduce((sum, c) => sum + c.outstanding, 0)
  if (totalOutstanding === 0) return null

  const maxOutstanding = Math.max(...customers.map(c => c.outstanding))
  return maxOutstanding / totalOutstanding
}

// ── Scenario Analysis ─────────────────────────────────────────────────────────

/**
 * Compute revenue scenarios (best/base/worst) from outstanding receivables.
 * base: weighted probabilities as-is
 * best: all probabilities capped at min(prob × 1.15, 0.99)
 * worst: all probabilities = max(prob × 0.75, 0.05)
 */
export function computeCollectionScenarios(
  items: Array<{ outstanding: number; collection_probability: number }>,
): { best: number; base: number; worst: number } {
  const base = items.reduce(
    (sum, i) => sum + i.outstanding * i.collection_probability,
    0,
  )
  const best = items.reduce(
    (sum, i) => sum + i.outstanding * Math.min(i.collection_probability * 1.15, 0.99),
    0,
  )
  const worst = items.reduce(
    (sum, i) => sum + i.outstanding * Math.max(i.collection_probability * 0.75, 0.05),
    0,
  )
  return { best, base, worst }
}

/**
 * Generate Turkish risk-adjusted revenue narrative.
 */
export function generateRarNarrative(
  quality: ReturnType<typeof classifyRevenueQuality>,
  effectiveRevenue: number,
  revenueRealizationGap: number,
  atRiskTotal: number,
): string {
  const fmt = (n: number) =>
    new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n)

  switch (quality) {
    case 'excellent':
      return `Gelir kalitesi mükemmel — tahsilat oranı %95 ve üzerinde. Etkin gelir ₺${fmt(effectiveRevenue)}, gerçekleşme açığı ₺${fmt(revenueRealizationGap)}.`
    case 'good':
      return `Gelir kalitesi iyi — tahsilat oranı %85-95 arasında. Risk altındaki alacak ₺${fmt(atRiskTotal)}, gerçekleşme açığı ₺${fmt(revenueRealizationGap)}.`
    case 'moderate':
      return `Gelir kalitesi orta — tahsilat oranı %70-85 arasında. Risk altındaki tutar ₺${fmt(atRiskTotal)} izlenmeli.`
    case 'poor':
      return `Gelir kalitesi zayıf — tahsilat oranı %50-70 arasında. ₺${fmt(atRiskTotal)} tutarında alacak tahsilat riski taşıyor; acil aksiyon alınmalı.`
    case 'critical':
      return `KRİTİK: Tahsilat oranı %50'nin altında. ₺${fmt(atRiskTotal)} risk altında — alacak yönetimini acilen gözden geçirin.`
    case 'insufficient_data':
      return 'Yeterli fatura verisi yok — risk düzeltmeli gelir hesaplanamadı.'
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildCustomerSummaries(items: ReceivableItem[]): CustomerRiskSummary[] {
  const map = new Map<string, CustomerRiskSummary & { _items: ReceivableItem[] }>()

  for (const item of items) {
    const key = item.customer_id
    if (!map.has(key)) {
      map.set(key, {
        customer_id: item.customer_id,
        customer_name: item.customer_name,
        total_outstanding: 0,
        total_risk_adjusted: 0,
        total_at_risk: 0,
        weighted_probability: null,
        payment_risk: 'no_outstanding',
        invoice_count: 0,
        _items: [],
      })
    }
    const entry = map.get(key)!
    entry.total_outstanding  += item.outstanding
    entry.total_risk_adjusted += item.risk_adjusted_value
    entry.total_at_risk       += item.at_risk_amount
    entry.invoice_count++
    entry._items.push(item)
  }

  const summaries: CustomerRiskSummary[] = []
  for (const [, entry] of map) {
    const { _items, ...rest } = entry
    const wp = computeWeightedCollectionProbability(_items)
    rest.weighted_probability = wp
    rest.payment_risk = classifyCustomerPaymentRisk(wp, rest.total_outstanding)
    summaries.push(rest)
  }

  summaries.sort((a, b) => b.total_outstanding - a.total_outstanding)
  return summaries
}

// ── Service class ─────────────────────────────────────────────────────────────

export class RiskAdjustedRevenueService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<RiskAdjustedRevenueReport> {
    const now   = new Date()
    const asOf  = now.toISOString().slice(0, 10)
    const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)

    const { data, error } = await this.supabase
      .from('sales')
      .select('id, customer_id, customer_name, total, paid_amount, payment_status, due_date, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', ytdStart)
      .lte('sale_date', asOf)
      .order('sale_date', { ascending: true })

    if (error || !data || data.length === 0) {
      return this.buildEmptyReport(asOf)
    }

    const rows = data as RawSale[]
    const nowMs = now.getTime()

    const receivableItems: ReceivableItem[] = []
    let totalInvoicedYtd  = 0
    let totalCollectedYtd = 0

    for (const row of rows) {
      const total      = Number(row.total ?? 0)
      const paid       = Number(row.paid_amount ?? 0)
      const outstanding = Math.max(0, total - paid)

      totalInvoicedYtd  += total
      totalCollectedYtd += paid

      if (outstanding <= 0) continue // fully paid — no receivable

      // Fallback: sale_date + 30 days if no due_date
      let dueMs: number
      if (row.due_date) {
        dueMs = new Date(row.due_date).getTime()
      } else if (row.sale_date) {
        dueMs = new Date(row.sale_date).getTime() + 30 * 24 * 60 * 60 * 1000
      } else {
        dueMs = nowMs // treat as due today if no date info
      }

      const daysOverdue = Math.round((nowMs - dueMs) / (1000 * 60 * 60 * 24))

      const collectionProbability = computeCollectionProbability(daysOverdue)
      const riskAdjustedValue     = computeRiskAdjustedValue(outstanding, collectionProbability)
      const atRiskAmount          = computeAtRiskAmount(outstanding, collectionProbability)

      const customerId   = row.customer_id ?? row.customer_name ?? 'bilinmiyor'
      const customerName = row.customer_name ?? 'Bilinmiyor'

      receivableItems.push({
        sale_id: row.id,
        customer_id: customerId,
        customer_name: customerName,
        invoice_total: total,
        paid_amount: paid,
        outstanding,
        days_overdue: daysOverdue,
        collection_probability: collectionProbability,
        risk_adjusted_value: riskAdjustedValue,
        at_risk_amount: atRiskAmount,
        payment_risk: classifyCustomerPaymentRisk(collectionProbability, outstanding),
      })
    }

    const totalOutstanding   = receivableItems.reduce((s, i) => s + i.outstanding, 0)
    const totalRiskAdjusted  = receivableItems.reduce((s, i) => s + i.risk_adjusted_value, 0)
    const totalAtRisk        = receivableItems.reduce((s, i) => s + i.at_risk_amount, 0)

    const weightedCollectionProbability = computeWeightedCollectionProbability(receivableItems)
    const revenueQualityRatio           = computeRevenueQualityRatio(totalCollectedYtd, totalInvoicedYtd)
    const revenueQuality                = classifyRevenueQuality(revenueQualityRatio)
    const effectiveRevenueYtd           = computeEffectiveRevenue(totalCollectedYtd, totalRiskAdjusted)
    const revenueRealizationGap         = computeRevenueRealizationGap(totalInvoicedYtd, effectiveRevenueYtd)
    const collectionScenarios           = computeCollectionScenarios(receivableItems)

    const customerSummaries   = buildCustomerSummaries(receivableItems)
    const topAtRiskCustomers  = [...customerSummaries]
      .sort((a, b) => b.total_at_risk - a.total_at_risk)
      .slice(0, 5)

    const receivablesConcentrationPct = computeReceivablesConcentration(
      customerSummaries.map(c => ({ outstanding: c.total_outstanding })),
    )

    const narrative = generateRarNarrative(
      revenueQuality,
      effectiveRevenueYtd,
      revenueRealizationGap,
      totalAtRisk,
    )

    return {
      as_of_date: asOf,
      total_invoiced_ytd:     totalInvoicedYtd,
      total_collected_ytd:    totalCollectedYtd,
      total_outstanding:      totalOutstanding,
      total_risk_adjusted:    totalRiskAdjusted,
      total_at_risk:          totalAtRisk,
      revenue_quality_ratio:  revenueQualityRatio,
      revenue_quality:        revenueQuality,
      weighted_collection_probability: weightedCollectionProbability,
      effective_revenue_ytd:  effectiveRevenueYtd,
      revenue_realization_gap: revenueRealizationGap,
      collection_scenarios:   collectionScenarios,
      customer_summaries:     customerSummaries,
      top_at_risk_customers:  topAtRiskCustomers,
      receivables_concentration_pct: receivablesConcentrationPct,
      narrative,
    }
  }

  private buildEmptyReport(asOf: string): RiskAdjustedRevenueReport {
    const revenueQuality = classifyRevenueQuality(null)
    const narrative      = generateRarNarrative(revenueQuality, 0, 0, 0)
    return {
      as_of_date: asOf,
      total_invoiced_ytd:             0,
      total_collected_ytd:            0,
      total_outstanding:              0,
      total_risk_adjusted:            0,
      total_at_risk:                  0,
      revenue_quality_ratio:          null,
      revenue_quality:                revenueQuality,
      weighted_collection_probability: null,
      effective_revenue_ytd:          0,
      revenue_realization_gap:        0,
      collection_scenarios:           { best: 0, base: 0, worst: 0 },
      customer_summaries:             [],
      top_at_risk_customers:          [],
      receivables_concentration_pct:  null,
      narrative,
    }
  }
}
