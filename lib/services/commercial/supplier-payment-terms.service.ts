// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/supplier-payment-terms.service.ts
//
// Supplier Payment Terms Analytics — analyses how well the company pays its
// suppliers (vendors). Mirrors the customer-side PaymentBehaviorService but
// from the accounts-payable perspective.
//
// Pure helper exports allow deterministic unit testing without DB access.
//
// Score formula (our payment discipline toward each supplier):
//   Base: 100
//   early       : +3 each (bonus capped at +15)
//   on_time     :  0
//   late_30     : -5 each
//   late_60     : -15 each
//   late_90plus : -25 each
//   Clamped 0-100
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type SupplierPaymentTiming =
  | 'early'
  | 'on_time'
  | 'late_30'
  | 'late_60'
  | 'late_90plus'
  | 'unpaid'

export type SupplierPaymentClass = 'excellent' | 'good' | 'average' | 'poor'

export interface SupplierProfile {
  supplier_name: string
  total_expenses_count: number
  total_amount_try: number
  paid_count: number
  unpaid_count: number
  avg_days_to_pay: number | null
  payment_score: number
  payment_class: SupplierPaymentClass
  timing_breakdown: {
    early: number
    on_time: number
    late_30: number
    late_60: number
    late_90plus: number
    unpaid: number
  }
  outstanding_try: number
}

export interface SupplierPaymentSummary {
  total_suppliers: number
  overall_dpo: number | null
  overall_payment_score: number
  excellent_suppliers: number
  poor_suppliers: number
  total_outstanding_try: number
  top_creditors: SupplierProfile[]
  all_suppliers: SupplierProfile[]
  payment_trend: Array<{
    month: string
    avg_days_to_pay: number | null
    late_count: number
  }>
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Compute days between expense creation and payment.
 * Returns null if paidAt is null (unpaid).
 */
export function computeSupplierDaysToPay(
  createdAt: string,
  paidAt: string | null,
): number | null {
  if (!paidAt) return null
  const created = new Date(createdAt.slice(0, 10))
  const paid    = new Date(paidAt.slice(0, 10))
  return Math.round((paid.getTime() - created.getTime()) / 86_400_000)
}

/**
 * Classify when we paid relative to the implicit or explicit due date.
 *
 * If dueDate is null: implicit due = createdAt + 30 days.
 *
 * Buckets:
 *   early       : paid > 5 days before due
 *   on_time     : paid within [-5, +5] days of due
 *   late_30     : paid 6-30 days after due
 *   late_60     : paid 31-60 days after due
 *   late_90plus : paid 61+ days after due
 *   unpaid      : not yet paid
 */
export function classifySupplierPaymentTiming(
  createdAt: string,
  paidAt: string | null,
  dueDate: string | null,
): SupplierPaymentTiming {
  if (!paidAt) return 'unpaid'

  const paid = new Date(paidAt.slice(0, 10))

  let due: Date
  if (dueDate) {
    due = new Date(dueDate.slice(0, 10))
  } else {
    due = new Date(createdAt.slice(0, 10))
    due.setDate(due.getDate() + 30)
  }

  // Positive = paid AFTER due (late), negative = paid BEFORE due (early)
  const delta = Math.round((paid.getTime() - due.getTime()) / 86_400_000)

  if (delta < -5)          return 'early'
  if (delta <= 5)          return 'on_time'
  if (delta <= 30)         return 'late_30'
  if (delta <= 60)         return 'late_60'
  return                          'late_90plus'
}

/**
 * Compute payment discipline score 0-100.
 * Returns 100 for empty history (not penalized).
 */
export function computeSupplierPaymentScore(
  timings: SupplierPaymentTiming[],
): number {
  if (timings.length === 0) return 100

  let score = 100
  let earlyCount = 0

  for (const t of timings) {
    switch (t) {
      case 'early':       earlyCount++; break
      case 'late_30':     score -= 5;   break
      case 'late_60':     score -= 15;  break
      case 'late_90plus': score -= 25;  break
      case 'unpaid':      score -= 25;  break
      default: break
    }
  }

  // Early-payment bonus: +3 per early, capped at +15
  score += Math.min(earlyCount * 3, 15)

  return Math.max(0, Math.min(100, score))
}

/**
 * Classify score into a payment class.
 *   excellent : ≥ 80
 *   good      : 65-79
 *   average   : 50-64
 *   poor      : < 50
 */
export function classifySupplierPaymentClass(score: number): SupplierPaymentClass {
  if (score >= 80) return 'excellent'
  if (score >= 65) return 'good'
  if (score >= 50) return 'average'
  return 'poor'
}

/**
 * Compute simple DPO: average days to pay across all paid expenses.
 * Returns null if the array is empty.
 */
export function computeSupplierDpo(
  paidExpenses: Array<{ days_to_pay: number }>,
): number | null {
  if (paidExpenses.length === 0) return null
  const sum = paidExpenses.reduce((s, e) => s + e.days_to_pay, 0)
  return Math.round((sum / paidExpenses.length) * 10) / 10
}

// ── Internal row shape ─────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string
  supplier_name: string | null
  amount_try: number
  payment_status: string
  created_at: string
  paid_at: string | null
  due_date: string | null
}

// ── Service class ──────────────────────────────────────────────────────────────

export class SupplierPaymentTermsService {
  constructor(private supabase: AnyClient) {}

  async getSummary(companyId: string): Promise<SupplierPaymentSummary> {
    const { data, error } = await this.supabase
      .from('expenses')
      .select('id, supplier_name, amount_try, payment_status, created_at, paid_at, due_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('supplier_name', 'is', null)
      .neq('supplier_name', '')
      .order('created_at', { ascending: false })
      .limit(2000)

    if (error) throw new Error(`SupplierPaymentTermsService.getSummary: ${error.message}`)

    const rows = (data ?? []) as ExpenseRow[]

    // ── Group by supplier_name ──────────────────────────────────────────────

    const bySupplier = new Map<string, ExpenseRow[]>()
    for (const row of rows) {
      const key = (row.supplier_name ?? '').trim()
      if (!key) continue
      if (!bySupplier.has(key)) bySupplier.set(key, [])
      bySupplier.get(key)!.push(row)
    }

    // ── Build SupplierProfile for each supplier ─────────────────────────────

    const allSuppliers: SupplierProfile[] = []
    const allPaidForDpo: Array<{ days_to_pay: number }> = []

    for (const [name, supplierRows] of bySupplier.entries()) {
      const timings: SupplierPaymentTiming[] = []
      const paidDays: number[] = []
      let paidCount   = 0
      let unpaidCount = 0
      let totalAmt    = 0
      let outstandingTry = 0

      for (const row of supplierRows) {
        totalAmt += Number(row.amount_try)

        const isPaid = row.payment_status === 'paid' && row.paid_at !== null

        if (isPaid) {
          paidCount++
          const days = computeSupplierDaysToPay(row.created_at, row.paid_at)
          if (days !== null) {
            paidDays.push(days)
            allPaidForDpo.push({ days_to_pay: days })
          }
          const timing = classifySupplierPaymentTiming(
            row.created_at,
            row.paid_at,
            row.due_date ?? null,
          )
          timings.push(timing)
        } else {
          unpaidCount++
          outstandingTry += Number(row.amount_try)
          timings.push('unpaid')
        }
      }

      const avgDaysToPay = paidDays.length > 0
        ? Math.round((paidDays.reduce((s, d) => s + d, 0) / paidDays.length) * 10) / 10
        : null

      const score = computeSupplierPaymentScore(timings)
      const paymentClass = classifySupplierPaymentClass(score)

      // Timing breakdown counts
      const breakdown = {
        early:       0,
        on_time:     0,
        late_30:     0,
        late_60:     0,
        late_90plus: 0,
        unpaid:      0,
      }
      for (const t of timings) breakdown[t]++

      allSuppliers.push({
        supplier_name: name,
        total_expenses_count: supplierRows.length,
        total_amount_try: Math.round(totalAmt * 100) / 100,
        paid_count: paidCount,
        unpaid_count: unpaidCount,
        avg_days_to_pay: avgDaysToPay,
        payment_score: score,
        payment_class: paymentClass,
        timing_breakdown: breakdown,
        outstanding_try: Math.round(outstandingTry * 100) / 100,
      })
    }

    // Sort by total_amount_try desc
    allSuppliers.sort((a, b) => b.total_amount_try - a.total_amount_try)

    // ── Aggregates ──────────────────────────────────────────────────────────

    const totalOutstanding = allSuppliers.reduce((s, p) => s + p.outstanding_try, 0)
    const overallDpo = computeSupplierDpo(allPaidForDpo)

    // Weighted average score by transaction count
    const totalTxCount = allSuppliers.reduce((s, p) => s + p.total_expenses_count, 0)
    const overallScore = totalTxCount > 0
      ? allSuppliers.reduce((s, p) => s + p.payment_score * p.total_expenses_count, 0) / totalTxCount
      : 100

    const excellentSuppliers = allSuppliers.filter(p => p.payment_class === 'excellent').length
    const poorSuppliers      = allSuppliers.filter(p => p.payment_class === 'poor').length

    // Top 5 creditors by outstanding
    const topCreditors = [...allSuppliers]
      .sort((a, b) => b.outstanding_try - a.outstanding_try)
      .slice(0, 5)

    // ── 6-month trend ───────────────────────────────────────────────────────

    const now      = new Date()
    const months6: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months6.push(d.toISOString().slice(0, 7))  // "YYYY-MM"
    }

    const trendMap = new Map<string, { days: number[]; lateCount: number }>()
    for (const m of months6) {
      trendMap.set(m, { days: [], lateCount: 0 })
    }

    for (const row of rows) {
      const ym = row.created_at.slice(0, 7)
      if (!trendMap.has(ym)) continue

      const bucket = trendMap.get(ym)!
      if (row.payment_status === 'paid' && row.paid_at !== null) {
        const days = computeSupplierDaysToPay(row.created_at, row.paid_at)
        if (days !== null) {
          bucket.days.push(days)
          const timing = classifySupplierPaymentTiming(row.created_at, row.paid_at, row.due_date ?? null)
          if (timing !== 'early' && timing !== 'on_time') bucket.lateCount++
        }
      }
    }

    const paymentTrend = months6.map(month => {
      const b = trendMap.get(month)!
      const avgDays = b.days.length > 0
        ? Math.round((b.days.reduce((s, d) => s + d, 0) / b.days.length) * 10) / 10
        : null
      return {
        month,
        avg_days_to_pay: avgDays,
        late_count: b.lateCount,
      }
    })

    return {
      total_suppliers:       allSuppliers.length,
      overall_dpo:           overallDpo,
      overall_payment_score: Math.round(overallScore * 10) / 10,
      excellent_suppliers:   excellentSuppliers,
      poor_suppliers:        poorSuppliers,
      total_outstanding_try: Math.round(totalOutstanding * 100) / 100,
      top_creditors:         topCreditors,
      all_suppliers:         allSuppliers,
      payment_trend:         paymentTrend,
    }
  }
}
