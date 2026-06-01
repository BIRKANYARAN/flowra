// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/payment-behavior.service.ts
//
// Customer Payment Behavior Analysis — profiles customer payment reliability,
// scores them 0-100, classifies behavior, and predicts expected payment dates
// for outstanding invoices.
//
// Reliability score formula:
//   Start: 100
//   −5  per payment > 30 days late
//   −10 per payment > 60 days late
//   −20 per payment > 90 days late
//   +5  for each on-time payment (≤ 30 days), max +25 bonus
//   Clamped to 0-100
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateTruncationWarning } from '@/lib/finance/truncation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type PaymentBehaviorClass = 'excellent' | 'good' | 'average' | 'poor' | 'unreliable'

export interface PaymentPrediction {
  sale_id: string
  customer_name: string
  outstanding_try: number
  expected_payment_date: string | null   // 'YYYY-MM-DD'
  confidence: 'high' | 'medium' | 'low'
}

export interface CustomerPaymentProfile {
  customer_id: string | null
  customer_name: string
  // History (last 12 months of paid sales)
  paid_count: number
  avg_days_to_pay: number | null
  median_days_to_pay: number | null
  pct_on_time: number      // % paid ≤ 30 days from sale_date (or ≤ due_date)
  pct_within_60: number
  pct_within_90: number
  // Score
  reliability_score: number    // 0-100
  behavior_class: PaymentBehaviorClass
  // Outstanding
  outstanding_try: number
  outstanding_count: number
  oldest_outstanding_days: number | null
  // Predictions
  predicted_payments: PaymentPrediction[]
}

export interface PaymentBehaviorReport {
  company_id: string
  analysis_months: number   // 12
  profiles: CustomerPaymentProfile[]
  // Portfolio stats
  avg_reliability_score: number
  excellent_count: number
  unreliable_count: number
  total_outstanding_try: number
  // Risk
  high_risk_outstanding_try: number    // outstanding from poor+unreliable customers
  predicted_30d_collections: number   // sum of expected payments in next 30 days
  computed_at: string
}

// ── Pure helper exports ────────────────────────────────────────────────────────

/**
 * Compute reliability score from an array of payment day records.
 * Returns 100 for empty history (no history = not penalized).
 */
export function computeReliabilityScore(
  payments: Array<{ days_to_pay: number }>
): number {
  if (payments.length === 0) return 100

  let score = 100

  // Deductions (applied in order from least to most severe)
  for (const p of payments) {
    if (p.days_to_pay > 90) {
      score -= 20
    } else if (p.days_to_pay > 60) {
      score -= 10
    } else if (p.days_to_pay > 30) {
      score -= 5
    }
  }

  // Bonus for on-time payments (≤ 30 days), max +25
  const onTimeCount = payments.filter(p => p.days_to_pay <= 30).length
  const bonus = Math.min(onTimeCount * 5, 25)
  score += bonus

  return Math.max(0, Math.min(100, score))
}

/**
 * Classify payment behavior based on reliability score and average days to pay.
 */
export function classifyPaymentBehavior(
  score: number,
  avgDaysToPay: number | null
): PaymentBehaviorClass {
  if (score >= 85 && avgDaysToPay !== null && avgDaysToPay <= 20) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'average'
  if (score >= 30) return 'poor'
  return 'unreliable'
}

/**
 * Compute signed integer days between sale_date and paid_at.
 * Negative value means paid before sale date (edge case).
 */
export function computeDaysToPay(saleDateStr: string, paidAtStr: string): number {
  const sale = new Date(saleDateStr.slice(0, 10))
  const paid = new Date(paidAtStr.slice(0, 10))
  return Math.round((paid.getTime() - sale.getTime()) / 86_400_000)
}

/**
 * Predict expected payment date given a sale date and average days to pay.
 * Returns null if avgDaysToPay is null.
 */
export function predictPaymentDate(
  saleDateStr: string,
  avgDaysToPay: number | null
): string | null {
  if (avgDaysToPay === null) return null
  const sale = new Date(saleDateStr.slice(0, 10))
  const expected = new Date(sale.getTime() + avgDaysToPay * 86_400_000)
  return expected.toISOString().slice(0, 10)
}

// ── Service class ──────────────────────────────────────────────────────────────

export class PaymentBehaviorService {
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string; analysisMonths?: number },
  ): Promise<PaymentBehaviorReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)
    const analysisMonths = opts?.analysisMonths ?? 12

    // Calculate cutoff date for historical analysis
    const cutoff = new Date(today)
    cutoff.setMonth(cutoff.getMonth() - analysisMonths)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // ── Fetch paid sales in analysis window ───────────────────────────────────
    const { data: paidRaw } = await supabase
      .from('sales')
      .select('id, customer_id, customer_name, total:total, paid_amount, sale_date, paid_at, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('payment_status', 'paid')
      .not('paid_at', 'is', null)
      .gte('sale_date', cutoffStr)
      .order('sale_date', { ascending: false })
      .limit(2000)

    const paidSales = (paidRaw ?? []) as Array<{
      id: string
      customer_id: string | null
      customer_name: string | null
      total: number
      paid_amount: number | null
      sale_date: string
      paid_at: string | null
      due_date: string | null
      payment_status: string
    }>

    // ── Fetch outstanding sales ───────────────────────────────────────────────
    const { data: outstandingRaw } = await supabase
      .from('sales')
      .select('id, customer_id, customer_name, total:total, paid_amount, sale_date, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['unpaid', 'pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: false })
      .limit(1000)

    const outstandingSales = (outstandingRaw ?? []) as Array<{
      id: string
      customer_id: string | null
      customer_name: string | null
      total: number
      paid_amount: number | null
      sale_date: string
      due_date: string | null
      payment_status: string
    }>

    // No-silent-truncation: warn if either capped query hit its row cap (payment
    // timing / outstanding metrics would then be computed over a partial set).
    const truncWarn = aggregateTruncationWarning('payment-behavior', [
      { name: 'paid_sales',  count: (paidRaw ?? []).length, cap: 2000 },
      { name: 'outstanding', count: (outstandingRaw ?? []).length, cap: 1000 },
    ])
    if (truncWarn) console.warn(truncWarn)

    // ── Build per-customer maps ───────────────────────────────────────────────
    type CustomerKey = string  // customer_name (normalized)

    interface CustomerAccum {
      customer_id: string | null
      customer_name: string
      paid_days: number[]   // days_to_pay for each paid sale
      outstanding_try: number
      outstanding_count: number
      oldest_outstanding_days: number | null
      outstanding_sales: Array<{
        id: string
        sale_date: string
        outstanding_try: number
      }>
    }

    const customerMap = new Map<CustomerKey, CustomerAccum>()

    const getOrCreate = (name: string, id: string | null): CustomerAccum => {
      const key = name.trim().toLowerCase()
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_id: id,
          customer_name: name.trim(),
          paid_days: [],
          outstanding_try: 0,
          outstanding_count: 0,
          oldest_outstanding_days: null,
          outstanding_sales: [],
        })
      }
      return customerMap.get(key)!
    }

    // Process paid sales
    for (const s of paidSales) {
      const name = s.customer_name ?? 'Bilinmeyen'
      const accum = getOrCreate(name, s.customer_id)
      if (s.paid_at && s.sale_date) {
        const days = computeDaysToPay(s.sale_date, s.paid_at)
        accum.paid_days.push(days)
      }
    }

    // Process outstanding sales
    const todayMs = new Date(today).getTime()
    for (const s of outstandingSales) {
      const name = s.customer_name ?? 'Bilinmeyen'
      const accum = getOrCreate(name, s.customer_id)
      const outstandingAmt = Math.max(0, s.total - (s.paid_amount ?? 0))
      accum.outstanding_try += outstandingAmt
      accum.outstanding_count += 1

      // Track oldest outstanding
      const refDate = s.due_date ?? s.sale_date
      if (refDate) {
        const ageDays = Math.round((todayMs - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000)
        if (accum.oldest_outstanding_days === null || ageDays > accum.oldest_outstanding_days) {
          accum.oldest_outstanding_days = ageDays
        }
      }

      accum.outstanding_sales.push({
        id: s.id,
        sale_date: s.sale_date,
        outstanding_try: outstandingAmt,
      })
    }

    // ── Build profiles ────────────────────────────────────────────────────────
    const todayPlus30 = new Date(todayMs + 30 * 86_400_000).toISOString().slice(0, 10)

    const profiles: CustomerPaymentProfile[] = []

    for (const [, accum] of customerMap) {
      const { paid_days } = accum

      // Compute stats
      const paid_count = paid_days.length
      const avg_days_to_pay = paid_count > 0
        ? paid_days.reduce((s, d) => s + d, 0) / paid_count
        : null

      // Median
      let median_days_to_pay: number | null = null
      if (paid_count > 0) {
        const sorted = [...paid_days].sort((a, b) => a - b)
        const mid = Math.floor(paid_count / 2)
        median_days_to_pay = paid_count % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid]
      }

      // On-time: ≤ 30 days
      const on_time_count = paid_days.filter(d => d <= 30).length
      const within_60_count = paid_days.filter(d => d <= 60).length
      const within_90_count = paid_days.filter(d => d <= 90).length

      const pct_on_time = paid_count > 0 ? (on_time_count / paid_count) * 100 : 100
      const pct_within_60 = paid_count > 0 ? (within_60_count / paid_count) * 100 : 100
      const pct_within_90 = paid_count > 0 ? (within_90_count / paid_count) * 100 : 100

      // Reliability score
      const reliability_score = computeReliabilityScore(
        paid_days.map(d => ({ days_to_pay: d }))
      )

      const behavior_class = classifyPaymentBehavior(reliability_score, avg_days_to_pay)

      // Confidence for predictions
      const confidence: 'high' | 'medium' | 'low' =
        paid_count >= 5 ? 'high' : paid_count >= 2 ? 'medium' : 'low'

      // Build predictions for outstanding invoices
      const predicted_payments: PaymentPrediction[] = accum.outstanding_sales
        .sort((a, b) => b.outstanding_try - a.outstanding_try)
        .map(s => ({
          sale_id: s.id,
          customer_name: accum.customer_name,
          outstanding_try: s.outstanding_try,
          expected_payment_date: predictPaymentDate(s.sale_date, avg_days_to_pay),
          confidence,
        }))

      profiles.push({
        customer_id: accum.customer_id,
        customer_name: accum.customer_name,
        paid_count,
        avg_days_to_pay: avg_days_to_pay !== null ? Math.round(avg_days_to_pay * 10) / 10 : null,
        median_days_to_pay: median_days_to_pay !== null ? Math.round(median_days_to_pay * 10) / 10 : null,
        pct_on_time: Math.round(pct_on_time * 10) / 10,
        pct_within_60: Math.round(pct_within_60 * 10) / 10,
        pct_within_90: Math.round(pct_within_90 * 10) / 10,
        reliability_score,
        behavior_class,
        outstanding_try: Math.round(accum.outstanding_try * 100) / 100,
        outstanding_count: accum.outstanding_count,
        oldest_outstanding_days: accum.oldest_outstanding_days,
        predicted_payments,
      })
    }

    // Sort by outstanding DESC
    profiles.sort((a, b) => b.outstanding_try - a.outstanding_try)

    // ── Portfolio stats ───────────────────────────────────────────────────────
    const profilesWithHistory = profiles.filter(p => p.paid_count > 0)
    const avg_reliability_score = profilesWithHistory.length > 0
      ? profilesWithHistory.reduce((s, p) => s + p.reliability_score, 0) / profilesWithHistory.length
      : 100

    const excellent_count = profiles.filter(p => p.behavior_class === 'excellent').length
    const unreliable_count = profiles.filter(p => p.behavior_class === 'unreliable').length

    const total_outstanding_try = profiles.reduce((s, p) => s + p.outstanding_try, 0)

    const high_risk_outstanding_try = profiles
      .filter(p => p.behavior_class === 'poor' || p.behavior_class === 'unreliable')
      .reduce((s, p) => s + p.outstanding_try, 0)

    // Predicted 30d collections: sum of expected payments with date <= today+30
    let predicted_30d_collections = 0
    for (const profile of profiles) {
      for (const pred of profile.predicted_payments) {
        if (pred.expected_payment_date && pred.expected_payment_date <= todayPlus30) {
          predicted_30d_collections += pred.outstanding_try
        }
      }
    }

    return {
      company_id: companyId,
      analysis_months: analysisMonths,
      profiles,
      avg_reliability_score: Math.round(avg_reliability_score * 10) / 10,
      excellent_count,
      unreliable_count,
      total_outstanding_try: Math.round(total_outstanding_try * 100) / 100,
      high_risk_outstanding_try: Math.round(high_risk_outstanding_try * 100) / 100,
      predicted_30d_collections: Math.round(predicted_30d_collections * 100) / 100,
      computed_at: new Date().toISOString(),
    }
  }
}
