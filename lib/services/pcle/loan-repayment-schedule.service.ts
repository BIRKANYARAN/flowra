// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/loan-repayment-schedule.service.ts
//
// Loan Repayment Schedule Service
//
// Generates amortization schedules and payment projections for partner loans.
// Supports both standard annuity (fixed monthly) and bullet (single payment) loans.
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Internal helper ───────────────────────────────────────────────────────────

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.substring(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1 + months, d)
  const yr = dt.getFullYear()
  const mo = dt.getMonth()
  const daysInMo = new Date(yr, mo + 1, 0).getDate()
  const clampedDay = Math.min(d, daysInMo)
  const outDt = new Date(yr, mo, clampedDay)
  return outDt.toISOString().substring(0, 10)
}

function r2(v: number): number {
  return Math.round(v * 100) / 100
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface AmortizationRow {
  period_number: number
  payment_date: string          // YYYY-MM-DD
  beginning_balance: number
  scheduled_payment: number
  interest_component: number
  principal_component: number
  ending_balance: number
  is_overdue: boolean           // payment_date < today AND ending_balance > 0 after payment
}

export interface TrancheSchedule {
  tranche_id: string
  partner_id: string
  partner_name: string
  principal_try: number
  outstanding_try: number
  annual_rate_pct: number
  disbursement_date: string     // YYYY-MM-DD
  expected_repayment_date: string | null
  amortization: AmortizationRow[]
  total_interest_try: number
  total_payments_try: number
  months_remaining: number | null   // null if no repayment date
  is_bullet: boolean                // true if single balloon payment
}

export interface LoanRepaymentScheduleReport {
  as_of_date: string
  tranche_schedules: TrancheSchedule[]
  portfolio_summary: {
    total_outstanding_try: number
    total_interest_to_maturity_try: number
    total_monthly_service: number
    tranches_with_repayment_date: number
    tranches_without_date: number
    overdue_tranches: number
    weighted_avg_months_remaining: number | null
  }
  dscr: number | null
  dscr_health: ReturnType<typeof classifyDscr>
  payments_next_30_days: { count: number; total_try: number }
  payments_next_90_days: { count: number; total_try: number }
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Convert annual rate percent to monthly rate fraction.
 * e.g. 12 → 0.01
 */
export function computeMonthlyRate(annualRatePct: number): number {
  return annualRatePct / 100 / 12
}

/**
 * Standard annuity monthly payment formula.
 * Returns principal / termMonths for zero-rate loans.
 * Returns 0 if termMonths === 0.
 */
export function computeMonthlyPayment(
  principal: number,
  monthlyRate: number,
  termMonths: number,
): number {
  if (termMonths === 0) return 0
  if (monthlyRate === 0) return r2(principal / termMonths)
  const payment = (principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1)
  return r2(payment)
}

/**
 * Build full amortization schedule for an annuity loan.
 */
export function buildAmortizationSchedule(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  startDate: string,    // first payment date
  asOfDate: string,     // for is_overdue
): AmortizationRow[] {
  if (termMonths <= 0 || principal <= 0) return []

  const monthlyRate = computeMonthlyRate(annualRatePct)
  const fixedPayment = computeMonthlyPayment(principal, monthlyRate, termMonths)
  const rows: AmortizationRow[] = []
  let balance = principal

  for (let i = 1; i <= termMonths; i++) {
    if (balance <= 0.005) break

    const paymentDate = addMonths(startDate, i - 1)
    const beginningBalance = r2(balance)
    const interestComponent = r2(beginningBalance * monthlyRate)

    let scheduledPayment: number
    let principalComponent: number

    if (i === termMonths) {
      // Last row: close out remaining balance exactly
      principalComponent = beginningBalance
      scheduledPayment = r2(principalComponent + interestComponent)
    } else {
      scheduledPayment = fixedPayment
      principalComponent = r2(Math.max(0, scheduledPayment - interestComponent))
    }

    const endingBalance = r2(Math.max(0, beginningBalance - principalComponent))
    const isOverdue = paymentDate < asOfDate && endingBalance > 0

    rows.push({
      period_number: i,
      payment_date: paymentDate,
      beginning_balance: beginningBalance,
      scheduled_payment: scheduledPayment,
      interest_component: interestComponent,
      principal_component: principalComponent,
      ending_balance: endingBalance,
      is_overdue: isOverdue,
    })

    balance = endingBalance
  }

  return rows
}

/**
 * Build a single-row bullet payment schedule.
 */
export function buildBulletSchedule(
  outstanding: number,
  annualRatePct: number,
  repaymentDate: string,
  asOfDate: string,
): AmortizationRow[] {
  const monthlyRate = computeMonthlyRate(annualRatePct)
  const asOf = new Date(asOfDate)
  const repay = new Date(repaymentDate)
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44
  const monthsUntilRepayment = Math.max(0, (repay.getTime() - asOf.getTime()) / msPerMonth)

  const interestComponent = r2(outstanding * monthlyRate * monthsUntilRepayment)
  const scheduledPayment = r2(outstanding + interestComponent)
  const isOverdue = repaymentDate < asOfDate && outstanding > 0

  return [
    {
      period_number: 1,
      payment_date: repaymentDate,
      beginning_balance: r2(outstanding),
      scheduled_payment: scheduledPayment,
      interest_component: interestComponent,
      principal_component: r2(outstanding),
      ending_balance: 0,
      is_overdue: isOverdue,
    },
  ]
}

/**
 * Months between asOfDate and repaymentDate.
 * Positive = future, 0 if past. null if repaymentDate is null.
 */
export function computeMonthsRemaining(
  repaymentDate: string | null,
  asOfDate: string,
): number | null {
  if (repaymentDate === null) return null
  const asOf = new Date(asOfDate)
  const repay = new Date(repaymentDate)
  const diffMs = repay.getTime() - asOf.getTime()
  if (diffMs <= 0) return 0
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44)
  return Math.ceil(diffMonths)
}

/**
 * Sum interest across all schedule rows.
 */
export function computeTotalInterest(schedule: AmortizationRow[]): number {
  return r2(schedule.reduce((sum, row) => sum + row.interest_component, 0))
}

/**
 * Sum scheduled payments across all schedule rows.
 */
export function computeTotalPayments(schedule: AmortizationRow[]): number {
  return r2(schedule.reduce((sum, row) => sum + row.scheduled_payment, 0))
}

/**
 * Payments due on or before untilDate.
 */
export function computePaymentsUntilDate(
  schedule: AmortizationRow[],
  untilDate: string,
): { count: number; total_try: number; interest_try: number; principal_try: number } {
  const filtered = schedule.filter(row => row.payment_date <= untilDate)
  return {
    count: filtered.length,
    total_try: r2(filtered.reduce((s, row) => s + row.scheduled_payment, 0)),
    interest_try: r2(filtered.reduce((s, row) => s + row.interest_component, 0)),
    principal_try: r2(filtered.reduce((s, row) => s + row.principal_component, 0)),
  }
}

/**
 * Overdue rows (is_overdue === true).
 */
export function computeOverduePayments(schedule: AmortizationRow[]): {
  count: number
  total_overdue_try: number
} {
  const overdue = schedule.filter(row => row.is_overdue)
  return {
    count: overdue.length,
    total_overdue_try: r2(overdue.reduce((s, row) => s + row.scheduled_payment, 0)),
  }
}

/**
 * Classify repayment risk level.
 * Priority: no_risk → critical → high → moderate → low
 */
export function classifyRepaymentRisk(
  monthsRemaining: number | null,
  outstandingTry: number,
  annualRatePct: number,    // kept for signature completeness
  overdueCount: number,
): 'no_risk' | 'low' | 'moderate' | 'high' | 'critical' {
  void annualRatePct
  if (outstandingTry === 0) return 'no_risk'
  if (overdueCount > 0) return 'critical'
  if (monthsRemaining !== null && monthsRemaining <= 3) return 'high'
  if (monthsRemaining !== null && monthsRemaining <= 12) return 'moderate'
  return 'low'
}

/**
 * Debt service coverage ratio: ebitdaMonthly / monthlyDebtService.
 * null if monthlyDebtService === 0.
 */
export function computeDebtServiceCoverageRatio(
  ebitdaMonthly: number,
  monthlyDebtService: number,
): number | null {
  if (monthlyDebtService === 0) return null
  return r2(ebitdaMonthly / monthlyDebtService)
}

/**
 * Classify DSCR into health tier.
 */
export function classifyDscr(
  dscr: number | null,
): 'strong' | 'adequate' | 'tight' | 'critical' | 'no_debt' {
  if (dscr === null) return 'no_debt'
  if (dscr >= 2.0) return 'strong'
  if (dscr >= 1.5) return 'adequate'
  if (dscr >= 1.0) return 'tight'
  return 'critical'
}

/**
 * Effective interest cost as a % of principal.
 * null if principal === 0.
 */
export function computeEffectiveInterestCost(
  totalInterest: number,
  principal: number,
): number | null {
  if (principal === 0) return null
  return r2((totalInterest / principal) * 100)
}

/**
 * Turkish narrative for a partner's loan situation.
 */
export function generateScheduleNarrative(
  partnerName: string,
  outstandingTry: number,
  monthsRemaining: number | null,
  repaymentRisk: ReturnType<typeof classifyRepaymentRisk>,
): string {
  if (repaymentRisk === 'no_risk') {
    return `${partnerName} ortağının aktif kredisi bulunmuyor.`
  }
  if (repaymentRisk === 'critical') {
    return `KRİTİK: ${partnerName} ortağının vadesi geçmiş ödemesi var.`
  }
  const amountStr = `₺${outstandingTry.toLocaleString('tr-TR')} TL`
  if (repaymentRisk === 'high' || repaymentRisk === 'moderate') {
    const n = monthsRemaining ?? 0
    return `${partnerName} ortağının ${amountStr} kredisi ${n} ay içinde vadesi doluyor.`
  }
  // low
  return `${partnerName} ortağının kredisi uzun vadeli seyrediyor.`
}

// ── Service class ─────────────────────────────────────────────────────────────

export class LoanRepaymentScheduleService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getSchedule(
    companyId: string,
    monthlyEbitda?: number,
  ): Promise<LoanRepaymentScheduleReport> {
    const today = new Date().toISOString().substring(0, 10)

    // 1. Fetch active tranches
    const { data: trancheRows, error: trancheError } = await this.supabase
      .from('partner_loan_tranches')
      .select(`
        id,
        partner_id,
        principal_try,
        outstanding_try,
        disbursement_date,
        expected_repayment_date,
        interest_rate_annual_pct,
        annual_interest_rate,
        status
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (trancheError) {
      throw new Error(`Tranche verisi alınamadı: ${trancheError.message}`)
    }

    // 2. Fetch partners for names
    const partnerIds = [...new Set((trancheRows ?? []).map((r: any) => r.partner_id as string))]
    const partnerMap: Record<string, string> = {}

    if (partnerIds.length > 0) {
      const { data: partnerRows } = await this.supabase
        .from('partners')
        .select('id, name')
        .in('id', partnerIds)
        .eq('company_id', companyId)
        .is('deleted_at', null)

      for (const p of (partnerRows ?? [])) {
        const pr = p as { id: string; name: string }
        partnerMap[pr.id] = pr.name
      }
    }

    // 3. Optionally compute monthly EBITDA from last 3 months of sales/expenses
    let resolvedEbitda = monthlyEbitda

    if (resolvedEbitda === undefined) {
      try {
        const threeMonthsAgo = new Date(today)
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
        const fromDate = threeMonthsAgo.toISOString().substring(0, 10)

        const [{ data: salesData }, { data: expData }] = await Promise.all([
          this.supabase
            .from('sales')
            .select('amount_try')
            .eq('company_id', companyId)
            .gte('sale_date', fromDate)
            .is('deleted_at', null),
          this.supabase
            .from('expenses')
            .select('amount_try')
            .eq('company_id', companyId)
            .gte('expense_date', fromDate)
            .is('deleted_at', null),
        ])

        const totalSales = (salesData ?? []).reduce((s: number, r: any) => s + (Number(r.amount_try) || 0), 0)
        const totalExp = (expData ?? []).reduce((s: number, r: any) => s + (Number(r.amount_try) || 0), 0)
        resolvedEbitda = r2((totalSales - totalExp) / 3)
      } catch {
        resolvedEbitda = 0
      }
    }

    // 4. Build per-tranche schedules
    const trancheSchedules: TrancheSchedule[] = []

    for (const raw of (trancheRows ?? [])) {
      const r = raw as Record<string, unknown>
      const trancheId = r.id as string
      const partnerId = r.partner_id as string
      const partnerName = partnerMap[partnerId] ?? 'Ortak'

      const principal = Number(r.principal_try) || 0
      if (principal <= 0) continue

      const disbRaw = r.disbursement_date as string | null
      if (!disbRaw) continue
      const disbursementDate = disbRaw.substring(0, 10)

      // Resolve interest rate (prefer _pct column, fall back to annual_interest_rate)
      let annualRatePct: number
      if (r.interest_rate_annual_pct != null && !isNaN(Number(r.interest_rate_annual_pct))) {
        annualRatePct = Number(r.interest_rate_annual_pct)
      } else if (r.annual_interest_rate != null && !isNaN(Number(r.annual_interest_rate))) {
        const raw2 = Number(r.annual_interest_rate)
        annualRatePct = raw2 <= 1 ? raw2 * 100 : raw2
      } else {
        annualRatePct = 0
      }

      const outstandingRaw = r.outstanding_try != null ? Number(r.outstanding_try) : principal
      const outstandingTry = isNaN(outstandingRaw) ? principal : outstandingRaw

      const repayRaw = r.expected_repayment_date as string | null
      const expectedRepaymentDate = repayRaw ? repayRaw.substring(0, 10) : null

      const monthsRemaining = computeMonthsRemaining(expectedRepaymentDate, today)

      let amortization: AmortizationRow[]
      let isBullet = false

      if (expectedRepaymentDate) {
        // Compute term from disbursement → repayment
        const disbDate = new Date(disbursementDate)
        const repayDate = new Date(expectedRepaymentDate)
        const termMonths = Math.max(
          1,
          Math.ceil((repayDate.getTime() - disbDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)),
        )

        if (termMonths === 1) {
          isBullet = true
          amortization = buildBulletSchedule(outstandingTry, annualRatePct, expectedRepaymentDate, today)
        } else {
          amortization = buildAmortizationSchedule(
            outstandingTry,
            annualRatePct,
            termMonths,
            disbursementDate,
            today,
          )
        }
      } else {
        // No repayment date → treat as bullet (indefinite)
        isBullet = true
        amortization = []
      }

      const totalInterestTry = computeTotalInterest(amortization)
      const totalPaymentsTry = computeTotalPayments(amortization)

      trancheSchedules.push({
        tranche_id: trancheId,
        partner_id: partnerId,
        partner_name: partnerName,
        principal_try: principal,
        outstanding_try: outstandingTry,
        annual_rate_pct: annualRatePct,
        disbursement_date: disbursementDate,
        expected_repayment_date: expectedRepaymentDate,
        amortization,
        total_interest_try: totalInterestTry,
        total_payments_try: totalPaymentsTry,
        months_remaining: monthsRemaining,
        is_bullet: isBullet,
      })
    }

    // 5. Portfolio summary
    const totalOutstanding = r2(trancheSchedules.reduce((s, t) => s + t.outstanding_try, 0))
    const totalInterestToMaturity = r2(trancheSchedules.reduce((s, t) => s + t.total_interest_try, 0))

    // Monthly debt service = sum of monthly payments for amortizing tranches
    const totalMonthlyService = r2(
      trancheSchedules.reduce((s, t) => {
        if (t.amortization.length > 0 && !t.is_bullet) {
          return s + (t.amortization[0]?.scheduled_payment ?? 0)
        }
        return s
      }, 0),
    )

    const tranchesWithDate = trancheSchedules.filter(t => t.expected_repayment_date !== null).length
    const tranchesWithoutDate = trancheSchedules.filter(t => t.expected_repayment_date === null).length

    const overdueTranches = trancheSchedules.filter(t =>
      computeOverduePayments(t.amortization).count > 0,
    ).length

    // Weighted average months remaining
    const withDate = trancheSchedules.filter(t => t.months_remaining !== null)
    let weightedAvgMonthsRemaining: number | null = null
    if (withDate.length > 0) {
      const weightedSum = withDate.reduce((s, t) => s + (t.months_remaining! * t.outstanding_try), 0)
      const totalWeight = withDate.reduce((s, t) => s + t.outstanding_try, 0)
      weightedAvgMonthsRemaining = totalWeight > 0 ? r2(weightedSum / totalWeight) : null
    }

    // 6. DSCR
    const dscr = computeDebtServiceCoverageRatio(resolvedEbitda ?? 0, totalMonthlyService)
    const dscrHealth = classifyDscr(dscr)

    // 7. Upcoming payments
    const allRows = trancheSchedules.flatMap(t => t.amortization)
    const date30 = addMonths(today, 1)
    const date90 = addMonths(today, 3)

    const next30 = computePaymentsUntilDate(allRows, date30)
    const next90 = computePaymentsUntilDate(allRows, date90)

    return {
      as_of_date: today,
      tranche_schedules: trancheSchedules,
      portfolio_summary: {
        total_outstanding_try: totalOutstanding,
        total_interest_to_maturity_try: totalInterestToMaturity,
        total_monthly_service: totalMonthlyService,
        tranches_with_repayment_date: tranchesWithDate,
        tranches_without_date: tranchesWithoutDate,
        overdue_tranches: overdueTranches,
        weighted_avg_months_remaining: weightedAvgMonthsRemaining,
      },
      dscr,
      dscr_health: dscrHealth,
      payments_next_30_days: { count: next30.count, total_try: next30.total_try },
      payments_next_90_days: { count: next90.count, total_try: next90.total_try },
    }
  }
}
