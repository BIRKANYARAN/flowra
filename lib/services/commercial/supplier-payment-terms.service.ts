// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/supplier-payment-terms.service.ts
//
// Supplier Payment Terms Analysis — analyses payment terms with suppliers,
// tracks early payment discount opportunities, and optimises cash outflows.
//
// Pure helper exports allow deterministic unit testing without DB access.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface PaymentTermsProfile {
  vendor_name: string
  total_spend_try: number
  avg_payment_days: number | null        // avg days from invoice to payment
  agreed_terms_days: number | null       // days stated on invoice/contract
  early_payment_discount_pct: number | null  // if vendor offers early pay discount
  on_time_payment_rate: number           // 0-1
  late_payment_count: number
  total_transactions: number
}

export interface DiscountOpportunity {
  vendor_name: string
  outstanding_amount: number
  discount_pct: number
  discount_amount: number                // outstanding × discount_pct / 100
  days_to_capture: number                // how many days left to capture
  annualized_return_pct: number          // (discount / amount) × (365 / days) × 100
  should_capture: boolean                // annualized_return > cost_of_capital
}

export interface SupplierPaymentTermsReport {
  analysis_period_days: number
  vendor_profiles: PaymentTermsProfile[]
  discount_opportunities: DiscountOpportunity[]
  total_discount_opportunity: ReturnType<typeof computeTotalDiscountOpportunity>
  supplier_concentration: ReturnType<typeof computeSupplierConcentration>
  avg_payment_days_portfolio: number | null
  on_time_rate_portfolio: number
  optimization_score: number
  payment_terms_health: ReturnType<typeof classifyPaymentTermsHealth>
  narrative: string
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Average days between invoice_date and payment_date for paid items.
 * Returns null if no paid items exist.
 */
export function computeAvgPaymentDays(
  payments: Array<{ invoice_date: string; payment_date: string | null }>,
): number | null {
  const paid = payments.filter(p => p.payment_date !== null)
  if (paid.length === 0) return null

  const sum = paid.reduce((acc, p) => {
    const invoice = new Date(p.invoice_date.slice(0, 10))
    const payment = new Date(p.payment_date!.slice(0, 10))
    const days = Math.round((payment.getTime() - invoice.getTime()) / 86_400_000)
    return acc + days
  }, 0)

  return Math.round((sum / paid.length) * 10) / 10
}

/**
 * Fraction of payments made on time.
 * On-time: payment_date <= due_date (or invoice_date + 30 if no due_date).
 * Rate = on_time / total; 0 if no items.
 */
export function computeOnTimePaymentRate(
  payments: Array<{ due_date: string | null; payment_date: string | null; invoice_date: string }>,
): number {
  if (payments.length === 0) return 0

  let onTime = 0

  for (const p of payments) {
    const paid = p.payment_date ? new Date(p.payment_date.slice(0, 10)) : null

    // If not paid yet, count as not on time
    if (!paid) continue

    let due: Date
    if (p.due_date) {
      due = new Date(p.due_date.slice(0, 10))
    } else {
      due = new Date(p.invoice_date.slice(0, 10))
      due.setDate(due.getDate() + 30)
    }

    if (paid <= due) onTime++
  }

  return payments.length > 0 ? onTime / payments.length : 0
}

/**
 * Early payment discount amount: outstandingAmount × discountPct / 100.
 */
export function computeEarlyPaymentDiscount(
  outstandingAmount: number,
  discountPct: number,
): number {
  return outstandingAmount * discountPct / 100
}

/**
 * Annualized return from capturing a discount:
 * (discountPct / 100) / daysToCapture × 365 × 100
 * Returns null if daysToCapture <= 0.
 */
export function computeAnnualizedDiscountReturn(
  discountPct: number,
  daysToCapture: number,
): number | null {
  if (daysToCapture <= 0) return null
  return (discountPct / 100) / daysToCapture * 365 * 100
}

/**
 * Whether it's attractive to capture the discount.
 * True if annualizedReturnPct is not null AND > costOfCapitalPct.
 */
export function classifyDiscountAttractiveness(
  annualizedReturnPct: number | null,
  costOfCapitalPct: number,
): boolean {
  return annualizedReturnPct !== null && annualizedReturnPct > costOfCapitalPct
}

/**
 * Difference between actual and agreed payment days.
 * Positive = paying later than agreed, negative = paying early.
 * Returns null if either input is null.
 */
export function computePaymentStretch(
  actualPaymentDays: number | null,
  agreedTermsDays: number | null,
): number | null {
  if (actualPaymentDays === null || agreedTermsDays === null) return null
  return actualPaymentDays - agreedTermsDays
}

/**
 * Classify overall payment behaviour toward suppliers.
 *   excellent: onTimeRate >= 0.95 AND (stretch <= 0 OR stretch is null)
 *   good:      onTimeRate >= 0.80
 *   fair:      onTimeRate >= 0.60
 *   poor:      otherwise
 */
export function classifyPaymentBehavior(
  onTimeRate: number,
  paymentStretch: number | null,
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (onTimeRate >= 0.95 && (paymentStretch === null || paymentStretch <= 0)) return 'excellent'
  if (onTimeRate >= 0.80) return 'good'
  if (onTimeRate >= 0.60) return 'fair'
  return 'poor'
}

/**
 * Supplier spend concentration metrics.
 *   top_vendor_pct: highest single-vendor spend as % of total
 *   hhi: Herfindahl-Hirschman Index = Σ(share²)
 * Returns 0/0 if empty or total = 0.
 */
export function computeSupplierConcentration(
  profiles: PaymentTermsProfile[],
): { top_vendor_pct: number; hhi: number } {
  if (profiles.length === 0) return { top_vendor_pct: 0, hhi: 0 }
  const total = profiles.reduce((s, p) => s + p.total_spend_try, 0)
  if (total === 0) return { top_vendor_pct: 0, hhi: 0 }

  const maxSpend = Math.max(...profiles.map(p => p.total_spend_try))
  const top_vendor_pct = (maxSpend / total) * 100

  const hhi = profiles.reduce((s, p) => {
    const share = p.total_spend_try / total
    return s + share * share
  }, 0)

  return { top_vendor_pct, hhi }
}

/**
 * Aggregate discount opportunity metrics.
 */
export function computeTotalDiscountOpportunity(
  opportunities: DiscountOpportunity[],
): { total_discount_available: number; total_capturable: number; capturable_count: number } {
  const total_discount_available = opportunities.reduce((s, o) => s + o.discount_amount, 0)
  const capturable = opportunities.filter(o => o.should_capture)
  const total_capturable = capturable.reduce((s, o) => s + o.discount_amount, 0)
  return {
    total_discount_available,
    total_capturable,
    capturable_count: capturable.length,
  }
}

/**
 * Payment optimization score 0-100:
 *   on-time contribution (50 pts):
 *     >= 0.95 → 50  |  >= 0.80 → 40  |  >= 0.60 → 25  |  else → 10
 *   stretch contribution (30 pts):
 *     negative → 30  |  0-5 → 25  |  5-15 → 15  |  else → 5  |  null → 15
 *   opportunities contribution (20 pts):
 *     capturable% >= 80 → 20  |  >= 50 → 15  |  >= 20 → 10  |  else → 5
 *     (if no opportunities exist → 10)
 */
export function computePaymentOptimizationScore(
  avgPaymentStretch: number | null,
  onTimeRate: number,
  capturableOpportunitiesPct: number,
): number {
  // on-time contribution (50 pts)
  let onTimePts: number
  if (onTimeRate >= 0.95)      onTimePts = 50
  else if (onTimeRate >= 0.80) onTimePts = 40
  else if (onTimeRate >= 0.60) onTimePts = 25
  else                         onTimePts = 10

  // stretch contribution (30 pts)
  let stretchPts: number
  if (avgPaymentStretch === null) {
    stretchPts = 15
  } else if (avgPaymentStretch < 0) {
    stretchPts = 30
  } else if (avgPaymentStretch <= 5) {
    stretchPts = 25
  } else if (avgPaymentStretch <= 15) {
    stretchPts = 15
  } else {
    stretchPts = 5
  }

  // opportunities contribution (20 pts)
  // capturableOpportunitiesPct === 0 means no opportunities → 10
  let oppPts: number
  if (capturableOpportunitiesPct === 0) {
    oppPts = 10
  } else if (capturableOpportunitiesPct >= 80) {
    oppPts = 20
  } else if (capturableOpportunitiesPct >= 50) {
    oppPts = 15
  } else if (capturableOpportunitiesPct >= 20) {
    oppPts = 10
  } else {
    oppPts = 5
  }

  return onTimePts + stretchPts + oppPts
}

/**
 * Classify payment terms health from optimization score.
 *   excellent: >= 80  |  good: >= 60  |  fair: >= 40  |  poor: < 40
 */
export function classifyPaymentTermsHealth(
  score: number,
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  return 'poor'
}

/**
 * Generate a Turkish narrative describing the payment terms health.
 */
export function generatePaymentTermsNarrative(
  health: ReturnType<typeof classifyPaymentTermsHealth>,
  totalDiscountOpportunity: number,
  onTimeRate: number,
  vendorCount: number,
): string {
  const discount = Math.round(totalDiscountOpportunity).toLocaleString('tr-TR')

  switch (health) {
    case 'excellent':
      return `Tedarikçi ödeme yönetimi mükemmel — vade takibi ve iskonto fırsatları değerlendiriliyor.`
    case 'good':
      return `Ödeme performansı iyi — ₺${discount}₺ iskonto fırsatı mevcut.`
    case 'fair':
      return `Ödeme zamanlaması iyileştirilebilir — vade aşımı tedarikçi ilişkilerini etkiliyor.`
    case 'poor':
      return `Ödeme sorunları kritik — tedarikçilerle ilişki yönetimi risk altında.`
  }
}

// ── Legacy type exports (backwards compatibility) ─────────────────────────────
// These types were part of the original service and are referenced by
// app/dashboard/operations/_tabs/_supplier-terms/SupplierPaymentTermsClient.tsx

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

// ── Internal row shape ─────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string
  title: string | null
  amount: number
  currency: string
  category: string | null
  expense_date: string | null
  payment_status: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const DEFAULT_DISCOUNT_PCT = 2
const COST_OF_CAPITAL_PCT  = 20
const EARLY_PAY_WINDOW_DAYS = 10   // assume 10 days left to capture

// ── Service class ──────────────────────────────────────────────────────────────

export class SupplierPaymentTermsService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<SupplierPaymentTermsReport> {
    const ANALYSIS_DAYS = 90
    const since = new Date()
    since.setDate(since.getDate() - ANALYSIS_DAYS)
    const sinceIso = since.toISOString().slice(0, 10)

    const [expenseResult] = await Promise.allSettled([
      this.supabase
        .from('expenses')
        .select('id, title, amount, currency, category, expense_date, payment_status, created_at, updated_at, deleted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', sinceIso)
        .order('expense_date', { ascending: false })
        .limit(2000),
    ])

    const rows: ExpenseRow[] =
      expenseResult.status === 'fulfilled' && expenseResult.value.data
        ? (expenseResult.value.data as ExpenseRow[])
        : []

    // ── Derive payment_date proxy: if paid → use updated_at, else null ──────
    // expenses schema has no paid_at column; use updated_at as proxy when paid

    interface EnrichedRow extends ExpenseRow {
      vendor_name: string
      invoice_date: string
      payment_date: string | null
      due_date: string | null
    }

    const enriched: EnrichedRow[] = rows.map(r => {
      const isPaid = r.payment_status === 'paid'
      return {
        ...r,
        vendor_name: (r.title ?? r.category ?? 'Diğer').trim() || 'Diğer',
        invoice_date: (r.expense_date ?? r.created_at.slice(0, 10)),
        payment_date: isPaid ? r.updated_at.slice(0, 10) : null,
        due_date: null,  // expenses table has no due_date column
      }
    })

    // ── Group by vendor ──────────────────────────────────────────────────────

    const byVendor = new Map<string, EnrichedRow[]>()
    for (const r of enriched) {
      if (!byVendor.has(r.vendor_name)) byVendor.set(r.vendor_name, [])
      byVendor.get(r.vendor_name)!.push(r)
    }

    // ── Build profiles ───────────────────────────────────────────────────────

    const vendor_profiles: PaymentTermsProfile[] = []

    for (const [vendor, vendorRows] of byVendor.entries()) {
      const totalSpend = vendorRows.reduce((s, r) => s + Number(r.amount), 0)
      const avgPaymentDays = computeAvgPaymentDays(vendorRows)
      const onTimeRate = computeOnTimePaymentRate(vendorRows)

      const lateCount = vendorRows.filter(r => {
        if (!r.payment_date) return false
        const paid = new Date(r.payment_date)
        const due  = new Date(r.invoice_date)
        due.setDate(due.getDate() + 30)
        return paid > due
      }).length

      vendor_profiles.push({
        vendor_name: vendor,
        total_spend_try: Math.round(totalSpend * 100) / 100,
        avg_payment_days: avgPaymentDays,
        agreed_terms_days: 30,   // standard NET-30 assumption; no contract data available
        early_payment_discount_pct: DEFAULT_DISCOUNT_PCT,
        on_time_payment_rate: onTimeRate,
        late_payment_count: lateCount,
        total_transactions: vendorRows.length,
      })
    }

    // Sort by spend descending
    vendor_profiles.sort((a, b) => b.total_spend_try - a.total_spend_try)

    // ── Discount opportunities (unpaid items only) ───────────────────────────

    const discount_opportunities: DiscountOpportunity[] = []

    for (const [vendor, vendorRows] of byVendor.entries()) {
      const unpaid = vendorRows.filter(r => r.payment_status !== 'paid')
      if (unpaid.length === 0) continue

      const outstanding = unpaid.reduce((s, r) => s + Number(r.amount), 0)
      const discountPct = DEFAULT_DISCOUNT_PCT
      const discountAmt = computeEarlyPaymentDiscount(outstanding, discountPct)
      const daysToCapture = EARLY_PAY_WINDOW_DAYS
      const annualized = computeAnnualizedDiscountReturn(discountPct, daysToCapture) ?? 0
      const shouldCapture = classifyDiscountAttractiveness(annualized, COST_OF_CAPITAL_PCT)

      discount_opportunities.push({
        vendor_name: vendor,
        outstanding_amount: Math.round(outstanding * 100) / 100,
        discount_pct: discountPct,
        discount_amount: Math.round(discountAmt * 100) / 100,
        days_to_capture: daysToCapture,
        annualized_return_pct: annualized,
        should_capture: shouldCapture,
      })
    }

    // Sort by discount_amount descending
    discount_opportunities.sort((a, b) => b.discount_amount - a.discount_amount)

    // ── Portfolio aggregates ─────────────────────────────────────────────────

    const total_discount_opportunity = computeTotalDiscountOpportunity(discount_opportunities)
    const supplier_concentration     = computeSupplierConcentration(vendor_profiles)

    const paidProfiles = vendor_profiles.filter(p => p.avg_payment_days !== null)
    const avg_payment_days_portfolio: number | null =
      paidProfiles.length > 0
        ? Math.round(
            paidProfiles.reduce((s, p) => s + p.avg_payment_days!, 0) / paidProfiles.length * 10
          ) / 10
        : null

    const totalTx    = vendor_profiles.reduce((s, p) => s + p.total_transactions, 0)
    const on_time_rate_portfolio: number =
      totalTx > 0
        ? vendor_profiles.reduce((s, p) => s + p.on_time_payment_rate * p.total_transactions, 0) / totalTx
        : 0

    // Avg payment stretch across vendors that have agreed terms
    const profilesWithStretch = vendor_profiles
      .map(p => computePaymentStretch(p.avg_payment_days, p.agreed_terms_days))
      .filter((s): s is number => s !== null)

    const avgPaymentStretch: number | null =
      profilesWithStretch.length > 0
        ? profilesWithStretch.reduce((s, v) => s + v, 0) / profilesWithStretch.length
        : null

    const totalOpps      = discount_opportunities.length
    const capturableOpps = total_discount_opportunity.capturable_count
    const capturablePct  = totalOpps > 0 ? (capturableOpps / totalOpps) * 100 : 0

    const optimization_score = computePaymentOptimizationScore(
      avgPaymentStretch,
      on_time_rate_portfolio,
      capturablePct,
    )

    const payment_terms_health = classifyPaymentTermsHealth(optimization_score)

    const narrative = generatePaymentTermsNarrative(
      payment_terms_health,
      total_discount_opportunity.total_discount_available,
      on_time_rate_portfolio,
      vendor_profiles.length,
    )

    return {
      analysis_period_days: ANALYSIS_DAYS,
      vendor_profiles,
      discount_opportunities,
      total_discount_opportunity,
      supplier_concentration,
      avg_payment_days_portfolio,
      on_time_rate_portfolio,
      optimization_score,
      payment_terms_health,
      narrative,
    }
  }
}
