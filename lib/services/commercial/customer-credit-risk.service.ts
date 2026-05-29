// ── CustomerCreditRiskService — B2B Credit Risk Scoring ──────────────────────
// Scores B2B customers for credit risk to inform payment terms, credit limits,
// and collections priority. Distinct from churn risk — focuses on payment
// capacity and reliability.
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export type CreditRiskGrade = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC' | 'D'

export interface CustomerCreditProfile {
  customer_key: string
  customer_name: string

  // Payment history
  total_invoices: number
  paid_on_time_count: number      // invoices paid by due date
  paid_late_count: number         // invoices paid late
  unpaid_count: number            // still unpaid
  avg_days_late: number           // avg delay for late payments
  max_days_late: number           // worst single delay

  // Exposure
  total_outstanding_try: number   // currently unpaid invoices
  largest_single_invoice_try: number
  oldest_unpaid_days: number      // how old is the oldest unpaid invoice

  // Relationship
  months_as_customer: number
  total_revenue_try: number
  avg_monthly_revenue_try: number
}

export interface CustomerCreditScore {
  customer_key: string
  customer_name: string
  credit_score: number            // 0-100 (100 = best credit quality)
  credit_grade: CreditRiskGrade

  // Dimension scores
  payment_history_score: number   // 40% weight
  exposure_score: number          // 30% weight
  relationship_score: number      // 20% weight
  concentration_score: number     // 10% weight

  // Risk outputs
  recommended_credit_limit_try: number   // suggested credit extension
  recommended_payment_terms: string      // Turkish: "30 gün net", "Peşin", "60 gün net"
  risk_flags: string[]                   // Turkish: specific risk flags

  // Trend
  is_improving: boolean   // last 3 months better than prior 3 months
}

export interface CustomerCreditRiskReport {
  portfolio_summary: ReturnType<typeof computeCreditPortfolioSummary>
  customer_scores: CustomerCreditScore[]          // sorted by credit_score asc (riskiest first)
  top_risk_customers: CustomerCreditScore[]       // bottom 5 (highest risk)
  recommended_watch_list: CustomerCreditScore[]   // BB or below with outstanding > ₺50K
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id: string | null
  customer_name: string | null
  sale_date: string | null
  total: number | null
  amount_paid: number | null
  due_date: string | null
  payment_status: string | null
  paid_at: string | null
}

// ── Pure scoring functions ────────────────────────────────────────────────────

/**
 * DIMENSION 1: Payment History Score (0-100, 40% weight)
 * on_time_rate = paid_on_time / total_invoices
 * Base score = on_time_rate × 100
 * Deductions:
 *   avg_days_late > 30: -20
 *   avg_days_late > 14: -10
 *   avg_days_late > 7:  -5
 *   max_days_late > 90: -15 (additional)
 *   unpaid_count / total > 20%: -15
 * Clamp [0, 100]
 */
export function computePaymentHistoryScore(
  totalInvoices: number,
  paidOnTimeCount: number,
  avgDaysLate: number,
  maxDaysLate: number,
  unpaidCount: number,
): number {
  if (totalInvoices <= 0) return 50 // insufficient data — neutral score

  const onTimeRate = paidOnTimeCount / totalInvoices
  let score = onTimeRate * 100

  // Delay deductions (mutually exclusive tiers)
  if (avgDaysLate > 30) {
    score -= 20
  } else if (avgDaysLate > 14) {
    score -= 10
  } else if (avgDaysLate > 7) {
    score -= 5
  }

  // Worst-case deduction (additional)
  if (maxDaysLate > 90) score -= 15

  // Unpaid ratio deduction
  if (unpaidCount / totalInvoices > 0.2) score -= 15

  return Math.min(100, Math.max(0, score))
}

/**
 * DIMENSION 2: Exposure Score (0-100, 30% weight)
 * Score based on outstanding_try / avg_monthly_revenue
 * outstanding < 1× monthly: 100
 * outstanding < 2×: 80
 * outstanding < 3×: 60
 * outstanding < 4×: 40
 * outstanding ≥ 4×: 20
 * Deduction: oldest_unpaid > 60 days: -20; > 30 days: -10
 */
export function computeExposureScore(
  totalOutstanding: number,
  avgMonthlyRevenue: number,
  oldestUnpaidDays: number,
): number {
  // No outstanding → perfect exposure score
  if (totalOutstanding <= 0) return 100

  // Avoid division by zero — if no monthly revenue, treat as high exposure
  const ratio = avgMonthlyRevenue > 0 ? totalOutstanding / avgMonthlyRevenue : 999

  let score: number
  if (ratio < 1) {
    score = 100
  } else if (ratio < 2) {
    score = 80
  } else if (ratio < 3) {
    score = 60
  } else if (ratio < 4) {
    score = 40
  } else {
    score = 20
  }

  // Age deductions (mutually exclusive tiers)
  if (oldestUnpaidDays > 60) {
    score -= 20
  } else if (oldestUnpaidDays > 30) {
    score -= 10
  }

  return Math.min(100, Math.max(0, score))
}

/**
 * DIMENSION 3: Relationship Score (0-100, 20% weight)
 * Based on tenure
 * months < 3: 30
 * months < 6: 50
 * months < 12: 70
 * months < 24: 85
 * months ≥ 24: 100
 */
export function computeRelationshipScore(monthsAsCustomer: number): number {
  if (monthsAsCustomer < 3) return 30
  if (monthsAsCustomer < 6) return 50
  if (monthsAsCustomer < 12) return 70
  if (monthsAsCustomer < 24) return 85
  return 100
}

/**
 * DIMENSION 4: Concentration Score (0-100, 10% weight)
 * How concentrated is our exposure with this customer?
 * customer_outstanding / total_company_outstanding
 * < 10%: 100
 * < 20%: 80
 * < 30%: 60
 * < 50%: 40
 * ≥ 50%: 20
 */
export function computeConcentrationScore(
  customerOutstanding: number,
  totalCompanyOutstanding: number,
): number {
  // No exposure at all → perfect score
  if (customerOutstanding <= 0) return 100
  // Company has no outstanding → this customer is the only one; treat as concentrated
  if (totalCompanyOutstanding <= 0) return 20

  const ratio = customerOutstanding / totalCompanyOutstanding

  if (ratio < 0.1) return 100
  if (ratio < 0.2) return 80
  if (ratio < 0.3) return 60
  if (ratio < 0.5) return 40
  return 20
}

/**
 * Compute composite credit score
 * Weights: 40% payment history + 30% exposure + 20% relationship + 10% concentration
 */
export function computeCompositeCreditScore(
  paymentHistoryScore: number,
  exposureScore: number,
  relationshipScore: number,
  concentrationScore: number,
): number {
  return (
    paymentHistoryScore * 0.40 +
    exposureScore * 0.30 +
    relationshipScore * 0.20 +
    concentrationScore * 0.10
  )
}

/**
 * Classify credit grade from composite score (0-100)
 * AAA: ≥ 90  (pristine)
 * AA:  ≥ 80
 * A:   ≥ 70
 * BBB: ≥ 60  (investment grade)
 * BB:  ≥ 50
 * B:   ≥ 40  (speculative)
 * CCC: ≥ 25
 * D:   < 25  (default/very high risk)
 */
export function classifyCreditGrade(score: number): CreditRiskGrade {
  if (score >= 90) return 'AAA'
  if (score >= 80) return 'AA'
  if (score >= 70) return 'A'
  if (score >= 60) return 'BBB'
  if (score >= 50) return 'BB'
  if (score >= 40) return 'B'
  if (score >= 25) return 'CCC'
  return 'D'
}

/**
 * Compute recommended credit limit based on avg monthly revenue and grade
 * Multipliers: AAA/AA=3, A=2.5, BBB=2, BB=1.5, B=1, CCC=0.5, D=0
 */
export function computeRecommendedCreditLimit(
  avgMonthlyRevenue: number,
  grade: CreditRiskGrade,
): number {
  const multipliers: Record<CreditRiskGrade, number> = {
    AAA: 3,
    AA: 3,
    A: 2.5,
    BBB: 2,
    BB: 1.5,
    B: 1,
    CCC: 0.5,
    D: 0,
  }
  return avgMonthlyRevenue * multipliers[grade]
}

/**
 * Generate recommended payment terms in Turkish
 * AAA/AA: "60 gün net"
 * A/BBB: "30 gün net"
 * BB/B: "15 gün net"
 * CCC: "Peşin veya garanti mektubu"
 * D: "Peşin ödeme zorunlu"
 */
export function generatePaymentTerms(grade: CreditRiskGrade): string {
  switch (grade) {
    case 'AAA':
    case 'AA':
      return '60 gün net'
    case 'A':
    case 'BBB':
      return '30 gün net'
    case 'BB':
    case 'B':
      return '15 gün net'
    case 'CCC':
      return 'Peşin veya garanti mektubu'
    case 'D':
      return 'Peşin ödeme zorunlu'
  }
}

/**
 * Generate risk flags in Turkish
 * oldest_unpaid > 90: "90+ gün vadesi geçmiş fatura var"
 * avg_days_late > 30: "Ortalama {X} gün ödeme gecikmesi"
 * unpaid_count / total > 30%: "Faturalarının %{X}'i ödenmemiş"
 * outstanding > avg_monthly × 3: "Bakiye 3 aylık ciroya eşit"
 * months < 3: "Yeni müşteri — kredi geçmişi yetersiz"
 */
export function generateRiskFlags(profile: CustomerCreditProfile): string[] {
  const flags: string[] = []

  if (profile.oldest_unpaid_days > 90) {
    flags.push('90+ gün vadesi geçmiş fatura var')
  }

  if (profile.avg_days_late > 30) {
    flags.push(`Ortalama ${Math.round(profile.avg_days_late)} gün ödeme gecikmesi`)
  }

  if (
    profile.total_invoices > 0 &&
    profile.unpaid_count / profile.total_invoices > 0.3
  ) {
    const pct = Math.round((profile.unpaid_count / profile.total_invoices) * 100)
    flags.push(`Faturalarının %${pct}'i ödenmemiş`)
  }

  if (
    profile.avg_monthly_revenue_try > 0 &&
    profile.total_outstanding_try > profile.avg_monthly_revenue_try * 3
  ) {
    flags.push('Bakiye 3 aylık ciroya eşit')
  }

  if (profile.months_as_customer < 3) {
    flags.push('Yeni müşteri — kredi geçmişi yetersiz')
  }

  return flags
}

/**
 * Determine if payment trend is improving.
 * Compare on_time_rate: last 3 months vs prior 3 months.
 * Returns true if improving or stable (within 5pp).
 */
export function determineIsTrendImproving(
  recentOnTimeRate: number,
  priorOnTimeRate: number,
): boolean {
  // improving = recent rate >= prior rate - 0.05 (allows 5pp deterioration as "stable")
  return recentOnTimeRate >= priorOnTimeRate - 0.05
}

/**
 * Build full CustomerCreditScore from profile and portfolio context
 */
export function buildCustomerCreditScore(
  profile: CustomerCreditProfile,
  totalCompanyOutstanding: number,
): CustomerCreditScore {
  const payment_history_score = computePaymentHistoryScore(
    profile.total_invoices,
    profile.paid_on_time_count,
    profile.avg_days_late,
    profile.max_days_late,
    profile.unpaid_count,
  )

  const exposure_score = computeExposureScore(
    profile.total_outstanding_try,
    profile.avg_monthly_revenue_try,
    profile.oldest_unpaid_days,
  )

  const relationship_score = computeRelationshipScore(profile.months_as_customer)

  const concentration_score = computeConcentrationScore(
    profile.total_outstanding_try,
    totalCompanyOutstanding,
  )

  const credit_score = computeCompositeCreditScore(
    payment_history_score,
    exposure_score,
    relationship_score,
    concentration_score,
  )

  const credit_grade = classifyCreditGrade(credit_score)

  const recommended_credit_limit_try = computeRecommendedCreditLimit(
    profile.avg_monthly_revenue_try,
    credit_grade,
  )

  const recommended_payment_terms = generatePaymentTerms(credit_grade)
  const risk_flags = generateRiskFlags(profile)

  // Trend: estimate recent vs prior on-time rate from aggregate data
  // Use paid_on_time_count / (total_invoices - unpaid_count) as best approximation
  // For the service layer, trend is computed from time-series data; here default to stable
  const is_improving = determineIsTrendImproving(0.5, 0.5) // placeholder — overridden by service

  return {
    customer_key: profile.customer_key,
    customer_name: profile.customer_name,
    credit_score: Math.round(credit_score * 10) / 10,
    credit_grade,
    payment_history_score: Math.round(payment_history_score * 10) / 10,
    exposure_score: Math.round(exposure_score * 10) / 10,
    relationship_score,
    concentration_score,
    recommended_credit_limit_try,
    recommended_payment_terms,
    risk_flags,
    is_improving,
  }
}

/**
 * Compute portfolio credit quality summary
 */
export function computeCreditPortfolioSummary(scores: CustomerCreditScore[]): {
  total_customers: number
  investment_grade_count: number   // AAA-BBB
  speculative_count: number        // BB-CCC
  default_count: number            // D
  weighted_avg_score: number       // weighted by outstanding amount
  total_outstanding_try: number
  high_risk_outstanding_try: number  // BB and below
} {
  const total_customers = scores.length

  const INVESTMENT_GRADES = new Set<CreditRiskGrade>(['AAA', 'AA', 'A', 'BBB'])
  const SPECULATIVE_GRADES = new Set<CreditRiskGrade>(['BB', 'B', 'CCC'])
  const HIGH_RISK_GRADES = new Set<CreditRiskGrade>(['BB', 'B', 'CCC', 'D'])

  const investment_grade_count = scores.filter(s => INVESTMENT_GRADES.has(s.credit_grade)).length
  const speculative_count = scores.filter(s => SPECULATIVE_GRADES.has(s.credit_grade)).length
  const default_count = scores.filter(s => s.credit_grade === 'D').length

  // Outstanding amounts come from the recommended credit limit proxy; we need
  // the actual outstanding for weighting — extract from risk flags / score context.
  // Since CustomerCreditScore doesn't carry total_outstanding, we fall back to
  // equal-weighting for the summary.
  const totalScoreWeight = scores.reduce((sum, s) => sum + s.credit_score, 0)
  const weighted_avg_score =
    total_customers === 0
      ? 0
      : totalScoreWeight / total_customers

  // total_outstanding and high_risk_outstanding can only be summed if we store
  // outstanding on the score — we compute them as 0 here since CustomerCreditScore
  // does not carry the raw outstanding field (the service layer enriches this).
  const total_outstanding_try = 0
  const high_risk_outstanding_try = 0

  return {
    total_customers,
    investment_grade_count,
    speculative_count,
    default_count,
    weighted_avg_score: Math.round(weighted_avg_score * 10) / 10,
    total_outstanding_try,
    high_risk_outstanding_try,
  }
}

/**
 * Overload of computeCreditPortfolioSummary that also accepts outstanding amounts
 * keyed by customer_key — used by the service class for accurate totals.
 */
export function computeCreditPortfolioSummaryWithOutstanding(
  scores: CustomerCreditScore[],
  outstandingByKey: Map<string, number>,
): ReturnType<typeof computeCreditPortfolioSummary> {
  const base = computeCreditPortfolioSummary(scores)

  const HIGH_RISK_GRADES = new Set<CreditRiskGrade>(['BB', 'B', 'CCC', 'D'])

  let total_outstanding_try = 0
  let high_risk_outstanding_try = 0

  for (const s of scores) {
    const amt = outstandingByKey.get(s.customer_key) ?? 0
    total_outstanding_try += amt
    if (HIGH_RISK_GRADES.has(s.credit_grade)) {
      high_risk_outstanding_try += amt
    }
  }

  // Weighted avg score — weight by outstanding amount if available
  let weighted_avg_score = base.weighted_avg_score
  if (total_outstanding_try > 0) {
    const weightedSum = scores.reduce((sum, s) => {
      const amt = outstandingByKey.get(s.customer_key) ?? 0
      return sum + s.credit_score * amt
    }, 0)
    weighted_avg_score = Math.round((weightedSum / total_outstanding_try) * 10) / 10
  }

  return {
    ...base,
    weighted_avg_score,
    total_outstanding_try,
    high_risk_outstanding_try,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CustomerCreditRiskService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string): Promise<CustomerCreditRiskReport> {
    // Fetch all sales (invoices) — we need payment history across the customer's lifetime
    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total, amount_paid, due_date, payment_status, paid_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_proforma.is.null,is_proforma.eq.false')
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CustomerCreditRiskService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    if (rows.length === 0) {
      return buildEmptyReport()
    }

    const now = new Date()

    // Group by customer key
    type InvoiceRecord = {
      sale_date: Date
      total: number
      amount_paid: number
      due_date: Date | null
      payment_status: string
      paid_at: Date | null
    }

    type CustomerAgg = {
      key: string
      customer_name: string
      first_sale_date: Date
      invoices: InvoiceRecord[]
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = row.customer_id ? `id:${row.customer_id}` : `name:${row.customer_name ?? 'Bilinmiyor'}`
      const saleDate = new Date(row.sale_date)
      const total = Number(row.total ?? 0)
      const amountPaid = Number(row.amount_paid ?? 0)
      const dueDate = row.due_date ? new Date(row.due_date) : null
      const paidAt = row.paid_at ? new Date(row.paid_at) : null

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          key,
          customer_name: row.customer_name ?? 'Bilinmiyor',
          first_sale_date: saleDate,
          invoices: [],
        })
      }
      const agg = aggMap.get(key)!
      if (saleDate < agg.first_sale_date) agg.first_sale_date = saleDate
      agg.invoices.push({ sale_date: saleDate, total, amount_paid: amountPaid, due_date: dueDate, payment_status: row.payment_status ?? 'unpaid', paid_at: paidAt })
    }

    const profiles: CustomerCreditProfile[] = []
    const outstandingByKey = new Map<string, number>()

    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    for (const [, agg] of aggMap) {
      const invoices = agg.invoices
      if (invoices.length === 0) continue

      const monthsAsCustomer = Math.max(
        0,
        (now.getTime() - agg.first_sale_date.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      )

      const totalRevenue = invoices.reduce((s, i) => s + i.total, 0)
      const firstDate = agg.first_sale_date
      const spanMonths = Math.max(
        1,
        (now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
      )
      const avgMonthlyRevenue = totalRevenue / spanMonths

      // Classify invoices
      let paidOnTime = 0
      let paidLate = 0
      let unpaid = 0
      const delayDays: number[] = []
      let maxDelay = 0
      let totalOutstanding = 0
      let largestInvoice = 0
      let oldestUnpaidDays = 0

      for (const inv of invoices) {
        if (inv.total <= 0) continue
        if (inv.total > largestInvoice) largestInvoice = inv.total

        const isPaid =
          inv.payment_status === 'paid' ||
          inv.amount_paid >= inv.total * 0.95

        if (isPaid) {
          const due = inv.due_date ?? new Date(inv.sale_date.getTime() + 30 * 24 * 60 * 60 * 1000)
          const paidDate = inv.paid_at ?? due
          const delay = Math.max(0, (paidDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
          if (delay > 0) {
            paidLate++
            delayDays.push(delay)
            if (delay > maxDelay) maxDelay = delay
          } else {
            paidOnTime++
          }
        } else {
          unpaid++
          const outstanding = inv.total - inv.amount_paid
          totalOutstanding += outstanding

          const due = inv.due_date ?? new Date(inv.sale_date.getTime() + 30 * 24 * 60 * 60 * 1000)
          const ageDays = Math.max(0, (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
          if (ageDays > oldestUnpaidDays) oldestUnpaidDays = ageDays
        }
      }

      const avgDaysLate =
        delayDays.length > 0 ? delayDays.reduce((s, d) => s + d, 0) / delayDays.length : 0

      outstandingByKey.set(agg.key, totalOutstanding)

      profiles.push({
        customer_key: agg.key,
        customer_name: agg.customer_name,
        total_invoices: invoices.filter(i => i.total > 0).length,
        paid_on_time_count: paidOnTime,
        paid_late_count: paidLate,
        unpaid_count: unpaid,
        avg_days_late: avgDaysLate,
        max_days_late: maxDelay,
        total_outstanding_try: totalOutstanding,
        largest_single_invoice_try: largestInvoice,
        oldest_unpaid_days: oldestUnpaidDays,
        months_as_customer: monthsAsCustomer,
        total_revenue_try: totalRevenue,
        avg_monthly_revenue_try: avgMonthlyRevenue,
      })
    }

    if (profiles.length === 0) return buildEmptyReport()

    // Total company outstanding for concentration calculation
    const totalCompanyOutstanding = Array.from(outstandingByKey.values()).reduce((s, v) => s + v, 0)

    // Build scores with trend
    const customerScores: CustomerCreditScore[] = profiles.map(profile => {
      const score = buildCustomerCreditScore(profile, totalCompanyOutstanding)

      // Compute real trend from invoice data
      const agg = aggMap.get(profile.customer_key)!
      const recentInvoices = agg.invoices.filter(i => i.sale_date >= threeMonthsAgo && i.total > 0)
      const priorInvoices = agg.invoices.filter(
        i => i.sale_date >= sixMonthsAgo && i.sale_date < threeMonthsAgo && i.total > 0,
      )

      function onTimeRate(invs: typeof recentInvoices): number {
        if (invs.length === 0) return 0
        let onTime = 0
        for (const inv of invs) {
          const isPaid = inv.payment_status === 'paid' || inv.amount_paid >= inv.total * 0.95
          if (isPaid) {
            const due = inv.due_date ?? new Date(inv.sale_date.getTime() + 30 * 24 * 60 * 60 * 1000)
            const paidDate = inv.paid_at ?? due
            const delay = (paidDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
            if (delay <= 0) onTime++
          }
        }
        return onTime / invs.length
      }

      const recentRate = onTimeRate(recentInvoices)
      const priorRate = onTimeRate(priorInvoices)
      const is_improving = determineIsTrendImproving(recentRate, priorRate)

      return { ...score, is_improving }
    })

    // Sort by credit_score ascending (riskiest first)
    customerScores.sort((a, b) => a.credit_score - b.credit_score)

    const portfolio_summary = computeCreditPortfolioSummaryWithOutstanding(
      customerScores,
      outstandingByKey,
    )

    const HIGH_RISK_GRADES = new Set<CreditRiskGrade>(['BB', 'B', 'CCC', 'D'])
    const WATCH_LIST_THRESHOLD = 50_000

    return {
      portfolio_summary,
      customer_scores: customerScores,
      top_risk_customers: customerScores.slice(0, 5),
      recommended_watch_list: customerScores.filter(
        s =>
          HIGH_RISK_GRADES.has(s.credit_grade) &&
          (outstandingByKey.get(s.customer_key) ?? 0) > WATCH_LIST_THRESHOLD,
      ),
    }
  }
}

// ── Empty report helper ────────────────────────────────────────────────────────

function buildEmptyReport(): CustomerCreditRiskReport {
  const portfolio_summary = computeCreditPortfolioSummary([])
  return {
    portfolio_summary,
    customer_scores: [],
    top_risk_customers: [],
    recommended_watch_list: [],
  }
}
