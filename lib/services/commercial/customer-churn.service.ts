// ── CustomerChurnService — Rule-Based Churn Risk Prediction ───────────────────
// Scores B2B customers on churn risk using 4 behavioral signals:
//   1. Recency (days since last purchase)
//   2. Frequency decline (l90d vs p90d order count)
//   3. Revenue trend (l90d vs p90d revenue)
//   4. Payment behavior (average delay days)
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export type ChurnRiskLevel = 'critical' | 'high' | 'moderate' | 'low' | 'loyal'

export interface CustomerChurnFeatures {
  customer_key: string
  customer_name: string
  days_since_last_purchase: number
  purchase_count_l90d: number       // last 90 days
  purchase_count_p90d: number       // prior 90 days (91-180 days ago)
  avg_order_value_l90d: number
  avg_order_value_p90d: number
  payment_delay_avg_days: number    // avg days late on payments (0 = on time)
  total_revenue_l90d: number
  total_revenue_p90d: number
  months_as_customer: number        // tenure
}

export interface CustomerChurnScore {
  customer_key: string
  customer_name: string
  churn_risk_score: number          // 0-100 (100 = highest churn risk)
  churn_risk_level: ChurnRiskLevel
  key_signal: string                // Turkish: primary churn signal description
  signals: string[]                 // Turkish: all triggered signals
  estimated_revenue_at_risk_try: number   // avg monthly revenue if churns
  recommendation: string            // Turkish: retention action
}

export interface CustomerChurnReport {
  analysis_date: string   // YYYY-MM-DD
  portfolio_summary: ReturnType<typeof computeChurnPortfolioSummary>
  portfolio_health: ReturnType<typeof classifyPortfolioChurnHealth>
  customer_scores: CustomerChurnScore[]   // sorted by churn_risk_score desc
  top_at_risk: CustomerChurnScore[]       // top 5 highest risk
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id: string | null
  customer_name: string | null
  sale_date: string | null
  total: number | null
  paid_amount: number | null
  due_date: string | null
}

// ── Pure scoring functions ────────────────────────────────────────────────────

/**
 * Signal 1: Recency score (0-40 points toward churn risk)
 * 0-30 days: 0 points (recent)
 * 31-60 days: 10 points
 * 61-90 days: 25 points
 * 91-180 days: 35 points
 * 181+ days: 40 points
 */
export function scoreRecencyRisk(daysSinceLastPurchase: number): number {
  if (daysSinceLastPurchase <= 30) return 0
  if (daysSinceLastPurchase <= 60) return 10
  if (daysSinceLastPurchase <= 90) return 25
  if (daysSinceLastPurchase <= 180) return 35
  return 40
}

/**
 * Signal 2: Frequency decline risk (0-25 points)
 * If purchase_count_l90d = 0 and p90d > 0: 25 points (stopped buying)
 * If l90d < p90d * 0.5: 20 points (dropped by more than half)
 * If l90d < p90d * 0.8: 10 points (moderate decline)
 * Otherwise: 0 points
 */
export function scoreFrequencyDeclineRisk(l90d: number, p90d: number): number {
  if (l90d === 0 && p90d > 0) return 25
  if (p90d > 0 && l90d < p90d * 0.5) return 20
  if (p90d > 0 && l90d < p90d * 0.8) return 10
  return 0
}

/**
 * Signal 3: Revenue trend risk (0-20 points)
 * If total_revenue_l90d = 0 and p90d > 0: 20 points
 * If l90d < p90d * 0.5: 15 points
 * If l90d < p90d * 0.8: 7 points
 * Otherwise: 0 points
 */
export function scoreRevenueTrendRisk(revL90: number, revP90: number): number {
  if (revL90 === 0 && revP90 > 0) return 20
  if (revP90 > 0 && revL90 < revP90 * 0.5) return 15
  if (revP90 > 0 && revL90 < revP90 * 0.8) return 7
  return 0
}

/**
 * Signal 4: Payment behavior risk (0-15 points)
 * avg_delay > 30 days: 15 points
 * avg_delay > 14 days: 10 points
 * avg_delay > 7 days: 5 points
 * Otherwise: 0 points
 */
export function scorePaymentBehaviorRisk(avgDelayDays: number): number {
  if (avgDelayDays > 30) return 15
  if (avgDelayDays > 14) return 10
  if (avgDelayDays > 7) return 5
  return 0
}

/**
 * Total churn risk score (sum of 4 signals, clamped 0-100)
 */
export function computeChurnRiskScore(features: CustomerChurnFeatures): number {
  const score =
    scoreRecencyRisk(features.days_since_last_purchase) +
    scoreFrequencyDeclineRisk(features.purchase_count_l90d, features.purchase_count_p90d) +
    scoreRevenueTrendRisk(features.total_revenue_l90d, features.total_revenue_p90d) +
    scorePaymentBehaviorRisk(features.payment_delay_avg_days)
  return Math.min(100, Math.max(0, score))
}

/**
 * Classify churn risk level
 * critical: score ≥ 75
 * high: score ≥ 55
 * moderate: score ≥ 35
 * low: score ≥ 15
 * loyal: score < 15
 */
export function classifyChurnRiskLevel(score: number): ChurnRiskLevel {
  if (score >= 75) return 'critical'
  if (score >= 55) return 'high'
  if (score >= 35) return 'moderate'
  if (score >= 15) return 'low'
  return 'loyal'
}

/**
 * Generate triggered signals as Turkish strings
 */
export function generateChurnSignals(features: CustomerChurnFeatures): string[] {
  const signals: string[] = []

  // Recency signals
  if (features.days_since_last_purchase > 180) {
    signals.push(`${features.days_since_last_purchase} günden fazladır sipariş vermedi`)
  } else if (features.days_since_last_purchase > 90) {
    signals.push(`Son 90 günde sipariş yok (${features.days_since_last_purchase} gün)`)
  } else if (features.days_since_last_purchase > 60) {
    signals.push(`Son 60 günde sipariş yok (${features.days_since_last_purchase} gün)`)
  } else if (features.days_since_last_purchase > 30) {
    signals.push(`Alım temposu yavaşlıyor (son sipariş ${features.days_since_last_purchase} gün önce)`)
  }

  // Frequency signals
  if (features.purchase_count_l90d === 0 && features.purchase_count_p90d > 0) {
    signals.push('Son 90 günde hiç sipariş vermedi')
  } else if (
    features.purchase_count_p90d > 0 &&
    features.purchase_count_l90d < features.purchase_count_p90d * 0.5
  ) {
    const drop = Math.round(
      (1 - features.purchase_count_l90d / features.purchase_count_p90d) * 100,
    )
    signals.push(`Son 90 günde alım sıklığı %${drop} düştü`)
  } else if (
    features.purchase_count_p90d > 0 &&
    features.purchase_count_l90d < features.purchase_count_p90d * 0.8
  ) {
    const drop = Math.round(
      (1 - features.purchase_count_l90d / features.purchase_count_p90d) * 100,
    )
    signals.push(`Alım sıklığında %${drop} düşüş`)
  }

  // Revenue signals
  if (features.total_revenue_l90d === 0 && features.total_revenue_p90d > 0) {
    signals.push('Son 90 günde gelir sıfırlandı')
  } else if (
    features.total_revenue_p90d > 0 &&
    features.total_revenue_l90d < features.total_revenue_p90d * 0.5
  ) {
    const drop = Math.round(
      (1 - features.total_revenue_l90d / features.total_revenue_p90d) * 100,
    )
    signals.push(`Geliri geçen döneme göre %${drop} geriledi`)
  } else if (
    features.total_revenue_p90d > 0 &&
    features.total_revenue_l90d < features.total_revenue_p90d * 0.8
  ) {
    const drop = Math.round(
      (1 - features.total_revenue_l90d / features.total_revenue_p90d) * 100,
    )
    signals.push(`Gelirde %${drop} düşüş`)
  }

  // Payment signals
  if (features.payment_delay_avg_days > 30) {
    signals.push(
      `Ödemelerde ortalama ${Math.round(features.payment_delay_avg_days)} gün gecikme`,
    )
  } else if (features.payment_delay_avg_days > 14) {
    signals.push(
      `Ödemelerde ortalama ${Math.round(features.payment_delay_avg_days)} gün gecikme`,
    )
  } else if (features.payment_delay_avg_days > 7) {
    signals.push(
      `Ödemelerde ortalama ${Math.round(features.payment_delay_avg_days)} gün gecikme`,
    )
  }

  return signals
}

/**
 * Identify the key (most impactful) signal — returns Turkish string
 */
export function identifyKeySignal(features: CustomerChurnFeatures): string {
  const recencyScore = scoreRecencyRisk(features.days_since_last_purchase)
  const freqScore = scoreFrequencyDeclineRisk(
    features.purchase_count_l90d,
    features.purchase_count_p90d,
  )
  const revScore = scoreRevenueTrendRisk(features.total_revenue_l90d, features.total_revenue_p90d)
  const payScore = scorePaymentBehaviorRisk(features.payment_delay_avg_days)

  const max = Math.max(recencyScore, freqScore, revScore, payScore)

  if (max === 0) return 'Aktif ve düzenli müşteri'

  if (max === recencyScore) {
    if (features.days_since_last_purchase > 180) {
      return `${features.days_since_last_purchase} günden fazladır sipariş vermedi`
    }
    return `Son sipariş ${features.days_since_last_purchase} gün önce`
  }

  if (max === freqScore) {
    if (features.purchase_count_l90d === 0 && features.purchase_count_p90d > 0) {
      return 'Son 90 günde hiç sipariş vermedi'
    }
    if (features.purchase_count_p90d > 0) {
      const drop = Math.round(
        (1 - features.purchase_count_l90d / features.purchase_count_p90d) * 100,
      )
      return `Son 90 günde alım sıklığı %${drop} düştü`
    }
  }

  if (max === revScore) {
    if (features.total_revenue_l90d === 0 && features.total_revenue_p90d > 0) {
      return 'Son 90 günde gelir sıfırlandı'
    }
    if (features.total_revenue_p90d > 0) {
      const drop = Math.round(
        (1 - features.total_revenue_l90d / features.total_revenue_p90d) * 100,
      )
      return `Geliri geçen döneme göre %${drop} geriledi`
    }
  }

  // payment
  return `Ödemelerde ortalama ${Math.round(features.payment_delay_avg_days)} gün gecikme`
}

/**
 * Compute estimated monthly revenue at risk
 * = total_revenue_l90d / 3 — last 3 months average monthly revenue
 */
export function computeRevenueAtRisk(totalRevenueL90d: number): number {
  if (totalRevenueL90d <= 0) return 0
  return totalRevenueL90d / 3
}

/**
 * Generate Turkish retention recommendation based on risk level
 */
export function generateRetentionRecommendation(
  riskLevel: ChurnRiskLevel,
  customerName: string,
): string {
  switch (riskLevel) {
    case 'critical':
      return `${customerName} ile acil görüşme yapın. Özel indirim veya özel hizmet teklif edin.`
    case 'high':
      return `${customerName} son 90 günde sipariş vermedi. Win-back kampanyası başlatın.`
    case 'moderate':
      return `${customerName} alım sıklığı azaldı. Erken yenileme indirimi teklif edin.`
    case 'low':
      return `${customerName} satın alma temposu yavaşlıyor. Periyodik check-in yapın.`
    case 'loyal':
      return `${customerName} güçlü müşteri ilişkisi. Referans programına davet edin.`
  }
}

/**
 * Build full ChurnScore from features
 */
export function buildCustomerChurnScore(features: CustomerChurnFeatures): CustomerChurnScore {
  const churn_risk_score = computeChurnRiskScore(features)
  const churn_risk_level = classifyChurnRiskLevel(churn_risk_score)
  const signals = generateChurnSignals(features)
  const key_signal = identifyKeySignal(features)
  const estimated_revenue_at_risk_try = computeRevenueAtRisk(features.total_revenue_l90d)
  const recommendation = generateRetentionRecommendation(churn_risk_level, features.customer_name)

  return {
    customer_key: features.customer_key,
    customer_name: features.customer_name,
    churn_risk_score,
    churn_risk_level,
    key_signal,
    signals,
    estimated_revenue_at_risk_try,
    recommendation,
  }
}

/**
 * Compute portfolio-level churn risk summary
 */
export function computeChurnPortfolioSummary(scores: CustomerChurnScore[]): {
  total_customers: number
  critical_count: number
  high_count: number
  moderate_count: number
  low_count: number
  loyal_count: number
  total_revenue_at_risk_try: number
  critical_revenue_at_risk_try: number
  churn_risk_index: number
} {
  const total_customers = scores.length
  const critical_count = scores.filter(s => s.churn_risk_level === 'critical').length
  const high_count = scores.filter(s => s.churn_risk_level === 'high').length
  const moderate_count = scores.filter(s => s.churn_risk_level === 'moderate').length
  const low_count = scores.filter(s => s.churn_risk_level === 'low').length
  const loyal_count = scores.filter(s => s.churn_risk_level === 'loyal').length
  const total_revenue_at_risk_try = scores.reduce(
    (sum, s) => sum + s.estimated_revenue_at_risk_try,
    0,
  )
  const critical_revenue_at_risk_try = scores
    .filter(s => s.churn_risk_level === 'critical')
    .reduce((sum, s) => sum + s.estimated_revenue_at_risk_try, 0)

  const churn_risk_index =
    total_customers === 0
      ? 0
      : Math.min(
          100,
          (critical_count * 5 + high_count * 3 + moderate_count * 1) / total_customers,
        )

  return {
    total_customers,
    critical_count,
    high_count,
    moderate_count,
    low_count,
    loyal_count,
    total_revenue_at_risk_try,
    critical_revenue_at_risk_try,
    churn_risk_index,
  }
}

/**
 * Classify portfolio churn health
 * high_risk: churn_risk_index ≥ 40
 * elevated: churn_risk_index ≥ 20
 * manageable: churn_risk_index ≥ 10
 * healthy: < 10
 */
export function classifyPortfolioChurnHealth(
  churnRiskIndex: number,
): 'high_risk' | 'elevated' | 'manageable' | 'healthy' {
  if (churnRiskIndex >= 40) return 'high_risk'
  if (churnRiskIndex >= 20) return 'elevated'
  if (churnRiskIndex >= 10) return 'manageable'
  return 'healthy'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Derive stable customer key for deduplication. */
function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CustomerChurnService {
  constructor(private readonly supabase: SupabaseClient<any>) {}  // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<CustomerChurnReport> {
    const now = new Date()
    const analysisDate = now.toISOString().slice(0, 10)

    // Fetch sales from last 180 days
    const cutoff180 = new Date(now)
    cutoff180.setDate(cutoff180.getDate() - 180)
    const cutoff180Str = cutoff180.toISOString().slice(0, 10)

    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total, paid_amount, due_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', cutoff180Str)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CustomerChurnService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    if (rows.length === 0) {
      return buildEmptyReport(analysisDate)
    }

    // Window boundaries (days from today)
    const cutoff90 = new Date(now)
    cutoff90.setDate(cutoff90.getDate() - 90)
    const cutoff180d = new Date(now)
    cutoff180d.setDate(cutoff180d.getDate() - 180)

    // Group by customer key
    type CustomerAgg = {
      key: string
      customer_name: string
      first_sale_date: Date
      orders: Array<{ date: Date; amount: number; paid: number; due: Date | null }>
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      const date = new Date(row.sale_date)
      const amount = Number(row.total ?? 0)
      const paid = Number(row.paid_amount ?? 0)
      const due = row.due_date ? new Date(row.due_date) : null

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_name: row.customer_name ?? 'Bilinmiyor',
          first_sale_date: date,
          orders: [],
        })
      }
      const agg = aggMap.get(key)!
      if (date < agg.first_sale_date) agg.first_sale_date = date
      agg.orders.push({ date, amount, paid, due })
    }

    // Build features per customer
    const featuresList: CustomerChurnFeatures[] = []

    for (const [, agg] of aggMap) {
      const { orders } = agg
      if (orders.length === 0) continue

      const lastOrder = orders.reduce((latest, o) => (o.date > latest.date ? o : latest), orders[0])
      const daysSinceLast = Math.floor(
        (now.getTime() - lastOrder.date.getTime()) / (1000 * 60 * 60 * 24),
      )

      // l90d: last 90 days (date > cutoff90)
      const ordersL90 = orders.filter(o => o.date > cutoff90)
      // p90d: prior 90 days (cutoff180d < date <= cutoff90)
      const ordersP90 = orders.filter(o => o.date > cutoff180d && o.date <= cutoff90)

      const totalRevL90 = ordersL90.reduce((s, o) => s + o.amount, 0)
      const totalRevP90 = ordersP90.reduce((s, o) => s + o.amount, 0)

      const avgOvL90 =
        ordersL90.length > 0 ? totalRevL90 / ordersL90.length : 0
      const avgOvP90 =
        ordersP90.length > 0 ? totalRevP90 / ordersP90.length : 0

      // Payment delay: avg days late on payments
      // Late = (actual payment date approximation) vs due_date
      // Since we don't have actual payment date, use paid_amount vs total as proxy:
      // If paid >= total: 0 delay. Otherwise estimate delay from due_date or +30d from sale_date.
      // For simplicity: compare current date vs due_date for unpaid invoices.
      const paymentDelays: number[] = []
      for (const o of orders) {
        if (o.amount <= 0) continue
        const dueDate = o.due ? o.due : new Date(o.date.getTime() + 30 * 24 * 60 * 60 * 1000)
        const isPaid = o.paid >= o.amount * 0.95 // 95% threshold for "paid"
        if (isPaid) {
          // Assume paid on due date for simplicity (0 delay for paid orders)
          paymentDelays.push(0)
        } else {
          // Unpaid: calculate overdue days from due date
          const delayDays = Math.max(
            0,
            (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          )
          paymentDelays.push(delayDays)
        }
      }
      const paymentDelayAvg =
        paymentDelays.length > 0
          ? paymentDelays.reduce((s, d) => s + d, 0) / paymentDelays.length
          : 0

      const ageMs = now.getTime() - agg.first_sale_date.getTime()
      const monthsAsCustomer = Math.max(0, ageMs / (1000 * 60 * 60 * 24 * 30.44))

      featuresList.push({
        customer_key: agg.key,
        customer_name: agg.customer_name,
        days_since_last_purchase: daysSinceLast,
        purchase_count_l90d: ordersL90.length,
        purchase_count_p90d: ordersP90.length,
        avg_order_value_l90d: avgOvL90,
        avg_order_value_p90d: avgOvP90,
        payment_delay_avg_days: paymentDelayAvg,
        total_revenue_l90d: totalRevL90,
        total_revenue_p90d: totalRevP90,
        months_as_customer: monthsAsCustomer,
      })
    }

    if (featuresList.length === 0) {
      return buildEmptyReport(analysisDate)
    }

    // Build scores
    const customerScores = featuresList
      .map(f => buildCustomerChurnScore(f))
      .sort((a, b) => b.churn_risk_score - a.churn_risk_score)

    const portfolio_summary = computeChurnPortfolioSummary(customerScores)
    const portfolio_health = classifyPortfolioChurnHealth(portfolio_summary.churn_risk_index)

    return {
      analysis_date: analysisDate,
      portfolio_summary,
      portfolio_health,
      customer_scores: customerScores,
      top_at_risk: customerScores.slice(0, 5),
    }
  }
}

// ── Empty report helper ────────────────────────────────────────────────────────

function buildEmptyReport(analysisDate: string): CustomerChurnReport {
  const portfolio_summary = computeChurnPortfolioSummary([])
  return {
    analysis_date: analysisDate,
    portfolio_summary,
    portfolio_health: classifyPortfolioChurnHealth(portfolio_summary.churn_risk_index),
    customer_scores: [],
    top_at_risk: [],
  }
}
