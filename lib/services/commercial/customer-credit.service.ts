// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/customer-credit.service.ts
//
// Customer Credit Scoring — combines payment behavior, order history,
// relationship age, and overdue patterns into a 0-100 score with
// A-F grading and credit limit recommendations.
//
// Score weights:
//   40% payment history
//   30% order consistency
//   20% relationship age
//   10% volume (normalized: 0→0, 50K→50, 200K+→100)
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface CustomerCreditProfile {
  customer_name: string
  total_orders: number
  total_revenue_try: number
  avg_order_value_try: number
  relationship_days: number
  orders_per_month: number

  payment_history_score: number
  order_consistency_score: number
  relationship_score: number
  volume_score: number

  credit_score: number
  credit_grade: 'A' | 'B' | 'C' | 'D' | 'F'
  recommended_limit_try: number

  current_outstanding_try: number
  outstanding_vs_limit_pct: number | null

  late_30_count: number
  late_60_count: number
  late_90plus_count: number
  on_time_count: number
}

export interface CustomerCreditReport {
  total_customers: number
  grade_distribution: Record<'A' | 'B' | 'C' | 'D' | 'F', number>
  avg_credit_score: number
  high_risk_customers: CustomerCreditProfile[]
  all_customers: CustomerCreditProfile[]
  total_recommended_limits_try: number
  total_current_outstanding_try: number
}

// ── Pure scoring functions ─────────────────────────────────────────────────────

/**
 * Compute payment history score (0-100).
 * Mirrors payment-behavior.service reliability logic:
 *   Start: 100
 *   −5  per late 30 payment
 *   −10 per late 60 payment
 *   −20 per late 90+ payment
 *   +5  per on-time payment, max +25 bonus
 *   Clamped to [0, 100]
 */
export function computePaymentHistoryScore(
  onTimeCount: number,
  late30Count: number,
  late60Count: number,
  late90PlusCount: number,
): number {
  const total = onTimeCount + late30Count + late60Count + late90PlusCount
  if (total === 0) return 100

  let score = 100
  score -= late30Count * 5
  score -= late60Count * 10
  score -= late90PlusCount * 20
  score += Math.min(onTimeCount * 5, 25)

  return Math.max(0, Math.min(100, score))
}

/**
 * Compute relationship score (0-100).
 * Based on relationship age in days:
 *   <90d   → 20
 *   90-180d → 40
 *   180-365d → 60
 *   365-730d → 80
 *   >730d  → 100
 */
export function computeRelationshipScore(relationshipDays: number): number {
  if (relationshipDays < 90)   return 20
  if (relationshipDays < 180)  return 40
  if (relationshipDays < 365)  return 60
  if (relationshipDays < 730)  return 80
  return 100
}

/**
 * Compute order consistency score (0-100).
 * Based on orders per month:
 *   0    → 0
 *   0.5  → 30
 *   1    → 60
 *   2    → 80
 *   3+   → 100
 * Linearly interpolated between breakpoints.
 */
export function computeOrderConsistencyScore(ordersPerMonth: number): number {
  if (ordersPerMonth <= 0)    return 0
  if (ordersPerMonth >= 3)    return 100

  // Breakpoints: [opm, score]
  const breakpoints: Array<[number, number]> = [
    [0,   0],
    [0.5, 30],
    [1,   60],
    [2,   80],
    [3,   100],
  ]

  for (let i = 1; i < breakpoints.length; i++) {
    const [x0, y0] = breakpoints[i - 1]
    const [x1, y1] = breakpoints[i]
    if (ordersPerMonth <= x1) {
      const t = (ordersPerMonth - x0) / (x1 - x0)
      return Math.round(y0 + t * (y1 - y0))
    }
  }

  return 100
}

/**
 * Compute composite credit score.
 * Weights: 40% payment history + 30% order consistency + 20% relationship + 10% volume
 */
export function computeCreditScore(
  paymentHistoryScore: number,
  orderConsistencyScore: number,
  relationshipScore: number,
  volumeScore: number,
): number {
  const score =
    paymentHistoryScore   * 0.40 +
    orderConsistencyScore * 0.30 +
    relationshipScore     * 0.20 +
    volumeScore           * 0.10

  return Math.round(Math.max(0, Math.min(100, score)))
}

/**
 * Convert credit score to letter grade.
 * A ≥ 80 / B 65-79 / C 50-64 / D 35-49 / F < 35
 */
export function creditScoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

/**
 * Compute recommended credit limit based on grade and avg order value.
 * A: avg×6, B: avg×4, C: avg×2, D: avg×1, F: 0
 */
export function computeRecommendedCreditLimit(
  grade: 'A' | 'B' | 'C' | 'D' | 'F',
  avgOrderValueTry: number,
): number {
  const multipliers: Record<'A' | 'B' | 'C' | 'D' | 'F', number> = {
    A: 6,
    B: 4,
    C: 2,
    D: 1,
    F: 0,
  }
  return Math.round(avgOrderValueTry * multipliers[grade])
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Compute normalized volume score (0-100).
 * 0 TRY → 0, 50K TRY → 50, 200K+ TRY → 100
 * Linearly interpolated.
 */
function computeVolumeScore(totalRevenueTry: number): number {
  if (totalRevenueTry <= 0)        return 0
  if (totalRevenueTry >= 200_000)  return 100

  if (totalRevenueTry <= 50_000) {
    return Math.round((totalRevenueTry / 50_000) * 50)
  }

  // 50K to 200K → 50 to 100
  return Math.round(50 + ((totalRevenueTry - 50_000) / 150_000) * 50)
}

// ── Service class ──────────────────────────────────────────────────────────────

export class CustomerCreditService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<CustomerCreditReport> {
    const today = new Date()
    const todayMs = today.getTime()

    // ── Fetch all paid sales ─────────────────────────────────────────────────
    const { data: paidRaw } = await this.supabase
      .from('sales')
      .select('customer_name, total, paid_amount, sale_date, paid_at, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('payment_status', 'paid')
      .not('paid_at', 'is', null)
      .order('sale_date', { ascending: true })
      .limit(5000)

    const paidSales = (paidRaw ?? []) as Array<{
      customer_name: string | null
      total: number
      paid_amount: number | null
      sale_date: string
      paid_at: string | null
      due_date: string | null
      payment_status: string
    }>

    // ── Fetch outstanding sales ──────────────────────────────────────────────
    const { data: outstandingRaw } = await this.supabase
      .from('sales')
      .select('customer_name, total, paid_amount, sale_date, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: true })
      .limit(2000)

    const outstandingSales = (outstandingRaw ?? []) as Array<{
      customer_name: string | null
      total: number
      paid_amount: number | null
      sale_date: string
      due_date: string | null
      payment_status: string
    }>

    // ── Build per-customer accumulator ───────────────────────────────────────
    interface CustomerAccum {
      customer_name: string
      sales: Array<{ date: Date; amount: number }>
      paid_days: number[]
      first_sale_date: Date | null
      last_sale_date: Date | null
      outstanding_try: number
    }

    const customerMap = new Map<string, CustomerAccum>()

    const getOrCreate = (name: string): CustomerAccum => {
      const key = name.trim().toLowerCase()
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_name: name.trim(),
          sales: [],
          paid_days: [],
          first_sale_date: null,
          last_sale_date: null,
          outstanding_try: 0,
        })
      }
      return customerMap.get(key)!
    }

    // Process paid sales — compute days late relative to due_date or sale_date+30
    for (const s of paidSales) {
      const name = s.customer_name ?? 'Bilinmeyen'
      const accum = getOrCreate(name)

      const saleDate = new Date(s.sale_date.slice(0, 10))
      const paidAt   = s.paid_at ? new Date(s.paid_at.slice(0, 10)) : null

      accum.sales.push({ date: saleDate, amount: Number(s.total ?? 0) })

      if (!accum.first_sale_date || saleDate < accum.first_sale_date) {
        accum.first_sale_date = saleDate
      }
      if (!accum.last_sale_date || saleDate > accum.last_sale_date) {
        accum.last_sale_date = saleDate
      }

      if (paidAt) {
        // Use due_date if present, otherwise sale_date + 30d as the reference
        const dueMs = s.due_date
          ? new Date(s.due_date.slice(0, 10)).getTime()
          : saleDate.getTime() + 30 * 86_400_000

        const daysLate = Math.round((paidAt.getTime() - dueMs) / 86_400_000)
        accum.paid_days.push(daysLate)
      }
    }

    // Process outstanding sales
    for (const s of outstandingSales) {
      const name = s.customer_name ?? 'Bilinmeyen'
      const accum = getOrCreate(name)

      const saleDate = new Date(s.sale_date.slice(0, 10))
      accum.sales.push({ date: saleDate, amount: Number(s.total ?? 0) })

      if (!accum.first_sale_date || saleDate < accum.first_sale_date) {
        accum.first_sale_date = saleDate
      }
      if (!accum.last_sale_date || saleDate > accum.last_sale_date) {
        accum.last_sale_date = saleDate
      }

      const outstanding = Math.max(0, Number(s.total ?? 0) - Number(s.paid_amount ?? 0))
      accum.outstanding_try += outstanding
    }

    // ── Build profiles ────────────────────────────────────────────────────────
    const profiles: CustomerCreditProfile[] = []

    for (const [, accum] of customerMap) {
      const { paid_days } = accum

      // Categorize late buckets
      const on_time_count    = paid_days.filter(d => d <= 0).length
      const late_30_count    = paid_days.filter(d => d > 0 && d <= 30).length
      const late_60_count    = paid_days.filter(d => d > 30 && d <= 60).length
      const late_90plus_count = paid_days.filter(d => d > 60).length

      // Order history
      const total_orders = accum.sales.length
      const total_revenue_try = accum.sales.reduce((s, o) => s + o.amount, 0)
      const avg_order_value_try = total_orders > 0
        ? total_revenue_try / total_orders
        : 0

      // Relationship age
      const firstDate = accum.first_sale_date ?? today
      const relationship_days = Math.round((todayMs - firstDate.getTime()) / 86_400_000)

      // Orders per month
      const ageMonths = Math.max(1, relationship_days / 30.44)
      const orders_per_month = total_orders / ageMonths

      // Compute component scores
      const payment_history_score    = computePaymentHistoryScore(on_time_count, late_30_count, late_60_count, late_90plus_count)
      const order_consistency_score  = computeOrderConsistencyScore(orders_per_month)
      const relationship_score       = computeRelationshipScore(relationship_days)
      const volume_score             = computeVolumeScore(total_revenue_try)

      // Composite
      const credit_score = computeCreditScore(
        payment_history_score,
        order_consistency_score,
        relationship_score,
        volume_score,
      )
      const credit_grade = creditScoreToGrade(credit_score)
      const recommended_limit_try = computeRecommendedCreditLimit(credit_grade, avg_order_value_try)

      // Outstanding
      const current_outstanding_try = Math.round(accum.outstanding_try * 100) / 100
      const outstanding_vs_limit_pct = recommended_limit_try > 0
        ? Math.round((current_outstanding_try / recommended_limit_try) * 1000) / 10
        : null

      profiles.push({
        customer_name: accum.customer_name,
        total_orders,
        total_revenue_try: Math.round(total_revenue_try * 100) / 100,
        avg_order_value_try: Math.round(avg_order_value_try * 100) / 100,
        relationship_days,
        orders_per_month: Math.round(orders_per_month * 100) / 100,

        payment_history_score,
        order_consistency_score,
        relationship_score,
        volume_score,

        credit_score,
        credit_grade,
        recommended_limit_try,

        current_outstanding_try,
        outstanding_vs_limit_pct,

        late_30_count,
        late_60_count,
        late_90plus_count,
        on_time_count,
      })
    }

    // Sort by credit_score desc
    profiles.sort((a, b) => b.credit_score - a.credit_score)

    // ── Aggregate stats ───────────────────────────────────────────────────────
    const grade_distribution: Record<'A' | 'B' | 'C' | 'D' | 'F', number> = {
      A: 0, B: 0, C: 0, D: 0, F: 0,
    }
    for (const p of profiles) {
      grade_distribution[p.credit_grade]++
    }

    const total_customers = profiles.length
    const avg_credit_score = total_customers > 0
      ? Math.round(profiles.reduce((s, p) => s + p.credit_score, 0) / total_customers * 10) / 10
      : 0

    const high_risk_customers = profiles.filter(p => p.credit_grade === 'D' || p.credit_grade === 'F')

    const total_recommended_limits_try = Math.round(
      profiles.reduce((s, p) => s + p.recommended_limit_try, 0) * 100,
    ) / 100

    const total_current_outstanding_try = Math.round(
      profiles.reduce((s, p) => s + p.current_outstanding_try, 0) * 100,
    ) / 100

    return {
      total_customers,
      grade_distribution,
      avg_credit_score,
      high_risk_customers,
      all_customers: profiles,
      total_recommended_limits_try,
      total_current_outstanding_try,
    }
  }
}
