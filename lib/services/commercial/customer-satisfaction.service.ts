// ── CustomerSatisfactionService — Relationship Health Scoring ─────────────────
// Scores B2B customer relationship health using 4 behavioral proxy signals:
//   1. Recency     — days since last order (0-25 pts)
//   2. Frequency   — orders per month rate (0-25 pts)
//   3. Payment     — on-time rate + payment speed (0-30 pts)
//   4. Growth      — order trend vs prior year (0-20 pts)
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerSatisfactionSignals {
  customer_id: string
  customer_name: string
  total_orders: number
  days_since_last_order: number
  avg_days_to_pay: number | null
  payment_on_time_rate: number        // 0-1
  order_trend: 'growing' | 'stable' | 'declining' | null
  avg_order_value: number
  total_revenue_ytd: number
  months_active: number
  dispute_count: number
}

export interface SatisfactionScore {
  customer_id: string
  customer_name: string
  relationship_health_score: number   // 0-100
  satisfaction_tier: 'excellent' | 'good' | 'neutral' | 'at_risk' | 'churning'
  signals: {
    recency_score: number    // 0-25
    frequency_score: number  // 0-25
    payment_score: number    // 0-30
    growth_score: number     // 0-20
  }
  risk_flags: string[]
  recommended_action: string
}

export interface CustomerSatisfactionReport {
  as_of_date: string
  customer_scores: SatisfactionScore[]
  portfolio_summary: ReturnType<typeof computePortfolioHealthSummary>
  portfolio_health: ReturnType<typeof classifyPortfolioHealth>
  top_customers: SatisfactionScore[]
  at_risk_customers: SatisfactionScore[]
  narrative: string
  total_customers: number
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
 * Recency score (0-25 pts)
 * <= 14 days: 25
 * <= 30 days: 20
 * <= 60 days: 15
 * <= 90 days: 10
 * <= 180 days: 5
 * > 180 days: 0
 */
export function computeRecencyScore(daysSinceLastOrder: number): number {
  if (daysSinceLastOrder <= 14) return 25
  if (daysSinceLastOrder <= 30) return 20
  if (daysSinceLastOrder <= 60) return 15
  if (daysSinceLastOrder <= 90) return 10
  if (daysSinceLastOrder <= 180) return 5
  return 0
}

/**
 * Frequency score (0-25 pts) based on orders/month rate
 * >= 4/month: 25
 * >= 2/month: 20
 * >= 1/month: 15
 * >= 0.5/month: 10
 * >= 0.25/month: 5
 * < 0.25/month: 0
 * monthsActive === 0: 0
 */
export function computeFrequencyScore(
  totalOrders: number,
  monthsActive: number,
): number {
  if (monthsActive === 0) return 0
  const rate = totalOrders / monthsActive
  if (rate >= 4) return 25
  if (rate >= 2) return 20
  if (rate >= 1) return 15
  if (rate >= 0.5) return 10
  if (rate >= 0.25) return 5
  return 0
}

/**
 * Payment score (0-30 pts)
 * onTime contribution (20 pts):
 *   rate >= 0.95 → 20, >= 0.80 → 15, >= 0.60 → 10, >= 0.40 → 5, else 0
 * speed contribution (10 pts):
 *   avgDays null → 5; <= 14 → 10; <= 30 → 8; <= 60 → 5; <= 90 → 2; > 90 → 0
 */
export function computePaymentScore(
  avgDaysToPay: number | null,
  paymentOnTimeRate: number,
): number {
  let onTime = 0
  if (paymentOnTimeRate >= 0.95) onTime = 20
  else if (paymentOnTimeRate >= 0.80) onTime = 15
  else if (paymentOnTimeRate >= 0.60) onTime = 10
  else if (paymentOnTimeRate >= 0.40) onTime = 5

  let speed = 5 // default when null
  if (avgDaysToPay !== null) {
    if (avgDaysToPay <= 14) speed = 10
    else if (avgDaysToPay <= 30) speed = 8
    else if (avgDaysToPay <= 60) speed = 5
    else if (avgDaysToPay <= 90) speed = 2
    else speed = 0
  }

  return onTime + speed
}

/**
 * Growth score (0-20 pts) from order trend
 * growing: 20
 * stable: 12
 * declining: 4
 * null: 8 (insufficient data)
 */
export function computeGrowthScore(
  orderTrend: 'growing' | 'stable' | 'declining' | null,
): number {
  if (orderTrend === 'growing') return 20
  if (orderTrend === 'stable') return 12
  if (orderTrend === 'declining') return 4
  return 8 // null = insufficient data
}

/**
 * Sum all 4 subscores (max 100)
 */
export function computeRelationshipHealthScore(signals: {
  recencyScore: number
  frequencyScore: number
  paymentScore: number
  growthScore: number
}): number {
  return (
    signals.recencyScore +
    signals.frequencyScore +
    signals.paymentScore +
    signals.growthScore
  )
}

/**
 * Classify satisfaction tier
 * excellent: >= 80
 * good: >= 60
 * neutral: >= 40
 * at_risk: >= 20
 * churning: < 20
 */
export function classifySatisfactionTier(
  score: number,
): SatisfactionScore['satisfaction_tier'] {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'neutral'
  if (score >= 20) return 'at_risk'
  return 'churning'
}

/**
 * Generate applicable Turkish risk flag strings
 */
export function generateRiskFlags(signals: CustomerSatisfactionSignals): string[] {
  const flags: string[] = []

  if (signals.days_since_last_order > 90) {
    flags.push('Son sipariş 90+ gün önce')
  }
  if (signals.payment_on_time_rate < 0.5) {
    flags.push('Ödeme gecikmesi alışkanlığı var')
  }
  if (signals.avg_days_to_pay !== null && signals.avg_days_to_pay > 60) {
    flags.push('Ortalama ödeme süresi 60+ gün')
  }
  if (signals.order_trend === 'declining') {
    flags.push('Sipariş sıklığı azalıyor')
  }
  if (signals.months_active < 3) {
    flags.push('Yeni müşteri — yeterli veri yok')
  }
  if (signals.dispute_count > 2) {
    flags.push('Birden fazla ödeme sorunu')
  }

  return flags
}

/**
 * Generate Turkish action recommendation by tier
 */
export function generateRecommendedAction(
  tier: SatisfactionScore['satisfaction_tier'],
  _signals: CustomerSatisfactionSignals,
): string {
  switch (tier) {
    case 'excellent':
      return 'Müşteri sadakat programına dahil et ve referans iste.'
    case 'good':
      return 'Ek satış fırsatlarını değerlendir.'
    case 'neutral':
      return 'Periyodik iletişim kur — ihtiyaçları dinle.'
    case 'at_risk':
      return 'Müşteriyle acil görüşme planla — kayıp önlenmeli.'
    case 'churning':
      return 'Son teşebbüs: Kişisel iletişim ve özel teklif sun.'
  }
}

/**
 * Compute order trend from year-over-year data
 * null if both === 0
 * growing: thisYear > lastYear × 1.1 (>10% growth)
 * declining: thisYear < lastYear × 0.9 (>10% decline)
 * stable: otherwise
 */
export function computeOrderTrend(
  ordersThisYear: number,
  ordersLastYear: number,
): 'growing' | 'stable' | 'declining' | null {
  if (ordersThisYear === 0 && ordersLastYear === 0) return null
  if (ordersLastYear === 0) return 'growing'
  if (ordersThisYear > ordersLastYear * 1.1) return 'growing'
  if (ordersThisYear < ordersLastYear * 0.9) return 'declining'
  return 'stable'
}

/**
 * Compute portfolio health summary from all scores
 */
export function computePortfolioHealthSummary(scores: SatisfactionScore[]): {
  avg_health_score: number | null
  excellent_count: number
  good_count: number
  neutral_count: number
  at_risk_count: number
  churning_count: number
  health_index: number
} {
  const total = scores.length
  if (total === 0) {
    return {
      avg_health_score: null,
      excellent_count: 0,
      good_count: 0,
      neutral_count: 0,
      at_risk_count: 0,
      churning_count: 0,
      health_index: 0,
    }
  }

  const excellent_count = scores.filter(s => s.satisfaction_tier === 'excellent').length
  const good_count      = scores.filter(s => s.satisfaction_tier === 'good').length
  const neutral_count   = scores.filter(s => s.satisfaction_tier === 'neutral').length
  const at_risk_count   = scores.filter(s => s.satisfaction_tier === 'at_risk').length
  const churning_count  = scores.filter(s => s.satisfaction_tier === 'churning').length

  const avg_health_score =
    scores.reduce((sum, s) => sum + s.relationship_health_score, 0) / total

  const health_index =
    (excellent_count * 5 + good_count * 3 + neutral_count * 2 + at_risk_count * 1 + churning_count * 0) /
    (total * 5)

  return {
    avg_health_score,
    excellent_count,
    good_count,
    neutral_count,
    at_risk_count,
    churning_count,
    health_index,
  }
}

/**
 * Classify overall portfolio health
 * thriving: health_index >= 0.80 AND churning_count === 0
 * healthy: health_index >= 0.65
 * mixed: health_index >= 0.50
 * concerning: health_index >= 0.30
 * critical: < 0.30 OR no customers
 */
export function classifyPortfolioHealth(
  summary: ReturnType<typeof computePortfolioHealthSummary>,
): 'thriving' | 'healthy' | 'mixed' | 'concerning' | 'critical' {
  const total =
    summary.excellent_count +
    summary.good_count +
    summary.neutral_count +
    summary.at_risk_count +
    summary.churning_count

  if (total === 0) return 'critical'
  if (summary.health_index >= 0.8 && summary.churning_count === 0) return 'thriving'
  if (summary.health_index >= 0.65) return 'healthy'
  if (summary.health_index >= 0.5) return 'mixed'
  if (summary.health_index >= 0.3) return 'concerning'
  return 'critical'
}

/**
 * Generate Turkish narrative for portfolio health level
 */
export function generateSatisfactionNarrative(
  portfolioHealth: ReturnType<typeof classifyPortfolioHealth>,
  summary: ReturnType<typeof computePortfolioHealthSummary>,
  _totalCustomers: number,
): string {
  const atRisk     = summary.at_risk_count
  const churning   = summary.churning_count
  const atRiskTotal = atRisk + churning

  switch (portfolioHealth) {
    case 'thriving':
      return 'Müşteri ilişkileri mükemmel — portföy büyümekte ve sadakat yüksek.'
    case 'healthy':
      return `Müşteri portföyü genel olarak sağlıklı — ${atRisk} müşteri takip gerektiriyor.`
    case 'mixed':
      return `Karma müşteri tablosu — ${churning} müşteri kayıp riski taşıyor.`
    case 'concerning':
      return `Müşteri kaybı riski artıyor — ${atRiskTotal} müşteri acil ilgi bekliyor.`
    case 'critical':
      return 'Kritik: Müşteri portföyü ciddi erozyon yaşıyor.'
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

export class CustomerSatisfactionService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<CustomerSatisfactionReport> {
    const now    = new Date()
    const asOf   = now.toISOString().slice(0, 10)

    const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1).toISOString().slice(0, 10)
    const lastYearEnd   = new Date(now.getFullYear() - 1, 11, 31).toISOString().slice(0, 10)
    const cutoff24m     = new Date(now)
    cutoff24m.setMonth(cutoff24m.getMonth() - 24)
    const cutoff24mStr  = cutoff24m.toISOString().slice(0, 10)

    // Fetch last 24 months of sales (for signals) and prior year for trend
    const [currentResult, priorResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('customer_id, customer_name, sale_date, total, paid_amount, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .or('is_proforma.is.null,is_proforma.eq.false')
        .gte('sale_date', cutoff24mStr)
        .order('sale_date', { ascending: true }),
      this.supabase
        .from('sales')
        .select('customer_id, customer_name, sale_date, total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .or('is_proforma.is.null,is_proforma.eq.false')
        .gte('sale_date', lastYearStart)
        .lte('sale_date', lastYearEnd),
    ])

    const rows24m: RawSale[] =
      currentResult.status === 'fulfilled' && !currentResult.value.error
        ? ((currentResult.value.data ?? []) as RawSale[])
        : []

    const priorRows: Array<{ customer_id: string | null; customer_name: string | null }> =
      priorResult.status === 'fulfilled' && !priorResult.value.error
        ? ((priorResult.value.data ?? []) as Array<{ customer_id: string | null; customer_name: string | null }>)
        : []

    if (rows24m.length === 0) {
      return this.buildEmptyReport(asOf)
    }

    // Build prior-year order count per customer key
    const priorYearOrderCount = new Map<string, number>()
    for (const row of priorRows) {
      const key = row.customer_id ? `id:${row.customer_id}` : row.customer_name ? `name:${row.customer_name}` : 'name:Bilinmiyor'
      priorYearOrderCount.set(key, (priorYearOrderCount.get(key) ?? 0) + 1)
    }

    // Aggregate per customer
    type CustomerAgg = {
      key: string
      customer_name: string
      first_sale_date: Date
      orders: Array<{
        date: Date
        amount: number
        paid: number
        due: Date | null
        isThisYear: boolean
      }>
    }

    const aggMap = new Map<string, CustomerAgg>()
    const thisYearStartDate = new Date(thisYearStart)

    for (const row of rows24m) {
      if (!row.sale_date) continue
      const key  = customerKey(row)
      const date = new Date(row.sale_date)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_name: customerDisplayName(row),
          first_sale_date: date,
          orders: [],
        })
      }

      const agg = aggMap.get(key)!
      if (date < agg.first_sale_date) agg.first_sale_date = date

      agg.orders.push({
        date,
        amount: Number(row.total ?? 0),
        paid: Number(row.paid_amount ?? 0),
        due: row.due_date ? new Date(row.due_date) : null,
        isThisYear: date >= thisYearStartDate,
      })
    }

    const satisfactionScores: SatisfactionScore[] = []

    for (const [, agg] of aggMap) {
      const { orders } = agg
      if (orders.length === 0) continue

      const lastOrder = orders.reduce((l, o) => (o.date > l.date ? o : l), orders[0])
      const daysSinceLastOrder = Math.floor(
        (now.getTime() - lastOrder.date.getTime()) / (1000 * 60 * 60 * 24),
      )

      const monthsActive = Math.max(
        0,
        (now.getTime() - agg.first_sale_date.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      )

      // YTD revenue and orders
      const ytdOrders  = orders.filter(o => o.isThisYear)
      const totalRevenueYtd = ytdOrders.reduce((s, o) => s + o.amount, 0)
      const avgOrderValue = orders.length > 0
        ? orders.reduce((s, o) => s + o.amount, 0) / orders.length
        : 0

      // This year vs last year orders
      const ordersThisYear = ytdOrders.length
      const ordersLastYear = priorYearOrderCount.get(agg.key) ?? 0
      const order_trend    = computeOrderTrend(ordersThisYear, ordersLastYear)

      // Payment signals
      let paidOnTime = 0
      let totalWithDue = 0
      const daysToPay: number[] = []
      let disputeCount = 0

      for (const o of orders) {
        if (o.amount <= 0) continue
        const dueDate = o.due ?? new Date(o.date.getTime() + 30 * 24 * 60 * 60 * 1000)

        if (o.paid >= o.amount * 0.95) {
          // Paid: estimate days-to-pay as 0 (paid on or before due)
          totalWithDue++
          paidOnTime++
          daysToPay.push(0)
        } else {
          totalWithDue++
          // Unpaid overdue
          const overdueDays = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          if (overdueDays > 0) {
            disputeCount++
            daysToPay.push(overdueDays)
          } else {
            // Not yet due — not on time yet but not late
            daysToPay.push(0)
          }
        }
      }

      const payment_on_time_rate = totalWithDue > 0 ? paidOnTime / totalWithDue : 1
      const avg_days_to_pay =
        daysToPay.length > 0
          ? daysToPay.reduce((s, d) => s + d, 0) / daysToPay.length
          : null

      const signals: CustomerSatisfactionSignals = {
        customer_id: agg.key,
        customer_name: agg.customer_name,
        total_orders: orders.length,
        days_since_last_order: daysSinceLastOrder,
        avg_days_to_pay,
        payment_on_time_rate,
        order_trend,
        avg_order_value: avgOrderValue,
        total_revenue_ytd: totalRevenueYtd,
        months_active: monthsActive,
        dispute_count: disputeCount,
      }

      const recency_score   = computeRecencyScore(daysSinceLastOrder)
      const frequency_score = computeFrequencyScore(orders.length, monthsActive)
      const payment_score   = computePaymentScore(avg_days_to_pay, payment_on_time_rate)
      const growth_score    = computeGrowthScore(order_trend)

      const relationship_health_score = computeRelationshipHealthScore({
        recencyScore:   recency_score,
        frequencyScore: frequency_score,
        paymentScore:   payment_score,
        growthScore:    growth_score,
      })

      const satisfaction_tier  = classifySatisfactionTier(relationship_health_score)
      const risk_flags         = generateRiskFlags(signals)
      const recommended_action = generateRecommendedAction(satisfaction_tier, signals)

      satisfactionScores.push({
        customer_id: agg.key,
        customer_name: agg.customer_name,
        relationship_health_score,
        satisfaction_tier,
        signals: { recency_score, frequency_score, payment_score, growth_score },
        risk_flags,
        recommended_action,
      })
    }

    if (satisfactionScores.length === 0) {
      return this.buildEmptyReport(asOf)
    }

    // Sort by score descending
    satisfactionScores.sort((a, b) => b.relationship_health_score - a.relationship_health_score)

    const portfolio_summary = computePortfolioHealthSummary(satisfactionScores)
    const portfolio_health  = classifyPortfolioHealth(portfolio_summary)
    const narrative         = generateSatisfactionNarrative(
      portfolio_health,
      portfolio_summary,
      satisfactionScores.length,
    )

    return {
      as_of_date: asOf,
      customer_scores: satisfactionScores,
      portfolio_summary,
      portfolio_health,
      top_customers: satisfactionScores.slice(0, 10),
      at_risk_customers: satisfactionScores.filter(
        s => s.satisfaction_tier === 'at_risk' || s.satisfaction_tier === 'churning',
      ),
      narrative,
      total_customers: satisfactionScores.length,
    }
  }

  private buildEmptyReport(asOf: string): CustomerSatisfactionReport {
    const portfolio_summary = computePortfolioHealthSummary([])
    const portfolio_health  = classifyPortfolioHealth(portfolio_summary)
    return {
      as_of_date: asOf,
      customer_scores: [],
      portfolio_summary,
      portfolio_health,
      top_customers: [],
      at_risk_customers: [],
      narrative: generateSatisfactionNarrative(portfolio_health, portfolio_summary, 0),
      total_customers: 0,
    }
  }
}
