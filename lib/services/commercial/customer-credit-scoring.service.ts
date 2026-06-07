// ── CustomerCreditScoringService — Behavioral Credit Scoring for B2B Customers ─
// Computes a behavioral credit score for B2B customers based on:
//   1. Payment Behavior  — on-time rate + avg days to pay (0-40 pts)
//   2. Outstanding Risk  — outstanding vs avg monthly revenue (0-20 pts)
//   3. Overdue Risk      — overdue ratio (0-20 pts)
//   4. Tenure            — days since first order (0-20 pts)
//   5. Consistency       — order frequency over time (0-20 pts)
// Total max: 120 pts.
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerCreditScore {
  customer_id: string
  customer_name: string

  // Score components
  payment_behavior_score: number    // 0-40
  outstanding_risk_score: number    // 0-20
  overdue_risk_score: number        // 0-20
  tenure_score: number              // 0-20
  consistency_score: number         // 0-20

  // Total and tier
  credit_score: number              // 0-120
  credit_tier: ReturnType<typeof classifyCreditTier>

  // Supporting metrics
  on_time_payment_rate: number | null
  avg_days_to_pay: number | null
  outstanding_balance: number
  overdue_amount: number
  overdue_ratio_pct: number | null
  avg_monthly_revenue: number | null
  days_since_first_order: number | null

  // Recommendations
  suggested_credit_limit: number
  recommendation: string
  revenue_share_pct: number | null
}

export interface CustomerCreditScoringReport {
  as_of_date: string
  customer_count: number

  customers: CustomerCreditScore[]

  // Tier distribution
  tier_counts: {
    excellent: number
    good: number
    fair: number
    poor: number
    very_poor: number
  }

  // Portfolio risk
  portfolio_risk_index: number | null
  portfolio_risk: ReturnType<typeof classifyPortfolioCreditRisk>

  // Rankings
  top_creditworthy: CustomerCreditScore[]     // top 5 by score
  high_risk_customers: CustomerCreditScore[]  // very_poor + poor tiers

  total_credit_exposure: number               // sum of suggested credit limits
  total_outstanding: number

  narrative: string
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id: string | null
  customer_name: string | null
  sale_date: string | null
  total: number | null
  paid_amount: number | null
  due_date: string | null
  payment_status: string | null
  updated_at: string | null
}

// ── Payment Behavior Scoring ──────────────────────────────────────────────────

/**
 * Compute on-time payment rate: onTimePayments / totalPaidInvoices * 100.
 * Returns null if totalPaidInvoices === 0.
 */
export function computeOnTimePaymentRate(
  onTimePayments: number,
  totalPaidInvoices: number,
): number | null {
  if (totalPaidInvoices === 0) return null
  return (onTimePayments / totalPaidInvoices) * 100
}

/**
 * Compute average days to pay (from due_date or sale_date if no due_date).
 * Negative = paid early. Positive = paid late.
 * Returns null if no paid invoices.
 */
export function computeAvgDaysToPay(
  payments: Array<{ days_to_pay: number }>,
): number | null {
  if (payments.length === 0) return null
  return payments.reduce((sum, p) => sum + p.days_to_pay, 0) / payments.length
}

/**
 * Compute payment behavior score (0-40).
 * Uses on-time rate and avg days to pay:
 * - Base: onTimeRate * 0.30 (max 30 pts from 100% on-time)
 * - Speed bonus: if avgDays < -7 (paid 7+ days early) → +10; if < 0 → +5; if < 7 → +3; else 0
 * - Penalty: if avgDays > 30 → -5; if > 60 → -10 (these reduce the score)
 * Clamped 0-40.
 * Returns 20 (neutral) if both inputs are null.
 */
export function computePaymentBehaviorScore(
  onTimeRate: number | null,
  avgDaysToPay: number | null,
): number {
  if (onTimeRate === null && avgDaysToPay === null) return 20

  const baseScore = onTimeRate !== null ? onTimeRate * 0.30 : 15 // 50% on-time neutral fallback

  let speedBonus = 0
  let penalty = 0
  if (avgDaysToPay !== null) {
    if (avgDaysToPay < -7) speedBonus = 10
    else if (avgDaysToPay < 0) speedBonus = 5
    else if (avgDaysToPay < 7) speedBonus = 3

    if (avgDaysToPay > 60) penalty = 10
    else if (avgDaysToPay > 30) penalty = 5
  }

  const score = baseScore + speedBonus - penalty
  return Math.min(40, Math.max(0, score))
}

/**
 * Score: 0-20.
 * Compute outstanding balance risk:
 * - 0 outstanding → 20 pts (no risk)
 * - outstanding < 0.5 × avg_monthly_revenue → 15 pts
 * - outstanding < 1.0 × → 10 pts
 * - outstanding < 2.0 × → 5 pts
 * - outstanding >= 2.0 × → 0 pts
 * Returns 10 if avg_monthly_revenue is 0 or null.
 */
export function computeOutstandingRiskScore(
  outstandingBalance: number,
  avgMonthlyRevenue: number | null,
): number {
  if (outstandingBalance === 0) return 20
  if (!avgMonthlyRevenue || avgMonthlyRevenue === 0) return 10

  const ratio = outstandingBalance / avgMonthlyRevenue
  if (ratio < 0.5) return 15
  if (ratio < 1.0) return 10
  if (ratio < 2.0) return 5
  return 0
}

/**
 * Compute overdue ratio: overdueAmount / totalOutstanding.
 * Returns null if totalOutstanding === 0.
 */
export function computeOverdueRatio(
  overdueAmount: number,
  totalOutstanding: number,
): number | null {
  if (totalOutstanding === 0) return null
  return overdueAmount / totalOutstanding
}

/**
 * Score: 0-20.
 * Compute overdue risk score from overdue ratio:
 * - null or 0% → 20 pts
 * - <= 10% → 16 pts
 * - <= 25% → 12 pts
 * - <= 50% → 6 pts
 * - > 50% → 0 pts
 */
export function computeOverdueRiskScore(overdueRatioPct: number | null): number {
  if (overdueRatioPct === null || overdueRatioPct === 0) return 20
  if (overdueRatioPct <= 10) return 16
  if (overdueRatioPct <= 25) return 12
  if (overdueRatioPct <= 50) return 6
  return 0
}

// ── Volume & Tenure Scoring ───────────────────────────────────────────────────

/**
 * Compute relationship tenure score (0-20).
 * daysSinceFirstOrder:
 * - >= 730 days (2yr+) → 20 pts
 * - >= 365 days (1yr+) → 15 pts
 * - >= 180 days → 10 pts
 * - >= 90 days → 5 pts
 * - < 90 days → 0 pts
 * Returns 0 if null.
 */
export function computeTenureScore(daysSinceFirstOrder: number | null): number {
  if (daysSinceFirstOrder === null) return 0
  if (daysSinceFirstOrder >= 730) return 20
  if (daysSinceFirstOrder >= 365) return 15
  if (daysSinceFirstOrder >= 180) return 10
  if (daysSinceFirstOrder >= 90) return 5
  return 0
}

/**
 * Compute order consistency score (0-20).
 * monthsWithOrders / totalMonthsInPeriod * 20, capped at 20.
 * Returns 0 if totalMonthsInPeriod === 0.
 */
export function computeOrderConsistencyScore(
  monthsWithOrders: number,
  totalMonthsInPeriod: number,
): number {
  if (totalMonthsInPeriod === 0) return 0
  return Math.min(20, (monthsWithOrders / totalMonthsInPeriod) * 20)
}

// ── Credit Score Assembly ─────────────────────────────────────────────────────

/**
 * Compute total credit score (0-120).
 * Sum of: paymentBehavior(40) + outstandingRisk(20) + overdueRisk(20) + tenure(20) + consistency(20) = 120 max
 */
export function computeCreditScore(
  paymentBehaviorScore: number,
  outstandingRiskScore: number,
  overdueRiskScore: number,
  tenureScore: number,
  consistencyScore: number,
): number {
  return (
    paymentBehaviorScore +
    outstandingRiskScore +
    overdueRiskScore +
    tenureScore +
    consistencyScore
  )
}

/**
 * Classify credit score tier.
 * 'excellent': >= 100
 * 'good': >= 80
 * 'fair': >= 60
 * 'poor': >= 40
 * 'very_poor': < 40
 * (Scale is out of 120)
 */
export function classifyCreditTier(
  score: number,
): 'excellent' | 'good' | 'fair' | 'poor' | 'very_poor' {
  if (score >= 100) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 60) return 'fair'
  if (score >= 40) return 'poor'
  return 'very_poor'
}

/**
 * Compute suggested credit limit based on score and avg monthly revenue.
 * excellent: avgMonthlyRevenue * 3.0
 * good:      avgMonthlyRevenue * 2.0
 * fair:      avgMonthlyRevenue * 1.0
 * poor:      avgMonthlyRevenue * 0.5
 * very_poor: 0 (no credit recommended)
 * Returns 0 if avgMonthlyRevenue is null or 0.
 */
export function computeSuggestedCreditLimit(
  tier: ReturnType<typeof classifyCreditTier>,
  avgMonthlyRevenue: number | null,
): number {
  if (!avgMonthlyRevenue || avgMonthlyRevenue === 0) return 0
  switch (tier) {
    case 'excellent': return avgMonthlyRevenue * 3.0
    case 'good':      return avgMonthlyRevenue * 2.0
    case 'fair':      return avgMonthlyRevenue * 1.0
    case 'poor':      return avgMonthlyRevenue * 0.5
    case 'very_poor': return 0
  }
}

/**
 * Generate Turkish credit recommendation text based on tier and flags.
 */
export function generateCreditRecommendation(
  tier: ReturnType<typeof classifyCreditTier>,
  hasOverdueBalance: boolean,
  hasHighConcentration: boolean,
): string {
  let base: string
  switch (tier) {
    case 'excellent':
      base = 'Mükemmel ödeme geçmişi — yüksek kredi limiti ve esnek vade koşulları önerilir.'
      break
    case 'good':
      base = 'İyi ödeme performansı — standart kredi limiti uygulanabilir.'
      break
    case 'fair':
      base = 'Orta düzey kredi riski — sınırlı kredi limiti ve yakın takip gereklidir.'
      break
    case 'poor':
      base = 'Yüksek kredi riski — düşük limit, ön ödeme veya teminat talep edilmeli.'
      break
    case 'very_poor':
      base = 'Çok yüksek risk — kredi açılmaması, peşin ödeme şartı uygulanması önerilir.'
      break
  }

  const warnings: string[] = []
  if (hasOverdueBalance) warnings.push('Gecikmiş bakiye mevcut.')
  if (hasHighConcentration) warnings.push('Müşteri gelir yoğunlaşması riski var.')

  return warnings.length > 0 ? `${base} Uyarı: ${warnings.join(' ')}` : base
}

// ── Portfolio Credit Risk ─────────────────────────────────────────────────────

/**
 * Compute portfolio credit risk index:
 * weighted average of (1 - normalizedScore) where weight = customer's share of total revenue.
 * normalizedScore = creditScore / 120
 * Returns null if no customers.
 */
export function computePortfolioCreditRiskIndex(
  customers: Array<{ credit_score: number; revenue_share_pct: number }>,
): number | null {
  if (customers.length === 0) return null

  const totalWeight = customers.reduce((sum, c) => sum + c.revenue_share_pct, 0)
  if (totalWeight === 0) {
    // Equal weight fallback
    const avg =
      customers.reduce((sum, c) => sum + (1 - c.credit_score / 120), 0) / customers.length
    return avg
  }

  return customers.reduce(
    (sum, c) => sum + (1 - c.credit_score / 120) * (c.revenue_share_pct / totalWeight),
    0,
  )
}

/**
 * Classify portfolio credit risk.
 * 'low': index < 0.20
 * 'moderate': index < 0.40
 * 'elevated': index < 0.60
 * 'high': index >= 0.60
 * 'no_data': null
 */
export function classifyPortfolioCreditRisk(
  index: number | null,
): 'low' | 'moderate' | 'elevated' | 'high' | 'no_data' {
  if (index === null) return 'no_data'
  if (index < 0.20) return 'low'
  if (index < 0.40) return 'moderate'
  if (index < 0.60) return 'elevated'
  return 'high'
}

/**
 * Generate Turkish portfolio credit narrative.
 */
export function generateCreditPortfolioNarrative(
  risk: ReturnType<typeof classifyPortfolioCreditRisk>,
  customerCount: number,
  excellentCount: number,
  veryPoorCount: number,
): string {
  switch (risk) {
    case 'no_data':
      return 'Kredi riski değerlendirmesi için yeterli müşteri verisi bulunamadı.'
    case 'low':
      return `Portföy kredi riski düşük — ${customerCount} müşterinin ${excellentCount} adedi mükemmel kredi notuna sahip.`
    case 'moderate':
      return `Portföy kredi riski orta düzeyde — izleme ve limit yönetimi önerilir.`
    case 'elevated':
      return `Portföy kredi riski yüksek — ${veryPoorCount} yüksek riskli müşteri için acil aksiyon gereklidir.`
    case 'high':
      return `Kritik kredi riski: Portföyde ciddi ödeme riski var — teminat ve ön ödeme politikaları gözden geçirilmeli.`
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

function customerDisplayName(row: RawSale): string {
  return row.customer_name ?? 'Bilinmiyor'
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CustomerCreditScoringService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<CustomerCreditScoringReport> {
    const now    = new Date()
    const asOf   = now.toISOString().slice(0, 10)

    const cutoff24m = new Date(now)
    cutoff24m.setMonth(cutoff24m.getMonth() - 24)
    const cutoff24mStr = cutoff24m.toISOString().slice(0, 10)

    const cutoff12m = new Date(now)
    cutoff12m.setMonth(cutoff12m.getMonth() - 12)
    const cutoff12mStr = cutoff12m.toISOString().slice(0, 10)

    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total, paid_amount, due_date, payment_status, updated_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', cutoff24mStr)
      .order('sale_date', { ascending: true })

    if (error || !data || data.length === 0) {
      return this.buildEmptyReport(asOf)
    }

    const rows = data as RawSale[]

    // ── Aggregate per customer ─────────────────────────────────────────────

    type CustomerAgg = {
      key: string
      customer_id: string
      customer_name: string
      first_sale_date: Date
      sales: Array<{
        saleDate: Date
        total: number
        paidAmount: number
        dueDate: Date | null
        updatedAt: Date | null
        isPaid: boolean
        isOverdue: boolean
        daysToPayFromDue: number | null
      }>
      monthlyRevenue: Map<string, number>   // YYYY-MM → revenue
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key  = customerKey(row)
      const date = new Date(row.sale_date)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_id: row.customer_id ?? key,
          customer_name: customerDisplayName(row),
          first_sale_date: date,
          sales: [],
          monthlyRevenue: new Map(),
        })
      }

      const agg = aggMap.get(key)!
      if (date < agg.first_sale_date) agg.first_sale_date = date

      const total      = Number(row.total ?? 0)
      const paidAmount = Number(row.paid_amount ?? 0)
      const dueDate    = row.due_date ? new Date(row.due_date) : null
      const updatedAt  = row.updated_at ? new Date(row.updated_at) : null

      // Consider a sale "paid" if paid_amount >= 95% of total or status is 'paid'
      const isPaid = paidAmount >= total * 0.95 || row.payment_status === 'paid'

      // Effective due date: use due_date or sale_date + 30 days
      const effectiveDue = dueDate ?? new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000)

      // Overdue = unpaid + effective due date is in the past
      const isOverdue = !isPaid && effectiveDue < now

      // Days to pay from due date (negative = early, positive = late)
      // Use updated_at as proxy for payment date
      let daysToPayFromDue: number | null = null
      if (isPaid && updatedAt) {
        daysToPayFromDue = Math.round(
          (updatedAt.getTime() - effectiveDue.getTime()) / (1000 * 60 * 60 * 24),
        )
      }

      agg.sales.push({
        saleDate: date,
        total,
        paidAmount,
        dueDate,
        updatedAt,
        isPaid,
        isOverdue,
        daysToPayFromDue,
      })

      // Monthly revenue (last 12 months only)
      if (date >= cutoff12m) {
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        agg.monthlyRevenue.set(monthKey, (agg.monthlyRevenue.get(monthKey) ?? 0) + total)
      }
    }

    // ── Compute total revenue for revenue_share_pct ────────────────────────

    let totalPortfolioRevenue = 0
    for (const [, agg] of aggMap) {
      for (const s of agg.sales) {
        totalPortfolioRevenue += s.total
      }
    }

    // ── Build per-customer credit scores ──────────────────────────────────

    const creditScores: CustomerCreditScore[] = []

    for (const [, agg] of aggMap) {
      const { sales } = agg
      if (sales.length === 0) continue

      // ── On-time payment rate ─────────────────────────────────────────────
      const paidSales   = sales.filter(s => s.isPaid)
      const onTimePaid  = paidSales.filter(
        s => s.daysToPayFromDue !== null && s.daysToPayFromDue <= 0,
      ).length
      const onTimeRate  = computeOnTimePaymentRate(onTimePaid, paidSales.length)

      // ── Avg days to pay (from due date) ──────────────────────────────────
      const paidWithTiming = paidSales
        .filter(s => s.daysToPayFromDue !== null)
        .map(s => ({ days_to_pay: s.daysToPayFromDue! }))
      const avgDays = computeAvgDaysToPay(paidWithTiming)

      // ── Outstanding & overdue balances ───────────────────────────────────
      const outstandingBalance = sales.reduce(
        (sum, s) => sum + Math.max(0, s.total - s.paidAmount),
        0,
      )
      const overdueAmount = sales
        .filter(s => s.isOverdue)
        .reduce((sum, s) => sum + Math.max(0, s.total - s.paidAmount), 0)

      // ── Avg monthly revenue (last 12 months) ─────────────────────────────
      const monthlyRevValues = Array.from(agg.monthlyRevenue.values())
      const totalRevenue12m  = monthlyRevValues.reduce((s, v) => s + v, 0)
      const avgMonthlyRevenue = monthlyRevValues.length > 0
        ? totalRevenue12m / 12   // spread over 12 months to avoid skew for new customers
        : null

      // ── Days since first order ───────────────────────────────────────────
      const daysSinceFirstOrder = Math.floor(
        (now.getTime() - agg.first_sale_date.getTime()) / (1000 * 60 * 60 * 24),
      )

      // ── Consistency: months with orders / 24 months ───────────────────────
      const allMonthKeys = new Set<string>()
      for (const s of sales) {
        const mk = `${s.saleDate.getFullYear()}-${String(s.saleDate.getMonth() + 1).padStart(2, '0')}`
        allMonthKeys.add(mk)
      }
      const monthsWithOrders = allMonthKeys.size
      const totalMonthsInPeriod = 24

      // ── Compute sub-scores ────────────────────────────────────────────────
      const overdueRatioPct    = computeOverdueRatio(overdueAmount, outstandingBalance)
      const overdueRatioPctPct = overdueRatioPct !== null ? overdueRatioPct * 100 : null

      const paymentBehaviorScore = computePaymentBehaviorScore(onTimeRate, avgDays)
      const outstandingRiskScore = computeOutstandingRiskScore(outstandingBalance, avgMonthlyRevenue)
      const overdueRiskScore     = computeOverdueRiskScore(overdueRatioPctPct)
      const tenureScore          = computeTenureScore(daysSinceFirstOrder)
      const consistencyScore     = computeOrderConsistencyScore(monthsWithOrders, totalMonthsInPeriod)

      const credit_score = computeCreditScore(
        paymentBehaviorScore,
        outstandingRiskScore,
        overdueRiskScore,
        tenureScore,
        consistencyScore,
      )
      const credit_tier          = classifyCreditTier(credit_score)
      const suggested_credit_limit = computeSuggestedCreditLimit(credit_tier, avgMonthlyRevenue)

      const totalCustomerRevenue = sales.reduce((s, o) => s + o.total, 0)
      const revenue_share_pct    = totalPortfolioRevenue > 0
        ? (totalCustomerRevenue / totalPortfolioRevenue) * 100
        : null

      const recommendation = generateCreditRecommendation(
        credit_tier,
        overdueAmount > 0,
        revenue_share_pct !== null && revenue_share_pct > 25,
      )

      creditScores.push({
        customer_id: agg.customer_id,
        customer_name: agg.customer_name,
        payment_behavior_score: paymentBehaviorScore,
        outstanding_risk_score: outstandingRiskScore,
        overdue_risk_score: overdueRiskScore,
        tenure_score: tenureScore,
        consistency_score: consistencyScore,
        credit_score,
        credit_tier,
        on_time_payment_rate: onTimeRate,
        avg_days_to_pay: avgDays,
        outstanding_balance: outstandingBalance,
        overdue_amount: overdueAmount,
        overdue_ratio_pct: overdueRatioPctPct,
        avg_monthly_revenue: avgMonthlyRevenue,
        days_since_first_order: daysSinceFirstOrder,
        suggested_credit_limit,
        recommendation,
        revenue_share_pct,
      })
    }

    if (creditScores.length === 0) {
      return this.buildEmptyReport(asOf)
    }

    // ── Sort by score descending ──────────────────────────────────────────

    creditScores.sort((a, b) => b.credit_score - a.credit_score)

    // ── Tier counts ───────────────────────────────────────────────────────

    const tier_counts = {
      excellent: creditScores.filter(c => c.credit_tier === 'excellent').length,
      good:      creditScores.filter(c => c.credit_tier === 'good').length,
      fair:      creditScores.filter(c => c.credit_tier === 'fair').length,
      poor:      creditScores.filter(c => c.credit_tier === 'poor').length,
      very_poor: creditScores.filter(c => c.credit_tier === 'very_poor').length,
    }

    // ── Portfolio risk ────────────────────────────────────────────────────

    const portfolioInput = creditScores.map(c => ({
      credit_score: c.credit_score,
      revenue_share_pct: c.revenue_share_pct ?? 0,
    }))

    const portfolio_risk_index = computePortfolioCreditRiskIndex(portfolioInput)
    const portfolio_risk       = classifyPortfolioCreditRisk(portfolio_risk_index)

    // ── Totals ────────────────────────────────────────────────────────────

    const total_credit_exposure = creditScores.reduce(
      (sum, c) => sum + c.suggested_credit_limit,
      0,
    )
    const total_outstanding = creditScores.reduce(
      (sum, c) => sum + c.outstanding_balance,
      0,
    )

    const narrative = generateCreditPortfolioNarrative(
      portfolio_risk,
      creditScores.length,
      tier_counts.excellent,
      tier_counts.very_poor,
    )

    return {
      as_of_date: asOf,
      customer_count: creditScores.length,
      customers: creditScores,
      tier_counts,
      portfolio_risk_index,
      portfolio_risk,
      top_creditworthy: creditScores.slice(0, 5),
      high_risk_customers: creditScores.filter(
        c => c.credit_tier === 'very_poor' || c.credit_tier === 'poor',
      ),
      total_credit_exposure,
      total_outstanding,
      narrative,
    }
  }

  private buildEmptyReport(asOf: string): CustomerCreditScoringReport {
    return {
      as_of_date: asOf,
      customer_count: 0,
      customers: [],
      tier_counts: { excellent: 0, good: 0, fair: 0, poor: 0, very_poor: 0 },
      portfolio_risk_index: null,
      portfolio_risk: classifyPortfolioCreditRisk(null),
      top_creditworthy: [],
      high_risk_customers: [],
      total_credit_exposure: 0,
      total_outstanding: 0,
      narrative: generateCreditPortfolioNarrative('no_data', 0, 0, 0),
    }
  }
}
