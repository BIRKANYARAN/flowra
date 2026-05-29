// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/supplier-terms.service.ts
//
// Supplier Payment Terms Analysis & Early Payment Discount Calculator
//
// Analyses vendor payment behaviour, calculates the cost of early payment
// discounts, and recommends optimal DPO targets for Turkish SMEs.
//
// Pure exported functions are DB-free and fully testable in isolation.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish SME defaults ────────────────────────────────────────────────────────

const DEFAULT_BORROWING_RATE = 25   // % annualised — Turkish SME typical
const BENCHMARK_DPO          = 45   // Turkish benchmark DPO in days

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Annualised cost of NOT taking an early payment discount.
 *
 *   cost = (discountPct / (100 - discountPct)) × (365 / (standardDays - discountDays)) × 100
 *
 * Returns null when the calculation is undefined:
 *   - standardDays <= discountDays (no float period)
 *   - discountPct <= 0
 */
export function computeEarlyPaymentCost(
  discountPct: number,
  standardDays: number,
  discountDays: number,
): number | null {
  if (discountPct <= 0) return null
  if (standardDays <= discountDays) return null

  const floatDays = standardDays - discountDays
  return (discountPct / (100 - discountPct)) * (365 / floatDays) * 100
}

/**
 * Decide whether to take or skip an early payment discount.
 *
 *   take_discount    : earlyPaymentCost > borrowingRate  (discounting is cheaper than borrowing)
 *   skip_discount    : earlyPaymentCost <= borrowingRate (borrowing and waiting is cheaper)
 *   insufficient_data: earlyPaymentCost is null
 */
export function classifyEarlyPaymentDecision(
  earlyPaymentCostPct: number | null,
  borrowingRatePct: number,
): 'take_discount' | 'skip_discount' | 'insufficient_data' {
  if (earlyPaymentCostPct === null) return 'insufficient_data'
  if (earlyPaymentCostPct > borrowingRatePct) return 'take_discount'
  return 'skip_discount'
}

/**
 * Return the validated DPO value.
 * Returns avgPaymentDays when totalPurchases > 0, else null.
 */
export function computeActualDpo(
  totalPaid: number,
  totalPurchases: number,
  avgPaymentDays: number,
): number | null {
  if (totalPurchases <= 0) return null
  return avgPaymentDays
}

/**
 * Cash freed (or used) by moving DPO from current to target.
 *
 *   = annualPurchases / 365 × (targetDpo - currentDpo)
 *
 * Positive → cash freed (DPO extends).
 * Negative → cash consumed (DPO shrinks).
 */
export function computeDpoOpportunity(
  currentDpo: number,
  targetDpo: number,
  annualPurchases: number,
): number {
  return (annualPurchases / 365) * (targetDpo - currentDpo)
}

/**
 * Classify payment behaviour relative to agreed terms.
 *
 * avgDaysToPayVsTerms: negative = paying early, positive = paying late.
 *
 *   early_payer   : < -3
 *   on_time       : -3 to 3
 *   slightly_late : 4 to 14
 *   late          : 15 to 30
 *   very_late     : > 30
 */
export function classifyPaymentBehavior(
  avgDaysToPayVsTerms: number,
): 'early_payer' | 'on_time' | 'slightly_late' | 'late' | 'very_late' {
  if (avgDaysToPayVsTerms < -3)  return 'early_payer'
  if (avgDaysToPayVsTerms <= 3)  return 'on_time'
  if (avgDaysToPayVsTerms <= 14) return 'slightly_late'
  if (avgDaysToPayVsTerms <= 30) return 'late'
  return 'very_late'
}

/**
 * Compute a supplier trust score 0-100.
 *
 *   base = onTimePaymentRate × 0.7 + max(0, (30 - avgDaysLate) / 30 × 100) × 0.3
 *   if totalTransactions < 3: score = base × 0.5 (low confidence)
 *   clamped to [0, 100]
 */
export function computeSupplierTrustScore(
  avgDaysLate: number,
  onTimePaymentRate: number,
  totalTransactions: number,
): number {
  const latePenaltyScore = Math.max(0, (30 - avgDaysLate) / 30 * 100)
  const base = onTimePaymentRate * 0.7 + latePenaltyScore * 0.3

  const score = totalTransactions < 3 ? base * 0.5 : base
  return Math.max(0, Math.min(100, score))
}

/**
 * Compute optimal payment timing for an invoice.
 */
export function computeOptimalPaymentTiming(
  invoiceDate: string,
  paymentTermsDays: number,
  discountDays?: number,
  discountPct?: number,
  borrowingRatePct = DEFAULT_BORROWING_RATE,
): {
  standard_due_date: string
  discount_due_date: string | null
  recommended_pay_date: string
  decision: 'take_discount' | 'skip_discount' | 'insufficient_data'
  savings_if_discount: number | null
} {
  const invoice = new Date(invoiceDate)

  // Standard due date
  const standardDue = new Date(invoice)
  standardDue.setDate(standardDue.getDate() + paymentTermsDays)
  const standard_due_date = standardDue.toISOString().slice(0, 10)

  // Discount due date
  let discount_due_date: string | null = null
  if (discountDays !== undefined && discountDays !== null) {
    const discountDue = new Date(invoice)
    discountDue.setDate(discountDue.getDate() + discountDays)
    discount_due_date = discountDue.toISOString().slice(0, 10)
  }

  // Decision
  const epCost = (discountPct !== undefined && discountPct !== null && discountDays !== undefined && discountDays !== null)
    ? computeEarlyPaymentCost(discountPct, paymentTermsDays, discountDays)
    : null

  const decision = classifyEarlyPaymentDecision(epCost, borrowingRatePct)

  const recommended_pay_date = (decision === 'take_discount' && discount_due_date !== null)
    ? discount_due_date
    : standard_due_date

  // Simplified savings: we don't have invoice amount in params, return null
  const savings_if_discount: number | null = null

  return {
    standard_due_date,
    discount_due_date,
    recommended_pay_date,
    decision,
    savings_if_discount,
  }
}

/**
 * Company-wide vendor payment health score 0-100.
 *
 *   component = trust_score × 0.5 + min(100, dpo/45 × 60) × 0.3 + on_time_rate × 0.2
 *   result = average of all components, clamped to [0, 100]
 *
 * Returns null for empty array.
 */
export function computeVendorPaymentHealthScore(
  vendors: Array<{
    trust_score: number
    dpo: number
    on_time_rate: number
  }>,
): number | null {
  if (vendors.length === 0) return null

  const sum = vendors.reduce((acc, v) => {
    const dpoScore = Math.min(100, (v.dpo / 45) * 60)
    return acc + v.trust_score * 0.5 + dpoScore * 0.3 + v.on_time_rate * 0.2
  }, 0)

  const avg = sum / vendors.length
  return Math.max(0, Math.min(100, avg))
}

// ── Internal DB row shape ──────────────────────────────────────────────────────

interface ExpenseRow {
  supplier_name: string | null
  amount_try: number | null
  expense_type: string | null
  expense_date: string | null
  created_at: string
  paid_at: string | null
  payment_status: string | null
  due_date: string | null
}

// ── Service class ──────────────────────────────────────────────────────────────

export class SupplierTermsService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    vendors: Array<{
      vendor_name: string
      total_spend: number
      transaction_count: number
      avg_days_to_pay: number | null
      payment_behavior: ReturnType<typeof classifyPaymentBehavior> | null
      trust_score: number
      on_time_rate: number
      dpo_opportunity: number
    }>
    company_summary: {
      total_vendors: number
      avg_dpo: number | null
      vendor_health_score: number | null
      total_dpo_opportunity: number
      payment_behavior_distribution: {
        early_payer: number
        on_time: number
        slightly_late: number
        late: number
        very_late: number
      }
    }
    early_payment_analysis: {
      default_borrowing_rate: number
      cost_of_2_10_net_30: number | null
      decision_2_10_net_30: ReturnType<typeof classifyEarlyPaymentDecision>
      cost_of_1_10_net_30: number | null
      decision_1_10_net_30: ReturnType<typeof classifyEarlyPaymentDecision>
    }
  }> {
    // ── Fetch expenses with supplier_name ──────────────────────────────────────

    const [expensesRes] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('supplier_name, amount_try, expense_type, expense_date, created_at, paid_at, payment_status, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('supplier_name', 'is', null)
        .neq('supplier_name', '')
        .order('expense_date', { ascending: false })
        .limit(2000),
    ])

    const rows: ExpenseRow[] = expensesRes.status === 'fulfilled' && !expensesRes.value.error
      ? ((expensesRes.value.data ?? []) as ExpenseRow[])
      : []

    // ── Empty state ────────────────────────────────────────────────────────────

    const emptyResult = {
      vendors: [],
      company_summary: {
        total_vendors: 0,
        avg_dpo: null,
        vendor_health_score: null,
        total_dpo_opportunity: 0,
        payment_behavior_distribution: {
          early_payer: 0,
          on_time: 0,
          slightly_late: 0,
          late: 0,
          very_late: 0,
        },
      },
      early_payment_analysis: buildEarlyPaymentAnalysis(),
    }

    if (rows.length === 0) return emptyResult

    // ── Aggregate by vendor ────────────────────────────────────────────────────

    interface VendorAgg {
      total_spend: number
      transaction_count: number
      paid_days: number[]
      on_time_count: number
      late_days_sum: number
    }

    const vendorMap = new Map<string, VendorAgg>()

    for (const row of rows) {
      const name = (row.supplier_name ?? '').trim()
      if (!name) continue

      let agg = vendorMap.get(name)
      if (!agg) {
        agg = {
          total_spend: 0,
          transaction_count: 0,
          paid_days: [],
          on_time_count: 0,
          late_days_sum: 0,
        }
        vendorMap.set(name, agg)
      }

      agg.total_spend += Number(row.amount_try ?? 0)
      agg.transaction_count++

      const isPaid = (row.payment_status === 'paid' || row.payment_status === 'partial') && row.paid_at !== null

      if (isPaid && row.paid_at) {
        // Days from expense_date (or created_at) to paid_at
        const baseDate = row.expense_date ?? row.created_at.slice(0, 10)
        const base = new Date(baseDate)
        const paid = new Date(row.paid_at.slice(0, 10))
        const days = Math.round((paid.getTime() - base.getTime()) / 86_400_000)
        if (days >= 0) {
          agg.paid_days.push(days)

          // Terms from due_date vs paid_at; default terms = 30 days
          const dueDate = row.due_date
            ? new Date(row.due_date)
            : new Date(base.getTime() + 30 * 86_400_000)
          const daysLate = Math.round((paid.getTime() - dueDate.getTime()) / 86_400_000)

          if (daysLate <= 3) agg.on_time_count++
          else agg.late_days_sum += daysLate
        }
      }
    }

    if (vendorMap.size === 0) return emptyResult

    // ── Compute vendor-level metrics ───────────────────────────────────────────

    const vendorList: Array<{
      vendor_name: string
      total_spend: number
      transaction_count: number
      avg_days_to_pay: number | null
      payment_behavior: ReturnType<typeof classifyPaymentBehavior> | null
      trust_score: number
      on_time_rate: number
      dpo_opportunity: number
    }> = []

    // Compute annual spend for DPO opportunity (use 12-month equivalent)
    const totalSpendAll = Array.from(vendorMap.values()).reduce((s, v) => s + v.total_spend, 0)

    for (const [name, agg] of vendorMap.entries()) {
      const avgDaysToPay = agg.paid_days.length > 0
        ? Math.round((agg.paid_days.reduce((s, d) => s + d, 0) / agg.paid_days.length) * 10) / 10
        : null

      const on_time_rate = agg.transaction_count > 0
        ? (agg.on_time_count / agg.transaction_count) * 100
        : 0

      const avgDaysLate = agg.paid_days.length > 0 && agg.on_time_count < agg.paid_days.length
        ? agg.late_days_sum / Math.max(1, agg.paid_days.length - agg.on_time_count)
        : 0

      const trust_score = computeSupplierTrustScore(avgDaysLate, on_time_rate, agg.transaction_count)

      // Payment behavior: compare avg days to default 30-day term
      const payment_behavior: ReturnType<typeof classifyPaymentBehavior> | null = avgDaysToPay !== null
        ? classifyPaymentBehavior(avgDaysToPay - 30)
        : null

      // DPO opportunity: if vendor DPO extended to benchmark (45 days)
      // Annualise vendor spend: multiply by (365 / 180) since we fetch ~6 months
      const annualSpend = agg.total_spend * 2
      const currentDpo = avgDaysToPay ?? 30
      const dpo_opportunity = computeDpoOpportunity(currentDpo, BENCHMARK_DPO, annualSpend)

      vendorList.push({
        vendor_name: name,
        total_spend: Math.round(agg.total_spend * 100) / 100,
        transaction_count: agg.transaction_count,
        avg_days_to_pay: avgDaysToPay,
        payment_behavior,
        trust_score: Math.round(trust_score * 10) / 10,
        on_time_rate: Math.round(on_time_rate * 10) / 10,
        dpo_opportunity: Math.round(dpo_opportunity * 100) / 100,
      })
    }

    vendorList.sort((a, b) => b.total_spend - a.total_spend)

    // ── Company summary ────────────────────────────────────────────────────────

    const allDpos = vendorList
      .map(v => v.avg_days_to_pay)
      .filter((d): d is number => d !== null)

    const avg_dpo = allDpos.length > 0
      ? Math.round((allDpos.reduce((s, d) => s + d, 0) / allDpos.length) * 10) / 10
      : null

    const vendor_health_score = computeVendorPaymentHealthScore(
      vendorList.map(v => ({
        trust_score: v.trust_score,
        dpo: v.avg_days_to_pay ?? 30,
        on_time_rate: v.on_time_rate,
      })),
    )

    const total_dpo_opportunity = vendorList.reduce((s, v) => s + v.dpo_opportunity, 0)

    const payment_behavior_distribution = {
      early_payer: 0,
      on_time: 0,
      slightly_late: 0,
      late: 0,
      very_late: 0,
    }
    for (const v of vendorList) {
      if (v.payment_behavior) payment_behavior_distribution[v.payment_behavior]++
    }

    return {
      vendors: vendorList,
      company_summary: {
        total_vendors: vendorList.length,
        avg_dpo,
        vendor_health_score: vendor_health_score !== null ? Math.round(vendor_health_score * 10) / 10 : null,
        total_dpo_opportunity: Math.round(total_dpo_opportunity * 100) / 100,
        payment_behavior_distribution,
      },
      early_payment_analysis: buildEarlyPaymentAnalysis(),
    }
  }
}

// ── Early payment analysis builder ────────────────────────────────────────────

function buildEarlyPaymentAnalysis(): {
  default_borrowing_rate: number
  cost_of_2_10_net_30: number | null
  decision_2_10_net_30: ReturnType<typeof classifyEarlyPaymentDecision>
  cost_of_1_10_net_30: number | null
  decision_1_10_net_30: ReturnType<typeof classifyEarlyPaymentDecision>
} {
  const borrowingRate = DEFAULT_BORROWING_RATE

  const cost_2_10_net_30 = computeEarlyPaymentCost(2, 30, 10)
  const cost_1_10_net_30 = computeEarlyPaymentCost(1, 30, 10)

  return {
    default_borrowing_rate: borrowingRate,
    cost_of_2_10_net_30: cost_2_10_net_30 !== null ? Math.round(cost_2_10_net_30 * 100) / 100 : null,
    decision_2_10_net_30: classifyEarlyPaymentDecision(cost_2_10_net_30, borrowingRate),
    cost_of_1_10_net_30: cost_1_10_net_30 !== null ? Math.round(cost_1_10_net_30 * 100) / 100 : null,
    decision_1_10_net_30: classifyEarlyPaymentDecision(cost_1_10_net_30, borrowingRate),
  }
}
